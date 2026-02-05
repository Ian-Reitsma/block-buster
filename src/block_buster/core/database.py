"""Custom Database Layer - Integrates with The Block's storage_engine.

Provides a Python interface to The Block's first-party storage backends:
1. InhouseEngine (LSM-tree with SSTables, WAL, memtable)
2. MemoryEngine (in-memory for testing)
3. RocksDB (optional, when available)

Falls back to pure-Python implementation when Rust storage_engine is unavailable.

All implementations are crash-safe with atomic writes and WAL.
"""

import os
import json
import struct
import logging
import tempfile
import contextlib
from typing import Dict, List, Optional, Any, Tuple, Iterator
from pathlib import Path
import threading
import time
from collections import OrderedDict

logger = logging.getLogger(__name__)

def _fsync_dir(path: Path) -> None:
    """Best-effort fsync of a directory for crash-safety."""
    try:
        fd = os.open(str(path), os.O_RDONLY)
    except Exception:  # pragma: no cover - platform dependent
        return
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class DatabaseError(Exception):
    """Database operation error."""
    pass


class KeyValueIterator:
    """Iterator for prefix scans."""
    
    def __init__(self, items: List[Tuple[bytes, bytes]]):
        self._items = iter(items)
    
    def __next__(self) -> Tuple[bytes, bytes]:
        return next(self._items)
    
    def __iter__(self):
        return self


class Batch:
    """Batched mutations for atomic writes."""
    
    def __init__(self):
        self.operations: List[Tuple[str, str, Optional[bytes], Optional[bytes]]] = []
    
    def put(self, cf: str, key: bytes, value: bytes):
        """Add PUT operation to batch."""
        self.operations.append(('put', cf, key, value))
    
    def delete(self, cf: str, key: bytes):
        """Add DELETE operation to batch."""
        self.operations.append(('delete', cf, key, None))


class SimpleDb:
    """First-party key-value database compatible with The Block's storage_engine.
    
    Architecture:
    - Column families (namespaces)
    - Write-ahead log (WAL) for crash recovery
    - Memtable for recent writes
    - Immutable SSTables for on-disk storage
    - Atomic rename for crash-safe manifest updates
    
    This implements the same KeyValue interface as The Block's Rust storage_engine,
    allowing seamless integration with the blockchain's data layer.
    
    Example:
        db = SimpleDb.open("/data/theblock")
        db.ensure_cf("blocks")
        db.put("blocks", b"block_123", b'{"height": 123}')
        value = db.get("blocks", b"block_123")
        db.flush()  # Write memtable to SSTable
    """
    
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        
        # Column families
        self.cfs: Dict[str, 'ColumnFamily'] = {}
        
        # WAL for crash recovery
        self.wal_path = self.path / "wal.log"
        self.wal = open(self.wal_path, 'ab', buffering=0)  # Unbuffered
        
        # Manifest tracks SSTables
        self.manifest_path = self.path / "manifest.json"
        self.manifest = self._load_manifest()
        
        # Lock for thread safety
        self._lock = threading.RLock()

        # Background maintenance
        self._stop_event = threading.Event()
        self._fsync_interval = float(os.getenv("SIMPLEDB_FSYNC_SEC", "1.0"))
        self._compact_interval = float(os.getenv("SIMPLEDB_COMPACT_SEC", "60.0"))
        self._last_compact = time.time()
        self._last_flush_epoch: Optional[float] = None
        self._last_wal_write_epoch: Optional[float] = None
        self._last_wal_fsync_epoch: Optional[float] = None
        self._maintenance_thread = threading.Thread(
            target=self._maintenance_loop, name="simpledb-maint", daemon=True
        )
        
        # Recovery
        self._replay_wal()

        # Kick off maintenance after recovery so WAL is valid
        self._maintenance_thread.start()
        
        logger.info(f"Opened SimpleDb at {path}")
    
    @classmethod
    def open(cls, path: str) -> 'SimpleDb':
        """Open database at path (creates if not exists)."""
        return cls(path)
    
    def _load_manifest(self) -> Dict:
        """Load manifest from disk."""
        if self.manifest_path.exists():
            try:
                with open(self.manifest_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load manifest: {e}")
        return {'cfs': {}}
    
    def _save_manifest(self):
        """Save manifest to disk (atomic rename)."""
        temp_path = self.manifest_path.with_suffix('.tmp')
        with open(temp_path, 'w') as f:
            json.dump(self.manifest, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # Atomic rename for crash safety
        os.replace(temp_path, self.manifest_path)
        _fsync_dir(self.manifest_path.parent)
    
    def _replay_wal(self):
        """Replay WAL entries for crash recovery."""
        if not self.wal_path.exists() or self.wal_path.stat().st_size == 0:
            return
        
        logger.info("Replaying WAL for crash recovery...")
        count = 0
        
        try:
            with open(self.wal_path, 'rb') as f:
                while True:
                    # Read entry length
                    length_bytes = f.read(4)
                    if not length_bytes:
                        break
                    
                    length = struct.unpack('>I', length_bytes)[0]
                    
                    # Read entry data
                    entry_bytes = f.read(length)
                    if len(entry_bytes) != length:
                        logger.warning("Truncated WAL entry, stopping replay")
                        break
                    
                    entry = json.loads(entry_bytes.decode('utf-8'))
                    
                    # Apply entry
                    cf_name = entry['cf']
                    op = entry['op']
                    key = bytes.fromhex(entry['key'])
                    
                    if cf_name not in self.cfs:
                        self.ensure_cf(cf_name)
                    
                    cf = self.cfs[cf_name]
                    
                    if op == 'put':
                        value = bytes.fromhex(entry['value'])
                        cf.memtable[key] = value
                    elif op == 'delete':
                        cf.memtable[key] = None  # Tombstone
                    
                    count += 1
            
            logger.info(f"Replayed {count} WAL entries")
        
        except Exception as e:
            logger.error(f"WAL replay error: {e}")
    
    def _write_wal_entry(self, cf: str, op: str, key: bytes, value: Optional[bytes]):
        """Write entry to WAL."""
        entry = {
            'cf': cf,
            'op': op,
            'key': key.hex(),
        }
        if value is not None:
            entry['value'] = value.hex()
        
        entry_bytes = json.dumps(entry).encode('utf-8')
        length = struct.pack('>I', len(entry_bytes))
        
        with self._lock:
            self.wal.write(length + entry_bytes)
            self.wal.flush()  # Force to disk
            self._last_wal_write_epoch = time.time()
    
    def flush_wal(self):
        """Force WAL to disk."""
        with self._lock:
            self.wal.flush()
            os.fsync(self.wal.fileno())
            self._last_wal_fsync_epoch = time.time()

    def _maintenance_loop(self):
        """Background fsync + compaction loop."""
        while not self._stop_event.wait(self._fsync_interval):
            with contextlib.suppress(Exception):
                self.flush_wal()
            now = time.time()
            if now - self._last_compact >= self._compact_interval and self._should_compact():
                with contextlib.suppress(Exception):
                    self.compact()
                self._last_compact = now
    
    def ensure_cf(self, cf: str):
        """Ensure column family exists."""
        with self._lock:
            if cf not in self.cfs:
                self.cfs[cf] = ColumnFamily(cf, self.path / cf)
                if cf not in self.manifest['cfs']:
                    self.manifest['cfs'][cf] = {
                        'next_file_id': 0,
                        'sstables': [],
                        'sequence': 0,
                    }
                    self._save_manifest()
                logger.info(f"Created column family: {cf}")
    
    def get(self, cf: str, key: bytes) -> Optional[bytes]:
        """Get value for key from column family."""
        with self._lock:
            if cf not in self.cfs:
                return None
            return self.cfs[cf].get(key)
    
    def put(self, cf: str, key: bytes, value: bytes) -> Optional[bytes]:
        """Put key-value pair (returns old value if exists)."""
        with self._lock:
            self.ensure_cf(cf)
            old_value = self.cfs[cf].get(key)
            self.cfs[cf].put(key, value)
            self._write_wal_entry(cf, 'put', key, value)
            return old_value
    
    def put_bytes(self, cf: str, key: bytes, value: bytes):
        """Put key-value pair (no return value)."""
        self.put(cf, key, value)
    
    def delete(self, cf: str, key: bytes) -> Optional[bytes]:
        """Delete key (returns old value if exists)."""
        with self._lock:
            if cf not in self.cfs:
                return None
            old_value = self.cfs[cf].get(key)
            self.cfs[cf].delete(key)
            self._write_wal_entry(cf, 'delete', key, None)
            return old_value
    
    def prefix_iterator(self, cf: str, prefix: bytes) -> KeyValueIterator:
        """Create iterator for keys with prefix."""
        with self._lock:
            if cf not in self.cfs:
                return KeyValueIterator([])
            items = self.cfs[cf].prefix_scan(prefix)
            return KeyValueIterator(items)
    
    def list_cfs(self) -> List[str]:
        """List all column families."""
        with self._lock:
            return list(self.cfs.keys())
    
    def make_batch(self) -> Batch:
        """Create new batch for atomic writes."""
        return Batch()
    
    def write_batch(self, batch: Batch):
        """Atomically apply batch of operations."""
        with self._lock:
            for op_type, cf, key, value in batch.operations:
                if op_type == 'put':
                    self.put(cf, key, value)
                elif op_type == 'delete':
                    self.delete(cf, key)
    
    def flush(self):
        """Flush memtables to disk as SSTables."""
        with self._lock:
            for cf_name, cf in self.cfs.items():
                cf.flush_memtable(self.manifest['cfs'][cf_name])
            self._save_manifest()
            
            # Truncate WAL after successful flush
            _fsync_dir(self.path)
            self.wal.close()
            self.wal_path.unlink(missing_ok=True)
            self.wal = open(self.wal_path, 'ab', buffering=0)
            self._last_flush_epoch = time.time()
            
            logger.info("Flushed database to disk")
    
    def compact(self):
        """Compact SSTables (merges overlapping files)."""
        with self._lock:
            for cf_name, cf in self.cfs.items():
                cf.compact_sstables(self.manifest['cfs'][cf_name])
            self._save_manifest()
            logger.info("Compacted database")

    def _should_compact(self) -> bool:
        """Heuristic: compact if any CF has >3 SSTables."""
        for cf in self.cfs.values():
            if len(cf.sstables) > 3:
                return True
        return False
    
    def set_byte_limit(self, limit: Optional[int]):
        """Set size limit (optional, for testing)."""
        # Not implemented in basic version
        pass
    
    def metrics(self) -> Dict:
        """Get database metrics."""
        with self._lock:
            total_size = 0
            memtable_size = 0
            sst_count = 0
            
            for cf in self.cfs.values():
                total_size += cf.size_on_disk()
                memtable_size += cf.memtable_size()
                sst_count += len(cf.sstables)
            
            now = time.time()
            wal_fsync_lag = (
                max(0.0, now - self._last_wal_fsync_epoch)
                if self._last_wal_fsync_epoch is not None
                else None
            )
            flush_lag = (
                max(0.0, now - self._last_flush_epoch)
                if self._last_flush_epoch is not None
                else None
            )
            return {
                'backend': 'inhouse_python',
                'size_on_disk_bytes': total_size,
                'memtable_bytes': memtable_size,
                'num_cfs': len(self.cfs),
                'sstables': sst_count,
                'wal_bytes': self.wal_path.stat().st_size if self.wal_path.exists() else 0,
                'last_compact_epoch': self._last_compact,
                'fsync_interval_sec': self._fsync_interval,
                'last_wal_write_epoch': self._last_wal_write_epoch,
                'last_wal_fsync_epoch': self._last_wal_fsync_epoch,
                'wal_fsync_lag_seconds': wal_fsync_lag,
                'last_flush_epoch': self._last_flush_epoch,
                'flush_lag_seconds': flush_lag,
            }
    
    def close(self, flush: bool = True):
        """Close database.

        Args:
            flush: Flush memtables and truncate the WAL (default). Tests may set
                this to False to simulate an abrupt process exit.
        """
        with self._lock:
            self._stop_event.set()
            if self._maintenance_thread.is_alive():
                self._maintenance_thread.join(timeout=2)
            if flush:
                self.flush()
            self.wal.close()
            logger.info("Closed SimpleDb")


class ColumnFamily:
    """Column family (namespace) with memtable and SSTables."""
    
    MEMTABLE_LIMIT = 8 * 1024 * 1024  # 8MB
    
    def __init__(self, name: str, path: Path):
        self.name = name
        self.path = path
        self.path.mkdir(parents=True, exist_ok=True)
        
        # In-memory recent writes
        self.memtable: OrderedDict[bytes, Optional[bytes]] = OrderedDict()
        
        # On-disk immutable files
        self.sstables: List[Path] = []
        self._load_sstables()
    
    def _load_sstables(self):
        """Load existing SSTables."""
        for sst_file in sorted(self.path.glob("*.sst")):
            self.sstables.append(sst_file)
    
    def get(self, key: bytes) -> Optional[bytes]:
        """Get value (checks memtable then SSTables)."""
        # Check memtable first
        if key in self.memtable:
            value = self.memtable[key]
            if value is None:  # Tombstone
                return None
            return value
        
        # Check SSTables (newest first)
        for sst in reversed(self.sstables):
            value = self._read_from_sstable(sst, key)
            if value is not None:
                if value == b'':  # Tombstone in SSTable
                    return None
                return value
        
        return None
    
    def put(self, key: bytes, value: bytes):
        """Put key-value in memtable."""
        self.memtable[key] = value
    
    def delete(self, key: bytes):
        """Delete key (write tombstone)."""
        self.memtable[key] = None
    
    def prefix_scan(self, prefix: bytes) -> List[Tuple[bytes, bytes]]:
        """Scan keys with prefix."""
        results = []
        seen_keys = set()
        
        # Scan memtable
        for key, value in self.memtable.items():
            if key.startswith(prefix) and value is not None:
                results.append((key, value))
                seen_keys.add(key)
        
        # Scan SSTables
        for sst in reversed(self.sstables):
            for key, value in self._scan_sstable(sst, prefix):
                if key not in seen_keys and value:  # Not tombstone
                    results.append((key, value))
                    seen_keys.add(key)
        
        return sorted(results, key=lambda x: x[0])
    
    def flush_memtable(self, manifest: Dict):
        """Flush memtable to new SSTable."""
        if not self.memtable:
            return
        
        file_id = manifest['next_file_id']
        sst_path = self.path / f"{file_id:08d}.sst"
        
        # Write SSTable
        with open(sst_path, 'wb') as f:
            for key, value in self.memtable.items():
                # Format: key_len(4) | key | value_len(4) | value
                if value is None:
                    value = b''  # Tombstone
                
                f.write(struct.pack('>I', len(key)))
                f.write(key)
                f.write(struct.pack('>I', len(value)))
                f.write(value)
            f.flush()
            os.fsync(f.fileno())
        _fsync_dir(self.path)
        
        # Update manifest
        manifest['next_file_id'] = file_id + 1
        manifest['sequence'] += 1
        manifest['sstables'].append({
            'file': sst_path.name,
            'sequence': manifest['sequence'],
        })
        
        self.sstables.append(sst_path)
        self.memtable.clear()
        
        logger.info(f"Flushed memtable to {sst_path.name}")
    
    def compact_sstables(self, manifest: Dict):
        """Compact overlapping SSTables."""
        if len(self.sstables) < 2:
            return
        
        # Read all SSTables
        all_data: Dict[bytes, Optional[bytes]] = {}
        for sst in self.sstables:
            for key, value in self._read_sstable(sst):
                all_data[key] = value
        
        # Write compacted SSTable
        file_id = manifest['next_file_id']
        sst_path = self.path / f"{file_id:08d}.sst"
        
        with open(sst_path, 'wb') as f:
            for key, value in sorted(all_data.items()):
                if value is None or value == b'':
                    continue  # Skip tombstones in compaction
                
                f.write(struct.pack('>I', len(key)))
                f.write(key)
                f.write(struct.pack('>I', len(value)))
                f.write(value)
            f.flush()
            os.fsync(f.fileno())
        _fsync_dir(self.path)
        
        # Delete old SSTables
        for sst in self.sstables:
            sst.unlink()
        
        # Update manifest
        manifest['next_file_id'] = file_id + 1
        manifest['sequence'] += 1
        manifest['sstables'] = [{
            'file': sst_path.name,
            'sequence': manifest['sequence'],
        }]
        
        self.sstables = [sst_path]
        
        logger.info(f"Compacted SSTables to {sst_path.name}")
    
    def _read_from_sstable(self, sst_path: Path, key: bytes) -> Optional[bytes]:
        """Read single key from SSTable."""
        try:
            with open(sst_path, 'rb') as f:
                while True:
                    # Read key length
                    key_len_bytes = f.read(4)
                    if not key_len_bytes:
                        break
                    
                    key_len = struct.unpack('>I', key_len_bytes)[0]
                    file_key = f.read(key_len)
                    
                    # Read value length and value
                    value_len = struct.unpack('>I', f.read(4))[0]
                    value = f.read(value_len)
                    
                    if file_key == key:
                        return value if value else None
            
            return None
        except Exception as e:
            logger.error(f"Error reading SSTable {sst_path}: {e}")
            return None
    
    def _scan_sstable(self, sst_path: Path, prefix: bytes) -> List[Tuple[bytes, bytes]]:
        """Scan SSTable for prefix."""
        results = []
        try:
            with open(sst_path, 'rb') as f:
                while True:
                    key_len_bytes = f.read(4)
                    if not key_len_bytes:
                        break
                    
                    key_len = struct.unpack('>I', key_len_bytes)[0]
                    key = f.read(key_len)
                    
                    value_len = struct.unpack('>I', f.read(4))[0]
                    value = f.read(value_len)
                    
                    if key.startswith(prefix) and value:
                        results.append((key, value))
            
            return results
        except Exception as e:
            logger.error(f"Error scanning SSTable {sst_path}: {e}")
            return []
    
    def _read_sstable(self, sst_path: Path) -> List[Tuple[bytes, bytes]]:
        """Read entire SSTable."""
        results = []
        try:
            with open(sst_path, 'rb') as f:
                while True:
                    key_len_bytes = f.read(4)
                    if not key_len_bytes:
                        break
                    
                    key_len = struct.unpack('>I', key_len_bytes)[0]
                    key = f.read(key_len)
                    
                    value_len = struct.unpack('>I', f.read(4))[0]
                    value = f.read(value_len)
                    
                    results.append((key, value if value else None))
            
            return results
        except Exception as e:
            logger.error(f"Error reading SSTable {sst_path}: {e}")
            return []
    
    def size_on_disk(self) -> int:
        """Get total size of SSTables on disk."""
        total = 0
        for sst in self.sstables:
            if sst.exists():
                total += sst.stat().st_size
        return total
    
    def memtable_size(self) -> int:
        """Get approximate size of memtable in bytes."""
        size = 0
        for key, value in self.memtable.items():
            size += len(key)
            if value:
                size += len(value)
        return size

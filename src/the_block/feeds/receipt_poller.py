"""Background receipt polling service.

Polls receipt.audit RPC endpoint continuously, maintains checkpoint,
and delivers new receipts to registered callbacks.

This is the critical infrastructure for the "receipts are ground truth" invariant.
All accounting, P&L tracking, and market activity must derive from receipts.
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Callable, List, Optional
from datetime import datetime
from collections import deque

from ..namespaces.receipt import ReceiptNamespace
from ..models.receipts import ReceiptAuditItem
from .event_stream import ReceiptEvent

logger = logging.getLogger(__name__)


class ReceiptPoller:
    """Background task that polls receipt.audit and persists checkpoint.
    
    Features:
    - Continuous polling with configurable interval
    - Checkpoint persistence to avoid reprocessing
    - Automatic pagination handling
    - Graceful error handling with backoff
    - Multiple callback support
    - Metrics tracking (receipts processed, errors, etc.)
    """
    
    def __init__(
        self,
        receipt_ns: ReceiptNamespace,
        checkpoint_path: Path,
        poll_interval: float = 5.0,
        batch_size: int = 512,
    ):
        """Initialize receipt poller.
        
        Args:
            receipt_ns: ReceiptNamespace instance for RPC calls
            checkpoint_path: Path to checkpoint file (JSON)
            poll_interval: Seconds between polls (default: 5.0)
            batch_size: Max receipts per RPC call (default: 512)
        """
        self.receipt_ns = receipt_ns
        self.checkpoint_path = checkpoint_path
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        
        self.running = False
        self.callbacks: List[Callable[[List[ReceiptEvent]], None]] = []
        
        # Metrics
        self.receipts_processed = 0
        self.poll_cycles = 0
        self.errors = 0
        self._error_times = deque(maxlen=2048)
        self.last_error_time: Optional[datetime] = None
        self.last_poll_time: Optional[datetime] = None
        self.last_receipt_height = 0
        
        # Ensure checkpoint directory exists
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    
    def register_callback(self, callback: Callable[[List[ReceiptEvent]], None]):
        """Register a callback to receive new receipts.
        
        Args:
            callback: Function that accepts List[ReceiptEvent]
        """
        self.callbacks.append(callback)
        logger.info(f"Registered receipt callback: {callback.__name__}")
    
    def load_checkpoint(self) -> int:
        """Load last processed block height from checkpoint file.
        
        Returns:
            Last processed block height, or 0 if no checkpoint exists
        """
        if self.checkpoint_path.exists():
            try:
                data = json.loads(self.checkpoint_path.read_text())
                height = data.get("last_height", 0)
                logger.info(f"Loaded checkpoint: last_height={height}")
                return height
            except Exception as e:
                logger.error(f"Failed to load checkpoint: {e}")
                return 0
        return 0
    
    def save_checkpoint(self, height: int):
        """Persist checkpoint to disk.
        
        Args:
            height: Block height to save as checkpoint
        """
        try:
            checkpoint_data = {
                "last_height": height,
                "timestamp": datetime.utcnow().isoformat(),
                "receipts_processed": self.receipts_processed,
                "poll_cycles": self.poll_cycles,
            }
            self.checkpoint_path.write_text(json.dumps(checkpoint_data, indent=2))
            self.last_receipt_height = height
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}", exc_info=True)
    
    def _deliver_receipts(self, events: List[ReceiptEvent]):
        """Deliver receipt events to all registered callbacks.
        
        Args:
            events: List of ReceiptEvent instances
        """
        for callback in self.callbacks:
            try:
                callback(events)
            except Exception as e:
                logger.error(
                    f"Callback {callback.__name__} failed: {e}",
                    exc_info=True
                )
    
    async def poll_loop(self):
        """Main polling loop.
        
        Continuously polls receipt.audit, handles pagination,
        delivers events to callbacks, and persists checkpoints.
        """
        self.running = True
        last_height = self.load_checkpoint()
        
        logger.info(
            f"Starting receipt poller from height {last_height} "
            f"(interval={self.poll_interval}s, batch={self.batch_size})"
        )
        
        while self.running:
            self.poll_cycles += 1
            self.last_poll_time = datetime.utcnow()
            
            try:
                # Fetch new receipts
                result = self.receipt_ns.audit(
                    start_height=last_height + 1,
                    limit=self.batch_size
                )
                
                if result.receipts:
                    # Convert to events
                    events = [
                        ReceiptEvent.from_audit_item(item)
                        for item in result.receipts
                    ]
                    
                    # Deliver to callbacks
                    self._deliver_receipts(events)
                    
                    # Update metrics
                    self.receipts_processed += len(result.receipts)
                    
                    # Update checkpoint
                    max_height = max(r.block_height for r in result.receipts)
                    self.save_checkpoint(max_height)
                    last_height = max_height
                    
                    logger.info(
                        f"Processed {len(result.receipts)} receipts up to height {max_height} "
                        f"(total: {self.receipts_processed}, cycles: {self.poll_cycles})"
                    )
                
                # If truncated, immediately fetch next page (no sleep)
                if result.truncated:
                    logger.debug("Result truncated, fetching next page immediately")
                    continue
                
                # Otherwise wait before next poll
                await asyncio.sleep(self.poll_interval)
                
            except Exception as e:
                self.errors += 1
                self.last_error_time = datetime.utcnow()
                self._error_times.append(time.time())
                logger.error(
                    f"Receipt poll error (cycle {self.poll_cycles}, errors: {self.errors}): {e}",
                    exc_info=True
                )
                # Backoff on error (2x normal interval)
                await asyncio.sleep(self.poll_interval * 2)
        
        logger.info("Receipt poller stopped")
    
    def stop(self):
        """Stop polling loop gracefully."""
        logger.info("Stopping receipt poller...")
        self.running = False
    
    def get_metrics(self) -> dict:
        """Get current polling metrics.
        
        Returns:
            Dict with metrics: receipts_processed, poll_cycles, errors, etc.
        """
        now = time.time()
        last_60s = sum(1 for ts in self._error_times if (now - ts) <= 60.0)
        last_5m = sum(1 for ts in self._error_times if (now - ts) <= 300.0)
        return {
            "receipts_processed": self.receipts_processed,
            "poll_cycles": self.poll_cycles,
            "errors": self.errors,
            "errors_last_60s": last_60s,
            "errors_last_5m": last_5m,
            "last_error_time": self.last_error_time.isoformat() if self.last_error_time else None,
            "last_poll_time": self.last_poll_time.isoformat() if self.last_poll_time else None,
            "last_receipt_height": self.last_receipt_height,
            "running": self.running,
            "callbacks_registered": len(self.callbacks),
        }


class ReceiptPollerManager:
    """Manager for receipt poller lifecycle.
    
    Provides convenient start/stop interface and ensures cleanup.
    """
    
    def __init__(self, poller: ReceiptPoller):
        """Initialize manager.
        
        Args:
            poller: ReceiptPoller instance to manage
        """
        self.poller = poller
        self.task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the receipt poller."""
        if self.task is not None:
            logger.warning("Receipt poller already running")
            return
        
        self.task = asyncio.create_task(self.poller.poll_loop())
        logger.info("Receipt poller started")
    
    async def stop(self):
        """Stop the receipt poller and wait for completion."""
        if self.task is None:
            logger.warning("Receipt poller not running")
            return
        
        self.poller.stop()
        await self.task
        self.task = None
        logger.info("Receipt poller stopped and cleaned up")
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self.poller
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.stop()

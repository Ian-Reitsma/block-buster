"""High-level client for The Block.

Provides a unified interface to all RPC namespaces and services.
"""

import time

from .config import TheBlockConfig, load_config
from .rpc_client import RPCClient, RPCError
from .namespaces import (
    LedgerNamespace,
    ReceiptNamespace,
    GovernorNamespace,
    ConsensusNamespace,
    ComputeMarketNamespace,
    EnergyNamespace,
    StorageNamespace,
    AdMarketNamespace,
    PeerNamespace,
    SchedulerNamespace,
)


class TheBlockClient:
    """High-level client for The Block L1 blockchain.
    
    Provides typed access to all RPC namespaces and maintains a single
    connection to the node.
    
    Usage:
        # Use environment config
        client = TheBlockClient()
        
        # Query balance
        balance = client.ledger.get_balance("0x...")
        
        # Check governor gates
        status = client.governor.get_status()
        
        # Query receipts
        receipts = client.receipt.audit(start_height=1000, limit=100)
        
        # Get block height
        height = client.consensus.block_height()
    """
    
    def __init__(self, config: TheBlockConfig = None):
        """Initialize The Block client.
        
        Args:
            config: TheBlockConfig instance. If None, loads from environment.
        """
        self.config = config or load_config()
        self._rpc = RPCClient(self.config)
        
        # Initialize namespaces
        self.ledger = LedgerNamespace(self._rpc)
        self.receipt = ReceiptNamespace(self._rpc)
        self.governor = GovernorNamespace(self._rpc)
        self.consensus = ConsensusNamespace(self._rpc)
        self.compute_market = ComputeMarketNamespace(self._rpc)
        self.energy = EnergyNamespace(self._rpc)
        self.storage = StorageNamespace(self._rpc)
        self.ad_market = AdMarketNamespace(self._rpc)
        self.peer = PeerNamespace(self._rpc)
        self.scheduler = SchedulerNamespace(self._rpc)
    
    @property
    def rpc(self) -> RPCClient:
        """Access low-level RPC client (advanced use only)."""
        return self._rpc
    
    def health_check(self) -> bool:
        """Verify connection to The Block node.
        
        Returns:
            True if node is reachable and responding
        """
        try:
            self.consensus.block_height()
            return True
        except Exception:
            return False
    
    def get_node_info(self) -> dict:
        """Get basic node information.

        Returns:
            Dict with node status information
        """
        # Be resilient: always return block_height and gate info when possible, even if one
        # RPC (e.g., stats/finality) fails. This prevents dashboard startup from crashing.
        height = None
        finalized_height = None
        blocks_until_finality = None
        gates = {}
        last_error = None
        try:
            height = self.consensus.block_height()
        except Exception as e:  # pragma: no cover - defensive
            last_error = e
        try:
            finality = self.consensus.finality_status()
            finalized_height = finality.finalized_height
            blocks_until_finality = finality.blocks_until_finality
        except Exception as e:  # pragma: no cover - defensive
            last_error = e
        try:
            governor_status = self.governor.get_status()
            gates = {name: gate.state for name, gate in governor_status.gates.items()}
        except Exception as e:  # pragma: no cover - defensive
            last_error = e

        if height is not None:
            return {
                "connected": True,
                "chain_mode": self.config.chain_mode,
                "rpc_url": self.config.rpc_url,
                "block_height": height,
                "finalized_height": finalized_height if finalized_height is not None else height,
                "blocks_until_finality": blocks_until_finality if blocks_until_finality is not None else 0,
                "gates": gates,
            }

        # If we reach here, we couldn't reach the node.
        return {
            "connected": False,
            "error": str(locals().get("last_error", "unreachable")),
            "chain_mode": self.config.chain_mode,
            "rpc_url": self.config.rpc_url,
        }

    # Convenience helpers -------------------------------------------------

    def network_metrics(self) -> dict:
        """Derive network strength metrics from consensus + peer stats."""
        peers_stats_all = []
        overlay = {}
        height = None
        finalized_height = None
        finality_time = None
        tps = None
        avg_block_time = None

        try:
            overlay = self.peer.overlay_status() or {}
        except Exception:
            overlay = {}
        try:
            peers_stats_all = self.peer.stats_all(limit=128) or []
        except Exception:
            peers_stats_all = []

        try:
            height = self.consensus.block_height()
        except Exception:
            height = None

        try:
            finality = self.consensus.finality_status()
            finalized_height = getattr(finality, "finalized_height", None)
            finality_time = getattr(finality, "blocks_until_finality", None)
        except Exception:
            finality_time = None
            finalized_height = None

        try:
            stats = self.consensus.stats()
            tps = getattr(stats, "tps", None)
            avg_block_time = getattr(stats, "avg_block_time_ms", None)
        except Exception:
            tps = None
            avg_block_time = None

        peer_count = overlay.get("active_peers") or len(peers_stats_all)
        # Derive a soft latency signal from peer handshakes if present.
        avg_latency_ms = None
        try:
            latencies = [
                m.get("last_handshake_ms")
                for entry in peers_stats_all
                if isinstance(entry, dict)
                for m in [entry.get("metrics", {})]
                if isinstance(m.get("last_handshake_ms"), (int, float)) and m.get("last_handshake_ms") > 0
            ]
            if latencies:
                avg_latency_ms = sum(latencies) / len(latencies)
        except Exception:
            avg_latency_ms = None
        peer_score = min(peer_count / 50 * 30, 30) if peer_count is not None else 0
        tps_score = min((tps or 0) / 1000 * 40, 40)
        finality_score = 0
        if finality_time is not None:
            finality_score = max(30 - (finality_time / 10), 0)

        return {
            "network_strength": int(peer_score + tps_score + finality_score),
            "block_height": height,
            "finalized_height": finalized_height if finalized_height is not None else height,
            "finality_time": finality_time,
            "peer_count": peer_count,
            "tps": tps,
            "avg_block_time_ms": avg_block_time,
            "avg_latency_ms": avg_latency_ms,
            "timestamp": int(time.time()),
            "genesis_ready": height is not None and height > 0,
        }

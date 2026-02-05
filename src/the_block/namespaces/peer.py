"""Peer namespace RPC methods."""

from typing import Dict, Any

from ..rpc_client import RPCClient


class PeerNamespace:
    """Typed wrapper for peer.* RPC methods."""

    def __init__(self, client: RPCClient):
        self.client = client

    def list(self) -> Dict[str, Any]:
        """List connected peers (uses net.peer_stats_all for first-class data)."""
        return self.stats_all(limit=256)

    def stats(self) -> Dict[str, Any]:
        """Get aggregate peer statistics."""
        return self.client.call("net.peer_stats_all", {"offset": 0, "limit": 64})

    def overlay_status(self) -> Dict[str, Any]:
        """Overlay store status (active/persisted peers)."""
        return self.client.call("net.overlay_status")

    def stats_all(self, offset: int = 0, limit: int = 64) -> Dict[str, Any]:
        """Return peer metrics for all known peers."""
        return self.client.call("net.peer_stats_all", {"offset": offset, "limit": limit})

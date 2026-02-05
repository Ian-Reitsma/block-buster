"""Scheduler namespace RPC methods."""

from typing import Dict, Any

from ..rpc_client import RPCClient


class SchedulerNamespace:
    """Typed wrapper for scheduler.* RPC methods."""

    def __init__(self, client: RPCClient):
        self.client = client

    def stats(self) -> Dict[str, Any]:
        """Get scheduler queue and throughput statistics."""
        return self.client.call("scheduler.stats")

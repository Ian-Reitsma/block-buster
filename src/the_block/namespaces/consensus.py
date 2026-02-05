"""Consensus namespace RPC methods."""

from typing import Dict, Any
from ..rpc_client import RPCClient
from ..models.consensus import BlockInfo, FinalityInfo, Stats


class ConsensusNamespace:
    """Typed wrapper for consensus.* RPC methods."""
    
    def __init__(self, client: RPCClient):
        self.client = client
    
    def block_height(self) -> int:
        """Get current block height.
        
        Returns:
            Current block height as integer
        """
        result = self.client.call("consensus.block_height")
        return result["height"]
    
    def get_block_info(self, height: int) -> BlockInfo:
        """Get detailed block information.
        
        Args:
            height: Block height to query
            
        Returns:
            BlockInfo with block details
        """
        result = self.client.call("consensus.block_info", {"height": height})
        return BlockInfo(**result)
    
    def finality_status(self) -> FinalityInfo:
        """Get finality gadget status.
        
        Returns:
            FinalityInfo with finality details
        """
        result = self.client.call("consensus.finality_status")
        return FinalityInfo(**result)

    def stats(self) -> Stats:
        """Get consensus statistics such as TPS."""
        result = self.client.call("consensus.stats")
        return Stats(
            avg_block_time_ms=result.get("avg_block_time_ms", 0.0),
            tps=result.get("tps", 0.0),
        )

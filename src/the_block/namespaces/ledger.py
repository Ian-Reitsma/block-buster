"""Ledger namespace RPC methods."""

from typing import List, Optional
from ..rpc_client import RPCClient
from ..models.ledger import Balance, HistoryItem


class LedgerNamespace:
    """Typed wrapper for ledger.* RPC methods."""
    
    def __init__(self, client: RPCClient):
        self.client = client
    
    def get_balance(self, address: str) -> Balance:
        """Query account balance.
        
        Args:
            address: Account address to query
            
        Returns:
            Balance object with current balance and block height
        """
        result = self.client.call("balance", {"address": address})
        amount = result.get("amount") if isinstance(result, dict) else None
        if amount is None:
            amount = result.get("balance", 0) if isinstance(result, dict) else 0
        height = None
        if isinstance(result, dict):
            height = result.get("block_height")
        return Balance(address=address, balance=int(amount or 0), block_height=height)
    
    def get_history(
        self,
        address: str,
        start_height: Optional[int] = None,
        end_height: Optional[int] = None,
        limit: int = 100
    ) -> List[HistoryItem]:
        """Query transaction history.
        
        Args:
            address: Account address to query
            start_height: Starting block height (optional)
            end_height: Ending block height (optional)
            limit: Maximum number of items to return
            
        Returns:
            List of HistoryItem objects
        """
        params = {"address": address, "limit": limit}
        if start_height is not None:
            params["start_height"] = start_height
        if end_height is not None:
            params["end_height"] = end_height
        
        result = self.client.call("ledger.history", params)
        return [HistoryItem(**item) for item in result["items"]]

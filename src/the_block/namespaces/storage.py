"""Storage market RPC namespace.

Handles: file storage operations, contracts, repairs
Code: node/src/rpc/storage.rs
"""

from typing import Optional, Dict, Any
from ..rpc_client import RPCClient


class StorageNamespace:
    """Storage market RPC methods.
    
    Namespace: storage
    """
    
    def __init__(self, rpc: RPCClient):
        self._rpc = rpc
    
    def put(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Store a file.
        
        Args:
            request: Storage request with file_id, data_hash, duration_epochs
        
        Returns:
            Storage contract with contract_id
        """
        return self._rpc.call("storage.put", [request])
    
    def get(self, file_id: str) -> Dict[str, Any]:
        """Retrieve a file.
        
        Args:
            file_id: File identifier
        
        Returns:
            File data or retrieval information
        """
        return self._rpc.call("storage.get", [file_id])
    
    def contracts(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Query storage contracts.
        
        Args:
            filters: Optional filters (provider, file_id, active_only)
        
        Returns:
            List of storage contracts
        """
        return self._rpc.call("storage.contracts", [filters or {}])

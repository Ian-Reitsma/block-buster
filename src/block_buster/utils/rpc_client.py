"""Simple JSON-RPC client - Basic RPC wrapper for blockchain nodes.

Provides basic JSON-RPC 2.0 client using stdlib only.
No third-party dependencies - uses urllib and json.

For full Solana SDK features, use solana-py.
This module provides simple RPC calls for basic queries.
"""

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass


class RPCException(Exception):
    """RPC request failed."""
    pass


@dataclass
class RPCResponse:
    """RPC response data."""
    result: Any
    id: Union[int, str, None]
    jsonrpc: str = "2.0"
    
    @property
    def success(self) -> bool:
        """Check if request was successful."""
        return self.result is not None


class JSONRPCClient:
    """Simple JSON-RPC 2.0 client.
    
    Example:
        client = JSONRPCClient("http://localhost:8545")
        result = client.call("eth_blockNumber")
        print(f"Block: {result}")
    """
    
    def __init__(
        self,
        endpoint: str,
        timeout: float = 30.0,
        headers: Optional[Dict[str, str]] = None
    ):
        """Initialize RPC client.
        
        Args:
            endpoint: RPC endpoint URL
            timeout: Request timeout in seconds
            headers: Optional HTTP headers
        """
        self.endpoint = endpoint
        self.timeout = timeout
        self.headers = headers or {}
        self._request_id = 0
    
    def _next_id(self) -> int:
        """Get next request ID."""
        self._request_id += 1
        return self._request_id
    
    def call(
        self,
        method: str,
        params: Optional[Union[List, Dict]] = None,
        request_id: Optional[Union[int, str]] = None
    ) -> Any:
        """Make JSON-RPC call.
        
        Args:
            method: RPC method name
            params: Method parameters (list or dict)
            request_id: Request ID (auto-generated if None)
        
        Returns:
            Result from RPC response
        
        Raises:
            RPCException: If request fails or returns error
        """
        if request_id is None:
            request_id = self._next_id()
        
        # Build JSON-RPC 2.0 request
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or [],
            "id": request_id,
        }
        
        # Make HTTP request
        try:
            req = urllib.request.Request(
                self.endpoint,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    **self.headers,
                    'Content-Type': 'application/json',
                },
            )
            
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                data = json.loads(response.read().decode('utf-8'))
        
        except urllib.error.HTTPError as e:
            raise RPCException(f"HTTP {e.code}: {e.reason}")
        except urllib.error.URLError as e:
            raise RPCException(f"Connection error: {e.reason}")
        except json.JSONDecodeError as e:
            raise RPCException(f"Invalid JSON response: {e}")
        except Exception as e:
            raise RPCException(f"Request failed: {e}")
        
        # Check for JSON-RPC error
        if isinstance(data, dict) and "error" in data:
            error = data["error"]
            code = error.get("code", -1)
            message = error.get("message", "Unknown error")
            raise RPCException(f"RPC error {code}: {message}")
        
        return data.get("result")
    
    def batch_call(
        self,
        calls: List[tuple[str, Optional[Union[List, Dict]]]]
    ) -> List[Any]:
        """Make batch JSON-RPC calls.
        
        Args:
            calls: List of (method, params) tuples
        
        Returns:
            List of results (in same order as calls)
        
        Example:
            results = client.batch_call([
                ("eth_blockNumber", []),
                ("eth_getBalance", ["0x123...", "latest"]),
            ])
        """
        batch_payload = []
        for i, (method, params) in enumerate(calls):
            batch_payload.append({
                "jsonrpc": "2.0",
                "method": method,
                "params": params or [],
                "id": i,
            })
        
        try:
            req = urllib.request.Request(
                self.endpoint,
                data=json.dumps(batch_payload).encode('utf-8'),
                headers={
                    **self.headers,
                    'Content-Type': 'application/json',
                },
            )
            
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                responses = json.loads(response.read().decode('utf-8'))
        
        except Exception as e:
            raise RPCException(f"Batch request failed: {e}")
        
        # Sort responses by ID and extract results
        sorted_responses = sorted(responses, key=lambda r: r.get("id", 0))
        results = []
        for resp in sorted_responses:
            if "error" in resp:
                error = resp["error"]
                results.append(RPCException(f"RPC error: {error.get('message')}"))
            else:
                results.append(resp.get("result"))
        
        return results


class TheBlockRPCClient(JSONRPCClient):
    """RPC client for The Block blockchain.
    
    Convenience wrapper with The Block-specific methods.
    
    Example:
        client = TheBlockRPCClient("http://localhost:8545")
        block = client.get_block_number()
        balance = client.get_balance("0x123...")
    """
    
    def get_block_number(self) -> int:
        """Get current block number."""
        result = self.call("tb_blockNumber")
        return int(result, 16) if isinstance(result, str) else result
    
    def get_balance(self, address: str, block: str = "latest") -> int:
        """Get account balance.
        
        Args:
            address: Account address
            block: Block number or tag ("latest", "earliest", "pending")
        
        Returns:
            Balance in smallest unit
        """
        result = self.call("tb_getBalance", [address, block])
        return int(result, 16) if isinstance(result, str) else result
    
    def get_transaction_count(self, address: str, block: str = "latest") -> int:
        """Get account transaction count (nonce).
        
        Args:
            address: Account address
            block: Block number or tag
        
        Returns:
            Transaction count
        """
        result = self.call("tb_getTransactionCount", [address, block])
        return int(result, 16) if isinstance(result, str) else result
    
    def get_block(self, block_id: Union[int, str], full_transactions: bool = False) -> Dict:
        """Get block by number or hash.
        
        Args:
            block_id: Block number (int) or hash (str)
            full_transactions: Include full transaction objects
        
        Returns:
            Block data
        """
        if isinstance(block_id, int):
            block_id = hex(block_id)
        return self.call("tb_getBlockByNumber", [block_id, full_transactions])
    
    def get_transaction(self, tx_hash: str) -> Optional[Dict]:
        """Get transaction by hash.
        
        Args:
            tx_hash: Transaction hash
        
        Returns:
            Transaction data or None if not found
        """
        return self.call("tb_getTransactionByHash", [tx_hash])
    
    def send_raw_transaction(self, signed_tx: str) -> str:
        """Send signed transaction.
        
        Args:
            signed_tx: Signed transaction hex string
        
        Returns:
            Transaction hash
        """
        return self.call("tb_sendRawTransaction", [signed_tx])
    
    def call_contract(
        self,
        to: str,
         str,
        from_addr: Optional[str] = None,
        block: str = "latest"
    ) -> str:
        """Call contract method (read-only).
        
        Args:
            to: Contract address
             Call data (encoded method + params)
            from_addr: Sender address (optional)
            block: Block number or tag
        
        Returns:
            Return data hex string
        """
        call_data = {"to": to, "data": data}
        if from_addr:
            call_data["from"] = from_addr
        return self.call("tb_call", [call_data, block])
    
    def estimate_gas(
        self,
        to: str,
         str,
        from_addr: Optional[str] = None,
        value: Optional[int] = None
    ) -> int:
        """Estimate gas for transaction.
        
        Args:
            to: Recipient address
             Transaction data
            from_addr: Sender address
            value: Value to send
        
        Returns:
            Estimated gas amount
        """
        tx_data = {"to": to, "data": data}
        if from_addr:
            tx_data["from"] = from_addr
        if value is not None:
            tx_data["value"] = hex(value)
        
        result = self.call("tb_estimateGas", [tx_data])
        return int(result, 16) if isinstance(result, str) else result
    
    def get_logs(
        self,
        from_block: Optional[Union[int, str]] = None,
        to_block: Optional[Union[int, str]] = None,
        address: Optional[Union[str, List[str]]] = None,
        topics: Optional[List[Optional[str]]] = None
    ) -> List[Dict]:
        """Get event logs.
        
        Args:
            from_block: Start block (number or tag)
            to_block: End block (number or tag)
            address: Contract address(es) to filter
            topics: Event topics to filter
        
        Returns:
            List of log entries
        """
        filter_params = {}
        if from_block is not None:
            filter_params["fromBlock"] = hex(from_block) if isinstance(from_block, int) else from_block
        if to_block is not None:
            filter_params["toBlock"] = hex(to_block) if isinstance(to_block, int) else to_block
        if address is not None:
            filter_params["address"] = address
        if topics is not None:
            filter_params["topics"] = topics
        
        return self.call("tb_getLogs", [filter_params])


def create_client(endpoint: str, **kwargs) -> JSONRPCClient:
    """Create RPC client based on endpoint.
    
    Args:
        endpoint: RPC endpoint URL
        **kwargs: Additional client options
    
    Returns:
        Appropriate RPC client instance
    """
    # Auto-detect The Block endpoints
    if "theblock" in endpoint.lower() or ":8545" in endpoint:
        return TheBlockRPCClient(endpoint, **kwargs)
    
    return JSONRPCClient(endpoint, **kwargs)

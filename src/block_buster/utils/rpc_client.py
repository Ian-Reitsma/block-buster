"""Simple JSON-RPC client - Basic RPC wrapper for The Block blockchain.

Provides basic JSON-RPC 2.0 client using stdlib only.
No third-party dependencies - uses urllib and json.

For The Block RPC API documentation, see: ~/projects/the-block/docs/apis_and_tooling.md
This module provides methods matching The Block's actual RPC namespaces.
"""

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass


# The Block RPC Error Codes
RPC_ERROR_CODES = {
    "AUTH_MISSING": -33009,
    "RATE_LIMIT": -33010,
}


class RPCException(Exception):
    """RPC request failed."""
    
    def __init__(self, message: str, code: Optional[int] = None, data: Any = None):
        super().__init__(message)
        self.code = code
        self.data = data


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
        result = client.call("consensus.block_height")
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
            method: RPC method name (e.g., 'consensus.block_height')
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
            error_data = error.get("data")
            raise RPCException(f"RPC error {code}: {message}", code=code, data=error_data)
        
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
                ("consensus.block_height", []),
                ("ledger.balance", ["account_address"]),
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
                results.append(RPCException(f"RPC error: {error.get('message')}", 
                                          code=error.get('code'), 
                                          data=error.get('data')))
            else:
                results.append(resp.get("result"))
        
        return results


# Alias for compatibility
TheBlockRPCClient = JSONRPCClient

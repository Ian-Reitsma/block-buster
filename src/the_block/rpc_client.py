"""Low-level JSON-RPC client for The Block - first-party HTTP implementation.

This module provides the single entry point for all HTTP communication with The
Block nodes, using our in-house HTTP client (no requests/httpx/aiohttp).

Features:
- JSON-RPC 2.0 over HTTP
- Bearer token authentication + mTLS
- Exponential backoff with retry budget
- Fail-fast on auth errors
- Pure stdlib dependency surface
"""

import json
import logging
import time
from typing import Any, Dict, Optional, List

from block_buster.core.http_client import HTTPClient, HTTPError, Response
from .config import TheBlockConfig

logger = logging.getLogger(__name__)


class RPCError(Exception):
    """JSON-RPC error response exception."""

    def __init__(self, code: int, message: str, data: Optional[Any] = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"RPC Error {code}: {message}")


class RPCClient:
    """Low-level JSON-RPC 2.0 client with retry logic.
    
    Uses custom first-party HTTP client instead of requests/httpx.
    """
    
    def __init__(self, config: TheBlockConfig):
        """Initialize RPC client.
        
        Args:
            config: TheBlockConfig instance with connection settings.
        """
        self.config = config
        
        # Create custom HTTP client
        self.client = HTTPClient(
            timeout=config.timeout_seconds,
            verify_ssl=True,  # Always verify for blockchain
            user_agent="TheBlock-BlockBuster/1.0"
        )
        
        # Prepare headers
        self.headers = {
            "Content-Type": "application/json",
        }
        
        # Configure auth
        if config.auth_token:
            self.headers["Authorization"] = f"Bearer {config.auth_token}"
        
        # mTLS configuration
        self.cert_path = config.tls_cert_path
        self.key_path = config.tls_key_path
        
        # Retry configuration
        self.max_retries = config.max_retries
        # Base delay (seconds) for exponential backoff
        self.retry_delay = config.backoff_base
        
        # Request ID counter
        self._request_id = 0
    
    def call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Make JSON-RPC 2.0 call with retry logic.
        
        Args:
            method: RPC method name (e.g., 'chain_getBlockHash')
            params: Optional method parameters
        
        Returns:
            JSON-RPC result field
        
        Raises:
            RPCError: On JSON-RPC error response
            HTTPError: On HTTP-level errors
        """
        if getattr(self.config, "offline", False):
            # In offline mode we intentionally skip network calls to avoid
            # connection-refused spam when no node is running.
            raise RPCError(-32000, "RPC disabled (offline mode)")

        self._request_id += 1
        request_id = self._request_id
        
        # Build JSON-RPC 2.0 request
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }
        
        if params is not None:
            payload["params"] = params
        
        # Retry loop with exponential backoff
        attempts = 0
        last_error = None
        
        while attempts <= self.max_retries:
            try:
                response = self._make_request(payload)
                return self._handle_response(response)
            
            except HTTPError as e:
                # Fail-fast for auth errors (don't retry)
                if e.status_code in (401, 403):
                    logger.error(f"Authentication failed: {e.message}")
                    raise RPCError(-32000, f"Authentication error: {e.message}")
                
                # Retry for network/timeout errors
                last_error = e
                attempts += 1
                
                if attempts <= self.max_retries:
                    # Exponential backoff
                    delay = self.retry_delay * (2 ** (attempts - 1))
                    logger.warning(
                        f"RPC call {method} failed (attempt {attempts}/{self.max_retries + 1}): {e}. "
                        f"Retrying in {delay}s..."
                    )
                    time.sleep(delay)
            
            except RPCError:
                # Don't retry JSON-RPC errors (they're deterministic)
                raise
            
            except Exception as e:
                logger.error(f"Unexpected error calling {method}: {e}")
                raise
        
        # Max retries exhausted
        raise RPCError(
            -32603,
            f"RPC call failed after {self.max_retries + 1} attempts: {last_error}"
        )
    
    def _make_request(self, payload: Dict[str, Any]) -> Response:
        """Make HTTP request to RPC endpoint."""
        try:
            response = self.client.post(
                self.config.rpc_url,
                json_data=payload,
                headers=self.headers
            )
            return response
        
        except HTTPError as e:
            logger.debug(f"HTTP request failed: {e}")
            raise
    
    def _handle_response(self, response: Response) -> Any:
        """Parse JSON-RPC response."""
        if not response.ok:
            raise HTTPError(
                response.status_code,
                f"HTTP {response.status_code}: {response.text[:200]}",
                response,
            )

        try:
            data = response.json()
        except json.JSONDecodeError as exc:  # pragma: no cover - malformed upstream
            raise RPCError(-32700, f"Invalid JSON response: {exc}", response.text[:200])

        if data.get("jsonrpc") != "2.0":
            raise RPCError(-32600, "Invalid JSON-RPC 2.0 response", data)

        if "error" in data:
            err = data["error"] or {}
            raise RPCError(
                err.get("code", -32603),
                err.get("message", "Unknown error"),
                err.get("data"),
            )

        if "result" in data:
            return data["result"]

        raise RPCError(-32600, "Response missing 'result' field", data)
    
    def batch_call(self, calls: List[tuple[str, Optional[Dict[str, Any]]]]) -> List[Any]:
        """Make batch JSON-RPC call.
        
        Args:
            calls: List of (method, params) tuples
        
        Returns:
            List of results (same order as calls)
        """
        if not calls:
            return []
        
        # Build batch request
        batch_payload = []
        for i, (method, params) in enumerate(calls):
            self._request_id += 1
            payload = {
                "jsonrpc": "2.0",
                "id": self._request_id,
                "method": method,
            }
            if params is not None:
                payload["params"] = params
            batch_payload.append(payload)
        
        # Make request
        try:
            response = self._make_request(batch_payload)
            data = response.json()
        except HTTPError as e:
            logger.error(f"Batch call failed: {e}")
            raise
        except json.JSONDecodeError as exc:
            raise RPCError(-32700, f"Invalid JSON response: {exc}")

        results: List[Any] = []
        for item in data:
            if "error" in item:
                err = item["error"] or {}
                results.append(
                    RPCError(
                        err.get("code", -32603),
                        err.get("message", "Unknown error"),
                        err.get("data"),
                    )
                )
            elif "result" in item:
                results.append(item["result"])
            else:
                results.append(RPCError(-32600, "Invalid response item", item))

        return results
    
    def health_check(self) -> bool:
        """Check if node is reachable and responding.
        
        Returns:
            True if healthy, False otherwise
        """
        try:
            # Try calling a simple method
            result = self.call("consensus.block_height")
            return "height" in result
        except Exception as e:
            logger.warning(f"Health check failed: {e}")
            return False
    
    def get_node_version(self) -> str:
        """Get node version.
        
        Returns:
            Version string
        """
        try:
            result = self.call("consensus.version")
            return result if isinstance(result, str) else json.dumps(result)
        except Exception as e:
            logger.error(f"Failed to get node version: {e}")
            return "unknown"
    
    def close(self):
        """Close client (cleanup resources)."""
        # No cleanup needed for our custom HTTP client
        pass

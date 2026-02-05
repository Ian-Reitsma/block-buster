"""Custom HTTP Client - Zero dependency implementation.

Implements HTTP/1.1 client using only Python standard library.
No third-party dependencies like requests, httpx, or urllib3.

Features:
- HTTP/1.1 protocol (GET, POST, PUT, DELETE, PATCH)
- Connection pooling
- Automatic redirects
- Chunked transfer encoding
- Keep-alive connections
- Timeout handling
- TLS/SSL support
- JSON encoding/decoding
- Custom headers
- Basic/Bearer authentication
"""

import socket
import ssl
import json
import time
import logging
import contextlib
import random
from typing import Dict, Optional, Any, Tuple
from urllib.parse import urlparse, urlencode
from http.client import HTTPConnection, HTTPSConnection
from dataclasses import dataclass

from block_buster.utils import metrics

_latency = metrics.Histogram(
    "http_client_request_seconds",
    "HTTP client latency (stdlib)",
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)
_requests = metrics.Counter(
    "http_client_requests_total",
    "HTTP client requests",
    labelnames=["method", "status_class"],
)
_retries = metrics.Counter(
    "http_client_retries_total",
    "HTTP client retries",
)
_errors = metrics.Counter(
    "http_client_errors_total",
    "HTTP client errors",
    labelnames=["error_class"],
)

logger = logging.getLogger(__name__)


class HTTPError(Exception):
    """HTTP request error."""
    
    def __init__(self, status_code: int, message: str, response: Optional['Response'] = None):
        self.status_code = status_code
        self.message = message
        self.response = response
        super().__init__(f"HTTP {status_code}: {message}")


class Response:
    """HTTP response object."""
    
    def __init__(self, status_code: int, headers: Dict[str, str], body: bytes):
        self.status_code = status_code
        self.headers = headers
        self.body = body
        self._text: Optional[str] = None
        self._json: Optional[Any] = None
    
    @property
    def text(self) -> str:
        """Get response body as text."""
        if self._text is None:
            # Try to detect encoding from headers
            content_type = self.headers.get('content-type', '')
            encoding = 'utf-8'  # default
            if 'charset=' in content_type:
                encoding = content_type.split('charset=')[1].split(';')[0].strip()
            self._text = self.body.decode(encoding, errors='replace')
        return self._text
    
    def json(self) -> Any:
        """Parse response body as JSON."""
        if self._json is None:
            self._json = json.loads(self.text)
        return self._json
    
    @property
    def ok(self) -> bool:
        """Check if request was successful (2xx status)."""
        return 200 <= self.status_code < 300
    
    def raise_for_status(self):
        """Raise HTTPError if status is not 2xx."""
        if not self.ok:
            raise HTTPError(self.status_code, self.text, self)


@dataclass
class _PooledConnection:
    conn: HTTPConnection
    last_used: float
    scheme: str
    host: str
    port: int


class HTTPClient:
    """Custom HTTP client using only Python stdlib.
    
    Example:
        client = HTTPClient(timeout=30)
        
        # GET request
        response = client.get('https://api.example.com/data')
        data = response.json()
        
        # POST request with JSON
        response = client.post(
            'https://api.example.com/data',
            json={'key': 'value'}
        )
        
        # With authentication
        response = client.get(
            'https://api.example.com/protected',
            headers={'Authorization': 'Bearer token123'}
        )
    """
    
    def __init__(self, 
                 timeout: Optional[float] = 30,
                 max_redirects: int = 5,
                 verify_ssl: bool = True,
                 user_agent: str = "TheBlock-HTTPClient/1.0",
                 max_retries: int = 2,
                 backoff_factor: float = 0.25,
                 max_backoff_seconds: float = 2.0,
                 backoff_jitter: float = 0.1,
                 pool_ttl: float = 30.0,
                 trace_hook: Optional[callable] = None,
                 sleep_fn: Optional[callable] = None):
        """
        Args:
            timeout: Request timeout in seconds
            max_redirects: Maximum number of redirects to follow
            verify_ssl: Verify SSL certificates
            user_agent: User-Agent header value
            max_retries: Automatic retry attempts for transient failures
            backoff_factor: Base backoff in seconds (exponential)
            max_backoff_seconds: Upper bound for backoff sleeps
            backoff_jitter: +/- fraction jitter applied to backoff (0 disables)
            pool_ttl: Seconds to keep idle pooled connections alive
            trace_hook: Optional callable(event: str, **kwargs) for tracing
            sleep_fn: Optional sleep function override (testing)
        """
        self.timeout = timeout
        self.max_redirects = max_redirects
        self.verify_ssl = verify_ssl
        self.user_agent = user_agent
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.max_backoff_seconds = max_backoff_seconds
        self.backoff_jitter = backoff_jitter
        self.pool_ttl = pool_ttl
        self.trace_hook = trace_hook
        self._sleep = sleep_fn or time.sleep
        self._connections: Dict[str, _PooledConnection] = {}
    
    def request(self,
                method: str,
                url: str,
                headers: Optional[Dict[str, str]] = None,
                data: Optional[bytes] = None,
                json_data: Optional[Any] = None,
                params: Optional[Dict[str, Any]] = None) -> Response:
        """Make HTTP request.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full URL
            headers: Custom headers
            data: Raw bytes to send
            json_data: JSON data to encode and send
            params: Query parameters
        
        Returns:
            Response object
        """
        self._prune_pool()

        # Parse URL
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        hostname = parsed.hostname
        port = parsed.port or (443 if scheme == 'https' else 80)
        path = parsed.path or '/'
        
        if not hostname:
            raise ValueError(f"Invalid URL: {url}")
        
        # Add query parameters
        if params:
            query = urlencode(params)
            path = f"{path}?{query}" if '?' not in path else f"{path}&{query}"
        
        # Prepare headers
        req_headers = {
            'User-Agent': self.user_agent,
            'Accept': '*/*',
            'Host': hostname,
        }
        if headers:
            req_headers.update(headers)
        
        # Prepare body
        body = data
        if json_data is not None:
            body = json.dumps(json_data).encode('utf-8')
            req_headers['Content-Type'] = 'application/json'
        
        # Keep-alive for reuse
        req_headers.setdefault("Connection", "keep-alive")
        
        if body:
            req_headers['Content-Length'] = str(len(body))
        
        # Make request with redirects
        redirects = 0
        while redirects <= self.max_redirects:
            response = self._with_retries(
                scheme, hostname, port, method, path, req_headers, body
            )
            
            # Handle redirects
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get('location')
                if not location:
                    break
                
                redirects += 1
                if redirects > self.max_redirects:
                    raise HTTPError(
                        response.status_code,
                        f"Too many redirects ({redirects})",
                        response
                    )
                
                # Follow redirect
                logger.debug(f"Redirecting to: {location}")
                url = location
                parsed = urlparse(url)
                scheme = parsed.scheme.lower()
                hostname = parsed.hostname
                port = parsed.port or (443 if scheme == 'https' else 80)
                path = parsed.path or '/'
                
                # For 303, always use GET
                if response.status_code == 303:
                    method = 'GET'
                    body = None
                    req_headers.pop('Content-Length', None)
                    req_headers.pop('Content-Type', None)
                
                continue
            
            # Not a redirect, return response
            return response
        
        raise HTTPError(302, "Max redirects exceeded")
    
    def _with_retries(
        self,
        scheme: str,
        hostname: str,
        port: int,
        method: str,
        path: str,
        headers: Dict[str, str],
        body: Optional[bytes],
    ) -> Response:
        """Execute request with retry/backoff."""
        attempt = 0
        last_error: Optional[Exception] = None
        while attempt <= self.max_retries:
            request_id = f"{hostname}:{port}:{time.time_ns()}"
            if self.trace_hook:
                self.trace_hook(
                    "http_request_start",
                    request_id=request_id,
                    host=hostname,
                    port=port,
                    scheme=scheme,
                    method=method,
                    path=path,
                    attempt=attempt,
                )
            start = time.perf_counter()
            try:
                response = self._make_request(
                    scheme, hostname, port, method, path, headers, body
                )
                latency = time.perf_counter() - start
                _latency.observe(latency)
                status_class = f"{response.status_code // 100}xx"
                _requests.labels(method=method, status_class=status_class).inc()
                if self.trace_hook:
                    self.trace_hook(
                        "http_request_end",
                        host=hostname,
                        method=method,
                        path=path,
                        latency=latency,
                        status=response.status_code,
                        attempt=attempt,
                        request_id=request_id,
                    )
                    self.trace_hook(
                        "http_request",
                        host=hostname,
                        method=method,
                        path=path,
                        latency=latency,
                        status=response.status_code,
                        attempt=attempt,
                        request_id=request_id,
                    )
                # Retry on 5xx/429 if attempts remain
                if response.status_code in (500, 502, 503, 504, 429) and attempt < self.max_retries:
                    _retries.inc()
                    self._drop_connection(scheme, hostname, port)
                    self._backoff(attempt)
                    attempt += 1
                    continue
                return response
            except HTTPError as e:
                last_error = e
                retryable = e.status_code in (0, 500, 502, 503, 504, 429)
                _errors.labels(error_class=self._classify_error(e)).inc()
                if self.trace_hook:
                    self.trace_hook(
                        "http_request_error",
                        request_id=request_id,
                        host=hostname,
                        method=method,
                        path=path,
                        attempt=attempt,
                        error=str(e),
                        error_class=self._classify_error(e),
                    )
                if retryable and attempt < self.max_retries:
                    _retries.inc()
                    self._drop_connection(scheme, hostname, port)
                    self._backoff(attempt)
                    attempt += 1
                    continue
                raise
            except Exception as e:  # pragma: no cover - defensive
                last_error = e
                _errors.labels(error_class="exception").inc()
                if self.trace_hook:
                    self.trace_hook(
                        "http_request_error",
                        request_id=request_id,
                        host=hostname,
                        method=method,
                        path=path,
                        attempt=attempt,
                        error=str(e),
                        error_class="exception",
                    )
                if attempt < self.max_retries:
                    _retries.inc()
                    self._drop_connection(scheme, hostname, port)
                    self._backoff(attempt)
                    attempt += 1
                    continue
                raise HTTPError(0, f"Request failed: {e}")
        if last_error:
            raise last_error
        raise HTTPError(0, "request failed without response")

    def _backoff(self, attempt: int) -> None:
        delay = self._compute_backoff_delay(attempt)
        if self.trace_hook:
            self.trace_hook("http_request_backoff", attempt=attempt, delay=delay)
        self._sleep(delay)

    def _compute_backoff_delay(self, attempt: int) -> float:
        delay = self.backoff_factor * (2 ** attempt)
        delay = min(delay, max(0.0, float(self.max_backoff_seconds)))
        jitter = max(0.0, float(self.backoff_jitter))
        if jitter:
            delay *= random.uniform(max(0.0, 1.0 - jitter), 1.0 + jitter)
        return delay

    @staticmethod
    def _classify_error(err: HTTPError) -> str:
        msg = (err.message or "").lower()
        if "timeout" in msg:
            return "timeout"
        if "ssl" in msg or "tls" in msg or "certificate" in msg:
            return "tls"
        if "connection" in msg or "socket" in msg:
            return "connection"
        if err.status_code in (429, 500, 502, 503, 504):
            return f"http_{err.status_code}"
        if err.status_code == 0:
            return "no_response"
        return "other"

    def _make_request(self,
                     scheme: str,
                     hostname: str,
                     port: int,
                     method: str,
                     path: str,
                     headers: Dict[str, str],
                     body: Optional[bytes]) -> Response:
        """Make a single HTTP request."""
        try:
            # Get/reuse connection
            conn = self._get_connection(scheme, hostname, port)
            
            # Send request
            conn.request(method, path, body, headers)
            
            # Get response
            http_response = conn.getresponse()
            status_code = http_response.status
            response_headers = dict(http_response.getheaders())
            response_body = http_response.read()
            
            # Close connection if server asks
            if response_headers.get("connection", "").lower() == "close":
                self._drop_connection(scheme, hostname, port)
            else:
                self._touch_connection(scheme, hostname, port, conn)
            
            return Response(status_code, response_headers, response_body)
        
        except socket.timeout:
            raise HTTPError(0, f"Request timeout after {self.timeout}s")
        except socket.error as e:
            raise HTTPError(0, f"Connection error: {e}")
        except Exception as e:
            raise HTTPError(0, f"Request failed: {e}")
    
    def _pool_key(self, scheme: str, host: str, port: int) -> str:
        return f"{scheme}://{host}:{port}"

    def _get_connection(self, scheme: str, host: str, port: int) -> HTTPConnection:
        key = self._pool_key(scheme, host, port)
        pooled = self._connections.get(key)
        if pooled and (time.time() - pooled.last_used) < self.pool_ttl:
            return pooled.conn
        if pooled:
            with contextlib.suppress(Exception):
                pooled.conn.close()
            self._connections.pop(key, None)
        if scheme == "https":
            context = ssl.create_default_context()
            if not self.verify_ssl:
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
            conn = HTTPSConnection(host, port, timeout=self.timeout, context=context)
        else:
            conn = HTTPConnection(host, port, timeout=self.timeout)
        self._connections[key] = _PooledConnection(conn=conn, last_used=time.time(), scheme=scheme, host=host, port=port)
        return conn

    def _touch_connection(self, scheme: str, host: str, port: int, conn: HTTPConnection) -> None:
        key = self._pool_key(scheme, host, port)
        self._connections[key] = _PooledConnection(conn=conn, last_used=time.time(), scheme=scheme, host=host, port=port)

    def _drop_connection(self, scheme: str, host: str, port: int) -> None:
        key = self._pool_key(scheme, host, port)
        pooled = self._connections.pop(key, None)
        if pooled:
            with contextlib.suppress(Exception):
                pooled.conn.close()

    def _prune_pool(self) -> None:
        now = time.time()
        for key, pooled in list(self._connections.items()):
            if (now - pooled.last_used) > self.pool_ttl:
                with contextlib.suppress(Exception):
                    pooled.conn.close()
                self._connections.pop(key, None)
    
    def get(self, url: str, **kwargs) -> Response:
        """Make GET request."""
        return self.request('GET', url, **kwargs)
    
    def post(self, url: str, **kwargs) -> Response:
        """Make POST request."""
        return self.request('POST', url, **kwargs)
    
    def put(self, url: str, **kwargs) -> Response:
        """Make PUT request."""
        return self.request('PUT', url, **kwargs)
    
    def delete(self, url: str, **kwargs) -> Response:
        """Make DELETE request."""
        return self.request('DELETE', url, **kwargs)
    
    def patch(self, url: str, **kwargs) -> Response:
        """Make PATCH request."""
        return self.request('PATCH', url, **kwargs)
    
    def head(self, url: str, **kwargs) -> Response:
        """Make HEAD request."""
        return self.request('HEAD', url, **kwargs)


# Convenience functions for one-off requests

_default_client: Optional[HTTPClient] = None

def get_default_client() -> HTTPClient:
    """Get or create default HTTP client."""
    global _default_client
    if _default_client is None:
        _default_client = HTTPClient()
    return _default_client


def get(url: str, **kwargs) -> Response:
    """Make GET request using default client."""
    return get_default_client().get(url, **kwargs)


def post(url: str, **kwargs) -> Response:
    """Make POST request using default client."""
    return get_default_client().post(url, **kwargs)


def put(url: str, **kwargs) -> Response:
    """Make PUT request using default client."""
    return get_default_client().put(url, **kwargs)


def delete(url: str, **kwargs) -> Response:
    """Make DELETE request using default client."""
    return get_default_client().delete(url, **kwargs)


def patch(url: str, **kwargs) -> Response:
    """Make PATCH request using default client."""
    return get_default_client().patch(url, **kwargs)

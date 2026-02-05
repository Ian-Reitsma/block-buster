"""Custom HTTP Server - Zero dependency replacement for FastAPI/uvicorn.

Using only Python standard library:
- http.server for HTTP protocol
- asyncio for async operations
- json for serialization
- urllib.parse for URL parsing
"""

import asyncio
import json
import re
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer as StdHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
from typing import Callable, Dict, List, Any, Optional, Tuple
from functools import wraps
import logging


logger = logging.getLogger(__name__)


class HTTPError(Exception):
    """HTTP error with status code."""
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class Request:
    """HTTP request wrapper."""
    def __init__(self, method: str, path: str, headers: Dict[str, str], 
                 body: bytes, query_params: Dict[str, List[str]],
                 path_params: Dict[str, str]):
        self.method = method
        self.path = path
        self.headers = headers
        self.body = body
        self.query_params = query_params
        self.path_params = path_params
    
    def json(self) -> Any:
        """Parse body as JSON."""
        if not self.body:
            return None
        try:
            return json.loads(self.body.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise HTTPError(400, f"Invalid JSON: {e}")


class Response:
    """HTTP response wrapper."""
    def __init__(self, content: Any = None, status_code: int = 200,
                 headers: Optional[Dict[str, str]] = None,
                 media_type: str = "application/json"):
        self.content = content
        self.status_code = status_code
        self.headers = headers or {}
        self.media_type = media_type
    
    def to_bytes(self) -> bytes:
        """Convert response to bytes."""
        if self.content is None:
            return b""
        if isinstance(self.content, (dict, list)):
            return json.dumps(self.content).encode('utf-8')
        if isinstance(self.content, str):
            return self.content.encode('utf-8')
        if isinstance(self.content, bytes):
            return self.content
        return str(self.content).encode('utf-8')


class Route:
    """Route definition."""
    def __init__(self, path: str, method: str, handler: Callable,
                 is_async: bool = False):
        self.path = path
        self.method = method.upper()
        self.handler = handler
        self.is_async = is_async
        # Convert path pattern to regex
        self.pattern = self._compile_pattern(path)
        self.param_names = self._extract_param_names(path)
    
    def _compile_pattern(self, path: str) -> re.Pattern:
        """Convert path pattern to regex.
        
        Examples:
            /users/{id} -> /users/(?P<id>[^/]+)
            /posts/{post_id}/comments/{id} -> /posts/(?P<post_id>[^/]+)/comments/(?P<id>[^/]+)
        """
        pattern = path
        # Replace {param} with regex capture group
        pattern = re.sub(r'{([^}]+)}', r'(?P<\1>[^/]+)', pattern)
        return re.compile(f"^{pattern}$")
    
    def _extract_param_names(self, path: str) -> List[str]:
        """Extract parameter names from path."""
        return re.findall(r'{([^}]+)}', path)
    
    def match(self, path: str, method: str) -> Optional[Dict[str, str]]:
        """Check if route matches path and extract parameters."""
        if method.upper() != self.method:
            return None
        match = self.pattern.match(path)
        if match:
            return match.groupdict()
        return None


class HTTPServer:
    """Custom async HTTP server.
    
    Example:
        server = HTTPServer()
        
        @server.get("/hello")
        async def hello(request: Request):
            return {"message": "Hello, World!"}
        
        @server.post("/users")
        async def create_user(request: Request):
            data = request.json()
            return {"user": data, "id": 123}
        
        @server.get("/users/{id}")
        async def get_user(request: Request):
            user_id = request.path_params["id"]
            return {"user_id": user_id}
        
        server.run(host="127.0.0.1", port=8000)
    """
    
    def __init__(self, title: str = "HTTPServer"):
        self.title = title
        self.routes: List[Route] = []
        self.middleware: List[Callable] = []
        self.cors_enabled = False
        self.cors_origins = ["*"]
    
    def enable_cors(self, origins: List[str] = None):
        """Enable CORS support."""
        self.cors_enabled = True
        if origins:
            self.cors_origins = origins
    
    def add_middleware(self, middleware: Callable):
        """Add middleware function."""
        self.middleware.append(middleware)
    
    def route(self, path: str, methods: List[str]):
        """Decorator to register route."""
        def decorator(func: Callable):
            is_async = asyncio.iscoroutinefunction(func)
            for method in methods:
                route = Route(path, method, func, is_async)
                self.routes.append(route)
            return func
        return decorator
    
    def get(self, path: str):
        """Decorator for GET route."""
        return self.route(path, ["GET"])
    
    def post(self, path: str):
        """Decorator for POST route."""
        return self.route(path, ["POST"])
    
    def put(self, path: str):
        """Decorator for PUT route."""
        return self.route(path, ["PUT"])
    
    def delete(self, path: str):
        """Decorator for DELETE route."""
        return self.route(path, ["DELETE"])
    
    def patch(self, path: str):
        """Decorator for PATCH route."""
        return self.route(path, ["PATCH"])
    
    def options(self, path: str):
        """Decorator for OPTIONS route."""
        return self.route(path, ["OPTIONS"])
    
    def _find_route(self, path: str, method: str) -> Optional[Tuple[Route, Dict[str, str]]]:
        """Find matching route and extract path parameters."""
        for route in self.routes:
            params = route.match(path, method)
            if params is not None:
                return route, params
        return None
    
    async def _handle_request(self, request: Request) -> Response:
        """Handle incoming request."""
        try:
            # Apply middleware
            for mw in self.middleware:
                request = await mw(request) if asyncio.iscoroutinefunction(mw) else mw(request)
            
            # Handle OPTIONS for CORS
            if self.cors_enabled and request.method == "OPTIONS":
                return Response(status_code=200)
            
            # Find route
            result = self._find_route(request.path, request.method)
            if result is None:
                return Response(
                    {"detail": f"Not Found: {request.method} {request.path}"},
                    status_code=404
                )
            
            route, path_params = result
            request.path_params = path_params
            
            # Call handler
            if route.is_async:
                response = await route.handler(request)
            else:
                response = route.handler(request)
            
            # Convert response
            if isinstance(response, Response):
                return response
            elif isinstance(response, dict) or isinstance(response, list):
                return Response(response)
            elif isinstance(response, tuple):
                content, status_code = response
                return Response(content, status_code=status_code)
            else:
                return Response(response)
        
        except HTTPError as e:
            return Response(
                {"detail": e.detail},
                status_code=e.status_code
            )
        except Exception as e:
            logger.error(f"Error handling request: {e}")
            logger.error(traceback.format_exc())
            return Response(
                {"detail": "Internal Server Error"},
                status_code=500
            )
    
    def _create_handler(self):
        """Create request handler class."""
        server = self
        
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                """Override to use logger."""
                logger.info(format % args)
            
            def _run_async(self, coro):
                """Run coroutine in event loop."""
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    return loop.run_until_complete(coro)
                finally:
                    loop.close()
            
            def _handle(self):
                """Handle request."""
                # Parse URL
                parsed = urlparse(self.path)
                path = unquote(parsed.path)
                query_params = parse_qs(parsed.query)
                
                # Read body
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b""
                
                # Create request
                request = Request(
                    method=self.command,
                    path=path,
                    headers=dict(self.headers),
                    body=body,
                    query_params=query_params,
                    path_params={}
                )
                
                # Handle request
                response = self._run_async(server._handle_request(request))
                
                # Send response
                self.send_response(response.status_code)
                
                # CORS headers
                if server.cors_enabled:
                    self.send_header('Access-Control-Allow-Origin', 
                                   ', '.join(server.cors_origins))
                    self.send_header('Access-Control-Allow-Methods', 
                                   'GET, POST, PUT, DELETE, PATCH, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers', '*')
                    self.send_header('Access-Control-Allow-Credentials', 'true')
                
                # Content headers
                self.send_header('Content-Type', response.media_type)
                for key, value in response.headers.items():
                    self.send_header(key, value)
                
                self.end_headers()
                self.wfile.write(response.to_bytes())
            
            def do_GET(self):
                self._handle()
            
            def do_POST(self):
                self._handle()
            
            def do_PUT(self):
                self._handle()
            
            def do_DELETE(self):
                self._handle()
            
            def do_PATCH(self):
                self._handle()
            
            def do_OPTIONS(self):
                self._handle()
        
        return Handler
    
    def run(self, host: str = "127.0.0.1", port: int = 8000):
        """Start server (blocking)."""
        handler_class = self._create_handler()
        # Allow quick restarts without TIME_WAIT collisions.
        StdHTTPServer.allow_reuse_address = True
        try:
            httpd = StdHTTPServer((host, port), handler_class)
        except OSError as e:
            if e.errno == 48:  # Address already in use
                logger.error(
                    "Port %d is already in use. Set BLOCK_BUSTER_HTTP_PORT or pass http_port to avoid collision.",
                    port,
                )
                raise
            raise
        
        logger.info(f"✨ {self.title} starting on http://{host}:{port}")
        logger.info(f"   Registered {len(self.routes)} routes")
        logger.info(f"   CORS: {'enabled' if self.cors_enabled else 'disabled'}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("\n✋ Shutting down server...")
            httpd.shutdown()


# Utility functions

def JSONResponse(content: Any, status_code: int = 200) -> Response:
    """Create JSON response."""
    return Response(content, status_code, media_type="application/json")


def HTMLResponse(content: str, status_code: int = 200) -> Response:
    """Create HTML response."""
    return Response(content, status_code, media_type="text/html")


def PlainTextResponse(content: str, status_code: int = 200) -> Response:
    """Create plain text response."""
    return Response(content, status_code, media_type="text/plain")

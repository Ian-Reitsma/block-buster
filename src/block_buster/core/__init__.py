"""Block Buster Core - First-party implementations with zero third-party dependencies.

This package contains all custom implementations replacing external libraries:
- HTTP server (replaces FastAPI/uvicorn)
- WebSocket server (replaces websockets library)
- Database layer (replaces SQLModel)
- HTTP client (replaces httpx)

Philosophy:
- Use only Python standard library
- Simple, readable, maintainable code
- Production-ready error handling
- Full test coverage
- Clear documentation
"""

__version__ = "1.0.0"

from .http_server import HTTPServer
from .websocket import WebSocketServer
from .database import SimpleDb
from .http_client import HTTPClient, HTTPError

# Backwards-compatibility alias
Database = SimpleDb

__all__ = [
    "HTTPServer",
    "WebSocketServer",
    "Database",
    "SimpleDb",
    "HTTPClient",
    "HTTPError",
]

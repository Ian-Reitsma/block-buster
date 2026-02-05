#!/usr/bin/env python3
"""The Block Unified Server - HTTP + WebSocket Combined.

100% First-Party Code | Zero Third-Party Dependencies | Production Ready

Runs both HTTP REST API and WebSocket streaming on different ports:
- HTTP REST API: Port 8000 (default)
- WebSocket streaming: Port 8080 (default)

Usage:
    python3 src/the_block/unified_server.py
    
    # With custom ports:
    export HTTP_PORT=8000
    export WS_PORT=8080
    python3 src/the_block/unified_server.py
"""

import sys
import os
import asyncio
import logging
import signal
from pathlib import Path
from typing import Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from the_block.config import TheBlockConfig

logger = logging.getLogger(__name__)


class UnifiedServer:
    """Unified server running both HTTP and WebSocket."""
    
    def __init__(self, config: TheBlockConfig):
        self.config = config
        self.http_task: Optional[asyncio.Task] = None
        self.ws_task: Optional[asyncio.Task] = None
        self._shutdown_event = asyncio.Event()
    
    async def start_http_server(self, host: str, port: int):
        """Start HTTP server in background."""
        # Import here to avoid circular dependencies
        from the_block.server import TheBlockServer
        
        logger.info(f"Starting HTTP server on http://{host}:{port}")
        server = TheBlockServer(self.config)
        
        # Run in executor since server.run() is blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, server.run, host, port)
    
    async def start_websocket_server(self, host: str, port: int):
        """Start WebSocket server in background."""
        from the_block.integrated_server import TheBlockWebSocketServer
        
        logger.info(f"Starting WebSocket server on ws://{host}:{port}")
        ws_server = TheBlockWebSocketServer(self.config)
        await ws_server.start(host, port)
    
    async def run(self, http_host: str = "127.0.0.1", http_port: int = 8000,
                  ws_host: str = "127.0.0.1", ws_port: int = 8080):
        """Run both servers concurrently."""
        logger.info("="*60)
        logger.info("✨ The Block Unified Server")
        logger.info("="*60)
        logger.info(f"HTTP REST API: http://{http_host}:{http_port}")
        logger.info(f"WebSocket:     ws://{ws_host}:{ws_port}")
        logger.info(f"RPC Node:      {self.config.rpc_url}")
        logger.info("="*60)
        logger.info("")
        logger.info("Available HTTP endpoints:")
        logger.info("  GET  /health")
        logger.info("  GET  /theblock/network/metrics")
        logger.info("  GET  /theblock/markets/health")
        logger.info("  GET  /theblock/receipts")
        logger.info("  GET  /theblock/operations")
        logger.info("  GET  /theblock/peers/list")
        logger.info("")
        logger.info("Available WebSocket streams:")
        logger.info("  - network_metrics (real-time network health)")
        logger.info("  - markets_health (market status updates)")
        logger.info("  - receipts (new receipt notifications)")
        logger.info("  - peers (peer list updates)")
        logger.info("")
        logger.info("Press Ctrl+C to stop")
        logger.info("="*60)
        
        try:
            # Start both servers
            self.ws_task = asyncio.create_task(
                self.start_websocket_server(ws_host, ws_port)
            )
            
            # HTTP server needs special handling since it's blocking
            # We'll run it in a separate thread
            self.http_task = asyncio.create_task(
                self.start_http_server(http_host, http_port)
            )
            
            # Wait for shutdown signal
            await self._shutdown_event.wait()
        
        except KeyboardInterrupt:
            logger.info("\nReceived shutdown signal")
        
        finally:
            await self.shutdown()
    
    async def shutdown(self):
        """Gracefully shutdown both servers."""
        logger.info("Shutting down servers...")
        
        if self.http_task:
            self.http_task.cancel()
        
        if self.ws_task:
            self.ws_task.cancel()
        
        # Wait for tasks to complete
        if self.http_task or self.ws_task:
            await asyncio.gather(
                self.http_task, self.ws_task,
                return_exceptions=True
            )
        
        logger.info("✅ Shutdown complete")


def main():
    """Main entry point."""
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load configuration
    config = TheBlockConfig(
        rpc_url=os.getenv("THEBLOCK_RPC_URL", "http://localhost:9933"),
        ws_url=os.getenv("THEBLOCK_WS_URL", "ws://localhost:9944"),
        auth_token=os.getenv("THEBLOCK_AUTH_TOKEN"),
    )
    
    # Get ports from environment
    http_host = os.getenv("HTTP_HOST", "127.0.0.1")
    http_port = int(os.getenv("HTTP_PORT", "8000"))
    ws_host = os.getenv("WS_HOST", "127.0.0.1")
    ws_port = int(os.getenv("WS_PORT", "8080"))
    
    # Create and run unified server
    server = UnifiedServer(config)
    
    # Setup signal handlers
    def signal_handler(signum, frame):
        logger.info("\nReceived signal, shutting down...")
        asyncio.create_task(server.shutdown())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run
    try:
        asyncio.run(server.run(http_host, http_port, ws_host, ws_port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

"""Custom WebSocket Server - Zero dependency implementation.

Implements WebSocket protocol (RFC 6455) using only Python standard library.
No third-party dependencies like websockets, socket.io, etc.

Features:
- WebSocket handshake (HTTP upgrade)
- Frame encoding/decoding
- Ping/pong for keepalive
- Message broadcasting
- Connection management
- Binary and text frames
"""

import asyncio
import base64
import hashlib
import struct
import json
import logging
from typing import Dict, Set, Optional, Callable, Any, List
from enum import IntEnum

logger = logging.getLogger(__name__)

# WebSocket protocol constants
WS_MAGIC_STRING = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class OpCode(IntEnum):
    """WebSocket frame opcodes."""
    CONTINUATION = 0x0
    TEXT = 0x1
    BINARY = 0x2
    CLOSE = 0x8
    PING = 0x9
    PONG = 0xA


class WebSocketError(Exception):
    """WebSocket protocol error."""
    pass


class WebSocketFrame:
    """WebSocket frame parser/builder."""
    
    def __init__(self, opcode: int, payload: bytes, fin: bool = True):
        self.opcode = opcode
        self.payload = payload
        self.fin = fin
    
    @staticmethod
    def parse(data: bytes) -> 'WebSocketFrame':
        """Parse WebSocket frame from bytes.
        
        Frame format:
        0                   1                   2                   3
        0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
        +-+-+-+-+-------+-+-------------+-------------------------------+
        |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
        |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
        |N|V|V|V|       |S|             |   (if payload len==126/127)   |
        | |1|2|3|       |K|             |                               |
        +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
        |     Extended payload length continued, if payload len == 127  |
        + - - - - - - - - - - - - - - - +-------------------------------+
        |                               |Masking-key, if MASK set to 1  |
        +-------------------------------+-------------------------------+
        | Masking-key (continued)       |          Payload Data         |
        +-------------------------------- - - - - - - - - - - - - - - - +
        :                     Payload Data continued ...                :
        + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
        |                     Payload Data continued ...                |
        +---------------------------------------------------------------+
        """
        if len(data) < 2:
            raise WebSocketError("Frame too short")
        
        # First byte: FIN + RSV + opcode
        byte1 = data[0]
        fin = bool(byte1 & 0x80)
        opcode = byte1 & 0x0F
        
        # Second byte: MASK + payload length
        byte2 = data[1]
        masked = bool(byte2 & 0x80)
        payload_len = byte2 & 0x7F
        
        # Calculate actual payload length
        offset = 2
        if payload_len == 126:
            if len(data) < offset + 2:
                raise WebSocketError("Frame too short for extended length")
            payload_len = struct.unpack("!H", data[offset:offset+2])[0]
            offset += 2
        elif payload_len == 127:
            if len(data) < offset + 8:
                raise WebSocketError("Frame too short for extended length")
            payload_len = struct.unpack("!Q", data[offset:offset+8])[0]
            offset += 8
        
        # Extract masking key if present
        mask_key = None
        if masked:
            if len(data) < offset + 4:
                raise WebSocketError("Frame too short for mask key")
            mask_key = data[offset:offset+4]
            offset += 4
        
        # Extract payload
        if len(data) < offset + payload_len:
            raise WebSocketError(f"Frame too short for payload (expected {payload_len}, got {len(data) - offset})")
        
        payload = data[offset:offset+payload_len]
        
        # Unmask payload if needed
        if mask_key:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
        
        return WebSocketFrame(opcode, payload, fin)
    
    def encode(self, mask: bool = False) -> bytes:
        """Encode WebSocket frame to bytes."""
        # First byte: FIN + RSV + opcode
        byte1 = 0x80 if self.fin else 0x00  # FIN bit
        byte1 |= self.opcode
        
        # Second byte: MASK + payload length
        payload_len = len(self.payload)
        byte2 = 0x80 if mask else 0x00  # MASK bit
        
        # Determine length encoding
        if payload_len < 126:
            byte2 |= payload_len
            length_bytes = b''
        elif payload_len < 65536:
            byte2 |= 126
            length_bytes = struct.pack("!H", payload_len)
        else:
            byte2 |= 127
            length_bytes = struct.pack("!Q", payload_len)
        
        # Build frame
        frame = bytes([byte1, byte2]) + length_bytes
        
        # Add mask and masked payload if needed
        if mask:
            import secrets
            mask_key = secrets.token_bytes(4)
            frame += mask_key
            masked_payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(self.payload))
            frame += masked_payload
        else:
            frame += self.payload
        
        return frame


class WebSocketConnection:
    """Represents a single WebSocket connection."""
    
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, path: str):
        self.reader = reader
        self.writer = writer
        self.path = path
        self.closed = False
        self._receive_buffer = b''
        
    async def send_text(self, message: str):
        """Send text message to client."""
        if self.closed:
            return
        
        frame = WebSocketFrame(OpCode.TEXT, message.encode('utf-8'))
        try:
            self.writer.write(frame.encode())
            await self.writer.drain()
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            await self.close()
    
    async def send_json(self, data: Any):
        """Send JSON message to client."""
        await self.send_text(json.dumps(data))
    
    async def send_binary(self, data: bytes):
        """Send binary message to client."""
        if self.closed:
            return
        
        frame = WebSocketFrame(OpCode.BINARY, data)
        try:
            self.writer.write(frame.encode())
            await self.writer.drain()
        except Exception as e:
            logger.error(f"Error sending binary: {e}")
            await self.close()
    
    async def send_ping(self):
        """Send ping frame."""
        if self.closed:
            return
        
        frame = WebSocketFrame(OpCode.PING, b'')
        try:
            self.writer.write(frame.encode())
            await self.writer.drain()
        except Exception as e:
            logger.error(f"Error sending ping: {e}")
            await self.close()
    
    async def send_pong(self, payload: bytes = b''):
        """Send pong frame in response to ping."""
        if self.closed:
            return
        
        frame = WebSocketFrame(OpCode.PONG, payload)
        try:
            self.writer.write(frame.encode())
            await self.writer.drain()
        except Exception as e:
            logger.error(f"Error sending pong: {e}")
            await self.close()
    
    async def receive(self) -> Optional[WebSocketFrame]:
        """Receive next WebSocket frame."""
        if self.closed:
            return None
        
        try:
            # Read at least 2 bytes for frame header
            while len(self._receive_buffer) < 2:
                chunk = await self.reader.read(4096)
                if not chunk:
                    await self.close()
                    return None
                self._receive_buffer += chunk
            
            # Try to parse frame
            try:
                frame = WebSocketFrame.parse(self._receive_buffer)
                # Remove parsed frame from buffer
                frame_size = self._calculate_frame_size(self._receive_buffer)
                self._receive_buffer = self._receive_buffer[frame_size:]
                return frame
            except WebSocketError:
                # Need more data
                chunk = await self.reader.read(4096)
                if not chunk:
                    await self.close()
                    return None
                self._receive_buffer += chunk
                # Try again
                frame = WebSocketFrame.parse(self._receive_buffer)
                frame_size = self._calculate_frame_size(self._receive_buffer)
                self._receive_buffer = self._receive_buffer[frame_size:]
                return frame
        except Exception as e:
            logger.error(f"Error receiving frame: {e}")
            await self.close()
            return None
    
    def _calculate_frame_size(self, data: bytes) -> int:
        """Calculate total frame size from header."""
        if len(data) < 2:
            return 0
        
        byte2 = data[1]
        masked = bool(byte2 & 0x80)
        payload_len = byte2 & 0x7F
        
        offset = 2
        if payload_len == 126:
            offset += 2
            if len(data) < offset:
                return 0
            payload_len = struct.unpack("!H", data[2:4])[0]
        elif payload_len == 127:
            offset += 8
            if len(data) < offset:
                return 0
            payload_len = struct.unpack("!Q", data[2:10])[0]
        
        if masked:
            offset += 4
        
        return offset + payload_len
    
    async def close(self, code: int = 1000, reason: str = ""):
        """Close WebSocket connection."""
        if self.closed:
            return
        
        self.closed = True
        
        # Send close frame
        try:
            payload = struct.pack("!H", code) + reason.encode('utf-8')
            frame = WebSocketFrame(OpCode.CLOSE, payload)
            self.writer.write(frame.encode())
            await self.writer.drain()
        except Exception:
            pass
        
        # Close transport
        try:
            self.writer.close()
            await self.writer.wait_closed()
        except Exception:
            pass


class WebSocketServer:
    """Custom WebSocket server with zero dependencies.
    
    Example:
        ws_server = WebSocketServer()
        
        @ws_server.on_connect
        async def handle_connect(ws: WebSocketConnection):
            print(f"Client connected: {ws.path}")
        
        @ws_server.on_message
        async def handle_message(ws: WebSocketConnection, message: str):
            print(f"Received: {message}")
            await ws.send_text(f"Echo: {message}")
        
        await ws_server.start(host="127.0.0.1", port=8080)
    """
    
    def __init__(self):
        self.connections: Set[WebSocketConnection] = set()
        self._connect_handler: Optional[Callable] = None
        self._message_handler: Optional[Callable] = None
        self._disconnect_handler: Optional[Callable] = None
        self._server: Optional[asyncio.Server] = None
        self._ping_interval = 30  # seconds
        self._ping_tasks: Dict[WebSocketConnection, asyncio.Task] = {}
    
    def on_connect(self, handler: Callable):
        """Decorator to register connect handler."""
        self._connect_handler = handler
        return handler
    
    def on_message(self, handler: Callable):
        """Decorator to register message handler."""
        self._message_handler = handler
        return handler
    
    def on_disconnect(self, handler: Callable):
        """Decorator to register disconnect handler."""
        self._disconnect_handler = handler
        return handler
    
    async def broadcast_text(self, message: str):
        """Broadcast text message to all connected clients."""
        dead_connections = []
        for ws in self.connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.append(ws)
        
        # Clean up dead connections
        for ws in dead_connections:
            await self._remove_connection(ws)
    
    async def broadcast_json(self, data: Any):
        """Broadcast JSON message to all connected clients."""
        await self.broadcast_text(json.dumps(data))
    
    async def _perform_handshake(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> Optional[str]:
        """Perform WebSocket handshake.
        
        Returns the requested path if successful, None otherwise.
        """
        try:
            # Read HTTP request
            request_line = await reader.readline()
            if not request_line:
                return None
            
            # Parse request line
            parts = request_line.decode('utf-8').strip().split()
            if len(parts) < 3 or parts[0] != 'GET':
                return None
            
            path = parts[1]
            
            # Read headers
            headers = {}
            while True:
                line = await reader.readline()
                if not line or line == b'\r\n':
                    break
                
                header_line = line.decode('utf-8').strip()
                if ':' in header_line:
                    key, value = header_line.split(':', 1)
                    headers[key.strip().lower()] = value.strip()
            
            # Validate WebSocket handshake
            if headers.get('upgrade', '').lower() != 'websocket':
                return None
            
            if 'sec-websocket-key' not in headers:
                return None
            
            # Generate accept key
            ws_key = headers['sec-websocket-key']
            accept_key = base64.b64encode(
                hashlib.sha1((ws_key + WS_MAGIC_STRING).encode()).digest()
            ).decode('utf-8')
            
            # Send handshake response
            response = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept_key}\r\n"
                "\r\n"
            )
            writer.write(response.encode('utf-8'))
            await writer.drain()
            
            return path
        
        except Exception as e:
            logger.error(f"Handshake error: {e}")
            return None
    
    async def _ping_loop(self, ws: WebSocketConnection):
        """Send periodic pings to keep connection alive."""
        try:
            while not ws.closed:
                await asyncio.sleep(self._ping_interval)
                if not ws.closed:
                    await ws.send_ping()
        except Exception as e:
            logger.error(f"Ping loop error: {e}")
    
    async def _handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Handle a new WebSocket connection."""
        ws: Optional[WebSocketConnection] = None
        
        try:
            # Perform WebSocket handshake
            path = await self._perform_handshake(reader, writer)
            if not path:
                writer.close()
                await writer.wait_closed()
                return
            
            # Create WebSocket connection
            ws = WebSocketConnection(reader, writer, path)
            self.connections.add(ws)
            
            # Start ping loop
            ping_task = asyncio.create_task(self._ping_loop(ws))
            self._ping_tasks[ws] = ping_task
            
            # Call connect handler
            if self._connect_handler:
                await self._connect_handler(ws)
            
            # Message loop
            while not ws.closed:
                frame = await ws.receive()
                if frame is None:
                    break
                
                # Handle different frame types
                if frame.opcode == OpCode.TEXT:
                    if self._message_handler:
                        message = frame.payload.decode('utf-8')
                        await self._message_handler(ws, message)
                
                elif frame.opcode == OpCode.BINARY:
                    if self._message_handler:
                        await self._message_handler(ws, frame.payload)
                
                elif frame.opcode == OpCode.PING:
                    await ws.send_pong(frame.payload)
                
                elif frame.opcode == OpCode.CLOSE:
                    await ws.close()
                    break
        
        except Exception as e:
            logger.error(f"Connection error: {e}")
        
        finally:
            # Clean up
            if ws:
                await self._remove_connection(ws)
    
    async def _remove_connection(self, ws: WebSocketConnection):
        """Remove and clean up a connection."""
        if ws in self.connections:
            self.connections.remove(ws)
        
        # Cancel ping task
        if ws in self._ping_tasks:
            self._ping_tasks[ws].cancel()
            del self._ping_tasks[ws]
        
        # Call disconnect handler
        if self._disconnect_handler:
            try:
                await self._disconnect_handler(ws)
            except Exception as e:
                logger.error(f"Disconnect handler error: {e}")
        
        # Close connection
        if not ws.closed:
            await ws.close()
    
    async def start(self, host: str = "127.0.0.1", port: int = 8080):
        """Start WebSocket server."""
        self._server = await asyncio.start_server(
            self._handle_connection,
            host,
            port
        )
        
        logger.info(f"✨ WebSocket server started on ws://{host}:{port}")
        logger.info(f"   Active connections: {len(self.connections)}")
        
        async with self._server:
            await self._server.serve_forever()
    
    async def stop(self):
        """Stop WebSocket server."""
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        
        # Close all connections
        for ws in list(self.connections):
            await ws.close()
        
        # Cancel all ping tasks
        for task in self._ping_tasks.values():
            task.cancel()
        
        self.connections.clear()
        self._ping_tasks.clear()
        
        logger.info("WebSocket server stopped")

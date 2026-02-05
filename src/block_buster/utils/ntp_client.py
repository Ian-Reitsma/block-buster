"""Simple SNTP/NTP client - ntplib replacement.

Provides basic NTP time synchronization using stdlib only.
No third-party dependencies - uses only Python stdlib (socket, struct, time).

For production NTP with full protocol support, use ntplib.
This module provides simple time queries for basic clock sync.
"""

import socket
import struct
import time
from dataclasses import dataclass
from typing import Optional


# NTP constants
NTP_PACKET_FORMAT = "!12I"  # 48 bytes
NTP_DELTA = 2208988800  # Seconds between 1900 and 1970
NTP_PORT = 123
DEFAULT_TIMEOUT = 5.0


class NTPException(Exception):
    """NTP operation failed."""
    pass


@dataclass
class NTPStats:
    """NTP response statistics."""
    tx_time: float  # Time request was sent
    recv_time: float  # Time response was received
    orig_time: float  # Client timestamp in request
    ref_time: float  # Server reference timestamp
    dest_time: float  # Server transmit timestamp
    offset: float  # Clock offset in seconds
    delay: float  # Round-trip delay in seconds
    
    @property
    def tx_timestamp(self) -> float:
        """Alias for tx_time."""
        return self.tx_time


class NTPClient:
    """Simple SNTP client for time synchronization.
    
    Example:
        client = NTPClient()
        response = client.request('pool.ntp.org')
        print(f"Offset: {response.offset:.3f}s")
        print(f"Current time: {time.time() + response.offset}")
    """
    
    def __init__(self, version: int = 3, timeout: float = DEFAULT_TIMEOUT):
        """Initialize NTP client.
        
        Args:
            version: NTP protocol version (default: 3)
            timeout: Socket timeout in seconds (default: 5.0)
        """
        self.version = version
        self.timeout = timeout
    
    def request(
        self,
        server: str,
        port: int = NTP_PORT,
        timeout: Optional[float] = None
    ) -> NTPStats:
        """Send NTP request and return statistics.
        
        Args:
            server: NTP server hostname or IP
            port: NTP server port (default: 123)
            timeout: Override default timeout
        
        Returns:
            NTPStats with offset and delay information
        
        Raises:
            NTPException: If request fails
        """
        timeout = timeout or self.timeout
        
        # Create NTP request packet
        # LI (2 bits) = 0, VN (3 bits) = version, Mode (3 bits) = 3 (client)
        li_vn_mode = (0 << 6) | (self.version << 3) | 3
        
        # Build packet: LI/VN/Mode + 47 zero bytes
        packet = bytearray(48)
        packet[0] = li_vn_mode
        
        # Set transmit timestamp (seconds since 1900)
        tx_time = time.time()
        ntp_tx_time = int(tx_time + NTP_DELTA)
        struct.pack_into("!I", packet, 40, ntp_tx_time)
        
        # Send request
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            
            try:
                sock.sendto(packet, (server, port))
                data, address = sock.recvfrom(1024)
                recv_time = time.time()
            finally:
                sock.close()
        except socket.timeout:
            raise NTPException(f"Request to {server} timed out")
        except socket.error as e:
            raise NTPException(f"Socket error: {e}")
        
        if len(data) < 48:
            raise NTPException(f"Invalid NTP response (too short: {len(data)} bytes)")
        
        # Parse response
        unpacked = struct.unpack(NTP_PACKET_FORMAT, data)
        
        # Extract timestamps (converting from NTP epoch to Unix epoch)
        ref_timestamp = unpacked[4] + unpacked[5] / 2**32 - NTP_DELTA
        orig_timestamp = unpacked[6] + unpacked[7] / 2**32 - NTP_DELTA
        recv_timestamp = unpacked[8] + unpacked[9] / 2**32 - NTP_DELTA
        tx_timestamp = unpacked[10] + unpacked[11] / 2**32 - NTP_DELTA
        
        # Calculate offset and delay
        # offset = ((recv_timestamp - orig_timestamp) + (tx_timestamp - recv_time)) / 2
        # delay = (recv_time - orig_timestamp) - (tx_timestamp - recv_timestamp)
        
        # Use simplified calculation
        offset = tx_timestamp - recv_time
        delay = (recv_time - tx_time)
        
        return NTPStats(
            tx_time=tx_time,
            recv_time=recv_time,
            orig_time=orig_timestamp,
            ref_time=ref_timestamp,
            dest_time=tx_timestamp,
            offset=offset,
            delay=delay,
        )


def get_ntp_time(
    server: str = "pool.ntp.org",
    timeout: float = DEFAULT_TIMEOUT
) -> float:
    """Get current time from NTP server.
    
    Args:
        server: NTP server hostname (default: pool.ntp.org)
        timeout: Request timeout in seconds
    
    Returns:
        Current Unix timestamp from NTP server
    
    Example:
        current_time = get_ntp_time()
        print(f"NTP time: {current_time}")
    """
    client = NTPClient(timeout=timeout)
    response = client.request(server)
    return time.time() + response.offset


def get_offset(
    server: str = "pool.ntp.org",
    timeout: float = DEFAULT_TIMEOUT
) -> float:
    """Get clock offset from NTP server.
    
    Args:
        server: NTP server hostname (default: pool.ntp.org)
        timeout: Request timeout in seconds
    
    Returns:
        Clock offset in seconds (positive = local clock is ahead)
    
    Example:
        offset = get_offset()
        corrected_time = time.time() + offset
    """
    client = NTPClient(timeout=timeout)
    response = client.request(server)
    return response.offset

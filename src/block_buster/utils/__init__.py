"""Block Buster utilities - all stdlib, zero third-party dependencies."""

from .config import BotConfig, parse_args
# First-party stdlib replacements (zero dependencies!)
from . import jwt  # PyJWT replacement
from . import config_parser  # pyyaml replacement  
from . import simple_proto  # protobuf replacement (simple cases)
from . import ntp_client  # ntplib replacement
from . import metrics  # prometheus-client replacement
from . import np  # numpy replacement (broader surface)
from . import rpc_client  # Simple JSON-RPC client

__all__ = [
    "BotConfig",
    "parse_args",
    # Stdlib replacements
    "jwt",
    "config_parser",
    "simple_proto",
    "ntp_client",
    "metrics",
    "np",
    "rpc_client",
]

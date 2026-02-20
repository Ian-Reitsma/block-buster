"""Configuration module for The Block RPC client.

Loads configuration from environment variables:
- TB_RPC_URL: The Block node RPC endpoint (default: http://localhost:8545)
- TB_CHAIN_MODE: Chain mode (localnet|testnet|mainnet, default: localnet)
- TB_RPC_AUTH_TOKEN: Bearer token for RPC authentication (optional)
- TB_TLS_CERT: Path to client TLS certificate (optional)
- TB_TLS_KEY: Path to client TLS key (optional)
- TB_RPC_TIMEOUT: RPC timeout in seconds (default: 30.0)
- TB_RPC_MAX_RETRIES: Maximum retry attempts (default: 3)
"""

from dataclasses import dataclass
import os
from typing import Optional


@dataclass
class TheBlockConfig:
    """Configuration for The Block RPC client."""

    rpc_url: str
    auth_token: Optional[str]
    chain_mode: str  # localnet | testnet | mainnet
    tls_cert_path: Optional[str]
    tls_key_path: Optional[str]
    timeout_seconds: float = 30.0
    max_retries: int = 3
    backoff_base: float = 2.0
    offline: bool = False


def load_config() -> TheBlockConfig:
    """Load configuration from environment variables.
    
    Returns:
        TheBlockConfig: Loaded configuration instance.
    """
    rpc_url = os.getenv("TB_RPC_URL", "http://localhost:8545")
    offline_env = os.getenv("TB_RPC_OFFLINE", "0") == "1"

    # Treat port 0 or explicit "offline" as a deliberate offline mode so we
    # don't spam connection-refused warnings when no node is running.
    offline = offline_env
    try:
        from urllib.parse import urlparse

        parsed = urlparse(rpc_url)
        if parsed.port == 0 or rpc_url.lower() in {"offline", "none"}:
            offline = True
    except Exception:
        # Fall back to env flag only if parsing fails
        pass

    max_retries = int(os.getenv("TB_RPC_MAX_RETRIES", "3"))
    backoff_base = 2.0
    if offline:
        max_retries = 0
        backoff_base = 0.0

    return TheBlockConfig(
        rpc_url=rpc_url,
        auth_token=os.getenv("TB_RPC_AUTH_TOKEN"),
        chain_mode=os.getenv("TB_CHAIN_MODE", "localnet"),
        tls_cert_path=os.getenv("TB_TLS_CERT"),
        tls_key_path=os.getenv("TB_TLS_KEY"),
        timeout_seconds=float(os.getenv("TB_RPC_TIMEOUT", "30.0")),
        max_retries=max_retries,
        backoff_base=backoff_base,
        offline=offline,
    )

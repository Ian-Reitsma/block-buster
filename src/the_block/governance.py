"""Governor gate enforcement and safety invariants.

Provides decorators and utilities to enforce governor gates before market operations.
Critical safety feature: prevents submissions to markets when gates are closed.
"""

import logging
from functools import wraps
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)


class GateViolationError(Exception):
    """Raised when attempting market operation with closed gate."""
    
    def __init__(self, market: str, gate_state: str, message: str):
        self.market = market
        self.gate_state = gate_state
        super().__init__(message)


def require_gate(market: str, allow_override: bool = False):
    """Decorator that enforces governor gate before allowing action.
    
    Args:
        market: Market name to check (e.g., "compute_market", "storage")
        allow_override: If True, check for unsafe_override_enabled flag
        
    Usage:
        @require_gate("compute_market")
        def submit_compute_job(...):
            # This only runs if compute_market gate is in Trade state
            ...
    
    The decorator expects the function to have access to a TheBlock client,
    either through:
    - Flask: g.the_block_client or current_app.config['THE_BLOCK_CLIENT']
    - Function argument: client parameter
    - Instance attribute: self.client
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Try to get client from various sources
            client = _get_client(args, kwargs)
            
            if client is None:
                raise RuntimeError(
                    f"Could not find TheBlock client for gate check. "
                    f"Function: {f.__name__}, Market: {market}"
                )
            
            # Check for unsafe override
            if allow_override and _check_unsafe_override(args, kwargs):
                logger.warning(
                    f"UNSAFE OVERRIDE: {market} gate check bypassed for {f.__name__}"
                )
                return f(*args, **kwargs)
            
            # Fetch governor status
            status = client.governor.get_status()
            gate = status.gates.get(market)
            
            if not gate:
                raise GateViolationError(
                    market,
                    "unknown",
                    f"Unknown market: {market}"
                )
            
            # Check if gate allows submissions
            if gate.state != 'Trade':
                logger.warning(
                    f"Gate refusal: {market} gate={gate.state} reason={gate.reason}"
                )
                raise GateViolationError(
                    market,
                    gate.state,
                    f"{market} is not accepting submissions (state: {gate.state})"
                )
            
            return f(*args, **kwargs)
        
        return wrapper
    return decorator


def _get_client(args: tuple, kwargs: dict) -> Optional[Any]:
    """Try to extract TheBlock client from various sources.
    
    Args:
        args: Function positional arguments
        kwargs: Function keyword arguments
        
    Returns:
        TheBlock client instance or None
    """
    # Try kwargs
    if 'client' in kwargs:
        return kwargs['client']
    
    # Try first arg (for methods: self.client)
    if args and hasattr(args[0], 'client'):
        return args[0].client
    
    return None


def _check_unsafe_override(args: tuple, kwargs: dict) -> bool:
    """Check if unsafe override is enabled (first-party only).

    Supported sources:
    - explicit kwarg: unsafe_override_enabled=True
    - instance attribute: self.unsafe_override_enabled
    """
    if kwargs.get("unsafe_override_enabled") is True:
        return True
    if args and getattr(args[0], "unsafe_override_enabled", False):
        return True
    return False


def check_gate_safe(client: Any, market: str) -> tuple[bool, Optional[str]]:
    """Check if a market gate is in safe state for submissions.
    
    Args:
        client: TheBlock client instance with governor namespace
        market: Market name to check
        
    Returns:
        Tuple of (is_safe, reason)
        - is_safe: True if gate is in Trade state
        - reason: None if safe, error message if not safe
    """
    try:
        status = client.governor.get_status()
        gate = status.gates.get(market)
        
        if not gate:
            return False, f"Unknown market: {market}"
        
        if gate.state != 'Trade':
            return False, f"Gate {market} is {gate.state}: {gate.reason or 'no reason given'}"
        
        return True, None
    
    except Exception as e:
        logger.error(f"Failed to check gate {market}: {e}", exc_info=True)
        return False, f"Gate check failed: {e}"


def get_all_gates_status(client: Any) -> dict[str, dict]:
    """Get status of all governor gates.
    
    Args:
        client: TheBlock client instance with governor namespace
        
    Returns:
        Dict mapping market names to gate info dicts
    """
    try:
        status = client.governor.get_status()
        return {
            name: {
                "state": gate.state,
                "reason": gate.reason,
                "last_transition_height": gate.last_transition_height,
                "safe": gate.state == 'Trade',
            }
            for name, gate in status.gates.items()
        }
    except Exception as e:
        logger.error(f"Failed to get gates status: {e}", exc_info=True)
        return {}

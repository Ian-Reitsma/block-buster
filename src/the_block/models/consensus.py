"""Consensus-related data models."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class BlockInfo:
    """Block information."""
    height: int
    hash: str
    parent_hash: str
    timestamp: int
    validator: Optional[str]
    transaction_count: int


@dataclass
class FinalityInfo:
    """Finality status information."""
    finalized_height: int
    finalized_hash: str
    current_height: int
    blocks_until_finality: int


@dataclass
class Stats:
    """Consensus statistics such as TPS and block times."""
    avg_block_time_ms: float
    tps: float

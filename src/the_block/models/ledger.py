"""Ledger-related data models."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Address:
    """Blockchain address."""
    address: str


@dataclass
class Balance:
    """Account balance response."""
    address: str
    balance: int  # Balance in smallest unit (e.g., BLOCK base unit)
    block_height: Optional[int] = None


@dataclass
class HistoryItem:
    """Transaction history item."""
    block_height: int
    transaction_id: str
    from_address: str
    to_address: str
    amount: int
    timestamp: Optional[int] = None
    transaction_type: Optional[str] = None

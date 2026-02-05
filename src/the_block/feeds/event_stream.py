"""Event stream abstractions for The Block.

Defines unified event types that the feature engine and strategy code can consume.
Events are derived from receipt audit stream, governor updates, and market activity.
"""

from dataclasses import dataclass, field
from typing import Literal, Union, Optional
from ..models.receipts import ReceiptAuditItem


@dataclass
class ReceiptEvent:
    """Event from receipt audit stream.
    
    Represents a consensus-validated receipt that has been included in a block.
    This is ground truth for all accounting and market activity.
    """
    type: Literal['receipt'] = field(default='receipt', init=False)
    receipt: ReceiptAuditItem
    block_height: int
    market: str  # "compute", "storage", "energy", "ad"
    amount: int  # BLOCK amount
    provider: str  # Provider identity
    
    @classmethod
    def from_audit_item(cls, item: ReceiptAuditItem) -> 'ReceiptEvent':
        """Create ReceiptEvent from ReceiptAuditItem.
        
        Args:
            item: Receipt audit item from receipt.audit RPC
            
        Returns:
            ReceiptEvent instance
        """
        # Infer market from receipt type
        market_map = {
            "Compute": "compute",
            "Storage": "storage",
            "Energy": "energy",
            "Ad": "ad",
        }
        market = market_map.get(item.receipt_type, "unknown")
        
        return cls(
            receipt=item,
            block_height=item.block_height,
            market=market,
            amount=item.amount,
            provider=item.provider_identity,
        )


@dataclass
class GateEvent:
    """Governor gate state change.
    
    Emitted when a market gate transitions between states (Closed, ObserveOnly, Trade).
    Critical for safety: strategy must check gates before submitting market actions.
    """
    type: Literal['gate'] = field(default='gate', init=False)
    market: str
    state: str  # "Closed", "ObserveOnly", "Trade"
    previous_state: str
    block_height: int
    reason: Optional[str] = None


@dataclass
class ComputeJobEvent:
    """Compute job status update.
    
    Tracks job lifecycle from submission through completion/failure.
    """
    type: Literal['compute_job'] = field(default='compute_job', init=False)
    job_id: str
    status: str  # "pending", "running", "completed", "failed"
    block_height: int
    compute_units: Optional[int] = None
    runtime_ms: Optional[int] = None
    error: Optional[str] = None


@dataclass
class LedgerEvent:
    """Balance change event.
    
    Tracks account balance changes for P&L tracking.
    """
    type: Literal['ledger'] = field(default='ledger', init=False)
    address: str
    delta: int  # Change in balance (can be negative)
    new_balance: int
    block_height: int
    transaction_type: Optional[str] = None  # "transfer", "payment", "reward", etc.


# Union type for all event types
TheBlockEvent = Union[ReceiptEvent, GateEvent, ComputeJobEvent, LedgerEvent]


def event_type_name(event: TheBlockEvent) -> str:
    """Get the string type name of an event.
    
    Args:
        event: Any TheBlockEvent instance
        
    Returns:
        Event type as string ("receipt", "gate", "compute_job", "ledger")
    """
    return event.type


def is_receipt_event(event: TheBlockEvent) -> bool:
    """Check if event is a ReceiptEvent."""
    return event.type == 'receipt'


def is_gate_event(event: TheBlockEvent) -> bool:
    """Check if event is a GateEvent."""
    return event.type == 'gate'


def is_compute_job_event(event: TheBlockEvent) -> bool:
    """Check if event is a ComputeJobEvent."""
    return event.type == 'compute_job'


def is_ledger_event(event: TheBlockEvent) -> bool:
    """Check if event is a LedgerEvent."""
    return event.type == 'ledger'

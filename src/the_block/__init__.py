"""The Block first-party client module.

This module provides typed interfaces to The Block L1 blockchain,
respecting the first-party everything architecture.

Quick Start:
    from the_block import TheBlockClient
    
    # Create client (uses environment config)
    client = TheBlockClient()
    
    # Check connection
    if client.health_check():
        print(f"Connected to The Block at height {client.consensus.block_height()}")
    
    # Query balance
    balance = client.ledger.get_balance("0x...")
    
    # Check gates
    gates = client.governor.get_status().gates

Receipt Polling:
    from the_block import TheBlockClient, ReceiptPoller, ReceiptPollerManager
    from pathlib import Path
    
    client = TheBlockClient()
    poller = ReceiptPoller(
        client.receipt,
        checkpoint_path=Path("./data/receipt_checkpoint.json")
    )
    
    def on_receipts(events):
        for event in events:
            print(f"Receipt: {event.market} {event.amount} BLOCK")
    
    poller.register_callback(on_receipts)
    
    # Run poller
    async with ReceiptPollerManager(poller) as p:
        await asyncio.sleep(60)  # Poll for 60 seconds
"""

from .config import TheBlockConfig, load_config
from .rpc_client import RPCClient, RPCError
from .client import TheBlockClient
from .governance import (
    require_gate,
    check_gate_safe,
    get_all_gates_status,
    GateViolationError,
)
from .feeds import (
    ReceiptPoller,
    ReceiptPollerManager,
    TheBlockEvent,
    ReceiptEvent,
    GateEvent,
    ComputeJobEvent,
    LedgerEvent,
)
from .features import TheBlockFeatureAdapter
from .integration import TheBlockIntegration
from .feature_bridge import TheBlockFeatureEngine, create_feature_engine
from .accounting import TheBlockAccountant, Transaction, TransactionType, MarketPosition
from .strategy import ValidatedStrategyExecutor, Operation, OperationType, OperationStatus

__version__ = "0.1.0"

__all__ = [
    # Core client
    "TheBlockClient",
    "TheBlockConfig",
    "load_config",
    
    # Low-level
    "RPCClient",
    "RPCError",
    
    # Governance
    "require_gate",
    "check_gate_safe",
    "get_all_gates_status",
    "GateViolationError",
    
    # Event feeds
    "ReceiptPoller",
    "ReceiptPollerManager",
    "TheBlockEvent",
    "ReceiptEvent",
    "GateEvent",
    "ComputeJobEvent",
    "LedgerEvent",
    
    # Feature engines
    "TheBlockFeatureAdapter",
    "TheBlockFeatureEngine",
    "create_feature_engine",
    "TheBlockIntegration",
    
    # Accounting
    "TheBlockAccountant",
    "Transaction",
    "TransactionType",
    "MarketPosition",
    
    # Strategy
    "ValidatedStrategyExecutor",
    "Operation",
    "OperationType",
    "OperationStatus",

    # Version
    "__version__",
]

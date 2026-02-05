"""P&L tracking and accounting layer for The Block.

Builds comprehensive accounting on top of receipt events following the
"receipts as ground truth" invariant. Tracks costs, revenues, positions,
and computes P&L across all markets.
"""

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from enum import Enum

from block_buster.utils import np, metrics
Counter = metrics.Counter
Gauge = metrics.Gauge
Histogram = metrics.Histogram

from .feeds.event_stream import ReceiptEvent

logger = logging.getLogger(__name__)

# Metrics
accounting_receipts_processed = Counter(
    "accounting_receipts_processed_total",
    "Total receipts processed by accounting layer",
    ["market", "direction"]
)
accounting_pnl_gauge = Gauge(
    "accounting_pnl_current",
    "Current P&L by market",
    ["market"]
)
accounting_position_value = Gauge(
    "accounting_position_value",
    "Current position value in BLOCK",
    ["market"]
)


class TransactionType(Enum):
    """Transaction type classification."""
    SPEND = "spend"        # We paid for service
    EARN = "earn"          # We earned providing service
    SUBSIDY = "subsidy"    # Protocol subsidy received
    FEE = "fee"            # Fee paid to protocol


@dataclass
class Transaction:
    """Single accounting transaction from receipt."""
    timestamp: int
    block_height: int
    receipt_type: str  # Compute, Storage, Energy, Ad
    transaction_type: TransactionType
    amount: int  # BLOCK tokens (negative for spend)
    market: str
    provider: str
    meta: Dict = field(default_factory=dict)
    
    @property
    def is_cost(self) -> bool:
        """Check if transaction is a cost."""
        return self.transaction_type in [TransactionType.SPEND, TransactionType.FEE]
    
    @property
    def is_revenue(self) -> bool:
        """Check if transaction is revenue."""
        return self.transaction_type in [TransactionType.EARN, TransactionType.SUBSIDY]


@dataclass
class MarketPosition:
    """Position tracking for a single market."""
    market: str
    total_spent: int = 0      # BLOCK spent
    total_earned: int = 0     # BLOCK earned
    units_consumed: int = 0   # Compute units, bytes, kwh, impressions
    units_provided: int = 0   # If we're a provider
    transaction_count: int = 0
    last_block_height: int = 0
    
    @property
    def net_pnl(self) -> int:
        """Net P&L in BLOCK tokens."""
        return self.total_earned - self.total_spent
    
    @property
    def avg_cost_per_unit(self) -> float:
        """Average cost per unit consumed."""
        if self.units_consumed == 0:
            return 0.0
        return self.total_spent / self.units_consumed
    
    @property
    def avg_revenue_per_unit(self) -> float:
        """Average revenue per unit provided."""
        if self.units_provided == 0:
            return 0.0
        return self.total_earned / self.units_provided


class TheBlockAccountant:
    """Comprehensive accounting layer for The Block operations.
    
    Maintains:
    - Transaction history from receipts
    - Per-market positions and P&L
    - Time-series P&L for charting
    - Cost basis and ROI calculations
    """
    
    def __init__(self, starting_balance: int = 0):
        """Initialize accountant.
        
        Args:
            starting_balance: Starting BLOCK balance
        """
        self.starting_balance = starting_balance
        self.current_balance = starting_balance
        
        # Transaction history
        self.transactions: List[Transaction] = []
        self.transactions_by_market: Dict[str, List[Transaction]] = defaultdict(list)
        
        # Position tracking
        self.positions: Dict[str, MarketPosition] = {
            "compute": MarketPosition(market="compute"),
            "storage": MarketPosition(market="storage"),
            "energy": MarketPosition(market="energy"),
            "ad": MarketPosition(market="ad"),
        }
        
        # P&L time series (for charting)
        self.pnl_history: deque = deque(maxlen=10000)
        
        # Performance metrics
        self.receipts_processed_count = 0
        self.last_update_time = time.time()
        
        logger.info(f"TheBlockAccountant initialized with balance {starting_balance} BLOCK")
    
    def process_receipts(self, events: List[ReceiptEvent]):
        """Process receipt events and update accounting.
        
        Args:
            events: List of ReceiptEvent from receipt poller
        """
        for event in events:
            try:
                self._process_receipt(event)
                self.receipts_processed_count += 1
            except Exception as e:
                logger.error(f"Failed to process receipt: {e}", exc_info=True)
        
        # Update metrics
        for market, position in self.positions.items():
            accounting_pnl_gauge.labels(market=market).set(position.net_pnl)
            accounting_position_value.labels(market=market).set(
                position.units_consumed * position.avg_cost_per_unit
            )
        
        # Record P&L snapshot
        if events:
            self.pnl_history.append({
                "timestamp": time.time(),
                "block_height": max(e.block_height for e in events),
                "balance": self.current_balance,
                "total_pnl": self.get_total_pnl(),
                "by_market": {m: p.net_pnl for m, p in self.positions.items()},
            })
    
    def _process_receipt(self, event: ReceiptEvent):
        """Process a single receipt event.
        
        Args:
            event: ReceiptEvent to process
        """
        receipt = event.receipt
        market = event.market
        
        # Determine if we're consumer or provider
        # (simplified - in real system would check wallet address)
        is_provider = False  # For now assume we're always consumer
        
        if market == "compute":
            self._process_compute_receipt(event, is_provider)
        elif market == "storage":
            self._process_storage_receipt(event, is_provider)
        elif market == "energy":
            self._process_energy_receipt(event, is_provider)
        elif market == "ad":
            self._process_ad_receipt(event, is_provider)
        
        # Update position
        position = self.positions[market]
        position.transaction_count += 1
        position.last_block_height = event.block_height
    
    def _process_compute_receipt(self, event: ReceiptEvent, is_provider: bool):
        """Process compute market receipt."""
        receipt_data = event.receipt.receipt
        compute_units = receipt_data.get("compute_units", 0)
        payment = event.amount
        
        if is_provider:
            # We provided compute and earned
            tx = Transaction(
                timestamp=int(time.time() * 1000),
                block_height=event.block_height,
                receipt_type="Compute",
                transaction_type=TransactionType.EARN,
                amount=payment,
                market="compute",
                provider=event.provider,
                metadata={"compute_units": compute_units},
            )
            self.positions["compute"].total_earned += payment
            self.positions["compute"].units_provided += compute_units
            self.current_balance += payment
        else:
            # We consumed compute and paid
            tx = Transaction(
                timestamp=int(time.time() * 1000),
                block_height=event.block_height,
                receipt_type="Compute",
                transaction_type=TransactionType.SPEND,
                amount=-payment,
                market="compute",
                provider=event.provider,
                metadata={"compute_units": compute_units},
            )
            self.positions["compute"].total_spent += payment
            self.positions["compute"].units_consumed += compute_units
            self.current_balance -= payment
        
        # Track subsidies
        subsidies = event.receipt.subsidies
        if subsidies.compute > 0:
            subsidy_tx = Transaction(
                timestamp=int(time.time() * 1000),
                block_height=event.block_height,
                receipt_type="Compute",
                transaction_type=TransactionType.SUBSIDY,
                amount=subsidies.compute,
                market="compute",
                provider="protocol",
                metadata={"subsidy_type": "compute"},
            )
            self.transactions.append(subsidy_tx)
            self.current_balance += subsidies.compute
        
        self.transactions.append(tx)
        self.transactions_by_market["compute"].append(tx)
        
        accounting_receipts_processed.labels(
            market="compute",
            direction="earn" if is_provider else "spend"
        ).inc()
    
    def _process_storage_receipt(self, event: ReceiptEvent, is_provider: bool):
        """Process storage market receipt."""
        receipt_data = event.receipt.receipt
        bytes_stored = receipt_data.get("bytes_stored", 0)
        cost = event.amount
        
        if is_provider:
            self.positions["storage"].total_earned += cost
            self.positions["storage"].units_provided += bytes_stored
            self.current_balance += cost
            direction = "earn"
            tx_type = TransactionType.EARN
            amount = cost
        else:
            self.positions["storage"].total_spent += cost
            self.positions["storage"].units_consumed += bytes_stored
            self.current_balance -= cost
            direction = "spend"
            tx_type = TransactionType.SPEND
            amount = -cost
        
        tx = Transaction(
            timestamp=int(time.time() * 1000),
            block_height=event.block_height,
            receipt_type="Storage",
            transaction_type=tx_type,
            amount=amount,
            market="storage",
            provider=event.provider,
            metadata={"bytes_stored": bytes_stored},
        )
        self.transactions.append(tx)
        self.transactions_by_market["storage"].append(tx)
        
        accounting_receipts_processed.labels(market="storage", direction=direction).inc()
    
    def _process_energy_receipt(self, event: ReceiptEvent, is_provider: bool):
        """Process energy market receipt."""
        receipt_data = event.receipt.receipt
        kwh_delivered = receipt_data.get("kwh_delivered", 0)
        cost = event.amount
        
        if is_provider:
            self.positions["energy"].total_earned += cost
            self.positions["energy"].units_provided += kwh_delivered
            self.current_balance += cost
            direction = "earn"
            tx_type = TransactionType.EARN
            amount = cost
        else:
            self.positions["energy"].total_spent += cost
            self.positions["energy"].units_consumed += kwh_delivered
            self.current_balance -= cost
            direction = "spend"
            tx_type = TransactionType.SPEND
            amount = -cost
        
        tx = Transaction(
            timestamp=int(time.time() * 1000),
            block_height=event.block_height,
            receipt_type="Energy",
            transaction_type=tx_type,
            amount=amount,
            market="energy",
            provider=event.provider,
            metadata={"kwh_delivered": kwh_delivered},
        )
        self.transactions.append(tx)
        self.transactions_by_market["energy"].append(tx)
        
        accounting_receipts_processed.labels(market="energy", direction=direction).inc()
    
    def _process_ad_receipt(self, event: ReceiptEvent, is_provider: bool):
        """Process ad market receipt."""
        receipt_data = event.receipt.receipt
        impressions = receipt_data.get("impressions", 0)
        spend = event.amount
        
        if is_provider:
            self.positions["ad"].total_earned += spend
            self.positions["ad"].units_provided += impressions
            self.current_balance += spend
            direction = "earn"
            tx_type = TransactionType.EARN
            amount = spend
        else:
            self.positions["ad"].total_spent += spend
            self.positions["ad"].units_consumed += impressions
            self.current_balance -= spend
            direction = "spend"
            tx_type = TransactionType.SPEND
            amount = -spend
        
        tx = Transaction(
            timestamp=int(time.time() * 1000),
            block_height=event.block_height,
            receipt_type="Ad",
            transaction_type=tx_type,
            amount=amount,
            market="ad",
            provider=event.provider,
            metadata={"impressions": impressions},
        )
        self.transactions.append(tx)
        self.transactions_by_market["ad"].append(tx)
        
        accounting_receipts_processed.labels(market="ad", direction=direction).inc()
    
    def get_total_pnl(self) -> int:
        """Get total P&L across all markets.
        
        Returns:
            Total P&L in BLOCK tokens
        """
        return sum(p.net_pnl for p in self.positions.values())
    
    def get_position(self, market: str) -> Optional[MarketPosition]:
        """Get position for specific market.
        
        Args:
            market: Market name
            
        Returns:
            MarketPosition or None
        """
        return self.positions.get(market)
    
    def get_pnl_series(self, start_time: Optional[float] = None, end_time: Optional[float] = None) -> List[Dict]:
        """Get P&L time series for charting.
        
        Args:
            start_time: Start timestamp (optional)
            end_time: End timestamp (optional)
            
        Returns:
            List of P&L snapshots
        """
        series = list(self.pnl_history)
        
        if start_time:
            series = [s for s in series if s["timestamp"] >= start_time]
        if end_time:
            series = [s for s in series if s["timestamp"] <= end_time]
        
        return series
    
    def get_summary(self) -> Dict:
        """Get comprehensive accounting summary.
        
        Returns:
            Dict with all accounting metrics
        """
        return {
            "balance": {
                "starting": self.starting_balance,
                "current": self.current_balance,
                "change": self.current_balance - self.starting_balance,
                "change_pct": ((self.current_balance - self.starting_balance) / max(self.starting_balance, 1)) * 100,
            },
            "pnl": {
                "total": self.get_total_pnl(),
                "by_market": {m: p.net_pnl for m, p in self.positions.items()},
            },
            "positions": {
                market: {
                    "spent": p.total_spent,
                    "earned": p.total_earned,
                    "net_pnl": p.net_pnl,
                    "units_consumed": p.units_consumed,
                    "units_provided": p.units_provided,
                    "avg_cost_per_unit": p.avg_cost_per_unit,
                    "avg_revenue_per_unit": p.avg_revenue_per_unit,
                    "transaction_count": p.transaction_count,
                }
                for market, p in self.positions.items()
            },
            "transactions": {
                "total": len(self.transactions),
                "by_market": {m: len(txs) for m, txs in self.transactions_by_market.items()},
            },
            "receipts_processed": self.receipts_processed_count,
        }
    
    def reset(self):
        """Reset all accounting state."""
        self.current_balance = self.starting_balance
        self.transactions.clear()
        self.transactions_by_market.clear()
        for position in self.positions.values():
            position.total_spent = 0
            position.total_earned = 0
            position.units_consumed = 0
            position.units_provided = 0
            position.transaction_count = 0
        self.pnl_history.clear()
        self.receipts_processed_count = 0
        logger.info("Accountant reset")

"""Strategy integration layer for The Block.

Provides validated trading operations using:
- Receipt stream for confirmation
- Governor gates for safety
- Feature engine for signals
- Accounting for P&L tracking
"""

import logging
import time
from typing import Optional, Dict, List, Callable
from dataclasses import dataclass
from enum import Enum

from .client import TheBlockClient
from .governance import check_gate_safe, GateViolationError
from .accounting import TheBlockAccountant
from .feature_bridge import TheBlockFeatureEngine

logger = logging.getLogger(__name__)


class OperationType(Enum):
    """Market operation types."""
    COMPUTE_JOB = "compute_job"
    STORAGE_PUT = "storage_put"
    STORAGE_GET = "storage_get"
    ENERGY_REGISTER = "energy_register"
    AD_BID = "ad_bid"


class OperationStatus(Enum):
    """Operation execution status."""
    PENDING = "pending"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass
class Operation:
    """Market operation with validation."""
    operation_id: str
    operation_type: OperationType
    market: str
    params: Dict
    status: OperationStatus
    submitted_at: Optional[float] = None
    confirmed_at: Optional[float] = None
    block_height: Optional[int] = None
    cost: Optional[int] = None
    error: Optional[str] = None


class ValidatedStrategyExecutor:
    """Execute strategy operations with validation and tracking.
    
    Ensures:
    - Gates are open before submission
    - Operations are tracked until receipt confirmation
    - P&L is updated from receipts
    - Features reflect actual market state
    """
    
    def __init__(
        self,
        client: TheBlockClient,
        accountant: TheBlockAccountant,
        feature_engine: Optional[TheBlockFeatureEngine] = None,
    ):
        """Initialize executor.
        
        Args:
            client: TheBlockClient for RPC calls
            accountant: TheBlockAccountant for P&L tracking
            feature_engine: Optional feature engine for signals
        """
        self.client = client
        self.accountant = accountant
        self.feature_engine = feature_engine
        
        # Operation tracking
        self.pending_operations: Dict[str, Operation] = {}
        self.confirmed_operations: Dict[str, Operation] = {}
        
        # Callbacks
        self.on_confirmed_callbacks: List[Callable[[Operation], None]] = []
        self.on_failed_callbacks: List[Callable[[Operation], None]] = []
        
        logger.info("ValidatedStrategyExecutor initialized")
    
    def submit_compute_job(self, job_params: Dict) -> Operation:
        """Submit compute job with validation.
        
        Args:
            job_params: Job parameters (model, data, compute_units, etc.)
            
        Returns:
            Operation tracking object
            
        Raises:
            GateViolationError: If compute market gate is closed
        """
        # Check gate
        safe, reason = check_gate_safe(self.client, "compute_market")
        if not safe:
            logger.warning(f"Compute job rejected: {reason}")
            op = Operation(
                operation_id=f"compute_{int(time.time()*1000)}",
                operation_type=OperationType.COMPUTE_JOB,
                market="compute",
                params=job_params,
                status=OperationStatus.REJECTED,
                error=reason,
            )
            self._trigger_failed_callbacks(op)
            return op
        
        # Check feature signals (optional)
        if self.feature_engine:
            features = self.feature_engine.snapshot()
            compute_util = features[0]  # Market utilization
            
            # Simple capacity check - don't submit if market is overloaded
            if compute_util > 2.0:  # More than 2 std deviations above mean
                logger.warning("Compute market overloaded, delaying submission")
                # Could queue for later retry
        
        # Check balance
        estimated_cost = job_params.get("estimated_cost", 100)
        if self.accountant.current_balance < estimated_cost:
            logger.error(f"Insufficient balance: need {estimated_cost}, have {self.accountant.current_balance}")
            op = Operation(
                operation_id=f"compute_{int(time.time()*1000)}",
                operation_type=OperationType.COMPUTE_JOB,
                market="compute",
                params=job_params,
                status=OperationStatus.REJECTED,
                error="Insufficient balance",
            )
            self._trigger_failed_callbacks(op)
            return op
        
        # Submit to network (placeholder - would call actual RPC)
        operation_id = f"compute_{int(time.time()*1000)}"
        logger.info(f"Submitting compute job {operation_id}: {job_params}")
        
        # In real implementation:
        # result = self.client.compute.submit_job(**job_params)
        # operation_id = result.job_id
        
        op = Operation(
            operation_id=operation_id,
            operation_type=OperationType.COMPUTE_JOB,
            market="compute",
            params=job_params,
            status=OperationStatus.SUBMITTED,
            submitted_at=time.time(),
        )
        
        self.pending_operations[operation_id] = op
        logger.info(f"Compute job {operation_id} submitted, awaiting receipt confirmation")
        
        return op
    
    def submit_storage_put(self, file_path: str, duration_epochs: int) -> Operation:
        """Submit storage operation with validation.
        
        Args:
            file_path: Path to file to store
            duration_epochs: Storage duration
            
        Returns:
            Operation tracking object
        """
        # Check gate
        safe, reason = check_gate_safe(self.client, "storage")
        if not safe:
            logger.warning(f"Storage operation rejected: {reason}")
            op = Operation(
                operation_id=f"storage_{int(time.time()*1000)}",
                operation_type=OperationType.STORAGE_PUT,
                market="storage",
                params={"file_path": file_path, "duration": duration_epochs},
                status=OperationStatus.REJECTED,
                error=reason,
            )
            self._trigger_failed_callbacks(op)
            return op
        
        # Submit (placeholder)
        operation_id = f"storage_{int(time.time()*1000)}"
        logger.info(f"Submitting storage operation {operation_id}")
        
        op = Operation(
            operation_id=operation_id,
            operation_type=OperationType.STORAGE_PUT,
            market="storage",
            params={"file_path": file_path, "duration": duration_epochs},
            status=OperationStatus.SUBMITTED,
            submitted_at=time.time(),
        )
        
        self.pending_operations[operation_id] = op
        return op
    
    def confirm_operation_from_receipt(self, operation_id: str, block_height: int, cost: int):
        """Confirm operation using receipt data.
        
        Args:
            operation_id: Operation ID to confirm
            block_height: Block height of confirmation
            cost: Actual cost from receipt
        """
        if operation_id not in self.pending_operations:
            logger.warning(f"Unknown operation confirmed: {operation_id}")
            return
        
        op = self.pending_operations.pop(operation_id)
        op.status = OperationStatus.CONFIRMED
        op.confirmed_at = time.time()
        op.block_height = block_height
        op.cost = cost
        
        self.confirmed_operations[operation_id] = op
        
        latency = op.confirmed_at - op.submitted_at if op.submitted_at else 0
        logger.info(
            f"Operation {operation_id} confirmed at height {block_height}, "
            f"cost {cost} BLOCK, latency {latency:.2f}s"
        )
        
        self._trigger_confirmed_callbacks(op)
    
    def fail_operation(self, operation_id: str, error: str):
        """Mark operation as failed.
        
        Args:
            operation_id: Operation ID
            error: Error message
        """
        if operation_id not in self.pending_operations:
            return
        
        op = self.pending_operations.pop(operation_id)
        op.status = OperationStatus.FAILED
        op.error = error
        
        logger.error(f"Operation {operation_id} failed: {error}")
        self._trigger_failed_callbacks(op)
    
    def register_confirmed_callback(self, callback: Callable[[Operation], None]):
        """Register callback for confirmed operations.
        
        Args:
            callback: Function called with confirmed Operation
        """
        self.on_confirmed_callbacks.append(callback)
    
    def register_failed_callback(self, callback: Callable[[Operation], None]):
        """Register callback for failed operations.
        
        Args:
            callback: Function called with failed Operation
        """
        self.on_failed_callbacks.append(callback)
    
    def _trigger_confirmed_callbacks(self, op: Operation):
        """Trigger all confirmed callbacks."""
        for callback in self.on_confirmed_callbacks:
            try:
                callback(op)
            except Exception as e:
                logger.error(f"Confirmed callback failed: {e}", exc_info=True)
    
    def _trigger_failed_callbacks(self, op: Operation):
        """Trigger all failed callbacks."""
        for callback in self.on_failed_callbacks:
            try:
                callback(op)
            except Exception as e:
                logger.error(f"Failed callback failed: {e}", exc_info=True)
    
    def get_pending_operations(self) -> List[Operation]:
        """Get all pending operations.
        
        Returns:
            List of pending operations
        """
        return list(self.pending_operations.values())
    
    def get_confirmed_operations(self, limit: int = 100) -> List[Operation]:
        """Get recent confirmed operations.
        
        Args:
            limit: Max number to return
            
        Returns:
            List of confirmed operations
        """
        ops = list(self.confirmed_operations.values())
        return sorted(ops, key=lambda o: o.confirmed_at or 0, reverse=True)[:limit]
    
    def get_metrics(self) -> Dict:
        """Get executor metrics.
        
        Returns:
            Dict with metrics
        """
        return {
            "pending_operations": len(self.pending_operations),
            "confirmed_operations": len(self.confirmed_operations),
            "operations_by_type": {
                op_type.value: sum(
                    1 for op in self.confirmed_operations.values()
                    if op.operation_type == op_type
                )
                for op_type in OperationType
            },
        }

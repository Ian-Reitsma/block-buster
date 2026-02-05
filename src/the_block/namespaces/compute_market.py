"""Compute market RPC namespace.

Handles: job submission, receipts, SLA history, queue statistics
Code: node/src/rpc/compute_market.rs
"""

from typing import Optional, Dict, Any
from ..rpc_client import RPCClient


class ComputeMarketNamespace:
    """Compute market RPC methods.
    
    Namespace: compute_market
    
    Methods:
    - submit_job: Submit a new compute job
    - status: Get job status  
    - job_cancel: Cancel a pending/running job
    - receipts: Query compute receipts
    - queue: Get queue statistics
    """
    
    def __init__(self, rpc: RPCClient):
        self._rpc = rpc
    
    def submit_job(self, job_request: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a compute job.
        
        Args:
            job_request: Job specification with:
                - code_hash: Hash of the code to execute
                - input_hash: Hash of the input data
                - compute_units_requested: Expected compute units
                - max_price: Maximum price per compute unit
                - priority: "normal", "priority", or "special"
        
        Returns:
            Dict with job_id and submission confirmation
        
        Example:
            job_id = client.compute_market.submit_job({
                "code_hash": "0xabc123...",
                "input_hash": "0xdef456...",
                "compute_units_requested": 1000000,
                "max_price": 50,
                "priority": "normal"
            })
        """
        return self._rpc.call("compute_market.submit_job", [job_request])
    
    def status(self, job_id: str) -> Dict[str, Any]:
        """Get job status.
        
        Args:
            job_id: Unique job identifier
            
        Returns:
            Dict with:
                - job_id: Job identifier
                - status: "queued", "running", "completed", "failed", "cancelled"
                - provider: Provider address (if assigned)
                - compute_units_consumed: Actual units consumed (if completed)
                - payment: BLOCK paid (if completed)
                - verified: Proof verification status (if completed)
                - block_height: Completion block height (if completed)
        """
        return self._rpc.call("compute_market.status", [job_id])
    
    def job_cancel(self, job_id: str) -> Dict[str, Any]:
        """Cancel a pending/running job.
        
        Args:
            job_id: Job to cancel
            
        Returns:
            Cancellation confirmation with status
        
        Note:
            Jobs can only be cancelled if they haven't started execution.
            Streaming method - may return multiple updates.
        """
        return self._rpc.call("compute_market.job_cancel", [job_id])
    
    def receipts(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Query compute receipts.
        
        Args:
            filters: Optional filters:
                - provider_id: Filter by provider
                - start_height: Start block height (inclusive)
                - end_height: End block height (inclusive)
                - limit: Max receipts to return (default 128, max 512)
                - page: Page number for pagination
        
        Returns:
            Dict with:
                - receipts: List of ComputeReceipt objects
                - truncated: True if more results available
                - next_page: Next page hint (if truncated)
        
        Example:
            results = client.compute_market.receipts({
                "start_height": 1000,
                "end_height": 2000,
                "provider_id": "provider-0x01",
                "limit": 100
            })
        """
        return self._rpc.call("compute_market.receipts", [filters or {}])
    
    def queue(self) -> Dict[str, Any]:
        """Get compute queue statistics.
        
        Returns:
            Dict with:
                - queue_depth: Total jobs queued
                - pending_jobs: Jobs by priority lane
                - provider_capacity: Available provider capacity
                - average_wait_time_ms: Average queue wait time
                - lane_stats: Statistics per fee lane
        
        Example:
            stats = client.compute_market.queue()
            print(f"Queued: {stats['queue_depth']} jobs")
        """
        return self._rpc.call("compute_market.queue", [])

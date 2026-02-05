"""Receipt namespace RPC methods."""

from typing import Optional
from ..rpc_client import RPCClient
from ..models.receipts import ReceiptAuditResponse, ReceiptAuditItem, Subsidies


class ReceiptNamespace:
    """Typed wrapper for receipt.* RPC methods."""
    
    def __init__(self, client: RPCClient):
        self.client = client
    
    def audit(
        self,
        start_height: Optional[int] = None,
        end_height: Optional[int] = None,
        limit: int = 128,
        provider_id: Optional[str] = None,
        market: Optional[str] = None
    ) -> ReceiptAuditResponse:
        """Query receipt audit trail.
        
        Replays the canonical chain of receipts (storage, compute, energy, ad, relay
        plus slashes) and emits deterministic audit records per receipt.
        
        Args:
            start_height: Starting block height, inclusive (optional)
            end_height: Ending block height, inclusive (optional)
            limit: Maximum receipts to return (default: 128, max: 512)
            provider_id: Filter by provider ID (trimmed, no case folding) (optional)
            market: Filter by market type, case-insensitive ("compute", "storage",
                    "energy", "ad") (optional)
        
        Returns:
            ReceiptAuditResponse with:
                - schema_version: Bumps on meaning changes (starts at 1)
                - receipts: Sorted by (block_height ASC, receipt_index ASC,
                           receipt_type ASC, digest_hex ASC)
                - scanned_range: {start, end} covering heights inspected
                - truncated: True if at least one additional matching receipt exists
                - next_start_height: Hint for next page when truncated=true
        
        Note:
            Filters are ANDed together. Results are deterministically ordered.
            Use next_start_height for pagination when truncated=true.
        
        Example:
            # Get all compute receipts from height 1000-2000
            response = client.receipt.audit(
                start_height=1000,
                end_height=2000,
                market="compute",
                limit=100
            )
            
            # Paginate if truncated
            while response.truncated:
                response = client.receipt.audit(
                    start_height=response.next_start_height,
                    end_height=2000,
                    market="compute",
                    limit=100
                )
        """
        params = {"limit": limit}
        if start_height is not None:
            params["start_height"] = start_height
        if end_height is not None:
            params["end_height"] = end_height
        if provider_id is not None:
            params["provider_id"] = provider_id
        if market is not None:
            params["market"] = market
        
        result = self.client.call("receipt.audit", params)
        
        receipts = [
            ReceiptAuditItem(
                block_height=item["block_height"],
                receipt_index=item["receipt_index"],
                receipt_type=item["receipt_type"],
                receipt=item["receipt"],
                digest_hex=item["digest_hex"],
                amount=item["amount"],
                audit_queries=item["audit_queries"],
                invariants=item["invariants"],
                causality=item["causality"],
                provider_identity=item["provider_identity"],
                subsidies=Subsidies(**item["subsidies"]),
                disputes=item["disputes"]
            )
            for item in result["receipts"]
        ]
        
        return ReceiptAuditResponse(
            schema_version=result.get("schema_version", 1),
            receipts=receipts,
            scanned_range=result.get("scanned_range", {"start": 0, "end": 0}),
            truncated=result.get("truncated", False),
            next_start_height=result.get("next_start_height")
        )

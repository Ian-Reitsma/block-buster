"""Ad market RPC namespace.

Handles: ad bidding, cohort queries, policy snapshots, conversion tracking
Code: node/src/rpc/ad_market.rs
"""

from typing import Dict, Any
from ..rpc_client import RPCClient


class AdMarketNamespace:
    """Ad market RPC methods.
    
    Namespace: ad_market
    
    The ad market enables privacy-preserving advertising with:
    - Campaign bidding and budget management
    - Impression tracking and settlement
    - Conversion attribution
    - Role-based payout splits (viewer, host, hardware, verifier, etc.)
    - Optional device-link attestations for deduplication
    """
    
    def __init__(self, rpc: RPCClient):
        self._rpc = rpc
    
    def submit_bid(self, bid: Dict[str, Any]) -> Dict[str, Any]:
        """Submit an ad bid.
        
        Args:
            bid: Bid specification with:
                - campaign_id: Campaign identifier
                - creative_id: Creative identifier
                - bid_price_per_impression: Bid price in BLOCK microunits
                - target_impressions: Target impression count
                - budget: Total budget in BLOCK
                - targeting: Optional targeting criteria
        
        Returns:
            Bid submission confirmation
        
        Example:
            result = client.ad_market.submit_bid({
                "campaign_id": "campaign_001",
                "creative_id": "creative_001",
                "bid_price_per_impression": 100,
                "target_impressions": 10000,
                "budget": 1000000
            })
        """
        return self._rpc.call("ad_market.submit_bid", [bid])
    
    def policy_snapshot(self) -> Dict[str, Any]:
        """Get current ad market policy snapshot.
        
        Returns:
            Dict with:
                - active_campaigns: List of active campaigns
                - pricing: Current pricing structure
                - policy: Market policy configuration
                - role_splits: Default role breakdown percentages
        
        Example:
            snapshot = client.ad_market.policy_snapshot()
            print(f"Active campaigns: {len(snapshot['active_campaigns'])}")
        """
        return self._rpc.call("ad_market.policy_snapshot", [])
    
    def record_conversion(self, conversion: Dict[str, Any]) -> Dict[str, Any]:
        """Record a conversion event.
        
        Args:
            conversion: Conversion details with:
                - campaign_id: Campaign identifier
                - creative_id: Creative identifier
                - conversion_type: Type of conversion ("click", "signup", "purchase")
                - value: Optional conversion value
                - device_hash: Optional device identifier for attribution
                - opt_in: Optional opt-in flag for device linking
        
        Returns:
            Conversion recording confirmation
        
        Note:
            Conversion events accumulate per (campaign_id, creative_id) and are
            drained into AdReceipt.conversions during block assembly.
            Device-link dedup is best-effort and only applies to opt-in payloads.
        
        Example:
            result = client.ad_market.record_conversion({
                "campaign_id": "campaign_001",
                "creative_id": "creative_001",
                "conversion_type": "purchase",
                "value": 5000,
                "device_hash": "hash_abc123",
                "opt_in": True
            })
        """
        return self._rpc.call("ad_market.record_conversion", [conversion])
    
    def receipts(self, filters: Dict[str, Any] = None) -> Dict[str, Any]:
        """Query ad receipts.
        
        Args:
            filters: Optional filters:
                - campaign_id: Filter by campaign
                - publisher: Filter by publisher address
                - start_height: Start block height
                - end_height: End block height
                - limit: Max receipts to return
        
        Returns:
            Paginated list of AdReceipt objects with:
                - campaign_id: Campaign identifier
                - creative_id: Creative identifier
                - publisher: Publisher address
                - impressions: Impressions delivered
                - spend: BLOCK spent by advertiser
                - conversions: Attributed conversions
                - role_breakdown: Optional payout splits
                - device_links: Optional device-link attestations
        """
        return self._rpc.call("ad_market.receipts", [filters or {}])

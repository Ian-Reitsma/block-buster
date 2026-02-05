"""Energy market RPC namespace.

Handles: provider registration, meter readings, settlement, disputes
Code: node/src/rpc/energy.rs
"""

from typing import Optional, Dict, Any
from ..rpc_client import RPCClient


class EnergyNamespace:
    """Energy market RPC methods.
    
    Namespace: energy
    
    The energy market enables real-world energy trading on-chain with:
    - Provider registration with capacity and jurisdiction
    - Oracle-signed meter readings
    - Credit minting and settlement
    - Dispute resolution
    - Slash tracking (quorum/expiry/conflict)
    """
    
    def __init__(self, rpc: RPCClient):
        self._rpc = rpc
    
    def register_provider(self, registration: Dict[str, Any]) -> Dict[str, Any]:
        """Register as an energy provider.
        
        Args:
            registration: Provider registration with:
                - capacity_kwh: Total capacity in kilowatt-hours (u64)
                - price_per_kwh: Price per kWh in BLOCK microunits (u64)
                - meter_address: Smart meter identifier (string)
                - jurisdiction: Jurisdiction code (e.g. "US_CA", "UK")
                - stake: BLOCK tokens to stake (u64)
                - owner: Account ID that owns this provider
        
        Returns:
            Provider registration confirmation with provider_id
        
        Example:
            provider = client.energy.register_provider({
                "capacity_kwh": 10000,
                "price_per_kwh": 100,
                "meter_address": "meter_00001",
                "jurisdiction": "US_MI",
                "stake": 10000000,
                "owner": "0xabc..."
            })
        """
        return self._rpc.call("energy.register_provider", [registration])
    
    def market_state(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Fetch snapshot of energy market state.
        
        Args:
            filters: Optional filters:
                - provider_id: Filter by specific provider
        
        Returns:
            Dict with:
                - status: "ok" or error
                - providers: List of registered providers
                - credits: List of outstanding meter credits
                - receipts: List of settlement receipts
                - disputes: List of active disputes
                - slashes: List of slash receipts
        
        Example:
            state = client.energy.market_state({"provider_id": "energy-0x01"})
        """
        return self._rpc.call("energy.market_state", [filters or {}])
    
    def submit_reading(self, reading: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a signed meter reading to mint a credit.
        
        Args:
            reading: MeterReadingPayload with:
                - provider_id: Energy provider identifier
                - meter_address: Meter identifier
                - kwh_reading: Cumulative kWh reading (u64)
                - timestamp: Unix timestamp
                - signature: Hex-encoded ed25519/schnorr signature
        
        Returns:
            Credit minting confirmation
        
        Example:
            result = client.energy.submit_reading({
                "provider_id": "energy-0x00",
                "meter_address": "meter_00001",
                "kwh_reading": 12000,
                "timestamp": 1710000000,
                "signature": "0xabc123..."
            })
        
        Note:
            Reading must be signed by trusted oracle keys configured in
            config/default.toml under energy.provider_keys.
        """
        return self._rpc.call("energy.submit_reading", [reading])
    
    def settle(self, settlement: Dict[str, Any]) -> Dict[str, Any]:
        """Burn credit + capacity to settle kWh and produce EnergyReceipt.
        
        Args:
            settlement: Settlement request with:
                - provider_id: Energy provider (e.g. "energy-0x01")
                - buyer: Optional buyer account ID
                - kwh_consumed: kWh to settle (u64)
                - meter_hash: Meter reading hash for verification
        
        Returns:
            EnergyReceipt with:
                - meter_id: Meter identifier
                - provider: Provider address
                - kwh_delivered: Energy delivered in mWh
                - cost: BLOCK paid
                - block_height: Settlement block
                - oracle_signature: Oracle attestation
        
        Example:
            receipt = client.energy.settle({
                "provider_id": "energy-0x01",
                "buyer": "0xabc...",
                "kwh_consumed": 50,
                "meter_hash": "0xe3c3..."
            })
        """
        return self._rpc.call("energy.settle", [settlement])
    
    def receipts(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Query paginated settlement history.
        
        Args:
            filters: Optional filters:
                - provider_id: Filter by provider (e.g. "energy-0x00")
                - page: Page number (u64, default 0)
                - page_size: Results per page (u64, default 50)
        
        Returns:
            Paginated list of EnergyReceipt objects
        """
        return self._rpc.call("energy.receipts", [filters or {}])
    
    def credits(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Query paginated meter-credit listing.
        
        Args:
            filters: Optional filters:
                - provider_id: Filter by provider
                - page: Page number
                - page_size: Results per page
        
        Returns:
            Paginated list of meter credits
        """
        return self._rpc.call("energy.credits", [filters or {}])
    
    def disputes(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Query paginated dispute log.
        
        Args:
            filters: Optional filters:
                - provider_id: Filter by provider
                - status: Filter by status ("open", "resolved")
                - meter_hash: Filter by meter hash
                - page: Page number
                - page_size: Results per page
        
        Returns:
            Paginated list of dispute records with:
                - id: Dispute ID
                - meter_hash: Meter reading hash
                - provider_id: Provider identifier
                - status: "open" or "resolved"
                - reason: Dispute reason
                - opened_at: Timestamp
                - resolved_at: Timestamp (if resolved)
                - resolution_note: Notes (if resolved)
        """
        return self._rpc.call("energy.disputes", [filters or {}])
    
    def flag_dispute(self, dispute: Dict[str, Any]) -> Dict[str, Any]:
        """Open a dispute tied to a meter_hash.
        
        Args:
            dispute: Dispute details with:
                - meter_hash: Meter reading hash to dispute
                - reason: Human-readable dispute reason
                - reporter: Optional reporter account
        
        Returns:
            Dispute creation confirmation with dispute_id
        """
        return self._rpc.call("energy.flag_dispute", [dispute])
    
    def resolve_dispute(self, resolution: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve an existing dispute.
        
        Args:
            resolution: Resolution details with:
                - dispute_id: Dispute to resolve (u64)
                - resolver: Optional resolver account
                - resolution_note: Optional resolution notes
        
        Returns:
            Dispute resolution confirmation
        """
        return self._rpc.call("energy.resolve_dispute", [resolution])
    
    def slashes(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Retrieve ledger of slash receipts.
        
        Args:
            filters: Optional filters:
                - provider_id: Filter by provider
                - page: Page number
                - page_size: Results per page
        
        Returns:
            Paginated list of slash receipts with:
                - provider_id: Slashed provider
                - meter_hash: Related meter hash
                - reason: "quorum", "expiry", or "conflict"
                - amount: Slash amount
                - block_height: Block where slash occurred
        
        Note:
            Slash reasons:
            - quorum: Insufficient oracle quorum
            - expiry: Reading expired before settlement
            - conflict: Conflicting readings detected
        """
        return self._rpc.call("energy.slashes", [filters or {}])

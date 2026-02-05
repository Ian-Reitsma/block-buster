"""Receipt data models for The Block audit trail."""

from dataclasses import dataclass
from typing import Optional, Dict, List, Union


@dataclass
class BlockTorchReceiptMetadata:
    """BlockTorch compute verification metadata.
    
    Captures provenance for ML compute jobs:
    - kernel_variant_digest: SHA256 over metal/CUDA artifacts
    - benchmark_commit: Path to benchmarks.json commit
    - tensor_profile_epoch: Orchard tensor profile log epoch
    - proof_latency_ms: SNARK prover latency measurement
    """
    kernel_variant_digest: str  # [u8; 32] as hex
    benchmark_commit: Optional[str]
    tensor_profile_epoch: Optional[str]
    proof_latency_ms: int


# Backwards-compatibility alias
BlockTorchMetadata = BlockTorchReceiptMetadata


@dataclass
class StorageReceipt:
    """Storage operation receipt."""
    file_id: str
    provider: str
    bytes_stored: int
    cost: int  # BLOCK paid to provider
    block_height: int
    duration_epochs: int


@dataclass
class ComputeReceipt:
    """Compute job completion receipt.
    
    Tracks computation jobs with BlockTorch provenance.
    """
    job_id: str
    provider: str
    compute_units: int
    payment: int  # BLOCK paid to provider
    block_height: int
    verified: bool
    blocktorch: Optional[BlockTorchReceiptMetadata]
    provider_signature: str  # hex-encoded
    signature_nonce: int


@dataclass
class EnergyReceipt:
    """Energy delivery receipt."""
    meter_id: str
    provider: str
    kwh_delivered: int  # milliwatt-hours
    cost: int  # BLOCK paid
    block_height: int
    oracle_signature: str  # hex


@dataclass
class AdRoleBreakdown:
    """Ad impression payment breakdown by role."""
    viewer: int
    host: int
    hardware: int
    verifier: int
    liquidity: int
    miner: int
    price_usd_micros: int
    clearing_price_usd_micros: int


@dataclass
class DeviceLinkOptIn:
    """Device linking opt-in status."""
    device_hash: str
    opt_in: bool


@dataclass
class AdReceipt:
    """Ad impression receipt."""
    campaign_id: str
    creative_id: str
    publisher: str
    impressions: int
    spend: int  # BLOCK spent by advertiser
    block_height: int
    conversions: int
    claim_routes: Dict[str, str]  # role -> address overrides
    role_breakdown: Optional[AdRoleBreakdown]
    device_links: List[DeviceLinkOptIn]
    publisher_signature: str  # hex
    signature_nonce: int


# Union type for all receipt types
Receipt = Union[StorageReceipt, ComputeReceipt, EnergyReceipt, AdReceipt]


@dataclass
class Subsidies:
    """Subsidy breakdown for a receipt."""
    storage: int
    read: int
    compute: int
    ad: int
    rebate: int


@dataclass
class ReceiptAuditItem:
    """Single receipt audit entry from receipt.audit RPC."""
    block_height: int
    receipt_index: int
    receipt_type: str  # "Compute" | "Storage" | "Energy" | "Ad"
    receipt: Dict  # Raw receipt data
    digest_hex: str
    amount: int
    audit_queries: int
    invariants: List[str]
    causality: List[str]
    provider_identity: str
    subsidies: Subsidies
    disputes: List[Dict]


@dataclass
class ReceiptAuditResponse:
    """Response from receipt.audit RPC call."""
    schema_version: int
    receipts: List[ReceiptAuditItem]
    scanned_range: Dict[str, int]  # {"start": int, "end": int}
    truncated: bool
    next_start_height: Optional[int]

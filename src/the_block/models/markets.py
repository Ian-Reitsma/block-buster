"""Market operation models for The Block."""

from dataclasses import dataclass
from typing import Optional, List, Dict


@dataclass
class ComputeJob:
    """Compute job submission."""
    job_id: str
    submitter: str
    compute_units_requested: int
    max_price: int
    code_hash: str
    input_hash: str
    priority: str  # "normal", "priority", "special"
    submitted_height: int


@dataclass
class ComputeJobStatus:
    """Status of a compute job."""
    job_id: str
    status: str  # "queued", "running", "completed", "failed", "cancelled"
    provider: Optional[str]
    compute_units_consumed: Optional[int]
    payment: Optional[int]
    verified: Optional[bool]
    block_height: Optional[int]
    error: Optional[str]


@dataclass
class StorageContract:
    """Storage contract details."""
    contract_id: str
    file_id: str
    provider: str
    bytes_stored: int
    duration_epochs: int
    cost_per_epoch: int
    created_height: int
    expiry_height: int


@dataclass
class EnergyProvider:
    """Energy provider registration."""
    provider_id: str
    capacity_kwh: int
    price_per_kwh: int
    meter_address: str
    jurisdiction: str
    stake: int
    owner: str
    registered_height: int


@dataclass
class MeterReading:
    """Energy meter reading."""
    provider_id: str
    meter_address: str
    kwh_reading: int
    timestamp: int
    signature: str  # hex-encoded


@dataclass
class AdCampaign:
    """Ad campaign details."""
    campaign_id: str
    advertiser: str
    budget: int
    bid_price_per_impression: int
    target_impressions: int
    impressions_delivered: int
    spend: int
    active: bool
    created_height: int

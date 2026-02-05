"""Governor and gate-related data models."""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class GateState:
    """Market gate state snapshot."""
    name: str
    state: str  # "inactive" | "active" | "rehearsal" | "trade"
    reason: Optional[str] = None
    last_transition_height: Optional[int] = None
    enter_streak: Optional[int] = None
    exit_streak: Optional[int] = None
    streak_required: Optional[int] = None
    last_metrics: Optional[dict] = None


@dataclass
class EconomicsMetric:
    """Economics metrics for a market."""
    market: str
    utilization_ppm: int  # Parts per million
    provider_margin_ppm: int  # Parts per million
    block_height: int


@dataclass
class GovernorStatus:
    """Complete governor status response."""
    gates: Dict[str, GateState]  # market_name -> GateState
    economics_metrics: List[EconomicsMetric]
    decisions: List[Dict]  # Governor decision history
    block_height: int

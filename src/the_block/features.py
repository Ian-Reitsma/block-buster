"""Feature engine adapter for The Block.

Bridges The Block receipt events to the ML feature pipeline.
Translates ReceiptEvents into feature vector updates following the spec in features_theblock.yaml.
"""

import logging
import time
from collections import defaultdict, deque
from typing import Dict, List, Optional, Set

from block_buster.utils import np, metrics
Counter = metrics.Counter
Gauge = metrics.Gauge
Histogram = metrics.Histogram

from .feeds.event_stream import ReceiptEvent, TheBlockEvent
from .models.governor import GovernorStatus

logger = logging.getLogger(__name__)

# Metrics
receipts_processed = Counter(
    "theblock_receipts_processed_total",
    "Total receipts processed by feature adapter",
    ["market"]
)
feature_update_latency = Histogram(
    "theblock_feature_update_seconds",
    "Time to update features from receipt"
)
feature_dimension_gauge = Gauge(
    "theblock_feature_dimensions",
    "Number of active feature dimensions"
)

# Feature indices from features_theblock.yaml
IDX_COMPUTE_UTIL = 0
IDX_STORAGE_UTIL = 1
IDX_ENERGY_UTIL = 2
IDX_AD_UTIL = 3
IDX_COMPUTE_MARGIN = 4
IDX_STORAGE_MARGIN = 5
IDX_RECEIPT_VELOCITY = 6
IDX_JOB_SUCCESS_RATE = 7
IDX_GATE_COMPUTE = 8
IDX_GATE_STORAGE = 9
IDX_COMPUTE_VOLUME = 10
IDX_STORAGE_VOLUME = 11
IDX_ENERGY_VOLUME = 12
IDX_AD_IMPRESSIONS = 13
IDX_COMPUTE_SPEND = 14
IDX_STORAGE_SPEND = 15
IDX_ENERGY_SPEND = 16
IDX_AD_SPEND = 17
IDX_UNIQUE_PROVIDERS = 18
IDX_PROVIDER_CONCENTRATION = 19

BASE_DIM = 20  # Number of defined features
TOTAL_DIM = 256  # Total dimension with padding
LAM = 0.995  # Decay factor for exponential moving average
EPS = 1e-8  # Small epsilon for numerical stability


class TheBlockFeatureAdapter:
    """Adapter that converts The Block receipts into feature vector updates.
    
    Maintains running statistics and feeds into existing feature engine infrastructure.
    Designed to be registered as a callback to ReceiptPoller.
    """
    
    def __init__(self, feature_engine=None):
        """Initialize feature adapter.
        
        Args:
            feature_engine: Optional PyFeatureEngine instance to update.
                           If None, maintains own feature state.
        """
        self.feature_engine = feature_engine
        
        # Feature state (if no external engine provided)
        self.features = np.zeros(BASE_DIM, dtype=np.float32)
        self.mean = np.zeros(BASE_DIM, dtype=np.float32)
        self.var = np.full(BASE_DIM, 1e-4, dtype=np.float32)
        
        # Market activity tracking
        self.compute_units_total = 0
        self.storage_bytes_total = 0
        self.energy_kwh_total = 0
        self.ad_impressions_total = 0
        
        self.compute_spend_total = 0
        self.storage_spend_total = 0
        self.energy_spend_total = 0
        self.ad_spend_total = 0
        
        self.compute_jobs_verified = 0
        self.compute_jobs_total = 0
        
        # Receipt velocity tracking (EMA)
        self.receipt_count_window = deque(maxlen=100)  # Last 100 blocks
        self.last_block_height = 0
        
        # Provider diversity tracking
        self.provider_volumes: Dict[str, int] = defaultdict(int)
        self.recent_providers: Set[str] = set()
        self.provider_window = deque(maxlen=1000)  # Track recent provider activity
        
        # Gate state cache
        self.gate_compute_open = 0.0
        self.gate_storage_open = 0.0
        
        # Metrics
        self.receipts_processed_count = 0
        self.last_update_time = time.time()
    
    def process_receipts(self, events: List[ReceiptEvent]):
        """Process a batch of receipt events.
        
        This is the callback registered with ReceiptPoller.
        
        Args:
            events: List of ReceiptEvent instances
        """
        start = time.time()
        
        for event in events:
            try:
                self._process_single_receipt(event)
                receipts_processed.labels(market=event.market).inc()
                self.receipts_processed_count += 1
            except Exception as e:
                logger.error(f"Failed to process receipt: {e}", exc_info=True)
        
        # Update feature vector
        self._compute_features()
        
        feature_update_latency.observe(time.time() - start)
        feature_dimension_gauge.set(BASE_DIM)
        self.last_update_time = time.time()
        
        if self.receipts_processed_count % 100 == 0:
            logger.info(
                f"Processed {self.receipts_processed_count} receipts, "
                f"current block height: {self.last_block_height}"
            )
    
    def _process_single_receipt(self, event: ReceiptEvent):
        """Process a single receipt event.
        
        Args:
            event: ReceiptEvent to process
        """
        receipt = event.receipt
        market = event.market
        
        # Update block height for velocity calculation
        if event.block_height > self.last_block_height:
            if self.last_block_height > 0:
                blocks_elapsed = event.block_height - self.last_block_height
                self.receipt_count_window.append(
                    (event.block_height, len(self.receipt_count_window))
                )
            self.last_block_height = event.block_height
        
        # Track provider activity
        self.recent_providers.add(event.provider)
        self.provider_window.append((event.provider, event.amount))
        self.provider_volumes[event.provider] += event.amount
        
        # Process by market type
        if market == "compute":
            self._process_compute_receipt(receipt)
        elif market == "storage":
            self._process_storage_receipt(receipt)
        elif market == "energy":
            self._process_energy_receipt(receipt)
        elif market == "ad":
            self._process_ad_receipt(receipt)
    
    def _process_compute_receipt(self, receipt):
        """Process compute receipt."""
        compute_units = receipt.receipt.get("compute_units", 0)
        payment = receipt.receipt.get("payment", 0)
        verified = receipt.receipt.get("verified", False)
        
        self.compute_units_total += compute_units
        self.compute_spend_total += payment
        self.compute_jobs_total += 1
        if verified:
            self.compute_jobs_verified += 1
    
    def _process_storage_receipt(self, receipt):
        """Process storage receipt."""
        bytes_stored = receipt.receipt.get("bytes_stored", 0)
        cost = receipt.receipt.get("cost", 0)
        
        self.storage_bytes_total += bytes_stored
        self.storage_spend_total += cost
    
    def _process_energy_receipt(self, receipt):
        """Process energy receipt."""
        kwh_delivered = receipt.receipt.get("kwh_delivered", 0)
        cost = receipt.receipt.get("cost", 0)
        
        self.energy_kwh_total += kwh_delivered
        self.energy_spend_total += cost
    
    def _process_ad_receipt(self, receipt):
        """Process ad receipt."""
        impressions = receipt.receipt.get("impressions", 0)
        spend = receipt.receipt.get("spend", 0)
        
        self.ad_impressions_total += impressions
        self.ad_spend_total += spend
    
    def _compute_features(self):
        """Compute feature vector from accumulated state."""
        # Market utilization (placeholder - would need capacity info from governor)
        self.features[IDX_COMPUTE_UTIL] = self._normalize(self.compute_units_total, IDX_COMPUTE_UTIL)
        self.features[IDX_STORAGE_UTIL] = self._normalize(self.storage_bytes_total, IDX_STORAGE_UTIL)
        self.features[IDX_ENERGY_UTIL] = self._normalize(self.energy_kwh_total, IDX_ENERGY_UTIL)
        self.features[IDX_AD_UTIL] = self._normalize(self.ad_impressions_total, IDX_AD_UTIL)
        
        # Economics margins (placeholder - would compute from payments vs costs)
        compute_margin = self.compute_spend_total / max(self.compute_units_total, 1)
        storage_margin = self.storage_spend_total / max(self.storage_bytes_total, 1)
        self.features[IDX_COMPUTE_MARGIN] = self._normalize(compute_margin, IDX_COMPUTE_MARGIN)
        self.features[IDX_STORAGE_MARGIN] = self._normalize(storage_margin, IDX_STORAGE_MARGIN)
        
        # Activity velocity
        velocity = len(self.receipt_count_window) / 100.0 if self.receipt_count_window else 0.0
        self.features[IDX_RECEIPT_VELOCITY] = self._normalize(velocity, IDX_RECEIPT_VELOCITY)
        
        # Quality metrics
        success_rate = self.compute_jobs_verified / max(self.compute_jobs_total, 1)
        self.features[IDX_JOB_SUCCESS_RATE] = success_rate  # Already 0-1, no normalization
        
        # Gate states (raw binary)
        self.features[IDX_GATE_COMPUTE] = self.gate_compute_open
        self.features[IDX_GATE_STORAGE] = self.gate_storage_open
        
        # Volume metrics
        self.features[IDX_COMPUTE_VOLUME] = self._normalize(self.compute_units_total, IDX_COMPUTE_VOLUME)
        self.features[IDX_STORAGE_VOLUME] = self._normalize(self.storage_bytes_total, IDX_STORAGE_VOLUME)
        self.features[IDX_ENERGY_VOLUME] = self._normalize(self.energy_kwh_total, IDX_ENERGY_VOLUME)
        self.features[IDX_AD_IMPRESSIONS] = self._normalize(self.ad_impressions_total, IDX_AD_IMPRESSIONS)
        
        # Payment flows
        self.features[IDX_COMPUTE_SPEND] = self._normalize(self.compute_spend_total, IDX_COMPUTE_SPEND)
        self.features[IDX_STORAGE_SPEND] = self._normalize(self.storage_spend_total, IDX_STORAGE_SPEND)
        self.features[IDX_ENERGY_SPEND] = self._normalize(self.energy_spend_total, IDX_ENERGY_SPEND)
        self.features[IDX_AD_SPEND] = self._normalize(self.ad_spend_total, IDX_AD_SPEND)
        
        # Provider diversity
        unique_count = len(self.recent_providers)
        self.features[IDX_UNIQUE_PROVIDERS] = self._normalize(unique_count, IDX_UNIQUE_PROVIDERS)
        
        # Herfindahl index (sum of squared market shares)
        total_volume = sum(self.provider_volumes.values())
        if total_volume > 0:
            hhi = sum((v / total_volume) ** 2 for v in self.provider_volumes.values())
        else:
            hhi = 0.0
        self.features[IDX_PROVIDER_CONCENTRATION] = self._normalize(hhi, IDX_PROVIDER_CONCENTRATION)
    
    def _normalize(self, value: float, index: int) -> float:
        """Apply online z-score normalization with exponential decay.
        
        Args:
            value: Raw feature value
            index: Feature index
            
        Returns:
            Normalized value
        """
        # Update running statistics
        mu_prev = self.mean[index]
        var_prev = self.var[index]
        
        mu = LAM * mu_prev + (1 - LAM) * value
        var = LAM * (var_prev + (1 - LAM) * (value - mu_prev) ** 2)
        
        self.mean[index] = mu
        self.var[index] = var
        
        # Return z-score
        return (value - mu) / np.sqrt(var + EPS)
    
    def update_governor_state(self, status: GovernorStatus):
        """Update gate states from governor status.
        
        Args:
            status: GovernorStatus from governor.get_status()
        """
        compute_gate = status.gates.get("compute_market", None)
        storage_gate = status.gates.get("storage", None)
        
        self.gate_compute_open = 1.0 if (compute_gate and compute_gate.state == "Trade") else 0.0
        self.gate_storage_open = 1.0 if (storage_gate and storage_gate.state == "Trade") else 0.0
        
        logger.debug(
            f"Updated gate states: compute={self.gate_compute_open}, "
            f"storage={self.gate_storage_open}"
        )
    
    def get_features(self) -> np.ndarray:
        """Get current feature vector.
        
        Returns:
            numpy array of shape (TOTAL_DIM,) with features and padding
        """
        out = np.zeros(TOTAL_DIM, dtype=np.float32)
        out[:BASE_DIM] = self.features
        return out
    
    def get_metrics(self) -> dict:
        """Get adapter metrics.
        
        Returns:
            Dict with current state and statistics
        """
        return {
            "receipts_processed": self.receipts_processed_count,
            "last_block_height": self.last_block_height,
            "compute_units_total": self.compute_units_total,
            "storage_bytes_total": self.storage_bytes_total,
            "energy_kwh_total": self.energy_kwh_total,
            "ad_impressions_total": self.ad_impressions_total,
            "unique_providers": len(self.recent_providers),
            "compute_success_rate": self.compute_jobs_verified / max(self.compute_jobs_total, 1),
            "gate_compute_open": self.gate_compute_open,
            "gate_storage_open": self.gate_storage_open,
            "lag_seconds": time.time() - self.last_update_time if self.last_update_time else None,
        }
    
    def reset(self):
        """Reset all state."""
        self.features.fill(0.0)
        self.mean.fill(0.0)
        self.var.fill(1e-4)
        
        self.compute_units_total = 0
        self.storage_bytes_total = 0
        self.energy_kwh_total = 0
        self.ad_impressions_total = 0
        
        self.compute_spend_total = 0
        self.storage_spend_total = 0
        self.energy_spend_total = 0
        self.ad_spend_total = 0
        
        self.compute_jobs_verified = 0
        self.compute_jobs_total = 0
        
        self.receipt_count_window.clear()
        self.provider_volumes.clear()
        self.recent_providers.clear()
        self.provider_window.clear()
        
        self.receipts_processed_count = 0
        logger.info("Feature adapter reset")

"""Feature bridge for The Block receipts (Solana path removed).

Provides a single `TheBlockFeatureEngine` plus a helper `create_feature_engine`
that always returns the first-party engine.
"""

from __future__ import annotations

import logging
from typing import List

from block_buster.utils import np

from block_buster.engine._types import FeatureVector
from .feeds.event_stream import ReceiptEvent
from .features import TheBlockFeatureAdapter

logger = logging.getLogger(__name__)


class TheBlockFeatureEngine:
    """Feature engine dedicated to The Block receipts."""

    def __init__(self):
        self.adapter = TheBlockFeatureAdapter()
        self.last_height: int | None = None
        logger.info("TheBlockFeatureEngine initialized (The Block only)")

    def update(self, events: List[ReceiptEvent], block_height: int) -> FeatureVector:
        """Update with receipt events and return snapshot."""
        self.adapter.process_receipts(events)
        self.last_height = block_height
        return self.snapshot()

    def snapshot(self) -> FeatureVector:
        features = self.adapter.get_features()
        return FeatureVector(np.array(features, copy=True))

    def reset(self):
        self.adapter.reset()
        self.last_height = None
        logger.info("TheBlockFeatureEngine reset")

    def get_metrics(self) -> dict:
        return self.adapter.get_metrics()


def create_feature_engine(mode: str = "theblock") -> TheBlockFeatureEngine:
    """Factory kept for API compatibility; mode is ignored."""
    if mode not in ("theblock", "hybrid", "solana"):
        logger.warning("Unknown feature mode '%s'; defaulting to 'theblock'", mode)
    return TheBlockFeatureEngine()

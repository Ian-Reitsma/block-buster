"""Background polling of network metrics (The Block first-party)."""

from __future__ import annotations

import asyncio
from typing import Callable, Tuple

from ..engine.features import PyFeatureEngine
from the_block.client import TheBlockClient

Fetcher = Callable[[TheBlockClient], Tuple[float, float]]


def _default_fetcher(client: TheBlockClient) -> Tuple[float, float]:
    """Derive TPS and median fee from The Block consensus stats."""
    stats = client.consensus.stats()
    tps = getattr(stats, "tps", 0.0)
    fee = getattr(stats, "median_fee", 0.0)
    return float(tps), float(fee)


async def _poll_loop(
    features: PyFeatureEngine,
    client: TheBlockClient,
    interval: float,
    fetcher: Fetcher,
) -> None:
    slot = 0
    while True:
        try:
            tps, fee = fetcher(client)
            slot += 1
            features.update_network_metrics(tps, fee, slot)
        except Exception:
            # Keep polling even if a sample fails
            pass
        await asyncio.sleep(interval)


def start_network_poller(
    features: PyFeatureEngine,
    client: TheBlockClient | None = None,
    interval: float = 60.0,
    fetcher: Fetcher = _default_fetcher,
) -> asyncio.Task:
    """Start background task updating network metrics from The Block."""
    loop = asyncio.get_running_loop()
    client = client or TheBlockClient()
    return loop.create_task(_poll_loop(features, client, interval, fetcher))

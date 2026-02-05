"""Entry point wired to The Block (first-party only).

This runner uses TheBlockIntegration + TheBlockFeatureEngine and avoids all
Solana/WebSocket/cryptography third-party dependencies.
"""

import asyncio
import logging
from pathlib import Path

from block_buster.utils import BotConfig, parse_args
from the_block import TheBlockIntegration, TheBlockFeatureEngine


async def run() -> None:
    args = parse_args()
    cfg = BotConfig.from_args(args)
    logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO))

    checkpoint = Path.home() / ".theblock" / "checkpoint.json"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)

    feature_engine = TheBlockFeatureEngine()
    integration = TheBlockIntegration(
        checkpoint_path=checkpoint,
        feature_engine=feature_engine,
        poll_interval=cfg.poll_interval if hasattr(cfg, "poll_interval") else 5.0,
    )

    async with integration:
        logging.info("The Block integration running; press Ctrl+C to exit.")
        while True:
            metrics = integration.get_metrics()
            logging.info(
                "receipts=%s gates=%s",
                metrics.get("feature_adapter", {}).get("receipts_processed"),
                metrics.get("feature_adapter", {}).get("gates_seen"),
            )
            await asyncio.sleep(5)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()

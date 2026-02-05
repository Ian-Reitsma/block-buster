"""Integration module for connecting The Block to block-buster systems.

Orchestrates:
- Receipt polling from The Block node
- Feature vector generation for ML pipeline
- Governor state monitoring
- Metrics and health monitoring
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from .client import TheBlockClient
from .feeds.receipt_poller import ReceiptPoller, ReceiptPollerManager
from .features import TheBlockFeatureAdapter
from .feature_bridge import TheBlockFeatureEngine

logger = logging.getLogger(__name__)


class TheBlockIntegration:
    """High-level integration between The Block and block-buster.
    
    Manages:
    - The Block RPC client
    - Receipt poller with checkpoint persistence
    - Feature adapter for ML pipeline
    - Governor state monitoring
    
    Usage:
        integration = TheBlockIntegration(
            checkpoint_path=Path("./data/receipt_checkpoint.json")
        )
        
        async def run():
            async with integration:
                # Integration is running
                await asyncio.sleep(3600)  # Run for 1 hour
        
        asyncio.run(run())
    """
    
    def __init__(
        self,
        checkpoint_path: Path,
        client: Optional[TheBlockClient] = None,
        poll_interval: float = 5.0,
        batch_size: int = 512,
        governor_poll_interval: float = 30.0,
        feature_engine: Optional[TheBlockFeatureEngine] = None,
    ):
        """Initialize integration.
        
        Args:
            checkpoint_path: Path to receipt checkpoint JSON file
            client: Optional TheBlockClient instance (creates one if None)
            poll_interval: Receipt polling interval in seconds
            batch_size: Max receipts per RPC call
            governor_poll_interval: Governor status polling interval in seconds
        """
        self.checkpoint_path = checkpoint_path
        self.client = client or TheBlockClient()
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self.governor_poll_interval = governor_poll_interval
        
        # Create feature engine (optional external)
        self.feature_engine = feature_engine
        
        # Create feature adapter
        self.feature_adapter = TheBlockFeatureAdapter(feature_engine=None)
        
        # Create receipt poller
        self.receipt_poller = ReceiptPoller(
            receipt_ns=self.client.receipt,
            checkpoint_path=checkpoint_path,
            poll_interval=poll_interval,
            batch_size=batch_size,
        )
        
        # Register feature adapter as callback
        self.receipt_poller.register_callback(self.feature_adapter.process_receipts)
        
        # Managers
        self.poller_manager = ReceiptPollerManager(self.receipt_poller)
        self.governor_task: Optional[asyncio.Task] = None
        
        logger.info(
            f"TheBlockIntegration initialized: "
            f"checkpoint={checkpoint_path}, "
            f"poll_interval={poll_interval}s, "
            f"batch_size={batch_size}"
        )
    
    async def start(self):
        """Start all integration services."""
        logger.info("Starting The Block integration...")
        
        node_info = self.client.get_node_info()
        if not node_info.get("connected"):
            logger.warning("The Block node unreachable; running in offline mode (no polling)")
            return

        logger.info(
            f"Connected to The Block: "
            f"height={node_info.get('block_height', 0)}, "
            f"mode={node_info.get('chain_mode', 'unknown')}"
        )
        
        # Start receipt poller
        await self.poller_manager.start()
        
        # Start governor monitoring
        self.governor_task = asyncio.create_task(self._governor_monitor_loop())
        
        logger.info("The Block integration started")
    
    async def stop(self):
        """Stop all integration services."""
        logger.info("Stopping The Block integration...")
        
        # Stop governor monitoring
        if self.governor_task:
            self.governor_task.cancel()
            try:
                await self.governor_task
            except asyncio.CancelledError:
                pass
        
        # Stop receipt poller
        await self.poller_manager.stop()
        
        logger.info("The Block integration stopped")
    
    async def _governor_monitor_loop(self):
        """Background task to monitor governor state."""
        logger.info(f"Starting governor monitor (interval={self.governor_poll_interval}s)")
        
        while True:
            try:
                status = self.client.governor.get_status()
                self.feature_adapter.update_governor_state(status)
                
                # Log gate changes
                gates_status = {
                    name: gate.state
                    for name, gate in status.gates.items()
                }
                logger.debug(f"Governor gates: {gates_status}")
                
            except Exception as e:
                logger.error(f"Governor monitor error: {e}", exc_info=True)
            
            await asyncio.sleep(self.governor_poll_interval)
    
    def get_features(self):
        """Get current feature vector.
        
        Returns:
            numpy array of features
        """
        if self.feature_engine:
            return self.feature_engine.snapshot()
        return self.feature_adapter.get_features()
    
    def get_metrics(self) -> dict:
        """Get comprehensive metrics.
        
        Returns:
            Dict with metrics from all subsystems
        """
        return {
            "node": self.client.get_node_info(),
            "receipt_poller": self.receipt_poller.get_metrics(),
            "feature_adapter": self.feature_adapter.get_metrics(),
        }
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.stop()


async def run_integration_demo(duration: float = 60.0):
    """Demo function showing integration usage.
    
    Args:
        duration: How long to run in seconds
    """
    checkpoint_path = Path("./data/theblock_receipt_checkpoint.json")
    
    integration = TheBlockIntegration(
        checkpoint_path=checkpoint_path,
        poll_interval=5.0,
        batch_size=512,
    )
    
    async with integration:
        logger.info(f"Integration running for {duration}s")
        
        # Periodically log metrics
        start = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start < duration:
            await asyncio.sleep(10)
            
            metrics = integration.get_metrics()
            logger.info(f"Metrics: {metrics['feature_adapter']}")
            logger.info(f"Features shape: {integration.get_features().shape}")


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    
    # Run demo
    asyncio.run(run_integration_demo(duration=60.0))

"""Usage examples for TheBlock integration.

Shows how to:
1. Use TheBlock-only feature engine
2. Bridge to existing PyFeatureEngine infrastructure  
3. Integrate with trading strategies
4. Monitor and debug feature pipeline
"""

import asyncio
import logging
from pathlib import Path

from block_buster.utils import np

from the_block import TheBlockClient, TheBlockIntegration
from the_block.feature_bridge import TheBlockFeatureEngine, create_feature_engine

logger = logging.getLogger(__name__)


# ============================================================================
# Example 1: TheBlock-only feature pipeline
# ============================================================================

async def example_theblock_only():
    """Run TheBlock feature pipeline without legacy Solana infrastructure.
    
    Best for new deployments that only use The Block.
    
    Demonstrates:
    - Receipt polling from The Block node
    - Feature extraction into 256-dim vector
    - Gate state monitoring
    - Market activity tracking
    """
    logger.info("=" * 60)
    logger.info("Example 1: TheBlock-only feature pipeline")
    logger.info("=" * 60)
    
    # Create feature engine
    feature_engine = create_feature_engine(mode="theblock")
    
    # Create integration with feature engine
    integration = TheBlockIntegration(
        checkpoint_path=Path("./data/theblock_checkpoint.json"),
        poll_interval=5.0,
        feature_engine=feature_engine,
    )
    
    async with integration:
        logger.info("Integration started, polling receipts...")
        
        # Run for 30 seconds
        for i in range(6):
            await asyncio.sleep(5)
            
            # Get features
            features = feature_engine.snapshot()
            metrics = feature_engine.get_metrics()
            
            logger.info(f"\n[Update {i+1}/6]")
            logger.info(f"Features shape: {features.shape}")
            logger.info(f"Features (first 20): {features[:20]}")
            logger.info(f"Metrics: {metrics}")
            
            # Example: Use features for trading decision
            gate_compute = features[8]  # Index 8 = gate_compute
            gate_storage = features[9]  # Index 9 = gate_storage
            
            if gate_compute > 0.5:
                logger.info("✓ Compute market gate OPEN - safe to submit jobs")
            else:
                logger.info("✗ Compute market gate CLOSED - skip job submission")
            
            # Example: Query receipts directly
            client = integration.client
            recent_receipts = client.receipt.audit(
                start_height=max(1, integration.last_block_height - 100),
                limit=10,
                market="compute"
            )
            logger.info(f"Recent compute receipts: {len(recent_receipts.receipts)}")
    
    logger.info("Example 1 complete\n")


# ============================================================================
# Example 3: Integration with strategy
# ============================================================================

class SimpleTheBlockStrategy:
    """Example strategy using TheBlock features.
    
    Makes trading decisions based on:
    - Governor gate states
    - Market utilization
    - Provider margins
    """
    
    def __init__(self, feature_engine):
        self.feature_engine = feature_engine
        self.position = 0.0  # Current position
        self.cash = 100000.0  # Starting capital in BLOCK tokens
    
    def decide(self) -> dict:
        """Make trading decision based on current features.
        
        Returns:
            Dict with action and reasoning
        """
        features = self.feature_engine.snapshot()
        
        # Extract relevant features
        compute_util = features[0]  # Normalized compute utilization
        storage_util = features[1]  # Normalized storage utilization
        compute_margin = features[4]  # Provider margin
        gate_compute = features[8]  # Gate state (binary)
        gate_storage = features[9]  # Gate state (binary)
        
        # Decision logic
        action = "HOLD"
        reason = "Waiting for signal"
        
        # Check gates first (safety)
        if gate_compute < 0.5 or gate_storage < 0.5:
            return {
                "action": "HOLD",
                "reason": "Gates closed, cannot trade",
                "position": self.position,
                "cash": self.cash,
            }
        
        # Example: Buy signal when high utilization + good margins
        if compute_util > 1.0 and compute_margin > 0.5 and self.position < 1000:
            action = "BUY"
            reason = "High utilization + good margins"
            self.position += 10
            self.cash -= 100  # Simplified
        
        # Example: Sell signal when low utilization
        elif compute_util < -1.0 and self.position > 0:
            action = "SELL"
            reason = "Low utilization, take profits"
            self.position -= 10
            self.cash += 100  # Simplified
        
        return {
            "action": action,
            "reason": reason,
            "position": self.position,
            "cash": self.cash,
            "features": {
                "compute_util": float(compute_util),
                "storage_util": float(storage_util),
                "compute_margin": float(compute_margin),
                "gate_compute": float(gate_compute),
                "gate_storage": float(gate_storage),
            },
        }


async def example_strategy_integration():
    """Run strategy integrated with TheBlock features."""
    logger.info("=" * 60)
    logger.info("Example 3: Strategy integration")
    logger.info("=" * 60)
    
    # Create feature engine and strategy
    feature_engine = create_feature_engine(mode="theblock")
    strategy = SimpleTheBlockStrategy(feature_engine)
    
    # Create integration
    integration = TheBlockIntegration(
        checkpoint_path=Path("./data/strategy_checkpoint.json"),
        poll_interval=5.0,
    )
    
    async with integration:
        logger.info("Strategy running with live TheBlock data")
        
        for i in range(8):
            await asyncio.sleep(5)
            
            # Make decision
            decision = strategy.decide()
            
            logger.info(f"\n[Tick {i+1}/8]")
            logger.info(f"Action: {decision['action']}")
            logger.info(f"Reason: {decision['reason']}")
            logger.info(f"Position: {decision['position']}")
            logger.info(f"Cash: {decision['cash']:.2f} BLOCK")
            logger.info(f"Features: {decision['features']}")
    
    logger.info("Strategy complete")
    logger.info(f"Final P&L: {strategy.cash - 100000:.2f} BLOCK")


# ============================================================================
# Example 4: Manual feature inspection
# ============================================================================

async def example_feature_inspection():
    """Inspect feature values and their evolution."""
    logger.info("=" * 60)
    logger.info("Example 4: Feature inspection and debugging")
    logger.info("=" * 60)
    
    feature_engine = create_feature_engine(mode="theblock")
    integration = TheBlockIntegration(
        checkpoint_path=Path("./data/inspection_checkpoint.json"),
        poll_interval=2.0,
    )
    
    async with integration:
        logger.info("Monitoring feature evolution...")
        
        prev_features = None
        
        for i in range(10):
            await asyncio.sleep(3)
            
            features = feature_engine.snapshot()
            
            logger.info(f"\n[Snapshot {i+1}/10]")
            
            # Show active features
            feature_names = [
                "compute_util", "storage_util", "energy_util", "ad_util",
                "compute_margin", "storage_margin", "receipt_velocity",
                "job_success_rate", "gate_compute", "gate_storage",
            ]
            
            for idx, name in enumerate(feature_names):
                value = features[idx]
                
                # Show delta if we have previous snapshot
                if prev_features is not None:
                    delta = value - prev_features[idx]
                    arrow = "↑" if delta > 0 else "↓" if delta < 0 else "→"
                    logger.info(f"  [{idx:2d}] {name:20s} = {value:8.4f} {arrow} ({delta:+.4f})")
                else:
                    logger.info(f"  [{idx:2d}] {name:20s} = {value:8.4f}")
            
            prev_features = features.copy()
    
    logger.info("Inspection complete")


# ============================================================================
# Main runner
# ============================================================================

async def run_all_examples():
    """Run all examples sequentially."""
    examples = [
        ("TheBlock-only", example_theblock_only),
        ("Hybrid mode", example_hybrid_mode),
        ("Strategy integration", example_strategy_integration),
        ("Feature inspection", example_feature_inspection),
    ]
    
    for name, example_func in examples:
        logger.info(f"\n\n{'=' * 80}")
        logger.info(f"Running: {name}")
        logger.info(f"{'=' * 80}\n")
        
        try:
            await example_func()
        except Exception as e:
            logger.error(f"Example '{name}' failed: {e}", exc_info=True)
        
        # Pause between examples
        logger.info("\nPausing 5s before next example...")
        await asyncio.sleep(5)


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    
    # Run examples
    import sys
    
    if len(sys.argv) > 1:
        example_name = sys.argv[1]
        examples_map = {
            "theblock": example_theblock_only,
            "hybrid": example_hybrid_mode,
            "strategy": example_strategy_integration,
            "inspect": example_feature_inspection,
            "all": run_all_examples,
        }
        
        if example_name in examples_map:
            asyncio.run(examples_map[example_name]())
        else:
            print(f"Unknown example: {example_name}")
            print(f"Available: {', '.join(examples_map.keys())}")
    else:
        # Run first example by default
        asyncio.run(example_theblock_only())

# The Block Integration Guide

## Overview

This guide documents the integration between block-buster and The Block L1 blockchain. The integration provides:

- **Receipt polling** from The Block node's canonical audit trail
- **Feature extraction** from receipts into ML-ready vectors
- **Governor monitoring** for safety gates
- **Bridge to existing PyFeatureEngine** infrastructure

## Architecture

```
The Block Node (RPC)
    |
    v
ReceiptPoller -----> TheBlockFeatureAdapter -----> TheBlockFeatureEngine
    |                        |                            |
    |                        |                            |
    v                        v                            v
Checkpoint              Raw metrics                 256-dim vector
(persistence)           (Prometheus)                (ML pipeline)
```

## Quick Start

### 1. TheBlock-Only Mode (Recommended)

For new deployments using only The Block:

```python
import asyncio
from pathlib import Path
from the_block import TheBlockIntegration, create_feature_engine

# Create feature engine
engine = create_feature_engine(mode="theblock")

# Create integration
integration = TheBlockIntegration(
    checkpoint_path=Path("./data/checkpoint.json"),
    feature_engine=engine,
)

async def main():
    async with integration:
        # Feature vector updates automatically from receipts
        while True:
            features = integration.get_features()  # shape: (256,)
            
            # Use features for trading decisions
            gate_compute = features[8]  # Gate state
            if gate_compute > 0.5:
                print("Compute market open, safe to trade")
            
            await asyncio.sleep(10)

asyncio.run(main())
```

### 2. Hybrid Mode (Solana + TheBlock)

For transitioning from Solana to The Block:

```python
from the_block import create_feature_engine
from solbot.schema import Event, EventKind

# Create hybrid engine
engine = create_feature_engine(mode="hybrid")

# Update with Solana events (legacy)
solana_event = Event(ts=..., kind=EventKind.SWAP, ...)
engine.update_solana(solana_event, slot=12345)

# Update with TheBlock receipts (new)
engine.update_theblock(receipt_events)

# Get combined features
features = engine.snapshot()  # Solana [0-10] + TheBlock [11-19]
```

## Feature Specification

### TheBlock Features (indices 11-19 in hybrid, 0-19 in theblock-only)

| Index | Name | Category | Description | Unit |
|-------|------|----------|-------------|------|
| 0 | `compute_util` | Market | Compute market utilization | 0-1 ratio |
| 1 | `storage_util` | Market | Storage market utilization | 0-1 ratio |
| 2 | `energy_util` | Market | Energy market utilization | 0-1 ratio |
| 3 | `ad_util` | Market | Ad market utilization | 0-1 ratio |
| 4 | `compute_margin` | Economics | Provider margin (ppm/1M) | ratio |
| 5 | `storage_margin` | Economics | Storage provider margin | ratio |
| 6 | `receipt_velocity` | Activity | Receipts per 100 blocks (EMA) | per_block |
| 7 | `job_success_rate` | Quality | Compute job success rate | 0-1 ratio |
| 8 | `gate_compute` | Governance | 1.0 if Trade, 0.0 if closed | binary |
| 9 | `gate_storage` | Governance | 1.0 if Trade, 0.0 if closed | binary |
| 10-19 | Reserved | - | Volume, spend, diversity metrics | - |

See `features_theblock.yaml` for complete specification.

## Components

### TheBlockClient

High-level RPC client for The Block:

```python
from the_block import TheBlockClient

client = TheBlockClient()

# Check connection
if client.health_check():
    print(f"Connected at height {client.consensus.block_height()}")

# Query balance
balance = client.ledger.get_balance("0x...")

# Check gates
status = client.governor.get_status()
for market, gate in status.gates.items():
    print(f"{market}: {gate.state}")
```

### ReceiptPoller

Background service that polls `receipt.audit` RPC:

```python
from the_block import ReceiptPoller, ReceiptPollerManager
from pathlib import Path

poller = ReceiptPoller(
    receipt_ns=client.receipt,
    checkpoint_path=Path("./checkpoint.json"),
    poll_interval=5.0,
    batch_size=512,
)

# Register callback
def on_receipts(events):
    for event in events:
        print(f"Receipt: {event.market} {event.amount} BLOCK")

poller.register_callback(on_receipts)

# Run poller
async with ReceiptPollerManager(poller):
    await asyncio.sleep(60)
```

**Features:**
- Checkpoint persistence (never reprocess receipts)
- Automatic pagination handling
- Multiple callback support
- Exponential backoff on errors
- Prometheus metrics

### TheBlockFeatureAdapter

Converts receipt events to feature vectors:

```python
from the_block import TheBlockFeatureAdapter

adapter = TheBlockFeatureAdapter()

# Process receipts (called by poller)
adapter.process_receipts(receipt_events)

# Update governor state
adapter.update_governor_state(governor_status)

# Get features
features = adapter.get_features()  # shape: (256,)
metrics = adapter.get_metrics()
```

**Normalization:**
- Online z-score with exponential decay (λ=0.995)
- Per-dimension mean and variance tracking
- Numerically stable (ε=1e-8)

### TheBlockFeatureEngine

Dedicated feature engine for TheBlock:

```python
from the_block import TheBlockFeatureEngine

engine = TheBlockFeatureEngine()

# Update with receipts
features = engine.update(receipt_events, block_height=1234)

# Get snapshot
features = engine.snapshot()

# Reset state
engine.reset()
```

### HybridFeatureEngine

Supports both Solana and TheBlock:

```python
from the_block import HybridFeatureEngine

engine = HybridFeatureEngine()

# Solana events -> dims [0-10]
engine.update_solana(solana_event, slot=12345)

# TheBlock receipts -> dims [11-19]
engine.update_theblock(receipt_events)

# Combined features
features = engine.snapshot()  # shape: (256,)
metrics = engine.get_metrics()
```

## Governor Gate Enforcement

Critical safety feature: refuse market operations when gates are closed.

```python
from the_block import require_gate, check_gate_safe

# Decorator approach
@require_gate("compute_market")
def submit_compute_job(client, ...):
    # Only runs if compute gate is Trade
    result = client.compute.submit_job(...)
    return result

# Programmatic approach
safe, reason = check_gate_safe(client, "compute_market")
if safe:
    submit_job()
else:
    print(f"Cannot submit: {reason}")
```

## Configuration

Environment variables:

```bash
# RPC connection
export TB_RPC_URL="http://localhost:8545"
export TB_CHAIN_MODE="localnet"  # localnet|testnet|mainnet

# Authentication
export TB_RPC_AUTH_TOKEN="your-token"
export TB_TLS_CERT="/path/to/cert.pem"
export TB_TLS_KEY="/path/to/key.pem"

# Tuning
export TB_RPC_TIMEOUT="30.0"
export TB_RPC_MAX_RETRIES="3"
```

## Metrics

Prometheus metrics exposed:

```
# Receipt processing
theblock_receipts_processed_total{market="compute"}
theblock_feature_update_seconds
theblock_feature_dimensions

# Poller health
receipt_poller_cycles
receipt_poller_errors
receipt_poller_receipts_processed
```

## Examples

See `src/the_block/examples.py` for:

1. **TheBlock-only mode** - Pure TheBlock integration
2. **Hybrid mode** - Transition from Solana
3. **Strategy integration** - Trading bot using features
4. **Feature inspection** - Debug and monitor features

Run examples:

```bash
# Run specific example
python -m the_block.examples theblock
python -m the_block.examples hybrid
python -m the_block.examples strategy
python -m the_block.examples inspect

# Run all examples
python -m the_block.examples all
```

## Testing

```bash
# Unit tests
pytest tests/the_block/

# Integration tests (requires running node)
pytest tests/the_block/integration/ --integration

# Feature pipeline validation
pytest tests/the_block/test_features.py -v
```

## Migration Guide

### From Solana to TheBlock

1. **Add hybrid mode** to existing deployment:
   ```python
   engine = create_feature_engine(mode="hybrid")
   ```

2. **Update strategies** to read both feature sets:
   ```python
   solana_volume = features[3]  # Legacy
   theblock_compute_util = features[11]  # New
   ```

3. **Gradually shift weight** to TheBlock features

4. **Switch to theblock-only mode** when ready:
   ```python
   engine = create_feature_engine(mode="theblock")
   ```

5. **Remove Solana dependencies**

## Troubleshooting

### Receipt poller not processing receipts

1. Check node connection:
   ```python
   client.health_check()  # Should return True
   ```

2. Check checkpoint:
   ```python
   poller.load_checkpoint()  # Should return valid height
   ```

3. Check logs for RPC errors

### Features are all zeros

1. Verify receipts are being processed:
   ```python
   metrics = adapter.get_metrics()
   print(metrics['receipts_processed'])  # Should be > 0
   ```

2. Check block height is advancing:
   ```python
   print(metrics['last_block_height'])
   ```

3. Wait for normalization warmup (first 100 receipts)

### Gate enforcement blocking operations

1. Check gate status:
   ```python
   status = client.governor.get_status()
   print(status.gates['compute_market'].state)
   ```

2. Use unsafe override (dev only):
   ```python
   from flask import g
   g.unsafe_override_enabled = True
   ```

## Performance

### Typical Throughput

- **Receipt polling**: 512 receipts every 5s = ~100 receipts/s
- **Feature update**: <1ms per receipt batch
- **Checkpoint save**: ~1ms (async)

### Memory Usage

- **ReceiptPoller**: ~10 MB (checkpoint + buffer)
- **TheBlockFeatureAdapter**: ~1 MB (running stats)
- **Feature vector**: 1 KB (256 float32)

### Tuning

```python
# High-throughput config
integration = TheBlockIntegration(
    poll_interval=2.0,  # Poll every 2s
    batch_size=1024,    # Larger batches
)

# Low-latency config
integration = TheBlockIntegration(
    poll_interval=1.0,  # Poll every 1s
    batch_size=256,     # Smaller batches
)
```

## API Reference

See inline docstrings for complete API documentation:

```python
help(TheBlockClient)
help(ReceiptPoller)
help(TheBlockFeatureAdapter)
help(TheBlockFeatureEngine)
```

## Support

For issues or questions:
1. Check existing issues in repo
2. Review integration plan: `integration-plan_block-buster.md`
3. Enable debug logging: `logging.getLogger('the_block').setLevel(logging.DEBUG)`

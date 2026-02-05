# Solana to The Block Migration Guide

**Date:** February 2, 2026  
**Status:** 🔄 In Progress

## Overview

This document tracks the migration of block-buster from Solana-based trading to The Block blockchain integration.

## Terminology Changes

| Old (Solana) | New (The Block) | Status |
|--------------|-----------------|--------|
| `sol-bot` | `block-buster` | ✅ Updated |
| `Sol Bot` | `Block Buster` | ✅ Updated |
| `sol_bot` | `block_buster` | ✅ Updated |
| `sol_seeker` | `block_buster` | ⚠️ Package rename needed |
| `sol-seeker` | `block-buster` | ⚠️ Package rename needed |
| `Sol Seeker` | `Block Buster` | ✅ Updated |
| `solbot` | `block_buster` | ⚠️ Directory rename needed |
| `Solana` | `The Block` | ✅ Updated |
| `solana` | `the_block` | ✅ Updated |

## Package Structure Changes

### Current Structure
```
src/
├── solbot/          # Legacy Solana trading bot
├── sol_seeker/      # Legacy feature extraction
└── the_block/       # ✨ New The Block integration
```

### Target Structure
```
src/
├── block_buster/    # Main trading engine (renamed from solbot)
├── features/        # Feature extraction (renamed from sol_seeker)
└── the_block/       # The Block blockchain integration
```

## API Migration

### Solana APIs → The Block RPC

#### Connection Endpoints

**Before (Solana):**
```python
RPC_HTTP = "https://api.devnet.solana.com"
RPC_WS = "wss://api.devnet.solana.com/"
```

**After (The Block):**
```python
RPC_HTTP = "http://localhost:8332"  # The Block RPC
RPC_WS = "ws://localhost:8332/ws"   # The Block WebSocket
```

#### Data Queries

**Before (Solana):**
```python
# Get account info
client.get_account_info(pubkey)

# Get token balance  
client.get_token_account_balance(account)

# Get recent transactions
client.get_confirmed_signatures_for_address2(address)
```

**After (The Block):**
```python
# Get account balance
await client.rpc_call("ledger.balance", {"account": account_id})

# Get transaction history
await client.rpc_call("ledger.transactions", {
    "account": account_id,
    "limit": 100
})

# Get block height
await client.rpc_call("consensus.block_height")
```

#### Market Data

**Before (Solana DEX):**
```python
# Subscribe to swap events
event_stream.subscribe(
    program_id="RAYDIUM_PROGRAM_ID",
    event_type="SWAP"
)
```

**After (The Block):**
```python
# Subscribe to compute market
await client.rpc_call("compute_market.submit_job", job_params)

# Get market state
await client.rpc_call("compute_market.stats")

# Monitor receipts
await client.rpc_call("receipt.audit", {
    "market": "compute",
    "start_height": start,
    "end_height": end
})
```

## Code Changes Required

### 1. Main Entry Point (`main.py`)

**Changes:**
- Remove Solana RPC client initialization
- Replace with The Block RPC client
- Update event parsing to use The Block receipt types
- Remove DEX-specific logic (swaps, liquidity events)
- Add compute/storage/energy market monitoring

### 2. Server (`server.py`)

**Changes:**
- Update API endpoints to query The Block instead of Solana
- Replace wallet/pubkey validation with The Block account IDs
- Update WebSocket streams to emit The Block events
- Modify license verification to use The Block accounts

### 3. Feature Engine (`sol_seeker/`)

**Changes:**
- Rename package to `features/`
- Update event types from DEX events to The Block receipts
- Replace Solana-specific features:
  - `liquidity_delta` → Market utilization metrics
  - `signed_volume` → Compute job volume
  - `swap_frequency` → Operation frequency
  - `minted_amount` → Token rewards/subsidies

### 4. Trading Bot (`solbot/`)

**Changes:**
- Rename package to `block_buster/`
- Remove Solana DEX integration
- Add The Block market operations:
  - Compute job submission
  - Storage operations
  - Energy market participation
  - Ad network bidding
- Update risk management for The Block economics
- Replace transaction signing with The Block format

## Migration Phases

### Phase 1: Documentation & Preparation (✅ Current)
- [x] Create migration guide
- [x] Update README.md
- [x] Document API mappings
- [x] Identify all files requiring changes

### Phase 2: Core Infrastructure (🔄 In Progress)
- [ ] Update server.py to use The Block RPC
- [ ] Rename `solbot/` to `block_buster/`
- [ ] Rename `sol_seeker/` to `features/`
- [ ] Update import statements across codebase
- [ ] Remove Solana package dependencies where possible

### Phase 3: Feature Engine
- [ ] Redefine features for The Block events
- [ ] Update feature extraction logic
- [ ] Rebuild Rust core for The Block data structures
- [ ] Update normalization for new metrics

### Phase 4: Trading Logic
- [ ] Remove DEX trading logic
- [ ] Implement The Block market operations
- [ ] Update position tracking
- [ ] Adapt risk management

### Phase 5: Testing & Validation
- [ ] Unit tests for The Block RPC client
- [ ] Integration tests with live node
- [ ] Performance benchmarks
- [ ] End-to-end trading simulation

### Phase 6: Cleanup
- [ ] Remove unused Solana code
- [ ] Update all documentation
- [ ] Remove Solana dependencies from requirements.txt
- [ ] Archive old Solana-specific code

## File-by-File Changes

### High Priority (User-Facing)

1. **README.md**
   - Replace "sol-bot" with "block-buster"
   - Update architecture description
   - Change all Solana references to The Block
   - Update RPC configuration section
   - Modify dashboard API documentation

2. **src/main.py**
   - Update imports: `from the_block import TheBlockClient`
   - Replace Solana event stream with The Block receipt stream
   - Update event parsing logic

3. **src/server.py**
   - Update FastAPI endpoints to query The Block
   - Replace Solana wallet validation
   - Update WebSocket streams

### Medium Priority (Core Logic)

4. **src/solbot/__init__.py** → `src/block_buster/__init__.py`
   - Update package docstring
   - Update imports

5. **src/solbot/engine/**
   - Update trading engine for The Block markets
   - Modify order execution
   - Update position tracking

6. **src/sol_seeker/**  → `src/features/`
   - Redefine feature spec for The Block
   - Update Rust core integration

### Low Priority (Supporting)

7. **tests/**
   - Update test fixtures
   - Replace mock Solana data with The Block data

8. **scripts/**
   - Update helper scripts
   - Modify deployment scripts

9. **notebooks/**
   - Update research notebooks
   - Replace Solana data sources

## Dependencies

### To Remove
```txt
solana==0.36.7
solders>=0.14.0
```

### To Add
```txt
# The Block RPC client dependencies
aiohttp>=3.8.0
websockets>=11.0
```

## Configuration Updates

### Environment Variables

**Before:**
```bash
export RPC_HTTP="https://api.devnet.solana.com"
export RPC_WS="wss://api.devnet.solana.com/"
export LICENSE_AUTHORITY="YOUR_SOLANA_WALLET"
```

**After:**
```bash
export RPC_HTTP="http://localhost:8332"
export RPC_WS="ws://localhost:8332/ws"
export BLOCK_ACCOUNT="YOUR_BLOCK_ACCOUNT_ID"
```

### Command Line Usage

**Before:**
```bash
python -m src.server --wallet YOUR_WALLET \
    --rpc-ws wss://api.testnet.solana.com \
    --rpc-http https://api.testnet.solana.com
```

**After:**
```bash
python -m src.server --account YOUR_ACCOUNT_ID \
    --rpc-url http://localhost:8332
```

## The Block Integration Points

### 1. Account Management

Use The Block's account system instead of Solana wallets:

```python
from the_block.rpc_client import TheBlockClient

client = TheBlockClient(rpc_url="http://localhost:8332")

# Get balance
balance = await client.rpc_call("ledger.balance", {
    "account": account_id
})

# Get transaction history
txs = await client.rpc_call("ledger.transactions", {
    "account": account_id,
    "limit": 100
})
```

### 2. Market Operations

Replace DEX trading with The Block markets:

```python
# Submit compute job
job_result = await client.rpc_call("compute_market.submit_job", {
    "model": "my-model",
    "data_cid": "Qm...",
    "compute_units": 1000,
    "max_cost": 100000  # microBLOCK
})

# Store data
storage_result = await client.rpc_call("storage.put", {
    "data": data_bytes,
    "duration_blocks": 1000
})

# Get energy credits
energy_credits = await client.rpc_call("energy.credits", {
    "provider_id": "energy-0x00"
})
```

### 3. Event Monitoring

Subscribe to The Block events via receipt audit:

```python
# Stream receipts
receipts = await client.rpc_call("receipt.audit", {
    "start_height": current_height - 100,
    "end_height": current_height,
    "market": "compute",
    "limit": 100
})

for receipt in receipts["receipts"]:
    # Process receipt
    print(f"Receipt {receipt['receipt_type']} at block {receipt['block_height']}")
```

## Testing Strategy

### Unit Tests

1. Test The Block RPC client wrapper
2. Test receipt parsing
3. Test market operation submission
4. Test account balance queries

### Integration Tests

1. Connect to local The Block node
2. Submit test compute jobs
3. Verify receipts are generated
4. Check account balances update

### Performance Tests

1. Benchmark RPC latency
2. Test WebSocket throughput
3. Measure receipt processing speed

## Rollback Plan

If migration issues arise:

1. Keep Solana code in a separate branch
2. Maintain dual compatibility during transition
3. Use feature flags to toggle between backends
4. Document all breaking changes

## Success Criteria

- [ ] All references to "Solana" replaced with "The Block"
- [ ] All references to "sol-bot" replaced with "block-buster"
- [ ] Server connects to The Block node successfully
- [ ] Market operations execute correctly
- [ ] Receipts parse and process properly
- [ ] WebSocket streams work
- [ ] Dashboard displays The Block data
- [ ] All tests pass
- [ ] Documentation updated

## Support

For questions or issues during migration:
- Check `docs/apis_and_tooling.md` in The Block repo
- Review The Block RPC documentation
- Test against local node first

---

**Note:** This is a living document. Update as migration progresses.

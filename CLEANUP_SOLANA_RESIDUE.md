# Cleanup Solana Residue - Complete Task List

**Date:** February 2, 2026  
**Status:** 🚨 Critical - Blocking Production

## Issues Found

### 1. Package Naming & Dependencies

**File: `pyproject.toml`**
- Line 7: Package named `"sol-bot"` → Change to `"block-buster"`
- Line 12: Dependency `"solana>=0.30"` → **REMOVE**
- Other third-party deps to remove (per zero-deps policy)

### 2. Entry Points & Imports

**File: `src/main.py`**
- Line 19: `from solbot.solana import data` → **REMOVE/REPLACE**
- `from solbot.engine import ...` → Change to `from block_buster.engine import ...`
- `from solbot.utils import ...` → Change to `from block_buster.utils import ...`

**File: `tests/test_feature_engine.py`**
- Line 2: Imports `sol_seeker` → Change to `features` or `block_buster.features`

### 3. Solana-specific Configuration

**File: `src/block_buster/utils/config.py`**
- Line 14: Solana WebSocket URL `wss://api.devnet.solana.com/` → Change to The Block node
- Line 34: Path `~/.solbot/...` → Change to `~/.block-buster/...`

**File: `src/block_buster/solana/volume.py`**
- Line 8: Direct Solana RPC usage → **REMOVE FILE**

**File: `src/block_buster/persistence/assets.py`**
- Line 18: Solana token-list dependency → **REMOVE**

**File: `src/block_buster/feature_bridge.py`**
- Line 19: Imports `solbot.*` → Change to `block_buster.*`
- Solana-dimensioned features → Adapt for The Block

### 4. Syntax Errors (Hard Blockers)

**File: `src/the_block/rpc_client.py`**
- Line 27: `def __init__(self, code: int, message: str,  Optional[Any] = None):`
  - **FIX:** `def __init__(self, code: int, message: str,  Optional[Any] = None):`
- Line 102: Similar syntax error (need to check)

**File: `src/the_block/accounting.py`**
- Line 58: `meta Dict = field(default_factory=dict)`
  - **FIX:** `meta: Dict = field(default_factory=dict)`

**File: `src/the_block/receipts.py`**
- Line 8: Syntax error (need to check)

**File: `src/the_block/dashboard_server.py`**
- Line 30: Syntax error (need to check)

### 5. RPC Method Mismatches

The Block's actual RPC methods (from `the-block/rpc/mod.rs` line 783):

**Actual Methods:**
```rust
"net.peers" => NetPeers
"net.stats" => NetStats
"light.latest_header" => LightLatestHeader
"storage.put" => StoragePut
"storage.get" => StorageGet
"storage.stats" => StorageStats
"compute_market.submit_job" => ComputeSubmitJob
"compute_market.stats" => ComputeStats
"energy.credits" => EnergyCredits
"energy.market_state" => EnergyMarketState
"ad_market.submit_bid" => AdSubmitBid
"ad_market.stats" => AdStats
"ledger.balance" => LedgerBalance
"ledger.transactions" => LedgerTransactions
"governor.status" => GovernorStatus
"receipt.audit" => ReceiptAudit
"consensus.pos.validators" => ConsensusValidators
```

**Currently Assumed (WRONG):**
- `peer.list` → Should be `net.peers`
- `peer.stats` → Should be `net.stats`
- `consensus.block_height` → Should be `light.latest_header` or similar
- `scheduler.stats` → Doesn't exist
- Various other misnamed methods

### 6. Missing Backend Endpoints

Frontend expects (from `theBlockClient.ts` line 205+):
- `/theblock/receipts` - **MISSING**
- `/theblock/operations` - **MISSING**
- `/theblock/network/metrics` - **MISSING**
- `/theblock/markets/health` - **MISSING**
- `/theblock/scheduler/stats` - **MISSING** (scheduler doesn't exist in node)
- `/theblock/peers/list` - **MISSING**

### 7. Mock Data Still Active

**File: `web/src/pages/NetworkStrength.tsx`**
- Line 120+: Using mock data instead of real API calls
- Need to remove mocks and use real endpoints

## Fix Order

### Phase 1: Make It Buildable (Critical Path)

1. **Fix syntax errors** (prevents code from running)
   - [ ] `rpc_client.py` line 27, 102
   - [ ] `accounting.py` line 58
   - [ ] `receipts.py` line 8
   - [ ] `dashboard_server.py` line 30

2. **Update package naming**
   - [ ] `pyproject.toml`: `"sol-bot"` → `"block-buster"`
   - [ ] Remove `"solana>=0.30"` dependency

3. **Fix import paths**
   - [ ] `main.py`: `solbot.*` → `block_buster.*`
   - [ ] All test files: `sol_seeker` → `features`
   - [ ] `feature_bridge.py`: Update imports

4. **Remove Solana-specific code**
   - [ ] Delete `src/block_buster/solana/` directory
   - [ ] Remove Solana imports from `assets.py`
   - [ ] Update config paths: `~/.solbot/` → `~/.block-buster/`

### Phase 2: Align RPC Layer

5. **Update RPC client for actual node methods**
   - [ ] Map `peer.*` → `net.*`
   - [ ] Map `consensus.block_height` → `light.latest_header`
   - [ ] Remove non-existent methods (`scheduler.stats`, etc.)
   - [ ] Update all RPC call sites

6. **Update documentation**
   - [ ] Fix `apis_and_tooling.md` references
   - [ ] Update `NETWORK_METRICS_INTEGRATION.md`
   - [ ] Correct all RPC examples

### Phase 3: Implement Missing Endpoints

7. **Backend API completion**
   - [ ] `/theblock/receipts` → Query `receipt.audit`
   - [ ] `/theblock/operations` → Query receipts and format
   - [ ] `/theblock/network/metrics` → Aggregate `net.stats`, `light.latest_header`
   - [ ] `/theblock/markets/health` → Aggregate market stats
   - [ ] `/theblock/peers/list` → Call `net.peers`
   - [ ] Remove `/theblock/scheduler/stats` (doesn't exist)

8. **Remove mock data**
   - [ ] `NetworkStrength.tsx`: Replace mocks with API calls
   - [ ] Other components using mocks

### Phase 4: Cleanup & Integration

9. **Server consolidation**
   - [ ] Choose: Keep Flask `dashboard_server.py` OR FastAPI `production_server.py`
   - [ ] Delete the unused one
   - [ ] Ensure chosen server has all endpoints

10. **Repository integration**
    - [ ] Add `.gitignore` for `node_modules/`, `venv/`, `dist/`, etc.
    - [ ] Create Justfile task for running block-buster
    - [ ] Add README for operators

11. **UI decision**
    - [ ] Option A: Extend block-buster web UI for all markets
    - [ ] Option B: Link to existing Rust explorer views
    - [ ] Document decision

## Quick Fix Script

See `fix_all_issues.py` for automated fixes.

## Testing Checklist

After fixes:
- [ ] `python -m the_block.production_server` starts without errors
- [ ] Can query RPC methods through client
- [ ] Frontend loads without console errors
- [ ] API endpoints return real data (not mocks)
- [ ] WebSocket connections work
- [ ] All imports resolve correctly

## Files to Delete

```bash
# Solana residue
rm -rf src/block_buster/solana/
rm -f src/block_buster/feature_bridge.py  # If purely Solana

# Duplicate servers (choose one)
rm -f src/the_block/dashboard_server.py  # OR production_server.py

# Test residue
find tests/ -name '*solana*' -delete
find tests/ -name '*sol_seeker*' -delete
```

## Success Criteria

✅ **Code runs without syntax errors**  
✅ **No Solana imports or dependencies**  
✅ **RPC client matches actual node methods**  
✅ **All frontend API calls work with real data**  
✅ **Package properly named `block-buster`**  
✅ **Tests pass**  

---

**Priority:** 🔥 **CRITICAL** - Code doesn't run currently
**Estimated Time:** 4-6 hours for Phase 1-2, 8-12 hours total

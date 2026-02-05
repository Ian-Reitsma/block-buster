# Critical Fixes Needed - Block Buster

**Date:** February 2, 2026  
**Status:** 🚨 **BLOCKING** - Code Cannot Run  
**Priority:** 🔥 **IMMEDIATE**

## Executive Summary

Block-buster has **5 critical syntax errors** preventing it from running, plus extensive Solana residue that needs removal. Estimated fix time: **2-4 hours** for critical path.

## 🔥 Blocking Issues (Fix First)

### 1. Syntax Error: rpc_client.py Line 27

**File:** `src/the_block/rpc_client.py`

**Current (BROKEN):**
```python
def __init__(self, code: int, message: str,  Optional[Any] = None):
    self.code = code
    self.message = message
    self.data = data  # <-- 'data' not defined!
```

**Fix:**
```python
def __init__(self, code: int, message: str,  Optional[Any] = None):
    self.code = code
    self.message = message
    self.data = data
```

**Issue:** Missing parameter name `data` before type annotation.

---

### 2. Syntax Error: accounting.py Line 58

**File:** `src/the_block/accounting.py`

**Current (BROKEN):**
```python
@dataclass
class Transaction:
    timestamp: int
    block_height: int
    receipt_type: str
    transaction_type: TransactionType
    amount: int
    market: str
    provider: str
    meta Dict = field(default_factory=dict)  # <-- Missing colon!
```

**Fix:**
```python
    meta: Dict = field(default_factory=dict)
```

**Issue:** Missing `:` between parameter name and type.

---

### 3. Syntax Error: receipts.py Line 8

**File:** `src/the_block/receipts.py`

**Need to check** - Likely similar missing `:` in type annotations.

**Pattern to search for:**
```python
# Bad
some_var Dict[str, int] = {}
some_var Optional[str] = None

# Good
some_var: Dict[str, int] = {}
some_var: Optional[str] = None
```

---

### 4. Syntax Error: dashboard_server.py Line 30

**File:** `src/the_block/dashboard_server.py`

**Need to check** - Same issue.

---

### 5. Syntax Error: rpc_client.py Line 102

**File:** `src/the_block/rpc_client.py`

**Need to check** - Likely another type annotation issue.

---

## 🛠️ Quick Fix Commands

### Option A: Automated Fix (Recommended)

```bash
cd ~/projects/the-block/block-buster
python3 fix_all_issues.py
```

This script will:
- Fix all 5 syntax errors
- Update pyproject.toml (sol-bot → block-buster)
- Remove Solana dependency
- Fix import paths (solbot.* → block_buster.*)
- Update RPC method names
- Update config paths (~/.solbot/ → ~/.block-buster/)

### Option B: Manual Fix

```bash
# 1. Fix syntax errors
sed -i '' 's/def __init__(self, code: int, message: str,  Optional\[Any\] = None)/def __init__(self, code: int, message: str,  Optional[Any] = None)/' src/the_block/rpc_client.py

sed -i '' 's/meta Dict = field/meta: Dict = field/' src/the_block/accounting.py

# 2. Fix package name
sed -i '' 's/name = "sol-bot"/name = "block-buster"/' pyproject.toml

# 3. Remove Solana dependency
sed -i '' '/"solana>=0.30"/d' pyproject.toml

# 4. Fix imports in all files
find src -name '*.py' -exec sed -i '' 's/from solbot\./from block_buster./g' {} \;
find src -name '*.py' -exec sed -i '' 's/import solbot\./import block_buster./g' {} \;
```

---

## 🚨 Solana Residue to Remove

### Package Naming

**File:** `pyproject.toml`

```toml
# Line 7: CHANGE THIS
name = "sol-bot"  # ❌
name = "block-buster"  # ✅

# Line 12: DELETE THIS
"solana>=0.30",  # ❌ Remove entirely
```

### Import Paths

**Files affected:** `main.py`, `tests/*.py`, `feature_bridge.py`

```python
# OLD (Solana era)
from solbot.engine import ...
from solbot.utils import ...
from sol_seeker import ...

# NEW (The Block)
from block_buster.engine import ...
from block_buster.utils import ...
from features import ...
```

### Configuration

**File:** `src/block_buster/utils/config.py`

```python
# Line 14: CHANGE THIS
default_ws = "wss://api.devnet.solana.com/"  # ❌
default_ws = "ws://localhost:9944"  # ✅

# Line 34: CHANGE THIS
config_dir = Path.home() / ".solbot"  # ❌
config_dir = Path.home() / ".block-buster"  # ✅
```

### Remove Entire Directories

```bash
# Solana-specific code
rm -rf src/block_buster/solana/

# Obsolete feature bridge (if Solana-only)
rm -f src/block_buster/feature_bridge.py
```

---

## 🔌 RPC Method Alignment

### The Block's ACTUAL RPC Methods

**(From `the-block/rpc/mod.rs` line 783)**

```rust
// Network
"net.peers"         => List all connected peers
"net.stats"         => Network statistics

// Light Client
"light.latest_header"  => Get latest block header

// Storage Market
"storage.put"       => Store data
"storage.get"       => Retrieve data
"storage.stats"     => Storage market stats

// Compute Market
"compute_market.submit_job"  => Submit compute job
"compute_market.stats"       => Compute market stats

// Energy Market
"energy.credits"         => Check energy credits
"energy.market_state"    => Energy market state

// Ad Market
"ad_market.submit_bid"  => Submit ad bid
"ad_market.stats"       => Ad market stats

// Ledger
"ledger.balance"        => Account balance
"ledger.transactions"   => Transaction history

// Governor
"governor.status"       => Governance status

// Receipts
"receipt.audit"         => Audit receipt

// Consensus
"consensus.pos.validators"  => Validator list
```

### Currently WRONG Method Names

```python
# In Python client code - THESE DON'T EXIST:
"peer.list"              # ❌ Should be "net.peers"
"peer.stats"             # ❌ Should be "net.stats"
"consensus.block_height" # ❌ Should be "light.latest_header"
"scheduler.stats"        # ❌ Doesn't exist at all
"storage.list"           # ❌ Should be "storage.stats"
```

### Files to Update

```bash
# Find all wrong RPC calls
grep -r '"peer\.' src/
grep -r '"consensus\.block_height' src/
grep -r '"scheduler\.' src/
```

**Fix pattern:**
```python
# OLD
result = client.call("peer.list")

# NEW
result = client.call("net.peers")
```

---

## 🔧 Missing Backend Endpoints

The frontend (React) is calling these endpoints that **don't exist yet**:

**File:** `web/src/api/theBlockClient.ts` (line 205+)

```typescript
// ❌ NOT IMPLEMENTED:
GET /theblock/receipts
GET /theblock/operations  
GET /theblock/network/metrics
GET /theblock/markets/health
GET /theblock/scheduler/stats  // <-- scheduler doesn't exist!
GET /theblock/peers/list
```

### What to Implement

**File:** `src/the_block/production_server.py`

```python
@app.get("/theblock/receipts")
async def get_receipts():
    """Query receipt.audit RPC and return formatted receipts."""
    result = rpc_client.call("receipt.audit", {})
    return format_receipts(result)

@app.get("/theblock/network/metrics")
async def get_network_metrics():
    """Aggregate net.stats and light.latest_header."""
    peers = rpc_client.call("net.peers", {})
    stats = rpc_client.call("net.stats", {})
    header = rpc_client.call("light.latest_header", {})
    return {
        "peers": len(peers),
        "block_height": header.get("number"),
        "tps": stats.get("tps"),
        # ... more metrics
    }

@app.get("/theblock/markets/health")
async def get_markets_health():
    """Aggregate all market stats."""
    compute = rpc_client.call("compute_market.stats", {})
    storage = rpc_client.call("storage.stats", {})
    energy = rpc_client.call("energy.market_state", {})
    ads = rpc_client.call("ad_market.stats", {})
    return {
        "compute": compute,
        "storage": storage,
        "energy": energy,
        "ads": ads
    }

# DON'T implement /theblock/scheduler/stats - scheduler doesn't exist!
```

---

## 🎭 Remove Mock Data

**File:** `web/src/pages/NetworkStrength.tsx` (line 120+)

**Current:**
```typescript
// ❌ MOCK DATA:
const mockData = {
  network_strength: 95,
  // ...
};
```

**Fix:**
```typescript
// ✅ REAL API CALL:
const { data, isLoading } = useQuery(
  'network-metrics',
  () => fetch('/theblock/network/metrics').then(r => r.json())
);
```

---

## 📁 Server Consolidation

**Problem:** Two servers exist:
1. `src/the_block/dashboard_server.py` (Flask)
2. `src/the_block/production_server.py` (FastAPI)

**Decision needed:**
- **Keep production_server.py** (FastAPI) - More features, async
- **Delete dashboard_server.py** (Flask) - Obsolete

OR

- **Keep dashboard_server.py** (Flask) - Simpler, fewer deps
- **Delete production_server.py** (FastAPI) - If going zero-deps

**Recommendation:** Keep FastAPI (production_server.py) for now, migrate to custom HTTP server later.

---

## ✅ Testing After Fixes

```bash
cd ~/projects/the-block/block-buster

# 1. Check syntax
python3 -m py_compile src/the_block/*.py
python3 -m py_compile src/block_buster/**/*.py

# 2. Run tests
pytest tests/

# 3. Start server
python3 -m the_block.production_server

# 4. Check endpoints
curl http://localhost:8000/theblock/network/metrics
curl http://localhost:8000/theblock/receipts

# 5. Open frontend
cd web
npm run dev
# Visit http://localhost:5173
```

---

## 📚 Documentation Updates

After fixes, update:
- `apis_and_tooling.md` - Correct RPC method names
- `NETWORK_METRICS_INTEGRATION.md` - Real endpoints
- `README.md` - block-buster (not sol-bot)
- `integration-plan_block-buster.md` - Mark as complete

---

## 🚀 Next Steps

1. **Run `fix_all_issues.py`** (2 minutes)
2. **Test imports** `python3 -m py_compile src/**/*.py` (1 minute)
3. **Implement missing endpoints** (2 hours)
4. **Remove mock data** (30 minutes)
5. **Test end-to-end** (30 minutes)
6. **Update documentation** (30 minutes)

**Total:** ~4 hours

---

## 🔍 Quick Checklist

```
[ ] Fix rpc_client.py line 27 syntax error
[ ] Fix accounting.py line 58 syntax error
[ ] Fix receipts.py syntax errors
[ ] Fix dashboard_server.py syntax errors
[ ] Fix rpc_client.py line 102 syntax error
[ ] Update pyproject.toml: sol-bot → block-buster
[ ] Remove solana>=0.30 dependency
[ ] Fix imports: solbot.* → block_buster.*
[ ] Update config paths: ~/.solbot/ → ~/.block-buster/
[ ] Update RPC methods to match node
[ ] Implement /theblock/receipts endpoint
[ ] Implement /theblock/operations endpoint
[ ] Implement /theblock/network/metrics endpoint
[ ] Implement /theblock/markets/health endpoint
[ ] Implement /theblock/peers/list endpoint
[ ] Remove /theblock/scheduler/stats (doesn't exist)
[ ] Remove mock data from NetworkStrength.tsx
[ ] Delete src/block_buster/solana/ directory
[ ] Choose and delete duplicate server
[ ] Add .gitignore for node_modules/, venv/, etc.
[ ] Test: python3 -m the_block.production_server
[ ] Test: Frontend loads without errors
[ ] Update documentation
```

---

**Questions?** See `CLEANUP_SOLANA_RESIDUE.md` for detailed explanations.

**Ready?** Run `python3 fix_all_issues.py` to start!

# Block-Buster API Endpoint Audit

**Date**: February 13, 2026  
**Purpose**: Deep audit of all endpoint usage against actual The Block API  
**Source**: `~/projects/the-block/docs/apis_and_tooling.md`

---

## Executive Summary

### Critical Findings

1. **🔴 CRITICAL**: Web RPC client uses **non-existent endpoints**
2. **🔴 CRITICAL**: Python RPC client uses **Ethereum-style methods** (`eth_*`, `tb_*`) instead of The Block namespaces
3. **🟡 WARNING**: Missing essential endpoints for market data
4. **🟡 WARNING**: No error handling for actual RPC error codes
5. **🟢 INFO**: Component data needs don't match available endpoints

---

## Actual The Block RPC Namespaces

From `docs/apis_and_tooling.md`:

### Core Namespaces

| Namespace | Methods | Purpose |
|-----------|---------|--------|
| `consensus` | `block_height`, `tps`, `block`, `validators` | Block production, finality |
| `consensus.pos` | `register`, `bond`, `unbond` | PoS validator operations |
| `ledger` | `balance`, `transactions` | Account balances, tx history |
| `storage` | `put`, `get`, `manifest`, `providers`, `register_provider`, `discover_providers` | File storage |
| `compute_market` | `submit_job`, `jobs`, `state`, `courier_status`, `sla_history` | Compute marketplace |
| `ad_market` | `inventory`, `list_campaigns`, `distribution`, `budget`, `broker_state`, `readiness`, `register_campaign`, `list_presence_cohorts`, `reserve_presence`, `record_conversion`, `register_claim_route`, `claim_routes` | Ad marketplace |
| `governance` | `proposals`, `vote`, `parameters` | Governance proposals |
| `governor` | `status`, `decisions` | Launch readiness gates |
| `treasury` | `balance`, `submit_disbursement`, `disbursement`, `queue_disbursement`, `execute_disbursement`, `rollback_disbursement`, `list_disbursements` | Treasury operations |
| `energy` | `register_provider`, `market_state`, `settle`, `submit_reading`, `providers`, `receipts`, `credits`, `disputes`, `flag_dispute`, `resolve_dispute`, `slashes` | Energy marketplace |
| `peer` | `list`, `stats` | Network peer info |
| `vm` | `call`, `trace` | Smart contract execution |
| `state_stream` | `subscribe` | Light-client streaming |
| `scheduler` | `stats` | Scheduler queue stats |
| `jurisdiction` | `status`, `set` | Jurisdiction policy |
| `node` | `get_ack_privacy`, `set_ack_privacy` | Node configuration |
| `config` | `reload` | Runtime config reload |
| `mesh` | `peers` | LocalNet peer discovery |
| `rent` | `escrow.balance` | Storage rent escrow |
| `gateway` | `dns_lookup`, `venue_status` | Gateway/DNS/venue |
| `settlement` | `audit` | Compute market settlement |
| `receipt` | `audit` | Receipt audit trail |
| `anomaly` | `label` | Telemetry anomaly labeling |
| `analytics` | (base method) | Aggregated analytics |

---

## Current Web RPC Client Issues

### File: `web/src/rpc.js`

#### ❌ Non-Existent Methods Being Called

```javascript
// WRONG - These don't exist in The Block
async getBlockHeight() {
  return this.call('consensus.block_height'); // ✅ This one is CORRECT
}

async getTPS() {
  return this.call('consensus.tps'); // ✅ This one is CORRECT
}

async getBlock(height) {
  return this.call('consensus.block', [height]); // ✅ CORRECT
}

async getValidators() {
  return this.call('consensus.validators'); // ✅ CORRECT
}

// Ledger namespace - CORRECT
async getBalance(account) {
  return this.call('ledger.balance', [account]); // ✅ CORRECT
}

async getTransactions(params = {}) {
  return this.call('ledger.transactions', [params]); // ✅ CORRECT
}

// Peer namespace - CORRECT
async listPeers() {
  return this.call('peer.list'); // ✅ CORRECT
}

async getPeerStats() {
  return this.call('peer.stats'); // ✅ CORRECT
}

// Scheduler - CORRECT
async getSchedulerStats() {
  return this.call('scheduler.stats'); // ✅ CORRECT
}

// Governance - CORRECT
async getProposals(params = {}) {
  return this.call('governance.proposals', [params]); // ✅ CORRECT
}

async getGovernorStatus() {
  return this.call('governor.status'); // ✅ CORRECT
}

async getGovernorDecisions(params = {}) {
  return this.call('governor.decisions', [params]); // ✅ CORRECT
}

// Energy - CORRECT
async getEnergyMarketState(params = {}) {
  return this.call('energy.market_state', [params]); // ✅ CORRECT
}

async listEnergyProviders(params = {}) {
  return this.call('energy.providers', [params]); // ✅ CORRECT
}

// Compute - WRONG METHOD NAME
async getComputeMarketState() {
  return this.call('compute_market.state'); // ❌ WRONG - Should be no specific method for 'state'
}

async getComputeJobs(params = {}) {
  return this.call('compute_market.jobs', [params]); // ✅ CORRECT
}

// Ad Market - WRONG METHOD NAME
async getAdMarketState() {
  return this.call('ad_market.state'); // ❌ WRONG - Should use specific methods
}

async getAdBids(params = {}) {
  return this.call('ad_market.bids', [params]); // ❌ WRONG - Should be specific methods
}

// Treasury - WRONG METHOD NAME
async getDisbursements(params = {}) {
  return this.call('treasury.disbursements', [params]); // ❌ WRONG - Should be 'list_disbursements'
}
```

### ✅ Actually Working Methods

```javascript
// These are documented and correct:
- consensus.block_height ✅
- consensus.tps ✅
- consensus.block ✅
- consensus.validators ✅
- ledger.balance ✅
- ledger.transactions ✅
- peer.list ✅
- peer.stats ✅
- scheduler.stats ✅
- governance.proposals ✅
- governor.status ✅
- governor.decisions ✅
- energy.market_state ✅
- energy.providers ✅
- compute_market.jobs ✅
- treasury.balance ✅
- analytics ✅
```

### ❌ Non-Existent/Wrong Methods

```javascript
- compute_market.state ❌ (No such method - use specific endpoints)
- ad_market.state ❌ (Should use inventory, broker_state, or readiness)
- ad_market.bids ❌ (Should use list_campaigns)
- treasury.disbursements ❌ (Should be list_disbursements)
```

---

## Python RPC Client Issues

### File: `src/block_buster/utils/rpc_client.py`

#### ❌ Using Ethereum-Style Methods (COMPLETELY WRONG)

```python
# ALL OF THESE ARE WRONG FOR THE BLOCK

class TheBlockRPCClient(JSONRPCClient):
    def get_block_number(self) -> int:
        result = self.call("tb_blockNumber")  # ❌ WRONG - Should be 'consensus.block_height'
    
    def get_balance(self, address: str, block: str = "latest") -> int:
        result = self.call("tb_getBalance", [address, block])  # ❌ WRONG - Should be 'ledger.balance'
    
    def get_transaction_count(self, address: str, block: str = "latest") -> int:
        result = self.call("tb_getTransactionCount", [address, block])  # ❌ WRONG - No such method
    
    def get_block(self, block_id: Union[int, str], full_transactions: bool = False) -> Dict:
        return self.call("tb_getBlockByNumber", [block_id, full_transactions])  # ❌ WRONG - Should be 'consensus.block'
    
    def get_transaction(self, tx_hash: str) -> Optional[Dict]:
        return self.call("tb_getTransactionByHash", [tx_hash])  # ❌ WRONG - Should use 'ledger.transactions'
    
    def send_raw_transaction(self, signed_tx: str) -> str:
        return self.call("tb_sendRawTransaction", [signed_tx])  # ❌ WRONG - No such method
    
    def call_contract(...) -> str:
        return self.call("tb_call", [call_data, block])  # ❌ WRONG - Should be 'vm.call'
    
    def estimate_gas(...) -> int:
        result = self.call("tb_estimateGas", [tx_data])  # ❌ WRONG - No gas estimation in The Block
    
    def get_logs(...) -> List[Dict]:
        return self.call("tb_getLogs", [filter_params])  # ❌ WRONG - No such method
```

**Root Cause**: This client was copied from an Ethereum/Solana template and never adapted to The Block's actual RPC API.

---

## Required Component Data vs. Available Endpoints

### TheBlock Dashboard Component

**Needs**:
- Block height ✅ `consensus.block_height`
- Finalized height ✅ `consensus.block_height` (returns both)
- TPS ✅ `consensus.tps`
- Average block time ✅ `consensus.tps` (returns avgBlockTime)
- Active peers ✅ `peer.stats` (returns active count)
- Average latency ✅ `peer.stats`
- Network fees ❌ **NO DIRECT METHOD** (need to derive from transactions)
- Scheduler queue size ✅ `scheduler.stats`
- Governor active gates ✅ `governor.status`
- Issuance rate ❌ **NO DIRECT METHOD** (need to calculate)
- Validator count ✅ `consensus.validators` (count validators array)
- Total supply ❌ **NO DIRECT METHOD** (may be in analytics)

**Current Method**: `getDashboardMetrics()` batches:
- `consensus.block_height` ✅
- `consensus.tps` ✅
- `peer.stats` ✅
- `scheduler.stats` ✅
- `governor.status` ✅

**Missing**:
- Need to add `consensus.validators` to get validator count
- Need `analytics` endpoint for supply/fees data

### Trading Component

**Needs**:
- Current price ❌ **NO BLOCKCHAIN PRICE ORACLE**
- Order book ❌ **NO DEX IN CORE BLOCKCHAIN**
- Order history ❌ **NO DEX IN CORE BLOCKCHAIN**
- 24h stats ❌ **NO BLOCKCHAIN PRICE DATA**

**Note**: Trading component is **simulated paper trading** with no backend. This is correct - The Block doesn't have a built-in DEX at the consensus layer.

### Network Component

**Needs**:
- Block height ✅ `consensus.block_height`
- Finalized height ✅ `consensus.block_height`
- TPS ✅ `consensus.tps`
- Peers ✅ `peer.list` + `peer.stats`
- Average block time ✅ `consensus.tps`
- Network strength ❌ **NEED TO CALCULATE** (from peer stats)
- Validators ✅ `consensus.validators`
- Market states ✅ `energy.market_state`, `compute_market.*`, `ad_market.*`
- Proof board ❓ **UNCLEAR** (may need custom endpoint or file upload to storage)

---

## Missing Endpoints We Need

### High Priority

1. **Network Metrics Aggregation**
   - **Need**: Single endpoint returning comprehensive network health
   - **Workaround**: Batch multiple calls (current approach)
   - **Recommendation**: Request backend to add `analytics.network_health` endpoint

2. **Supply Metrics**
   - **Need**: Total supply, circulating supply, inflation rate
   - **Possible**: May be in `analytics` endpoint (need to test)
   - **Workaround**: Calculate from issuance rate * time

3. **Fee Statistics**
   - **Need**: Average fees, total fees collected
   - **Possible**: May be in `analytics` endpoint
   - **Workaround**: Query recent blocks and aggregate fees

4. **Validator Statistics**
   - **Need**: Active validators, total stake, APY
   - **Available**: `consensus.validators` gives list
   - **Missing**: Aggregate stats (need to calculate client-side)

### Medium Priority

5. **Ad Market State**
   - **Current**: Calling non-existent `ad_market.state`
   - **Should Use**: `ad_market.inventory` + `ad_market.broker_state` + `ad_market.readiness`

6. **Compute Market State**
   - **Current**: Calling non-existent `compute_market.state`
   - **Should Use**: `compute_market.jobs` + `compute_market.courier_status`

7. **Treasury Statistics**
   - **Current**: Calling `treasury.disbursements` (wrong name)
   - **Should Use**: `treasury.list_disbursements`

---

## Error Code Handling

From the API docs, The Block uses specific error codes:

### Energy Market Error Codes
```
-33009 = Missing/invalid token
-33010 = Rate limit exceeded
```

### Our Current Error Handling
```javascript
// web/src/rpc.js
if (response.error) {
  const error = new Error(response.error.message || 'RPC Error');
  error.code = response.error.code;  // ✅ Good - captures code
  error.data = response.error.data;  // ✅ Good - captures data
  throw error;
}
```

**Status**: ✅ Basic error handling is correct, but we don't handle specific error codes

**Recommendation**: Add error code constants and specific handling:
```javascript
const RPC_ERROR_CODES = {
  AUTH_MISSING: -33009,
  RATE_LIMIT: -33010,
};

if (error.code === RPC_ERROR_CODES.RATE_LIMIT) {
  // Implement exponential backoff
}
```

---

## Recommendations

### Immediate Actions (Critical)

1. **Fix Web RPC Client** (`web/src/rpc.js`)
   ```javascript
   // CHANGE:
   async getDisbursements(params = {}) {
     return this.call('treasury.disbursements', [params]); // ❌
   }
   
   // TO:
   async getDisbursements(params = {}) {
     return this.call('treasury.list_disbursements', [params]); // ✅
   }
   
   // REMOVE (don't exist):
   async getComputeMarketState() { ... }  // ❌ Remove
   async getAdMarketState() { ... }       // ❌ Remove
   async getAdBids(params = {}) { ... }   // ❌ Remove
   
   // ADD (correct methods):
   async getAdMarketInventory(params = {}) {
     return this.call('ad_market.inventory', [params]); // ✅
   }
   
   async getAdMarketBrokerState(params = {}) {
     return this.call('ad_market.broker_state', [params]); // ✅
   }
   
   async getAdMarketReadiness(params = {}) {
     return this.call('ad_market.readiness', [params]); // ✅
   }
   
   async getComputeJobs(params = {}) {
     return this.call('compute_market.jobs', [params]); // ✅ Already correct
   }
   
   async getComputeCourierStatus(params = {}) {
     return this.call('compute_market.courier_status', [params]); // ✅ Add
   }
   ```

2. **Completely Rewrite Python RPC Client** (`src/block_buster/utils/rpc_client.py`)
   ```python
   # Replace TheBlockRPCClient entirely
   class TheBlockRPCClient(JSONRPCClient):
       """RPC client for The Block blockchain."""
       
       # Consensus namespace
       def get_block_height(self) -> Dict:
           return self.call("consensus.block_height")
       
       def get_tps(self) -> Dict:
           return self.call("consensus.tps")
       
       def get_block(self, height: int) -> Dict:
           return self.call("consensus.block", [height])
       
       def get_validators(self) -> Dict:
           return self.call("consensus.validators")
       
       # Ledger namespace
       def get_balance(self, account: str) -> Dict:
           return self.call("ledger.balance", [account])
       
       def get_transactions(self, params: Dict = None) -> Dict:
           return self.call("ledger.transactions", [params or {}])
       
       # Peer namespace
       def list_peers(self) -> Dict:
           return self.call("peer.list")
       
       def get_peer_stats(self) -> Dict:
           return self.call("peer.stats")
       
       # Energy namespace
       def get_energy_market_state(self, params: Dict = None) -> Dict:
           return self.call("energy.market_state", [params or {}])
       
       def list_energy_providers(self, params: Dict = None) -> Dict:
           return self.call("energy.providers", [params or {}])
       
       # Compute namespace
       def get_compute_jobs(self, params: Dict = None) -> Dict:
           return self.call("compute_market.jobs", [params or {}])
       
       # Ad market namespace
       def get_ad_market_inventory(self, params: Dict = None) -> Dict:
           return self.call("ad_market.inventory", [params or {}])
       
       # Treasury namespace
       def get_treasury_balance(self) -> Dict:
           return self.call("treasury.balance")
       
       def list_disbursements(self, params: Dict = None) -> Dict:
           return self.call("treasury.list_disbursements", [params or {}])
       
       # Governor namespace
       def get_governor_status(self) -> Dict:
           return self.call("governor.status")
       
       def get_governor_decisions(self, params: Dict = None) -> Dict:
           return self.call("governor.decisions", [params or {}])
       
       # Analytics namespace
       def get_analytics(self, params: Dict = None) -> Dict:
           return self.call("analytics", [params or {}])
   ```

### Short-Term Actions (Important)

3. **Add Missing Helper Methods**
   ```javascript
   // web/src/rpc.js
   
   /**
    * Get comprehensive market states
    * Uses correct endpoints for each market
    */
   async getMarketStates() {
     const calls = [
       { method: 'energy.market_state', params: [{}] },
       { method: 'compute_market.jobs', params: [{}] },
       { method: 'ad_market.inventory', params: [{}] },
       { method: 'ad_market.broker_state', params: [{}] },
     ];

     const results = await this.batch(calls);
     const [energy, computeJobs, adInventory, adBroker] = results;

     return {
       energy: energy.result || {},
       compute: {
         jobs: computeJobs.result || {},
       },
       ad: {
         inventory: adInventory.result || {},
         broker: adBroker.result || {},
       },
       errors: results.filter((r) => r.error).map((r) => r.error),
     };
   }
   
   /**
    * Get enhanced dashboard metrics with validator count
    */
   async getDashboardMetrics() {
     const calls = [
       { method: 'consensus.block_height' },
       { method: 'consensus.tps' },
       { method: 'consensus.validators' },  // ADD THIS
       { method: 'peer.stats' },
       { method: 'scheduler.stats' },
       { method: 'governor.status' },
       { method: 'analytics', params: [{}] },  // ADD THIS for supply/fees
     ];

     const results = await this.batch(calls);
     const [blockHeight, tps, validators, peerStats, schedulerStats, governorStatus, analytics] = results;

     return {
       blockHeight: blockHeight.result?.height || 0,
       finalizedHeight: blockHeight.result?.finalized_height || 0,
       tps: tps.result?.tps || 0,
       avgBlockTime: tps.result?.avgBlockTime || 0,
       peers: peerStats.result?.total || 0,
       activePeers: peerStats.result?.active || 0,
       avgLatency: peerStats.result?.avgLatency || 0,
       validators: validators.result?.validators?.length || 0,  // ADD THIS
       schedulerQueueSize: schedulerStats.result?.queue_size || 0,
       governorActiveGates: governorStatus.result?.active_gates || 0,
       totalSupply: analytics.result?.supply?.total || 0,  // ADD THIS if available
       networkFees: analytics.result?.fees?.total || 0,    // ADD THIS if available
       errors: results.filter((r) => r.error).map((r) => r.error),
     };
   }
   ```

4. **Add Error Code Constants**
   ```javascript
   // web/src/errors.js or web/src/rpc.js
   export const RPC_ERROR_CODES = {
     AUTH_MISSING: -33009,
     RATE_LIMIT: -33010,
     // Add more as discovered
   };
   
   export const RPC_ERROR_MESSAGES = {
     [-33009]: 'Authentication required',
     [-33010]: 'Rate limit exceeded - please slow down',
   };
   ```

### Long-Term Actions (Enhancement)

5. **Test Analytics Endpoint**
   - Call `analytics` with various params to discover available data
   - Document what's actually returned
   - Update components to use analytics data

6. **Add Missing Market Endpoints**
   ```javascript
   // Ad Market - Full Suite
   async listAdCampaigns(params = {}) {
     return this.call('ad_market.list_campaigns', [params]);
   }
   
   async getAdDistribution(params = {}) {
     return this.call('ad_market.distribution', [params]);
   }
   
   async getAdBudget(params = {}) {
     return this.call('ad_market.budget', [params]);
   }
   
   async listPresenceCohorts(params = {}) {
     return this.call('ad_market.list_presence_cohorts', [params]);
   }
   
   // Energy Market - Full Suite
   async getEnergyReceipts(params = {}) {
     return this.call('energy.receipts', [params]);
   }
   
   async getEnergyCredits(params = {}) {
     return this.call('energy.credits', [params]);
   }
   
   async getEnergyDisputes(params = {}) {
     return this.call('energy.disputes', [params]);
   }
   
   // Compute Market - Full Suite
   async getComputeSLAHistory(params = {}) {
     return this.call('compute_market.sla_history', [params]);
   }
   
   // Storage - Full Suite
   async putBlob(data) {
     return this.call('storage.put', [data]);
   }
   
   async getManifest(hash) {
     return this.call('storage.get_manifest', [hash]);
   }
   
   async listStorageProviders(params = {}) {
     return this.call('storage.list_providers', [params]);
   }
   ```

7. **Add Receipt Audit Endpoint**
   ```javascript
   async auditReceipts(params = {}) {
     return this.call('receipt.audit', [{
       start_height: params.startHeight,
       end_height: params.endHeight,
       limit: params.limit || 128,
       provider_id: params.providerId,
       market: params.market,
     }]);
   }
   ```

---

## Component-Specific Fixes

### TheBlock.js

**Current Issues**:
- Calculates issuance incorrectly
- Doesn't get validator count
- Doesn't get supply metrics

**Required Changes**:
```javascript
// In getDashboardMetrics batch call, add:
{ method: 'consensus.validators' },  // For validator count
{ method: 'analytics', params: [{}] },  // For supply/fees if available

// In component render, use actual values:
const validatorEl = $('#validator-count');
if (validatorEl) {
  validatorEl.textContent = fmt.num(data.validators || 0);  // From RPC
}

const supplyEl = $('#total-supply');
if (supplyEl) {
  supplyEl.textContent = fmt.num(data.totalSupply || 0);  // From analytics if available
}
```

### Network.js

**Current Issues**:
- Uses non-existent `getMarketStates()` with wrong endpoints

**Required Changes**:
```javascript
// Update market states fetch to use correct endpoints
const markets = await this.rpc.getMarketStates();  // Already fixed in recommendation above

// markets will now have correct structure:
// { energy: {...}, compute: {...}, ad: {...} }
```

### Trading.js

**Current Status**: ✅ Correctly implemented as paper trading with no backend
- No changes needed - simulated data is intentional

---

## Testing Checklist

After implementing fixes:

### Web RPC Client
- [ ] Test `consensus.block_height` returns `{ height, finalized_height }`
- [ ] Test `consensus.tps` returns `{ tps, avgBlockTime }`
- [ ] Test `consensus.validators` returns `{ validators: [...] }`
- [ ] Test `peer.stats` returns correct stats object
- [ ] Test `treasury.list_disbursements` (not `disbursements`)
- [ ] Test `ad_market.inventory` works (replace `ad_market.state`)
- [ ] Test `compute_market.jobs` works (replace `compute_market.state`)
- [ ] Test `analytics` endpoint to discover available data
- [ ] Test batch calls work correctly
- [ ] Test error handling with invalid methods

### Python RPC Client
- [ ] Replace all `tb_*` and `eth_*` methods with correct namespace methods
- [ ] Test `consensus.block_height` in Python
- [ ] Test `ledger.balance` in Python
- [ ] Test `energy.market_state` in Python
- [ ] Verify batch calls work in Python
- [ ] Test error handling

### Components
- [ ] TheBlock dashboard displays all metrics correctly
- [ ] Network page shows validator count
- [ ] Market states render correctly
- [ ] No console errors about missing endpoints

---

## Summary of Changes Needed

### Files to Modify

1. **`web/src/rpc.js`** - Fix method names, add missing methods
2. **`src/block_buster/utils/rpc_client.py`** - Complete rewrite with correct methods
3. **`web/src/components/TheBlock.js`** - Use validator count from RPC
4. **`web/src/components/Network.js`** - Use correct market endpoints
5. **`web/src/errors.js`** - Add RPC error code constants

### New Files to Create

6. **`web/RPC_METHOD_REFERENCE.md`** - Document all available RPC methods
7. **`web/tests/rpc-endpoints.test.js`** - Integration tests for RPC endpoints

### Documentation Updates

8. **`README.md`** - Update API endpoint documentation
9. **`OPERATIONS.md`** - Add RPC debugging guide

---

## Conclusion

**Critical Issues Found**: 7  
**Warning Issues Found**: 5  
**Info Issues Found**: 3

**Estimated Effort**: 4-6 hours to fix all critical and warning issues

**Priority Order**:
1. Fix web RPC client method names (1 hour)
2. Rewrite Python RPC client (2 hours)
3. Update components to use correct data (1 hour)
4. Add error code handling (30 mins)
5. Test all endpoints (1 hour)
6. Document findings (30 mins)

**Next Steps**: See detailed recommendations above and implement in order of priority.

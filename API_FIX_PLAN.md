# API Endpoint Fix Plan - Block-Buster

**Date**: February 13, 2026  
**Status**: Ready for Implementation  
**Estimated Time**: 4-6 hours  
**Dependencies**: None (all changes in block-buster only)

---

## Executive Summary

This plan details the exact changes needed to align block-buster's RPC clients with The Block's actual API. All changes are confined to the `~/projects/the-block/block-buster` directory - **no changes to the core blockchain code**.

**Critical Findings**:
- Web RPC client uses some non-existent endpoint names
- Python RPC client uses completely wrong Ethereum-style methods
- Components request data that doesn't exist in current API

---

## Phase 1: Fix Web RPC Client (Priority: CRITICAL)

### File: `web/src/rpc.js`

#### Changes Required

##### 1. Fix Treasury Method Name

**WRONG**:
```javascript
async getDisbursements(params = {}) {
  return this.call('treasury.disbursements', [params]);
}
```

**CORRECT**:
```javascript
async getDisbursements(params = {}) {
  return this.call('treasury.list_disbursements', [params]);
}
```

##### 2. Remove Non-Existent Methods

**DELETE** these methods:
```javascript
// ❌ Remove - no such method
async getComputeMarketState() {
  return this.call('compute_market.state');
}

// ❌ Remove - no such method  
async getAdMarketState() {
  return this.call('ad_market.state');
}

// ❌ Remove - wrong method name
async getAdBids(params = {}) {
  return this.call('ad_market.bids', [params]);
}
```

##### 3. Add Correct Ad Market Methods

**ADD** after the Energy namespace section:
```javascript
// ========== Ad Market Namespace ==========

/**
 * Get ad market inventory
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async getAdMarketInventory(params = {}) {
  return this.call('ad_market.inventory', [params]);
}

/**
 * Get ad market broker state
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async getAdMarketBrokerState(params = {}) {
  return this.call('ad_market.broker_state', [params]);
}

/**
 * Get ad market readiness
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async getAdMarketReadiness(params = {}) {
  return this.call('ad_market.readiness', [params]);
}

/**
 * List ad campaigns
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async listAdCampaigns(params = {}) {
  return this.call('ad_market.list_campaigns', [params]);
}
```

##### 4. Add Correct Compute Market Methods

**ADD** after the Ad Market namespace section:
```javascript
// Note: getComputeJobs already exists and is correct

/**
 * Get compute courier status
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async getComputeCourierStatus(params = {}) {
  return this.call('compute_market.courier_status', [params]);
}

/**
 * Get compute SLA history
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async getComputeSLAHistory(params = {}) {
  return this.call('compute_market.sla_history', [params]);
}
```

##### 5. Update getDashboardMetrics Helper

**REPLACE** the existing method with:
```javascript
/**
 * Get comprehensive dashboard metrics
 * Batches multiple RPC calls for efficiency
 * @returns {Promise<DashboardMetrics>}
 */
async getDashboardMetrics() {
  const calls = [
    { method: 'consensus.block_height' },
    { method: 'consensus.tps' },
    { method: 'consensus.validators' },  // ✨ ADDED
    { method: 'peer.stats' },
    { method: 'scheduler.stats' },
    { method: 'governor.status' },
    { method: 'analytics', params: [{}] },  // ✨ ADDED
  ];

  const results = await this.batch(calls);

  // Transform batch results into structured object
  const [blockHeight, tps, validators, peerStats, schedulerStats, governorStatus, analytics] = results;

  return {
    blockHeight: blockHeight.result?.height || 0,
    finalizedHeight: blockHeight.result?.finalized_height || 0,
    tps: tps.result?.tps || 0,
    avgBlockTime: tps.result?.avgBlockTime || 0,
    peers: peerStats.result?.total || 0,
    activePeers: peerStats.result?.active || 0,
    avgLatency: peerStats.result?.avgLatency || 0,
    validatorCount: validators.result?.validators?.length || 0,  // ✨ ADDED
    schedulerQueueSize: schedulerStats.result?.queue_size || 0,
    governorActiveGates: governorStatus.result?.active_gates || 0,
    
    // Analytics data (if available)
    totalSupply: analytics.result?.supply?.total || null,  // ✨ ADDED
    circulatingSupply: analytics.result?.supply?.circulating || null,  // ✨ ADDED
    networkFees: analytics.result?.fees?.total || null,  // ✨ ADDED
    
    errors: results.filter((r) => r.error).map((r) => r.error),
  };
}
```

##### 6. Update getMarketStates Helper

**REPLACE** the existing method with:
```javascript
/**
 * Get market states (energy, compute, ad)
 * @returns {Promise<MarketStates>}
 */
async getMarketStates() {
  const calls = [
    { method: 'energy.market_state', params: [{}] },
    { method: 'compute_market.jobs', params: [{}] },
    { method: 'ad_market.inventory', params: [{}] },  // ✨ CHANGED from ad_market.state
    { method: 'ad_market.broker_state', params: [{}] },  // ✨ ADDED
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
```

##### 7. Add Storage Namespace Methods

**ADD** new section:
```javascript
// ========== Storage Namespace ==========

/**
 * Put blob to storage
 * @param {Object} data - Blob data
 * @returns {Promise<Object>}
 */
async putBlob(data) {
  return this.call('storage.put', [data]);
}

/**
 * Get storage manifest
 * @param {string} hash - Blob hash
 * @returns {Promise<Object>}
 */
async getManifest(hash) {
  return this.call('storage.get_manifest', [hash]);
}

/**
 * List storage providers
 * @param {Object} [params={}] - Query parameters
 * @returns {Promise<Object>}
 */
async listStorageProviders(params = {}) {
  return this.call('storage.list_providers', [params]);
}

/**
 * Discover storage providers
 * @param {Object} params - Discovery parameters
 * @returns {Promise<Object>}
 */
async discoverStorageProviders(params) {
  return this.call('storage.discover_providers', [params]);
}
```

##### 8. Update TypeScript Type Definitions

**UPDATE** the typedef for `DashboardMetrics`:
```javascript
/**
 * @typedef {Object} DashboardMetrics
 * @property {number} blockHeight - Current block height
 * @property {number} finalizedHeight - Finalized height
 * @property {number} tps - Transactions per second
 * @property {number} avgBlockTime - Average block time
 * @property {number} peers - Total peers
 * @property {number} activePeers - Active peers
 * @property {number} avgLatency - Average latency
 * @property {number} validatorCount - Number of validators
 * @property {number} schedulerQueueSize - Scheduler queue size
 * @property {number} governorActiveGates - Active governor gates
 * @property {number|null} totalSupply - Total supply (from analytics)
 * @property {number|null} circulatingSupply - Circulating supply (from analytics)
 * @property {number|null} networkFees - Network fees (from analytics)
 * @property {Array} errors - Any RPC errors encountered
 */
```

**UPDATE** the typedef for `MarketStates`:
```javascript
/**
 * @typedef {Object} MarketStates
 * @property {Object} energy - Energy market state
 * @property {Object} compute - Compute market state
 * @property {Object} compute.jobs - Compute jobs
 * @property {Object} ad - Ad market state
 * @property {Object} ad.inventory - Ad inventory
 * @property {Object} ad.broker - Ad broker state
 * @property {Array} errors - Any RPC errors encountered
 */
```

---

## Phase 2: Rewrite Python RPC Client (Priority: CRITICAL)

### File: `src/block_buster/utils/rpc_client.py`

#### Complete Replacement

**REPLACE** the entire `TheBlockRPCClient` class with:

```python
class TheBlockRPCClient(JSONRPCClient):
    """RPC client for The Block blockchain.
    
    Provides The Block-specific RPC methods using correct namespaces.
    All methods match the actual The Block JSON-RPC API.
    
    Example:
        client = TheBlockRPCClient("http://localhost:3050")
        block_info = client.get_block_height()
        print(f"Height: {block_info['height']}")
    """
    
    # ========== Consensus Namespace ==========
    
    def get_block_height(self) -> Dict:
        """Get current block height and finalized height.
        
        Returns:
            Dict with 'height' and 'finalized_height'
        """
        return self.call("consensus.block_height")
    
    def get_tps(self) -> Dict:
        """Get transactions per second and average block time.
        
        Returns:
            Dict with 'tps' and 'avgBlockTime'
        """
        return self.call("consensus.tps")
    
    def get_block(self, height: int) -> Dict:
        """Get block by height.
        
        Args:
            height: Block height
        
        Returns:
            Block data including transactions
        """
        return self.call("consensus.block", [height])
    
    def get_validators(self) -> Dict:
        """Get list of validators.
        
        Returns:
            Dict with 'validators' array
        """
        return self.call("consensus.validators")
    
    # ========== Ledger Namespace ==========
    
    def get_balance(self, account: str) -> Dict:
        """Get account balance.
        
        Args:
            account: Account address
        
        Returns:
            Dict with 'account', 'balance', 'nonce'
        """
        return self.call("ledger.balance", [account])
    
    def get_transactions(self, params: Optional[Dict] = None) -> Dict:
        """Get transactions with optional filters.
        
        Args:
            params: Query parameters (account, limit, offset)
        
        Returns:
            Dict with 'transactions', 'total', 'limit', 'offset'
        """
        return self.call("ledger.transactions", [params or {}])
    
    # ========== Peer Namespace ==========
    
    def list_peers(self) -> Dict:
        """List all connected peers.
        
        Returns:
            Dict with 'peers' array
        """
        return self.call("peer.list")
    
    def get_peer_stats(self) -> Dict:
        """Get peer statistics.
        
        Returns:
            Dict with 'total', 'active', 'avgLatency', 'bandwidth'
        """
        return self.call("peer.stats")
    
    # ========== Scheduler Namespace ==========
    
    def get_scheduler_stats(self) -> Dict:
        """Get scheduler queue statistics.
        
        Returns:
            Dict with 'queue_size', 'active_jobs'
        """
        return self.call("scheduler.stats")
    
    # ========== Governance Namespace ==========
    
    def get_proposals(self, params: Optional[Dict] = None) -> Dict:
        """Get governance proposals.
        
        Args:
            params: Query parameters
        
        Returns:
            Dict with 'proposals' array
        """
        return self.call("governance.proposals", [params or {}])
    
    # ========== Governor Namespace ==========
    
    def get_governor_status(self) -> Dict:
        """Get governor status.
        
        Returns:
            Dict with 'active_gates', 'gates', 'economics_prev_market_metrics'
        """
        return self.call("governor.status")
    
    def get_governor_decisions(self, params: Optional[Dict] = None) -> Dict:
        """Get governor decisions.
        
        Args:
            params: Query parameters
        
        Returns:
            Dict with 'decisions' array
        """
        return self.call("governor.decisions", [params or {}])
    
    # ========== Energy Namespace ==========
    
    def get_energy_market_state(self, params: Optional[Dict] = None) -> Dict:
        """Get energy market state.
        
        Args:
            params: Optional filters (provider_id, etc.)
        
        Returns:
            Energy market snapshot
        """
        return self.call("energy.market_state", [params or {}])
    
    def list_energy_providers(self, params: Optional[Dict] = None) -> Dict:
        """List energy providers.
        
        Args:
            params: Optional filters
        
        Returns:
            Dict with 'providers' array
        """
        return self.call("energy.providers", [params or {}])
    
    def get_energy_receipts(self, params: Optional[Dict] = None) -> Dict:
        """Get energy receipts.
        
        Args:
            params: Optional filters
        
        Returns:
            Dict with receipts
        """
        return self.call("energy.receipts", [params or {}])
    
    def get_energy_disputes(self, params: Optional[Dict] = None) -> Dict:
        """Get energy disputes.
        
        Args:
            params: Optional filters
        
        Returns:
            Dict with disputes
        """
        return self.call("energy.disputes", [params or {}])
    
    # ========== Compute Market Namespace ==========
    
    def get_compute_jobs(self, params: Optional[Dict] = None) -> Dict:
        """Get compute jobs.
        
        Args:
            params: Optional filters
        
        Returns:
            Dict with 'jobs' array
        """
        return self.call("compute_market.jobs", [params or {}])
    
    def get_compute_courier_status(self, params: Optional[Dict] = None) -> Dict:
        """Get compute courier status.
        
        Args:
            params: Optional filters
        
        Returns:
            Courier status snapshot
        """
        return self.call("compute_market.courier_status", [params or {}])
    
    def get_compute_sla_history(self, params: Optional[Dict] = None) -> Dict:
        """Get compute SLA history.
        
        Args:
            params: Optional limit and filters
        
        Returns:
            Dict with SLA history
        """
        return self.call("compute_market.sla_history", [params or {}])
    
    # ========== Ad Market Namespace ==========
    
    def get_ad_market_inventory(self, params: Optional[Dict] = None) -> Dict:
        """Get ad market inventory.
        
        Args:
            params: Optional filters
        
        Returns:
            Ad inventory snapshot
        """
        return self.call("ad_market.inventory", [params or {}])
    
    def get_ad_market_broker_state(self, params: Optional[Dict] = None) -> Dict:
        """Get ad market broker state.
        
        Args:
            params: Optional filters
        
        Returns:
            Broker state snapshot
        """
        return self.call("ad_market.broker_state", [params or {}])
    
    def get_ad_market_readiness(self, params: Optional[Dict] = None) -> Dict:
        """Get ad market readiness.
        
        Args:
            params: Optional filters
        
        Returns:
            Readiness snapshot
        """
        return self.call("ad_market.readiness", [params or {}])
    
    def list_ad_campaigns(self, params: Optional[Dict] = None) -> Dict:
        """List ad campaigns.
        
        Args:
            params: Optional filters
        
        Returns:
            Dict with campaigns
        """
        return self.call("ad_market.list_campaigns", [params or {}])
    
    # ========== Treasury Namespace ==========
    
    def get_treasury_balance(self) -> Dict:
        """Get treasury balance.
        
        Returns:
            Dict with balance and allocations
        """
        return self.call("treasury.balance")
    
    def list_disbursements(self, params: Optional[Dict] = None) -> Dict:
        """List treasury disbursements.
        
        Args:
            params: Optional cursor, status, limit
        
        Returns:
            Dict with disbursements
        """
        return self.call("treasury.list_disbursements", [params or {}])
    
    # ========== Storage Namespace ==========
    
    def put_blob(self,  Dict) -> Dict:
        """Put blob to storage.
        
        Args:
             Blob data
        
        Returns:
            Storage receipt
        """
        return self.call("storage.put", [data])
    
    def get_manifest(self, hash_str: str) -> Dict:
        """Get storage manifest.
        
        Args:
            hash_str: Blob hash
        
        Returns:
            Manifest data
        """
        return self.call("storage.get_manifest", [hash_str])
    
    def list_storage_providers(self, params: Optional[Dict] = None) -> Dict:
        """List storage providers.
        
        Args:
            params: Optional filters
        
        Returns:
            Dict with providers
        """
        return self.call("storage.list_providers", [params or {}])
    
    # ========== VM Namespace ==========
    
    def vm_call(self, contract: str, method: str, args: List, block: Optional[str] = None) -> Dict:
        """Call smart contract method (read-only).
        
        Args:
            contract: Contract address
            method: Method name
            args: Method arguments
            block: Optional block height or tag
        
        Returns:
            Call result
        """
        call_data = {
            "contract": contract,
            "method": method,
            "args": args,
        }
        if block:
            call_data["block"] = block
        
        return self.call("vm.call", [call_data])
    
    # ========== Analytics Namespace ==========
    
    def get_analytics(self, params: Optional[Dict] = None) -> Dict:
        """Get aggregated analytics.
        
        Args:
            params: Optional filters and parameters
        
        Returns:
            Analytics data
        """
        return self.call("analytics", [params or {}])
    
    # ========== Helper Methods ==========
    
    def get_dashboard_metrics(self) -> Dict:
        """Get comprehensive dashboard metrics.
        
        Batches multiple RPC calls for efficiency.
        
        Returns:
            Dict with all dashboard metrics
        """
        results = self.batch_call([
            ("consensus.block_height", []),
            ("consensus.tps", []),
            ("consensus.validators", []),
            ("peer.stats", []),
            ("scheduler.stats", []),
            ("governor.status", []),
            ("analytics", [{}]),
        ])
        
        # Handle any errors in batch
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"Warning: Batch call {i} failed: {result}")
        
        # Extract results (handle potential errors)
        block_height = results[0] if not isinstance(results[0], Exception) else {}
        tps = results[1] if not isinstance(results[1], Exception) else {}
        validators = results[2] if not isinstance(results[2], Exception) else {}
        peer_stats = results[3] if not isinstance(results[3], Exception) else {}
        scheduler = results[4] if not isinstance(results[4], Exception) else {}
        governor = results[5] if not isinstance(results[5], Exception) else {}
        analytics = results[6] if not isinstance(results[6], Exception) else {}
        
        return {
            "blockHeight": block_height.get("height", 0),
            "finalizedHeight": block_height.get("finalized_height", 0),
            "tps": tps.get("tps", 0),
            "avgBlockTime": tps.get("avgBlockTime", 0),
            "peers": peer_stats.get("total", 0),
            "activePeers": peer_stats.get("active", 0),
            "avgLatency": peer_stats.get("avgLatency", 0),
            "validatorCount": len(validators.get("validators", [])),
            "schedulerQueueSize": scheduler.get("queue_size", 0),
            "governorActiveGates": governor.get("active_gates", 0),
            "totalSupply": analytics.get("supply", {}).get("total"),
            "networkFees": analytics.get("fees", {}).get("total"),
        }
```

**DELETE** all old Ethereum-style methods (`get_transaction_count`, `send_raw_transaction`, `call_contract`, `estimate_gas`, `get_logs`).

---

## Phase 3: Update Components (Priority: HIGH)

### File: `web/src/components/TheBlock.js`

#### Changes Required

**UPDATE** the `updateMetrics` method to use validator count:

```javascript
const validatorEl = $('#validator-count');
if (validatorEl) {
  // ✨ CHANGED: Use actual validator count from RPC
  validatorEl.textContent = fmt.num(data.validatorCount || 0);
}

const supplyEl = $('#total-supply');
if (supplyEl) {
  // ✨ CHANGED: Use actual supply from analytics if available
  if (data.totalSupply !== null) {
    supplyEl.textContent = fmt.num(data.totalSupply);
  } else {
    supplyEl.textContent = '—';
  }
}
```

### File: `web/src/components/Network.js`

**No changes needed** - the component already correctly calls `getMarketStates()`, which we're fixing in the RPC client.

---

## Phase 4: Add Error Handling (Priority: MEDIUM)

### File: `web/src/errors.js` (or create if doesn't exist)

**ADD** RPC error code constants:

```javascript
/**
 * The Block RPC Error Codes
 * Source: docs/apis_and_tooling.md
 */
export const RPC_ERROR_CODES = {
  AUTH_MISSING: -33009,
  RATE_LIMIT: -33010,
};

export const RPC_ERROR_MESSAGES = {
  [-33009]: 'Authentication required - missing or invalid token',
  [-33010]: 'Rate limit exceeded - please slow down requests',
};

/**
 * Get user-friendly error message for RPC error code
 * @param {number} code - RPC error code
 * @returns {string} User-friendly message
 */
export function getRpcErrorMessage(code) {
  return RPC_ERROR_MESSAGES[code] || `RPC Error ${code}`;
}
```

### File: `web/src/rpc.js`

**UPDATE** error handling in the `call` method:

```javascript
import { RPC_ERROR_CODES, getRpcErrorMessage } from './errors.js';

// ... in the call() method:

if (response.error) {
  const error = new Error(
    getRpcErrorMessage(response.error.code) || response.error.message || 'RPC Error'
  );
  error.code = response.error.code;
  error.data = response.error.data;
  
  // ✨ ADD: Special handling for rate limits
  if (error.code === RPC_ERROR_CODES.RATE_LIMIT) {
    console.warn('[RpcClient] Rate limit exceeded - implement backoff');
    // TODO: Implement exponential backoff
  }
  
  throw error;
}
```

---

## Phase 5: Testing & Validation (Priority: HIGH)

### Create Test File: `web/tests/rpc-endpoints.test.js`

```javascript
/**
 * RPC Endpoint Integration Tests
 * Tests that all RPC methods work against actual node
 */

import RpcClient from '../src/rpc.js';

const RPC_URL = process.env.RPC_URL || 'http://localhost:3050';

describe('RPC Client - Consensus Namespace', () => {
  let rpc;
  
  beforeEach(() => {
    rpc = new RpcClient(RPC_URL);
  });
  
  test('getBlockHeight returns height and finalized_height', async () => {
    const result = await rpc.getBlockHeight();
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('finalized_height');
    expect(typeof result.height).toBe('number');
  });
  
  test('getTPS returns tps and avgBlockTime', async () => {
    const result = await rpc.getTPS();
    expect(result).toHaveProperty('tps');
    expect(result).toHaveProperty('avgBlockTime');
  });
  
  test('getValidators returns validators array', async () => {
    const result = await rpc.getValidators();
    expect(result).toHaveProperty('validators');
    expect(Array.isArray(result.validators)).toBe(true);
  });
});

describe('RPC Client - Treasury Namespace', () => {
  let rpc;
  
  beforeEach(() => {
    rpc = new RpcClient(RPC_URL);
  });
  
  test('getDisbursements uses correct method name', async () => {
    // This should NOT throw an error about unknown method
    const result = await rpc.getDisbursements();
    expect(result).toBeDefined();
  });
});

describe('RPC Client - Market States', () => {
  let rpc;
  
  beforeEach(() => {
    rpc = new RpcClient(RPC_URL);
  });
  
  test('getMarketStates uses correct endpoints', async () => {
    const result = await rpc.getMarketStates();
    expect(result).toHaveProperty('energy');
    expect(result).toHaveProperty('compute');
    expect(result).toHaveProperty('ad');
    expect(result.ad).toHaveProperty('inventory');
    expect(result.ad).toHaveProperty('broker');
  });
});

describe('RPC Client - Batch Calls', () => {
  let rpc;
  
  beforeEach(() => {
    rpc = new RpcClient(RPC_URL);
  });
  
  test('getDashboardMetrics returns all metrics', async () => {
    const result = await rpc.getDashboardMetrics();
    expect(result).toHaveProperty('blockHeight');
    expect(result).toHaveProperty('tps');
    expect(result).toHaveProperty('validatorCount');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
```

### Python Test File: `tests/test_rpc_client.py`

```python
"""Test The Block RPC client."""

import os
import pytest
from block_buster.utils.rpc_client import TheBlockRPCClient

RPC_URL = os.getenv("RPC_URL", "http://localhost:3050")


@pytest.fixture
def rpc():
    return TheBlockRPCClient(RPC_URL)


def test_get_block_height(rpc):
    """Test consensus.block_height."""
    result = rpc.get_block_height()
    assert "height" in result
    assert "finalized_height" in result
    assert isinstance(result["height"], int)


def test_get_tps(rpc):
    """Test consensus.tps."""
    result = rpc.get_tps()
    assert "tps" in result
    assert "avgBlockTime" in result


def test_get_validators(rpc):
    """Test consensus.validators."""
    result = rpc.get_validators()
    assert "validators" in result
    assert isinstance(result["validators"], list)


def test_get_balance(rpc):
    """Test ledger.balance."""
    # Use a known test address or skip if not available
    try:
        result = rpc.get_balance("test-account")
        assert "balance" in result
    except Exception:
        pytest.skip("No test account available")


def test_list_peers(rpc):
    """Test peer.list."""
    result = rpc.list_peers()
    assert "peers" in result
    assert isinstance(result["peers"], list)


def test_get_peer_stats(rpc):
    """Test peer.stats."""
    result = rpc.get_peer_stats()
    assert "total" in result
    assert "active" in result


def test_list_disbursements(rpc):
    """Test treasury.list_disbursements (not treasury.disbursements)."""
    result = rpc.list_disbursements()
    assert result is not None  # May be empty but shouldn't error


def test_get_dashboard_metrics(rpc):
    """Test helper method for dashboard metrics."""
    result = rpc.get_dashboard_metrics()
    assert "blockHeight" in result
    assert "tps" in result
    assert "validatorCount" in result
```

---

## Phase 6: Documentation Updates (Priority: MEDIUM)

### File: `web/RPC_METHOD_REFERENCE.md` (NEW)

```markdown
# The Block RPC Method Reference

Complete reference of all available RPC methods for block-buster integration.

## Consensus Namespace

### consensus.block_height
**Returns**: `{ height: number, finalized_height: number }`

### consensus.tps
**Returns**: `{ tps: number, avgBlockTime: number }`

### consensus.block
**Params**: `[height: number]`  
**Returns**: Block data with transactions

### consensus.validators
**Returns**: `{ validators: Array }`

## Ledger Namespace

### ledger.balance
**Params**: `[account: string]`  
**Returns**: `{ account: string, balance: number, nonce: number }`

### ledger.transactions
**Params**: `[{ account?: string, limit?: number, offset?: number }]`  
**Returns**: `{ transactions: Array, total: number }`

[... etc for all namespaces ...]
```

### Update: `README.md`

Add section on RPC endpoints:

```markdown
## RPC Integration

Block-buster uses The Block's JSON-RPC API. See `web/RPC_METHOD_REFERENCE.md` for complete method documentation.

### Quick Example

```javascript
import RpcClient from './src/rpc.js';

const rpc = new RpcClient('http://localhost:3050');
const metrics = await rpc.getDashboardMetrics();
console.log(`TPS: ${metrics.tps}`);
```

### Python Example

```python
from block_buster.utils.rpc_client import TheBlockRPCClient

rpc = TheBlockRPCClient("http://localhost:3050")
metrics = rpc.get_dashboard_metrics()
print(f"TPS: {metrics['tps']}")
```
```

---

## Implementation Checklist

### Phase 1: Web RPC Client
- [ ] Fix `getDisbursements` method name
- [ ] Remove non-existent methods (`getComputeMarketState`, `getAdMarketState`, `getAdBids`)
- [ ] Add correct Ad Market methods
- [ ] Add correct Compute Market methods
- [ ] Update `getDashboardMetrics` to include validators and analytics
- [ ] Update `getMarketStates` to use correct endpoints
- [ ] Add Storage namespace methods
- [ ] Update TypeScript type definitions

### Phase 2: Python RPC Client
- [ ] Replace entire `TheBlockRPCClient` class
- [ ] Remove all Ethereum-style methods
- [ ] Add all The Block namespace methods
- [ ] Add `get_dashboard_metrics` helper
- [ ] Test all methods

### Phase 3: Components
- [ ] Update `TheBlock.js` to use validator count
- [ ] Update `TheBlock.js` to use supply from analytics
- [ ] Verify `Network.js` works with fixed RPC client

### Phase 4: Error Handling
- [ ] Create `web/src/errors.js` with error codes
- [ ] Update RPC client error handling
- [ ] Add rate limit detection

### Phase 5: Testing
- [ ] Create `web/tests/rpc-endpoints.test.js`
- [ ] Create `tests/test_rpc_client.py`
- [ ] Run all tests against local node
- [ ] Fix any failing tests

### Phase 6: Documentation
- [ ] Create `web/RPC_METHOD_REFERENCE.md`
- [ ] Update `README.md` with RPC examples
- [ ] Update `OPERATIONS.md` if needed

---

## Testing Commands

```bash
# JavaScript tests (requires running node)
export RPC_URL=http://localhost:3050
npm test web/tests/rpc-endpoints.test.js

# Python tests (requires running node)
export RPC_URL=http://localhost:3050
pytest tests/test_rpc_client.py -v

# Manual verification
node -e "import('./web/src/rpc.js').then(m => new m.default('http://localhost:3050').getDashboardMetrics().then(console.log))"
```

---

## Rollback Plan

If issues are discovered:

1. **Web RPC Client**: Git revert changes to `web/src/rpc.js`
2. **Python RPC Client**: Git revert changes to `src/block_buster/utils/rpc_client.py`
3. **Components**: Git revert changes to component files

All changes are isolated to block-buster repository - no risk to core blockchain.

---

## Success Criteria

- [ ] All RPC methods use correct namespace.method format
- [ ] No calls to non-existent endpoints
- [ ] Components display all available data
- [ ] No console errors about missing methods
- [ ] All tests pass
- [ ] Documentation is complete and accurate

---

## Time Estimates

- **Phase 1**: 1.5 hours
- **Phase 2**: 2 hours
- **Phase 3**: 30 minutes
- **Phase 4**: 30 minutes
- **Phase 5**: 1 hour
- **Phase 6**: 30 minutes

**Total**: ~6 hours

---

## Next Steps

1. Review this plan
2. Begin with Phase 1 (Web RPC Client fixes)
3. Test each phase before moving to next
4. Update this document with any discovered issues
5. Mark checkboxes as complete

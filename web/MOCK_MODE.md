# Mock Mode - Local Development Without Backend

**Date**: February 12, 2026, 5:57 PM EST  
**Status**: ✅ SHIPPED  
**Purpose**: Develop frontend without running blockchain node

---

## Overview

Mock Mode provides realistic fake data for local development when the blockchain backend is unavailable. Perfect for:

- Frontend development without backend dependency
- UI/UX iteration without infrastructure
- Component testing with realistic data
- Demo/presentation mode
- Onboarding new developers

---

## Quick Start

### Enable Mock Mode

**Browser Console**:
```javascript
features.enable('mock_rpc');
location.reload();
```

**Or use helper**:
```javascript
window.enableMockMode();
location.reload();
```

### Disable Mock Mode

```javascript
features.disable('mock_rpc');
location.reload();
```

**Or use helper**:
```javascript
window.disableMockMode();
location.reload();
```

---

## Features

### ✅ Realistic Data

- **Deterministic but varying**: Values change over time like real blockchain
- **Block height increments**: Every 2 seconds (simulated block time)
- **TPS variance**: 1080-1440 TPS with realistic fluctuation
- **Latency simulation**: 50-150ms network delay
- **Peer stats**: Realistic peer counts, latency, bandwidth

### ✅ Complete API Coverage

All RPC namespaces mocked:
- ✅ Consensus (block height, TPS, blocks, validators)
- ✅ Ledger (balances, transactions)
- ✅ Peer (peer list, stats)
- ✅ Scheduler (queue stats)
- ✅ Governance (proposals, votes)
- ✅ Governor (status, decisions)
- ✅ Energy (market state, providers)
- ✅ Compute Market (jobs, state)
- ✅ Ad Market (bids, state)
- ✅ Treasury (balance, disbursements)
- ✅ Analytics (aggregated stats)

### ✅ Batch Requests

Supports batched RPC calls just like real backend:
```javascript
const metrics = await mockRpc.getDashboardMetrics();
// Batches 5 RPC calls in single request
```

### ✅ Error Handling

Throws appropriate errors for unknown methods:
```javascript
try {
  await mockRpc.call('invalid.method');
} catch (error) {
  // "Mock handler not found for method: invalid.method"
}
```

---

## How It Works

### Architecture

```
main.js
  ↓
initializeRpcClient()
  ↓
features.isEnabled('mock_rpc') ?
  ├─ YES → new MockRpcClient()
  └─ NO  → new RpcClient()
  ↓
Components use rpc.getDashboardMetrics()
  ↓
Mock data returned (no backend required)
```

### Mock Data Generation

**Time-based variance**:
```javascript
getMockBlockHeight() {
  const elapsed = Math.floor((Date.now() - this.startTime) / 2000);
  return 100000 + elapsed; // Increments every 2s
}

getMockMetrics() {
  const variance = () => 0.9 + Math.random() * 0.2; // ±10%
  return {
    tps: Math.floor(1200 * variance()),
    avgLatency: Math.floor(20 * variance()),
  };
}
```

**Network delay simulation**:
```javascript
async delay(ms = 50 + Math.random() * 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Usage Examples

### Enable Mock Mode on Startup

**Development workflow**:
1. Open app in browser
2. Backend unreachable? Console shows:
   ```
   [App] Backend unreachable. Enable mock mode with: features.enable('mock_rpc')
   ```
3. Enable mock mode:
   ```javascript
   features.enable('mock_rpc');
   location.reload();
   ```
4. Dashboard now works without backend

### Test Components

```javascript
// All components work identically with mock data
const metrics = await rpc.getDashboardMetrics();
console.log(metrics);
// {
//   blockHeight: 100042,
//   finalizedHeight: 100037,
//   tps: 1215,
//   peers: 64,
//   activePeers: 58,
//   ...
// }
```

### Inspect Mock Data

```javascript
// Check current RPC mode
window.rpc.constructor.name
// "MockRpcClient" or "RpcClient"

// Make direct mock calls
await window.rpc.call('consensus.block_height')
await window.rpc.getTPS()
await window.rpc.listPeers()
```

### Batch Testing

```javascript
const batch = await window.rpc.batch([
  { method: 'consensus.block_height' },
  { method: 'peer.stats' },
  { method: 'scheduler.stats' },
]);

console.log(batch);
// [
//   { result: { height: 100042, finalized_height: 100037 } },
//   { result: { total: 64, active: 58, avgLatency: 22 } },
//   { result: { queue_size: 12, active_jobs: 3 } }
// ]
```

---

## Mock Data Details

### Consensus

```javascript
// Block height (increments every 2s)
{
  height: 100000 + Math.floor(elapsed / 2000),
  finalized_height: height - 5
}

// TPS (varies ±10%)
{
  tps: 1080-1440,
  avgBlockTime: 1.8-2.2
}

// Validators (5 validators)
{
  validators: [
    {
      id: "validator-1",
      stake: 1000000-1500000,
      commission: 0.05-0.10,
      uptime: 0.95-0.99
    },
    // ... 4 more
  ]
}
```

### Ledger

```javascript
// Balance
{
  account: "0x123",
  balance: 10000-100000,
  nonce: 0-100
}

// Transactions (configurable limit)
{
  transactions: [
    {
      hash: "0x...",
      from: "0x...",
      to: "0x...",
      amount: 0-1000,
      fee: 0-10,
      status: "confirmed"
    }
  ]
}
```

### Peer

```javascript
// Peer stats (fixed + variance)
{
  total: 64,
  active: 58,
  avgLatency: 18-24 ms,
  bandwidth: {
    inbound: 1000000-1500000 bytes/sec,
    outbound: 800000-1200000 bytes/sec
  }
}

// Peer list (8 peers)
{
  peers: [
    {
      id: "peer-1",
      address: "192.168.1.100:5001",
      latency: 10-60 ms,
      uptime: 3600-90000 seconds,
      version: "1.0.0"
    }
  ]
}
```

### Energy Market

```javascript
// Market state
{
  totalSupply: 45000-55000 kWh,
  totalDemand: 42000-48000 kWh,
  price: 1.15-1.45 BLOCK/kWh,
  providers: 35-50
}

// Providers (5 providers)
{
  providers: [
    {
      id: "energy-0x1",
      capacity: 800-1200 kWh,
      available: 600-900 kWh,
      price: 1.1-1.4 BLOCK/kWh,
      reputation: 0.92-0.99
    }
  ]
}
```

### Governance

```javascript
// Governor status
{
  active_gates: 3-6,
  gates: {
    energy: true,
    compute: true,
    storage: false
  },
  economics_prev_market_metrics: {
    utilization_ppm: 750000,
    provider_margin_ppm: 150000
  }
}

// Proposals (3 proposals)
{
  proposals: [
    {
      id: "proposal-1",
      title: "Proposal 1",
      status: "active" | "pending" | "passed",
      votes: {
        yes: 500000-1000000,
        no: 100000-300000
      }
    }
  ]
}
```

---

## Testing

### Run Mock Tests

```bash
cd ~/projects/the-block/block-buster/web
npm test -- rpc-mock.test.js
```

**Coverage**: 40+ test cases
- ✅ All RPC namespaces
- ✅ Batch requests
- ✅ Error handling
- ✅ Helper methods
- ✅ Data variance
- ✅ Time-based progression
- ✅ Network delay simulation

### Test Mock in Browser

```javascript
// Enable mock mode
features.enable('mock_rpc');
location.reload();

// Verify mock is active
window.rpc.constructor.name; // "MockRpcClient"

// Test dashboard metrics
const metrics = await window.rpc.getDashboardMetrics();
console.table(metrics);

// Test block height progression
const height1 = await window.rpc.getBlockHeight();
await new Promise(r => setTimeout(r, 2100)); // Wait 2.1s
const height2 = await window.rpc.getBlockHeight();
console.log('Height increased:', height2.height > height1.height);

// Test network overview
const network = await window.rpc.getNetworkOverview();
console.log('Peers:', network.peers.length);
console.log('Validators:', network.validators.length);

// Test market states
const markets = await window.rpc.getMarketStates();
console.table({
  energy: markets.energy.providers,
  compute: markets.compute.active_jobs,
  ad: markets.ad.total_bids
});
```

---

## Integration with Components

Components work identically with mock or real RPC:

```javascript
// TheBlock component
async fetchMetrics() {
  // Uses window.rpc (MockRpcClient or RpcClient)
  const data = await this.rpc.getDashboardMetrics();
  
  // Transform to component state
  const metrics = {
    tps: data.tps || 0,
    peers: data.activePeers || 0,
    blockHeight: data.blockHeight || 0,
    // ...
  };
  
  appState.set('metrics', metrics);
}
```

**Zero code changes needed** - dependency injection handles mock vs real.

---

## Benefits

### For Development

| Benefit | Description |
|---------|-------------|
| **Zero backend dependency** | Develop frontend without running node |
| **Fast iteration** | No build/restart cycles for backend |
| **Consistent data** | Predictable mock data for UI testing |
| **Offline development** | Work on planes, coffee shops, etc. |
| **Onboarding** | New devs can start immediately |

### For Testing

| Benefit | Description |
|---------|-------------|
| **Deterministic tests** | Predictable data for assertions |
| **Edge cases** | Easy to test error states |
| **Performance** | No network latency |
| **Parallel tests** | No backend contention |

### For Demos

| Benefit | Description |
|---------|-------------|
| **No infrastructure** | Demo without running node |
| **Consistent state** | Predictable demo data |
| **Fast resets** | Reload page to reset state |
| **Offline demos** | Present anywhere |

---

## Limitations

### What Mock Mode Doesn't Do

❌ **Persist data** - Reload resets state  
❌ **WebSocket updates** - Mock mode disables WebSocket  
❌ **Mutations** - Write operations (transactions, proposals) don't persist  
❌ **Real consensus** - Block height increments deterministically, not via real consensus  
❌ **Backend validation** - No schema validation against real backend  

### When to Use Real Backend

 Use real backend for:
- ✅ End-to-end integration testing
- ✅ Performance testing
- ✅ Real blockchain state
- ✅ Transaction submission
- ✅ WebSocket real-time updates
- ✅ Production deployment

---

## Configuration

### Feature Flag Storage

Mock mode state persists in `localStorage`:

```javascript
// Check current state
localStorage.getItem('feature_mock_rpc'); // "true" or null

// Manually enable
localStorage.setItem('feature_mock_rpc', 'true');
location.reload();

// Manually disable
localStorage.removeItem('feature_mock_rpc');
location.reload();
```

### Auto-Enable on Failure

App suggests mock mode when backend is unreachable:

```javascript
const isHealthy = await checkHealth();
if (!isHealthy && !features.isEnabled('mock_rpc')) {
  console.log('[App] Backend unreachable. Enable mock mode with: features.enable(\'mock_rpc\')');
}
```

---

## Troubleshooting

### Mock Mode Not Working

**Check feature flag**:
```javascript
features.isEnabled('mock_rpc'); // Should return true
```

**Check RPC client type**:
```javascript
window.rpc.constructor.name; // Should be "MockRpcClient"
```

**Force enable and reload**:
```javascript
features.enable('mock_rpc');
location.reload();
```

### Data Not Changing

Mock data varies slightly on each call:
```javascript
const tps1 = await window.rpc.getTPS();
const tps2 = await window.rpc.getTPS();
console.log(tps1.tps !== tps2.tps); // Should be true (usually)
```

Block height increments every 2 seconds:
```javascript
const h1 = await window.rpc.getBlockHeight();
await new Promise(r => setTimeout(r, 2100));
const h2 = await window.rpc.getBlockHeight();
console.log(h2.height > h1.height); // Should be true
```

### Mock vs Real Mismatch

If mock data structure doesn't match real backend:

1. Check backend response schema
2. Update mock handler in `rpc-mock.js`
3. Add test case to verify structure
4. Update JSDoc types in `rpc.js`

---

## Files

- ✅ `src/rpc-mock.js` - Mock RPC client (500+ lines)
- ✅ `tests/rpc-mock.test.js` - Mock tests (400+ lines, 40+ cases)
- ✅ `src/main.js` - Conditional RPC initialization
- ✅ `src/features.js` - Feature flag system
- ✅ `MOCK_MODE.md` - This documentation

---

## Future Enhancements

- [ ] Configurable mock data (custom values)
- [ ] Mock state persistence (localStorage)
- [ ] Mock mutation support (transactions, proposals)
- [ ] Mock WebSocket support (simulated push updates)
- [ ] Mock error injection (simulate failures)
- [ ] Mock latency profiles (simulate slow network)
- [ ] Mock data snapshots (save/load state)
- [ ] Mock recording mode (capture real backend responses)

---

**Status**: Mock mode fully operational. Develop frontend without backend. Toggle with `features.enable('mock_rpc')`. Production-ready with comprehensive tests and realistic data. 🚀

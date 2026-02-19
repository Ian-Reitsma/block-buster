# The Block RPC Quick Reference

**Date**: February 13, 2026  
**For**: Block-Buster Developers

---

## Python Client

### Import

```python
from block_buster.utils.rpc_client import TheBlockRPCClient

client = TheBlockRPCClient("http://localhost:8545")
```

### Common Operations

#### Get Block Info

```python
# Get current height
height_data = client.get_block_height()
print(f"Height: {height_data['height']}, Finalized: {height_data['finalized_height']}")

# Get TPS
tps_data = client.get_tps()
print(f"TPS: {tps_data['tps']}, Avg Block Time: {tps_data['avgBlockTime']}s")

# Get specific block
block = client.get_block(12345)
print(f"Block hash: {block['hash']}")

# Get validators
validators = client.get_validators()
print(f"Validator count: {len(validators['validators'])}")
```

#### Account & Transactions

```python
# Get balance
balance = client.get_balance("account_address")
print(f"Balance: {balance['balance']}, Nonce: {balance['nonce']}")

# Get transaction history
txs = client.get_transactions({
    "account": "account_address",
    "limit": 50,
    "offset": 0
})
print(f"Found {txs['total']} transactions")
```

#### Network Stats

```python
# Get peers
peers = client.list_peers()
print(f"Connected peers: {len(peers['peers'])}")

# Get peer stats
stats = client.get_peer_stats()
print(f"Active: {stats['active']}, Avg Latency: {stats['avgLatency']}ms")

# Get scheduler stats
sched = client.get_scheduler_stats()
print(f"Queue size: {sched['queue_size']}")
```

#### Governance

```python
# Get proposals
proposals = client.get_proposals({"status": "active"})
print(f"Active proposals: {len(proposals['proposals'])}")

# Get governor status
gov = client.get_governor_status()
print(f"Active gates: {gov['active_gates']}")
```

#### Markets

```python
# Energy market
energy = client.get_energy_market_state()
print(f"Energy providers: {energy['providers']}")

providers = client.list_energy_providers({"limit": 10})
print(f"Top 10 providers: {len(providers['providers'])}")

# Compute market
jobs = client.get_compute_jobs({"status": "active"})
print(f"Active compute jobs: {len(jobs['jobs'])}")

courier = client.get_courier_status()
print(f"Courier status: {courier}")

# Ad market
inventory = client.get_ad_inventory()
print(f"Ad slots available: {inventory}")

campaigns = client.list_ad_campaigns({"status": "active"})
print(f"Active campaigns: {len(campaigns)}")

broker = client.get_ad_broker_state()
print(f"Broker state: {broker}")
```

#### Treasury

```python
# Get treasury balance
balance = client.get_treasury_balance()
print(f"Treasury: {balance['balance']}")

# List disbursements
disbursements = client.list_disbursements({"limit": 20})
print(f"Recent disbursements: {len(disbursements['disbursements'])}")
```

#### Analytics

```python
# Get aggregated analytics
analytics = client.get_analytics({"period": "24h"})
print(f"Analytics  {analytics}")
```

---

## JavaScript/Web Client

### Import

```javascript
import RpcClient from './rpc.js';

const client = new RpcClient('http://localhost:8545');
```

### Common Operations

#### Get Block Info

```javascript
// Get current height
const height = await client.getBlockHeight();
console.log(`Height: ${height.height}, Finalized: ${height.finalized_height}`);

// Get TPS
const tps = await client.getTPS();
console.log(`TPS: ${tps.tps}, Avg Block Time: ${tps.avgBlockTime}s`);

// Get specific block
const block = await client.getBlock(12345);
console.log(`Block hash: ${block.hash}`);

// Get validators
const validators = await client.getValidators();
console.log(`Validator count: ${validators.validators.length}`);
```

#### Account & Transactions

```javascript
// Get balance
const balance = await client.getBalance('account_address');
console.log(`Balance: ${balance.balance}, Nonce: ${balance.nonce}`);

// Get transaction history
const txs = await client.getTransactions({
  account: 'account_address',
  limit: 50,
  offset: 0,
});
console.log(`Found ${txs.total} transactions`);
```

#### Network Stats

```javascript
// Get peers
const peers = await client.listPeers();
console.log(`Connected peers: ${peers.peers.length}`);

// Get peer stats
const stats = await client.getPeerStats();
console.log(`Active: ${stats.active}, Avg Latency: ${stats.avgLatency}ms`);

// Get scheduler stats
const sched = await client.getSchedulerStats();
console.log(`Queue size: ${sched.queue_size}`);
```

#### Governance

```javascript
// Get proposals
const proposals = await client.getProposals({ status: 'active' });
console.log(`Active proposals: ${proposals.proposals.length}`);

// Get governor status
const gov = await client.getGovernorStatus();
console.log(`Active gates: ${gov.active_gates}`);
```

#### Markets

```javascript
// Energy market
const energy = await client.getEnergyMarketState();
console.log(`Energy providers: ${energy.providers}`);

const providers = await client.listEnergyProviders({ limit: 10 });
console.log(`Top 10 providers: ${providers.providers.length}`);

// Compute market
const jobs = await client.getComputeJobs({ status: 'active' });
console.log(`Active compute jobs: ${jobs.jobs.length}`);

const courier = await client.getCourierStatus();
console.log('Courier status:', courier);

const sla = await client.getSlaHistory({ limit: 10 });
console.log('SLA history:', sla);

// Ad market
const inventory = await client.getAdInventory();
console.log('Ad inventory:', inventory);

const campaigns = await client.listAdCampaigns({ status: 'active' });
console.log(`Active campaigns: ${campaigns.length}`);

const broker = await client.getAdBrokerState();
console.log('Broker state:', broker);

const readiness = await client.getAdReadiness();
console.log('Market readiness:', readiness);
```

#### Treasury

```javascript
// Get treasury balance
const balance = await client.getTreasuryBalance();
console.log(`Treasury: ${balance.balance}`);

// List disbursements
const disbursements = await client.getDisbursements({ limit: 20 });
console.log(`Recent disbursements: ${disbursements.disbursements.length}`);
```

#### Analytics

```javascript
// Get aggregated analytics
const analytics = await client.getAnalytics({ period: '24h' });
console.log('Analytics ', analytics);
```

---

## Batch Operations

### Python

```python
# Batch multiple calls
calls = [
    ("consensus.block_height", []),
    ("consensus.tps", []),
    ("peer.stats", []),
]

results = client.batch_call(calls)
height, tps, peers = results

print(f"Height: {height['height']}")
print(f"TPS: {tps['tps']}")
print(f"Active peers: {peers['active']}")
```

### JavaScript

```javascript
// Batch multiple calls
const calls = [
  { method: 'consensus.block_height' },
  { method: 'consensus.tps' },
  { method: 'peer.stats' },
];

const results = await client.batch(calls);
const [height, tps, peers] = results;

console.log(`Height: ${height.result.height}`);
console.log(`TPS: ${tps.result.tps}`);
console.log(`Active peers: ${peers.result.active}`);
```

---

## Helper Methods

### JavaScript Only

These convenience methods batch multiple RPC calls:

#### Dashboard Metrics

```javascript
const metrics = await client.getDashboardMetrics();

console.log({
  blockHeight: metrics.blockHeight,
  finalizedHeight: metrics.finalizedHeight,
  tps: metrics.tps,
  avgBlockTime: metrics.avgBlockTime,
  peers: metrics.peers,
  activePeers: metrics.activePeers,
  avgLatency: metrics.avgLatency,
  schedulerQueueSize: metrics.schedulerQueueSize,
  governorActiveGates: metrics.governorActiveGates,
  validatorCount: metrics.validatorCount, // NEW
  analytics: metrics.analytics, // NEW
  errors: metrics.errors,
});
```

#### Network Overview

```javascript
const overview = await client.getNetworkOverview();

console.log({
  peers: overview.peers, // Array of peer objects
  stats: overview.stats, // Peer statistics
  validators: overview.validators, // Array of validators
  errors: overview.errors,
});
```

#### Market States

```javascript
const markets = await client.getMarketStates();

console.log({
  energy: markets.energy, // Energy market state
  compute: markets.compute.jobs, // Compute jobs
  ad: {
    broker: markets.ad.broker, // Ad broker state
    inventory: markets.ad.inventory, // Ad inventory
  },
  errors: markets.errors,
});
```

---

## Error Handling

### Python

```python
from block_buster.utils.rpc_client import TheBlockRPCClient, RPCException, RPC_ERROR_CODES

client = TheBlockRPCClient("http://localhost:8545")

try:
    balance = client.get_balance("account_address")
except RPCException as e:
    if e.code == RPC_ERROR_CODES["RATE_LIMIT"]:
        print("Rate limited, implement backoff")
    elif e.code == RPC_ERROR_CODES["AUTH_MISSING"]:
        print("Missing authentication token")
    else:
        print(f"RPC error {e.code}: {e}")
```

### JavaScript

```javascript
import RpcClient from './rpc.js';

const client = new RpcClient('http://localhost:8545');

try {
  const balance = await client.getBalance('account_address');
} catch (error) {
  if (error.code === -33010) {
    console.log('Rate limited, implement backoff');
  } else if (error.code === -33009) {
    console.log('Missing authentication token');
  } else {
    console.error('RPC error:', error.message);
  }
}
```

---

## Migration Guide

### Old Python Methods → New Methods

```python
# OLD (Ethereum-style)
client.get_block_number()  # ❌ REMOVED

# NEW (The Block)
client.get_block_height()  # ✅ Returns {height, finalized_height}

# OLD
client.get_transaction("tx_hash")  # ❌ REMOVED

# NEW
client.get_transactions({"hash": "tx_hash"})  # ✅ Query by hash

# OLD
client.call_contract(to, data)  # ❌ REMOVED

# NEW
client.vm_call({"to": to, "data": data})  # ✅ Use vm.call
```

### Old JavaScript Methods → New Methods

```javascript
// OLD
await client.getComputeMarketState(); // ❌ REMOVED

// NEW
await client.getComputeJobs(); // ✅ Get compute jobs
await client.getCourierStatus(); // ✅ Get courier status

// OLD
await client.getAdMarketState(); // ❌ REMOVED
await client.getAdBids(); // ❌ REMOVED

// NEW
await client.getAdInventory(); // ✅ Get ad inventory
await client.listAdCampaigns(); // ✅ List campaigns
await client.getAdBrokerState(); // ✅ Get broker state
await client.getAdReadiness(); // ✅ Get readiness

// OLD
await client.getDisbursements(); // Used treasury.disbursements

// NEW
await client.getDisbursements(); // ✅ Now uses treasury.list_disbursements
```

---

## Complete Method List

### Python: 60+ Methods

See `src/block_buster/utils/rpc_client.py` for full list organized by namespace:

- Consensus (7 methods)
- Ledger (2 methods)
- Storage (6 methods)
- Compute Market (5 methods)
- Ad Market (12 methods)
- Governance (3 methods)
- Governor (2 methods)
- Treasury (7 methods)
- Energy (11 methods)
- Peer (2 methods)
- VM (2 methods)
- Scheduler (1 method)
- And 10 more namespaces...

### JavaScript: 30+ Methods

See `web/src/rpc.js` for full list organized by namespace:

- Consensus (4 methods)
- Ledger (2 methods)
- Peer (2 methods)
- Scheduler (1 method)
- Governance (3 methods)
- Energy (2 methods)
- Compute Market (3 methods)
- Ad Market (6 methods)
- Treasury (2 methods)
- Analytics (1 method)
- Plus 3 helper methods

---

## API Documentation

For complete API reference, see:

**`~/projects/the-block/docs/apis_and_tooling.md`**

This is the source of truth for all RPC namespaces and methods.

---

## Support

For questions or issues:

1. Check `API_ENDPOINT_AUDIT.md` for detailed endpoint analysis
2. Check `API_FIX_PLAN.md` for implementation details
3. Check `RPC_FIX_IMPLEMENTATION_SUMMARY.md` for what changed

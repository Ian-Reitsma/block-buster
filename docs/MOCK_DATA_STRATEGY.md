# Mock Data Strategy - Formula-Based Demo Mode

**Date:** February 13, 2026  
**Purpose:** Demonstrate blockchain capabilities before mainnet launch  
**Philosophy:** Mock data MUST be realistic and formula-driven, not random

---

## Connection Detection Flow

```javascript
// 1. Try to connect to node for 5 seconds
const connectionTimeout = 5000;
const nodeDetected = await tryConnectToNode(connectionTimeout);

if (nodeDetected) {
  // Use LIVE data from RPC
  useMode('LIVE');
} else {
  // Use FORMULA-BASED mock data
  useMode('MOCK');
  console.warn('[App] Node not detected - using formula-based demo mode');
}
```

---

## Mock Data Principles

### ❌ WRONG: Random Data

```javascript
// NEVER DO THIS
const mockPrice = Math.random() * 100;
const mockVolume = Math.floor(Math.random() * 1000);
```

This produces:
- Unrealistic values
- No correlation between metrics
- No time-series consistency
- Breaks economic formulas

### ✅ RIGHT: Formula-Based Data

```javascript
// Use actual blockchain formulas
const mockIssuance = calculateNetworkIssuance({
  base_reward: 12.5,
  activity_multiplier: 1.35,
  decentralization_factor: 1.15,
  supply_decay: 0.92,
});

const mockOrderBook = generateRealisticOrderBook({
  midPrice: 1.15,
  spread_bps: 87,
  depth: 20,
  volumeProfile: 'exponential', // More volume near mid-price
});
```

This produces:
- Realistic values matching economics docs
- Proper correlations (e.g., high utilization → higher rewards)
- Smooth time-series (no jumps)
- Respects all formulas

---

## Formula-Based Mock Data Generators

### 1. Network Issuance (Economics)

**Formula:** `reward = base × activity × decentralization × supply_decay`

```javascript
/**
 * Generate realistic network issuance based on actual formula
 * From: ~/projects/the-block/docs/economics_and_governance.md
 */
function mockNetworkIssuance(params = {}) {
  const MAX_SUPPLY_BLOCK = 40_000_000;
  const EXPECTED_TOTAL_BLOCKS = 100_000_000; // ~10 years at 3s blocks
  
  // Base reward: 90% of cap distributed evenly
  const base_reward = (0.9 * MAX_SUPPLY_BLOCK) / EXPECTED_TOTAL_BLOCKS;
  
  // Activity multiplier: geometric mean of tx metrics
  const tx_count_ratio = params.tx_count_ratio || 1.2;
  const tx_volume_ratio = params.tx_volume_ratio || 1.5;
  const market_utilization = params.market_utilization || 0.65;
  
  const activity_multiplier = Math.pow(
    tx_count_ratio * tx_volume_ratio * (1 + market_utilization),
    1/3
  );
  
  // Decentralization factor: sqrt(miners / baseline)
  const unique_miners = params.unique_miners || 23;
  const baseline_miners = params.baseline_miners || 20;
  const decentralization_factor = Math.sqrt(unique_miners / baseline_miners);
  
  // Supply decay: linear based on remaining supply
  const current_emission = params.current_emission || 3_200_000;
  const supply_decay = (MAX_SUPPLY_BLOCK - current_emission) / MAX_SUPPLY_BLOCK;
  
  // Final reward
  const reward = base_reward * activity_multiplier * decentralization_factor * supply_decay;
  
  return {
    base_reward,
    activity_multiplier,
    activity_breakdown: {
      tx_count_ratio,
      tx_volume_ratio,
      avg_market_utilization: market_utilization,
    },
    decentralization_factor,
    unique_miners,
    baseline_miners,
    supply_decay,
    remaining_supply: MAX_SUPPLY_BLOCK - current_emission,
    max_supply: MAX_SUPPLY_BLOCK,
    final_reward: reward,
  };
}
```

### 2. DEX Order Book

**Structure:** `BTreeMap<u64, VecDeque<Order>>` from `node/src/dex/order_book.rs`

```javascript
/**
 * Generate realistic order book with proper structure
 * Mimics BTreeMap<price, VecDeque<Order>> from Rust
 */
function mockOrderBook(params = {}) {
  const midPrice = params.midPrice || 115000; // Price in micro-units (1.15 USD)
  const spread_bps = params.spread_bps || 87; // 0.87% spread
  const depth = params.depth || 20; // Number of price levels
  const volumeProfile = params.volumeProfile || 'exponential';
  
  const bids = [];
  const asks = [];
  
  // Calculate spread
  const spreadAmount = Math.floor((midPrice * spread_bps) / 20000); // Half spread
  const bestBid = midPrice - spreadAmount;
  const bestAsk = midPrice + spreadAmount;
  
  // Generate bids (descending price)
  for (let i = 0; i < depth; i++) {
    const price = bestBid - i * 100; // 0.001 USD tick size
    const distanceFromMid = (midPrice - price) / midPrice;
    
    // Volume profile: more volume near mid-price
    let volumeMultiplier;
    if (volumeProfile === 'exponential') {
      volumeMultiplier = Math.exp(-distanceFromMid * 10);
    } else {
      volumeMultiplier = 1 / (1 + distanceFromMid * 5);
    }
    
    const baseVolume = 1000; // Base order size
    const volume = Math.floor(baseVolume * volumeMultiplier * (0.8 + Math.random() * 0.4));
    
    // Generate 1-3 orders at this price level
    const numOrders = Math.floor(Math.random() * 3) + 1;
    const orders = [];
    let remaining = volume;
    
    for (let j = 0; j < numOrders && remaining > 0; j++) {
      const orderSize = j === numOrders - 1 
        ? remaining 
        : Math.floor(remaining * (0.3 + Math.random() * 0.4));
      
      orders.push({
        id: Date.now() + i * 100 + j,
        account: `addr${Math.floor(Math.random() * 1000)}`,
        side: 'Buy',
        amount: orderSize,
        price,
        max_slippage_bps: 100,
      });
      
      remaining -= orderSize;
    }
    
    bids.push({ price, orders });
  }
  
  // Generate asks (ascending price)
  for (let i = 0; i < depth; i++) {
    const price = bestAsk + i * 100;
    const distanceFromMid = (price - midPrice) / midPrice;
    
    let volumeMultiplier;
    if (volumeProfile === 'exponential') {
      volumeMultiplier = Math.exp(-distanceFromMid * 10);
    } else {
      volumeMultiplier = 1 / (1 + distanceFromMid * 5);
    }
    
    const baseVolume = 1000;
    const volume = Math.floor(baseVolume * volumeMultiplier * (0.8 + Math.random() * 0.4));
    
    const numOrders = Math.floor(Math.random() * 3) + 1;
    const orders = [];
    let remaining = volume;
    
    for (let j = 0; j < numOrders && remaining > 0; j++) {
      const orderSize = j === numOrders - 1 
        ? remaining 
        : Math.floor(remaining * (0.3 + Math.random() * 0.4));
      
      orders.push({
        id: Date.now() + i * 100 + j + 10000,
        account: `addr${Math.floor(Math.random() * 1000)}`,
        side: 'Sell',
        amount: orderSize,
        price,
        max_slippage_bps: 100,
      });
      
      remaining -= orderSize;
    }
    
    asks.push({ price, orders });
  }
  
  // Calculate totals
  const total_bid_volume = bids.reduce(
    (sum, level) => sum + level.orders.reduce((s, o) => s + o.amount, 0),
    0
  );
  const total_ask_volume = asks.reduce(
    (sum, level) => sum + level.orders.reduce((s, o) => s + o.amount, 0),
    0
  );
  
  return {
    bids,
    asks,
    spread: spreadAmount * 2,
    spread_bps,
    total_bid_volume,
    total_ask_volume,
    last_trade_price: midPrice,
    last_trade_time: Date.now(),
  };
}
```

### 3. Ad Market Quality Formula

**Formula:** `Q_cohort = clamp((F × P × R)^(1/3), 0.10, 2.50)`

```javascript
/**
 * Generate realistic ad market quality metrics
 * From: ~/projects/the-block/docs/economics_and_governance.md
 */
function mockAdQuality(params = {}) {
  // Freshness histogram (must sum to 1,000,000 ppm)
  const freshness = params.freshness || {
    under_1h_ppm: 600000,    // 60% very fresh
    '1h_to_6h_ppm': 250000,  // 25% fresh
    '6h_to_24h_ppm': 100000, // 10% stale
    over_24h_ppm: 50000,     // 5% very stale
  };
  
  // Weights for freshness (from docs)
  const w1 = 1000000;
  const w2 = 800000;
  const w3 = 500000;
  const w4 = 200000;
  
  // Calculate F (freshness factor)
  const F = (
    w1 * freshness.under_1h_ppm +
    w2 * freshness['1h_to_6h_ppm'] +
    w3 * freshness['6h_to_24h_ppm'] +
    w4 * freshness.over_24h_ppm
  ) / 1000000;
  
  // Readiness factor
  const ready_streak_windows = params.ready_streak_windows || 5;
  const readiness_target = params.readiness_target || 6;
  const R = Math.max(0.10, Math.min(1.0, ready_streak_windows / readiness_target));
  
  // Privacy factor
  const privacy_remaining_ppm = params.privacy_remaining_ppm || 850000;
  const privacy_denied_ppm = params.privacy_denied_ppm || 50000;
  const P = Math.max(
    0.10,
    Math.min(1.0, Math.min(privacy_remaining_ppm, 1000000 - privacy_denied_ppm) / 1000000)
  );
  
  // Cohort quality
  const Q_cohort = Math.max(0.10, Math.min(2.50, Math.pow(F * P * R, 1/3)));
  
  // Effective bid calculation
  const base_bid = params.base_bid || 5000; // 5 cents in micro-USD
  const creative_quality = params.creative_quality || 1.25;
  const effective_bid = base_bid * creative_quality * Q_cohort;
  
  return {
    freshness_histogram: freshness,
    freshness_factor: F,
    readiness_factor: R,
    ready_streak_windows,
    readiness_target,
    privacy_factor: P,
    privacy_remaining_ppm,
    privacy_denied_ppm,
    cohort_quality: Q_cohort,
    base_bid,
    creative_quality,
    effective_bid,
  };
}
```

### 4. Energy Market Metrics

```javascript
/**
 * Generate realistic energy market data
 */
function mockEnergyMarket(params = {}) {
  const numProviders = params.numProviders || 12;
  const providers = [];
  
  for (let i = 0; i < numProviders; i++) {
    const capacity_kwh = 1000 + Math.floor(Math.random() * 9000);
    const utilization = 0.4 + Math.random() * 0.5; // 40-90% utilization
    const delivered_kwh = Math.floor(capacity_kwh * utilization);
    
    // Price per kWh (in micro-BLOCK, e.g., 0.1 BLOCK = 100,000)
    const base_price = 80000; // 0.08 BLOCK base
    const price_variance = 0.8 + Math.random() * 0.4; // ±20%
    const price_per_kwh = Math.floor(base_price * price_variance);
    
    providers.push({
      id: `energy-provider-${i}`,
      name: `Provider ${String.fromCharCode(65 + i)}`,
      capacity_kwh,
      delivered_kwh,
      utilization,
      price_per_kwh,
      stake: 10000 + Math.floor(Math.random() * 90000),
      meter_address: `meter_${i}_${Date.now()}`,
      jurisdiction: ['US_CA', 'US_TX', 'US_NY', 'EU_DE'][Math.floor(Math.random() * 4)],
      credits_pending: Math.floor(Math.random() * 500),
      receipts_count: Math.floor(Math.random() * 1000),
      disputes_count: Math.random() > 0.9 ? 1 : 0,
      last_reading_time: Date.now() - Math.floor(Math.random() * 3600000),
    });
  }
  
  return {
    providers,
    total_capacity: providers.reduce((sum, p) => sum + p.capacity_kwh, 0),
    total_delivered: providers.reduce((sum, p) => sum + p.delivered_kwh, 0),
    avg_utilization: providers.reduce((sum, p) => sum + p.utilization, 0) / providers.length,
    avg_price: providers.reduce((sum, p) => sum + p.price_per_kwh, 0) / providers.length,
    total_credits: providers.reduce((sum, p) => sum + p.credits_pending, 0),
    total_receipts: providers.reduce((sum, p) => sum + p.receipts_count, 0),
    active_disputes: providers.reduce((sum, p) => sum + p.disputes_count, 0),
  };
}
```

### 5. Time-Series Data (Consistent)

```javascript
/**
 * Generate smooth time-series data with realistic trends
 * NOT random jumps
 */
function mockTimeSeries(params = {}) {
  const length = params.length || 100;
  const baseValue = params.baseValue || 100;
  const trend = params.trend || 0.001; // Slight upward trend
  const volatility = params.volatility || 0.05;
  const cyclePeriod = params.cyclePeriod || 20; // Simulate daily cycles
  
  const series = [];
  let value = baseValue;
  
  for (let i = 0; i < length; i++) {
    // Trend component
    value *= (1 + trend);
    
    // Cyclical component (e.g., daily patterns)
    const cycleEffect = Math.sin((i / cyclePeriod) * 2 * Math.PI) * volatility * baseValue;
    
    // Small random walk (NOT jumps)
    const randomWalk = (Math.random() - 0.5) * volatility * baseValue * 0.5;
    
    const finalValue = value + cycleEffect + randomWalk;
    
    series.push({
      timestamp: Date.now() - (length - i) * 60000, // 1 minute intervals
      value: Math.max(0, finalValue),
    });
  }
  
  return series;
}
```

---

## Mock Data Manager

**File:** `web/src/mock-data-manager.js`

```javascript
/**
 * Central mock data manager
 * Provides formula-based realistic data when node is not connected
 */

class MockDataManager {
  constructor() {
    this.mode = 'DETECTING'; // DETECTING | LIVE | MOCK
    this.mockData = {};
    this.updateInterval = null;
  }

  async detectNode(timeout = 5000) {
    console.log('[MockDataManager] Detecting node...');
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch('http://localhost:8545/health', {
          method: 'GET',
          signal: AbortSignal.timeout(1000),
        });
        
        if (response.ok) {
          console.log('[MockDataManager] Node detected - using LIVE mode');
          this.mode = 'LIVE';
          return true;
        }
      } catch (e) {
        // Node not responding, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.warn('[MockDataManager] Node not detected after', timeout, 'ms - using MOCK mode');
    this.mode = 'MOCK';
    this.initializeMockData();
    this.startMockUpdates();
    return false;
  }

  initializeMockData() {
    // Initialize all mock data using formulas
    this.mockData.issuance = mockNetworkIssuance();
    this.mockData.orderBook = mockOrderBook();
    this.mockData.adQuality = mockAdQuality();
    this.mockData.energyMarket = mockEnergyMarket();
    
    // Time-series data
    this.mockData.tpsHistory = mockTimeSeries({
      length: 100,
      baseValue: 1200,
      trend: 0.0005,
      volatility: 0.1,
    });
    
    this.mockData.priceHistory = mockTimeSeries({
      length: 100,
      baseValue: 115000,
      trend: 0.0002,
      volatility: 0.02,
      cyclePeriod: 24, // Daily cycle
    });
  }

  startMockUpdates() {
    // Update mock data every 3 seconds (simulating block time)
    this.updateInterval = setInterval(() => {
      this.updateMockData();
    }, 3000);
  }

  updateMockData() {
    // Smoothly update time-series data
    const newTps = mockTimeSeries({
      length: 1,
      baseValue: this.mockData.tpsHistory[this.mockData.tpsHistory.length - 1].value,
      trend: 0.0005,
      volatility: 0.1,
    });
    this.mockData.tpsHistory.push(newTps[0]);
    this.mockData.tpsHistory.shift();
    
    const newPrice = mockTimeSeries({
      length: 1,
      baseValue: this.mockData.priceHistory[this.mockData.priceHistory.length - 1].value,
      trend: 0.0002,
      volatility: 0.02,
    });
    this.mockData.priceHistory.push(newPrice[0]);
    this.mockData.priceHistory.shift();
    
    // Occasionally update order book (simulating trades)
    if (Math.random() > 0.7) {
      const currentMid = this.mockData.orderBook.last_trade_price;
      const priceChange = (Math.random() - 0.5) * 100; // ±0.001 USD
      this.mockData.orderBook = mockOrderBook({
        midPrice: currentMid + priceChange,
        spread_bps: this.mockData.orderBook.spread_bps,
      });
    }
  }

  get(key) {
    if (this.mode === 'MOCK') {
      return this.mockData[key];
    }
    return null; // Return null in LIVE mode - caller should use RPC
  }

  isLiveMode() {
    return this.mode === 'LIVE';
  }

  isMockMode() {
    return this.mode === 'MOCK';
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

export default new MockDataManager();
```

---

## Usage in Components

```javascript
import mockDataManager from '../mock-data-manager.js';
import appState from '../state.js';

class Trading extends Component {
  async onMount() {
    // Detect node (only once per app lifecycle)
    const isLive = await mockDataManager.detectNode();
    appState.set('connectionMode', isLive ? 'LIVE' : 'MOCK');
    
    if (isLive) {
      // Fetch from RPC
      await this.fetchOrderBookFromRPC();
    } else {
      // Use mock data
      const orderBook = mockDataManager.get('orderBook');
      appState.set('orderBook', orderBook);
    }
  }

  async fetchOrderBookFromRPC() {
    const data = await this.rpc.call('dex.order_book', {
      pair: 'BLOCK/USD',
      depth: 20,
    });
    appState.set('orderBook', data);
  }
}
```

---

## Visual Indicator

Always show connection mode:

```html
<div class="connection-indicator">
  <span class="connection-dot ${mode}"></span>
  <span class="connection-label">
    ${mode === 'LIVE' ? 'Connected to Node' : 'Demo Mode (Formula-Based)'}
  </span>
</div>
```

```css
.connection-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}

.connection-dot.LIVE {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
  animation: pulse 2s infinite;
}

.connection-dot.MOCK {
  background: var(--warn);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Summary

✅ **Detect node for 5 seconds**  
✅ **Use LIVE data if connected**  
✅ **Use FORMULA-BASED mock data if not connected**  
✅ **Mock data is realistic and follows blockchain economics**  
✅ **Mock data updates smoothly (no random jumps)**  
✅ **Clear visual indicator of mode**  

**Key Difference:**

- ❌ Random: `Math.random() * 1000`
- ✅ Formula: `calculateNetworkIssuance({ activity: 1.35, ... })`

The mock data demonstrates what the blockchain will look like at launch, using the actual economic formulas from the documentation.

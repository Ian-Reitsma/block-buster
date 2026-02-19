# Implementation Guide - Formula-Based Mock Data & Order Book Depth Chart

**Date:** February 13, 2026  
**Status:** Ready for Integration  
**Scope:** Trading component with volume-weighted order book visualization

---

## Overview

This guide explains how to integrate the new formula-based mock data system and order book depth chart into the block-buster frontend.

### What's New

1. **Mock Data Manager** - Formula-based data generation (not random)
2. **Order Book Depth Chart** - Volume-weighted DEX-style visualization
3. **Connection Detection** - 5-second node detection with fallback to mock mode
4. **Updated Trading Component** - Integrates all new features

---

## Files Created

### Core Files

1. `web/src/mock-data-manager.js` - Mock data generator with blockchain formulas
2. `web/src/components/OrderBookDepthChart.js` - Canvas-based depth chart
3. `web/src/components/TradingUpdated.js` - Updated trading component
4. `web/src/styles/trading.css` - Styles for new components

### Documentation

1. `docs/MOCK_DATA_STRATEGY.md` - Detailed mock data philosophy
2. `docs/UX_DEEP_AUDIT_2026_FEB.md` - Comprehensive UX audit
3. `docs/IMPLEMENTATION_GUIDE.md` - This file

---

## Step-by-Step Integration

### Step 1: Replace Trading Component

```bash
# Backup original
cp web/src/components/Trading.js web/src/components/Trading.backup.js

# Replace with updated version
cp web/src/components/TradingUpdated.js web/src/components/Trading.js
```

### Step 2: Add CSS Import

In `web/src/main.js` or your main stylesheet:

```javascript
import './styles/trading.css';
```

### Step 3: Initialize Mock Data Manager on App Start

In `web/src/main.js`:

```javascript
import mockDataManager from './mock-data-manager.js';
import appState from './state.js';

// On app initialization (before routing)
async function initializeApp() {
  console.log('[App] Initializing...');
  
  // Detect node connection (5 second timeout)
  const isLive = await mockDataManager.detectNode(5000);
  
  if (isLive) {
    console.log('[App] ✅ Connected to blockchain node');
    appState.set('connectionMode', 'LIVE');
  } else {
    console.log('[App] ⚠️ Using formula-based demo mode');
    appState.set('connectionMode', 'MOCK');
  }
  
  // Continue with router initialization
  router.start();
}

initializeApp();
```

### Step 4: Verify RPC Methods

The Trading component expects these RPC methods:

```javascript
// dex.order_book
await rpc.call('dex.order_book', {
  pair: 'BLOCK/USD',
  depth: 20,
});

// Expected response:
{
  bids: [
    {
      price: 115000, // micro-USD
      orders: [
        { id, account, side, amount, price, max_slippage_bps },
        // ...
      ]
    },
    // ...
  ],
  asks: [
    // Same structure
  ],
  spread: 100,
  spread_bps: 87,
  total_bid_volume: 45000,
  total_ask_volume: 38000,
  last_trade_price: 115050,
  last_trade_time: 1707851700000,
}
```

**If RPC method doesn't exist yet:** The component will automatically fall back to mock data.

### Step 5: Test Connection Modes

#### Test LIVE Mode

```bash
# Start node
cd ~/projects/the-block/node
cargo run --bin the-block-node --release

# Start frontend (in another terminal)
cd ~/projects/the-block/block-buster/web
npm run dev

# Open browser: http://localhost:3000/trading
# Should see: "Connected to Node" indicator
```

#### Test MOCK Mode

```bash
# Ensure node is NOT running
# killall the-block-node

# Start frontend
cd ~/projects/the-block/block-buster/web
npm run dev

# Open browser: http://localhost:3000/trading
# Should see: "Demo Mode (Formula-Based)" indicator
# Order book should show realistic data based on formulas
```

---

## How Mock Data Works

### Connection Detection Flow

```
App starts
↓
Try to connect to http://localhost:8545/health
↓
Retry every 500ms for 5 seconds
↓
┌─────────────┬────────────────────┐
│ Node found? │                    │
└─────┬───────┴─────────┬─────────┘
      │                    │
     YES                  NO
      │                    │
      ↓                    ↓
LIVE Mode          MOCK Mode
│                    │
│                    │
Fetch from RPC     Generate formula-based data
│                    │
│                    ↓
│                    Initialize mock 
│                    - Network issuance (economics formula)
│                    - Order book (realistic spread/volume)
│                    - Ad quality (F × P × R formula)
│                    - Energy market (utilization-based)
│                    - Time-series (smooth trends)
│                    │
│                    Start 3-second updates
│                    (simulating block time)
│                    │
└────────────────────┴────────────────────┘
                   │
            Render UI with data
```

### Formula-Based vs Random

#### ❌ WRONG: Random Data

```javascript
// DON'T DO THIS
const price = Math.random() * 100;
const volume = Math.floor(Math.random() * 1000);
```

**Problems:**
- Unrealistic values
- No correlations
- Jumpy time-series
- Breaks economic formulas

#### ✅ RIGHT: Formula-Based Data

```javascript
// DO THIS
const orderBook = mockOrderBook({
  midPrice: 115000, // 1.15 USD in micro-units
  spread_bps: 87,   // 0.87% spread (realistic)
  depth: 20,
  volumeProfile: 'exponential', // More volume near mid-price
});

const issuance = mockNetworkIssuance({
  base_reward: 12.5,
  activity_multiplier: 1.35,
  decentralization_factor: 1.15,
  supply_decay: 0.92,
});
```

**Benefits:**
- Realistic values matching blockchain economics
- Proper correlations (e.g., high utilization → higher rewards)
- Smooth time-series with trends
- Respects all formulas from economics docs

---

## Order Book Depth Chart

### Features

1. **Volume-Weighted Visualization** - Cumulative bid/ask areas
2. **Interactive Hover** - Shows price/volume/orders on hover
3. **Click to Auto-Fill** - Click any price level to fill order entry
4. **Responsive** - Adapts to container size
5. **Retina-Ready** - 2x canvas for crisp rendering

### Visual Pattern

```
Price ↑
      |
      |        Asks (Red)
      |           ┌──────
      |          ╱
      |         ╱
      |        ╱
      |  -----╱--------  Spread (dashed line)
      |      ╱
      |     ╱
      |    ╱
      |   ╱ Bids (Green)
      |  ╱
      | ╱
      |╱
      +────────────────────> Volume
```

### Usage

```javascript
import OrderBookDepthChart from './components/OrderBookDepthChart.js';

// Create chart
const chart = new OrderBookDepthChart(orderBookData, {
  height: 400,
  onPriceClick: (price) => {
    console.log('User clicked price:', price);
    // Auto-fill order entry
  },
});

// Render to container
container.appendChild(chart.render());

// Update data
chart.updateData(newOrderBookData);
```

---

## Connection Indicator

### Visual States

```html
<!-- LIVE Mode -->
<div class="connection-indicator">
  <span class="connection-dot LIVE"></span>
  <span class="connection-label">Connected to Node</span>
</div>

<!-- MOCK Mode -->
<div class="connection-indicator">
  <span class="connection-dot MOCK"></span>
  <span class="connection-label">Demo Mode (Formula-Based)</span>
</div>

<!-- DETECTING Mode -->
<div class="connection-indicator">
  <span class="connection-dot DETECTING"></span>
  <span class="connection-label">Detecting node...</span>
</div>
```

### CSS Animations

- **LIVE**: Green dot with pulsing glow (2s cycle)
- **MOCK**: Amber dot with soft glow
- **DETECTING**: Gray dot with fast pulse (1s cycle)

---

## Testing Checklist

### ☐ Visual Tests

- [ ] Connection indicator shows correct state
- [ ] Order book shows realistic prices (not random)
- [ ] Depth chart renders correctly
- [ ] Hover tooltip appears on chart
- [ ] Click on price level auto-fills order entry
- [ ] Spread line is visible and labeled
- [ ] Bid area is green, ask area is red

### ☐ Functional Tests

- [ ] Node detection works (5-second timeout)
- [ ] LIVE mode fetches from RPC
- [ ] MOCK mode generates formula-based data
- [ ] Mock data updates every 3 seconds
- [ ] Price ticker updates with formula-based values
- [ ] Order book volume bars show relative sizes
- [ ] Order history table populates correctly

### ☐ Performance Tests

- [ ] Depth chart renders at 60fps
- [ ] No memory leaks on component unmount
- [ ] Canvas resizes smoothly on window resize
- [ ] Hover interaction is responsive (<16ms)

### ☐ Data Validation Tests

- [ ] Mock order book has proper BTreeMap structure
- [ ] Prices are in micro-units (115000 = $1.15)
- [ ] Spread calculation is correct (spread_bps)
- [ ] Cumulative volumes increase monotonically
- [ ] Network issuance follows formula from docs
- [ ] Ad quality formula matches docs (F × P × R)

---

## Troubleshooting

### Issue: "Connection indicator stuck on DETECTING"

**Cause:** Node health endpoint not responding  
**Fix:** Ensure node exposes `/health` endpoint at port 8545

```rust
// In node/src/main.rs
axum::Router::new()
    .route("/health", get(|| async { "OK" }))
    // ...
```

### Issue: "Depth chart not rendering"

**Cause:** Container has zero height  
**Fix:** Ensure parent container has explicit height:

```css
#depth-chart-container {
  min-height: 400px;
}
```

### Issue: "Mock data is too random / jumpy"

**Cause:** Using Math.random() directly  
**Fix:** Always use mockDataManager methods which apply formulas

```javascript
// ❌ WRONG
const price = Math.random() * 100;

// ✅ RIGHT
const price = mockDataManager.get('priceHistory')[latest].value;
```

### Issue: "Order book prices don't match depth chart"

**Cause:** Using different data sources  
**Fix:** Both should use appState.get('orderBook')

```javascript
// In Trading.js
const orderBookData = appState.get('orderBook');
this.updateOrderBook(); // Updates list
this.updateDepthChart(); // Updates chart
```

---

## Next Steps

### Immediate (Priority 1)

1. Replace Trading.js with TradingUpdated.js
2. Test both LIVE and MOCK modes
3. Verify depth chart renders correctly
4. Add trading.css to main stylesheet

### Short-Term (Priority 2)

1. Create similar components for other markets (Energy, Ad, Compute, Storage)
2. Add economic formula visualizations (network issuance breakdown)
3. Implement receipt audit interface
4. Replace remaining checkbox patterns with modern selection

### Long-Term (Priority 3)

1. Add chart export functionality (PNG/CSV)
2. Implement zoom/pan on depth chart
3. Add candlestick price chart
4. Create governance proposal builder
5. Add dispute management UI

---

## References

### Documentation

- `~/projects/the-block/docs/economics_and_governance.md` - Economic formulas
- `~/projects/the-block/docs/apis_and_tooling.md` - API specifications
- `~/projects/the-block/node/src/dex/order_book.rs` - Order book implementation

### Components

- `web/src/mock-data-manager.js` - Mock data generator
- `web/src/components/OrderBookDepthChart.js` - Depth chart
- `web/src/components/Trading.js` - Trading component (to be replaced)
- `web/src/components/TradingUpdated.js` - New trading component

### Styles

- `web/src/styles/trading.css` - Trading-specific styles
- `web/src/styles/main.css` - Global styles

---

## Summary

✅ **Mock data is now formula-based** (not random)  
✅ **Node detection with 5-second timeout** (automatic fallback)  
✅ **Volume-weighted order book depth chart** (DEX-style)  
✅ **Interactive price selection** (click to auto-fill)  
✅ **Connection mode indicator** (LIVE/MOCK/DETECTING)  
✅ **Smooth 3-second updates** (simulating block time)  

**The frontend now accurately demonstrates blockchain capabilities using real formulas from the economics documentation, and seamlessly transitions to live data when the node is available.**

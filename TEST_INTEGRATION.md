# Integration Test - Trading Component with Mock Data

**Date:** February 13, 2026, 3:35 PM EST  
**Status:** Ready to Test

---

## Quick Test Checklist

### ✅ Files Verified

```bash
# Check files exist
✅ web/src/mock-data-manager.js
✅ web/src/components/OrderBookDepthChart.js
✅ web/src/components/Trading.js (updated)
✅ web/src/components/Trading.backup.js (backup created)
✅ web/src/styles/trading.css
✅ CSS import added to main.js
```

### 🔧 Configuration Fixed

✅ **Port Configuration**: Updated mockDataManager to use `localhost:5000` (matches main app)

---

## Test Steps

### Test 1: MOCK Mode (Node Not Running)

```bash
# 1. Ensure node is NOT running
killall the-block-node 2>/dev/null || true

# 2. Start frontend
cd ~/projects/the-block/block-buster/web
npm run dev

# 3. Open browser
open http://localhost:3000/trading
```

**Expected Results:**

```
Connection Indicator:
🟡 "Demo Mode (Formula-Based)"

Order Book:
- Shows realistic prices (e.g., $1.149, $1.150, $1.151)
- NOT random jumps
- Spreads around ~0.87%
- Volume increases near mid-price

Depth Chart:
- Green area (bids) on left/bottom
- Red area (asks) on right/top
- Dashed spread line in middle
- Hover shows tooltip with price/volume

Price Ticker:
- Updates every ~3 seconds
- Smooth changes (not jumps)
- Shows spread percentage

Console Logs:
[MockDataManager] Detecting node at http://localhost:5000 (5000ms timeout)...
[MockDataManager] ⚠️ Node not detected after 5000ms - using MOCK mode
[MockDataManager] Mock data will use formula-based generation
[MockDataManager] Initializing formula-based mock data...
[MockDataManager] Mock data initialized
[MockDataManager] Starting mock data updates (3s interval)
```

### Test 2: LIVE Mode (Node Running)

```bash
# 1. Start node (in separate terminal)
cd ~/projects/the-block/node
cargo run --bin the-block-node --release

# 2. Wait for node to start (check logs)
# Should see: "Server listening on 0.0.0.0:5000"

# 3. Frontend should already be running from Test 1
# Refresh browser: http://localhost:3000/trading
```

**Expected Results:**

```
Connection Indicator:
🟢 "Connected to Node" (pulsing green dot)

Order Book:
- Shows LIVE data from blockchain
- Real trades reflected
- Actual spreads from DEX

Console Logs:
[MockDataManager] Detecting node at http://localhost:5000 (5000ms timeout)...
[MockDataManager] ✅ Node detected - using LIVE mode
```

---

## Visual Verification

### Connection Indicator States

#### DETECTING (First 5 seconds)
```
⚪ Detecting node...
[Gray pulsing dot, fast 1s pulse]
```

#### MOCK Mode
```
🟡 Demo Mode (Formula-Based)
[Amber dot with soft glow]
```

#### LIVE Mode
```
🟢 Connected to Node
[Green pulsing dot, slow 2s pulse]
```

### Order Book Depth Chart

```
┌─────────────────────────────────────────┐
│  Order Book Depth                       │
│  Volume-weighted cumulative bid/ask... │
├─────────────────────────────────────────┤
│                                         │
│     Price (USD)                         │
│        ↑                                │
│  1.16  │        Asks (Red)              │
│        │           ┌──────              │
│  1.155 │          ╱                     │
│        │         ╱                      │
│  1.15  │  -----╱-------- Spread: 0.87% │
│        │     ╱                          │
│  1.145 │    ╱ Bids (Green)              │
│        │   ╱                            │
│  1.14  │  ╱                             │
│        │ ╱                              │
│        └─────────────────────────────>  │
│          Cumulative Volume (BLOCK)     │
└─────────────────────────────────────────┘
```

**Hover Interaction:**
- Move mouse over chart
- Tooltip appears showing:
  - BID or ASK
  - Price: $1.1495
  - Volume: 450 BLOCK
  - Cumulative: 1,820 BLOCK
  - Orders: 2
- Crosshair lines appear (vertical + horizontal)

**Click Interaction:**
- Click any price level on chart
- Order entry "Price" field auto-fills with that price
- Field flashes green briefly

### Order Book List

```
┌─────────────────────────────────────┐
│ Order Book                          │
│ Live buy and sell orders            │
├─────────────────────────────────────┤
│ Price (USD)  Amount      Total      │
├─────────────────────────────────────┤
│ $1.151      780         $897.78     │ ← Red (ASK)
│ $1.150      620         $713.00     │ ← Red (ASK)
│ $1.150      450         $517.50     │ ← Red (ASK)
├─────────────────────────────────────┤
│         $1.150                      │ ← Current Price
│      Current Price                  │
├─────────────────────────────────────┤
│ $1.149      510         $586.59     │ ← Green (BID)
│ $1.149      320         $367.68     │ ← Green (BID)
│ $1.148      680         $780.64     │ ← Green (BID)
└─────────────────────────────────────┘
```

**Click Interaction:**
- Click any row
- Order entry "Price" field auto-fills
- Field flashes green

---

## Console Checks

### Check for Errors

```javascript
// In browser console, run:
console.clear();
location.reload();

// Wait 10 seconds, then check:
window.mockDataManager.getMode()
// Should return: "MOCK" or "LIVE"

window.mockDataManager.get('orderBook')
// Should return: { bids: [...], asks: [...], ... }

window.appState.get('orderBook')
// Should return same as above

window.appState.get('connectionMode')
// Should return: "MOCK" or "LIVE"
```

### Check Mock Data Quality

```javascript
// Check order book structure
const ob = window.mockDataManager.get('orderBook');

// Verify prices are realistic
console.log('Spread (bps):', ob.spread_bps); 
// Should be ~87 (0.87%)

console.log('Bid prices:', ob.bids.slice(0, 3).map(b => b.price));
// Should be descending: [114950, 114900, 114850]

console.log('Ask prices:', ob.asks.slice(0, 3).map(a => a.price));
// Should be ascending: [115050, 115100, 115150]

// Check volume profile (more volume near mid-price)
const bidVolumes = ob.bids.map(b => 
  b.orders.reduce((sum, o) => sum + o.amount, 0)
);
console.log('Bid volumes:', bidVolumes.slice(0, 5));
// First few should be larger: [~800, ~750, ~600, ~450, ~300]

// Check network issuance formula
const issuance = window.mockDataManager.get('issuance');
console.log('Issuance:', issuance);
// Verify:
// - base_reward: ~0.36
// - activity_multiplier: ~1.2-1.5
// - decentralization_factor: ~1.0-1.3
// - supply_decay: ~0.9-0.95
// - final_reward: base × activity × decentr × decay
```

---

## Common Issues & Fixes

### Issue 1: "Connection indicator stuck on DETECTING"

**Symptoms:**
- Gray dot pulses forever
- Never switches to MOCK or LIVE

**Diagnosis:**
```javascript
// Check if detectNode() was called
window.mockDataManager.getMode()
// If returns "DETECTING", it hasn't finished

// Check console for errors
// Look for: "Detecting node at..."
```

**Fix:**
- Clear browser cache and reload
- Check if `/health` endpoint exists
- Verify mockDataManager import in Trading.js

### Issue 2: "Depth chart not rendering"

**Symptoms:**
- Empty space where chart should be
- Console error about canvas context

**Diagnosis:**
```javascript
// Check if container exists
document.querySelector('#depth-chart-container')
// Should return: <div id="depth-chart-container">...</div>

// Check if order book data exists
window.appState.get('orderBook')
// Should return object with bids/asks
```

**Fix:**
- Check CSS is loaded: `import './styles/trading.css'` in main.js
- Verify OrderBookDepthChart.js exists
- Check browser console for import errors

### Issue 3: "Mock data is random/jumpy"

**Symptoms:**
- Prices jump wildly (e.g., $1.15 → $8.42 → $0.23)
- Order book shows unrealistic values
- Spreads are huge (>10%)

**Diagnosis:**
```javascript
// Check if using mockDataManager or Math.random()
window.mockDataManager.get('orderBook').spread_bps
// Should be ~87, not 10000+
```

**Fix:**
- Verify Trading.js uses `mockDataManager.get('orderBook')`
- NOT using old `generateOrderBookRows()` method
- Check mockDataManager was imported correctly

### Issue 4: "Auto-fill not working"

**Symptoms:**
- Click on order book or chart
- Price field doesn't update

**Diagnosis:**
```javascript
// Check if autofillPrice method exists
const trading = window.router.getCurrentComponent();
typeof trading.autofillPrice
// Should return: "function"

// Check if price input exists
document.querySelector('#order-price')
// Should return: <input id="order-price" ...>
```

**Fix:**
- Verify Trading.js has `autofillPrice(price)` method
- Check `onPriceClick` callback in OrderBookDepthChart initialization
- Verify click event listeners are attached

---

## Performance Benchmarks

### Target Performance

```
Mock Data Generation: <10ms
Depth Chart Render: <16ms (60fps)
Hover Interaction: <5ms
Auto-fill: <3ms
```

### Measure Performance

```javascript
// In browser console
performance.mark('test-start');

// Generate mock data
window.mockDataManager.mockOrderBook();

performance.mark('test-end');
performance.measure('mock-generation', 'test-start', 'test-end');
console.log(performance.getEntriesByName('mock-generation')[0].duration);
// Should be: <10ms

// Test depth chart render
const chart = document.querySelector('.order-book-depth-chart canvas');
if (chart) {
  performance.mark('render-start');
  // Trigger re-render by updating data
  window.appState.set('orderBook', window.mockDataManager.get('orderBook'));
  requestAnimationFrame(() => {
    performance.mark('render-end');
    performance.measure('chart-render', 'render-start', 'render-end');
    console.log(performance.getEntriesByName('chart-render')[0].duration);
    // Should be: <16ms
  });
}
```

---

## Success Criteria

### ✅ MOCK Mode Working

- [ ] Connection indicator shows 🟡 "Demo Mode (Formula-Based)"
- [ ] Order book shows realistic prices (~$1.15 ± 0.05)
- [ ] Spreads are realistic (~0.87%)
- [ ] Depth chart renders with green/red areas
- [ ] Hover shows tooltip on chart
- [ ] Click on price auto-fills order entry
- [ ] Price updates smoothly every ~3s
- [ ] Console shows no errors
- [ ] Network issuance formula is correct
- [ ] Time-series data is smooth (no jumps)

### ✅ LIVE Mode Working (if node available)

- [ ] Connection indicator shows 🟢 "Connected to Node"
- [ ] Order book shows data from RPC
- [ ] Depth chart updates with live data
- [ ] Transitions from MOCK to LIVE smoothly
- [ ] No errors when switching modes

### ✅ Performance

- [ ] Initial load: <1s
- [ ] Depth chart render: <16ms
- [ ] Hover interaction: <5ms
- [ ] No memory leaks
- [ ] Smooth 60fps scrolling

---

## Next Steps After Testing

Once tests pass:

1. **Document any issues found** in this file
2. **Take screenshots** of MOCK and LIVE modes
3. **Commit changes** to git
4. **Move to next priority:**
   - EconomicsIssuanceChart (formula breakdown)
   - AdQualityBreakdown (F × P × R visualization)
   - ReceiptAuditInterface (filters, drill-down)

---

## Test Results

**Tester:** ________________  
**Date:** ________________  
**Environment:** macOS / Chrome / localhost:3000

### MOCK Mode
```
[ ] Connection indicator: PASS / FAIL
[ ] Order book  PASS / FAIL
[ ] Depth chart: PASS / FAIL
[ ] Hover tooltip: PASS / FAIL
[ ] Auto-fill: PASS / FAIL
[ ] Performance: PASS / FAIL

Notes:
________________________________________
________________________________________
________________________________________
```

### LIVE Mode
```
[ ] Connection indicator: PASS / FAIL / SKIPPED
[ ] RPC  PASS / FAIL / SKIPPED
[ ] Depth chart: PASS / FAIL / SKIPPED

Notes:
________________________________________
________________________________________
________________________________________
```

---

**End of Integration Test**

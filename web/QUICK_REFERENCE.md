# Block-Buster Quick Reference

**🚀 Fast reference for common patterns**

---

## 💻 Commands

```bash
# Development
npm run dev          # Start dev server (http://localhost:4173)
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Check JavaScript
npm run format       # Format code

# CSS
npm run tailwind:watch  # Watch Tailwind CSS changes
```

---

## 🎨 Design Tokens

### Colors
```html
<!-- Primary palette -->
<div class="bg-block-purple">  
<div class="text-block-amber">  
<div class="border-block-cyan">

<!-- Status colors -->
<span class="text-status-ok">      <!-- Green -->
<span class="text-status-warn">    <!-- Orange -->
<span class="text-status-bad">     <!-- Red -->
<span class="text-status-info">    <!-- Blue -->

<!-- Backgrounds -->
<div class="bg-panel-black">       <!-- Main panels -->
<div class="bg-bg-base">           <!-- Page background -->
```

### Typography
```html
<h1 class="font-display">   <!-- Space Grotesk -->
<p class="font-body">       <!-- IBM Plex Sans -->
<code class="font-mono">    <!-- JetBrains Mono -->
```

### Component Classes
```html
<!-- Panels -->
<div class="panel-blade">        <!-- Standard panel -->
<div class="hologram-panel">     <!-- Amber glow panel -->
<div class="glass-panel">        <!-- Glass morphism -->

<!-- Status -->
<span class="status-pill status-trade">     <!-- Green -->
<span class="status-pill status-rehearsal"> <!-- Yellow -->
<span class="status-pill status-gated">     <!-- Gray -->

<!-- KPI Cards -->
<div class="kpi">
  <div class="kpi-label">Label</div>
  <div class="kpi-value">1,234</div>
  <div class="kpi-meta">+10% today</div>
</div>

<!-- Buttons -->
<button class="btn btn-primary">   <!-- Amber button -->
<button class="btn btn-secondary"> <!-- Gray button -->
<button class="btn btn-ghost">     <!-- Outlined button -->
```

---

## 🔌 RPC Client

### Import
```javascript
import { rpcClient } from './rpc-client.js';
```

### Basic Usage
```javascript
// Convenience methods (preferred)
const { result, latencyMs } = await rpcClient.governorStatus();
const { result } = await rpcClient.blockHeight();
const { result } = await rpcClient.ledgerSupply();

// Generic call
const { result } = await rpcClient.call('method.name', { param: 'value' });
```

### Available Methods
```javascript
rpcClient.governorStatus()              // Governor status
rpcClient.governorDecisions(limit)      // Recent decisions
rpcClient.blockHeight()                 // Current block height
rpcClient.blockReward()                 // Block reward
rpcClient.ledgerBalance(address)        // Account balance
rpcClient.ledgerSupply()                // Total supply
rpcClient.marketMetrics()               // Market analytics
rpcClient.treasuryBalance()             // Treasury balance
rpcClient.networkHealth()               // Network health
rpcClient.gateReadiness(market)         // Gate readiness
```

### Error Handling
```javascript
try {
  const { result } = await rpcClient.governorStatus();
  console.log(result);
} catch (error) {
  showToast(`Failed to load: ${error.message}`, 'error');
}
```

### Metrics
```javascript
const metrics = rpcClient.getMetrics();
console.log(`Success rate: ${metrics.successfulRequests / metrics.totalRequests}`);
```

---

## 📊 Chart.js

### Import
```javascript
import { createThemedChart, BLOCK_CHART_THEME } from './charting.js';
```

### Create Chart
```javascript
const ctx = document.getElementById('myChart').getContext('2d');
const chart = createThemedChart(ctx, 'line', {
   {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{
      label: 'Revenue',
       [100, 200, 150],
      borderColor: BLOCK_CHART_THEME.colors.amber.border,
      backgroundColor: BLOCK_CHART_THEME.colors.amber.bg
    }]
  },
  options: {
    // Only specify overrides - theme provides defaults
    scales: { y: { min: 0, max: 300 } }
  }
});
```

### Color Palette
```javascript
BLOCK_CHART_THEME.colors.amber   // { border, bg }
BLOCK_CHART_THEME.colors.cyan
BLOCK_CHART_THEME.colors.purple
BLOCK_CHART_THEME.colors.green
BLOCK_CHART_THEME.colors.red
BLOCK_CHART_THEME.colors.blue
BLOCK_CHART_THEME.colors.gray
```

### Update Chart
```javascript
chart.data.labels.push('Apr');
chart.data.datasets[0].data.push(180);
chart.update();
```

---

## 🧩 Components

### Import
```javascript
import { 
  StatusPill, MetricCard, GateCard, ProgressBar,
  showToast, EmptyState, LoadingSpinner
} from './components.js';
```

### Status Pill
```javascript
StatusPill({ status: 'trade', text: '✓ Open' })
StatusPill({ status: 'rehearsal', text: 'Testing' })
StatusPill({ status: 'gated', text: 'Closed' })
```

### Metric Card
```javascript
MetricCard({
  label: 'Block Height',
  value: '1,234,567',
  meta: '+123 today',
  icon: '📦',
  trend: 'up'  // 'up', 'down', or omit
})
```

### Gate Card
```javascript
GateCard({
  market: 'storage',      // storage, compute, energy, domain, ads
  status: 'Trade',        // Trade, Rehearsal, Gated
  readiness: 92,
  threshold: 80,
  metrics: {
    'Volume': '$1.2M',
    'Liquidity': '85%'
  }
})
```

### Progress Bar
```javascript
ProgressBar({
  value: 75,
  max: 100,
  color: 'bg-amber-500',
  label: 'Completion',
  showPercentage: true
})
```

### Toast Notifications
```javascript
showToast('Transaction submitted', 'success', 3000);
showToast('Connection error', 'error');
showToast('Processing...', 'info', 0);  // 0 = no auto-dismiss
```

### Empty State
```javascript
EmptyState({
  title: 'No data yet',
  message: 'Start trading to see activity',
  icon: '📊',
  action: '<button class="btn btn-primary">Get Started</button>'
})
```

### Loading Spinner
```javascript
LoadingSpinner({ size: 'md', message: 'Loading...' })
```

### Rendering Components
```javascript
// Single component
document.getElementById('status').innerHTML = StatusPill({ status: 'trade', text: 'Active' });

// Multiple components
const html = gates.map(g => GateCard({
  market: g.market,
  status: g.status,
  readiness: g.readiness
})).join('');
document.getElementById('gates').innerHTML = html;
```

---

## 🐛 Common Patterns

### Fetch and Display Data
```javascript
import { rpcClient } from './rpc-client.js';
import { MetricCard, showToast } from './components.js';

async function loadDashboard() {
  try {
    const { result } = await rpcClient.governorStatus();
    
    const html = MetricCard({
      label: 'Epoch',
      value: result.epoch,
      meta: `Updated ${new Date().toLocaleTimeString()}`
    });
    
    document.getElementById('metrics').innerHTML = html;
  } catch (error) {
    showToast(`Failed to load: ${error.message}`, 'error');
  }
}

loadDashboard();
```

### Create a Chart
```javascript
import { createThemedChart, BLOCK_CHART_THEME } from './charting.js';
import { rpcClient } from './rpc-client.js';

async function loadChart() {
  const { result } = await rpcClient.marketMetrics();
  
  const ctx = document.getElementById('priceChart').getContext('2d');
  const chart = createThemedChart(ctx, 'line', {
     {
      labels: result.timestamps,
      datasets: [{
        label: 'Price',
         result.prices,
        borderColor: BLOCK_CHART_THEME.colors.amber.border,
        backgroundColor: BLOCK_CHART_THEME.colors.amber.bg,
        fill: true
      }]
    }
  });
}

loadChart();
```

### Handle Loading States
```javascript
import { LoadingSpinner, EmptyState, ErrorState } from './components.js';

const container = document.getElementById('content');

// Show loading
container.innerHTML = LoadingSpinner({ message: 'Loading data...' });

try {
  const { result } = await rpcClient.governorStatus();
  
  if (result.gates.length === 0) {
    // Show empty state
    container.innerHTML = EmptyState({
      title: 'No gates found',
      message: 'Check back later'
    });
  } else {
    // Show data
    container.innerHTML = /* render gates */;
  }
} catch (error) {
  // Show error state
  container.innerHTML = ErrorState({
    title: 'Failed to load',
    message: error.message,
    action: '<button class="btn btn-ghost" onclick="location.reload()">Retry</button>'
  });
}
```

### Format Numbers
```javascript
import { formatNumber, formatCurrency, formatPercentage } from './components.js';

formatNumber(1234567, 0)           // "1,234,567"
formatNumber(3.14159, 2)           // "3.14"
formatCurrency(1234.56)            // "$1,234.56"
formatPercentage(75.5, 1)          // "75.5%"
formatPercentage(0.755, 1, true)   // "75.5%" (input is 0-1)
```

---

## ⚡ Performance Tips

### RPC Requests
```javascript
// ✅ Good: Single request
const { result } = await rpcClient.governorStatus();

// ❌ Bad: Multiple identical requests (deduplicated automatically, but still inefficient)
const [r1, r2, r3] = await Promise.all([
  rpcClient.governorStatus(),
  rpcClient.governorStatus(),
  rpcClient.governorStatus()
]);
```

### Chart Updates
```javascript
// ✅ Good: Batch updates
chart.data.labels.push('Apr', 'May', 'Jun');
chart.data.datasets[0].data.push(180, 190, 200);
chart.update();

// ❌ Bad: Multiple updates
chart.data.labels.push('Apr');
chart.update();
chart.data.labels.push('May');
chart.update();
```

### Component Rendering
```javascript
// ✅ Good: Build HTML string, single DOM update
const html = items.map(item => MetricCard(item)).join('');
container.innerHTML = html;

// ❌ Bad: Multiple DOM updates
items.forEach(item => {
  container.innerHTML += MetricCard(item);
});
```

---

## 🔧 Debugging

### Enable Verbose RPC Logging
```javascript
import { BlockRpcClient, createLoggingMiddleware } from './rpc-client.js';

const rpc = new BlockRpcClient('http://localhost:5000', {
  middleware: [createLoggingMiddleware(true)]  // verbose = true
});

// Logs:
// [RPC Request] governor.status {}
// [RPC Response] {...} (123.4ms)
```

### Check RPC Metrics
```javascript
const metrics = rpcClient.getMetrics();
console.table(metrics);
// Shows: totalRequests, successfulRequests, failedRequests, retriedRequests, deduplicatedRequests
```

### Inspect Chart Data
```javascript
console.log('Chart ', chart.data);
console.log('Chart options:', chart.options);
```

---

## 📚 Further Reading

- **BUILD_SYSTEM_README.md** - Comprehensive guide
- **IMPLEMENTATION_SUMMARY.md** - What was built and why
- **DEV_AUDIT_2026.md** - Original technical audit
- **IMMEDIATE_ACTION_ITEMS.md** - Day-by-day implementation plan

---

**Keep this reference handy!** Bookmark it or print it out.

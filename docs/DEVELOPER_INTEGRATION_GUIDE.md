# Developer Integration Guide - Block-Buster UX Enhancement

**Target Audience:** Full-stack engineers implementing market dashboards  
**Date:** February 13, 2026  
**Prerequisite:** Read `UX_MODERNIZATION_COMPLETE.md` first

---

## Critical Components Created

### 1. SelectionPanel.js
**Location:** `web/src/components/SelectionPanel.js`  
**Purpose:** Replace checkbox-based selection with modern click-to-select  
**Dependencies:** `Component`, `utils.js`  
**State:** Maintains selected row IDs in Set  

### 2. MarketChart.js
**Location:** `web/src/components/MarketChart.js`  
**Purpose:** Render interactive time-series and bar charts  
**Dependencies:** `Component`, `utils.js`  
**Rendering:** Canvas-based with device pixel ratio scaling  

### 3. FilterBuilder.js
**Location:** `web/src/components/FilterBuilder.js`  
**Purpose:** Advanced filtering UI with multiple operators  
**Dependencies:** `Component`, `utils.js`  
**Storage:** LocalStorage for saved presets  

### 4. EnergyMarketEnhanced.js
**Location:** `web/src/components/EnergyMarketEnhanced.js`  
**Purpose:** Complete energy market dashboard with full RPC integration  
**Dependencies:** All above + `Modal`, `appState`, `rpc`  
**Polling:** 5-second interval (stops when WebSocket active)  

### 5. modern-ux.css
**Location:** `web/src/styles/modern-ux.css`  
**Purpose:** Styles for all new components  
**Integration:** Added to `index.html`  

---

## Integration Workflow

### Step 1: Import New Components

**In your market component file:**

```javascript
import MarketChart from './MarketChart.js';
import SelectionPanel from './SelectionPanel.js';
import FilterBuilder from './FilterBuilder.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';
import appState from '../state.js';
```

### Step 2: Initialize in Constructor

```javascript
class YourMarket extends Component {
  constructor(rpc) {
    super('YourMarket');
    this.rpc = rpc;
    this.charts = {}; // Store chart instances
    this.selectionPanel = null;
    this.filterBuilder = null;
    this.activeView = 'overview';
  }
}
```

### Step 3: Fetch Data with Batched RPCs

```javascript
async fetchMarketData() {
  try {
    // Batch all RPC calls for efficiency
    const [overview, details, history] = await Promise.all([
      this.rpc.call('your_market.overview', {}),
      this.rpc.call('your_market.details', {}),
      this.rpc.call('your_market.history', { limit: 100 }),
    ]);

    // Transform to state shape
    appState.set('yourMarket', {
      items: overview.items || [],
      metrics: {
        total: overview.total || 0,
        active: overview.active || 0,
        // ...
      },
      history: history.data || [],
      lastUpdated: Date.now(),
    });
  } catch (error) {
    console.error('[YourMarket] Failed to fetch:', error);
  }
}
```

### Step 4: Render with Tabs

```javascript
render() {
  const content = document.createElement('div');
  content.className = 'content';

  // Header with actions
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div class="hero">
      <h2>Your Market</h2>
      <p>Description of what this market does</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" id="primary-action-btn">
        <span class="btn-icon">+</span>
        Primary Action
      </button>
    </div>
  `;
  content.appendChild(header);

  // Tabs for different views
  const tabs = document.createElement('nav');
  tabs.className = 'tabs';
  tabs.innerHTML = `
    <button class="tab active" data-view="overview">Overview</button>
    <button class="tab" data-view="items">Items</button>
    <button class="tab" data-view="analytics">Analytics</button>
  `;
  tabs.querySelectorAll('.tab').forEach(tab => {
    this.listen(tab, 'click', (e) => {
      this.activeView = e.target.dataset.view;
      this.render();
    });
  });
  content.appendChild(tabs);

  // View container
  const viewContainer = document.createElement('div');
  viewContainer.id = 'view-container';
  content.appendChild(viewContainer);

  this.container.innerHTML = '';
  this.container.appendChild(content);

  this.renderActiveView();
}
```

### Step 5: Render Overview with Charts

```javascript
renderOverview() {
  const view = document.createElement('div');
  
  // Hero metrics
  const heroMetrics = document.createElement('section');
  heroMetrics.className = 'metrics-hero-grid';
  heroMetrics.innerHTML = `
    <div class="card-metric-hero">
      <h3>Total Items</h3>
      <div class="value" data-bind="total">—</div>
      <div class="label">All time</div>
    </div>
    <!-- More metrics -->
  `;
  view.appendChild(heroMetrics);

  // Charts
  const chartsSection = document.createElement('div');
  chartsSection.className = 'layout-split';
  chartsSection.innerHTML = `
    <div class="card">
      <h3>Activity Over Time</h3>
      <div id="activity-chart" style="height: 300px;"></div>
    </div>
    <div class="card">
      <h3>Distribution</h3>
      <div id="distribution-chart" style="height: 300px;"></div>
    </div>
  `;
  view.appendChild(chartsSection);

  // Render charts after DOM insertion
  requestAnimationFrame(() => this.renderCharts());

  return view;
}

renderCharts() {
  const data = appState.get('yourMarket') || {};
  
  this.charts.activity = new MarketChart({
    containerId: 'activity-chart',
    type: 'area',
    series: [{
      name: 'Activity',
       (data.history || []).map(h => [
        new Date(h.timestamp).getTime(),
        h.count,
      ]),
      color: '#1ac6a2',
    }],
    xAxis: { type: 'time', label: 'Time' },
    yAxis: { label: 'Count' },
  });
  this.charts.activity.mount();
}
```

### Step 6: Render Table with Filters + Selection

```javascript
renderItems() {
  const view = document.createElement('div');
  
  // Filter builder
  const filterContainer = document.createElement('div');
  filterContainer.id = 'filter-container';
  view.appendChild(filterContainer);

  // Table container
  const tableContainer = document.createElement('div');
  tableContainer.className = 'card';
  tableContainer.id = 'table-container';
  view.appendChild(tableContainer);

  requestAnimationFrame(() => this.renderTable());

  return view;
}

renderTable() {
  const container = $('#table-container');
  const data = appState.get('yourMarket') || {};
  const items = data.items || [];

  // Initialize filter builder
  this.filterBuilder = new FilterBuilder({
    containerId: 'filter-container',
    columns: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'created_at', label: 'Created', type: 'date' },
    ],
    onFilterChange: (filters) => {
      const filtered = this.filterBuilder.applyFilters(items);
      this.updateTable(filtered);
    },
  });
  this.filterBuilder.mount();

  // Initial render
  this.updateTable(items);
}

updateTable(items) {
  const container = $('#table-container');
  
  // Create table
  const table = document.createElement('table');
  table.className = 'data-table';
  
  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>ID</th>
      <th>Amount</th>
      <th>Status</th>
      <th>Created</th>
      <th>Actions</th>
    </tr>
  `;
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.dataset.rowId = item.id;
    tr.tabIndex = 0;
    
    tr.innerHTML = `
      <td><code class="code-inline">${item.id}</code></td>
      <td class="text-right">${fmt.currency(item.amount)}</td>
      <td><span class="pill ${item.status === 'active' ? 'success' : 'muted'}">${item.status}</span></td>
      <td>${new Date(item.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-xs btn-ghost" data-action="view">View</button>
      </td>
    `;
    
    tbody.appendChild(tr);
    
    const viewBtn = tr.querySelector('[data-action="view"]');
    this.listen(viewBtn, 'click', () => this.showItemDetails(item));
  });
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);

  // Attach selection panel
  this.selectionPanel = new SelectionPanel({
    containerId: 'table-container',
    bulkActions: [
      { 
        label: 'Export Selected', 
        icon: '⬇', 
        onClick: (items) => this.exportItems(items),
      },
    ],
    onSelectionChange: (ids) => {
      console.log('Selected:', ids);
    },
  });
  this.selectionPanel.mount();
  
  const rows = Array.from(tbody.querySelectorAll('tr'));
  this.selectionPanel.attachToRows(rows, items);
}
```

### Step 7: Add Modal Workflows

```javascript
showCreateItemModal() {
  const modal = new Modal({
    title: 'Create Item',
    size: 'medium',
    content: `
      <form id="create-item-form" class="form">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" required />
        </div>
        <div class="form-group">
          <label>Amount</label>
          <input type="number" name="amount" required min="0" step="0.01" />
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-ghost" id="cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="submit-btn">Create</button>
    `,
  });
  modal.open();

  setTimeout(() => {
    $('#cancel-btn')?.addEventListener('click', () => modal.close());
    $('#submit-btn')?.addEventListener('click', async () => {
      await this.createItem();
      modal.close();
    });
  }, 100);
}

async createItem() {
  const form = $('#create-item-form');
  const formData = new FormData(form);
  
  try {
    const result = await this.rpc.call('your_market.create', {
      name: formData.get('name'),
      amount: parseFloat(formData.get('amount')),
    });
    
    console.log('Item created:', result);
    await this.fetchMarketData();
  } catch (error) {
    console.error('Failed to create item:', error);
    alert(`Error: ${error.message}`);
  }
}
```

---

## Common Patterns

### Pattern 1: Polling Control

```javascript
startPolling() {
  if (this.pollingInterval) return;
  this.pollingInterval = this.interval(() => this.fetchMarketData(), 5000);
}

stopPolling() {
  if (this.pollingInterval) {
    clearInterval(this.pollingInterval);
    this.pollingInterval = null;
  }
}

onMount() {
  await this.fetchMarketData();
  
  this.subscribe(appState, 'usePolling', (shouldPoll) => {
    if (shouldPoll) this.startPolling();
    else this.stopPolling();
  });
  
  if (appState.get('usePolling') !== false) {
    this.startPolling();
  }
}

onUnmount() {
  this.stopPolling();
  Object.values(this.charts).forEach(c => c.unmount());
}
```

### Pattern 2: Chart Updates

```javascript
updateView(data) {
  // Update charts with new data
  if (this.charts.activity) {
    this.charts.activity.updateData([{
      name: 'Activity',
       data.history.map(h => [h.timestamp, h.count]),
      color: '#1ac6a2',
    }]);
  }
}
```

### Pattern 3: State Subscriptions

```javascript
this.subscribe(appState, 'yourMarket', (data) => {
  requestAnimationFrame(() => this.updateView(data));
});
```

---

## RPC Integration Checklist

For each market, ensure all RPC methods are called:

### Energy Market
- [x] energy.register_provider
- [x] energy.market_state
- [x] energy.submit_reading
- [x] energy.credits
- [x] energy.settle
- [x] energy.receipts
- [x] energy.disputes
- [x] energy.flag_dispute
- [x] energy.resolve_dispute
- [x] energy.slashes

### Ad Market (TODO)
- [ ] ad_market.submit_bid
- [ ] ad_market.policy_snapshot
- [ ] ad_market.cohort_query
- [ ] ad_market.campaign_create
- [ ] ad_market.campaign_pause
- [ ] ad_market.campaign_stats

### Compute Market (TODO)
- [ ] compute_market.submit_job
- [ ] compute_market.job_status
- [ ] compute_market.job_cancel
- [ ] compute_market.receipts
- [ ] compute_market.sla_history
- [ ] compute_market.provider_register

### Storage Market (TODO)
- [ ] storage.put
- [ ] storage.get
- [ ] storage.list
- [ ] storage.delete
- [ ] storage.provider_register
- [ ] storage.provider_capacity

---

## Component Communication

### App State Flow

```
Fetch RPC Data
      ↓
appState.set('market', data)
      ↓
Component subscriptions triggered
      ↓
requestAnimationFrame(() => update UI)
      ↓
User interaction (click, select, filter)
      ↓
RPC call
      ↓
Fetch RPC Data (loop)
```

### Event Flow

```
User clicks row
      ↓
SelectionPanel.handleRowClick()
      ↓
selectedItems.add(id)
      ↓
updateRowState() + updateActionBar()
      ↓
onSelectionChange callback
      ↓
Parent component receives selected IDs
```

---

## Testing Strategy

### Unit Tests

**SelectionPanel:**
```javascript
test('single click selects row', () => {
  const panel = new SelectionPanel({ ... });
  panel.handleRowClick({ currentTarget: row, metaKey: false });
  expect(panel.selectedItems.size).toBe(1);
});
```

**MarketChart:**
```javascript
test('renders chart with data', () => {
  const chart = new MarketChart({  [...] });
  chart.mount();
  expect(chart.canvas).toBeDefined();
});
```

### Integration Tests

```javascript
test('filter changes update table', async () => {
  const market = new YourMarket(rpc);
  await market.mount();
  
  const filter = market.filterBuilder;
  filter.addFilter({ column: 'status', operator: 'equals', value: 'active' });
  
  const rows = document.querySelectorAll('tr[data-row-id]');
  expect(rows.length).toBe(activeItemCount);
});
```

---

## Performance Checklist

- [ ] Use `requestAnimationFrame` for DOM updates
- [ ] Batch RPC calls with `Promise.all()`
- [ ] Store chart instances, don't recreate
- [ ] Debounce filter input (300ms)
- [ ] Use event delegation for row actions
- [ ] Canvas rendering for charts (not SVG)
- [ ] Stop polling when WebSocket active
- [ ] Lazy render charts (after DOM paint)
- [ ] Use CSS containment for cards
- [ ] Minimize reflows (batch DOM changes)

---

## Common Issues & Solutions

### Issue: Charts not rendering
**Solution:** Ensure container has explicit height in CSS or inline style

### Issue: Selection not working
**Solution:** Ensure `data-row-id` attribute set on each `<tr>`

### Issue: Filters not applying
**Solution:** Call `filterBuilder.applyFilters(data)` in `onFilterChange`

### Issue: Action bar not appearing
**Solution:** Ensure `selection-action-bar` element inserted at top of container

### Issue: Charts updating slowly
**Solution:** Call `chart.updateData()` instead of recreating chart

---

## Router Integration

**File:** `web/src/router.js`

Update router to use enhanced components:

```javascript
import EnergyMarketEnhanced from './components/EnergyMarketEnhanced.js';

const routes = {
  '/energy': () => new EnergyMarketEnhanced(rpc),
  // Add other enhanced markets as you create them
};
```

---

## Next Development Tasks

### Priority 1: Apply to Remaining Markets
1. Create `AdMarketEnhanced.js` (copy EnergyMarketEnhanced pattern)
2. Create `ComputeMarketEnhanced.js`
3. Create `StorageMarketEnhanced.js`
4. Update router to use enhanced versions

### Priority 2: Testing
1. Unit tests for SelectionPanel
2. Unit tests for MarketChart
3. Unit tests for FilterBuilder
4. Integration tests for each market

### Priority 3: Polish
1. Loading skeletons for charts
2. Empty states for tables
3. Error boundaries for RPC failures
4. Toast notifications for actions
5. Keyboard shortcuts reference modal

---

## Conclusion

You now have:
1. Modern selection UX (no checkboxes)
2. Interactive charts (zoom, pan, tooltip)
3. Advanced filters (operators, presets)
4. Complete RPC integration pattern
5. Reusable components for all markets

Follow this guide to implement the same patterns across Ad, Compute, Storage, Governance, and Treasury markets.

**Build with 1% dev mentality. Every detail matters.**

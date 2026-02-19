# Block-Buster UX Deep Audit & Implementation Spec

**Date:** February 13, 2026  
**Auditor:** Senior Full-Stack Engineer  
**Philosophy:** 1% dev mindset - every pixel optimized, every interaction intentional  
**Scope:** Complete frontend UX transformation with authoritative implementation instructions

---

## Executive Summary

### Critical Finding

**The frontend is not representative of the actual blockchain data structures and capabilities.**

Current issues:
- Order book uses fake random data instead of real `BTreeMap<u64, VecDeque<Order>>` structure from `node/src/dex/order_book.rs`
- No volume-weighted depth visualization
- Checkboxes for selection (outdated, not modern)
- Missing critical charts/graphs for market data
- Economic formulas from `docs/economics_and_governance.md` not visualized
- Market interfaces incomplete (Ad, Energy, Compute, Storage)
- No real-time order book depth rendering
- Missing liquidity heatmaps
- No trade history visualization

### What Needs to Exist

A production-grade blockchain operations dashboard with:

1. **Volume-weighted order book** (DEX-style depth chart)
2. **Market-specific dashboards** with proper data visualization
3. **Economic formula visualizations** (network issuance, multipliers, utilization)
4. **Real-time charts** for all markets
5. **Modern selection patterns** (no checkboxes - use modern card selection, multi-select with keyboard)
6. **Receipt audit interface** with drill-down
7. **Dispute management UI**
8. **Governance proposal builder**
9. **Treasury operations dashboard**
10. **Provider performance charts** (energy, compute, storage)

---

## Part 1: Order Book Transformation

### Current State (WRONG)

**File:** `web/src/components/Trading.js`

```javascript
// WRONG: Fake random data
generateOrderBookRows(side, count) {
  for (let i = 0; i < count; i++) {
    const amount = Math.floor(Math.random() * 500) + 100; // FAKE
    // ...
  }
}
```

### Required State (RIGHT)

**Backend Data Structure** (from `node/src/dex/order_book.rs`):

```rust
pub struct OrderBook {
    pub bids: BTreeMap<u64, VecDeque<Order>>, // price -> orders at that price
    pub asks: BTreeMap<u64, VecDeque<Order>>, // price -> orders at that price
    next_id: u64,
}

pub struct Order {
    pub id: u64,
    pub account: String,
    pub side: Side, // Buy or Sell
    pub amount: u64, // quantity
    pub price: u64,
    pub max_slippage_bps: u64,
}
```

**RPC Method to Add:**

```json
// dex.order_book request
{
  "pair": "BLOCK/USD",
  "depth": 20  // number of price levels
}

// dex.order_book response
{
  "bids": [
    {"price": 115000, "orders": [{"amount": 1000, "account": "addr1"}, ...]},
    {"price": 114900, "orders": [{"amount": 500, "account": "addr2"}, ...]}
  ],
  "asks": [
    {"price": 115100, "orders": [{"amount": 750, "account": "addr3"}, ...]},
    {"price": 115200, "orders": [{"amount": 1200, "account": "addr4"}, ...]}
  ],
  "spread": 100,
  "spread_bps": 87,
  "total_bid_volume": 45000,
  "total_ask_volume": 38000,
  "last_trade_price": 115050,
  "last_trade_time": 1707851700000
}
```

### Volume-Weighted Depth Chart Implementation

**File:** `web/src/components/OrderBookDepthChart.js` (NEW)

```javascript
/**
 * Volume-Weighted Order Book Depth Chart
 * 
 * Modern DEX-style visualization:
 * - Green filled area for bids (cumulative buy volume)
 * - Red filled area for asks (cumulative sell volume)
 * - Spread marker in the middle
 * - Hover shows exact price/volume
 * - Click to auto-fill order entry
 * 
 * Visual Pattern:
 *   Asks (Red)
 *        ╱
 *       ╱
 *      ╱
 *     ╱_____ Spread
 *    ╱
 *   ╱ Bids (Green)
 *  ╱
 * ╱
 * 
 * Y-axis: Price
 * X-axis: Cumulative Volume
 */

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class OrderBookDepthChart extends Component {
  constructor(orderBookData) {
    super('OrderBookDepthChart');
    this.data = orderBookData;
    this.canvas = null;
    this.ctx = null;
    this.hoveredPoint = null;
  }

  render() {
    const container = document.createElement('div');
    container.className = 'order-book-depth-chart';
    container.style.cssText = 'position: relative; height: 400px;';

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    canvas.style.cssText = 'width: 100%; height: 100%; cursor: crosshair;';
    container.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Event listeners for interactivity
    this.listen(canvas, 'mousemove', (e) => this.handleMouseMove(e));
    this.listen(canvas, 'click', (e) => this.handleClick(e));
    this.listen(canvas, 'mouseleave', () => this.handleMouseLeave());

    this.draw();
    return container;
  }

  draw() {
    const { ctx, canvas } = this;
    const { bids, asks } = this.data;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate cumulative volumes
    const bidDepth = this.calculateDepth(bids, 'bid');
    const askDepth = this.calculateDepth(asks, 'ask');

    // Get price range
    const minPrice = Math.min(bidDepth[0]?.price || 0, askDepth[0]?.price || 0);
    const maxPrice = Math.max(
      bidDepth[bidDepth.length - 1]?.price || 0,
      askDepth[askDepth.length - 1]?.price || 0
    );

    // Get max cumulative volume for X-axis scaling
    const maxVolume = Math.max(
      bidDepth[bidDepth.length - 1]?.cumulative || 0,
      askDepth[askDepth.length - 1]?.cumulative || 0
    );

    // Padding
    const padding = { top: 20, right: 60, bottom: 40, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    // Scale functions
    const scalePrice = (price) => {
      return (
        padding.top +
        chartHeight -
        ((price - minPrice) / (maxPrice - minPrice)) * chartHeight
      );
    };

    const scaleVolume = (volume) => {
      return padding.left + (volume / maxVolume) * chartWidth;
    };

    // Draw axes
    this.drawAxes(padding, chartWidth, chartHeight, minPrice, maxPrice, maxVolume);

    // Draw bid area (green)
    this.drawDepthArea(bidDepth, scalePrice, scaleVolume, '#22c55e', 0.2);

    // Draw ask area (red)
    this.drawDepthArea(askDepth, scalePrice, scaleVolume, '#ef4444', 0.2);

    // Draw spread line
    const spreadPrice = (bidDepth[bidDepth.length - 1]?.price + askDepth[0]?.price) / 2;
    const spreadY = scalePrice(spreadPrice);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, spreadY);
    ctx.lineTo(canvas.width - padding.right, spreadY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw spread label
    const spreadBps = this.data.spread_bps || 0;
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui';
    ctx.fillText(
      `Spread: ${(spreadBps / 100).toFixed(2)}%`,
      canvas.width - padding.right - 100,
      spreadY - 5
    );

    // Draw hover tooltip
    if (this.hoveredPoint) {
      this.drawTooltip(this.hoveredPoint);
    }
  }

  calculateDepth(orders, side) {
    const depth = [];
    let cumulative = 0;

    // Sort by price (ascending for bids, descending for asks)
    const sorted =
      side === 'bid'
        ? orders.slice().sort((a, b) => b.price - a.price)
        : orders.slice().sort((a, b) => a.price - b.price);

    sorted.forEach((level) => {
      const totalAtLevel = level.orders.reduce((sum, order) => sum + order.amount, 0);
      cumulative += totalAtLevel;
      depth.push({
        price: level.price,
        volume: totalAtLevel,
        cumulative,
        orders: level.orders.length,
      });
    });

    return depth;
  }

  drawDepthArea(depth, scalePrice, scaleVolume, color, alpha) {
    if (depth.length === 0) return;

    const { ctx } = this;

    // Fill area
    ctx.fillStyle = color + Math.floor(alpha * 255).toString(16);
    ctx.beginPath();
    ctx.moveTo(scaleVolume(0), scalePrice(depth[0].price));

    depth.forEach((point) => {
      ctx.lineTo(scaleVolume(point.cumulative), scalePrice(point.price));
    });

    ctx.lineTo(scaleVolume(depth[depth.length - 1].cumulative), scalePrice(depth[depth.length - 1].price));
    ctx.lineTo(scaleVolume(0), scalePrice(depth[depth.length - 1].price));
    ctx.closePath();
    ctx.fill();

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleVolume(0), scalePrice(depth[0].price));

    depth.forEach((point) => {
      ctx.lineTo(scaleVolume(point.cumulative), scalePrice(point.price));
    });

    ctx.stroke();
  }

  drawAxes(padding, chartWidth, chartHeight, minPrice, maxPrice, maxVolume) {
    const { ctx, canvas } = this;

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;

    // Y-axis (price)
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.stroke();

    // X-axis (volume)
    ctx.beginPath();
    ctx.moveTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();

    // Y-axis labels (price)
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    const priceSteps = 5;
    for (let i = 0; i <= priceSteps; i++) {
      const price = minPrice + ((maxPrice - minPrice) / priceSteps) * i;
      const y = padding.top + chartHeight - (i / priceSteps) * chartHeight;
      ctx.fillText(
        `$${(price / 100).toFixed(2)}`,
        padding.left - 10,
        y + 4
      );

      // Grid line
      ctx.strokeStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();
    }

    // X-axis labels (volume)
    ctx.textAlign = 'center';
    const volumeSteps = 4;
    for (let i = 0; i <= volumeSteps; i++) {
      const volume = (maxVolume / volumeSteps) * i;
      const x = padding.left + (i / volumeSteps) * chartWidth;
      ctx.fillText(
        this.formatVolume(volume),
        x,
        canvas.height - padding.bottom + 20
      );
    }

    // Axis labels
    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px system-ui';
    ctx.fillText('Price (USD)', 0, 0);
    ctx.restore();

    ctx.fillText(
      'Cumulative Volume (BLOCK)',
      canvas.width / 2,
      canvas.height - 10
    );
  }

  formatVolume(volume) {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;

    // Find nearest point
    this.hoveredPoint = this.findNearestPoint(x, y);
    this.draw();
  }

  findNearestPoint(x, y) {
    // TODO: Implement nearest point finding logic
    return null;
  }

  handleClick(e) {
    if (this.hoveredPoint) {
      // Emit event to auto-fill order entry with clicked price
      this.emit('price-selected', this.hoveredPoint.price);
    }
  }

  handleMouseLeave() {
    this.hoveredPoint = null;
    this.draw();
  }

  drawTooltip(point) {
    const { ctx } = this;
    const x = 20;
    const y = 20;
    const padding = 10;
    const text = [
      `Price: $${(point.price / 100).toFixed(2)}`,
      `Volume: ${this.formatVolume(point.volume)}`,
      `Cumulative: ${this.formatVolume(point.cumulative)}`,
      `Orders: ${point.orders}`,
    ];

    // Measure text
    ctx.font = '12px system-ui';
    const maxWidth = Math.max(...text.map((t) => ctx.measureText(t).width));
    const width = maxWidth + padding * 2;
    const height = text.length * 18 + padding * 2;

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(x, y, width, height);

    // Draw border
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // Draw text
    ctx.fillStyle = '#fff';
    text.forEach((line, i) => {
      ctx.fillText(line, x + padding, y + padding + 14 + i * 18);
    });
  }
}

export default OrderBookDepthChart;
```

**CSS Required:** `web/src/styles/charts.css` (NEW)

```css
.order-book-depth-chart {
  background: var(--surface-1);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
}

.order-book-depth-chart canvas {
  display: block;
}

/* Liquidity Heatmap */
.liquidity-heatmap {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8px, 1fr));
  gap: 2px;
  height: 40px;
  margin: var(--space-4) 0;
}

.liquidity-heatmap-bar {
  background: var(--accent);
  border-radius: 2px;
  transition: opacity 0.2s;
  cursor: pointer;
}

.liquidity-heatmap-bar:hover {
  opacity: 0.7;
}

/* Order Book List (companion to depth chart) */
.order-book-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: var(--text-xs);
}

.order-book-row {
  display: grid;
  grid-template-columns: 80px 100px 120px;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
  cursor: pointer;
  position: relative;
}

.order-book-row:hover {
  background: var(--bg-hover);
}

/* Volume bar background */
.order-book-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--volume-pct, 0%);
  background: var(--row-color, transparent);
  opacity: 0.1;
  z-index: 0;
  pointer-events: none;
}

.order-book-row > * {
  position: relative;
  z-index: 1;
}

.order-book-row.bid::before {
  --row-color: var(--success);
}

.order-book-row.ask::before {
  --row-color: var(--danger);
}

.order-book-price {
  font-weight: 600;
}

.order-book-price.bid {
  color: var(--success);
}

.order-book-price.ask {
  color: var(--danger);
}

.order-book-amount,
.order-book-total {
  color: var(--text-secondary);
}

.order-book-spread {
  text-align: center;
  padding: var(--space-3);
  background: var(--bg);
  border-radius: var(--radius-md);
  margin: var(--space-2) 0;
  font-weight: 600;
}

.order-book-spread-value {
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.order-book-spread-bps {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}
```

---

## Part 2: Modern Selection Patterns (NO CHECKBOXES)

### Problem: Checkboxes Are Outdated

**Current Bad Pattern:**

```html
<input type="checkbox" /> Select item
```

Checkboxes are:
- Visually cluttered
- Low information density
- Require precise clicking
- Poor touch targets
- Old-fashioned UI

### Solution: Modern Card-Based Multi-Select

**Pattern 1: Card Selection** (Best for 2-20 items)

```javascript
/**
 * Selectable Card Component
 * 
 * Visual states:
 * - Default: Subtle border, normal elevation
 * - Hover: Border brightens, slight lift
 * - Selected: Accent border, accent background tint, checkmark icon
 * - Focus: Focus ring (keyboard navigation)
 * 
 * Interaction:
 * - Click anywhere on card to toggle
 * - Cmd/Ctrl+Click for multi-select
 * - Shift+Click for range select
 * - Keyboard: Arrow keys + Space
 */

class SelectableCard extends Component {
  constructor(item, options = {}) {
    super('SelectableCard');
    this.item = item;
    this.selected = options.selected || false;
    this.multiSelect = options.multiSelect !== false;
    this.onSelect = options.onSelect || (() => {});
  }

  render() {
    const card = document.createElement('div');
    card.className = `selectable-card ${this.selected ? 'selected' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', this.selected);

    card.innerHTML = `
      <div class="selectable-card-indicator">
        ${this.selected ? '<svg viewBox="0 0 20 20" fill="currentColor" class="checkmark"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>' : ''}
      </div>
      <div class="selectable-card-content">
        ${this.renderContent()}
      </div>
    `;

    // Click handler
    this.listen(card, 'click', (e) => this.handleClick(e));
    this.listen(card, 'keydown', (e) => this.handleKeydown(e));

    return card;
  }

  renderContent() {
    // Override in subclass
    return `<p>${this.item.name}</p>`;
  }

  handleClick(e) {
    if (this.multiSelect && (e.ctrlKey || e.metaKey)) {
      // Multi-select mode
      this.selected = !this.selected;
    } else if (this.multiSelect && e.shiftKey) {
      // Range select mode (emit event for parent to handle)
      this.emit('range-select', this.item);
      return;
    } else {
      // Single select mode
      this.selected = !this.selected;
    }

    this.onSelect(this.item, this.selected);
    this.render();
  }

  handleKeydown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.handleClick(e);
    }
  }
}

export default SelectableCard;
```

**CSS:**

```css
/* Selectable Cards - Modern Pattern */
.selectable-card {
  position: relative;
  background: var(--surface-1);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.selectable-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.selectable-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.selectable-card.selected {
  border-color: var(--accent);
  background: linear-gradient(135deg, 
    rgba(26, 198, 162, 0.05),
    rgba(26, 198, 162, 0.1)
  );
  box-shadow: var(--shadow-sm), 0 0 0 1px var(--accent);
}

.selectable-card-indicator {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.selectable-card.selected .selectable-card-indicator {
  opacity: 1;
  transform: scale(1);
}

.selectable-card-indicator .checkmark {
  width: 16px;
  height: 16px;
}

.selectable-card-content {
  position: relative;
  z-index: 1;
}

/* Selection hint on hover (when not selected) */
.selectable-card:hover:not(.selected) .selectable-card-indicator {
  opacity: 0.3;
  transform: scale(1);
  background: var(--border-hover);
}
```

**Pattern 2: Row Selection with Visual Feedback** (Best for tables/lists)

```javascript
/**
 * Selectable Row for DataTable
 * 
 * NO CHECKBOX COLUMN - the entire row is the target
 * Visual feedback through background color and left border accent
 */

// In DataTable.js, update row rendering:
renderRow(row, index) {
  const tr = document.createElement('tr');
  tr.className = `data-table-row ${this.selectedRows.has(row.id) ? 'selected' : ''}`;
  tr.setAttribute('data-row-id', row.id);
  tr.setAttribute('role', 'row');
  tr.setAttribute('aria-selected', this.selectedRows.has(row.id));
  tr.setAttribute('tabindex', '0');

  // NO CHECKBOX CELL - just render data cells
  this.columns.forEach((col) => {
    const td = document.createElement('td');
    td.innerHTML = this.formatCell(row[col.key], col);
    tr.appendChild(td);
  });

  // Click handler - entire row is clickable
  this.listen(tr, 'click', (e) => this.handleRowClick(e, row));
  this.listen(tr, 'keydown', (e) => this.handleRowKeydown(e, row));

  return tr;
}

handleRowClick(e, row) {
  if (this.selectable) {
    if (e.ctrlKey || e.metaKey) {
      // Multi-select
      if (this.selectedRows.has(row.id)) {
        this.selectedRows.delete(row.id);
      } else {
        this.selectedRows.add(row.id);
      }
    } else if (e.shiftKey && this.lastSelectedIndex !== null) {
      // Range select
      this.handleRangeSelect(this.lastSelectedIndex, this.getRowIndex(row.id));
    } else {
      // Single select
      this.selectedRows.clear();
      this.selectedRows.add(row.id);
    }

    this.lastSelectedIndex = this.getRowIndex(row.id);
    this.render();
    this.emit('selection-change', Array.from(this.selectedRows));
  }
}
```

**CSS:**

```css
/* Selectable Rows - NO CHECKBOXES */
.data-table-row {
  border-left: 3px solid transparent;
  transition: all 0.15s;
  cursor: pointer;
}

.data-table-row:hover {
  background: var(--bg-hover);
}

.data-table-row.selected {
  background: rgba(26, 198, 162, 0.08);
  border-left-color: var(--accent);
}

.data-table-row.selected:hover {
  background: rgba(26, 198, 162, 0.12);
}

.data-table-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Selection indicator (optional - shows count) */
.selection-indicator {
  position: fixed;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: var(--space-3) var(--space-6);
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  z-index: 1000;
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.selection-indicator-count {
  font-weight: 600;
  color: var(--accent);
}

.selection-indicator-actions {
  display: flex;
  gap: var(--space-2);
}

@keyframes slideUp {
  from {
    transform: translateX(-50%) translateY(100px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}
```

**Pattern 3: Keyboard Shortcuts for Power Users**

```javascript
/**
 * Keyboard shortcuts for selection
 * 
 * Cmd/Ctrl+A: Select all
 * Escape: Clear selection
 * Cmd/Ctrl+I: Invert selection
 * Arrow keys: Navigate
 * Space: Toggle current item
 */

class SelectionManager {
  constructor(items, options = {}) {
    this.items = items;
    this.selectedIds = new Set();
    this.focusedIndex = 0;
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.bindKeyboardShortcuts();
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Select all: Cmd/Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        this.selectAll();
      }

      // Clear selection: Escape
      if (e.key === 'Escape') {
        this.clearSelection();
      }

      // Invert selection: Cmd/Ctrl+I
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        this.invertSelection();
      }

      // Navigation: Arrow keys
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.focusNext();
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.focusPrevious();
      }

      // Toggle: Space
      if (e.key === ' ') {
        e.preventDefault();
        this.toggleFocused();
      }
    });
  }

  selectAll() {
    this.selectedIds = new Set(this.items.map((item) => item.id));
    this.onSelectionChange(Array.from(this.selectedIds));
  }

  clearSelection() {
    this.selectedIds.clear();
    this.onSelectionChange([]);
  }

  invertSelection() {
    const allIds = new Set(this.items.map((item) => item.id));
    this.selectedIds = new Set(
      [...allIds].filter((id) => !this.selectedIds.has(id))
    );
    this.onSelectionChange(Array.from(this.selectedIds));
  }

  focusNext() {
    this.focusedIndex = Math.min(this.focusedIndex + 1, this.items.length - 1);
    this.scrollIntoView(this.focusedIndex);
  }

  focusPrevious() {
    this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
    this.scrollIntoView(this.focusedIndex);
  }

  toggleFocused() {
    const item = this.items[this.focusedIndex];
    if (this.selectedIds.has(item.id)) {
      this.selectedIds.delete(item.id);
    } else {
      this.selectedIds.add(item.id);
    }
    this.onSelectionChange(Array.from(this.selectedIds));
  }

  scrollIntoView(index) {
    const element = document.querySelector(`[data-index="${index}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export default SelectionManager;
```

---

## Part 3: Economic Formula Visualizations

### Network Issuance Formula

**From:** `docs/economics_and_governance.md`

```
reward = base × activity × decentralization × supply_decay

Where:
- base = (0.9 × MAX_SUPPLY_BLOCK) / expected_total_blocks
- activity = geometric_mean(tx_count_ratio, tx_volume_ratio, (1 + avg_market_utilization))
- decentralization = sqrt(unique_miners / baseline_miners)
- supply_decay = (MAX_SUPPLY_BLOCK - emission) / MAX_SUPPLY_BLOCK
```

**Visualization Component:** `web/src/components/EconomicsIssuanceChart.js` (NEW)

```javascript
/**
 * Network Issuance Formula Visualization
 * 
 * Shows live breakdown of the four factors:
 * 1. Base reward (constant)
 * 2. Activity multiplier (green = high, red = low)
 * 3. Decentralization factor (green = decentralized, red = centralized)
 * 4. Supply decay (gradually decreases)
 * 
 * Visual: Stacked multiplier bars with formula annotation
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { fmt } from '../utils.js';

class EconomicsIssuanceChart extends Component {
  constructor(rpc) {
    super('EconomicsIssuanceChart');
    this.rpc = rpc;
  }

  async onMount() {
    await this.fetchIssuanceData();
    this.render();

    this.subscribe(appState, 'issuanceData', () => {
      requestAnimationFrame(() => this.render());
    });
  }

  async fetchIssuanceData() {
    try {
      // TODO: Add proper RPC method
      const data = await this.rpc.call('economics.issuance_breakdown', {});
      appState.set('issuanceData', data);
    } catch (error) {
      console.error('[EconomicsIssuance] Failed to fetch:', error);
    }
  }

  render() {
    const data = appState.get('issuanceData') || this.getMockData();

    const container = document.createElement('div');
    container.className = 'economics-issuance-chart card';

    container.innerHTML = `
      <h3>Network Issuance Formula Breakdown</h3>
      <p class="muted small mb-6">Live calculation: reward = base × activity × decentralization × supply_decay</p>

      <!-- Formula Visual -->
      <div class="formula-visual">
        <div class="formula-component">
          <div class="formula-label">Base Reward</div>
          <div class="formula-value">${fmt.num(data.base_reward)} BLOCK</div>
          <div class="formula-bar" style="width: 100%; background: #6b7280;"></div>
        </div>

        <div class="formula-operator">×</div>

        <div class="formula-component">
          <div class="formula-label">Activity Multiplier</div>
          <div class="formula-value">${data.activity_multiplier.toFixed(3)}x</div>
          <div class="formula-bar" style="width: ${data.activity_multiplier * 50}%; background: ${this.getMultiplierColor(data.activity_multiplier)};"></div>
          <div class="formula-sublabel">
            Tx Count: ${data.activity_breakdown.tx_count_ratio.toFixed(2)} |
            Tx Volume: ${data.activity_breakdown.tx_volume_ratio.toFixed(2)} |
            Utilization: ${(data.activity_breakdown.avg_market_utilization * 100).toFixed(1)}%
          </div>
        </div>

        <div class="formula-operator">×</div>

        <div class="formula-component">
          <div class="formula-label">Decentralization Factor</div>
          <div class="formula-value">${data.decentralization_factor.toFixed(3)}x</div>
          <div class="formula-bar" style="width: ${data.decentralization_factor * 50}%; background: ${this.getMultiplierColor(data.decentralization_factor)};"></div>
          <div class="formula-sublabel">
            Unique Miners: ${data.unique_miners} (baseline: ${data.baseline_miners})
          </div>
        </div>

        <div class="formula-operator">×</div>

        <div class="formula-component">
          <div class="formula-label">Supply Decay</div>
          <div class="formula-value">${data.supply_decay.toFixed(3)}x</div>
          <div class="formula-bar" style="width: ${data.supply_decay * 100}%; background: #f59e0b;"></div>
          <div class="formula-sublabel">
            Remaining: ${fmt.num(data.remaining_supply)} / ${fmt.num(data.max_supply)} BLOCK
          </div>
        </div>

        <div class="formula-equals">=</div>

        <div class="formula-result">
          <div class="formula-label">Final Block Reward</div>
          <div class="formula-value-large">${fmt.num(data.final_reward)} BLOCK</div>
        </div>
      </div>

      <!-- Historical Chart -->
      <div class="mt-8">
        <h4>Reward History (Last 100 Blocks)</h4>
        <canvas id="issuance-history-chart" width="800" height="200"></canvas>
      </div>
    `;

    // Render historical chart
    requestAnimationFrame(() => this.renderHistoryChart(data.history));

    return container;
  }

  getMultiplierColor(value) {
    if (value >= 1.5) return '#22c55e'; // High activity - green
    if (value >= 1.0) return '#f59e0b'; // Normal - amber
    return '#ef4444'; // Low activity - red
  }

  renderHistoryChart(history) {
    const canvas = document.getElementById('issuance-history-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get range
    const values = history.map((h) => h.reward);
    const minValue = Math.min(...values) * 0.9;
    const maxValue = Math.max(...values) * 1.1;

    // Scale functions
    const scaleX = (index) => padding.left + (index / (history.length - 1)) * chartWidth;
    const scaleY = (value) =>
      padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();

    // Draw line
    ctx.strokeStyle = '#1ac6a2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((point, i) => {
      const x = scaleX(i);
      const y = scaleY(point.reward);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill area
    ctx.fillStyle = 'rgba(26, 198, 162, 0.1)';
    ctx.beginPath();
    ctx.moveTo(scaleX(0), canvas.height - padding.bottom);
    history.forEach((point, i) => {
      ctx.lineTo(scaleX(i), scaleY(point.reward));
    });
    ctx.lineTo(scaleX(history.length - 1), canvas.height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // Y-axis labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = minValue + ((maxValue - minValue) / 5) * i;
      const y = padding.top + chartHeight - (i / 5) * chartHeight;
      ctx.fillText(fmt.num(value), padding.left - 10, y + 4);
    }
  }

  getMockData() {
    return {
      base_reward: 12.5,
      activity_multiplier: 1.35,
      activity_breakdown: {
        tx_count_ratio: 1.2,
        tx_volume_ratio: 1.5,
        avg_market_utilization: 0.65,
      },
      decentralization_factor: 1.15,
      unique_miners: 23,
      baseline_miners: 20,
      supply_decay: 0.92,
      remaining_supply: 36800000,
      max_supply: 40000000,
      final_reward: 18.95,
      history: Array.from({ length: 100 }, (_, i) => ({
        block: 567890 - 99 + i,
        reward: 18.5 + Math.random() * 2 - 1,
      })),
    };
  }
}

export default EconomicsIssuanceChart;
```

**CSS:**

```css
.economics-issuance-chart {
  background: var(--surface-1);
  padding: var(--space-6);
}

.formula-visual {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6);
  background: var(--bg);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.formula-component {
  flex: 1;
  min-width: 180px;
}

.formula-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.formula-value {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.formula-bar {
  height: 8px;
  border-radius: var(--radius-full);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: var(--space-2);
}

.formula-sublabel {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.formula-operator {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.formula-equals {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--accent);
  flex-shrink: 0;
}

.formula-result {
  flex: 1;
  min-width: 200px;
  padding: var(--space-4);
  background: linear-gradient(135deg, rgba(26, 198, 162, 0.1), rgba(26, 198, 162, 0.2));
  border: 2px solid var(--accent);
  border-radius: var(--radius-lg);
}

.formula-value-large {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--accent);
}
```

---

## Part 4: Market-Specific Dashboards

### 4.1 Energy Market Dashboard

**Missing Visualizations:**

1. **Provider Performance Chart** - kWh delivered over time
2. **Dispute Timeline** - visual dispute lifecycle
3. **Settlement Flow Diagram** - credits → settlement → receipts
4. **Price Heatmap** - geographic price distribution
5. **Slashing Events Chart** - penalties over time

**File:** `web/src/components/EnergyMarketDashboard.js` (UPDATE)

Add sections:

```javascript
// Provider Performance Time-Series
renderProviderPerformance() {
  const section = document.createElement('section');
  section.className = 'card';
  section.innerHTML = `
    <h3>Provider Performance (kWh Delivered)</h3>
    <canvas id="energy-provider-chart" width="800" height="300"></canvas>
  `;
  return section;
}

// Dispute Timeline
renderDisputeTimeline() {
  const section = document.createElement('section');
  section.className = 'card';
  section.innerHTML = `
    <h3>Dispute Timeline</h3>
    <div id="dispute-timeline"></div>
  `;
  // Render horizontal timeline with dispute stages:
  // Filed → Evidence → Review → Resolution → Settled/Slashed
  return section;
}

// Settlement Flow
renderSettlementFlow() {
  const section = document.createElement('section');
  section.className = 'card';
  section.innerHTML = `
    <h3>Settlement Flow</h3>
    <div class="flow-diagram">
      <div class="flow-step">
        <div class="flow-icon">📊</div>
        <div class="flow-label">Meter Reading</div>
        <div class="flow-value">${fmt.num(data.pending_readings)}</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="flow-icon">🔒</div>
        <div class="flow-label">Energy Credits</div>
        <div class="flow-value">${fmt.num(data.active_credits)}</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="flow-icon">⚖️</div>
        <div class="flow-label">Settlement</div>
        <div class="flow-value">${fmt.num(data.settlements_today)}</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="flow-icon">📃</div>
        <div class="flow-label">Receipts</div>
        <div class="flow-value">${fmt.num(data.total_receipts)}</div>
      </div>
    </div>
  `;
  return section;
}
```

### 4.2 Ad Market Dashboard

**Missing Visualizations:**

1. **Quality-Adjusted Pricing Formula** breakdown (see economics docs)
2. **Cohort Freshness Histogram** (under_1h, 1-6h, 6-24h, >24h)
3. **Privacy Budget Gauge** (remaining vs denied)
4. **ROI Funnel Chart** (impressions → clicks → conversions)
5. **Domain Tier Distribution**

**Quality Formula Visualization:**

```
F = (w1 × under_1h_ppm + w2 × hours_1_to_6_ppm + w3 × hours_6_to_24_ppm + w4 × over_24h_ppm) / 1,000,000
R = clamp(ready_streak_windows / readiness_target_windows, 0.10, 1.0)
P = clamp(min(privacy_remaining_ppm, 1,000,000 - privacy_denied_ppm) / 1,000,000, 0.10, 1.0)
Q_cohort = clamp((F × P × R)^(1/3), 0.10, 2.50)
effective_bid = base_bid × Q_creative × Q_cohort
```

**Component:** `web/src/components/AdQualityBreakdown.js` (NEW)

```javascript
/**
 * Ad Quality Formula Breakdown
 * Shows live calculation of effective bid
 */

class AdQualityBreakdown extends Component {
  render() {
    const data = this.props.data;

    // Calculate components
    const F = this.calculateFreshness(data.freshness_histogram);
    const R = this.calculateReadiness(data.ready_streak_windows, data.readiness_target);
    const P = this.calculatePrivacy(data.privacy_remaining_ppm, data.privacy_denied_ppm);
    const Q_cohort = Math.pow(F * P * R, 1/3);
    const effective_bid = data.base_bid * data.creative_quality * Q_cohort;

    return `
      <div class="ad-quality-breakdown card">
        <h3>Quality-Adjusted Pricing</h3>

        <!-- Formula Components -->
        <div class="quality-components">
          <div class="quality-component">
            <div class="quality-label">Freshness (F)</div>
            <div class="quality-gauge">
              <div class="quality-gauge-fill" style="width: ${F * 100}%; background: ${this.getFreshnessColor(F)};"></div>
            </div>
            <div class="quality-value">${F.toFixed(3)}</div>
            <div class="quality-breakdown">
              <div class="quality-breakdown-item">
                <span>&lt;1h:</span>
                <span>${(data.freshness_histogram.under_1h_ppm / 10000).toFixed(2)}%</span>
              </div>
              <div class="quality-breakdown-item">
                <span>1-6h:</span>
                <span>${(data.freshness_histogram['1h_to_6h_ppm'] / 10000).toFixed(2)}%</span>
              </div>
              <div class="quality-breakdown-item">
                <span>6-24h:</span>
                <span>${(data.freshness_histogram['6h_to_24h_ppm'] / 10000).toFixed(2)}%</span>
              </div>
              <div class="quality-breakdown-item">
                <span>&gt;24h:</span>
                <span>${(data.freshness_histogram.over_24h_ppm / 10000).toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div class="quality-component">
            <div class="quality-label">Readiness (R)</div>
            <div class="quality-gauge">
              <div class="quality-gauge-fill" style="width: ${R * 100}%; background: ${this.getReadinessColor(R)};"></div>
            </div>
            <div class="quality-value">${R.toFixed(3)}</div>
            <div class="quality-breakdown">
              <span>${data.ready_streak_windows} / ${data.readiness_target} windows</span>
            </div>
          </div>

          <div class="quality-component">
            <div class="quality-label">Privacy (P)</div>
            <div class="quality-gauge">
              <div class="quality-gauge-fill" style="width: ${P * 100}%; background: ${this.getPrivacyColor(P)};"></div>
            </div>
            <div class="quality-value">${P.toFixed(3)}</div>
            <div class="quality-breakdown">
              <div class="quality-breakdown-item">
                <span>Remaining:</span>
                <span>${(data.privacy_remaining_ppm / 10000).toFixed(2)}%</span>
              </div>
              <div class="quality-breakdown-item">
                <span>Denied:</span>
                <span>${(data.privacy_denied_ppm / 10000).toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Final Calculation -->
        <div class="quality-calculation">
          <div class="quality-calc-step">
            <span class="quality-calc-label">Base Bid:</span>
            <span class="quality-calc-value">${fmt.currency(data.base_bid)} USD</span>
          </div>
          <div class="quality-calc-operator">×</div>
          <div class="quality-calc-step">
            <span class="quality-calc-label">Creative Quality:</span>
            <span class="quality-calc-value">${data.creative_quality.toFixed(2)}x</span>
          </div>
          <div class="quality-calc-operator">×</div>
          <div class="quality-calc-step">
            <span class="quality-calc-label">Cohort Quality:</span>
            <span class="quality-calc-value">${Q_cohort.toFixed(2)}x</span>
            <span class="quality-calc-formula">(F × P × R)^(1/3)</span>
          </div>
          <div class="quality-calc-operator">=</div>
          <div class="quality-calc-result">
            <span class="quality-calc-label">Effective Bid:</span>
            <span class="quality-calc-value-large">${fmt.currency(effective_bid)} USD</span>
          </div>
        </div>
      </div>
    `;
  }

  calculateFreshness(histogram) {
    const w1 = 1000000;
    const w2 = 800000;
    const w3 = 500000;
    const w4 = 200000;
    return (
      (w1 * histogram.under_1h_ppm +
        w2 * histogram['1h_to_6h_ppm'] +
        w3 * histogram['6h_to_24h_ppm'] +
        w4 * histogram.over_24h_ppm) /
      1000000
    );
  }

  calculateReadiness(ready, target) {
    return Math.max(0.10, Math.min(1.0, ready / target));
  }

  calculatePrivacy(remaining, denied) {
    return Math.max(
      0.10,
      Math.min(1.0, Math.min(remaining, 1000000 - denied) / 1000000)
    );
  }

  getFreshnessColor(value) {
    if (value > 0.8) return '#22c55e';
    if (value > 0.5) return '#f59e0b';
    return '#ef4444';
  }

  getReadinessColor(value) {
    if (value > 0.8) return '#22c55e';
    if (value > 0.5) return '#f59e0b';
    return '#ef4444';
  }

  getPrivacyColor(value) {
    if (value > 0.8) return '#22c55e';
    if (value > 0.5) return '#f59e0b';
    return '#ef4444';
  }
}

export default AdQualityBreakdown;
```

### 4.3 Compute Market Dashboard

**Missing Visualizations:**

1. **Job Queue Visualization** - pending/running/completed
2. **SLA Compliance Chart** - on-time vs late
3. **Provider Capacity Map** - geographic distribution
4. **Compute Unit Price Time-Series**
5. **Receipt Audit Trail** - job → receipt → settlement

### 4.4 Storage Market Dashboard

**Missing Visualizations:**

1. **Storage Utilization Chart** - used vs available
2. **Rent Price Heatmap** - price per byte over time
3. **File Lifecycle Timeline** - upload → pin → rent → expiry
4. **Provider Reliability Score** - uptime, response time
5. **Replication Factor Distribution**

---

## Part 5: Receipt Audit Interface

**Backend:** `receipt.audit` RPC returns canonical receipt chain with subsidies/disputes

**Required UI:**

1. **Receipt Timeline** - chronological view with filters
2. **Receipt Detail Modal** - full breakdown with subsidy buckets
3. **Dispute Correlation** - link receipts to disputes
4. **Subsidy Breakdown Chart** - storage/read/compute/ad/rebate
5. **Provider Drill-Down** - filter by provider ID

**Component:** `web/src/components/ReceiptAuditInterface.js` (NEW)

```javascript
/**
 * Receipt Audit Interface
 * 
 * Features:
 * - Timeline view (block height chronological)
 * - Advanced filters (market, provider, height range)
 * - Subsidy breakdown visualization
 * - Dispute linking
 * - Export to CSV
 * - Pagination (limit 128, max 512)
 */

class ReceiptAuditInterface extends Component {
  constructor(rpc) {
    super('ReceiptAuditInterface');
    this.rpc = rpc;
    this.filters = {
      start_height: null,
      end_height: null,
      provider_id: '',
      market: '', // 'storage', 'compute', 'energy', 'ad', 'relay'
      limit: 128,
    };
    this.receipts = [];
    this.nextStartHeight = null;
    this.truncated = false;
  }

  async onMount() {
    this.render();
    await this.fetchReceipts();
  }

  async fetchReceipts() {
    try {
      const response = await this.rpc.call('receipt.audit', this.filters);
      
      this.receipts = response.receipts || [];
      this.nextStartHeight = response.next_start_height;
      this.truncated = response.truncated;

      this.renderReceipts();
    } catch (error) {
      console.error('[ReceiptAudit] Failed to fetch:', error);
    }
  }

  render() {
    const container = document.createElement('div');
    container.className = 'receipt-audit-interface';

    container.innerHTML = `
      <div class="page-header">
        <div class="hero">
          <h2>Receipt Audit Trail</h2>
          <p>Canonical receipt chain with subsidies and disputes</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="card receipt-filters">
        <div class="filter-grid">
          <div class="control">
            <label>Start Height</label>
            <input type="number" id="filter-start-height" placeholder="e.g. 100000" />
          </div>
          <div class="control">
            <label>End Height</label>
            <input type="number" id="filter-end-height" placeholder="e.g. 200000" />
          </div>
          <div class="control">
            <label>Provider ID</label>
            <input type="text" id="filter-provider-id" placeholder="e.g. energy-0x01" />
          </div>
          <div class="control">
            <label>Market</label>
            <select id="filter-market">
              <option value="">All Markets</option>
              <option value="storage">Storage</option>
              <option value="compute">Compute</option>
              <option value="energy">Energy</option>
              <option value="ad">Ad</option>
              <option value="relay">Relay</option>
            </select>
          </div>
          <div class="control">
            <label>Limit</label>
            <input type="number" id="filter-limit" value="128" min="1" max="512" />
          </div>
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" id="apply-filters">Apply Filters</button>
          <button class="btn btn-ghost" id="reset-filters">Reset</button>
          <button class="btn btn-ghost" id="export-csv">Export CSV</button>
        </div>
      </div>

      <!-- Receipt Timeline -->
      <div class="card">
        <div class="row space-between align-center mb-4">
          <h3>Receipt Timeline</h3>
          <div class="receipt-count">
            <span class="muted small">Showing ${this.receipts.length} receipts</span>
            ${this.truncated ? '<span class="pill warn ml-2">Truncated</span>' : ''}
          </div>
        </div>
        <div id="receipt-timeline"></div>
      </div>

      <!-- Pagination -->
      ${this.truncated ? `
        <div class="pagination-notice">
          <p class="muted">More receipts available. <a href="#" id="load-more">Load next page</a> (starting at height ${this.nextStartHeight})</p>
        </div>
      ` : ''}
    `;

    // Attach event listeners
    const applyBtn = container.querySelector('#apply-filters');
    this.listen(applyBtn, 'click', () => this.applyFilters());

    const resetBtn = container.querySelector('#reset-filters');
    this.listen(resetBtn, 'click', () => this.resetFilters());

    const exportBtn = container.querySelector('#export-csv');
    this.listen(exportBtn, 'click', () => this.exportCSV());

    if (this.truncated) {
      const loadMoreBtn = container.querySelector('#load-more');
      this.listen(loadMoreBtn, 'click', (e) => {
        e.preventDefault();
        this.loadNextPage();
      });
    }

    return container;
  }

  renderReceipts() {
    const timeline = document.getElementById('receipt-timeline');
    if (!timeline) return;

    timeline.innerHTML = '';

    if (this.receipts.length === 0) {
      timeline.innerHTML = '<div class="empty-state"><p class="muted">No receipts found for the selected filters.</p></div>';
      return;
    }

    // Group by block height
    const groupedByBlock = {};
    this.receipts.forEach((receipt) => {
      if (!groupedByBlock[receipt.block_height]) {
        groupedByBlock[receipt.block_height] = [];
      }
      groupedByBlock[receipt.block_height].push(receipt);
    });

    // Render blocks
    Object.keys(groupedByBlock)
      .sort((a, b) => b - a) // Descending
      .forEach((height) => {
        const blockGroup = document.createElement('div');
        blockGroup.className = 'receipt-block-group';

        const blockHeader = document.createElement('div');
        blockHeader.className = 'receipt-block-header';
        blockHeader.innerHTML = `
          <span class="receipt-block-height">Block ${fmt.num(height)}</span>
          <span class="receipt-block-count muted small">${groupedByBlock[height].length} receipts</span>
        `;
        blockGroup.appendChild(blockHeader);

        const receiptsContainer = document.createElement('div');
        receiptsContainer.className = 'receipt-list';

        groupedByBlock[height].forEach((receipt) => {
          receiptsContainer.appendChild(this.renderReceiptCard(receipt));
        });

        blockGroup.appendChild(receiptsContainer);
        timeline.appendChild(blockGroup);
      });
  }

  renderReceiptCard(receipt) {
    const card = document.createElement('div');
    card.className = `receipt-card receipt-type-${receipt.receipt_type}`;

    // Calculate total subsidies
    const totalSubsidies = Object.values(receipt.subsidies || {}).reduce(
      (sum, val) => sum + val,
      0
    );

    card.innerHTML = `
      <div class="receipt-card-header">
        <div>
          <span class="receipt-type-badge">${receipt.receipt_type}</span>
          <span class="receipt-market-badge">${receipt.market || 'unknown'}</span>
        </div>
        <div>
          <span class="receipt-digest muted small">${receipt.digest_hex.substring(0, 12)}...</span>
        </div>
      </div>

      <div class="receipt-card-body">
        <div class="receipt-info-grid">
          <div class="receipt-info-item">
            <span class="receipt-info-label">Amount</span>
            <span class="receipt-info-value">${fmt.num(receipt.amount)} BLOCK</span>
          </div>
          <div class="receipt-info-item">
            <span class="receipt-info-label">Provider</span>
            <span class="receipt-info-value">${receipt.audit_fields?.provider_identity || 'N/A'}</span>
          </div>
          <div class="receipt-info-item">
            <span class="receipt-info-label">Subsidies</span>
            <span class="receipt-info-value">${fmt.num(totalSubsidies)} BLOCK</span>
          </div>
          <div class="receipt-info-item">
            <span class="receipt-info-label">Disputes</span>
            <span class="receipt-info-value">
              ${receipt.disputes?.length || 0}
              ${receipt.disputes?.length > 0 ? `<span class="pill warn">Active</span>` : ''}
            </span>
          </div>
        </div>

        <!-- Subsidy Breakdown -->
        ${totalSubsidies > 0 ? `
          <div class="subsidy-breakdown">
            <div class="subsidy-breakdown-label">Subsidy Breakdown:</div>
            <div class="subsidy-breakdown-bars">
              ${Object.entries(receipt.subsidies || {})
                .filter(([_, val]) => val > 0)
                .map(
                  ([key, val]) => `
                  <div class="subsidy-bar" style="--subsidy-pct: ${(val / totalSubsidies) * 100}%;">
                    <span class="subsidy-label">${key}</span>
                    <span class="subsidy-value">${fmt.num(val)}</span>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        ` : ''}

        <!-- Dispute Info -->
        ${receipt.disputes?.length > 0 ? `
          <div class="dispute-info">
            <div class="dispute-info-label">Disputes:</div>
            ${receipt.disputes
              .map(
                (d) => `
              <div class="dispute-item">
                <span class="dispute-id">#${d.dispute_id}</span>
                <span class="dispute-status pill ${d.status}">${d.status}</span>
                <span class="dispute-reason muted small">${d.reason}</span>
              </div>
            `
              )
              .join('')}
          </div>
        ` : ''}
      </div>

      <div class="receipt-card-footer">
        <button class="btn-link" data-action="view-details" data-receipt-id="${receipt.digest_hex}">
          View Full Details
        </button>
      </div>
    `;

    const detailsBtn = card.querySelector('[data-action="view-details"]');
    this.listen(detailsBtn, 'click', () => this.showReceiptModal(receipt));

    return card;
  }

  showReceiptModal(receipt) {
    // Open modal with full receipt details
    const modal = new Modal({
      title: `Receipt Details - ${receipt.receipt_type}`,
      size: 'large',
      content: `
        <div class="receipt-detail-modal">
          <div class="receipt-detail-section">
            <h4>Basic Info</h4>
            <div class="info-grid">
              <div><strong>Block Height:</strong> ${receipt.block_height}</div>
              <div><strong>Receipt Index:</strong> ${receipt.receipt_index}</div>
              <div><strong>Type:</strong> ${receipt.receipt_type}</div>
              <div><strong>Digest:</strong> <code>${receipt.digest_hex}</code></div>
              <div><strong>Amount:</strong> ${fmt.num(receipt.amount)} BLOCK</div>
            </div>
          </div>

          <div class="receipt-detail-section">
            <h4>Audit Fields</h4>
            <pre><code>${JSON.stringify(receipt.audit_fields, null, 2)}</code></pre>
          </div>

          <div class="receipt-detail-section">
            <h4>Subsidies</h4>
            <pre><code>${JSON.stringify(receipt.subsidies, null, 2)}</code></pre>
          </div>

          ${receipt.disputes?.length > 0 ? `
            <div class="receipt-detail-section">
              <h4>Disputes</h4>
              <pre><code>${JSON.stringify(receipt.disputes, null, 2)}</code></pre>
            </div>
          ` : ''}

          <div class="receipt-detail-section">
            <h4>Raw Receipt</h4>
            <pre><code>${JSON.stringify(receipt.receipt, null, 2)}</code></pre>
          </div>
        </div>
      `,
    });
    modal.open();
  }

  applyFilters() {
    this.filters.start_height = document.getElementById('filter-start-height').value || null;
    this.filters.end_height = document.getElementById('filter-end-height').value || null;
    this.filters.provider_id = document.getElementById('filter-provider-id').value || '';
    this.filters.market = document.getElementById('filter-market').value || '';
    this.filters.limit = parseInt(document.getElementById('filter-limit').value) || 128;

    this.fetchReceipts();
  }

  resetFilters() {
    this.filters = {
      start_height: null,
      end_height: null,
      provider_id: '',
      market: '',
      limit: 128,
    };

    document.getElementById('filter-start-height').value = '';
    document.getElementById('filter-end-height').value = '';
    document.getElementById('filter-provider-id').value = '';
    document.getElementById('filter-market').value = '';
    document.getElementById('filter-limit').value = '128';

    this.fetchReceipts();
  }

  loadNextPage() {
    if (this.nextStartHeight) {
      this.filters.start_height = this.nextStartHeight;
      this.fetchReceipts();
    }
  }

  exportCSV() {
    // Generate CSV from receipts
    const headers = [
      'Block Height',
      'Receipt Index',
      'Type',
      'Market',
      'Amount',
      'Provider',
      'Digest',
      'Total Subsidies',
      'Disputes',
    ];

    const rows = this.receipts.map((r) => [
      r.block_height,
      r.receipt_index,
      r.receipt_type,
      r.market || '',
      r.amount,
      r.audit_fields?.provider_identity || '',
      r.digest_hex,
      Object.values(r.subsidies || {}).reduce((sum, val) => sum + val, 0),
      r.disputes?.length || 0,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts_${Date.now()}.csv`;
    a.click();
  }
}

export default ReceiptAuditInterface;
```

---

## Part 6: Chart Library Requirements

**All charts must be:**

1. **Zero third-party dependencies** (canvas-based, no Chart.js/D3)
2. **Interactive** (hover, zoom, pan, click to drill-down)
3. **Responsive** (adapt to container size)
4. **Accessible** (ARIA labels, keyboard navigation)
5. **Performance** (requestAnimationFrame, canvas containment)
6. **Exportable** (PNG/SVG/CSV)

**Chart Types Needed:**

1. ✅ Line chart (time-series)
2. ✅ Area chart (cumulative volume)
3. ✅ Bar chart (comparisons)
4. ✅ Depth chart (order book)
5. ⚠️ Heatmap (liquidity, price distribution)
6. ⚠️ Sankey diagram (flow visualization)
7. ⚠️ Funnel chart (conversion funnels)
8. ⚠️ Gauge chart (single metric with threshold)
9. ⚠️ Scatter plot (correlation analysis)
10. ⚠️ Candlestick chart (OHLC price data)

**Base Chart Class:** `web/src/charts/BaseChart.js` (NEW)

```javascript
/**
 * Base Chart Class
 * 
 * Provides common functionality:
 * - Canvas setup and resize handling
 * - Axis rendering
 * - Grid rendering
 * - Legend rendering
 * - Tooltip rendering
 * - Interaction handling (hover, click, zoom, pan)
 * - Export functionality
 */

class BaseChart {
  constructor(canvas, data, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.options = {
      padding: { top: 40, right: 40, bottom: 60, left: 60 },
      responsive: true,
      maintainAspectRatio: false,
      animation: true,
      animationDuration: 300,
      showGrid: true,
      showAxes: true,
      showLegend: true,
      showTooltip: true,
      interactive: true,
      ...options,
    };

    this.chartWidth = 0;
    this.chartHeight = 0;
    this.hoveredPoint = null;
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.resize();

    if (this.options.responsive) {
      const resizeObserver = new ResizeObserver(() => this.resize());
      resizeObserver.observe(this.canvas.parentElement);
    }

    if (this.options.interactive) {
      this.bindEvents();
    }

    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const rect = parent.getBoundingClientRect();

    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    this.chartWidth = rect.width - this.options.padding.left - this.options.padding.right;
    this.chartHeight = rect.height - this.options.padding.top - this.options.padding.bottom;

    if (this.data) {
      this.draw();
    }
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.hoveredPoint = this.findNearestPoint(x, y);
    this.draw();
  }

  handleClick(e) {
    if (this.hoveredPoint) {
      this.emit('point-click', this.hoveredPoint);
    }
  }

  handleWheel(e) {
    if (!this.options.zoomable) return;

    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.max(0.5, Math.min(5, this.zoom * delta));
    this.draw();
  }

  handleMouseLeave() {
    this.hoveredPoint = null;
    this.draw();
  }

  draw() {
    // Override in subclass
  }

  drawAxes() {
    // Common axis rendering logic
  }

  drawGrid() {
    // Common grid rendering logic
  }

  drawLegend() {
    // Common legend rendering logic
  }

  drawTooltip() {
    // Common tooltip rendering logic
  }

  findNearestPoint(x, y) {
    // Override in subclass
    return null;
  }

  export(format = 'png') {
    if (format === 'png') {
      return this.canvas.toDataURL('image/png');
    } else if (format === 'csv') {
      return this.exportCSV();
    }
  }

  exportCSV() {
    // Convert data to CSV
    return '';
  }

  emit(event, data) {
    const customEvent = new CustomEvent(event, { detail: data });
    this.canvas.dispatchEvent(customEvent);
  }
}

export default BaseChart;
```

---

## Part 7: Immediate Action Items

### Priority 1: Critical UX Fixes (DO THIS FIRST)

1. **Replace checkbox selections** with modern card/row selection patterns
2. **Implement real order book** using `dex.order_book` RPC
3. **Add volume-weighted depth chart** component
4. **Wire up economic formula visualizations** (network issuance, ad quality)
5. **Create receipt audit interface** with filters and drill-down

### Priority 2: Market Dashboards

1. **Energy Market:**
   - Provider performance chart
   - Dispute timeline
   - Settlement flow diagram

2. **Ad Market:**
   - Quality formula breakdown
   - Cohort freshness histogram
   - Privacy budget gauge
   - ROI funnel chart

3. **Compute Market:**
   - Job queue visualization
   - SLA compliance chart
   - Provider capacity map

4. **Storage Market:**
   - Utilization chart
   - Rent price heatmap
   - File lifecycle timeline

### Priority 3: Charts & Visualization

1. Create `BaseChart` class
2. Implement specific chart types (heatmap, sankey, funnel, gauge)
3. Add export functionality (PNG/SVG/CSV)
4. Add zoom/pan interactions
5. Add animation for data updates

### Priority 4: Testing

1. Visual regression tests for all charts
2. Interaction tests (click, hover, keyboard)
3. Performance benchmarks (60fps rendering)
4. Accessibility audit (ARIA, keyboard navigation)

---

## Part 8: Development Workflow

### For Each Component:

1. **Read blockchain docs** to understand data structures
2. **Identify RPC methods** needed
3. **Design visualization** (sketch on paper first)
4. **Implement component** with proper lifecycle
5. **Add real-time updates** via WebSocket or polling
6. **Add interactivity** (hover, click, drill-down)
7. **Add keyboard shortcuts** for power users
8. **Test performance** (ensure 60fps)
9. **Document** in component header
10. **Add to router** and navigation

### Design Checklist:

- [ ] No checkboxes (use modern selection patterns)
- [ ] Real data (no random/mock data)
- [ ] Interactive (hover states, click handlers)
- [ ] Keyboard accessible (tab, arrows, space, enter)
- [ ] Responsive (mobile, tablet, desktop)
- [ ] Performance (60fps, requestAnimationFrame)
- [ ] Loading states (skeletons, spinners)
- [ ] Empty states (meaningful messages)
- [ ] Error states (retry buttons)
- [ ] Export functionality (CSV, PNG)
- [ ] Help tooltips (question mark icons)
- [ ] Keyboard shortcuts (Cmd+K for search, etc.)

---

## Summary

This audit has identified **critical gaps** between the frontend and the actual blockchain capabilities:

1. **Order book is fake** - needs real `dex.order_book` RPC integration
2. **No volume-weighted depth charts** - essential for DEX UX
3. **Checkboxes everywhere** - outdated, needs modern selection patterns
4. **Missing economic visualizations** - formulas from docs not shown
5. **Market dashboards incomplete** - no provider charts, dispute timelines, etc.
6. **No receipt audit interface** - critical for transparency
7. **Charts are primitive** - need professional interactive charts

**Next Steps:**

1. Implement `OrderBookDepthChart` with real data
2. Replace all checkboxes with `SelectableCard` / row selection
3. Add `EconomicsIssuanceChart` with formula breakdown
4. Build `ReceiptAuditInterface` with filters
5. Enhance market dashboards with missing visualizations
6. Create reusable `BaseChart` class
7. Add keyboard shortcuts for power users

**End Goal:**

A production-grade blockchain operations dashboard where every visualization accurately represents the underlying blockchain data structures, economic formulas, and market mechanics - with modern, intuitive UX patterns that match or exceed leading DEX and blockchain explorer interfaces.


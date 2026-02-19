// Trading component with order management
// Uses observable state and event-driven updates
// Refactored with professional trading UI layout

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';

class Trading extends Component {
  constructor(rpc) {
    super('Trading');
    this.rpc = rpc;
    this.container = null;
    this.currentPrice = 1.15;
  }

  onMount() {
    this.container = $('#app');
    this.render();

    // Subscribe to orders updates
    this.subscribe(appState, 'orders', () => {
      requestAnimationFrame(() => this.updateOrdersList());
    });

    // Simulate price updates
    this.interval(() => this.updatePriceTicker(), 1000);
  }

  render() {
    if (!this.container) return;

    perf.mark('render-trading-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Hero section
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
      <h2>Trading Sandbox</h2>
      <p>Paper trades with locally simulated prices. Professional trading interface with order book and entry panel.</p>
    `;
    content.appendChild(hero);

    // TRADING LAYOUT (3-column: Price Ticker | Order Book | Order Entry)
    const tradingLayout = document.createElement('div');
    tradingLayout.className = 'layout-trading';

    // Column 1: Price Ticker
    tradingLayout.appendChild(this.createPriceTicker());

    // Column 2: Order Book
    tradingLayout.appendChild(this.createOrderBook());

    // Column 3: Order Entry Panel
    tradingLayout.appendChild(this.createOrderEntryPanel());

    content.appendChild(tradingLayout);

    // Order History (full width below)
    const orderHistory = document.createElement('div');
    orderHistory.className = 'card';
    orderHistory.innerHTML = '<h3>Order History</h3>';
    orderHistory.id = 'order-history-card';
    content.appendChild(orderHistory);

    this.container.innerHTML = '';
    this.container.appendChild(content);

    // Initial orders render
    requestAnimationFrame(() => this.updateOrdersList());

    perf.measure('render-trading', 'render-trading-start', 'render');
  }

  createPriceTicker() {
    const ticker = document.createElement('div');
    ticker.className = 'card';
    ticker.innerHTML = `
      <h3>BLOCK/USD</h3>
      <div style="margin-top: var(--space-6);">
        <div id="current-price" style="font-size: var(--text-4xl); font-weight: 700; color: var(--accent); margin-bottom: var(--space-2);">
          ${fmt.currency(this.currentPrice)}
        </div>
        <div id="price-change" class="muted small">+0.00%</div>
      </div>
      
      <div style="margin-top: var(--space-8);">
        <div class="row space-between mb-2">
          <span class="muted small">24h High</span>
          <span id="high-24h" class="small">—</span>
        </div>
        <div class="row space-between mb-2">
          <span class="muted small">24h Low</span>
          <span id="low-24h" class="small">—</span>
        </div>
        <div class="row space-between mb-2">
          <span class="muted small">24h Volume</span>
          <span id="volume-24h" class="small">—</span>
        </div>
        <div class="row space-between">
          <span class="muted small">Market Cap</span>
          <span id="market-cap" class="small">—</span>
        </div>
      </div>
    `;
    return ticker;
  }

  createOrderBook() {
    const orderBook = document.createElement('div');
    orderBook.className = 'card';
    orderBook.innerHTML = `
      <h3>Order Book</h3>
      <p class="muted small mb-4">Live buy and sell orders</p>
      
      <div id="order-book-content">
        <!-- Sell orders (asks) - red -->
        <div class="mb-4">
          <div class="row space-between muted xs mb-2">
            <span>Price (USD)</span>
            <span>Amount</span>
            <span>Total</span>
          </div>
          <div id="sell-orders">
            ${this.generateOrderBookRows('sell', 5)}
          </div>
        </div>
        
        <!-- Current price marker -->
        <div style="text-align: center; padding: var(--space-4); background: var(--bg); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
          <div id="book-current-price" style="font-size: var(--text-xl); font-weight: 700; color: var(--accent);">
            ${fmt.currency(this.currentPrice)}
          </div>
          <div class="muted xs">Current Price</div>
        </div>
        
        <!-- Buy orders (bids) - green -->
        <div>
          <div id="buy-orders">
            ${this.generateOrderBookRows('buy', 5)}
          </div>
        </div>
      </div>
    `;
    return orderBook;
  }

  generateOrderBookRows(side, count) {
    let rows = '';
    const basePrice = this.currentPrice;
    
    for (let i = 0; i < count; i++) {
      const offset = side === 'sell' ? (i + 1) * 0.01 : -(i + 1) * 0.01;
      const price = basePrice + offset;
      const amount = Math.floor(Math.random() * 500) + 100;
      const total = price * amount;
      const color = side === 'sell' ? 'var(--danger)' : 'var(--success)';
      
      rows += `
        <div class="row space-between" style="padding: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-xs);">
          <span style="color: ${color};">${fmt.currency(price)}</span>
          <span>${fmt.num(amount)}</span>
          <span>${fmt.currency(total)}</span>
        </div>
      `;
    }
    
    return rows;
  }

  createOrderEntryPanel() {
    const panel = document.createElement('div');
    panel.className = 'card';
    panel.innerHTML = `
      <h3>Place Order</h3>
      <p class="muted small mb-4">Simulated order entry</p>
      
      <!-- Order type tabs -->
      <div class="row mb-4" style="gap: var(--space-2);">
        <button class="btn" id="limit-tab" data-order-type="limit">Limit</button>
        <button class="btn" id="market-tab" data-order-type="market">Market</button>
      </div>
      
      <!-- Quantity input -->
      <div class="control">
        <label>Quantity (BLOCK)</label>
        <input type="number" id="order-quantity" placeholder="10" value="10" />
      </div>
      
      <!-- Price input (for limit orders) -->
      <div class="control">
        <label>Price (USD)</label>
        <input type="number" id="order-price" placeholder="${this.currentPrice}" value="${this.currentPrice}" step="0.01" />
      </div>
      
      <!-- Total -->
      <div class="row space-between mb-4" style="padding: var(--space-4); background: var(--bg); border-radius: var(--radius-md);">
        <span class="muted small">Total</span>
        <span id="order-total" style="font-weight: 600;">${fmt.currency(this.currentPrice * 10)}</span>
      </div>
      
      <!-- Action buttons -->
      <div class="row" style="gap: var(--space-3);">
        <button class="btn primary" data-action="buy" style="flex: 1; background: linear-gradient(135deg, var(--success), #22c55e);">Buy BLOCK</button>
        <button class="btn danger" data-action="sell" style="flex: 1;">Sell BLOCK</button>
      </div>
      
      <div class="row mt-4" style="gap: var(--space-2);">
        <button class="btn" data-action="reset" style="flex: 1; font-size: var(--text-xs);">Reset Orders</button>
      </div>
    `;

    // Add event listeners
    const buyBtn = panel.querySelector('[data-action="buy"]');
    const sellBtn = panel.querySelector('[data-action="sell"]');
    const resetBtn = panel.querySelector('[data-action="reset"]');
    const qtyInput = panel.querySelector('#order-quantity');
    const priceInput = panel.querySelector('#order-price');

    this.listen(buyBtn, 'click', () => this.handleOrder('buy'));
    this.listen(sellBtn, 'click', () => this.handleOrder('sell'));
    this.listen(resetBtn, 'click', () => this.handleAction('reset'));
    
    // Update total on input change
    this.listen(qtyInput, 'input', () => this.updateOrderTotal());
    this.listen(priceInput, 'input', () => this.updateOrderTotal());

    return panel;
  }

  updateOrderTotal() {
    const qtyInput = $('#order-quantity');
    const priceInput = $('#order-price');
    const totalEl = $('#order-total');
    
    if (qtyInput && priceInput && totalEl) {
      const qty = parseFloat(qtyInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      totalEl.textContent = fmt.currency(qty * price);
    }
  }

  handleOrder(side) {
    const qtyInput = $('#order-quantity');
    const priceInput = $('#order-price');
    
    if (!qtyInput || !priceInput) return;
    
    const qty = parseFloat(qtyInput.value) || 10;
    const price = parseFloat(priceInput.value) || this.currentPrice;
    
    const orders = appState.get('orders') || [];
    const newOrder = {
      token: 'BLOCK',
      side: side.toUpperCase(),
      qty,
      price,
      timestamp: Date.now(),
    };

    appState.set('orders', [newOrder, ...orders]);
  }

  handleAction(action) {
    if (action === 'reset') {
      appState.set('orders', []);
    }
  }

  updatePriceTicker() {
    // Simulate price movement
    const change = (Math.random() - 0.5) * 0.02;
    this.currentPrice = Math.max(1.0, this.currentPrice + change);
    
    const priceEl = $('#current-price');
    const bookPriceEl = $('#book-current-price');
    
    if (priceEl) {
      priceEl.textContent = fmt.currency(this.currentPrice);
      priceEl.style.color = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--accent)';
    }
    
    if (bookPriceEl) {
      bookPriceEl.textContent = fmt.currency(this.currentPrice);
    }
    
    // Update simulated stats
    const high24h = $('#high-24h');
    const low24h = $('#low-24h');
    const volume24h = $('#volume-24h');
    const marketCap = $('#market-cap');
    
    if (high24h) high24h.textContent = fmt.currency(this.currentPrice * 1.05);
    if (low24h) low24h.textContent = fmt.currency(this.currentPrice * 0.95);
    if (volume24h) volume24h.textContent = fmt.num(Math.floor(Math.random() * 50000) + 10000);
    if (marketCap) marketCap.textContent = fmt.currency((Math.random() * 10 + 5) * 1000000);
  }

  updateOrdersList() {
    const card = $('#order-history-card');
    if (!card) return;

    // Remove existing list
    const existingList = card.querySelector('table');
    if (existingList) {
      existingList.remove();
    }

    const orders = appState.get('orders') || [];

    if (orders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted small text-center p-8';
      empty.textContent = 'No orders yet. Use the order entry panel above to place a trade.';
      card.appendChild(empty);
      return;
    }

    // Create table
    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Time</th>
          <th>Side</th>
          <th>Token</th>
          <th>Quantity</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody id="orders-tbody"></tbody>
    `;

    const tbody = table.querySelector('#orders-tbody');
    orders.forEach((o) => {
      const tr = document.createElement('tr');
      const total = o.qty * o.price;
      const time = new Date(o.timestamp).toLocaleTimeString();
      
      tr.innerHTML = `
        <td>${time}</td>
        <td><span class="pill ${o.side === 'BUY' ? 'success' : 'danger'}">${o.side}</span></td>
        <td>${o.token}</td>
        <td>${fmt.num(o.qty)}</td>
        <td>${fmt.currency(o.price)}</td>
        <td>${fmt.currency(total)}</td>
      `;
      tbody.appendChild(tr);
    });

    card.appendChild(table);
  }

  onUnmount() {
    console.log('[Trading] Cleanup complete');
  }
}

export default Trading;

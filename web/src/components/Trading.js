// Trading component with order management
// Uses formula-based mock data OR live RPC data
// Integrates volume-weighted order book depth chart

import { Component } from '../lifecycle.js';
import { Capabilities } from '../capabilities.js';
import appState from '../state.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';
import mockDataManager from '../mock-data-manager.js';
import features from '../features.js';
import OrderBookDepthChart from './OrderBookDepthChart.js';

class Trading extends Component {
  constructor(rpc) {
    super('Trading');
    this.rpc = rpc;
    this.container = null;
    this.currentPrice = 1.15; // Fallback
    this.orderBookData = null;
    this.depthChart = null;
    this.connectionMode = 'DETECTING';
    this.orderBookSource = 'unknown';
    this.priceSeries = [];
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    // Mirror global connection mode (set by main.js + mockDataManager)
    this.connectionMode = appState.get('connectionMode') || 'DETECTING';
    this.subscribe(appState, 'connectionMode', (mode) => {
      this.connectionMode = mode;
      this.updateConnectionIndicator();
    });
    this.updateConnectionIndicator();

    // Subscribe to app state updates
    this.subscribe(appState, 'orders', () => {
      requestAnimationFrame(() => this.updateOrdersList());
    });

    this.subscribe(appState, 'orderBook', () => {
      requestAnimationFrame(() => this.updateOrderBook());
    });

    // Fetch or generate initial order book data
    await this.fetchOrderBook();
    // Sync order entry form to real price to avoid stale default
    if (this.currentPrice && this.currentPrice !== 1.15) {
      this.autofillPrice(this.currentPrice);
    }

    // Start periodic updates
    this.interval(() => this.updatePriceTicker(), 3000); // Match block time
    this.interval(() => this.fetchOrderBook(), 5000); // Refresh order book every 5s
  }

  render() {
    if (!this.container) return;

    perf.mark('render-trading-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Hero section with connection indicator
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
      <div class="row space-between align-center">
        <div>
          <h2>Trading Sandbox</h2>
          <p>Professional trading interface with volume-weighted order book depth chart</p>
        </div>
        <div id="connection-indicator" class="connection-indicator">
          <span class="connection-dot DETECTING"></span>
          <span class="connection-label">Detecting node...</span>
          <span id="sim-badge" class="pill pill-muted" style="margin-left: var(--space-2); display: none;">Simulated</span>
        </div>
      </div>
    `;
    content.appendChild(hero);

    // TRADING LAYOUT (3-column: Price Ticker | Order Book | Order Entry)
    const tradingLayout = document.createElement('div');
    tradingLayout.className = 'layout-trading';

    // Column 1: Price Ticker
    tradingLayout.appendChild(this.createPriceTicker());

    // Column 2: Order Book with Depth Chart
    tradingLayout.appendChild(this.createOrderBook());

    // Column 3: Order Entry Panel
    tradingLayout.appendChild(this.createOrderEntryPanel());

    content.appendChild(tradingLayout);

    // Depth Chart (full width)
    const depthChartCard = document.createElement('div');
    depthChartCard.className = 'card';
    depthChartCard.innerHTML = `
      <h3>Order Book Depth</h3>
      <p class="muted small mb-4">Volume-weighted cumulative bid/ask visualization</p>
      <div id="depth-chart-container"></div>
    `;
    content.appendChild(depthChartCard);

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
        <div class="row space-between mt-2">
          <span class="muted small">Book Depth / MCap</span>
          <span id="depth-mcap-pct" class="small">—</span>
        </div>
        <div class="row space-between mt-4">
          <span class="muted small">Spread</span>
          <span id="spread-bps" class="small">—</span>
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
        <div class="muted small text-center p-4">Loading order book...</div>
      </div>
    `;
    return orderBook;
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
    Capabilities.bindButton(buyBtn, 'global', 'settlement');
    const sellBtn = panel.querySelector('[data-action="sell"]');
    Capabilities.bindButton(sellBtn, 'global', 'settlement');
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

  /**
   * Fetch order book from node (LIVE) or mock data manager (MOCK)
   */
  async fetchOrderBook() {
    try {
      // Wait until connection mode resolved
      if ((appState.get('connectionMode') || 'DETECTING') === 'DETECTING') return;

      // LIVE nodes do not expose a DEX order book; force mock fallback
      if (mockDataManager.isLiveMode() && features.isEnabled('dex_live_order_book')) {
        try {
          const data = await this.rpc.call('dex.order_book', {
            pair: 'BLOCK/USD',
            depth: 20,
          });
          this.orderBookData = data;
          this.orderBookSource = 'live';
          appState.set('orderBook', data);
          return;
        } catch (e) {
          console.warn('[Trading] dex.order_book unavailable, falling back to simulated depth', e?.message || e);
        }
      }

      // Simulated fallback
      const data = mockDataManager.get('orderBook');
      this.orderBookData = data;
      this.orderBookSource = mockDataManager.isLiveMode() ? 'mock-fallback' : 'mock';
      appState.set('orderBook', data);
    } catch (error) {
      console.error('[Trading] Failed to fetch order book:', error);
    }
  }

  /**
   * Update order book display
   */
  updateOrderBook() {
    const orderBookContent = $('#order-book-content');
    if (!orderBookContent) return;

    const data = appState.get('orderBook');
    if (!data) return;

    this.orderBookData = data;
    this.currentPrice = data.last_trade_price / 100000; // Convert from micro-USD

    // Update ticker
    const priceEl = $('#current-price');
    if (priceEl) {
      priceEl.textContent = fmt.currency(this.currentPrice);
    }

    // Update spread
    const spreadEl = $('#spread-bps');
    if (spreadEl) {
      spreadEl.textContent = `${(data.spread_bps / 100).toFixed(2)}%`;
    }

    // Render order book list
    orderBookContent.innerHTML = '';

    // Asks (descending - highest first)
    const asksContainer = document.createElement('div');
    asksContainer.className = 'mb-4';
    asksContainer.innerHTML = `
      <div class="row space-between muted xs mb-2">
        <span>Price (USD)</span>
        <span>Amount</span>
        <span>Total</span>
      </div>
    `;

    const asksOrders = document.createElement('div');
    asksOrders.id = 'sell-orders';
    
    // Show top 5 asks (reversed to show highest first)
    const topAsks = data.asks.slice(0, 5).reverse();
    topAsks.forEach((level) => {
      const totalAmount = level.orders.reduce((sum, o) => sum + o.amount, 0);
      const price = level.price / 100000;
      const total = price * totalAmount;
      
      const row = document.createElement('div');
      row.className = 'order-book-row ask';
      row.style.cssText = 'padding: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-xs); cursor: pointer;';
      row.innerHTML = `
        <span style="color: var(--danger); font-weight: 600;">${fmt.currency(price)}</span>
        <span>${fmt.num(totalAmount)}</span>
        <span>${fmt.currency(total)}</span>
      `;
      
      this.listen(row, 'click', () => this.autofillPrice(price));
      asksOrders.appendChild(row);
    });

    asksContainer.appendChild(asksOrders);
    orderBookContent.appendChild(asksContainer);

    // Current price marker
    const priceMarker = document.createElement('div');
    priceMarker.style.cssText = 'text-align: center; padding: var(--space-4); background: var(--bg); border-radius: var(--radius-md); margin-bottom: var(--space-4);';
    priceMarker.innerHTML = `
      <div style="font-size: var(--text-xl); font-weight: 700; color: var(--accent);">
        ${fmt.currency(this.currentPrice)}
      </div>
      <div class="muted xs">Current Price</div>
    `;
    orderBookContent.appendChild(priceMarker);

    // Bids
    const bidsContainer = document.createElement('div');
    const bidsOrders = document.createElement('div');
    bidsOrders.id = 'buy-orders';
    
    // Show top 5 bids
    const topBids = data.bids.slice(0, 5);
    topBids.forEach((level) => {
      const totalAmount = level.orders.reduce((sum, o) => sum + o.amount, 0);
      const price = level.price / 100000;
      const total = price * totalAmount;
      
      const row = document.createElement('div');
      row.className = 'order-book-row bid';
      row.style.cssText = 'padding: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-xs); cursor: pointer;';
      row.innerHTML = `
        <span style="color: var(--success); font-weight: 600;">${fmt.currency(price)}</span>
        <span>${fmt.num(totalAmount)}</span>
        <span>${fmt.currency(total)}</span>
      `;
      
      this.listen(row, 'click', () => this.autofillPrice(price));
      bidsOrders.appendChild(row);
    });

    bidsContainer.appendChild(bidsOrders);
    orderBookContent.appendChild(bidsContainer);

    // Update depth chart
    this.updateDepthChart();
  }

  /**
   * Update or create depth chart
   */
  updateDepthChart() {
    const container = $('#depth-chart-container');
    if (!container || !this.orderBookData) return;

    // Always inject the current unified price so the depth chart mid-line
    // stays in sync with the price ticker — not a stale order book snapshot
    const dataWithCurrentPrice = {
      ...this.orderBookData,
      last_trade_price: Math.round(this.currentPrice * 100000),
    };

    if (!this.depthChart) {
      this.depthChart = new OrderBookDepthChart(dataWithCurrentPrice, {
        height: 400,
        onPriceClick: (price) => this.autofillPrice(price),
      });
      container.innerHTML = '';
      container.appendChild(this.depthChart.render());
    } else {
      this.depthChart.updateData(dataWithCurrentPrice);
    }
  }

  /**
   * Autofill order entry price when clicking on order book or chart
   */
  autofillPrice(price) {
    const priceInput = $('#order-price');
    if (priceInput) {
      priceInput.value = price.toFixed(4);
      this.updateOrderTotal();
      
      // Flash effect
      priceInput.style.background = 'rgba(26, 198, 162, 0.2)';
      setTimeout(() => {
        priceInput.style.background = '';
      }, 300);
    }
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

  async handleOrder(side) {
    const qtyInput = $('#order-quantity');
    const priceInput = $('#order-price');
    
    if (!qtyInput || !priceInput) return;
    
    const qty = parseFloat(qtyInput.value) || 10;
    const price = parseFloat(priceInput.value) || this.currentPrice;
    
    try {
      const res = await this.rpc.call('dex.place_order', [{ token: 'BLOCK', side, qty, price }]);
      const orders = appState.get('orders') || [];
      const newOrder = res?.order || {
        token: 'BLOCK',
        side: side.toUpperCase(),
        qty,
        price,
        timestamp: Date.now(),
        source: 'mock',
      };

      appState.set('orders', [newOrder, ...orders]);
      if (res?.order_book) appState.set('orderBook', res.order_book);

      await this.fetchOrderBook();
      this.updateOrderTotal();
      qtyInput.value = ''; // visual feedback
    } catch(e) {
      console.error('[Trading] Failed to place order', e);
    }
  }

  handleAction(action) {
    if (action === 'reset') {
      appState.set('orders', []);
    }
  }

  updatePriceTicker() {
    // Track observed price locally (works in LIVE+mock-fallback and MOCK)
    const now = Date.now();
    const price = Number(this.currentPrice);
    if (Number.isFinite(price) && price > 0) {
      this.priceSeries.push({ ts: now, price });
      // prune >24h and cap size to avoid unbounded growth
      const cutoff = now - 86_400_000;
      this.priceSeries = this.priceSeries.filter(p => p.ts >= cutoff).slice(-5000);
    }

    // 24h high/low from local series (not from mockDataManager)
    const series = this.priceSeries.length ? this.priceSeries : [];
    if (series.length >= 2) {
      const vals = series.map(p => p.price);
      const high = Math.max(...vals);
      const low  = Math.min(...vals);
      const high24h = $('#high-24h');
      const low24h  = $('#low-24h');
      if (high24h) high24h.textContent = fmt.currency(high);
      if (low24h)  low24h.textContent  = fmt.currency(low);
      
      const latestPrice = vals[vals.length - 1];
      const prevPrice = vals[vals.length - 2];
      const change = latestPrice - prevPrice;
      const changePct = prevPrice > 0 ? (change / prevPrice) * 100 : 0;
      
      const priceEl = $('#current-price');
      const changeEl = $('#price-change');
      
      if (priceEl) {
        priceEl.textContent = fmt.currency(latestPrice);
        priceEl.style.color = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--accent)';
      }
      
      if (changeEl) {
        const sign = change > 0 ? '+' : '';
        changeEl.textContent = `${sign}${changePct.toFixed(2)}%`;
        changeEl.style.color = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--muted)';
      }
    }

    // Volume / market cap / depth-to-mcap: read strictly from current orderBook snapshot
    const ob = appState.get('orderBook') || {};
    const volume24hEl = $('#volume-24h');
    if (volume24hEl) {
      if (ob.volume_24h_usd != null) volume24hEl.textContent = `$${fmt.num(ob.volume_24h_usd)}`;
      else if (ob.volume_24h_block != null) volume24hEl.textContent = `${fmt.num(ob.volume_24h_block)} BLOCK`;
      else volume24hEl.textContent = '—';
    }

    const marketCapEl = $('#market-cap');
    if (marketCapEl) {
      if (ob.market_cap_usd != null) marketCapEl.textContent = fmt.currency(ob.market_cap_usd);
      else marketCapEl.textContent = '—';
    }

    const depthMcapEl = $('#depth-mcap-pct');
    if (depthMcapEl) {
      depthMcapEl.textContent = ob.depth_to_mcap_pct != null ? `${ob.depth_to_mcap_pct}%` : '—';
    }

    // Keep depth chart mid-line synced
    this.updateDepthChart();
  }

  updateConnectionIndicator() {
    const indicator = $('#connection-indicator');
    if (!indicator) return;

    const dot = indicator.querySelector('.connection-dot');
    const label = indicator.querySelector('.connection-label');

    if (dot && label) {
      dot.className = `connection-dot ${this.connectionMode}`;
      
      if (this.connectionMode === 'LIVE') {
        if (this.orderBookSource === 'mock-fallback') {
          label.textContent = 'Node connected (order book not exposed; using mock depth)';
        } else {
          label.textContent = 'Connected to Node';
        }
      } else if (this.connectionMode === 'MOCK') {
        label.textContent = 'Demo Mode (Formula-Based)';
      } else {
        label.textContent = 'Detecting node...';
      }

      // Simulated badge
      const badge = $('#sim-badge');
      if (badge) {
        const simulatedMarket = this.orderBookSource !== 'live';
        badge.style.display = simulatedMarket ? 'inline-flex' : 'none';
        badge.textContent = simulatedMarket ? 'Simulated' : '';
      }
    }
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
    if (this.depthChart) {
      this.depthChart.onUnmount();
    }
  }
}

export default Trading;

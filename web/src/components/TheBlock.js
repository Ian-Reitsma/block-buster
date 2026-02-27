// TheBlock dashboard component with lifecycle management
// Uses observable state, declarative rendering, and auto-cleanup
// Refactored with scientific UX hierarchy and responsive grid layouts

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { bind } from '../bind.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';
import mockDataManager from '../mock-data-manager.js';

class TheBlock extends Component {
  constructor(rpc) {
    super('TheBlock');
    this.rpc = rpc;
    this.container = null;
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    // Subscribe to metrics updates
    this.subscribe(appState, 'metrics', (data) => {
      requestAnimationFrame(() => this.updateMetrics(data));
    });

    // Subscribe to polling state changes
    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });

    // Initial fetch (always needed)
    await this.fetchMetrics();
    
    // Start polling if WebSocket not enabled
    const usePolling = appState.get('usePolling');
    if (usePolling !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) {
      console.log('[TheBlock] Already polling');
      return;
    }
    
    console.log('[TheBlock] Starting polling (2s interval)');
    this.pollingInterval = this.interval(() => this.fetchMetrics(), 2000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      console.log('[TheBlock] Stopping polling (using WebSocket)');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchMetrics() {
    try {
      const data = await perf.time(
        'fetchMetrics',
        () => this.rpc.getDashboardMetrics(),
        'fetch',
      );
      
      // Check if data exists
      if (!data) {
        console.warn('[TheBlock] No data returned from getDashboardMetrics');
        return;
      }
      
      // Transform RPC response to component state
      const issuanceState = mockDataManager.get('issuance') || {};
      // max_tps comes from the issuance mock/live schema — derived from receipts_validation.rs.
      // Protocol ceiling: 10,000 TPS (10 MB block budget ÷ 1 KB min receipt ÷ 1s blocks).
      // Fallback only fires before first mock tick; once data loads this will always be 10,000.
      const maxTps = issuanceState.max_tps || 10_000;
      const hourlyIssuance = Math.round((issuanceState.final_reward || 0) * 3600);

      const metrics = {
        tps: data.tps || 0,
        fees: data.fees || 0,
        latencyMs: data.avgLatency || 0,
        peers: data.activePeers || 0,
        blockHeight: data.blockHeight || 0,
        finalizedHeight: data.finalizedHeight || 0,
        issuance: hourlyIssuance,
        avgBlockTime: data.avgBlockTime || 0,
        __maxTps: maxTps,
      };
      
      appState.set('metrics', metrics);
      
      // Log any RPC errors but don't fail
      if (data.errors && data.errors.length > 0) {
        console.warn('[TheBlock] Some RPC calls failed:', data.errors);
      }
      
    } catch (error) {
      console.error('[TheBlock] Failed to fetch metrics:', error);
      appState.set('offline', true);
    }
  }

  render() {
    if (!this.container) return;

    perf.mark('render-theblock-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Hero section
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
      <h2>The Block Network</h2>
      <p>First-party dashboard with zero third-party JS. Live metrics refreshed via native fetch.</p>
    `;
    content.appendChild(hero);

    // HERO METRICS (4-column responsive grid - most prominent)
    const heroMetrics = document.createElement('section');
    heroMetrics.className = 'metrics-hero-grid';
    heroMetrics.id = 'hero-metrics-grid';
    heroMetrics.innerHTML = `
      <div class="card-metric-hero loading" data-tooltip="Transactions processed per second">
        <h3>TPS</h3>
        <div class="value" data-bind="tps" data-format="number">—</div>
        <div class="label">Transactions per second</div>
      </div>
      <div class="card-metric-hero loading" data-tooltip="Current blockchain height">
        <h3>Block Height</h3>
        <div class="value" data-bind="blockHeight" data-format="number">—</div>
        <div class="label">Latest block</div>
      </div>
      <div class="card-metric-hero loading" data-tooltip="Latest finalized (confirmed) block">
        <h3>Finalized</h3>
        <div class="value" data-bind="finalizedHeight" data-format="number">—</div>
        <div class="label">Confirmed height</div>
      </div>
      <div class="card-metric-hero loading" data-tooltip="Number of connected peer nodes">
        <h3>Peers</h3>
        <div class="value" data-bind="peers" data-format="number">—</div>
        <div class="label">Active connections</div>
      </div>
    `;
    content.appendChild(heroMetrics);

    // PRIMARY METRICS (3-column grid - secondary importance)
    const primaryMetrics = document.createElement('section');
    primaryMetrics.className = 'metrics-primary-grid';
    primaryMetrics.id = 'primary-metrics-grid';
    primaryMetrics.innerHTML = `
      <div class="card-metric-primary loading" data-tooltip="Total network fees collected">
        <h3>Network Fees</h3>
        <div class="value"><span data-bind="fees" data-format="number">—</span> BLOCK</div>
      </div>
      <div class="card-metric-primary loading" data-tooltip="Average peer-to-peer latency">
        <h3>P2P Latency</h3>
        <div class="value" data-bind="latencyMs" data-format="ms">—</div>
      </div>
      <div class="card-metric-primary loading" data-tooltip="Estimated tokens issued per hour">
        <h3>Hourly Issuance</h3>
        <div class="value"><span data-bind="issuance" data-format="number">—</span> BLOCK</div>
      </div>
    `;
    content.appendChild(primaryMetrics);

    // COMPACT METRICS (6-column grid - detailed stats)
    const compactMetrics = document.createElement('section');
    compactMetrics.className = 'metrics-compact-grid';
    compactMetrics.id = 'compact-metrics-grid';
    compactMetrics.innerHTML = `
      <div class="card-metric-compact loading" data-tooltip="Average time to produce a block">
        <h3>Avg Block Time</h3>
        <div class="value" data-bind="avgBlockTime" data-format="ms">—</div>
      </div>
      <div class="card-metric-compact loading" data-tooltip="Blocks awaiting finalization">
        <h3>Unconfirmed</h3>
        <div class="value" id="unconfirmed-blocks">—</div>
      </div>
      <div class="card-metric-compact loading" data-tooltip="Current network utilization">
        <h3>Network Load</h3>
        <div class="value" id="network-load">—</div>
      </div>
      <div class="card-metric-compact loading" data-tooltip="Number of active validators">
        <h3>Validator Set</h3>
        <div class="value" id="validator-count">—</div>
      </div>
      <div class="card-metric-compact loading" data-tooltip="Total token supply">
        <h3>Supply</h3>
        <div class="value" id="total-supply">—</div>
      </div>
      <div class="card-metric-compact loading" data-tooltip="Overall network health">
        <h3>Status</h3>
        <div class="value" id="chain-status">—</div>
      </div>
    `;
    content.appendChild(compactMetrics);

    // DETAILED SECTIONS (2-column split layout)
    const detailedSection = document.createElement('div');
    detailedSection.className = 'layout-split';
    detailedSection.id = 'detailed-section';
    content.appendChild(detailedSection);

    this.container.innerHTML = '';
    this.container.appendChild(content);

    // Bind initial data if available
    const metrics = appState.get('metrics');
    if (metrics) {
      this.updateMetrics(metrics);
    }

    // Deferred: Render detailed charts after initial paint
    requestAnimationFrame(() => this.renderDetailedCharts());

    perf.measure('render-theblock', 'render-theblock-start', 'render');
  }

  updateMetrics(data) {
    // Remove loading state from all cards
    const loadingCards = document.querySelectorAll('.loading');
    loadingCards.forEach(card => card.classList.remove('loading'));

    // Update hero metrics
    const heroGrid = $('#hero-metrics-grid');
    if (heroGrid) {
      bind(heroGrid, data);
    }

    // Update primary metrics
    const primaryGrid = $('#primary-metrics-grid');
    if (primaryGrid) {
      bind(primaryGrid, data);
    }

    // Update compact metrics
    const compactGrid = $('#compact-metrics-grid');
    if (compactGrid) {
      bind(compactGrid, data);
      
      // Calculate derived metrics
      const unconfirmed = (data.blockHeight || 0) - (data.finalizedHeight || 0);
      const unconfirmedEl = $('#unconfirmed-blocks');
      if (unconfirmedEl) {
        unconfirmedEl.textContent = fmt.num(unconfirmed);
      }

      const maxTps = data.__maxTps || 500;
      const networkLoad = data.tps ? `${Math.min(100, Math.round((data.tps / maxTps) * 100))}%` : '—';
      const networkLoadEl = $('#network-load');
      if (networkLoadEl) {
        networkLoadEl.textContent = networkLoad;
      }

      const validatorEl = $('#validator-count');
      if (validatorEl) {
        const validators = mockDataManager.get('validators') || [];
        validatorEl.textContent = validators.length ? fmt.num(validators.length) : '—';
      }

      const supplyEl = $('#total-supply');
      if (supplyEl) {
        const issuance = mockDataManager.get('issuance') || {};
        const totalEmission = issuance.total_emission ?? issuance.totalEmission;
        supplyEl.textContent = typeof totalEmission === 'number' ? `${fmt.num(Math.round(totalEmission))} BLOCK` : '—';
      }

      const statusEl = $('#chain-status');
      if (statusEl) {
        const isHealthy = data.tps > 0 && data.peers > 0;
        statusEl.innerHTML = isHealthy
          ? '<span class="pill success">Healthy</span>'
          : '<span class="pill warn">Degraded</span>';
      }
    }
  }

  renderDetailedCharts() {
    const section = $('#detailed-section');
    if (!section) return;

    // Clear previous content
    section.innerHTML = '';

    const tpsHistoryRaw = appState.get('tpsHistory') || mockDataManager.get('tpsHistory') || [];
    // Extract just the numeric values from the {timestamp, value} objects, take last 10
    const tpsValues = tpsHistoryRaw.length > 0 
      ? tpsHistoryRaw.slice(-10).map(p => Math.round(p.value))
      : [10, 15, 12, 18, 20, 15, 22, 19, 16, 21];

    const orders = appState.get('orders') || [];

    // Throughput chart card
    const perfCard = document.createElement('div');
    perfCard.className = 'card';
    perfCard.innerHTML = '<h3>Throughput History (10 blocks)</h3><p class="muted small mb-4">Recent transaction processing rate</p>';
    perfCard.appendChild(this.createMiniBars(tpsValues));
    section.appendChild(perfCard);

    // Recent orders card
    const ordersCard = document.createElement('div');
    ordersCard.className = 'card';
    ordersCard.innerHTML = '<h3>Recent Activity</h3><p class="muted small mb-4">Latest orders and transactions</p>';
    ordersCard.appendChild(this.createOrdersList(orders));
    section.appendChild(ordersCard);
  }

  createMiniBars(values) {
    const wrap = document.createElement('div');
    wrap.className = 'chart';
    const maxVal = Math.max(...values, 1);
    const CHART_MAX_PX = 120;
    const CHART_MIN_PX = 8;
    values.forEach((v) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      const heightPx = Math.round(CHART_MIN_PX + ((v / maxVal) * (CHART_MAX_PX - CHART_MIN_PX)));
      bar.style.height = `${heightPx}px`;
      bar.title = `${v} TPS`;
      wrap.appendChild(bar);
    });
    return wrap;
  }

  createOrdersList(orders) {
    if (orders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted small text-center p-8';
      empty.textContent = 'No recent activity. Visit the Trading page to simulate orders.';
      return empty;
    }

    const ul = document.createElement('ul');
    ul.className = 'list';
    orders.slice(0, 5).forEach((o) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${o.side} ${o.qty} ${o.token} @ ${fmt.currency(o.price)}</span>
        <span class="pill ${o.side === 'BUY' ? 'success' : 'danger'}">${o.side}</span>
      `;
      ul.appendChild(li);
    });
    return ul;
  }

  onUnmount() {
    this.stopPolling();
    console.log('[TheBlock] Cleanup complete');
  }
}

export default TheBlock;

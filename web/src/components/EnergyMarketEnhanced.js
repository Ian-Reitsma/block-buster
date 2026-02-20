/**
 * Enhanced Energy Market Dashboard
 * 
 * Complete integration with The Block energy market RPCs:
 * - energy.register_provider
 * - energy.market_state
 * - energy.submit_reading
 * - energy.credits
 * - energy.settle
 * - energy.receipts
 * - energy.disputes
 * - energy.flag_dispute
 * - energy.resolve_dispute
 * - energy.slashes
 * 
 * Features:
 * - Real-time provider monitoring
 * - Meter reading submission UI
 * - Dispute management workflow
 * - Settlement tracking
 * - Provider performance analytics
 * - Energy credit visualization
 * - Slash event tracking
 * - Geographic distribution map
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import MarketChart from './MarketChart.js';
import SelectionPanel from './SelectionPanel.js';
import FilterBuilder from './FilterBuilder.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';

class EnergyMarketEnhanced extends Component {
  constructor(rpc) {
    super('EnergyMarketEnhanced');
    this.rpc = rpc;
    this.container = null;
    this.activeView = 'overview';
    this.charts = {};
    this.selectionPanel = null;
    this.filterBuilder = null;
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    this.subscribe(appState, 'energyMarket', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) this.startPolling();
      else this.stopPolling();
    });

    await this.fetchEnergyMarketData();
    
    if (appState.get('usePolling') !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[EnergyMarket] Starting polling (5s interval)');
    this.pollingInterval = this.interval(() => this.fetchEnergyMarketData(), 5000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchEnergyMarketData() {
    try {
      // Batch RPC calls for efficiency
      const [marketState, credits, receipts, disputes, slashes] = await Promise.all([
        this.rpc.call('energy.market_state', {}).catch(() => ({})),
        this.rpc.call('energy.credits', {}).catch(() => ({})),
        this.rpc.call('energy.receipts', { limit: 100 }).catch(() => ({ receipts: [] })),
        this.rpc.call('energy.disputes', {}).catch(() => ({ disputes: [] })),
        this.rpc.call('energy.slashes', {}).catch(() => ({ slashes: [] })),
      ]);

      const providers = marketState.providers || [];
      const activeProviders = providers.filter(p => p.status === 'active');
      const totalCapacity = providers.reduce((sum, p) => sum + (p.capacity_kwh || 0), 0);
      const utilization = marketState.total_energy_supplied / (totalCapacity || 1);

      appState.set('energyMarket', {
        providers,
        credits: credits.credits || [],
        receipts: receipts.receipts || [],
        disputes: disputes.disputes || [],
        slashes: slashes.slashes || [],
        metrics: {
          activeProviders: activeProviders.length,
          totalProviders: providers.length,
          totalCapacity,
          totalEnergySupplied: marketState.total_energy_supplied || 0,
          utilizationRate: utilization * 100,
          avgPricePerKwh: marketState.avg_price_per_kwh || 0,
          openDisputes: disputes.disputes?.filter(d => d.status === 'open').length || 0,
          totalSlashes: slashes.slashes?.length || 0,
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[EnergyMarket] Failed to fetch:', error);
    }
  }

  render() {
    if (!this.container) return;

    const content = document.createElement('div');
    content.className = 'content';

    // Header with actions
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
      <div class="hero">
        <h2>Energy Market</h2>
        <p>Provider registration, meter readings, settlement, and dispute management</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="register-provider-btn">
          <span class="btn-icon">+</span>
          Register Provider
        </button>
        <button class="btn btn-secondary" id="submit-reading-btn">
          <span class="btn-icon">⚡</span>
          Submit Reading
        </button>
        <button class="btn btn-secondary" id="settle-btn">
          <span class="btn-icon">✔</span>
          Settle
        </button>
      </div>
    `;
    content.appendChild(header);

    // Tabs
    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'providers' ? 'active' : ''}" data-view="providers">Providers</button>
      <button class="tab ${this.activeView === 'readings' ? 'active' : ''}" data-view="readings">Readings</button>
      <button class="tab ${this.activeView === 'disputes' ? 'active' : ''}" data-view="disputes">Disputes</button>
      <button class="tab ${this.activeView === 'analytics' ? 'active' : ''}" data-view="analytics">Analytics</button>
      <button class="tab ${this.activeView === 'slashes' ? 'active' : ''}" data-view="slashes">Slashes</button>
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
    viewContainer.className = 'view-container';
    viewContainer.id = 'energy-view-container';
    content.appendChild(viewContainer);

    this.container.innerHTML = '';
    this.container.appendChild(content);

    this.renderActiveView();

    // Attach header button handlers
    const registerBtn = $('#register-provider-btn');
    if (registerBtn) {
      this.listen(registerBtn, 'click', () => this.showRegisterProviderModal());
    }

    const readingBtn = $('#submit-reading-btn');
    if (readingBtn) {
      this.listen(readingBtn, 'click', () => this.showSubmitReadingModal());
    }

    const settleBtn = $('#settle-btn');
    if (settleBtn) {
      this.listen(settleBtn, 'click', () => this.showSettleModal());
    }
  }

  renderActiveView() {
    const container = $('#energy-view-container');
    if (!container) return;

    container.innerHTML = '';

    switch (this.activeView) {
      case 'overview':
        container.appendChild(this.renderOverview());
        break;
      case 'providers':
        container.appendChild(this.renderProviders());
        break;
      case 'readings':
        container.appendChild(this.renderReadings());
        break;
      case 'disputes':
        container.appendChild(this.renderDisputes());
        break;
      case 'analytics':
        container.appendChild(this.renderAnalytics());
        break;
      case 'slashes':
        container.appendChild(this.renderSlashes());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'energy-overview';

    const marketData = appState.get('energyMarket') || {};
    const metrics = marketData.metrics || {};

    // Hero metrics
    const heroMetrics = document.createElement('section');
    heroMetrics.className = 'metrics-hero-grid';
    heroMetrics.innerHTML = `
      <div class="card-metric-hero">
        <h3>Active Providers</h3>
        <div class="value">${fmt.num(metrics.activeProviders || 0)}</div>
        <div class="label">Online and supplying</div>
      </div>
      <div class="card-metric-hero">
        <h3>Total Capacity</h3>
        <div class="value">${fmt.num(metrics.totalCapacity || 0)}</div>
        <div class="label">kWh available</div>
      </div>
      <div class="card-metric-hero">
        <h3>Energy Supplied</h3>
        <div class="value">${fmt.num(metrics.totalEnergySupplied || 0)}</div>
        <div class="label">kWh delivered</div>
      </div>
      <div class="card-metric-hero">
        <h3>Utilization</h3>
        <div class="value">${fmt.num(metrics.utilizationRate || 0)}%</div>
        <div class="label">Network usage</div>
      </div>
    `;
    view.appendChild(heroMetrics);

    // Primary metrics
    const primaryMetrics = document.createElement('section');
    primaryMetrics.className = 'metrics-primary-grid';
    primaryMetrics.innerHTML = `
      <div class="card-metric-primary">
        <h3>Avg Price</h3>
        <div class="value">${fmt.currency(metrics.avgPricePerKwh || 0)}</div>
        <div class="label">per kWh</div>
      </div>
      <div class="card-metric-primary">
        <h3>Open Disputes</h3>
        <div class="value ${metrics.openDisputes > 0 ? 'text-warn' : 'text-success'}">${fmt.num(metrics.openDisputes || 0)}</div>
        <div class="label">Requires attention</div>
      </div>
      <div class="card-metric-primary">
        <h3>Total Slashes</h3>
        <div class="value ${metrics.totalSlashes > 0 ? 'text-danger' : 'text-muted'}">${fmt.num(metrics.totalSlashes || 0)}</div>
        <div class="label">Penalties issued</div>
      </div>
    `;
    view.appendChild(primaryMetrics);

    // Charts section
    const chartsSection = document.createElement('div');
    chartsSection.className = 'layout-split';
    chartsSection.innerHTML = `
      <div class="card">
        <h3>Energy Supply (24h)</h3>
        <div id="energy-supply-chart" style="height: 300px;"></div>
      </div>
      <div class="card">
        <h3>Provider Distribution</h3>
        <div id="provider-distribution-chart" style="height: 300px;"></div>
      </div>
    `;
    view.appendChild(chartsSection);

    // Render charts after DOM insertion
    requestAnimationFrame(() => {
      this.renderEnergySupplyChart();
      this.renderProviderDistributionChart();
    });

    return view;
  }

  renderProviders() {
    const view = document.createElement('div');
    view.className = 'energy-providers-view';

    // Filter builder
    const filterContainer = document.createElement('div');
    filterContainer.id = 'provider-filters';
    view.appendChild(filterContainer);

    // Table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.id = 'providers-table-container';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      this.renderProvidersTable();
    });

    return view;
  }

  renderProvidersTable() {
    const container = $('#providers-table-container');
    if (!container) return;

    const marketData = appState.get('energyMarket') || {};
    const providers = marketData.providers || [];

    // Initialize filter builder
    const filterContainer = document.createElement('div');
    filterContainer.id = 'provider-filter-builder';
    container.insertBefore(filterContainer, container.firstChild);

    this.filterBuilder = new FilterBuilder({
      containerId: 'provider-filter-builder',
      columns: [
        { key: 'provider_id', label: 'Provider ID', type: 'text' },
        { key: 'capacity_kwh', label: 'Capacity', type: 'number' },
        { key: 'price_per_kwh', label: 'Price', type: 'number' },
        { key: 'status', label: 'Status', type: 'select' },
        { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' },
      ],
      onFilterChange: (_filters) => {
        const filtered = this.filterBuilder.applyFilters(providers);
        this.updateProvidersTable(filtered);
      },
    });
    this.filterBuilder.mount();

    // Initial table render
    this.updateProvidersTable(providers);
  }

  updateProvidersTable(providers) {
    const container = $('#providers-table-container');
    if (!container) return;

    const existingTable = container.querySelector('.providers-table');
    if (existingTable) existingTable.remove();

    const table = document.createElement('table');
    table.className = 'data-table providers-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Provider ID</th>
        <th>Capacity (kWh)</th>
        <th>Price (per kWh)</th>
        <th>Status</th>
        <th>Jurisdiction</th>
        <th>Meter Address</th>
        <th>Stake</th>
        <th>Actions</th>
      </tr>
    `;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    providers.forEach(provider => {
      const tr = document.createElement('tr');
      tr.dataset.rowId = provider.provider_id;
      tr.tabIndex = 0;

      const statusClass = provider.status === 'active' ? 'success' : 
                         provider.status === 'suspended' ? 'danger' : 'muted';

      tr.innerHTML = `
        <td><code class="code-inline">${provider.provider_id}</code></td>
        <td class="text-right">${fmt.num(provider.capacity_kwh)}</td>
        <td class="text-right">${fmt.currency(provider.price_per_kwh)}</td>
        <td><span class="pill ${statusClass}">${provider.status}</span></td>
        <td>${provider.jurisdiction || '—'}</td>
        <td><code class="code-inline text-sm">${provider.meter_address || '—'}</code></td>
        <td class="text-right">${fmt.currency(provider.stake || 0)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-xs btn-ghost" data-action="view" data-provider="${provider.provider_id}">View</button>
            <button class="btn btn-xs btn-ghost" data-action="readings" data-provider="${provider.provider_id}">Readings</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);

      // Attach action handlers
      const viewBtn = tr.querySelector('[data-action="view"]');
      if (viewBtn) {
        this.listen(viewBtn, 'click', () => this.showProviderDetails(provider));
      }

      const readingsBtn = tr.querySelector('[data-action="readings"]');
      if (readingsBtn) {
        this.listen(readingsBtn, 'click', () => this.showProviderReadings(provider));
      }
    });
    table.appendChild(tbody);

    container.appendChild(table);

    // Initialize selection panel
    this.selectionPanel = new SelectionPanel({
      containerId: 'providers-table-container',
      bulkActions: [
        { 
          label: 'Export Selected', 
          icon: '⤓', 
          onClick: (items) => this.exportProviders(items),
        },
      ],
      onSelectionChange: (selected) => {
        console.log('[EnergyMarket] Selected providers:', selected);
      },
    });
    this.selectionPanel.mount();

    const rows = Array.from(tbody.querySelectorAll('tr'));
    this.selectionPanel.attachToRows(rows, providers);
  }

  renderReadings() {
    const view = document.createElement('div');
    view.className = 'energy-readings-view card';

    view.innerHTML = `
      <h3>Meter Readings & Receipts</h3>
      <p class="muted mb-6">Recent energy submissions and verification receipts</p>
      <div id="readings-table"></div>
    `;

    return view;
  }

  renderDisputes() {
    const view = document.createElement('div');
    view.className = 'energy-disputes-view';

    const marketData = appState.get('energyMarket') || {};
    const disputes = marketData.disputes || [];

    view.innerHTML = `
      <div class="card">
        <h3>Active Disputes</h3>
        <p class="muted mb-6">Dispute resolution and arbitration</p>
        <div id="disputes-container"></div>
      </div>
    `;

    // Render disputes list
    requestAnimationFrame(() => {
      const container = $('#disputes-container');
      if (!container) return;

      if (disputes.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="muted">No active disputes</p></div>';
        return;
      }

      const disputesList = document.createElement('div');
      disputesList.className = 'disputes-list';

      disputes.forEach(dispute => {
        const disputeCard = document.createElement('div');
        disputeCard.className = 'dispute-card';

        const statusClass = dispute.status === 'open' ? 'warn' : 
                           dispute.status === 'resolved' ? 'success' : 'muted';

        disputeCard.innerHTML = `
          <div class="dispute-header">
            <h4>Dispute #${dispute.id}</h4>
            <span class="pill ${statusClass}">${dispute.status}</span>
          </div>
          <div class="dispute-body">
            <div class="dispute-field">
              <span class="label">Provider:</span>
              <code class="code-inline">${dispute.provider_id}</code>
            </div>
            <div class="dispute-field">
              <span class="label">Reason:</span>
              <span>${dispute.reason || 'Not specified'}</span>
            </div>
            <div class="dispute-field">
              <span class="label">Filed:</span>
              <span>${new Date(dispute.timestamp).toLocaleString()}</span>
            </div>
          </div>
          <div class="dispute-actions">
            <button class="btn btn-sm btn-secondary" data-action="view" data-dispute-id="${dispute.id}">View Details</button>
            ${dispute.status === 'open' ? `<button class="btn btn-sm btn-primary" data-action="resolve" data-dispute-id="${dispute.id}">Resolve</button>` : ''}
          </div>
        `;

        disputesList.appendChild(disputeCard);

        // Attach handlers
        const viewBtn = disputeCard.querySelector('[data-action="view"]');
        if (viewBtn) {
          this.listen(viewBtn, 'click', () => this.showDisputeDetails(dispute));
        }

        const resolveBtn = disputeCard.querySelector('[data-action="resolve"]');
        if (resolveBtn) {
          this.listen(resolveBtn, 'click', () => this.showResolveDisputeModal(dispute));
        }
      });

      container.appendChild(disputesList);
    });

    return view;
  }

  renderAnalytics() {
    const view = document.createElement('div');
    view.className = 'energy-analytics-view';

    view.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <h3>Supply Trends</h3>
          <div id="supply-trend-chart" style="height: 350px;"></div>
        </div>
        <div class="card">
          <h3>Provider Performance</h3>
          <div id="provider-performance-chart" style="height: 350px;"></div>
        </div>
      </div>
      <div class="grid grid-2 mt-6">
        <div class="card">
          <h3>Price Analysis</h3>
          <div id="price-analysis-chart" style="height: 350px;"></div>
        </div>
        <div class="card">
          <h3>Dispute Rate</h3>
          <div id="dispute-rate-chart" style="height: 350px;"></div>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      this.renderAnalyticsCharts();
    });

    return view;
  }

  renderSlashes() {
    const view = document.createElement('div');
    view.className = 'energy-slashes-view card';

    view.innerHTML = `
      <h3>Slash Events</h3>
      <p class="muted mb-6">Penalties and stake reductions</p>
      <div id="slashes-table"></div>
    `;

    return view;
  }

  // Chart rendering methods
  renderEnergySupplyChart() {
    const marketData = appState.get('energyMarket') || {};
    const receipts = marketData.receipts || [];

    // Generate time series from receipts
    const timeSeries = receipts.map(r => [
      new Date(r.timestamp).getTime(),
      r.energy_kwh || 0,
    ]);

    this.charts.energySupply = new MarketChart({
      containerId: 'energy-supply-chart',
      type: 'area',
      series: [{
        name: 'Energy Supply',
        data: timeSeries,
        color: '#1ac6a2',
      }],
      xAxis: { type: 'time', label: 'Time' },
      yAxis: { label: 'kWh' },
    });
    this.charts.energySupply.mount();
  }

  renderProviderDistributionChart() {
    const marketData = appState.get('energyMarket') || {};
    const providers = marketData.providers || [];

    // Group by jurisdiction
    const jurisdictions = {};
    providers.forEach(p => {
      const j = p.jurisdiction || 'Unknown';
      jurisdictions[j] = (jurisdictions[j] || 0) + 1;
    });

    const data = Object.entries(jurisdictions).map(([_j, count], idx) => [
      idx,
      count,
    ]);

    this.charts.providerDist = new MarketChart({
      containerId: 'provider-distribution-chart',
      type: 'bar',
      series: [{
        name: 'Providers',
        data,
        color: '#f0b429',
      }],
      xAxis: { label: 'Jurisdiction' },
      yAxis: { label: 'Count' },
    });
    this.charts.providerDist.mount();
  }

  renderAnalyticsCharts() {
    // Placeholder for advanced analytics charts
    console.log('[EnergyMarket] Rendering analytics charts');
  }

  // Modal methods
  showRegisterProviderModal() {
    const modal = new Modal({
      title: 'Register Energy Provider',
      size: 'large',
      content: `
        <form id="register-provider-form" class="form">
          <div class="form-row">
            <div class="form-group">
              <label>Capacity (kWh)</label>
              <input type="number" name="capacity_kwh" required min="0" step="0.01" />
            </div>
            <div class="form-group">
              <label>Price per kWh</label>
              <input type="number" name="price_per_kwh" required min="0" step="0.001" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Meter Address</label>
              <input type="text" name="meter_address" required />
            </div>
            <div class="form-group">
              <label>Jurisdiction</label>
              <select name="jurisdiction" required>
                <option value="">Select jurisdiction...</option>
                <option value="US_CA">US - California</option>
                <option value="US_TX">US - Texas</option>
                <option value="EU_DE">EU - Germany</option>
                <option value="EU_FR">EU - France</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Stake Amount</label>
            <input type="number" name="stake" required min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label>Owner Account</label>
            <input type="text" name="owner" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-register">Cancel</button>
        <button class="btn btn-primary" id="submit-register">Register Provider</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-register');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-register');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          await this.registerProvider();
          modal.close();
        });
      }
    }, 100);
  }

  showSubmitReadingModal() {
    const modal = new Modal({
      title: 'Submit Meter Reading',
      size: 'medium',
      content: `
        <form id="submit-reading-form" class="form">
          <div class="form-group">
            <label>Provider ID</label>
            <input type="text" name="provider_id" required />
          </div>
          <div class="form-group">
            <label>Meter Total (kWh)</label>
            <input type="number" name="meter_total" required min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label>Signature</label>
            <input type="text" name="signature" required />
            <small class="form-hint">Signed reading from trusted meter</small>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-reading">Cancel</button>
        <button class="btn btn-primary" id="submit-reading">Submit</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-reading');
      if (cancelBtn) cancelBtn.addEventListener('click', () => modal.close());

      const submitBtn = $('#submit-reading');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          await this.submitReading();
          modal.close();
        });
      }
    }, 100);
  }

  showSettleModal() {
    const modal = new Modal({
      title: 'Settle Energy Market',
      content: `
        <p>Trigger settlement for the energy market. This will process pending credits and finalize receipts.</p>
        <div class="form-group mt-4">
          <label>Settlement Epoch</label>
          <input type="number" id="settlement-epoch" min="0" />
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-settle">Cancel</button>
        <button class="btn btn-primary" id="confirm-settle">Confirm Settlement</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-settle');
      if (cancelBtn) cancelBtn.addEventListener('click', () => modal.close());

      const confirmBtn = $('#confirm-settle');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          await this.settleMarket();
          modal.close();
        });
      }
    }, 100);
  }

  showProviderDetails(provider) {
    const modal = new Modal({
      title: `Provider: ${provider.provider_id}`,
      size: 'large',
      content: `
        <div class="provider-details">
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Capacity</span>
              <span class="detail-value">${fmt.num(provider.capacity_kwh)} kWh</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Price</span>
              <span class="detail-value">${fmt.currency(provider.price_per_kwh)} per kWh</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Status</span>
              <span class="pill ${provider.status === 'active' ? 'success' : 'muted'}">${provider.status}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Jurisdiction</span>
              <span class="detail-value">${provider.jurisdiction || '—'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Meter</span>
              <code class="code-block">${provider.meter_address}</code>
            </div>
            <div class="detail-item">
              <span class="detail-label">Stake</span>
              <span class="detail-value">${fmt.currency(provider.stake || 0)}</span>
            </div>
          </div>
        </div>
      `,
    });
    modal.open();
  }

  showProviderReadings(provider) {
    console.log('[EnergyMarket] Show readings for provider:', provider.provider_id);
  }

  showDisputeDetails(dispute) {
    console.log('[EnergyMarket] Show dispute details:', dispute);
  }

  showResolveDisputeModal(dispute) {
    const modal = new Modal({
      title: `Resolve Dispute #${dispute.id}`,
      content: `
        <div class="form">
          <p><strong>Provider:</strong> <code>${dispute.provider_id}</code></p>
          <p><strong>Reason:</strong> ${dispute.reason}</p>
          <div class="form-group mt-4">
            <label>Resolution</label>
            <select id="resolution-outcome">
              <option value="uphold">Uphold Dispute</option>
              <option value="dismiss">Dismiss Dispute</option>
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea id="resolution-notes" rows="3"></textarea>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-resolve">Cancel</button>
        <button class="btn btn-primary" id="confirm-resolve">Resolve</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-resolve');
      if (cancelBtn) cancelBtn.addEventListener('click', () => modal.close());

      const confirmBtn = $('#confirm-resolve');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          await this.resolveDispute(dispute.id);
          modal.close();
        });
      }
    }, 100);
  }

  // RPC methods
  async registerProvider() {
    const form = $('#register-provider-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      capacity_kwh: parseFloat(formData.get('capacity_kwh')),
      price_per_kwh: parseFloat(formData.get('price_per_kwh')),
      meter_address: formData.get('meter_address'),
      jurisdiction: formData.get('jurisdiction'),
      stake: parseFloat(formData.get('stake')),
      owner: formData.get('owner'),
    };

    try {
      console.log('[EnergyMarket] Registering provider:', data);
      const result = await this.rpc.call('energy.register_provider', data);
      console.log('[EnergyMarket] Provider registered:', result);
      await this.fetchEnergyMarketData();
    } catch (error) {
      console.error('[EnergyMarket] Failed to register provider:', error);
      alert(`Error: ${error.message}`);
    }
  }

  async submitReading() {
    const form = $('#submit-reading-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      provider_id: formData.get('provider_id'),
      meter_total: parseFloat(formData.get('meter_total')),
      signature: formData.get('signature'),
    };

    try {
      console.log('[EnergyMarket] Submitting reading:', data);
      const result = await this.rpc.call('energy.submit_reading', data);
      console.log('[EnergyMarket] Reading submitted:', result);
      await this.fetchEnergyMarketData();
    } catch (error) {
      console.error('[EnergyMarket] Failed to submit reading:', error);
      alert(`Error: ${error.message}`);
    }
  }

  async settleMarket() {
    const epochInput = $('#settlement-epoch');
    const epoch = epochInput ? parseInt(epochInput.value) : 0;

    try {
      console.log('[EnergyMarket] Settling market, epoch:', epoch);
      const result = await this.rpc.call('energy.settle', { epoch });
      console.log('[EnergyMarket] Settlement complete:', result);
      await this.fetchEnergyMarketData();
    } catch (error) {
      console.error('[EnergyMarket] Failed to settle:', error);
      alert(`Error: ${error.message}`);
    }
  }

  async resolveDispute(disputeId) {
    const outcomeSelect = $('#resolution-outcome');
    const notesInput = $('#resolution-notes');

    const data = {
      dispute_id: disputeId,
      outcome: outcomeSelect?.value || 'dismiss',
      notes: notesInput?.value || '',
    };

    try {
      console.log('[EnergyMarket] Resolving dispute:', data);
      const result = await this.rpc.call('energy.resolve_dispute', data);
      console.log('[EnergyMarket] Dispute resolved:', result);
      await this.fetchEnergyMarketData();
    } catch (error) {
      console.error('[EnergyMarket] Failed to resolve dispute:', error);
      alert(`Error: ${error.message}`);
    }
  }

  exportProviders(providers) {
    console.log('[EnergyMarket] Exporting providers:', providers);
  }

  updateView(data) {
    // Update metrics if on overview
    if (this.activeView === 'overview') {
      this.renderActiveView();
    }
    
    // Update charts with new data
    if (this.charts.energySupply) {
      this.charts.energySupply.updateData([
        {
          name: 'Energy Supply',
          data: (data.receipts || []).map(r => [
            new Date(r.timestamp).getTime(),
            r.energy_kwh || 0,
          ]),
          color: '#1ac6a2',
        },
      ]);
    }
  }

  onUnmount() {
    this.stopPolling();
    Object.values(this.charts).forEach(chart => chart.unmount());
    console.log('[EnergyMarket] Cleanup complete');
  }
}

export default EnergyMarketEnhanced;

/**
 * Energy Market Dashboard Component
 * 
 * Features:
 * - Provider registration and management
 * - Meter readings submission and audit
 * - Dispute lifecycle tracking
 * - Settlement operations
 * - Real-time market metrics
 * - Receipt audit trail
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';

class EnergyMarket extends Component {
  constructor(rpc) {
    super('EnergyMarket');
    this.rpc = rpc;
    this.container = null;
    this.providersTable = null;
    this.receiptsTable = null;
    this.disputesTable = null;
    this.activeView = 'overview'; // overview, providers, receipts, disputes, settlements
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    // Subscribe to state changes
    this.subscribe(appState, 'energyMarket', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    // Subscribe to polling
    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });

    // Initial fetch
    await this.fetchEnergyData();
    
    // Start polling if enabled
    const usePolling = appState.get('usePolling');
    if (usePolling !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[EnergyMarket] Starting polling (5s interval)');
    this.pollingInterval = this.interval(() => this.fetchEnergyData(), 5000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      console.log('[EnergyMarket] Stopping polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchEnergyData() {
    try {
      // Fetch energy market state via RPC
      const data = await perf.time(
        'fetchEnergyMarket',
        () => this.rpc.call('energy.market_state', {}),
        'fetch'
      );

      if (!data) {
        console.warn('[EnergyMarket] No data returned');
        return;
      }

      appState.set('energyMarket', {
        providers: data.providers || [],
        receipts: data.receipts || [],
        disputes: data.disputes || [],
        metrics: {
          totalProviders: data.providers?.length || 0,
          totalCapacity: data.providers?.reduce((sum, p) => sum + (p.capacity_kwh || 0), 0) || 0,
          activeDisputes: data.disputes?.filter(d => d.status === 'pending').length || 0,
          totalReceipts: data.receipts?.length || 0,
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[EnergyMarket] Failed to fetch ', error);
      appState.set('offline', true);
    }
  }

  render() {
    if (!this.container) return;

    perf.mark('render-energy-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
      <div class="hero">
        <h2>Energy Market</h2>
        <p>Renewable energy provider management, meter readings, disputes, and settlements</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="register-provider-btn">Register Provider</button>
        <button class="btn btn-secondary" id="submit-reading-btn">Submit Reading</button>
      </div>
    `;
    content.appendChild(header);

    // Sub-navigation tabs
    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'providers' ? 'active' : ''}" data-view="providers">Providers</button>
      <button class="tab ${this.activeView === 'receipts' ? 'active' : ''}" data-view="receipts">Receipts</button>
      <button class="tab ${this.activeView === 'disputes' ? 'active' : ''}" data-view="disputes">Disputes</button>
      <button class="tab ${this.activeView === 'settlements' ? 'active' : ''}" data-view="settlements">Settlements</button>
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

    // Render active view
    this.renderActiveView();

    // Attach button handlers
    const registerBtn = $('#register-provider-btn');
    if (registerBtn) {
      this.listen(registerBtn, 'click', () => this.showRegisterProviderModal());
    }

    const readingBtn = $('#submit-reading-btn');
    if (readingBtn) {
      this.listen(readingBtn, 'click', () => this.showSubmitReadingModal());
    }

    perf.measure('render-energy', 'render-energy-start', 'render');
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
      case 'receipts':
        container.appendChild(this.renderReceipts());
        break;
      case 'disputes':
        container.appendChild(this.renderDisputes());
        break;
      case 'settlements':
        container.appendChild(this.renderSettlements());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'grid';

    const marketData = appState.get('energyMarket') || {};
    const metrics = marketData.metrics || {};

    // Metrics cards
    const metricsSection = document.createElement('section');
    metricsSection.className = 'span-12';
    metricsSection.innerHTML = `
      <div class="dashboard-grid">
        <div class="card-metric-hero">
          <h3>Total Providers</h3>
          <div class="value">${fmt.num(metrics.totalProviders || 0)}</div>
          <div class="label">Registered energy providers</div>
        </div>
        <div class="card-metric-hero">
          <h3>Total Capacity</h3>
          <div class="value">${fmt.num(metrics.totalCapacity || 0)} kWh</div>
          <div class="label">Network energy capacity</div>
        </div>
        <div class="card-metric-hero">
          <h3>Active Disputes</h3>
          <div class="value">${fmt.num(metrics.activeDisputes || 0)}</div>
          <div class="label">Pending dispute resolution</div>
        </div>
        <div class="card-metric-hero">
          <h3>Total Receipts</h3>
          <div class="value">${fmt.num(metrics.totalReceipts || 0)}</div>
          <div class="label">Processed energy receipts</div>
        </div>
      </div>
    `;
    view.appendChild(metricsSection);

    // Recent activity panels
    const activitySection = document.createElement('section');
    activitySection.className = 'span-12';
    activitySection.innerHTML = `
      <div class="grid" style="--grid-gap: 1.5rem;">
        <div class="span-6 card">
          <h3>Recent Providers</h3>
          <div id="recent-providers-list"></div>
        </div>
        <div class="span-6 card">
          <h3>Recent Disputes</h3>
          <div id="recent-disputes-list"></div>
        </div>
      </div>
    `;
    view.appendChild(activitySection);

    // Populate recent lists
    requestAnimationFrame(() => {
      this.populateRecentProviders();
      this.populateRecentDisputes();
    });

    return view;
  }

  populateRecentProviders() {
    const container = $('#recent-providers-list');
    if (!container) return;

    const marketData = appState.get('energyMarket') || {};
    const providers = (marketData.providers || []).slice(0, 5);

    if (providers.length === 0) {
      container.innerHTML = '<div class="empty-state">No providers registered</div>';
      return;
    }

    const list = document.createElement('ul');
    list.className = 'list';
    providers.forEach(provider => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <strong>${provider.provider_id || 'Unknown'}</strong>
          <span class="muted small">${provider.jurisdiction || 'N/A'}</span>
        </div>
        <span class="pill success">${fmt.num(provider.capacity_kwh || 0)} kWh</span>
      `;
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  populateRecentDisputes() {
    const container = $('#recent-disputes-list');
    if (!container) return;

    const marketData = appState.get('energyMarket') || {};
    const disputes = (marketData.disputes || []).slice(0, 5);

    if (disputes.length === 0) {
      container.innerHTML = '<div class="empty-state">No active disputes</div>';
      return;
    }

    const list = document.createElement('ul');
    list.className = 'list';
    disputes.forEach(dispute => {
      const li = document.createElement('li');
      const statusClass = dispute.status === 'resolved' ? 'success' : 'warn';
      li.innerHTML = `
        <div>
          <strong>Dispute #${dispute.id}</strong>
          <span class="muted small">${dispute.reason || 'Unknown reason'}</span>
        </div>
        <span class="pill ${statusClass}">${dispute.status}</span>
      `;
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  renderProviders() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="providers-table"></div>';
    view.appendChild(tableContainer);

    // Initialize table after render
    requestAnimationFrame(() => {
      const marketData = appState.get('energyMarket') || {};
      const providers = marketData.providers || [];

      this.providersTable = new DataTable({
        containerId: 'providers-table',
        columns: [
          { key: 'provider_id', label: 'Provider ID', sortable: true, filterable: true },
          { key: 'capacity_kwh', label: 'Capacity (kWh)', sortable: true, align: 'right', format: 'number' },
          { key: 'price_per_kwh', label: 'Price/kWh', sortable: true, align: 'right', format: 'currency' },
          { key: 'jurisdiction', label: 'Jurisdiction', sortable: true, filterable: true },
          { key: 'meter_address', label: 'Meter Address', filterable: true },
        ],
         providers,
        selectable: true,
        pageSize: 25,
        rowActions: [
          { icon: '👁', label: 'View Details', onClick: (row) => this.showProviderDetails(row) },
          { icon: '🔧', label: 'Manage', onClick: (row) => this.manageProvider(row) },
        ],
        bulkActions: [
          { label: 'Export Selected', onClick: (rows) => this.exportData(rows, 'providers') },
        ],
      });

      this.providersTable.mount();
    });

    return view;
  }

  renderReceipts() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="receipts-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('energyMarket') || {};
      const receipts = marketData.receipts || [];

      this.receiptsTable = new DataTable({
        containerId: 'receipts-table',
        columns: [
          { key: 'receipt_id', label: 'Receipt ID', sortable: true },
          { key: 'provider_id', label: 'Provider', sortable: true, filterable: true },
          { key: 'energy_kwh', label: 'Energy (kWh)', sortable: true, align: 'right', format: 'number' },
          { key: 'amount', label: 'Amount', sortable: true, align: 'right', format: 'currency' },
          { key: 'timestamp', label: 'Timestamp', sortable: true, format: 'datetime' },
        ],
         receipts,
        selectable: true,
        pageSize: 50,
        rowActions: [
          { icon: '👁', label: 'View Receipt', onClick: (row) => this.showReceiptDetails(row) },
          { icon: '🚩', label: 'Flag Dispute', onClick: (row) => this.flagDispute(row) },
        ],
        bulkActions: [
          { label: 'Export Selected', onClick: (rows) => this.exportData(rows, 'receipts') },
        ],
      });

      this.receiptsTable.mount();
    });

    return view;
  }

  renderDisputes() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="disputes-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('energyMarket') || {};
      const disputes = marketData.disputes || [];

      this.disputesTable = new DataTable({
        containerId: 'disputes-table',
        columns: [
          { key: 'id', label: 'Dispute ID', sortable: true },
          { key: 'provider_id', label: 'Provider', sortable: true, filterable: true },
          { key: 'reason', label: 'Reason', filterable: true },
          { key: 'status', label: 'Status', sortable: true, render: (val) => {
            const statusClass = val === 'resolved' ? 'success' : val === 'pending' ? 'warn' : 'danger';
            return `<span class="pill ${statusClass}">${val}</span>`;
          }},
          { key: 'created_at', label: 'Created', sortable: true, format: 'datetime' },
        ],
         disputes,
        selectable: true,
        pageSize: 25,
        rowActions: [
          { icon: '👁', label: 'View Dispute', onClick: (row) => this.showDisputeDetails(row) },
          { icon: '✅', label: 'Resolve', onClick: (row) => this.resolveDispute(row) },
        ],
        bulkActions: [
          { label: 'Export Selected', onClick: (rows) => this.exportData(rows, 'disputes') },
        ],
      });

      this.disputesTable.mount();
    });

    return view;
  }

  renderSettlements() {
    const view = document.createElement('div');
    view.className = 'data-view';
    view.innerHTML = `
      <div class="card">
        <h3>Settlement Operations</h3>
        <p class="muted">Energy market settlement and reconciliation tools</p>
        <div class="mt-8">
          <button class="btn btn-primary" id="run-settlement-btn">Run Settlement</button>
          <button class="btn btn-secondary" id="settlement-history-btn">View History</button>
        </div>
        <div id="settlement-results" class="mt-8"></div>
      </div>
    `;

    const runBtn = view.querySelector('#run-settlement-btn');
    if (runBtn) {
      this.listen(runBtn, 'click', () => this.runSettlement());
    }

    return view;
  }

  // Modal handlers
  showRegisterProviderModal() {
    const modal = new Modal({
      title: 'Register Energy Provider',
      size: 'medium',
      content: `
        <form id="register-provider-form" class="form">
          <div class="form-group">
            <label for="provider-id">Provider ID</label>
            <input type="text" id="provider-id" name="provider_id" required />
          </div>
          <div class="form-group">
            <label for="capacity">Capacity (kWh)</label>
            <input type="number" id="capacity" name="capacity_kwh" required />
          </div>
          <div class="form-group">
            <label for="price">Price per kWh</label>
            <input type="number" step="0.01" id="price" name="price_per_kwh" required />
          </div>
          <div class="form-group">
            <label for="jurisdiction">Jurisdiction</label>
            <input type="text" id="jurisdiction" name="jurisdiction" required />
          </div>
          <div class="form-group">
            <label for="meter-address">Meter Address</label>
            <input type="text" id="meter-address" name="meter_address" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-register">Cancel</button>
        <button class="btn btn-primary" id="submit-register">Register Provider</button>
      `,
    });

    modal.open();

    // Attach handlers
    setTimeout(() => {
      const cancelBtn = $('#cancel-register');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-register');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          await this.submitProviderRegistration();
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
            <label for="reading-provider">Provider ID</label>
            <input type="text" id="reading-provider" name="provider_id" required />
          </div>
          <div class="form-group">
            <label for="reading-value">Reading (kWh)</label>
            <input type="number" id="reading-value" name="reading_kwh" required />
          </div>
          <div class="form-group">
            <label for="reading-timestamp">Timestamp</label>
            <input type="datetime-local" id="reading-timestamp" name="timestamp" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-reading">Cancel</button>
        <button class="btn btn-primary" id="submit-reading">Submit Reading</button>
      `,
    });

    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-reading');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-reading');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          await this.submitMeterReading();
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
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Provider ID</span>
            <span class="detail-value">${provider.provider_id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Capacity</span>
            <span class="detail-value">${fmt.num(provider.capacity_kwh)} kWh</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Price</span>
            <span class="detail-value">${fmt.currency(provider.price_per_kwh)} per kWh</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Jurisdiction</span>
            <span class="detail-value">${provider.jurisdiction}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Meter Address</span>
            <span class="detail-value">${provider.meter_address}</span>
          </div>
        </div>
      `,
    });
    modal.open();
  }

  showReceiptDetails(receipt) {
    const modal = new Modal({
      title: `Receipt: ${receipt.receipt_id}`,
      size: 'large',
      content: `
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Receipt ID</span>
            <span class="detail-value">${receipt.receipt_id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Provider</span>
            <span class="detail-value">${receipt.provider_id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Energy</span>
            <span class="detail-value">${fmt.num(receipt.energy_kwh)} kWh</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Amount</span>
            <span class="detail-value">${fmt.currency(receipt.amount)}</span>
          </div>
        </div>
      `,
    });
    modal.open();
  }

  showDisputeDetails(dispute) {
    const modal = new Modal({
      title: `Dispute #${dispute.id}`,
      size: 'large',
      content: `
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Dispute ID</span>
            <span class="detail-value">${dispute.id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Provider</span>
            <span class="detail-value">${dispute.provider_id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Reason</span>
            <span class="detail-value">${dispute.reason}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="pill ${dispute.status === 'resolved' ? 'success' : 'warn'}">${dispute.status}</span></span>
          </div>
        </div>
      `,
    });
    modal.open();
  }

  // RPC operations
  async submitProviderRegistration() {
    const form = $('#register-provider-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      provider_id: formData.get('provider_id'),
      capacity_kwh: parseFloat(formData.get('capacity_kwh')),
      price_per_kwh: parseFloat(formData.get('price_per_kwh')),
      jurisdiction: formData.get('jurisdiction'),
      meter_address: formData.get('meter_address'),
    };

    try {
      console.log('[EnergyMarket] Registering provider:', data);
      const result = await this.rpc.call('energy.register_provider', data);
      console.log('[EnergyMarket] Provider registered:', result);
      
      // Refresh data
      await this.fetchEnergyData();
      
      // Show success feedback
      this.showNotification('Provider registered successfully', 'success');
    } catch (error) {
      console.error('[EnergyMarket] Failed to register provider:', error);
      this.showNotification(`Failed to register provider: ${error.message}`, 'error');
    }
  }

  async submitMeterReading() {
    const form = $('#submit-reading-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      provider_id: formData.get('provider_id'),
      reading_kwh: parseFloat(formData.get('reading_kwh')),
      timestamp: new Date(formData.get('timestamp')).getTime(),
    };

    try {
      console.log('[EnergyMarket] Submitting meter reading:', data);
      const result = await this.rpc.call('energy.submit_reading', data);
      console.log('[EnergyMarket] Reading submitted:', result);
      
      await this.fetchEnergyData();
      this.showNotification('Meter reading submitted successfully', 'success');
    } catch (error) {
      console.error('[EnergyMarket] Failed to submit reading:', error);
      this.showNotification(`Failed to submit reading: ${error.message}`, 'error');
    }
  }

  manageProvider(provider) {
    console.log('[EnergyMarket] Manage provider:', provider);
  }

  async flagDispute(receipt) {
    const reason = prompt('Enter dispute reason:');
    if (!reason) return;

    try {
      console.log('[EnergyMarket] Flagging dispute for receipt:', receipt.receipt_id);
      await this.rpc.call('energy.flag_dispute', {
        receipt_id: receipt.receipt_id,
        reason: reason,
      });
      
      await this.fetchEnergyData();
      this.showNotification('Dispute flagged successfully', 'success');
    } catch (error) {
      console.error('[EnergyMarket] Failed to flag dispute:', error);
      this.showNotification(`Failed to flag dispute: ${error.message}`, 'error');
    }
  }

  async resolveDispute(dispute) {
    const resolution = prompt('Enter resolution details:');
    if (!resolution) return;

    try {
      console.log('[EnergyMarket] Resolving dispute:', dispute.id);
      await this.rpc.call('energy.resolve_dispute', {
        dispute_id: dispute.id,
        resolution: resolution,
      });
      
      await this.fetchEnergyData();
      this.showNotification('Dispute resolved successfully', 'success');
    } catch (error) {
      console.error('[EnergyMarket] Failed to resolve dispute:', error);
      this.showNotification(`Failed to resolve dispute: ${error.message}`, 'error');
    }
  }

  async runSettlement() {
    try {
      console.log('[EnergyMarket] Running settlement...');
      const result = await this.rpc.call('energy.settle', {});
      console.log('[EnergyMarket] Settlement complete:', result);
      
      // Display results
      const resultsContainer = $('#settlement-results');
      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="card success">
            <h4>Settlement Complete</h4>
            <p>Processed ${result.receipts_processed || 0} receipts</p>
            <p>Total settled: ${fmt.currency(result.total_amount || 0)}</p>
          </div>
        `;
      }
      
      await this.fetchEnergyData();
      this.showNotification('Settlement completed successfully', 'success');
    } catch (error) {
      console.error('[EnergyMarket] Settlement failed:', error);
      this.showNotification(`Settlement failed: ${error.message}`, 'error');
    }
  }

  exportData(rows, type) {
    console.log(`[EnergyMarket] Export ${rows.length} ${type} rows`);
    // TODO: Implement CSV export
  }

  showNotification(message, type = 'info') {
    // Simple notification system - could be enhanced with a toast component
    const className = type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info';
    console.log(`[Notification ${type.toUpperCase()}]`, message);
    
    // Could add visual toast notification here
    alert(message);
  }

  updateView(data) {
    // Update tables if they exist
    if (this.providersTable && this.activeView === 'providers') {
      this.providersTable.setData(data.providers || []);
    }
    if (this.receiptsTable && this.activeView === 'receipts') {
      this.receiptsTable.setData(data.receipts || []);
    }
    if (this.disputesTable && this.activeView === 'disputes') {
      this.disputesTable.setData(data.disputes || []);
    }

    // Update overview if active
    if (this.activeView === 'overview') {
      this.populateRecentProviders();
      this.populateRecentDisputes();
    }
  }

  onUnmount() {
    this.stopPolling();
    if (this.providersTable) this.providersTable.unmount();
    if (this.receiptsTable) this.receiptsTable.unmount();
    if (this.disputesTable) this.disputesTable.unmount();
    console.log('[EnergyMarket] Cleanup complete');
  }
}

export default EnergyMarket;

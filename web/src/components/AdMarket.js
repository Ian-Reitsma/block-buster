/**
 * Ad Market Dashboard Component
 * 
 * Features:
 * - Campaign management
 * - Bid submission and tracking
 * - Cohort targeting analytics
 * - Policy snapshots
 * - Real-time marketplace metrics
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';

class AdMarket extends Component {
  constructor(rpc) {
    super('AdMarket');
    this.rpc = rpc;
    this.container = null;
    this.campaignsTable = null;
    this.bidsTable = null;
    this.activeView = 'overview'; // overview, campaigns, bids, cohorts, analytics
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    this.subscribe(appState, 'adMarket', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });

    await this.fetchAdMarketData();
    
    const usePolling = appState.get('usePolling');
    if (usePolling !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[AdMarket] Starting polling (5s interval)');
    this.pollingInterval = this.interval(() => this.fetchAdMarketData(), 5000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchAdMarketData() {
    try {
      const data = await perf.time(
        'fetchAdMarket',
        () => this.rpc.call('ad_market.policy_snapshot', {}),
        'fetch'
      );

      if (!data) {
        console.warn('[AdMarket] No data returned');
        return;
      }

      appState.set('adMarket', {
        campaigns: data.campaigns || [],
        bids: data.bids || [],
        cohorts: data.cohorts || [],
        metrics: {
          activeCampaigns: data.campaigns?.filter(c => c.status === 'active').length || 0,
          totalBids: data.bids?.length || 0,
          totalSpend: data.bids?.reduce((sum, b) => sum + (b.amount || 0), 0) || 0,
          avgCPM: data.avg_cpm || 0,
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[AdMarket] Failed to fetch ', error);
    }
  }

  render() {
    if (!this.container) return;

    const content = document.createElement('div');
    content.className = 'content';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
      <div class="hero">
        <h2>Ad Marketplace</h2>
        <p>Campaign management, bid submission, cohort targeting, and marketplace analytics</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="create-campaign-btn">Create Campaign</button>
        <button class="btn btn-secondary" id="submit-bid-btn">Submit Bid</button>
      </div>
    `;
    content.appendChild(header);

    // Tabs
    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'campaigns' ? 'active' : ''}" data-view="campaigns">Campaigns</button>
      <button class="tab ${this.activeView === 'bids' ? 'active' : ''}" data-view="bids">Bids</button>
      <button class="tab ${this.activeView === 'cohorts' ? 'active' : ''}" data-view="cohorts">Cohorts</button>
      <button class="tab ${this.activeView === 'analytics' ? 'active' : ''}" data-view="analytics">Analytics</button>
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
    viewContainer.id = 'ad-view-container';
    content.appendChild(viewContainer);

    this.container.innerHTML = '';
    this.container.appendChild(content);

    this.renderActiveView();

    const createBtn = $('#create-campaign-btn');
    if (createBtn) {
      this.listen(createBtn, 'click', () => this.showCreateCampaignModal());
    }

    const bidBtn = $('#submit-bid-btn');
    if (bidBtn) {
      this.listen(bidBtn, 'click', () => this.showSubmitBidModal());
    }
  }

  renderActiveView() {
    const container = $('#ad-view-container');
    if (!container) return;

    container.innerHTML = '';

    switch (this.activeView) {
      case 'overview':
        container.appendChild(this.renderOverview());
        break;
      case 'campaigns':
        container.appendChild(this.renderCampaigns());
        break;
      case 'bids':
        container.appendChild(this.renderBids());
        break;
      case 'cohorts':
        container.appendChild(this.renderCohorts());
        break;
      case 'analytics':
        container.appendChild(this.renderAnalytics());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'grid';

    const marketData = appState.get('adMarket') || {};
    const metrics = marketData.metrics || {};

    const metricsSection = document.createElement('section');
    metricsSection.className = 'span-12';
    metricsSection.innerHTML = `
      <div class="dashboard-grid">
        <div class="card-metric-hero">
          <h3>Active Campaigns</h3>
          <div class="value">${fmt.num(metrics.activeCampaigns || 0)}</div>
          <div class="label">Running ad campaigns</div>
        </div>
        <div class="card-metric-hero">
          <h3>Total Bids</h3>
          <div class="value">${fmt.num(metrics.totalBids || 0)}</div>
          <div class="label">Marketplace bids</div>
        </div>
        <div class="card-metric-hero">
          <h3>Total Spend</h3>
          <div class="value">${fmt.currency(metrics.totalSpend || 0)}</div>
          <div class="label">Campaign spending</div>
        </div>
        <div class="card-metric-hero">
          <h3>Avg CPM</h3>
          <div class="value">${fmt.currency(metrics.avgCPM || 0)}</div>
          <div class="label">Cost per mille</div>
        </div>
      </div>
    `;
    view.appendChild(metricsSection);

    return view;
  }

  renderCampaigns() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="campaigns-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('adMarket') || {};
      const campaigns = marketData.campaigns || [];

      this.campaignsTable = new DataTable({
        containerId: 'campaigns-table',
        columns: [
          { key: 'id', label: 'Campaign ID', sortable: true },
          { key: 'name', label: 'Name', sortable: true, filterable: true },
          { key: 'budget', label: 'Budget', sortable: true, align: 'right', format: 'currency' },
          { key: 'spent', label: 'Spent', sortable: true, align: 'right', format: 'currency' },
          { key: 'impressions', label: 'Impressions', sortable: true, align: 'right', format: 'number' },
          { key: 'status', label: 'Status', sortable: true, render: (val) => {
            const statusClass = val === 'active' ? 'success' : val === 'paused' ? 'warn' : 'muted';
            return `<span class="pill ${statusClass}">${val}</span>`;
          }},
        ],
         campaigns,
        selectable: true,
        pageSize: 25,
        rowActions: [
          { icon: '👁', label: 'View', onClick: (row) => this.viewCampaign(row) },
          { icon: '✏️', label: 'Edit', onClick: (row) => this.editCampaign(row) },
          { icon: '⏸', label: 'Pause', onClick: (row) => this.pauseCampaign(row) },
        ],
        bulkActions: [
          { label: 'Pause Selected', onClick: (rows) => this.bulkPauseCampaigns(rows) },
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'campaigns') },
        ],
      });

      this.campaignsTable.mount();
    });

    return view;
  }

  renderBids() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="bids-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('adMarket') || {};
      const bids = marketData.bids || [];

      this.bidsTable = new DataTable({
        containerId: 'bids-table',
        columns: [
          { key: 'id', label: 'Bid ID', sortable: true },
          { key: 'campaign_id', label: 'Campaign', sortable: true, filterable: true },
          { key: 'cohort', label: 'Cohort', sortable: true, filterable: true },
          { key: 'amount', label: 'Bid Amount', sortable: true, align: 'right', format: 'currency' },
          { key: 'cpm', label: 'CPM', sortable: true, align: 'right', format: 'currency' },
          { key: 'timestamp', label: 'Timestamp', sortable: true, format: 'datetime' },
        ],
         bids,
        selectable: true,
        pageSize: 50,
        rowActions: [
          { icon: '👁', label: 'View', onClick: (row) => this.viewBid(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'bids') },
        ],
      });

      this.bidsTable.mount();
    });

    return view;
  }

  renderCohorts() {
    const view = document.createElement('div');
    view.className = 'data-view';
    view.innerHTML = `
      <div class="card">
        <h3>Audience Cohorts</h3>
        <p class="muted">Targeting segments and audience analytics</p>
        <div id="cohorts-list" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  renderAnalytics() {
    const view = document.createElement('div');
    view.className = 'grid';
    view.innerHTML = `
      <div class="span-12 card">
        <h3>Marketplace Analytics</h3>
        <p class="muted">Performance metrics and marketplace insights</p>
        <div id="analytics-charts" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  showCreateCampaignModal() {
    const modal = new Modal({
      title: 'Create Ad Campaign',
      size: 'medium',
      content: `
        <form id="create-campaign-form" class="form">
          <div class="form-group">
            <label>Campaign Name</label>
            <input type="text" name="name" required />
          </div>
          <div class="form-group">
            <label>Budget</label>
            <input type="number" name="budget" step="0.01" required />
          </div>
          <div class="form-group">
            <label>Target Cohort</label>
            <input type="text" name="cohort" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-campaign">Cancel</button>
        <button class="btn btn-primary" id="submit-campaign">Create</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-campaign');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-campaign');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          await this.createCampaign();
          modal.close();
        });
      }
    }, 100);
  }

  showSubmitBidModal() {
    const modal = new Modal({
      title: 'Submit Bid',
      size: 'medium',
      content: `
        <form id="submit-bid-form" class="form">
          <div class="form-group">
            <label>Campaign ID</label>
            <input type="text" name="campaign_id" required />
          </div>
          <div class="form-group">
            <label>Cohort</label>
            <input type="text" name="cohort" required />
          </div>
          <div class="form-group">
            <label>Bid Amount</label>
            <input type="number" name="amount" step="0.01" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-bid">Cancel</button>
        <button class="btn btn-primary" id="submit-bid">Submit Bid</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-bid');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-bid');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          await this.submitBid();
          modal.close();
        });
      }
    }, 100);
  }

  async createCampaign() {
    const form = $('#create-campaign-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      budget: parseFloat(formData.get('budget')),
      cohort: formData.get('cohort'),
    };

    try {
      console.log('[AdMarket] Creating campaign:', data);
      const result = await this.rpc.call('ad_market.create_campaign', data);
      console.log('[AdMarket] Campaign created:', result);
      
      await this.fetchAdMarketData();
      this.showNotification('Campaign created successfully', 'success');
    } catch (error) {
      console.error('[AdMarket] Failed to create campaign:', error);
      this.showNotification(`Failed to create campaign: ${error.message}`, 'error');
    }
  }

  async submitBid() {
    const form = $('#submit-bid-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      campaign_id: formData.get('campaign_id'),
      cohort: formData.get('cohort'),
      amount: parseFloat(formData.get('amount')),
    };

    try {
      console.log('[AdMarket] Submitting bid:', data);
      const result = await this.rpc.call('ad_market.submit_bid', data);
      console.log('[AdMarket] Bid submitted:', result);
      
      await this.fetchAdMarketData();
      this.showNotification('Bid submitted successfully', 'success');
    } catch (error) {
      console.error('[AdMarket] Failed to submit bid:', error);
      this.showNotification(`Failed to submit bid: ${error.message}`, 'error');
    }
  }

  viewCampaign(campaign) {
    console.log('[AdMarket] View campaign:', campaign);
  }

  editCampaign(campaign) {
    console.log('[AdMarket] Edit campaign:', campaign);
  }

  async pauseCampaign(campaign) {
    try {
      console.log('[AdMarket] Pausing campaign:', campaign.id);
      await this.rpc.call('ad_market.pause_campaign', { campaign_id: campaign.id });
      
      await this.fetchAdMarketData();
      this.showNotification('Campaign paused', 'success');
    } catch (error) {
      console.error('[AdMarket] Failed to pause campaign:', error);
      this.showNotification(`Failed to pause campaign: ${error.message}`, 'error');
    }
  }

  async bulkPauseCampaigns(campaigns) {
    try {
      console.log('[AdMarket] Bulk pausing campaigns:', campaigns.length);
      const campaignIds = campaigns.map(c => c.id);
      await this.rpc.call('ad_market.bulk_pause', { campaign_ids: campaignIds });
      
      await this.fetchAdMarketData();
      this.showNotification(`${campaigns.length} campaigns paused`, 'success');
    } catch (error) {
      console.error('[AdMarket] Failed to bulk pause:', error);
      this.showNotification(`Failed to pause campaigns: ${error.message}`, 'error');
    }
  }

  viewBid(bid) {
    console.log('[AdMarket] View bid:', bid);
  }

  exportData(rows, type) {
    console.log(`[AdMarket] Export ${rows.length} ${type}`);
  }

  showNotification(message, type = 'info') {
    console.log(`[Notification ${type.toUpperCase()}]`, message);
    alert(message);
  }

  updateView(data) {
    if (this.campaignsTable && this.activeView === 'campaigns') {
      this.campaignsTable.setData(data.campaigns || []);
    }
    if (this.bidsTable && this.activeView === 'bids') {
      this.bidsTable.setData(data.bids || []);
    }
  }

  onUnmount() {
    this.stopPolling();
    if (this.campaignsTable) this.campaignsTable.unmount();
    if (this.bidsTable) this.bidsTable.unmount();
  }
}

export default AdMarket;

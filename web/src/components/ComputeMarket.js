/**
 * Compute Market Dashboard Component
 * 
 * Features:
 * - Job submission and tracking
 * - Receipt management
 * - SLA monitoring
 * - Provider performance metrics
 * - Settlement auditing
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';
import { Capabilities } from '../capabilities.js';

class ComputeMarket extends Component {
  constructor(rpc) {
    super('ComputeMarket');
    this.rpc = rpc;
    this.container = null;
    this.jobsTable = null;
    this.receiptsTable = null;
    this.activeView = 'overview';
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    this.subscribe(appState, 'computeMarket', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) this.startPolling();
      else this.stopPolling();
    });

    await this.fetchComputeData();
    if (appState.get('usePolling') !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[ComputeMarket] Starting polling');
    this.pollingInterval = this.interval(() => this.fetchComputeData(), 5000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchComputeData() {
    try {
      const data = await perf.time(
        'fetchComputeMarket',
        () => this.rpc.call('compute_market.jobs', {}),
        'fetch'
      );

      if (!data) return;

      appState.set('computeMarket', {
        jobs: data.jobs || [],
        receipts: data.receipts || [],
        providers: data.providers || [],
        metrics: {
          totalJobs: data.jobs?.length || 0,
          activeJobs: data.jobs?.filter(j => j.status === 'running').length || 0,
          completedJobs: data.jobs?.filter(j => j.status === 'completed').length || 0,
          totalCompute: data.total_compute_units || 0,
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[ComputeMarket] Failed to fetch:', error);
    }
  }

  render() {
    if (!this.container) return;

    const content = document.createElement('div');
    content.className = 'content';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
      <div class="hero">
        <h2>Compute Marketplace</h2>
        <p>Distributed compute job management, SLA tracking, and settlement auditing</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="submit-job-btn">Submit Job</button>
        <button class="btn btn-secondary" id="audit-receipts-btn">Audit Receipts</button>
      </div>
    `;
    content.appendChild(header);

    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'jobs' ? 'active' : ''}" data-view="jobs">Jobs</button>
      <button class="tab ${this.activeView === 'receipts' ? 'active' : ''}" data-view="receipts">Receipts</button>
      <button class="tab ${this.activeView === 'providers' ? 'active' : ''}" data-view="providers">Providers</button>
      <button class="tab ${this.activeView === 'sla' ? 'active' : ''}" data-view="sla">SLA Monitor</button>
    `;
    tabs.querySelectorAll('.tab').forEach(tab => {
      this.listen(tab, 'click', (e) => {
        this.activeView = e.target.dataset.view;
        this.render();
      });
    });
    content.appendChild(tabs);

    const viewContainer = document.createElement('div');
    viewContainer.className = 'view-container';
    viewContainer.id = 'compute-view-container';
    content.appendChild(viewContainer);

    this.container.innerHTML = '';
    this.container.appendChild(content);
    this.renderActiveView();

    const submitBtn = $('#submit-job-btn');
    if (submitBtn) {
      Capabilities.bindButton(submitBtn, 'compute', 'settlement');
      this.listen(submitBtn, 'click', () => this.showSubmitJobModal());
    }
  }

  renderActiveView() {
    const container = $('#compute-view-container');
    if (!container) return;
    container.innerHTML = '';

    switch (this.activeView) {
      case 'overview':
        container.appendChild(this.renderOverview());
        break;
      case 'jobs':
        container.appendChild(this.renderJobs());
        break;
      case 'receipts':
        container.appendChild(this.renderReceipts());
        break;
      case 'providers':
        container.appendChild(this.renderProviders());
        break;
      case 'sla':
        container.appendChild(this.renderSLA());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'grid';

    const marketData = appState.get('computeMarket') || {};
    const metrics = marketData.metrics || {};

    const metricsSection = document.createElement('section');
    metricsSection.className = 'span-12';
    metricsSection.innerHTML = `
      <div class="dashboard-grid">
        <div class="card-metric-hero">
          <h3>Total Jobs</h3>
          <div class="value">${fmt.num(metrics.totalJobs || 0)}</div>
          <div class="label">All submitted jobs</div>
        </div>
        <div class="card-metric-hero">
          <h3>Active Jobs</h3>
          <div class="value">${fmt.num(metrics.activeJobs || 0)}</div>
          <div class="label">Currently running</div>
        </div>
        <div class="card-metric-hero">
          <h3>Completed</h3>
          <div class="value">${fmt.num(metrics.completedJobs || 0)}</div>
          <div class="label">Successfully finished</div>
        </div>
        <div class="card-metric-hero">
          <h3>Compute Units</h3>
          <div class="value">${fmt.num(metrics.totalCompute || 0)}</div>
          <div class="label">Total compute processed</div>
        </div>
      </div>
    `;
    view.appendChild(metricsSection);

    return view;
  }

  renderJobs() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="jobs-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('computeMarket') || {};
      const jobs = marketData.jobs || [];

      this.jobsTable = new DataTable({
        containerId: 'jobs-table',
        columns: [
          { key: 'id', label: 'Job ID', sortable: true },
          { key: 'submitter', label: 'Submitter', sortable: true, filterable: true },
          { key: 'compute_units', label: 'Compute Units', sortable: true, align: 'right', format: 'number' },
          { key: 'status', label: 'Status', sortable: true, render: (val) => {
            const statusClass = val === 'completed' ? 'success' : val === 'running' ? 'warn' : 'muted';
            return `<span class="pill ${statusClass}">${val}</span>`;
          }},
          { key: 'submitted_at', label: 'Submitted', sortable: true, format: 'datetime' },
        ],
          jobs,
        selectable: true,
        pageSize: 50,
        rowActions: [
          { icon: '👁', label: 'View', onClick: (row) => this.viewJob(row) },
          { icon: '❌', label: 'Cancel', onClick: (row) => this.cancelJob(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'jobs') },
        ],
      });

      this.jobsTable.mount();
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
      const marketData = appState.get('computeMarket') || {};
      const receipts = marketData.receipts || [];

      this.receiptsTable = new DataTable({
        containerId: 'receipts-table',
        columns: [
          { key: 'id', label: 'Receipt ID', sortable: true },
          { key: 'job_id', label: 'Job ID', sortable: true, filterable: true },
          { key: 'provider', label: 'Provider', sortable: true, filterable: true },
          { key: 'amount', label: 'Amount', sortable: true, align: 'right', format: 'currency' },
          { key: 'timestamp', label: 'Timestamp', sortable: true, format: 'datetime' },
        ],
          receipts,
        selectable: true,
        pageSize: 50,
        rowActions: [
          { icon: '👁', label: 'View', onClick: (row) => this.viewReceipt(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'receipts') },
        ],
      });

      this.receiptsTable.mount();
    });

    return view;
  }

  renderProviders() {
    const view = document.createElement('div');
    view.innerHTML = `
      <div class="card">
        <h3>Compute Providers</h3>
        <p class="muted">Provider performance and availability metrics</p>
      </div>
    `;
    return view;
  }

  renderSLA() {
    const view = document.createElement('div');
    view.innerHTML = `
      <div class="card">
        <h3>SLA Monitoring</h3>
        <p class="muted">Service level agreement tracking and compliance metrics</p>
      </div>
    `;
    return view;
  }

  showSubmitJobModal() {
    const modal = new Modal({
      title: 'Submit Compute Job',
      size: 'medium',
      content: `
        <form id="submit-job-form" class="form">
          <div class="form-group">
            <label>Job Type</label>
            <select name="job_type" required>
              <option value="ml_training">ML Training</option>
              <option value="data_processing">Data Processing</option>
              <option value="rendering">Rendering</option>
            </select>
          </div>
          <div class="form-group">
            <label>Compute Units</label>
            <input type="number" name="compute_units" required />
          </div>
          <div class="form-group">
            <label>Max Budget</label>
            <input type="number" name="budget" step="0.01" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-job">Cancel</button>
        <button class="btn btn-primary" id="submit-job">Submit</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-job');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-job');
      if (submitBtn) {
        Capabilities.bindButton(submitBtn, 'compute', 'settlement');
        submitBtn.addEventListener('click', async () => {
          await this.submitJob();
          modal.close();
        });
      }
    }, 100);
  }

  async submitJob() {
    const form = $('#submit-job-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      job_type: formData.get('job_type'),
      compute_units: parseInt(formData.get('compute_units')),
      budget: parseFloat(formData.get('budget')),
    };

    try {
      console.log('[ComputeMarket] Submitting job:', data);
      const result = await this.rpc.call('compute_market.submit_job', data);
      console.log('[ComputeMarket] Job submitted:', result);
      
      await this.fetchComputeData();
      this.showNotification(`Job submitted successfully. Job ID: ${result.job_id}`, 'success');
    } catch (error) {
      console.error('[ComputeMarket] Failed to submit job:', error);
      this.showNotification(`Failed to submit job: ${error.message}`, 'error');
    }
  }

  viewJob(job) {
    console.log('[ComputeMarket] View job:', job);
  }

  async cancelJob(job) {
    if (!confirm(`Cancel job ${job.id}?`)) return;

    try {
      console.log('[ComputeMarket] Cancelling job:', job.id);
      await this.rpc.call('compute_market.cancel_job', { job_id: job.id });
      
      await this.fetchComputeData();
      this.showNotification('Job cancelled', 'success');
    } catch (error) {
      console.error('[ComputeMarket] Failed to cancel job:', error);
      this.showNotification(`Failed to cancel job: ${error.message}`, 'error');
    }
  }

  viewReceipt(receipt) {
    console.log('[ComputeMarket] View receipt:', receipt);
  }

  exportData(rows, type) {
    console.log(`[ComputeMarket] Export ${rows.length} ${type}`);
  }

  showNotification(message, type = 'info') {
    console.log(`[Notification ${type.toUpperCase()}]`, message);
    alert(message);
  }

  updateView(data) {
    if (this.jobsTable && this.activeView === 'jobs') {
      this.jobsTable.setData(data.jobs || []);
    }
    if (this.receiptsTable && this.activeView === 'receipts') {
      this.receiptsTable.setData(data.receipts || []);
    }
  }

  onUnmount() {
    this.stopPolling();
    if (this.jobsTable) this.jobsTable.unmount();
    if (this.receiptsTable) this.receiptsTable.unmount();
  }
}

export default ComputeMarket;

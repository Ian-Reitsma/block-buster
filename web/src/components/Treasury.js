/**
 * Treasury Dashboard Component
 * 
 * Features:
 * - Balance tracking
 * - Disbursement management
 * - Spending proposals
 * - Transaction history
 * - Budget analytics
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { Capabilities } from '../capabilities.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';

class Treasury extends Component {
  constructor(rpc) {
    super('Treasury');
    this.rpc = rpc;
    this.container = null;
    this.disbursementsTable = null;
    this.transactionsTable = null;
    this.activeView = 'overview';
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    this.subscribe(appState, 'treasury', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) this.startPolling();
      else this.stopPolling();
    });

    await this.fetchTreasuryData();
    if (appState.get('usePolling') !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[Treasury] Starting polling');
    this.pollingInterval = this.interval(() => this.fetchTreasuryData(), 10000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchTreasuryData() {
    try {
      const data = await perf.time(
        'fetchTreasury',
        () => this.rpc.call('treasury.balance', {}),
        'fetch'
      );

      if (!data) return;

      appState.set('treasury', {
        balance: data.balance || 0,
        disbursements: data.disbursements || [],
        transactions: data.transactions || [],
        metrics: {
          totalBalance: data.balance || 0,
          totalDisbursed: data.disbursements?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0,
          pendingDisbursements: data.disbursements?.filter(d => d.status === 'pending').length || 0,
          monthlySpend: this.calculateMonthlySpend(data.disbursements || []),
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[Treasury] Failed to fetch:', error);
    }
  }

  calculateMonthlySpend(disbursements) {
    const now = Date.now();
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
    return disbursements
      .filter(d => d.timestamp && d.timestamp >= monthAgo && d.status === 'completed')
      .reduce((sum, d) => sum + (d.amount || 0), 0);
  }

  render() {
    if (!this.container) return;

    const content = document.createElement('div');
    content.className = 'content';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
      <div class="hero">
        <h2>Treasury</h2>
        <p>Network treasury management, disbursements, and spending analytics</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="new-disbursement-btn">New Disbursement</button>
        <button class="btn btn-secondary" id="audit-treasury-btn">Audit Trail</button>
      </div>
    `;
    content.appendChild(header);

    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'disbursements' ? 'active' : ''}" data-view="disbursements">Disbursements</button>
      <button class="tab ${this.activeView === 'transactions' ? 'active' : ''}" data-view="transactions">Transactions</button>
      <button class="tab ${this.activeView === 'budget' ? 'active' : ''}" data-view="budget">Budget</button>
      <button class="tab ${this.activeView === 'analytics' ? 'active' : ''}" data-view="analytics">Analytics</button>
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
    viewContainer.id = 'treasury-view-container';
    content.appendChild(viewContainer);

    this.container.innerHTML = '';
    this.container.appendChild(content);
    this.renderActiveView();

    const disbursementBtn = $('#new-disbursement-btn');
    if (disbursementBtn) {
      this.listen(disbursementBtn, 'click', () => this.showDisbursementModal());
      Capabilities.bindButton(disbursementBtn, 'global', 'mutation');
    }

    const auditBtn = $('#audit-treasury-btn');
    if (auditBtn) this.listen(auditBtn, 'click', () => this.showAuditModal());
  }

  renderActiveView() {
    const container = $('#treasury-view-container');
    if (!container) return;
    container.innerHTML = '';

    switch (this.activeView) {
      case 'overview':
        container.appendChild(this.renderOverview());
        break;
      case 'disbursements':
        container.appendChild(this.renderDisbursements());
        break;
      case 'transactions':
        container.appendChild(this.renderTransactions());
        break;
      case 'budget':
        container.appendChild(this.renderBudget());
        break;
      case 'analytics':
        container.appendChild(this.renderAnalytics());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'grid';

    const treasuryData = appState.get('treasury') || {};
    const metrics = treasuryData.metrics || {};

    const metricsSection = document.createElement('section');
    metricsSection.className = 'span-12';
    metricsSection.innerHTML = `
      <div class="dashboard-grid">
        <div class="card-metric-hero">
          <h3>Treasury Balance</h3>
          <div class="value">${fmt.currency(metrics.totalBalance || 0)} BLOCK</div>
          <div class="label">Available funds</div>
        </div>
        <div class="card-metric-hero">
          <h3>Total Disbursed</h3>
          <div class="value">${fmt.currency(metrics.totalDisbursed || 0)} BLOCK</div>
          <div class="label">All-time spending</div>
        </div>
        <div class="card-metric-hero">
          <h3>Pending Disbursements</h3>
          <div class="value">${fmt.num(metrics.pendingDisbursements || 0)}</div>
          <div class="label">Awaiting approval</div>
        </div>
        <div class="card-metric-hero">
          <h3>30-Day Spend</h3>
          <div class="value">${fmt.currency(metrics.monthlySpend || 0)} BLOCK</div>
          <div class="label">Recent spending</div>
        </div>
      </div>
    `;
    view.appendChild(metricsSection);

    // Recent disbursements
    const recentSection = document.createElement('section');
    recentSection.className = 'span-12';
    recentSection.innerHTML = `
      <div class="card">
        <h3>Recent Disbursements</h3>
        <div id="recent-disbursements-list" class="mt-4"></div>
      </div>
    `;
    view.appendChild(recentSection);

    requestAnimationFrame(() => this.populateRecentDisbursements());

    return view;
  }

  populateRecentDisbursements() {
    const container = $('#recent-disbursements-list');
    if (!container) return;

    const treasuryData = appState.get('treasury') || {};
    const disbursements = (treasuryData.disbursements || []).slice(0, 5);

    if (disbursements.length === 0) {
      container.innerHTML = '<div class="empty-state">No recent disbursements</div>';
      return;
    }

    const list = document.createElement('ul');
    list.className = 'list';
    disbursements.forEach(disbursement => {
      const li = document.createElement('li');
      const statusClass = disbursement.status === 'completed' ? 'success' : disbursement.status === 'pending' ? 'warn' : 'danger';
      li.innerHTML = `
        <div>
          <strong>${fmt.currency(disbursement.amount || 0)} BLOCK</strong>
          <span class="muted small">to ${disbursement.recipient || 'Unknown'}</span>
        </div>
        <span class="pill ${statusClass}">${disbursement.status}</span>
      `;
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  renderDisbursements() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="disbursements-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const treasuryData = appState.get('treasury') || {};
      const disbursements = treasuryData.disbursements || [];

      this.disbursementsTable = new DataTable({
        containerId: 'disbursements-table',
        columns: [
          { key: 'id', label: 'ID', sortable: true, width: 80 },
          { key: 'recipient', label: 'Recipient', sortable: true, filterable: true },
          { key: 'amount', label: 'Amount', sortable: true, align: 'right', render: (val) => `${fmt.currency(val)} BLOCK` },
          { key: 'purpose', label: 'Purpose', sortable: true, filterable: true },
          { key: 'status', label: 'Status', sortable: true, render: (val) => {
            const statusClass = val === 'completed' ? 'success' : val === 'pending' ? 'warn' : 'danger';
            return `<span class="pill ${statusClass}">${val}</span>`;
          }},
          { key: 'created_at', label: 'Created', sortable: true, format: 'datetime' },
        ],
          disbursements,
        selectable: true,
        pageSize: 50,
        rowActions: [
          { icon: '👁', label: 'View Details', onClick: (row) => this.viewDisbursement(row) },
          { icon: '✅', label: 'Approve', onClick: (row) => this.approveDisbursement(row) },
          { icon: '❌', label: 'Reject', onClick: (row) => this.rejectDisbursement(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'disbursements') },
        ],
      });

      this.disbursementsTable.mount();
    });

    return view;
  }

  renderTransactions() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="transactions-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const treasuryData = appState.get('treasury') || {};
      const transactions = treasuryData.transactions || [];

      this.transactionsTable = new DataTable({
        containerId: 'transactions-table',
        columns: [
          { key: 'txid', label: 'Transaction ID', sortable: true, filterable: true },
          { key: 'type', label: 'Type', sortable: true, filterable: true },
          { key: 'amount', label: 'Amount', sortable: true, align: 'right', render: (val) => `${fmt.currency(val)} BLOCK` },
          { key: 'counterparty', label: 'Counterparty', sortable: true, filterable: true },
          { key: 'timestamp', label: 'Timestamp', sortable: true, format: 'datetime' },
        ],
          transactions,
        selectable: true,
        pageSize: 100,
        rowActions: [
          { icon: '👁', label: 'View Transaction', onClick: (row) => this.viewTransaction(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'transactions') },
        ],
      });

      this.transactionsTable.mount();
    });

    return view;
  }

  renderBudget() {
    const view = document.createElement('div');
    view.className = 'grid';
    view.innerHTML = `
      <div class="span-12 card">
        <h3>Budget Planning</h3>
        <p class="muted">Allocate treasury funds across network initiatives and operations</p>
        <div id="budget-allocations" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  renderAnalytics() {
    const view = document.createElement('div');
    view.className = 'grid';
    view.innerHTML = `
      <div class="span-12 card">
        <h3>Treasury Analytics</h3>
        <p class="muted">Spending trends, burn rate, and treasury health metrics</p>
        <div id="analytics-charts" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  showDisbursementModal() {
    const modal = new Modal({
      title: 'Create Treasury Disbursement',
      size: 'medium',
      content: `
        <form id="disbursement-form" class="form">
          <div class="form-group">
            <label>Recipient Address</label>
            <input type="text" name="recipient" required />
          </div>
          <div class="form-group">
            <label>Amount (BLOCK)</label>
            <input type="number" name="amount" step="0.01" required />
          </div>
          <div class="form-group">
            <label>Purpose</label>
            <textarea name="purpose" required rows="4"></textarea>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select name="category" required>
              <option value="development">Development</option>
              <option value="marketing">Marketing</option>
              <option value="operations">Operations</option>
              <option value="grants">Grants</option>
              <option value="other">Other</option>
            </select>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-disbursement">Cancel</button>
        <button class="btn btn-primary" id="submit-disbursement">Submit for Approval</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-disbursement');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-disbursement');
      if (submitBtn) {
        Capabilities.bindButton(submitBtn, 'global', 'mutation');
        submitBtn.addEventListener('click', async () => {
          await this.createDisbursement();
          modal.close();
        });
      }
    }, 100);
  }

  showAuditModal() {
    const modal = new Modal({
      title: 'Treasury Audit Trail',
      size: 'large',
      content: `
        <div class="audit-trail">
          <p class="muted">Complete transaction history and audit logs</p>
          <div id="audit-content" class="mt-4">Loading audit trail...</div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="export-audit">Export Audit</button>
        <button class="btn btn-primary" id="close-audit">Close</button>
      `,
    });
    modal.open();
  }

  async createDisbursement() {
    const check = Capabilities.canPerformAction('global', 'mutation');
    if (!check.allowed) {
      this.showNotification(check.reason, 'error');
      return;
    }
    const form = $('#disbursement-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      recipient: formData.get('recipient'),
      amount: parseFloat(formData.get('amount')),
      purpose: formData.get('purpose'),
      category: formData.get('category'),
    };

    try {
      console.log('[Treasury] Creating disbursement:', data);
      const result = await this.rpc.call('treasury.create_disbursement', data);
      console.log('[Treasury] Disbursement created:', result);
      
      await this.fetchTreasuryData();
      this.showNotification(`Disbursement created successfully. ID: ${result.disbursement_id}`, 'success');
    } catch (error) {
      console.error('[Treasury] Failed to create disbursement:', error);
      this.showNotification(`Failed to create disbursement: ${error.message}`, 'error');
    }
  }

  viewDisbursement(disbursement) {
    const modal = new Modal({
      title: `Disbursement #${disbursement.id}`,
      size: 'large',
      content: `
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Disbursement ID</span>
            <span class="detail-value">${disbursement.id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Recipient</span>
            <span class="detail-value">${disbursement.recipient}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Amount</span>
            <span class="detail-value">${fmt.currency(disbursement.amount)} BLOCK</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="pill ${disbursement.status === 'completed' ? 'success' : 'warn'}">${disbursement.status}</span></span>
          </div>
        </div>
        <div class="mt-8">
          <h4>Purpose</h4>
          <p class="mt-2">${disbursement.purpose || 'No purpose specified'}</p>
        </div>
      `,
    });
    modal.open();
  }

  async approveDisbursement(disbursement) {
    const check = Capabilities.canPerformAction('global', 'settlement');
    if (!check.allowed) {
      this.showNotification(check.reason, 'error');
      return;
    }
    if (!confirm(`Approve disbursement #${disbursement.id} for ${fmt.currency(disbursement.amount)} BLOCK?`)) return;

    try {
      console.log('[Treasury] Approving disbursement:', disbursement.id);
      await this.rpc.call('treasury.approve', {
        disbursement_id: disbursement.id,
      });
      
      await this.fetchTreasuryData();
      this.showNotification('Disbursement approved', 'success');
    } catch (error) {
      console.error('[Treasury] Failed to approve:', error);
      this.showNotification(`Failed to approve disbursement: ${error.message}`, 'error');
    }
  }

  async rejectDisbursement(disbursement) {
    const check = Capabilities.canPerformAction('global', 'settlement');
    if (!check.allowed) {
      this.showNotification(check.reason, 'error');
      return;
    }
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      console.log('[Treasury] Rejecting disbursement:', disbursement.id);
      await this.rpc.call('treasury.reject', {
        disbursement_id: disbursement.id,
        reason: reason,
      });
      
      await this.fetchTreasuryData();
      this.showNotification('Disbursement rejected', 'success');
    } catch (error) {
      console.error('[Treasury] Failed to reject:', error);
      this.showNotification(`Failed to reject disbursement: ${error.message}`, 'error');
    }
  }

  viewTransaction(transaction) {
    console.log('[Treasury] View transaction:', transaction.txid);
  }

  exportData(rows, type) {
    console.log(`[Treasury] Export ${rows.length} ${type}`);
  }

  showNotification(message, type = 'info') {
    console.log(`[Notification ${type.toUpperCase()}]`, message);
    alert(message);
  }

  updateView(data) {
    if (this.disbursementsTable && this.activeView === 'disbursements') {
      this.disbursementsTable.setData(data.disbursements || []);
    }
    if (this.transactionsTable && this.activeView === 'transactions') {
      this.transactionsTable.setData(data.transactions || []);
    }
    if (this.activeView === 'overview') {
      this.populateRecentDisbursements();
    }
  }

  onUnmount() {
    this.stopPolling();
    if (this.disbursementsTable) this.disbursementsTable.unmount();
    if (this.transactionsTable) this.transactionsTable.unmount();
  }
}

export default Treasury;

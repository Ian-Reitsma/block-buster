/**
 * Governance Dashboard Component
 * 
 * Features:
 * - Proposal creation and voting
 * - Parameter management
 * - Voting power tracking
 * - Proposal lifecycle monitoring
 * - Governance analytics
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { Capabilities } from '../capabilities.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';

class Governance extends Component {
  constructor(rpc) {
    super('Governance');
    this.rpc = rpc;
    this.container = null;
    this.proposalsTable = null;
    this.activeView = 'overview';
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    this.subscribe(appState, 'governance', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) this.startPolling();
      else this.stopPolling();
    });

    await this.fetchGovernanceData();
    if (appState.get('usePolling') !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[Governance] Starting polling');
    this.pollingInterval = this.interval(() => this.fetchGovernanceData(), 10000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchGovernanceData() {
    try {
      const data = await perf.time(
        'fetchGovernance',
        () => this.rpc.call('governance.proposals', {}),
        'fetch'
      );

      if (!data) return;

      appState.set('governance', {
        proposals: data.proposals || [],
        parameters: data.parameters || {},
        votingPower: data.voting_power || {},
        metrics: {
          totalProposals: data.proposals?.length || 0,
          activeProposals: data.proposals?.filter(p => p.status === 'active').length || 0,
          passedProposals: data.proposals?.filter(p => p.status === 'passed').length || 0,
          totalVotingPower: data.total_voting_power || 0,
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[Governance] Failed to fetch:', error);
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
        <h2>Governance</h2>
        <p>Create proposals, vote on network changes, and manage protocol parameters</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="create-proposal-btn">Create Proposal</button>
        <button class="btn btn-secondary" id="view-params-btn">View Parameters</button>
      </div>
    `;
    content.appendChild(header);

    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'proposals' ? 'active' : ''}" data-view="proposals">Proposals</button>
      <button class="tab ${this.activeView === 'voting' ? 'active' : ''}" data-view="voting">My Votes</button>
      <button class="tab ${this.activeView === 'parameters' ? 'active' : ''}" data-view="parameters">Parameters</button>
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
    viewContainer.id = 'governance-view-container';
    content.appendChild(viewContainer);

    this.container.innerHTML = '';
    this.container.appendChild(content);
    this.renderActiveView();

    const createBtn = $('#create-proposal-btn');
    if (createBtn) {
      this.listen(createBtn, 'click', () => this.showCreateProposalModal());
      Capabilities.bindButton(createBtn, 'global', 'settlement');
    }

    const paramsBtn = $('#view-params-btn');
    if (paramsBtn) this.listen(paramsBtn, 'click', () => this.showParametersModal());
  }

  renderActiveView() {
    const container = $('#governance-view-container');
    if (!container) return;
    container.innerHTML = '';

    switch (this.activeView) {
      case 'overview':
        container.appendChild(this.renderOverview());
        break;
      case 'proposals':
        container.appendChild(this.renderProposals());
        break;
      case 'voting':
        container.appendChild(this.renderMyVotes());
        break;
      case 'parameters':
        container.appendChild(this.renderParameters());
        break;
      case 'analytics':
        container.appendChild(this.renderAnalytics());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'grid';

    const govData = appState.get('governance') || {};
    const metrics = govData.metrics || {};

    const metricsSection = document.createElement('section');
    metricsSection.className = 'span-12';
    metricsSection.innerHTML = `
      <div class="dashboard-grid">
        <div class="card-metric-hero">
          <h3>Total Proposals</h3>
          <div class="value">${fmt.num(metrics.totalProposals || 0)}</div>
          <div class="label">All governance proposals</div>
        </div>
        <div class="card-metric-hero">
          <h3>Active Proposals</h3>
          <div class="value">${fmt.num(metrics.activeProposals || 0)}</div>
          <div class="label">Open for voting</div>
        </div>
        <div class="card-metric-hero">
          <h3>Passed Proposals</h3>
          <div class="value">${fmt.num(metrics.passedProposals || 0)}</div>
          <div class="label">Successfully enacted</div>
        </div>
        <div class="card-metric-hero">
          <h3>Voting Power</h3>
          <div class="value">${fmt.num(metrics.totalVotingPower || 0)}</div>
          <div class="label">Total network stake</div>
        </div>
      </div>
    `;
    view.appendChild(metricsSection);

    // Recent proposals
    const recentSection = document.createElement('section');
    recentSection.className = 'span-12';
    recentSection.innerHTML = `
      <div class="card">
        <h3>Recent Proposals</h3>
        <div id="recent-proposals-list" class="mt-4"></div>
      </div>
    `;
    view.appendChild(recentSection);

    requestAnimationFrame(() => this.populateRecentProposals());

    return view;
  }

  populateRecentProposals() {
    const container = $('#recent-proposals-list');
    if (!container) return;

    const govData = appState.get('governance') || {};
    const proposals = (govData.proposals || []).slice(0, 5);

    if (proposals.length === 0) {
      container.innerHTML = '<div class="empty-state">No proposals yet</div>';
      return;
    }

    const list = document.createElement('ul');
    list.className = 'list';
    proposals.forEach(proposal => {
      const li = document.createElement('li');
      const statusClass = proposal.status === 'passed' ? 'success' : proposal.status === 'active' ? 'warn' : 'muted';
      li.innerHTML = `
        <div>
          <strong>${proposal.title || `Proposal #${proposal.id}`}</strong>
          <span class="muted small">${proposal.proposer || 'Unknown'}</span>
        </div>
        <span class="pill ${statusClass}">${proposal.status}</span>
      `;
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  renderProposals() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="proposals-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const govData = appState.get('governance') || {};
      const proposals = govData.proposals || [];

      this.proposalsTable = new DataTable({
        containerId: 'proposals-table',
        columns: [
          { key: 'id', label: 'ID', sortable: true, width: 80 },
          { key: 'title', label: 'Title', sortable: true, filterable: true },
          { key: 'proposer', label: 'Proposer', sortable: true, filterable: true },
          { key: 'votes_for', label: 'For', sortable: true, align: 'right', format: 'number' },
          { key: 'votes_against', label: 'Against', sortable: true, align: 'right', format: 'number' },
          { key: 'status', label: 'Status', sortable: true, render: (val) => {
            const statusClass = val === 'passed' ? 'success' : val === 'active' ? 'warn' : val === 'rejected' ? 'danger' : 'muted';
            return `<span class="pill ${statusClass}">${val}</span>`;
          }},
          { key: 'created_at', label: 'Created', sortable: true, format: 'datetime' },
        ],
          proposals,
        selectable: true,
        pageSize: 25,
        rowActions: [
          { icon: '👁', label: 'View Details', onClick: (row) => this.viewProposal(row) },
          { icon: '✅', label: 'Vote For', onClick: (row) => this.voteFor(row) },
          { icon: '❌', label: 'Vote Against', onClick: (row) => this.voteAgainst(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'proposals') },
        ],
      });

      this.proposalsTable.mount();
    });

    return view;
  }

  renderMyVotes() {
    const view = document.createElement('div');
    view.className = 'data-view';
    view.innerHTML = `
      <div class="card">
        <h3>My Voting History</h3>
        <p class="muted">View your voting record and voting power</p>
        <div id="my-votes-list" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  renderParameters() {
    const view = document.createElement('div');
    view.className = 'grid';

    const govData = appState.get('governance') || {};
    const parameters = govData.parameters || {};

    const paramsSection = document.createElement('section');
    paramsSection.className = 'span-12';
    paramsSection.innerHTML = `
      <div class="card">
        <h3>Network Parameters</h3>
        <p class="muted">Current protocol configuration and governance thresholds</p>
        <div id="parameters-grid" class="details-grid mt-8"></div>
      </div>
    `;
    view.appendChild(paramsSection);

    requestAnimationFrame(() => {
      const grid = $('#parameters-grid');
      if (!grid) return;

      Object.entries(parameters).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'detail-item';
        item.innerHTML = `
          <span class="detail-label">${this.formatParameterName(key)}</span>
          <span class="detail-value">${value}</span>
        `;
        grid.appendChild(item);
      });
    });

    return view;
  }

  renderAnalytics() {
    const view = document.createElement('div');
    view.className = 'grid';
    view.innerHTML = `
      <div class="span-12 card">
        <h3>Governance Analytics</h3>
        <p class="muted">Voting participation, proposal success rates, and governance trends</p>
        <div id="analytics-charts" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  showCreateProposalModal() {
    const modal = new Modal({
      title: 'Create Governance Proposal',
      size: 'large',
      content: `
        <form id="create-proposal-form" class="form">
          <div class="form-group">
            <label>Proposal Title</label>
            <input type="text" name="title" required maxlength="100" />
          </div>
          <div class="form-group">
            <label>Proposal Type</label>
            <select name="type" required>
              <option value="parameter_change">Parameter Change</option>
              <option value="spending">Treasury Spending</option>
              <option value="upgrade">Protocol Upgrade</option>
              <option value="general">General Proposal</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" required rows="6"></textarea>
          </div>
          <div class="form-group">
            <label>Voting Period (days)</label>
            <input type="number" name="voting_period" value="7" min="1" max="30" required />
          </div>
          <div class="form-group">
            <label>Quorum Threshold (%)</label>
            <input type="number" name="quorum" value="51" min="1" max="100" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-proposal">Cancel</button>
        <button class="btn btn-primary" id="submit-proposal">Create Proposal</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-proposal');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-proposal');
      if (submitBtn) {
        Capabilities.bindButton(submitBtn, 'global', 'settlement');
        submitBtn.addEventListener('click', async () => {
          await this.createProposal();
          modal.close();
        });
      }
    }, 100);
  }

  showParametersModal() {
    const govData = appState.get('governance') || {};
    const parameters = govData.parameters || {};

    const paramsHtml = Object.entries(parameters).map(([key, value]) => `
      <div class="detail-item">
        <span class="detail-label">${this.formatParameterName(key)}</span>
        <span class="detail-value">${value}</span>
      </div>
    `).join('');

    const modal = new Modal({
      title: 'Network Parameters',
      size: 'large',
      content: `
        <div class="details-grid">
          ${paramsHtml || '<div class="empty-state">No parameters available</div>'}
        </div>
      `,
      footer: `<button class="btn btn-primary" id="close-params">Close</button>`,
    });
    modal.open();

    setTimeout(() => {
      const closeBtn = $('#close-params');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.close());
      }
    }, 100);
  }

  formatParameterName(key) {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  viewProposal(proposal) {
    const modal = new Modal({
      title: proposal.title || `Proposal #${proposal.id}`,
      size: 'large',
      content: `
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Proposal ID</span>
            <span class="detail-value">${proposal.id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Proposer</span>
            <span class="detail-value">${proposal.proposer || 'Unknown'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="pill ${proposal.status === 'passed' ? 'success' : 'warn'}">${proposal.status}</span></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Votes For</span>
            <span class="detail-value">${fmt.num(proposal.votes_for || 0)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Votes Against</span>
            <span class="detail-value">${fmt.num(proposal.votes_against || 0)}</span>
          </div>
        </div>
        <div class="mt-8">
          <h4>Description</h4>
          <p class="mt-2">${proposal.description || 'No description provided'}</p>
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" id="close-detail">Close</button>
        <button class="btn btn-success" id="vote-for-detail">Vote For</button>
        <button class="btn btn-danger" id="vote-against-detail">Vote Against</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const closeBtn = $('#close-detail');
      if (closeBtn) closeBtn.addEventListener('click', () => modal.close());

      const voteForBtn = $('#vote-for-detail');
      if (voteForBtn) {
        Capabilities.bindButton(voteForBtn, 'global', 'settlement');
        voteForBtn.addEventListener('click', async () => {
          await this.voteFor(proposal);
          modal.close();
        });
      }

      const voteAgainstBtn = $('#vote-against-detail');
      if (voteAgainstBtn) {
        Capabilities.bindButton(voteAgainstBtn, 'global', 'settlement');
        voteAgainstBtn.addEventListener('click', async () => {
          await this.voteAgainst(proposal);
          modal.close();
        });
      }
    }, 100);
  }

  async createProposal() {
    const check = Capabilities.canPerformAction('global', 'settlement');
    if (!check.allowed) {
      this.showNotification(check.reason, 'error');
      return;
    }
    const form = $('#create-proposal-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      title: formData.get('title'),
      type: formData.get('type'),
      description: formData.get('description'),
      voting_period: parseInt(formData.get('voting_period')),
      quorum: parseInt(formData.get('quorum')),
    };

    try {
      console.log('[Governance] Creating proposal:', data);
      const result = await this.rpc.call('governance.create_proposal', data);
      console.log('[Governance] Proposal created:', result);
      
      await this.fetchGovernanceData();
      this.showNotification(`Proposal created successfully. ID: ${result.proposal_id}`, 'success');
    } catch (error) {
      console.error('[Governance] Failed to create proposal:', error);
      this.showNotification(`Failed to create proposal: ${error.message}`, 'error');
    }
  }

  async voteFor(proposal) {
    const check = Capabilities.canPerformAction('global', 'settlement');
    if (!check.allowed) {
      this.showNotification(check.reason, 'error');
      return;
    }
    try {
      console.log('[Governance] Voting FOR proposal:', proposal.id);
      await this.rpc.call('governance.vote', {
        proposal_id: proposal.id,
        vote: 'for',
      });
      
      await this.fetchGovernanceData();
      this.showNotification('Vote submitted successfully', 'success');
    } catch (error) {
      console.error('[Governance] Failed to vote:', error);
      this.showNotification(`Failed to submit vote: ${error.message}`, 'error');
    }
  }

  async voteAgainst(proposal) {
    const check = Capabilities.canPerformAction('global', 'settlement');
    if (!check.allowed) {
      this.showNotification(check.reason, 'error');
      return;
    }
    try {
      console.log('[Governance] Voting AGAINST proposal:', proposal.id);
      await this.rpc.call('governance.vote', {
        proposal_id: proposal.id,
        vote: 'against',
      });
      
      await this.fetchGovernanceData();
      this.showNotification('Vote submitted successfully', 'success');
    } catch (error) {
      console.error('[Governance] Failed to vote:', error);
      this.showNotification(`Failed to submit vote: ${error.message}`, 'error');
    }
  }

  exportData(rows, type) {
    console.log(`[Governance] Export ${rows.length} ${type}`);
  }

  showNotification(message, type = 'info') {
    console.log(`[Notification ${type.toUpperCase()}]`, message);
    alert(message);
  }

  updateView(data) {
    if (this.proposalsTable && this.activeView === 'proposals') {
      this.proposalsTable.setData(data.proposals || []);
    }
    if (this.activeView === 'overview') {
      this.populateRecentProposals();
    }
  }

  onUnmount() {
    this.stopPolling();
    if (this.proposalsTable) this.proposalsTable.unmount();
  }
}

export default Governance;

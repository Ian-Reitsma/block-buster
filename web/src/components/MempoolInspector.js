/**
 * Mempool Inspector - Live Transaction Flow
 * 
 * Real-time mempool visibility with:
 * - Fee lane distribution (consumer/industrial)
 * - Priority queue visualization
 * - Fee prediction algorithms
 * - Admission/eviction tracking
 * - QoS metrics per lane
 * 
 * Based on: ~/projects/the-block/docs/architecture.md#transaction-and-execution-pipeline
 */

import mockDataManager from '../mock-data-manager.js';

export default class MempoolInspector {
  constructor(container) {
    this.container = container;
    this.updateInterval = null;
    this.selectedLane = 'all';
    this.sortBy = 'fee_desc';
    this.viewMode = 'grid'; // grid | timeline
  }

  render() {
    const data = this.getMempoolData();
    
    this.container.innerHTML = `
      <div class="mempool-inspector">
        <!-- Header with Real-time Stats -->
        <div class="mempool-header">
          <div class="mempool-title">
            <h2>Mempool Inspector</h2>
            <span class="live-indicator">🔴 LIVE</span>
          </div>
          
          <div class="mempool-stats-grid">
            <div class="stat-card">
              <div class="stat-label">Pending Transactions</div>
              <div class="stat-value">${data.total_pending.toLocaleString()}</div>
              <div class="stat-change ${data.pending_trend > 0 ? 'positive' : 'negative'}">
                ${data.pending_trend > 0 ? '↑' : '↓'} ${Math.abs(data.pending_trend)}
              </div>
            </div>
            
            <div class="stat-card">
              <div class="stat-label">Avg Wait Time</div>
              <div class="stat-value">${data.avg_wait_time.toFixed(1)}s</div>
              <div class="stat-subtext">Last 100 blocks</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-label">Base Fee</div>
              <div class="stat-value">${(data.base_fee / 1000000).toFixed(4)} BLOCK</div>
              <div class="stat-change ${data.base_fee_trend > 0 ? 'negative' : 'positive'}">
                ${data.base_fee_trend > 0 ? '↑' : '↓'} ${Math.abs(data.base_fee_trend)}%
              </div>
            </div>
            
            <div class="stat-card">
              <div class="stat-label">Throughput</div>
              <div class="stat-value">${data.throughput_pct.toFixed(1)}%</div>
              <div class="stat-subtext">${data.current_tps}/${data.max_tps} TPS</div>
            </div>
          </div>
        </div>

        <!-- Fee Lane Distribution -->
        <div class="mempool-section">
          <h3>Fee Lane Distribution</h3>
          <div class="lane-distribution">
            ${this.renderLaneCards(data.lanes)}
          </div>
        </div>

        <!-- Controls -->
        <div class="mempool-controls">
          <div class="control-group">
            <label>Filter by Lane:</label>
            <select id="lane-filter" value="${this.selectedLane}">
              <option value="all">All Lanes</option>
              <option value="consumer">Consumer</option>
              <option value="industrial_storage">Industrial - Storage</option>
              <option value="industrial_compute">Industrial - Compute</option>
              <option value="industrial_energy">Industrial - Energy</option>
              <option value="governance">Governance</option>
            </select>
          </div>

          <div class="control-group">
            <label>Sort:</label>
            <select id="sort-by" value="${this.sortBy}">
              <option value="fee_desc">Fee (High → Low)</option>
              <option value="fee_asc">Fee (Low → High)</option>
              <option value="time_asc">Time (Oldest First)</option>
              <option value="time_desc">Time (Newest First)</option>
              <option value="size_desc">Size (Largest First)</option>
            </select>
          </div>

          <div class="control-group">
            <label>View:</label>
            <div class="view-toggle">
              <button class="${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">Grid</button>
              <button class="${this.viewMode === 'timeline' ? 'active' : ''}" data-view="timeline">Timeline</button>
            </div>
          </div>

          <div class="control-group">
            <button id="export-mempool" class="secondary-button">Export CSV</button>
          </div>
        </div>

        <!-- Transaction List -->
        <div class="mempool-transactions">
          <h3>
            Pending Transactions
            <span class="count">(${this.getFilteredTransactions(data.transactions).length})</span>
          </h3>
          
          ${this.viewMode === 'grid' 
            ? this.renderTransactionGrid(data.transactions)
            : this.renderTransactionTimeline(data.transactions)}
        </div>

        <!-- Fee Prediction -->
        <div class="mempool-section">
          <h3>Fee Prediction</h3>
          <div class="fee-prediction-grid">
            <div class="prediction-card">
              <div class="prediction-speed">Next Block (< 1s)</div>
              <div class="prediction-fee">${(data.predictions.next_block / 1000000).toFixed(4)} BLOCK</div>
              <div class="prediction-confidence">95% confidence</div>
            </div>
            <div class="prediction-card">
              <div class="prediction-speed">Fast (< 5s)</div>
              <div class="prediction-fee">${(data.predictions.fast / 1000000).toFixed(4)} BLOCK</div>
              <div class="prediction-confidence">90% confidence</div>
            </div>
            <div class="prediction-card">
              <div class="prediction-speed">Normal (< 15s)</div>
              <div class="prediction-fee">${(data.predictions.normal / 1000000).toFixed(4)} BLOCK</div>
              <div class="prediction-confidence">85% confidence</div>
            </div>
            <div class="prediction-card">
              <div class="prediction-speed">Economy (< 60s)</div>
              <div class="prediction-fee">${(data.predictions.economy / 1000000).toFixed(4)} BLOCK</div>
              <div class="prediction-confidence">80% confidence</div>
            </div>
          </div>
        </div>

        <!-- Admission/Eviction Stats -->
        <div class="mempool-section">
          <h3>Admission & Eviction</h3>
          <div class="admission-stats">
            <div class="admission-card">
              <div class="admission-label">Admitted (1m)</div>
              <div class="admission-value">${data.admission.admitted_1m}</div>
              <div class="admission-rate">${(data.admission.admitted_1m / 60).toFixed(1)}/s</div>
            </div>
            <div class="admission-card">
              <div class="admission-label">Rejected (1m)</div>
              <div class="admission-value negative">${data.admission.rejected_1m}</div>
              <div class="admission-reasons">
                ${Object.entries(data.admission.reject_reasons)
                  .map(([reason, count]) => `<div>${reason}: ${count}</div>`)
                  .join('')}
              </div>
            </div>
            <div class="admission-card">
              <div class="admission-label">Evicted (1m)</div>
              <div class="admission-value warning">${data.admission.evicted_1m}</div>
              <div class="admission-reasons">
                ${Object.entries(data.admission.eviction_reasons)
                  .map(([reason, count]) => `<div>${reason}: ${count}</div>`)
                  .join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderLaneCards(lanes) {
    return Object.entries(lanes).map(([lane, data]) => `
      <div class="lane-card ${data.health}">
        <div class="lane-header">
          <div class="lane-name">${this.formatLaneName(lane)}</div>
          <div class="lane-health-indicator ${data.health}">
            ${data.health === 'healthy' ? '🟢' : data.health === 'warning' ? '🟡' : '🔴'}
          </div>
        </div>
        
        <div class="lane-stats">
          <div class="lane-stat">
            <div class="lane-stat-label">Pending</div>
            <div class="lane-stat-value">${data.pending}</div>
          </div>
          <div class="lane-stat">
            <div class="lane-stat-label">Avg Fee</div>
            <div class="lane-stat-value">${(data.avg_fee / 1000000).toFixed(3)}</div>
          </div>
          <div class="lane-stat">
            <div class="lane-stat-label">Floor</div>
            <div class="lane-stat-value">${(data.floor / 1000000).toFixed(3)}</div>
          </div>
          <div class="lane-stat">
            <div class="lane-stat-label">Utilization</div>
            <div class="lane-stat-value">${data.utilization_pct.toFixed(0)}%</div>
          </div>
        </div>

        <div class="lane-queue-viz">
          <div class="queue-bar" style="width: ${data.utilization_pct}%"></div>
        </div>
      </div>
    `).join('');
  }

  renderTransactionGrid(transactions) {
    const filtered = this.getFilteredTransactions(transactions);
    const sorted = this.sortTransactions(filtered);
    
    return `
      <div class="transaction-grid">
        ${sorted.slice(0, 50).map(tx => `
          <div class="tx-card" data-tx-id="${tx.id}">
            <div class="tx-header">
              <div class="tx-hash">${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}</div>
              <div class="tx-lane-badge ${tx.lane}">${this.formatLaneName(tx.lane)}</div>
            </div>
            
            <div class="tx-details">
              <div class="tx-detail">
                <span class="label">From:</span>
                <span class="value mono">${tx.from.slice(0, 8)}...${tx.from.slice(-6)}</span>
              </div>
              <div class="tx-detail">
                <span class="label">To:</span>
                <span class="value mono">${tx.to.slice(0, 8)}...${tx.to.slice(-6)}</span>
              </div>
              <div class="tx-detail">
                <span class="label">Value:</span>
                <span class="value">${(tx.value / 1000000).toFixed(4)} BLOCK</span>
              </div>
              <div class="tx-detail">
                <span class="label">Fee:</span>
                <span class="value highlight">${(tx.fee / 1000000).toFixed(4)} BLOCK</span>
              </div>
            </div>

            <div class="tx-footer">
              <div class="tx-age">${this.formatAge(tx.timestamp)}</div>
              <div class="tx-size">${tx.size} bytes</div>
              <div class="tx-priority priority-${tx.priority}">${tx.priority}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderTransactionTimeline(transactions) {
    const filtered = this.getFilteredTransactions(transactions);
    const sorted = this.sortTransactions(filtered);
    
    // Group by age brackets
    const brackets = [
      { label: '0-5s', max: 5000, txs: [] },
      { label: '5-15s', max: 15000, txs: [] },
      { label: '15-30s', max: 30000, txs: [] },
      { label: '30-60s', max: 60000, txs: [] },
      { label: '60s+', max: Infinity, txs: [] },
    ];

    const now = Date.now();
    sorted.forEach(tx => {
      const age = now - tx.timestamp;
      const bracket = brackets.find(b => age < b.max);
      if (bracket) bracket.txs.push(tx);
    });

    return `
      <div class="transaction-timeline">
        ${brackets.map(bracket => `
          <div class="timeline-bracket">
            <div class="bracket-header">
              <div class="bracket-label">${bracket.label}</div>
              <div class="bracket-count">${bracket.txs.length} txs</div>
            </div>
            <div class="bracket-transactions">
              ${bracket.txs.slice(0, 20).map(tx => `
                <div class="timeline-tx" data-tx-id="${tx.id}">
                  <div class="timeline-tx-hash">${tx.hash.slice(0, 16)}...</div>
                  <div class="timeline-tx-fee">${(tx.fee / 1000000).toFixed(4)} BLOCK</div>
                  <div class="timeline-tx-lane ${tx.lane}">${this.formatLaneName(tx.lane).slice(0, 3).toUpperCase()}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  getMempoolData() {
    if (mockDataManager.isMockMode()) {
      return mockDataManager.mockMempool();
    }
    // TODO: Fetch from live RPC
    return mockDataManager.mockMempool();
  }

  getFilteredTransactions(transactions) {
    if (this.selectedLane === 'all') {
      return transactions;
    }
    return transactions.filter(tx => tx.lane === this.selectedLane);
  }

  sortTransactions(transactions) {
    const sorted = [...transactions];
    switch (this.sortBy) {
      case 'fee_desc':
        return sorted.sort((a, b) => b.fee - a.fee);
      case 'fee_asc':
        return sorted.sort((a, b) => a.fee - b.fee);
      case 'time_asc':
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case 'time_desc':
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case 'size_desc':
        return sorted.sort((a, b) => b.size - a.size);
      default:
        return sorted;
    }
  }

  formatLaneName(lane) {
    const names = {
      consumer: 'Consumer',
      industrial_storage: 'Industrial - Storage',
      industrial_compute: 'Industrial - Compute',
      industrial_energy: 'Industrial - Energy',
      governance: 'Governance',
    };
    return names[lane] || lane;
  }

  formatAge(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  attachEventListeners() {
    // Lane filter
    const laneFilter = this.container.querySelector('#lane-filter');
    if (laneFilter) {
      laneFilter.addEventListener('change', (e) => {
        this.selectedLane = e.target.value;
        this.render();
      });
    }

    // Sort
    const sortBy = this.container.querySelector('#sort-by');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.render();
      });
    }

    // View toggle
    const viewButtons = this.container.querySelectorAll('.view-toggle button');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.viewMode = e.target.dataset.view;
        this.render();
      });
    });

    // Export
    const exportBtn = this.container.querySelector('#export-mempool');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToCSV());
    }

    // Transaction click
    const txCards = this.container.querySelectorAll('[data-tx-id]');
    txCards.forEach(card => {
      card.addEventListener('click', (e) => {
        const txId = e.currentTarget.dataset.txId;
        this.showTransactionDetails(txId);
      });
    });
  }

  showTransactionDetails(txId) {
    // TODO: Show detailed modal
    console.log('Show details for tx:', txId);
  }

  exportToCSV() {
    const data = this.getMempoolData();
    const filtered = this.getFilteredTransactions(data.transactions);
    
    const csv = [
      ['Hash', 'Lane', 'From', 'To', 'Value (BLOCK)', 'Fee (BLOCK)', 'Size (bytes)', 'Age (s)', 'Priority'].join(','),
      ...filtered.map(tx => [
        tx.hash,
        tx.lane,
        tx.from,
        tx.to,
        (tx.value / 1000000).toFixed(6),
        (tx.fee / 1000000).toFixed(6),
        tx.size,
        Math.floor((Date.now() - tx.timestamp) / 1000),
        tx.priority,
      ].join(','))
    ].join('\\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mempool_${Date.now()}.csv`;
    a.click();
  }

  startAutoUpdate(interval = 3000) {
    this.stopAutoUpdate();
    this.updateInterval = setInterval(() => {
      this.render();
    }, interval);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  destroy() {
    this.stopAutoUpdate();
  }
}

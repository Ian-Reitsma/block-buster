/**
 * Receipt Audit Interface
 * 
 * Canonical receipt audit trail with subsidy buckets and dispute metadata.
 * Filters: block height range, provider_id, market type, limit
 * Drill-down: click receipt → full payload + audit fields
 * 
 * Based on: ~/projects/the-block/docs/apis_and_tooling.md (receipt.audit RPC)
 */

import { Component } from '../lifecycle.js';
import { fmt, $ } from '../utils.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import mockDataManager from '../mock-data-manager.js';

class ReceiptAuditInterface extends Component {
  constructor(rpc) {
    super('ReceiptAuditInterface');
    this.rpc = rpc;
    this.filters = {
      start_height: null,
      end_height: null,
      provider_id: '',
      market: '',
      limit: 128,
    };
    this.receipts = [];
    this.scannedRange = null;
    this.truncated = false;
    this.table = null;
  }

  async fetchReceipts() {
    try {
      if (mockDataManager.isLiveMode()) {
        // Fetch from RPC
        const response = await this.rpc.call('receipt.audit', this.filters);
        return {
          receipts: response.receipts || [],
          scannedRange: response.scanned_range || null,
          truncated: response.truncated || false,
          nextStartHeight: response.next_start_height || null,
        };
      } else {
        // Use mock data
        return mockDataManager.mockReceiptAudit(this.filters);
      }
    } catch (error) {
      console.error('[ReceiptAuditInterface] Failed to fetch:', error);
      return mockDataManager.mockReceiptAudit(this.filters);
    }
  }

  render() {
    const container = document.createElement('div');
    container.className = 'receipt-audit-interface';

    // Header
    const header = document.createElement('div');
    header.className = 'audit-header';
    header.innerHTML = `
      <div>
        <h3>Receipt Audit Trail</h3>
        <p class="muted small">Canonical receipts with subsidy breakdowns and dispute tracking</p>
      </div>
    `;
    container.appendChild(header);

    // Filters section
    const filtersSection = document.createElement('div');
    filtersSection.className = 'audit-filters';
    filtersSection.innerHTML = `
      <div class="filters-grid">
        <div class="filter-group">
          <label for="filter-start-height">Start Height</label>
          <input type="number" id="filter-start-height" placeholder="e.g., 1000" value="${this.filters.start_height || ''}">
        </div>
        <div class="filter-group">
          <label for="filter-end-height">End Height</label>
          <input type="number" id="filter-end-height" placeholder="e.g., 2000" value="${this.filters.end_height || ''}">
        </div>
        <div class="filter-group">
          <label for="filter-provider">Provider ID</label>
          <input type="text" id="filter-provider" placeholder="e.g., energy-0x01" value="${this.filters.provider_id}">
        </div>
        <div class="filter-group">
          <label for="filter-market">Market</label>
          <select id="filter-market">
            <option value="">All Markets</option>
            <option value="storage" ${this.filters.market === 'storage' ? 'selected' : ''}>Storage</option>
            <option value="compute" ${this.filters.market === 'compute' ? 'selected' : ''}>Compute</option>
            <option value="energy" ${this.filters.market === 'energy' ? 'selected' : ''}>Energy</option>
            <option value="ad" ${this.filters.market === 'ad' ? 'selected' : ''}>Ad</option>
            <option value="relay" ${this.filters.market === 'relay' ? 'selected' : ''}>Relay</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="filter-limit">Limit</label>
          <input type="number" id="filter-limit" min="1" max="512" value="${this.filters.limit}">
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" id="apply-filters-btn">Apply Filters</button>
          <button class="btn btn-secondary" id="reset-filters-btn">Reset</button>
          <button class="btn btn-secondary" id="export-csv-btn">Export CSV</button>
        </div>
      </div>
    `;
    container.appendChild(filtersSection);

    // Status bar
    const statusBar = document.createElement('div');
    statusBar.className = 'audit-status-bar';
    statusBar.id = 'audit-status-bar';
    container.appendChild(statusBar);

    // Table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'audit-table-container';
    tableContainer.innerHTML = '<div id="receipts-table"></div>';
    container.appendChild(tableContainer);

    return container;
  }

  async onMount() {
    // Attach filter handlers
    const applyBtn = $('#apply-filters-btn');
    if (applyBtn) {
      this.listen(applyBtn, 'click', () => this.applyFilters());
    }

    const resetBtn = $('#reset-filters-btn');
    if (resetBtn) {
      this.listen(resetBtn, 'click', () => this.resetFilters());
    }

    const exportBtn = $('#export-csv-btn');
    if (exportBtn) {
      this.listen(exportBtn, 'click', () => this.exportCSV());
    }

    // Initial fetch
    await this.fetchAndRender();
  }

  async applyFilters() {
    // Collect filter values
    this.filters.start_height = parseInt($('#filter-start-height')?.value) || null;
    this.filters.end_height = parseInt($('#filter-end-height')?.value) || null;
    this.filters.provider_id = $('#filter-provider')?.value.trim() || '';
    this.filters.market = $('#filter-market')?.value || '';
    this.filters.limit = parseInt($('#filter-limit')?.value) || 128;

    // Clamp limit
    if (this.filters.limit < 1) this.filters.limit = 1;
    if (this.filters.limit > 512) this.filters.limit = 512;

    await this.fetchAndRender();
  }

  resetFilters() {
    this.filters = {
      start_height: null,
      end_height: null,
      provider_id: '',
      market: '',
      limit: 128,
    };

    // Update inputs
    $('#filter-start-height').value = '';
    $('#filter-end-height').value = '';
    $('#filter-provider').value = '';
    $('#filter-market').value = '';
    $('#filter-limit').value = '128';

    this.fetchAndRender();
  }

  async fetchAndRender() {
    const result = await this.fetchReceipts();
    this.receipts = result.receipts;
    this.scannedRange = result.scannedRange;
    this.truncated = result.truncated;

    this.renderStatusBar();
    this.renderTable();
  }

  renderStatusBar() {
    const statusBar = $('#audit-status-bar');
    if (!statusBar) return;

    const rangeText = this.scannedRange
      ? `Scanned: blocks ${fmt.num(this.scannedRange.start)} - ${fmt.num(this.scannedRange.end)}`
      : 'No range scanned';

    const truncatedText = this.truncated
      ? `<span class="status-warn">⚠️ Results truncated (limit: ${this.filters.limit})</span>`
      : '';

    statusBar.innerHTML = `
      <div class="status-info">
        <span class="status-receipts">Found: ${fmt.num(this.receipts.length)} receipts</span>
        <span class="status-range">${rangeText}</span>
        ${truncatedText}
      </div>
    `;
  }

  renderTable() {
    const container = $('#receipts-table');
    if (!container) return;

    // Destroy existing table
    if (this.table) {
      this.table.unmount();
    }

    // Transform receipts for table
    const rows = this.receipts.map(receipt => ({
      block_height: receipt.block_height,
      receipt_type: receipt.receipt_type,
      market: receipt.market || this.guessMarket(receipt.receipt_type),
      amount: receipt.amount || 0,
      provider: receipt.provider_id || receipt.publisher_id || 'N/A',
      storage_sub: receipt.subsidies?.storage_sub || 0,
      read_sub: receipt.subsidies?.read_sub || 0,
      compute_sub: receipt.subsidies?.compute_sub || 0,
      ad_sub: receipt.subsidies?.ad_sub || 0,
      rebate: receipt.subsidies?.rebate || 0,
      disputes: receipt.disputes?.length || 0,
      digest: receipt.digest_hex || '',
      _fullReceipt: receipt, // Store full receipt for drill-down
    }));

    // Create table
    this.table = new DataTable({
      containerId: 'receipts-table',
      columns: [
        { key: 'block_height', label: 'Block', sortable: true, align: 'right', format: 'number' },
        { key: 'receipt_type', label: 'Type', sortable: true, filterable: true },
        { key: 'market', label: 'Market', sortable: true, filterable: true },
        { key: 'provider', label: 'Provider', filterable: true },
        { key: 'amount', label: 'Amount', sortable: true, align: 'right', format: 'currency' },
        { 
          key: 'subsidies', 
          label: 'Subsidies', 
          render: (val, row) => {
            const total = row.storage_sub + row.read_sub + row.compute_sub + row.ad_sub + row.rebate;
            return `<span class="subsidy-total" title="Storage: ${row.storage_sub}, Read: ${row.read_sub}, Compute: ${row.compute_sub}, Ad: ${row.ad_sub}, Rebate: ${row.rebate}">${fmt.currency(total)}</span>`;
          }
        },
        {
          key: 'disputes',
          label: 'Disputes',
          align: 'center',
          render: (val) => val > 0 ? `<span class="badge badge-warn">${val}</span>` : '—',
        },
        {
          key: 'digest',
          label: 'Digest',
          render: (val) => val ? `<code class="digest-short">${val.slice(0, 8)}...</code>` : 'N/A',
        },
      ],
       rows,
      selectable: true,
      pageSize: 50,
      rowActions: [
        { icon: '👁', label: 'View Details', onClick: (row) => this.showReceiptDetails(row._fullReceipt) },
      ],
      bulkActions: [
        { label: 'Export Selected', onClick: (rows) => this.exportSelectedCSV(rows) },
      ],
    });

    this.table.mount();
  }

  guessMarket(receiptType) {
    if (receiptType.includes('storage')) return 'storage';
    if (receiptType.includes('compute')) return 'compute';
    if (receiptType.includes('energy')) return 'energy';
    if (receiptType.includes('ad')) return 'ad';
    if (receiptType.includes('relay')) return 'relay';
    return 'unknown';
  }

  showReceiptDetails(receipt) {
    const modal = new Modal({
      title: `Receipt Details - Block ${receipt.block_height}`,
      size: 'large',
      content: this.renderReceiptDetails(receipt),
    });

    modal.open();
  }

  renderReceiptDetails(receipt) {
    const container = document.createElement('div');
    container.className = 'receipt-details';

    // Basic info
    container.innerHTML = `
      <div class="detail-section">
        <h4>Basic Information</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Block Height:</span>
            <span class="detail-value">${fmt.num(receipt.block_height)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Receipt Index:</span>
            <span class="detail-value">${receipt.receipt_index}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Type:</span>
            <span class="detail-value">${receipt.receipt_type}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Amount:</span>
            <span class="detail-value">${fmt.currency(receipt.amount || 0)}</span>
          </div>
          <div class="detail-item span-2">
            <span class="detail-label">Digest:</span>
            <span class="detail-value"><code>${receipt.digest_hex || 'N/A'}</code></span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>Subsidy Buckets</h4>
        <div class="subsidy-breakdown">
          <div class="subsidy-item">
            <span class="subsidy-label">Storage:</span>
            <span class="subsidy-value">${fmt.currency(receipt.subsidies?.storage_sub || 0)}</span>
          </div>
          <div class="subsidy-item">
            <span class="subsidy-label">Read:</span>
            <span class="subsidy-value">${fmt.currency(receipt.subsidies?.read_sub || 0)}</span>
          </div>
          <div class="subsidy-item">
            <span class="subsidy-label">Compute:</span>
            <span class="subsidy-value">${fmt.currency(receipt.subsidies?.compute_sub || 0)}</span>
          </div>
          <div class="subsidy-item">
            <span class="subsidy-label">Ad:</span>
            <span class="subsidy-value">${fmt.currency(receipt.subsidies?.ad_sub || 0)}</span>
          </div>
          <div class="subsidy-item">
            <span class="subsidy-label">Rebate:</span>
            <span class="subsidy-value">${fmt.currency(receipt.subsidies?.rebate || 0)}</span>
          </div>
          <div class="subsidy-item subsidy-total">
            <span class="subsidy-label"><strong>Total:</strong></span>
            <span class="subsidy-value"><strong>${fmt.currency(
              (receipt.subsidies?.storage_sub || 0) +
              (receipt.subsidies?.read_sub || 0) +
              (receipt.subsidies?.compute_sub || 0) +
              (receipt.subsidies?.ad_sub || 0) +
              (receipt.subsidies?.rebate || 0)
            )}</strong></span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>Audit Fields</h4>
        <div class="audit-fields">
          <div class="audit-item">
            <span class="audit-label">Audit Queries:</span>
            <span class="audit-value">${receipt.audit?.audit_queries || 0}</span>
          </div>
          <div class="audit-item">
            <span class="audit-label">Invariants:</span>
            <span class="audit-value badge ${receipt.audit?.invariants ? 'badge-success' : 'badge-warn'}">
              ${receipt.audit?.invariants ? 'Passed' : 'Unknown'}
            </span>
          </div>
          <div class="audit-item">
            <span class="audit-label">Causality:</span>
            <span class="audit-value">${receipt.audit?.causality || 'N/A'}</span>
          </div>
          <div class="audit-item">
            <span class="audit-label">Provider Identity:</span>
            <span class="audit-value badge ${receipt.audit?.provider_identity ? 'badge-success' : 'badge-warn'}">
              ${receipt.audit?.provider_identity || 'Unverified'}
            </span>
          </div>
        </div>
      </div>

      ${receipt.disputes && receipt.disputes.length > 0 ? `
        <div class="detail-section">
          <h4>Disputes (${receipt.disputes.length})</h4>
          <div class="disputes-list">
            ${receipt.disputes.map(dispute => `
              <div class="dispute-card">
                <div class="dispute-header">
                  <span class="dispute-id">ID: ${dispute.id}</span>
                  <span class="dispute-status badge ${dispute.status === 'resolved' ? 'badge-success' : 'badge-warn'}">${dispute.status}</span>
                </div>
                <div class="dispute-body">
                  <div class="dispute-field">
                    <span class="field-label">Reason:</span>
                    <span class="field-value">${dispute.reason}</span>
                  </div>
                  <div class="dispute-field">
                    <span class="field-label">Created:</span>
                    <span class="field-value">${new Date(dispute.timestamp).toLocaleString()}</span>
                  </div>
                  ${dispute.metadata ? `
                    <div class="dispute-field">
                      <span class="field-label">Meta</span>
                      <pre class="field-value"><code>${JSON.stringify(dispute.metadata, null, 2)}</code></pre>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="detail-section">
        <h4>Full Receipt Payload</h4>
        <pre class="receipt-payload"><code>${JSON.stringify(receipt.receipt, null, 2)}</code></pre>
      </div>
    `;

    return container;
  }

  exportCSV() {
    const rows = this.receipts.map(r => ({
      block_height: r.block_height,
      receipt_type: r.receipt_type,
      amount: r.amount || 0,
      storage_sub: r.subsidies?.storage_sub || 0,
      read_sub: r.subsidies?.read_sub || 0,
      compute_sub: r.subsidies?.compute_sub || 0,
      ad_sub: r.subsidies?.ad_sub || 0,
      rebate: r.subsidies?.rebate || 0,
      disputes: r.disputes?.length || 0,
      digest: r.digest_hex || '',
    }));

    this.downloadCSV(rows, 'receipt-audit.csv');
  }

  exportSelectedCSV(selected) {
    const rows = selected.map(r => ({
      block_height: r.block_height,
      receipt_type: r.receipt_type,
      amount: r.amount || 0,
      storage_sub: r.storage_sub,
      read_sub: r.read_sub,
      compute_sub: r.compute_sub,
      ad_sub: r.ad_sub,
      rebate: r.rebate,
      disputes: r.disputes,
      digest: r.digest,
    }));

    this.downloadCSV(rows, 'receipt-audit-selected.csv');
  }

  downloadCSV(rows, filename) {
    if (rows.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  onUnmount() {
    if (this.table) {
      this.table.unmount();
    }
    console.log('[ReceiptAuditInterface] Cleanup complete');
  }
}

export default ReceiptAuditInterface;

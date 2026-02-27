/**
 * Storage Market Dashboard Component
 * 
 * Features:
 * - File upload and management
 * - IPFS integration
 * - Rent tracking and escrow
 * - Storage provider metrics
 * - Usage analytics
 */

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';
import { Capabilities } from '../capabilities.js';

class StorageMarket extends Component {
  constructor(rpc) {
    super('StorageMarket');
    this.rpc = rpc;
    this.container = null;
    this.filesTable = null;
    this.providersTable = null;
    this.activeView = 'overview';
  }

  async onMount() {
    this.container = $('#app');
    this.render();

    this.subscribe(appState, 'storageMarket', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    this.subscribe(appState, 'usePolling', (shouldPoll) => {
      if (shouldPoll) this.startPolling();
      else this.stopPolling();
    });

    await this.fetchStorageData();
    if (appState.get('usePolling') !== false) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;
    console.log('[StorageMarket] Starting polling');
    this.pollingInterval = this.interval(() => this.fetchStorageData(), 5000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchStorageData() {
    try {
      const data = await perf.time(
        'fetchStorageMarket',
        () => this.rpc.call('storage.list', {}),
        'fetch'
      );

      if (!data) return;

      appState.set('storageMarket', {
        files: data.files || [],
        providers: data.providers || [],
        escrow: data.escrow || [],
        metrics: {
          totalFiles: data.files?.length || 0,
          totalSize: data.files?.reduce((sum, f) => sum + (f.size || 0), 0) || 0,
          activeProviders: data.providers?.filter(p => p.status === 'active').length || 0,
          escrowBalance: data.escrow?.reduce((sum, e) => sum + (e.balance || 0), 0) || 0,
        },
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error('[StorageMarket] Failed to fetch:', error);
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
        <h2>Storage Marketplace</h2>
        <p>Decentralized file storage with IPFS integration, rent tracking, and provider management</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="upload-file-btn">Upload File</button>
        <button class="btn btn-secondary" id="rent-escrow-btn">Manage Escrow</button>
      </div>
    `;
    content.appendChild(header);

    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button class="tab ${this.activeView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
      <button class="tab ${this.activeView === 'files' ? 'active' : ''}" data-view="files">Files</button>
      <button class="tab ${this.activeView === 'providers' ? 'active' : ''}" data-view="providers">Providers</button>
      <button class="tab ${this.activeView === 'escrow' ? 'active' : ''}" data-view="escrow">Rent Escrow</button>
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
    viewContainer.id = 'storage-view-container';
    content.appendChild(viewContainer);

    this.container.innerHTML = '';
    this.container.appendChild(content);
    this.renderActiveView();

    const uploadBtn = $('#upload-file-btn');
    if (uploadBtn) {
      Capabilities.bindButton(uploadBtn, 'storage', 'mutation');
      this.listen(uploadBtn, 'click', () => this.showUploadModal());
    }

    const escrowBtn = $('#rent-escrow-btn');
    if (escrowBtn) {
      Capabilities.bindButton(escrowBtn, 'storage', 'settlement');
      this.listen(escrowBtn, 'click', () => this.showEscrowModal());
    }
  }

  renderActiveView() {
    const container = $('#storage-view-container');
    if (!container) return;
    container.innerHTML = '';

    switch (this.activeView) {
      case 'overview':
        container.appendChild(this.renderOverview());
        break;
      case 'files':
        container.appendChild(this.renderFiles());
        break;
      case 'providers':
        container.appendChild(this.renderProviders());
        break;
      case 'escrow':
        container.appendChild(this.renderEscrow());
        break;
      case 'analytics':
        container.appendChild(this.renderAnalytics());
        break;
    }
  }

  renderOverview() {
    const view = document.createElement('div');
    view.className = 'grid';

    const marketData = appState.get('storageMarket') || {};
    const metrics = marketData.metrics || {};

    const metricsSection = document.createElement('section');
    metricsSection.className = 'span-12';
    metricsSection.innerHTML = `
      <div class="dashboard-grid">
        <div class="card-metric-hero">
          <h3>Total Files</h3>
          <div class="value">${fmt.num(metrics.totalFiles || 0)}</div>
          <div class="label">Stored files</div>
        </div>
        <div class="card-metric-hero">
          <h3>Storage Used</h3>
          <div class="value">${this.formatBytes(metrics.totalSize || 0)}</div>
          <div class="label">Total data stored</div>
        </div>
        <div class="card-metric-hero">
          <h3>Active Providers</h3>
          <div class="value">${fmt.num(metrics.activeProviders || 0)}</div>
          <div class="label">Storage nodes online</div>
        </div>
        <div class="card-metric-hero">
          <h3>Escrow Balance</h3>
          <div class="value">${fmt.currency(metrics.escrowBalance || 0)}</div>
          <div class="label">Rent in escrow</div>
        </div>
      </div>
    `;
    view.appendChild(metricsSection);

    return view;
  }

  renderFiles() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="files-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('storageMarket') || {};
      const files = marketData.files || [];

      this.filesTable = new DataTable({
        containerId: 'files-table',
        columns: [
          { key: 'name', label: 'File Name', sortable: true, filterable: true },
          { key: 'cid', label: 'IPFS CID', sortable: true, filterable: true },
          { key: 'size', label: 'Size', sortable: true, align: 'right', render: (val) => this.formatBytes(val) },
          { key: 'uploaded_at', label: 'Uploaded', sortable: true, format: 'datetime' },
          { key: 'rent_paid_until', label: 'Rent Paid Until', sortable: true, format: 'date' },
          { key: 'provider', label: 'Provider', sortable: true, filterable: true },
        ],
          files,
        selectable: true,
        pageSize: 50,
        rowActions: [
          { icon: '📥', label: 'Download', onClick: (row) => this.downloadFile(row) },
          { icon: '🔗', label: 'Copy CID', onClick: (row) => this.copyCID(row) },
          { icon: '💰', label: 'Extend Rent', onClick: (row) => this.extendRent(row) },
          { icon: '🗑', label: 'Delete', onClick: (row) => this.deleteFile(row) },
        ],
        bulkActions: [
          { label: 'Download Selected', onClick: (rows) => this.bulkDownload(rows) },
          { label: 'Extend Rent', onClick: (rows) => this.bulkExtendRent(rows) },
          { label: 'Export List', onClick: (rows) => this.exportData(rows, 'files') },
        ],
      });

      this.filesTable.mount();
    });

    return view;
  }

  renderProviders() {
    const view = document.createElement('div');
    view.className = 'data-view';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'card';
    tableContainer.innerHTML = '<div id="providers-table"></div>';
    view.appendChild(tableContainer);

    requestAnimationFrame(() => {
      const marketData = appState.get('storageMarket') || {};
      const providers = marketData.providers || [];

      this.providersTable = new DataTable({
        containerId: 'providers-table',
        columns: [
          { key: 'id', label: 'Provider ID', sortable: true, filterable: true },
          { key: 'capacity', label: 'Capacity', sortable: true, align: 'right', render: (val) => this.formatBytes(val) },
          { key: 'used', label: 'Used', sortable: true, align: 'right', render: (val) => this.formatBytes(val) },
          { key: 'price_per_gb', label: 'Price/GB', sortable: true, align: 'right', format: 'currency' },
          { key: 'uptime', label: 'Uptime', sortable: true, align: 'right', render: (val) => `${(val * 100).toFixed(2)}%` },
          { key: 'status', label: 'Status', sortable: true, render: (val) => {
            const statusClass = val === 'active' ? 'success' : val === 'degraded' ? 'warn' : 'danger';
            return `<span class="pill ${statusClass}">${val}</span>`;
          }},
        ],
          providers,
        selectable: true,
        pageSize: 25,
        rowActions: [
          { icon: '👁', label: 'View Details', onClick: (row) => this.viewProvider(row) },
          { icon: '📊', label: 'Performance', onClick: (row) => this.viewProviderPerformance(row) },
        ],
        bulkActions: [
          { label: 'Export', onClick: (rows) => this.exportData(rows, 'providers') },
        ],
      });

      this.providersTable.mount();
    });

    return view;
  }

  renderEscrow() {
    const view = document.createElement('div');
    view.className = 'data-view';
    view.innerHTML = `
      <div class="card">
        <h3>Rent Escrow Management</h3>
        <p class="muted">Manage rent payments and escrow balances for stored files</p>
        <div class="mt-8">
          <button class="btn btn-primary" id="deposit-escrow-btn">Deposit Funds</button>
          <button class="btn btn-secondary" id="withdraw-escrow-btn">Withdraw</button>
          <button class="btn btn-secondary" id="view-history-btn">View History</button>
        </div>
        <div id="escrow-details" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  renderAnalytics() {
    const view = document.createElement('div');
    view.className = 'grid';
    view.innerHTML = `
      <div class="span-12 card">
        <h3>Storage Analytics</h3>
        <p class="muted">Usage patterns, cost analysis, and provider performance metrics</p>
        <div id="analytics-charts" class="mt-8"></div>
      </div>
    `;
    return view;
  }

  showUploadModal() {
    const modal = new Modal({
      title: 'Upload File to Storage',
      size: 'medium',
      content: `
        <form id="upload-file-form" class="form">
          <div class="form-group">
            <label>Select File</label>
            <input type="file" name="file" id="file-input" required />
          </div>
          <div class="form-group">
            <label>Rent Duration (days)</label>
            <input type="number" name="rent_days" value="30" min="1" required />
          </div>
          <div class="form-group">
            <label>Preferred Provider (optional)</label>
            <input type="text" name="provider" placeholder="Leave empty for auto-selection" />
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="pin_ipfs" /> Pin to IPFS
            </label>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-upload">Cancel</button>
        <button class="btn btn-primary" id="submit-upload">Upload File</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-upload');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-upload');
      if (submitBtn) {
        Capabilities.bindButton(submitBtn, 'storage', 'mutation');
        submitBtn.addEventListener('click', async () => {
          await this.uploadFile();
          modal.close();
        });
      }
    }, 100);
  }

  showEscrowModal() {
    const modal = new Modal({
      title: 'Manage Rent Escrow',
      size: 'medium',
      content: `
        <form id="escrow-form" class="form">
          <div class="form-group">
            <label>Action</label>
            <select name="action" required>
              <option value="deposit">Deposit Funds</option>
              <option value="withdraw">Withdraw Funds</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount (BLOCK)</label>
            <input type="number" name="amount" step="0.01" required />
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-ghost" id="cancel-escrow">Cancel</button>
        <button class="btn btn-primary" id="submit-escrow">Submit</button>
      `,
    });
    modal.open();

    setTimeout(() => {
      const cancelBtn = $('#cancel-escrow');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.close());
      }

      const submitBtn = $('#submit-escrow');
      if (submitBtn) {
        Capabilities.bindButton(submitBtn, 'storage', 'settlement');
        submitBtn.addEventListener('click', async () => {
          await this.manageEscrow();
          modal.close();
        });
      }
    }, 100);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  async uploadFile() {
    const form = $('#upload-file-form');
    if (!form) return;

    const fileInput = $('#file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      this.showNotification('Please select a file', 'error');
      return;
    }

    const formData = new FormData(form);
    const file = fileInput.files[0];
    
    // Read file as base64 for RPC transmission
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target.result.split(',')[1];
      const data = {
        filename: file.name,
         base64Data,
        size: file.size,
        rent_days: parseInt(formData.get('rent_days')),
        provider: formData.get('provider') || null,
        pin_ipfs: formData.get('pin_ipfs') === 'on',
      };

      try {
        console.log('[StorageMarket] Uploading file:', file.name);
        const result = await this.rpc.call('storage.upload', data);
        console.log('[StorageMarket] File uploaded:', result);
        
        await this.fetchStorageData();
        this.showNotification(`File uploaded successfully. CID: ${result.cid}`, 'success');
      } catch (error) {
        console.error('[StorageMarket] Failed to upload:', error);
        this.showNotification(`Failed to upload file: ${error.message}`, 'error');
      }
    };
    reader.readAsDataURL(file);
  }

  async manageEscrow() {
    const form = $('#escrow-form');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
      action: formData.get('action'),
      amount: parseFloat(formData.get('amount')),
    };

    try {
      console.log('[StorageMarket] Managing escrow:', data);
      const method = data.action === 'deposit' ? 'storage.deposit_escrow' : 'storage.withdraw_escrow';
      const result = await this.rpc.call(method, { amount: data.amount });
      console.log('[StorageMarket] Escrow updated:', result);
      
      await this.fetchStorageData();
      this.showNotification(`Escrow ${data.action} successful`, 'success');
    } catch (error) {
      console.error('[StorageMarket] Escrow operation failed:', error);
      this.showNotification(`Escrow operation failed: ${error.message}`, 'error');
    }
  }

  async downloadFile(file) {
    try {
      console.log('[StorageMarket] Downloading file:', file.cid);
      const result = await this.rpc.call('storage.get', { cid: file.cid });
      
      // Convert base64 back to file and trigger download
      const blob = this.base64ToBlob(result.data, result.mime_type || 'application/octet-stream');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showNotification('File downloaded', 'success');
    } catch (error) {
      console.error('[StorageMarket] Failed to download:', error);
      this.showNotification(`Failed to download file: ${error.message}`, 'error');
    }
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
  }

  copyCID(file) {
    if (navigator.clipboard && file.cid) {
      navigator.clipboard.writeText(file.cid);
      console.log('[StorageMarket] CID copied:', file.cid);
      this.showNotification('CID copied to clipboard', 'success');
    }
  }

  async extendRent(file) {
    const days = prompt('Enter number of days to extend rent:', '30');
    if (!days) return;

    try {
      console.log('[StorageMarket] Extending rent for:', file.cid);
      await this.rpc.call('storage.extend_rent', {
        cid: file.cid,
        days: parseInt(days),
      });
      
      await this.fetchStorageData();
      this.showNotification('Rent extended successfully', 'success');
    } catch (error) {
      console.error('[StorageMarket] Failed to extend rent:', error);
      this.showNotification(`Failed to extend rent: ${error.message}`, 'error');
    }
  }

  async deleteFile(file) {
    if (!confirm(`Delete file ${file.name}?`)) return;

    try {
      console.log('[StorageMarket] Deleting file:', file.cid);
      await this.rpc.call('storage.delete', { cid: file.cid });
      
      await this.fetchStorageData();
      this.showNotification('File deleted', 'success');
    } catch (error) {
      console.error('[StorageMarket] Failed to delete:', error);
      this.showNotification(`Failed to delete file: ${error.message}`, 'error');
    }
  }

  async bulkDownload(files) {
    for (const file of files) {
      await this.downloadFile(file);
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async bulkExtendRent(files) {
    const days = prompt('Enter number of days to extend rent for all selected files:', '30');
    if (!days) return;

    try {
      console.log('[StorageMarket] Bulk extending rent for', files.length, 'files');
      const cids = files.map(f => f.cid);
      await this.rpc.call('storage.bulk_extend_rent', {
        cids: cids,
        days: parseInt(days),
      });
      
      await this.fetchStorageData();
      this.showNotification(`Rent extended for ${files.length} files`, 'success');
    } catch (error) {
      console.error('[StorageMarket] Bulk extend failed:', error);
      this.showNotification(`Failed to extend rent: ${error.message}`, 'error');
    }
  }

  viewProvider(provider) {
    console.log('[StorageMarket] View provider:', provider);
  }

  viewProviderPerformance(provider) {
    console.log('[StorageMarket] View provider performance:', provider);
  }

  exportData(rows, type) {
    console.log(`[StorageMarket] Export ${rows.length} ${type}`);
  }

  showNotification(message, type = 'info') {
    console.log(`[Notification ${type.toUpperCase()}]`, message);
    alert(message);
  }

  updateView(data) {
    if (this.filesTable && this.activeView === 'files') {
      this.filesTable.setData(data.files || []);
    }
    if (this.providersTable && this.activeView === 'providers') {
      this.providersTable.setData(data.providers || []);
    }
  }

  onUnmount() {
    this.stopPolling();
    if (this.filesTable) this.filesTable.unmount();
    if (this.providersTable) this.providersTable.unmount();
  }
}

export default StorageMarket;

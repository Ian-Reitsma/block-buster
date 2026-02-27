import Modal from './Modal.js';
import appState from '../state.js';
import { $ } from '../utils.js';

export default class RpcCompatModal {
  static show() {
    const rpcCompat = appState.get('rpcCompat') || {};
    const probe = rpcCompat.probe || {};
    const asOf = rpcCompat.as_of_ms ? new Date(rpcCompat.as_of_ms).toLocaleString() : 'Never';

    const rows = Object.entries(probe).map(([method, status]) => {
      const statusClass = status.ok ? 'success' : 'danger';
      const statusText = status.ok ? 'Available' : 'Missing';
      const details = status.ok ? 'OK' : (status.message || status.code || 'Unknown error');
      
      return `
        <tr>
          <td class="font-mono" style="font-family: monospace;">${method}</td>
          <td><span class="pill ${statusClass}">${statusText}</span></td>
          <td class="muted small">${details}</td>
        </tr>
      `;
    }).join('');

    const content = `
      <div class="rpc-compat-report">
        <div class="mb-4">
          <p class="muted">Probe Time: ${asOf}</p>
          <p class="small mt-2">
            The dashboard probes the connected node for these RPC methods to determine 
            available functionality. Missing methods disable related features.
          </p>
        </div>
        <div class="card" style="padding: 0; overflow: hidden;">
          <table class="data-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--bg-surface-2); text-align: left;">
                <th style="padding: 12px;">Method</th>
                <th style="padding: 12px;">Status</th>
                <th style="padding: 12px;">Details</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows : '<tr><td colspan="3" class="text-center muted" style="padding: 20px;">No probe data available</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Create container for footer buttons
    const footerContainer = document.createElement('div');
    footerContainer.style.display = 'flex';
    footerContainer.style.justifyContent = 'flex-end';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary';
    closeBtn.textContent = 'Close';
    footerContainer.appendChild(closeBtn);

    const modal = new Modal({
      title: 'RPC Compatibility Report',
      content,
      size: 'medium',
      footer: footerContainer
    });

    closeBtn.onclick = () => modal.close();

    modal.open();
  }
}

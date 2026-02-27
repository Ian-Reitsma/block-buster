// Connection status indicator component
// Shows transport + authority status (LIVE node vs MOCK synthetic)

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { $ } from '../utils.js';
import RpcCompatModal from './RpcCompatModal.js';

class ConnectionStatus extends Component {
  constructor() {
    super('ConnectionStatus');
    this.container = null;
    this.status = 'connecting'; // 'connected' | 'connecting' | 'disconnected'
    this.label = 'Detecting…';
  }

  onMount() {
    this.container = $('#connection-status');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'connection-status';
      this.container.className = 'connection-status connecting';

      // Add to navigation
      const nav = $('.nav');
      if (nav) {
        nav.appendChild(this.container);
      }
    }

    this.render();

    // Recompute on any relevant state change.
    this.subscribe(appState, 'offline', () => this.updateFromState());
    this.subscribe(appState, 'connectionMode', () => this.updateFromState());
    this.subscribe(appState, 'ws', () => this.updateFromState());
    this.subscribe(appState, 'rpcCompat', () => this.updateFromState());

    // Initial status based on already-known state
    this.updateFromState();
  }

  updateFromState() {
    const offline = appState.get('offline');
    const wsState = appState.get('ws');
    const mode = appState.get('connectionMode') || 'DETECTING';

    if (offline) {
      this.status = 'disconnected';
      this.label = 'Disconnected';
      this.render();
      return;
    }

    if (mode === 'MOCK') {
      // Synthetic localnet: UI is "up" but not node-authoritative.
      this.status = 'connected';
      this.label = 'Mock (synthetic localnet)';
      this.render();
      return;
    }

    if (mode === 'LIVE') {
      this.status = 'connected';
      this.label = wsState?.connected ? 'Live (node + WS)' : 'Live (node)';
      
      const rpcCompat = appState.get('rpcCompat') || {};
      const probe = rpcCompat.probe || {};
      const missingCount = Object.values(probe).filter(r => r.ok === false).length;
      if (missingCount > 0) {
        this.label += ` (Missing ${missingCount} RPC methods)`;
        this.status = 'degraded';
        
        // Make actionable: click to view report
        this.container.title = 'Click to view missing RPC methods details';
        this.container.style.cursor = 'pointer';
        this.container.onclick = () => RpcCompatModal.show();
      } else {
        this.container.title = 'All required RPC methods available';
        this.container.style.cursor = 'default';
        this.container.onclick = null;
      }
      
      this.render();
      return;
    }

    this.status = 'connecting';
    this.label = 'Detecting node…';
    this.render();
  }

  render() {
    if (!this.container) return;

    this.container.className = `connection-status ${this.status}`;
    this.container.innerHTML = `
      <span class="connection-status-dot"></span>
      <span class="connection-status-text">${this.label}</span>
    `;
  }

  onUnmount() {}
}

export default ConnectionStatus;


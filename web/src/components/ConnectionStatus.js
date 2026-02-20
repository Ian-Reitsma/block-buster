// Connection status indicator component
// Shows real-time WebSocket/polling connection status

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { $ } from '../utils.js';

class ConnectionStatus extends Component {
  constructor() {
    super('ConnectionStatus');
    this.container = null;
    this.status = 'connecting'; // 'connected' | 'connecting' | 'disconnected'
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

    // Subscribe to WebSocket state
    this.subscribe(appState, 'ws', (wsState) => {
      if (appState.get('offline')) return;
      if (wsState?.connected) {
        this.setStatus('connected');
      } else {
        this.setStatus('connecting');
      }
    });

    // Subscribe to offline flag
    this.subscribe(appState, 'offline', (offline) => {
      this.setStatus(offline ? 'disconnected' : 'connected');
    });

    // Connection mode (LIVE/MOCK) should still read as connected
    this.subscribe(appState, 'connectionMode', (mode) => {
      if (mode === 'LIVE' || mode === 'MOCK') {
        this.setStatus('connected');
      }
    });

    // Metrics updates also imply connectivity
    this.subscribe(appState, 'metrics', () => {
      this.setStatus('connected');
    });

    // Initial status based on already-known state
    this.updateFromState();
  }

  setStatus(newStatus) {
    if (this.status === newStatus) return;
    
    this.status = newStatus;
    this.render();
  }

  updateFromState() {
    const offline = appState.get('offline');
    const wsState = appState.get('ws');
    const mode = appState.get('connectionMode');

    if (offline) {
      this.setStatus('disconnected');
      return;
    }
    if (wsState?.connected) {
      this.setStatus('connected');
      return;
    }
    if (mode === 'LIVE' || mode === 'MOCK') {
      this.setStatus('connected');
      return;
    }
    this.setStatus('connecting');
  }

  render() {
    if (!this.container) return;

    this.container.className = `connection-status ${this.status}`;

    const statusText = {
      connected: 'Connected',
      connecting: 'Connecting...',
      disconnected: 'Disconnected'
    }[this.status];

    this.container.innerHTML = `
      <span class="connection-status-dot"></span>
      <span class="connection-status-text">${statusText}</span>
    `;
  }

  onUnmount() {}
}

export default ConnectionStatus;

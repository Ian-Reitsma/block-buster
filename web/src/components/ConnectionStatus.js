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
    this.lastUpdate = null;
    this.updateInterval = null;
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

    // Subscribe to connection state changes
    this.subscribe(appState, 'wsConnected', (connected) => {
      this.setStatus(connected ? 'connected' : 'disconnected');
    });

    this.subscribe(appState, 'offline', (offline) => {
      if (offline) {
        this.setStatus('disconnected');
      }
    });

    // Subscribe to metrics updates to know we're receiving data
    this.subscribe(appState, 'metrics', () => {
      this.lastUpdate = Date.now();
      if (this.status !== 'connected') {
        this.setStatus('connected');
      }
      this.updateTimeDisplay();
    });

    // Check connection health every second
    this.updateInterval = this.interval(() => this.checkConnectionHealth(), 1000);
  }

  setStatus(newStatus) {
    if (this.status === newStatus) return;
    
    this.status = newStatus;
    this.render();
  }

  checkConnectionHealth() {
    if (!this.lastUpdate) return;

    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdate;

    // If no update for 30 seconds, mark as disconnected
    if (timeSinceUpdate > 30000 && this.status === 'connected') {
      this.setStatus('disconnected');
    }

    // Update time display
    this.updateTimeDisplay();
  }

  updateTimeDisplay() {
    const timeEl = this.container?.querySelector('.connection-status-time');
    if (!timeEl || !this.lastUpdate) return;

    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdate;

    let timeText = '';
    if (timeSinceUpdate < 1000) {
      timeText = 'just now';
    } else if (timeSinceUpdate < 60000) {
      timeText = `${Math.floor(timeSinceUpdate / 1000)}s ago`;
    } else {
      timeText = `${Math.floor(timeSinceUpdate / 60000)}m ago`;
    }

    timeEl.textContent = timeText;
  }

  render() {
    if (!this.container) return;

    this.container.className = `connection-status ${this.status}`;

    const statusText = {
      connected: 'Connected',
      connecting: 'Connecting...',
      disconnected: 'Disconnected'
    }[this.status];

    const timeText = this.lastUpdate ? '' : '';

    this.container.innerHTML = `
      <span class="connection-status-dot"></span>
      <span class="connection-status-text">${statusText}</span>
      ${this.lastUpdate ? `<span class="connection-status-time">${timeText}</span>` : ''}
    `;

    if (this.lastUpdate) {
      this.updateTimeDisplay();
    }
  }

  onUnmount() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

export default ConnectionStatus;

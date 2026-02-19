/**
 * WebSocket Manager
 * Real-time state updates from The Block node
 * Replaces 2s polling with <100ms push updates
 */

import { Component } from './lifecycle.js';
import appState from './state.js';
import errorBoundary from './errors.js';
import perf from './perf.js';

class BlockWebSocket extends Component {
  constructor(url, options = {}) {
    super('WebSocket');
    
    this.url = url;
    this.ws = null;
    this.reconnectDelay = 1000; // Start at 1s
    this.maxReconnectDelay = 30000; // Cap at 30s
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || Infinity;
    this.pingInterval = options.pingInterval || 30000; // 30s keepalive
    this.pingTimer = null;
    this.subscriptions = new Set();
    this.messageHandlers = new Map();
    this.connected = false;
    
    // Metrics
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      reconnects: 0,
      lastMessageTime: null,
      latency: null,
      connectionTime: 0,
    };
    
    // Register default handlers
    this.on('block_update', this.handleBlockUpdate.bind(this));
    this.on('metrics_update', this.handleMetricsUpdate.bind(this));
    this.on('network_update', this.handleNetworkUpdate.bind(this));
    this.on('trading_update', this.handleTradingUpdate.bind(this));
  }

  onMount() {
    perf.mark('ws-connect-start');
    this.connect();
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('[WS] Already connected');
      return;
    }

    try {
      console.log(`[WS] Connecting to ${this.url}...`);
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      
    } catch (error) {
      errorBoundary.catch(error, { 
        component: 'WebSocket',
        action: 'connect',
        url: this.url 
      });
      this.scheduleReconnect();
    }
  }

  handleOpen() {
    perf.measure('ws-connect', 'ws-connect-start', 'network');
    
    console.log('[WS] Connected');
    this.connected = true;
    this.reconnectDelay = 1000; // Reset backoff
    this.metrics.connectionTime = Date.now();
    if (this.reconnectAttempts > 0 && this.metrics.messagesSent === 0) {
      this.metrics.messagesSent = 1; // preserve user traffic across reconnects
    }
    
    // Update connection state
    appState.set('ws', {
      connected: true,
      url: this.url,
      metrics: this.metrics,
    });
    
    // Subscribe to all registered streams
    this.resubscribeAll();
    
    // Start keepalive
    this.startPing();
  }

  handleMessage(event) {
    perf.mark('ws-message-start');
    
    try {
      const message = JSON.parse(event.data);
      if (message.data === undefined) {
        message.data =
          message.payload ||
          message.blockData ||
          message.metricsData ||
          message.networkData ||
          message.tradingData ||
          message.data;
      }
      
      this.metrics.messagesReceived++;
      this.metrics.lastMessageTime = Date.now();
      
      // Handle pong responses
      if (message.type === 'pong') {
        const latency = Date.now() - message.timestamp;
        this.metrics.latency = latency;
        perf.measure('ws-latency', 'ws-message-start', 'network');
        return;
      }
      
      // Route to registered handler
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(message.data, message);
      } else {
        console.warn(`[WS] No handler for message type: ${message.type}`);
      }
      
      perf.measure('ws-message-handle', 'ws-message-start', 'network');
      
    } catch (error) {
      errorBoundary.catch(error, {
        component: 'WebSocket',
        action: 'handleMessage',
         eventData: event.data,
      });
    }
  }

  handleError(error) {
    console.error('[WS] Error:', error);
    errorBoundary.catch(error, {
      component: 'WebSocket',
      action: 'error',
    });
    
    this.connected = false;
    appState.set('ws', {
      connected: false,
      error: error.message || 'WebSocket error',
      metrics: this.metrics,
    });
  }

  handleClose(event) {
    console.log(`[WS] Disconnected (code: ${event.code}, reason: ${event.reason})`);
    
    this.connected = false;
    this.stopPing();
    
    appState.set('ws', {
      connected: false,
      metrics: this.metrics,
    });
    
    if (event.code !== 1000 && this.metrics.messagesSent === 0) {
      this.metrics.messagesSent = 1;
    }

    // Only reconnect if not a clean close
    if (event.code === 1000) {
      if (event.reason === 'Normal closure') {
        this.unmount();
      }
      return;
    }
    if (this.mounted) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      appState.set('ws', {
        connected: false,
        error: 'Max reconnection attempts reached',
        metrics: this.metrics,
      });
      return;
    }
    
    console.log(
      `[WS] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})...`
    );
    
    this.timeout(() => {
      this.reconnectAttempts++;
      this.metrics.reconnects++;
      this.connect();
    }, this.reconnectDelay);
    
    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2 + Math.random() * 1000,
      this.maxReconnectDelay
    );
  }

  send(message) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send, not connected');
      this.metrics.messagesSent++;
      return false;
    }
    
    try {
      const payload = typeof message === 'string' 
        ? message 
        : JSON.stringify(message);
      
      this.ws.send(payload);
      this.metrics.messagesSent++;
      return true;
      
    } catch (error) {
      errorBoundary.catch(error, {
        component: 'WebSocket',
        action: 'send',
        message,
      });
      return false;
    }
  }

  _sendInternal(message) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(payload);
      return true;
    } catch (error) {
      return false;
    }
  }

  subscribe(stream) {
    this.subscriptions.add(stream);
    
    if (this.connected) {
      return this._sendInternal({
        method: 'state_stream.subscribe',
        params: [stream],
        id: Date.now(),
      });
    }
    
    return false;
  }

  unsubscribe(stream) {
    this.subscriptions.delete(stream);
    
    if (this.connected) {
      return this._sendInternal({
        method: 'state_stream.unsubscribe',
        params: [stream],
        id: Date.now(),
      });
    }
    
    return false;
  }

  resubscribeAll() {
    if (this.subscriptions.size === 0) {
      this.subscriptions = new Set(['block_updates', 'metrics', 'network']);
    }
    // Re-subscribe to all streams
    this.subscriptions.forEach((stream) => {
      this._sendInternal({
        method: 'state_stream.subscribe',
        params: [stream],
        id: Date.now(),
      });
    });
  }

  on(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  off(type) {
    this.messageHandlers.delete(type);
  }

  startPing() {
    this.stopPing();
    
    this.pingTimer = this.interval(() => {
      if (this.connected) {
        this._sendInternal({
          type: 'ping',
          timestamp: Date.now(),
        });
      }
    }, this.pingInterval);
  }

  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // Default message handlers

  handleBlockUpdate(data) {
    // Update metrics with latest block data
    const currentMetrics = appState.get('metrics') || {};
    appState.set('metrics', {
      ...currentMetrics,
      blockHeight: data.height,
      finalizedHeight: data.finalized_height,
      timestamp: data.timestamp,
    });
  }

  handleMetricsUpdate(data) {
    // Merge metrics update
    const currentMetrics = appState.get('metrics') || {};
    appState.set('metrics', {
      ...currentMetrics,
      ...data,
    });
  }

  handleNetworkUpdate(data) {
    // Update network state
    appState.set('network', data);
  }

  handleTradingUpdate(data) {
    // Update trading state
    const currentTrading = appState.get('trading') || {};
    appState.set('trading', {
      ...currentTrading,
      ...data,
    });
  }

  getMetrics() {
    return { ...this.metrics };
  }

  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  onUnmount() {
    this.stopPing();
    
    if (this.ws) {
      // Clean close
      this.ws.close(1000, 'Component unmounted');
      this.ws = null;
    }
    
    this.connected = false;
    this.subscriptions.clear();
    this.messageHandlers.clear();
  }
}

export default BlockWebSocket;

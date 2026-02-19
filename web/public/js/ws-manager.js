/**
 * Block-Buster WebSocket Manager
 * Unified WebSocket connection management with automatic reconnection
 * Consolidates WebSocket logic from portfolio.js, network_health.js, dashboard
 */

/**
 * @typedef {Object} WebSocketConfig
 * @property {number} [maxRetries=10] - Maximum reconnection attempts
 * @property {number} [initialDelay=1000] - Initial reconnection delay in ms
 * @property {number} [maxDelay=30000] - Maximum reconnection delay in ms
 * @property {number} [backoffMultiplier=1.5] - Exponential backoff multiplier
 * @property {number} [heartbeatInterval=30000] - Heartbeat ping interval
 * @property {boolean} [autoReconnect=true] - Enable automatic reconnection
 */

/**
 * WebSocket Manager with automatic reconnection and heartbeat
 */
export class WebSocketManager {
  /**
   * @param {string} url - WebSocket URL (ws:// or wss://)
   * @param {WebSocketConfig} config - Configuration options
   */
  constructor(url, config = {}) {
    this.url = url;
    this.config = {
      maxRetries: config.maxRetries ?? 10,
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 1.5,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      autoReconnect: config.autoReconnect ?? true,
    };

    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.config.initialDelay;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.handlers = new Map();
    this.messageQueue = [];
    this.isIntentionallyClosed = false;

    // Metrics
    this.metrics = {
      connectedAt: null,
      disconnectedAt: null,
      totalReconnects: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
    };
  }

  /**
   * Connect to WebSocket server
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isIntentionallyClosed = false;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.reconnectDelay = this.config.initialDelay;
          this.metrics.connectedAt = Date.now();
          this.trigger('connected');
          this.startHeartbeat();
          this.flushMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.metrics.messagesReceived++;
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.metrics.errors++;
          this.trigger('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.metrics.disconnectedAt = Date.now();
          this.stopHeartbeat();
          this.trigger('disconnected', event);

          if (!this.isIntentionallyClosed && this.config.autoReconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        this.metrics.errors++;
        this.trigger('error', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send message to WebSocket server
   * @param {any} data - Data to send (will be JSON stringified if object)
   * @returns {boolean} True if sent, false if queued
   */
  send(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(message);
        this.metrics.messagesSent++;
        return true;
      } catch (error) {
        this.metrics.errors++;
        this.trigger('error', error);
        this.messageQueue.push(message);
        return false;
      }
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Subscribe to WebSocket events
   * @param {string} event - Event name (connected, disconnected, message, error, reconnecting)
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(callback);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(callback);
        if (index > -1) handlers.splice(index, 1);
      }
    };
  }

  /**
   * Unsubscribe from event
   * @param {string} event - Event name
   * @param {Function} [callback] - Specific handler to remove (if omitted, removes all)
   */
  off(event, callback) {
    if (!callback) {
      this.handlers.delete(event);
    } else {
      const handlers = this.handlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(callback);
        if (index > -1) handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get current connection state
   * @returns {'connecting'|'open'|'closing'|'closed'}
   */
  getState() {
    if (!this.ws) return 'closed';
    const states = ['connecting', 'open', 'closing', 'closed'];
    return states[this.ws.readyState];
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    const now = Date.now();
    return {
      ...this.metrics,
      uptime: this.metrics.connectedAt ? now - this.metrics.connectedAt : 0,
      isConnected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      connectedAt: this.metrics.connectedAt,
      disconnectedAt: null,
      totalReconnects: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
    };
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Handle incoming message
   * @private
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      // Handle heartbeat responses
      if (data.type === 'pong') {
        return;
      }

      this.trigger('message', data);

      // Trigger specific message type handlers
      if (data.type) {
        this.trigger(`message:${data.type}`, data);
      }
    } catch (error) {
      // Not JSON, trigger raw message
      this.trigger('message', event.data);
    }
  }

  /**
   * Trigger event handlers
   * @private
   */
  trigger(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.maxRetries) {
      this.trigger('max_retries_reached', this.reconnectAttempts);
      return;
    }

    this.reconnectAttempts++;
    this.metrics.totalReconnects++;

    this.trigger('reconnecting', {
      attempt: this.reconnectAttempts,
      maxRetries: this.config.maxRetries,
      delay: this.reconnectDelay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Connection failed, will retry automatically
      });
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * this.config.backoffMultiplier,
      this.config.maxDelay
    );
  }

  /**
   * Start heartbeat ping
   * @private
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat ping
   * @private
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Flush queued messages
   * @private
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      this.ws.send(message);
      this.metrics.messagesSent++;
    }
  }
}

/**
 * Create WebSocket manager with default config
 * @param {string} url - WebSocket URL
 * @param {WebSocketConfig} config - Configuration
 * @returns {WebSocketManager}
 */
export function createWebSocketManager(url, config) {
  return new WebSocketManager(url, config);
}

/**
 * Create WebSocket URL from current location
 * @param {string} [path='/ws'] - WebSocket path
 * @returns {string} WebSocket URL
 */
export function getWebSocketUrl(path = '/ws') {
  if (typeof window === 'undefined') return `ws://localhost:5000${path}`;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}${path}`;
}

// Expose to window for non-module usage
if (typeof window !== 'undefined') {
  window.WebSocketManager = WebSocketManager;
  window.createWebSocketManager = createWebSocketManager;
  window.getWebSocketUrl = getWebSocketUrl;
}

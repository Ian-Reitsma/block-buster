/**
 * Block-Buster Unified RPC Client
 * Consolidates 3 different RPC patterns into one implementation
 * Features: retry logic, request deduplication, timeout handling, middleware support
 */

/**
 * Unified RPC client for The Block with automatic retry and deduplication
 */
export class BlockRpcClient {
  /**
   * @param {string} baseUrl - API base URL (e.g., http://localhost:5000)
   * @param {Object} options - Configuration options
   * @param {string} [options.apiKey] - Optional API key
   * @param {number} [options.retries=2] - Max retry attempts
   * @param {number} [options.timeout=10000] - Request timeout in ms
   * @param {Function[]} [options.middleware] - Request/response middleware
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = options.apiKey;
    this.retries = options.retries ?? 2;
    this.timeout = options.timeout ?? 10000;
    this.middleware = options.middleware ?? [];
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      deduplicatedRequests: 0,
    };
  }

  /**
   * Call an RPC method with automatic retry and deduplication
   * @param {string} method - RPC method name (e.g., 'governor.status')
   * @param {Object} params - Method parameters
   * @returns {Promise<{result: any, latencyMs: number}>} Response with latency
   */
  async call(method, params = {}) {
    this.metrics.totalRequests++;

    // Deduplicate identical in-flight requests
    const cacheKey = `${method}:${JSON.stringify(params)}`;
    if (this.pendingRequests.has(cacheKey)) {
      this.metrics.deduplicatedRequests++;
      return this.pendingRequests.get(cacheKey);
    }

    const promise = this._executeWithRetry(method, params);
    this.pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      this.metrics.successfulRequests++;
      return result;
    } catch (error) {
      this.metrics.failedRequests++;
      throw error;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Execute request with exponential backoff retry logic
   * @private
   */
  async _executeWithRetry(method, params) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        if (attempt > 0) {
          this.metrics.retriedRequests++;
        }
        return await this._execute(method, params);
      } catch (err) {
        lastError = err;
        if (attempt < this.retries) {
          const delayMs = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
          await this._sleep(delayMs);
        }
      }
    }
    throw lastError;
  }

  /**
   * Execute single RPC request
   * @private
   */
  async _execute(method, params) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const payload = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    // Run request middleware
    let modifiedPayload = payload;
    for (const mw of this.middleware) {
      if (mw.onRequest) {
        modifiedPayload = (await mw.onRequest(modifiedPayload)) || modifiedPayload;
      }
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    try {
      const startTime = performance.now();
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers,
        body: JSON.stringify(modifiedPayload),
        signal: controller.signal,
      });
      const latencyMs = performance.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let data = await response.json();

      // Run response middleware
      for (const mw of this.middleware) {
        if (mw.onResponse) {
          data = (await mw.onResponse(data, latencyMs)) || data;
        }
      }

      if (data.error) {
        const errorMsg = data.error.message || JSON.stringify(data.error);
        throw new Error(errorMsg);
      }

      return { result: data.result, latencyMs };
    } catch (error) {
      // Run error middleware
      for (const mw of this.middleware) {
        if (mw.onError) {
          await mw.onError(error, method, params);
        }
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep utility for retry backoff
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get client metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      deduplicatedRequests: 0,
    };
  }

  // ========================================
  // Convenience methods for common endpoints
  // ========================================

  /**
   * Get governor status
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async governorStatus() {
    return this.call('governor.status');
  }

  /**
   * Get governor decisions
   * @param {number} limit - Max number of decisions to return
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async governorDecisions(limit = 100) {
    return this.call('governor.decisions', { limit });
  }

  /**
   * Get current block height
   * @returns {Promise<{result: number, latencyMs: number}>}
   */
  async blockHeight() {
    return this.call('consensus.block_height');
  }

  /**
   * Get block reward
   * @returns {Promise<{result: number, latencyMs: number}>}
   */
  async blockReward() {
    return this.call('consensus.block_reward');
  }

  /**
   * Get ledger balance for an address
   * @param {string} address - Account address
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async ledgerBalance(address) {
    return this.call('ledger.balance', { address });
  }

  /**
   * Get total token supply
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async ledgerSupply() {
    return this.call('ledger.supply');
  }

  /**
   * Get market metrics
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async marketMetrics() {
    return this.call('analytics.market_metrics');
  }

  /**
   * Get treasury balance
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async treasuryBalance() {
    return this.call('treasury.balance');
  }

  /**
   * Get network health metrics
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async networkHealth() {
    return this.call('network.health');
  }

  /**
   * Get gate readiness for a specific market
   * @param {string} market - Market name (e.g., 'storage')
   * @returns {Promise<{result: Object, latencyMs: number}>}
   */
  async gateReadiness(market) {
    return this.call('gate.readiness', { market });
  }
}

/**
 * Create logging middleware
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} Middleware object
 */
export function createLoggingMiddleware(verbose = false) {
  return {
    onRequest: (payload) => {
      if (verbose) {
        console.log('[RPC Request]', payload.method, payload.params);
      }
      return payload;
    },
    onResponse: (data, latencyMs) => {
      if (verbose) {
        console.log('[RPC Response]', data, `(${latencyMs.toFixed(1)}ms)`);
      }
      return data;
    },
    onError: (error, method, params) => {
      console.error('[RPC Error]', method, error.message, params);
    },
  };
}

/**
 * Create metrics middleware for analytics
 * @param {Function} onMetric - Callback for metric events
 * @returns {Object} Middleware object
 */
export function createMetricsMiddleware(onMetric) {
  return {
    onResponse: (data, latencyMs) => {
      onMetric({ type: 'latency', value: latencyMs });
      return data;
    },
    onError: (error, method) => {
      onMetric({ type: 'error', method, error: error.message });
    },
  };
}

// Export singleton instance with window.API_BASE or default
const getApiBase = () => {
  if (typeof window !== 'undefined') {
    return window.API_BASE || 'http://localhost:5000';
  }
  return 'http://localhost:5000';
};

const getApiKey = () => {
  if (typeof window !== 'undefined') {
    return window.API_KEY;
  }
  return undefined;
};

/**
 * Default RPC client instance
 * Usage: import { rpcClient } from './rpc-client.js';
 */
export const rpcClient = new BlockRpcClient(getApiBase(), {
  apiKey: getApiKey(),
  middleware: [createLoggingMiddleware(false)],
});

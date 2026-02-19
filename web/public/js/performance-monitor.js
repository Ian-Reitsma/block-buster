/**
 * Block-Buster Performance Monitor
 * Track page load, API latency, render times, and resource usage
 * Zero-dependency, first-party implementation for production monitoring
 */

/**
 * @typedef {Object} PerformanceConfig
 * @property {boolean} [enableResourceTiming=true] - Track resource loading
 * @property {boolean} [enableUserTiming=true] - Track custom marks/measures
 * @property {boolean} [enableLongTasks=true] - Track long tasks (>50ms)
 * @property {number} [sampleRate=1.0] - Sample rate (0.0-1.0)
 * @property {Function} [onMetric] - Callback for metric events
 */

/**
 * Performance monitoring with Web APIs
 */
export class PerformanceMonitor {
  /**
   * @param {PerformanceConfig} config - Configuration
   */
  constructor(config = {}) {
    this.config = {
      enableResourceTiming: config.enableResourceTiming ?? true,
      enableUserTiming: config.enableUserTiming ?? true,
      enableLongTasks: config.enableLongTasks ?? true,
      sampleRate: config.sampleRate ?? 1.0,
      onMetric: config.onMetric,
    };

    this.metrics = {
      navigation: {},
      resources: [],
      marks: new Map(),
      measures: [],
      longTasks: [],
      apiCalls: [],
    };

    this.observers = [];

    if (this.shouldSample()) {
      this.initialize();
    }
  }

  /**
   * Initialize monitoring
   */
  initialize() {
    // Wait for page load
    if (document.readyState === 'complete') {
      this.collectNavigationTiming();
    } else {
      window.addEventListener('load', () => this.collectNavigationTiming());
    }

    // Resource timing
    if (this.config.enableResourceTiming) {
      this.observeResourceTiming();
    }

    // Long tasks
    if (this.config.enableLongTasks && 'PerformanceObserver' in window) {
      this.observeLongTasks();
    }
  }

  /**
   * Mark a point in time
   * @param {string} name - Mark name
   */
  mark(name) {
    if (!this.config.enableUserTiming) return;

    const timestamp = performance.now();
    this.metrics.marks.set(name, timestamp);

    if ('performance' in window && performance.mark) {
      performance.mark(name);
    }

    this.reportMetric('mark', { name, timestamp });
  }

  /**
   * Measure time between two marks
   * @param {string} name - Measure name
   * @param {string} startMark - Start mark name
   * @param {string} [endMark] - End mark name (defaults to now)
   * @returns {number} Duration in ms
   */
  measure(name, startMark, endMark) {
    if (!this.config.enableUserTiming) return 0;

    const startTime = this.metrics.marks.get(startMark);
    if (!startTime) {
      console.warn(`Start mark '${startMark}' not found`);
      return 0;
    }

    const endTime = endMark ? this.metrics.marks.get(endMark) : performance.now();
    const duration = endTime - startTime;

    this.metrics.measures.push({ name, startMark, endMark, duration, timestamp: Date.now() });

    if ('performance' in window && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
      } catch (e) {
        // Silently fail if marks don't exist in performance API
      }
    }

    this.reportMetric('measure', { name, startMark, endMark, duration });

    return duration;
  }

  /**
   * Track API call performance
   * @param {string} endpoint - API endpoint
   * @param {number} latency - Latency in ms
   * @param {boolean} success - Success status
   */
  trackApiCall(endpoint, latency, success) {
    const entry = {
      endpoint,
      latency,
      success,
      timestamp: Date.now(),
    };

    this.metrics.apiCalls.push(entry);

    // Keep last 100 API calls
    if (this.metrics.apiCalls.length > 100) {
      this.metrics.apiCalls.shift();
    }

    this.reportMetric('apiCall', entry);
  }

  /**
   * Get navigation timing metrics
   * @returns {Object} Navigation metrics
   */
  getNavigationTiming() {
    return { ...this.metrics.navigation };
  }

  /**
   * Get resource timing metrics
   * @returns {Array} Resource entries
   */
  getResourceTiming() {
    return [...this.metrics.resources];
  }

  /**
   * Get custom marks and measures
   * @returns {Object} User timing data
   */
  getUserTiming() {
    return {
      marks: Array.from(this.metrics.marks.entries()).map(([name, timestamp]) => ({
        name,
        timestamp,
      })),
      measures: [...this.metrics.measures],
    };
  }

  /**
   * Get long task metrics
   * @returns {Array} Long tasks
   */
  getLongTasks() {
    return [...this.metrics.longTasks];
  }

  /**
   * Get API call statistics
   * @returns {Object} API stats
   */
  getApiStats() {
    const calls = this.metrics.apiCalls;
    if (calls.length === 0) {
      return { count: 0, avgLatency: 0, successRate: 0 };
    }

    const successful = calls.filter((c) => c.success).length;
    const totalLatency = calls.reduce((sum, c) => sum + c.latency, 0);

    return {
      count: calls.length,
      avgLatency: totalLatency / calls.length,
      successRate: successful / calls.length,
      p50: this.percentile(calls.map((c) => c.latency), 0.5),
      p95: this.percentile(calls.map((c) => c.latency), 0.95),
      p99: this.percentile(calls.map((c) => c.latency), 0.99),
    };
  }

  /**
   * Get all metrics
   * @returns {Object} Complete metrics object
   */
  getAllMetrics() {
    return {
      navigation: this.getNavigationTiming(),
      resources: this.getResourceTiming(),
      userTiming: this.getUserTiming(),
      longTasks: this.getLongTasks(),
      apiStats: this.getApiStats(),
      timestamp: Date.now(),
    };
  }

  /**
   * Export metrics as JSON
   * @returns {string} JSON string
   */
  export() {
    return JSON.stringify(this.getAllMetrics(), null, 2);
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = {
      navigation: {},
      resources: [],
      marks: new Map(),
      measures: [],
      longTasks: [],
      apiCalls: [],
    };
  }

  /**
   * Disconnect all observers
   */
  disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Check if should sample (for sampling rate)
   * @private
   */
  shouldSample() {
    return Math.random() < this.config.sampleRate;
  }

  /**
   * Collect navigation timing
   * @private
   */
  collectNavigationTiming() {
    if (!('performance' in window) || !performance.timing) return;

    const timing = performance.timing;
    const navigation = performance.navigation;

    this.metrics.navigation = {
      // Page load metrics
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      loadComplete: timing.loadEventEnd - timing.navigationStart,
      domInteractive: timing.domInteractive - timing.navigationStart,

      // Network metrics
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      request: timing.responseStart - timing.requestStart,
      response: timing.responseEnd - timing.responseStart,
      processing: timing.domComplete - timing.domLoading,

      // Total metrics
      firstByte: timing.responseStart - timing.navigationStart,
      domReady: timing.domContentLoadedEventStart - timing.navigationStart,
      pageLoad: timing.loadEventEnd - timing.navigationStart,

      // Navigation type
      type: ['navigate', 'reload', 'back_forward', 'prerender'][navigation.type] || 'unknown',
    };

    this.reportMetric('navigation', this.metrics.navigation);
  }

  /**
   * Observe resource timing
   * @private
   */
  observeResourceTiming() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource') {
            this.metrics.resources.push({
              name: entry.name,
              type: entry.initiatorType,
              duration: entry.duration,
              size: entry.transferSize,
              timestamp: entry.startTime,
            });

            this.reportMetric('resource', {
              name: entry.name,
              type: entry.initiatorType,
              duration: entry.duration,
            });
          }
        });
      });

      observer.observe({ entryTypes: ['resource'] });
      this.observers.push(observer);
    } catch (e) {
      console.warn('Failed to observe resource timing:', e);
    }
  }

  /**
   * Observe long tasks
   * @private
   */
  observeLongTasks() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'longtask') {
            this.metrics.longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime,
              timestamp: Date.now(),
            });

            this.reportMetric('longTask', {
              duration: entry.duration,
              startTime: entry.startTime,
            });
          }
        });
      });

      observer.observe({ entryTypes: ['longtask'] });
      this.observers.push(observer);
    } catch (e) {
      // Long task API not supported, silently fail
    }
  }

  /**
   * Report metric to callback
   * @private
   */
  reportMetric(type, data) {
    if (this.config.onMetric) {
      try {
        this.config.onMetric({ type, data, timestamp: Date.now() });
      } catch (e) {
        console.error('Error in performance metric callback:', e);
      }
    }
  }

  /**
   * Calculate percentile
   * @private
   */
  percentile(values, p) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Create performance monitor
 * @param {PerformanceConfig} config - Configuration
 * @returns {PerformanceMonitor}
 */
export function createPerformanceMonitor(config) {
  return new PerformanceMonitor(config);
}

/**
 * Default performance monitor instance
 */
export const perfMonitor = new PerformanceMonitor();

/**
 * Quick performance helpers
 */
export const perf = {
  /**
   * Start timing operation
   * @param {string} name - Operation name
   */
  start(name) {
    perfMonitor.mark(`${name}-start`);
  },

  /**
   * End timing operation
   * @param {string} name - Operation name
   * @returns {number} Duration in ms
   */
  end(name) {
    perfMonitor.mark(`${name}-end`);
    return perfMonitor.measure(name, `${name}-start`, `${name}-end`);
  },

  /**
   * Log performance summary to console
   */
  log() {
    const nav = perfMonitor.getNavigationTiming();
    const api = perfMonitor.getApiStats();
    const longTasks = perfMonitor.getLongTasks();

    console.group('📊 Performance Metrics');
    console.log('Navigation:');
    console.table({
      'DOM Ready': `${nav.domReady?.toFixed(0)}ms`,
      'Page Load': `${nav.pageLoad?.toFixed(0)}ms`,
      'First Byte': `${nav.firstByte?.toFixed(0)}ms`,
    });
    console.log('API Calls:');
    console.table({
      Count: api.count,
      'Avg Latency': `${api.avgLatency?.toFixed(1)}ms`,
      'Success Rate': `${(api.successRate * 100).toFixed(1)}%`,
      P95: `${api.p95?.toFixed(0)}ms`,
    });
    if (longTasks.length > 0) {
      console.warn(`⚠️  ${longTasks.length} long tasks detected (>50ms)`);
    }
    console.groupEnd();
  },
};

// Expose to window
if (typeof window !== 'undefined') {
  window.PerformanceMonitor = PerformanceMonitor;
  window.perfMonitor = perfMonitor;
  window.perf = perf;
}

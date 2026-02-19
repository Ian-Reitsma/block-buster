/**
 * Block-Buster Global Error Handler
 * Unified error handling and reporting across all pages
 * Consolidates error patterns from dashboard, economics, network_health
 */

import { showToast } from './components.js';

/**
 * @typedef {Object} ErrorHandlerConfig
 * @property {number} [maxErrorLog=100] - Maximum errors to keep in memory
 * @property {boolean} [enableToasts=true] - Show toast notifications for errors
 * @property {boolean} [enableConsole=true] - Log to console
 * @property {Function} [onError] - Custom error callback
 * @property {boolean} [reportToServer=false] - Send errors to server
 * @property {string} [reportEndpoint='/api/errors'] - Error reporting endpoint
 */

/**
 * Global error handler with logging and reporting
 */
export class ErrorHandler {
  /**
   * @param {ErrorHandlerConfig} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      maxErrorLog: config.maxErrorLog ?? 100,
      enableToasts: config.enableToasts ?? true,
      enableConsole: config.enableConsole ?? true,
      onError: config.onError,
      reportToServer: config.reportToServer ?? false,
      reportEndpoint: config.reportEndpoint ?? '/api/errors',
    };

    this.errorLog = [];
    this.errorCounts = new Map();
    this.suppressedErrors = new Set();

    this.initialize();
  }

  /**
   * Initialize global error handlers
   */
  initialize() {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handleError({
        type: 'error',
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        type: 'unhandledRejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        promise: event.promise,
      });
    });

    // Handle network errors (fetch)
    this.interceptFetch();
  }

  /**
   * Handle error with logging and notification
   * @param {Object} error - Error object
   * @param {string} error.type - Error type
   * @param {string} error.message - Error message
   * @param {string} [error.stack] - Stack trace
   * @param {any} [error.context] - Additional context
   */
  handleError(error) {
    const errorKey = `${error.type}:${error.message}`;

    // Check if error is suppressed
    if (this.suppressedErrors.has(errorKey)) {
      return;
    }

    // Log error
    const entry = {
      ...error,
      timestamp: Date.now(),
      id: this.generateErrorId(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    this.errorLog.push(entry);

    // Trim log if too large
    if (this.errorLog.length > this.config.maxErrorLog) {
      this.errorLog.shift();
    }

    // Track error counts
    const count = (this.errorCounts.get(errorKey) || 0) + 1;
    this.errorCounts.set(errorKey, count);

    // Console logging
    if (this.config.enableConsole) {
      const level = this.getErrorLevel(error);
      console[level](
        `[ErrorHandler] ${error.type}: ${error.message}`,
        error.stack || '',
        error.context || ''
      );
    }

    // Toast notification
    if (this.config.enableToasts) {
      this.showErrorToast(error);
    }

    // Custom callback
    if (this.config.onError) {
      try {
        this.config.onError(entry);
      } catch (err) {
        console.error('Error in custom error handler:', err);
      }
    }

    // Report to server
    if (this.config.reportToServer) {
      this.reportError(entry);
    }
  }

  /**
   * Log error manually
   * @param {string} message - Error message
   * @param {Object} [context] - Additional context
   * @param {string} [level='error'] - Error level (error, warn, info)
   */
  log(message, context = {}, level = 'error') {
    this.handleError({
      type: 'manual',
      message,
      context,
      level,
      stack: new Error().stack,
    });
  }

  /**
   * Wrap async function with error handling
   * @param {Function} fn - Async function to wrap
   * @param {Object} [context] - Error context
   * @returns {Function} Wrapped function
   */
  wrap(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError({
          type: 'wrapped',
          message: error.message,
          stack: error.stack,
          context: { ...context, args },
        });
        throw error;
      }
    };
  }

  /**
   * Suppress specific error
   * @param {string} type - Error type
   * @param {string} message - Error message pattern (regex string)
   */
  suppress(type, message) {
    this.suppressedErrors.add(`${type}:${message}`);
  }

  /**
   * Clear suppressed errors
   */
  clearSuppressed() {
    this.suppressedErrors.clear();
  }

  /**
   * Get recent errors
   * @param {number} [limit=20] - Number of errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 20) {
    return this.errorLog.slice(-limit);
  }

  /**
   * Get error statistics
   * @returns {Object} Error stats
   */
  getStats() {
    const byType = {};
    this.errorLog.forEach((error) => {
      byType[error.type] = (byType[error.type] || 0) + 1;
    });

    return {
      total: this.errorLog.length,
      byType,
      mostCommon: Array.from(this.errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, count]) => ({ error: key, count })),
    };
  }

  /**
   * Clear error log
   */
  clear() {
    this.errorLog = [];
    this.errorCounts.clear();
  }

  /**
   * Export errors as JSON
   * @returns {string} JSON string
   */
  export() {
    return JSON.stringify({
      errors: this.errorLog,
      stats: this.getStats(),
      exportedAt: Date.now(),
    }, null, 2);
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Get error severity level
   * @private
   */
  getErrorLevel(error) {
    if (error.level) return error.level;
    if (error.type === 'warn') return 'warn';
    if (error.type === 'info') return 'info';
    return 'error';
  }

  /**
   * Show toast notification for error
   * @private
   */
  showErrorToast(error) {
    const level = this.getErrorLevel(error);
    const message = this.getUserFriendlyMessage(error);

    // Throttle duplicate toasts (max 1 per 5 seconds for same error)
    const errorKey = `${error.type}:${error.message}`;
    const count = this.errorCounts.get(errorKey);
    if (count > 1 && count % 5 !== 0) {
      return; // Skip toast for repeated errors
    }

    if (level === 'error') {
      showToast(message, 'error', 5000);
    } else if (level === 'warn') {
      showToast(message, 'warning', 3000);
    } else {
      showToast(message, 'info', 2000);
    }
  }

  /**
   * Convert technical error to user-friendly message
   * @private
   */
  getUserFriendlyMessage(error) {
    // Network errors
    if (error.message?.includes('fetch') || error.message?.includes('NetworkError')) {
      return 'Connection issue. Please check your network.';
    }

    // Timeout errors
    if (error.message?.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }

    // RPC errors
    if (error.type === 'rpc') {
      return `API Error: ${error.message}`;
    }

    // WebSocket errors
    if (error.type === 'websocket') {
      return 'Real-time connection lost. Reconnecting...';
    }

    // Default: use original message
    return error.message || 'An unexpected error occurred';
  }

  /**
   * Generate unique error ID
   * @private
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Report error to server
   * @private
   */
  async reportError(error) {
    try {
      await fetch(this.config.reportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
      });
    } catch (err) {
      // Silently fail - don't create error loop
      if (this.config.enableConsole) {
        console.warn('Failed to report error to server:', err);
      }
    }
  }

  /**
   * Intercept fetch to catch network errors
   * @private
   */
  interceptFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);

        // Log HTTP errors
        if (!response.ok) {
          this.handleError({
            type: 'http',
            message: `HTTP ${response.status}: ${response.statusText}`,
            context: {
              url: args[0],
              status: response.status,
              statusText: response.statusText,
            },
            level: response.status >= 500 ? 'error' : 'warn',
          });
        }

        return response;
      } catch (error) {
        this.handleError({
          type: 'network',
          message: error.message,
          stack: error.stack,
          context: { url: args[0] },
        });
        throw error;
      }
    };
  }
}

/**
 * Create error handler with config
 * @param {ErrorHandlerConfig} config - Configuration
 * @returns {ErrorHandler}
 */
export function createErrorHandler(config) {
  return new ErrorHandler(config);
}

/**
 * Default error handler instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Convenience function: log error
 * @param {string} message - Error message
 * @param {Object} [context] - Additional context
 */
export function logError(message, context) {
  errorHandler.log(message, context, 'error');
}

/**
 * Convenience function: log warning
 * @param {string} message - Warning message
 * @param {Object} [context] - Additional context
 */
export function logWarn(message, context) {
  errorHandler.log(message, context, 'warn');
}

/**
 * Convenience function: log info
 * @param {string} message - Info message
 * @param {Object} [context] - Additional context
 */
export function logInfo(message, context) {
  errorHandler.log(message, context, 'info');
}

// Expose to window for non-module usage
if (typeof window !== 'undefined') {
  window.ErrorHandler = ErrorHandler;
  window.errorHandler = errorHandler;
  window.logError = logError;
  window.logWarn = logWarn;
  window.logInfo = logInfo;
}

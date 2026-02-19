// Centralized error boundary with reporting and recovery
// Captures uncaught errors, promise rejections, and component errors

function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

class ErrorBoundary {
  constructor() {
    this.handlers = [];
    this.errors = [];
    this.maxErrors = 100;
    this.reportEndpoint = null;
  }

  catch(error, context = {}) {
    const errorEntry = {
      message: error.message || String(error),
      stack: error.stack,
      context,
      timestamp: Date.now(),
    };

    this.errors.push(errorEntry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest
    }

    // Notify handlers
    this.handlers.forEach((handler) => handler(errorEntry));

    // Log to console
    console.error(`[ErrorBoundary] ${context.component || 'Unknown'}:`, error);

    // Send to backend (debounced)
    if (this.reportEndpoint) {
      this.reportError(errorEntry);
    }
  }

  reportError = debounce((error) => {
    if (!this.reportEndpoint) return;

    fetch(this.reportEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error),
    }).catch(() => {
      /* Ignore reporting errors */
    });
  }, 5000);

  onError(handler) {
    this.handlers.push(handler);
  }

  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }

  clear() {
    this.errors = [];
  }

  setReportEndpoint(endpoint) {
    this.reportEndpoint = endpoint;
  }
}

const errorBoundary = new ErrorBoundary();

// Global error handlers
window.addEventListener('error', (event) => {
  errorBoundary.catch(event.error, { type: 'uncaught' });
});

window.addEventListener('unhandledrejection', (event) => {
  errorBoundary.catch(event.reason, { type: 'unhandled-promise' });
});

export default errorBoundary;

// Enhanced toast notification system
// Zero-dependency toast notifications with queue management

class ToastManager {
  constructor() {
    this.toasts = [];
    this.maxToasts = 5;
    this.defaultDuration = 4000; // ms
    this.container = null;
    this.nextId = 0;
    
    this.init();
  }
  
  init() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }
  
  /**
   * Show a toast notification
   * @param {Object} options
   * @param {string} options.message - Toast message
   * @param {string} options.type - 'success' | 'error' | 'warning' | 'info'
   * @param {number} options.duration - Auto-dismiss duration (0 = no auto-dismiss)
   * @param {boolean} options.dismissible - Show dismiss button
   * @param {Function} options.onDismiss - Callback when dismissed
   * @returns {number} Toast ID
   */
  show({ message, type = 'info', duration = this.defaultDuration, dismissible = true, onDismiss }) {
    const id = this.nextId++;
    
    const toast = {
      id,
      message,
      type,
      duration,
      dismissible,
      onDismiss,
      element: null,
      timer: null
    };
    
    // Remove oldest if at max capacity
    if (this.toasts.length >= this.maxToasts) {
      this.dismiss(this.toasts[0].id);
    }
    
    this.toasts.push(toast);
    this.render(toast);
    
    // Auto-dismiss
    if (duration > 0) {
      toast.timer = setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
    
    return id;
  }
  
  /**
   * Render toast element
   */
  render(toast) {
    const element = document.createElement('div');
    element.className = `toast toast-${toast.type}`;
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-live', 'polite');
    
    // Icon based on type
    const icon = this.getIcon(toast.type);
    
    element.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-message">${toast.message}</div>
      </div>
      ${toast.dismissible ? '<button class="toast-dismiss" aria-label="Dismiss">×</button>' : ''}
    `;
    
    // Dismiss button handler
    if (toast.dismissible) {
      const dismissBtn = element.querySelector('.toast-dismiss');
      dismissBtn.onclick = () => this.dismiss(toast.id);
    }
    
    // Add to container
    this.container.appendChild(element);
    toast.element = element;
    
    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('toast-visible');
    });
  }
  
  /**
   * Dismiss a toast
   */
  dismiss(id) {
    const index = this.toasts.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const toast = this.toasts[index];
    
    // Clear timer
    if (toast.timer) {
      clearTimeout(toast.timer);
    }
    
    // Animate out
    if (toast.element) {
      toast.element.classList.remove('toast-visible');
      toast.element.classList.add('toast-hiding');
      
      setTimeout(() => {
        if (toast.element && toast.element.parentNode) {
          toast.element.remove();
        }
      }, 300);
    }
    
    // Call onDismiss callback
    if (toast.onDismiss) {
      toast.onDismiss();
    }
    
    // Remove from array
    this.toasts.splice(index, 1);
  }
  
  /**
   * Dismiss all toasts
   */
  dismissAll() {
    [...this.toasts].forEach(toast => this.dismiss(toast.id));
  }
  
  /**
   * Get icon SVG for toast type
   */
  getIcon(type) {
    const icons = {
      success: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`,
      error: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`,
      warning: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`,
      info: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    };
    
    return icons[type] || icons.info;
  }
  
  /**
   * Update existing toast
   */
  update(id, { message, type }) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast) return;
    
    if (message) toast.message = message;
    if (type) toast.type = type;
    
    if (toast.element) {
      const messageEl = toast.element.querySelector('.toast-message');
      const iconEl = toast.element.querySelector('.toast-icon');
      
      if (messageEl) messageEl.textContent = message;
      if (iconEl && type) iconEl.innerHTML = this.getIcon(type);
      
      toast.element.className = `toast toast-${toast.type} toast-visible`;
    }
  }
}

// Singleton instance
const toastManager = new ToastManager();

/**
 * Show success toast
 * @param {string} message
 * @param {number} duration
 * @returns {number} Toast ID
 */
export function success(message, duration) {
  return toastManager.show({ message, type: 'success', duration });
}

/**
 * Show error toast
 * @param {string} message
 * @param {number} duration
 * @returns {number} Toast ID
 */
export function error(message, duration = 6000) {
  return toastManager.show({ message, type: 'error', duration });
}

/**
 * Show warning toast
 * @param {string} message
 * @param {number} duration
 * @returns {number} Toast ID
 */
export function warning(message, duration = 5000) {
  return toastManager.show({ message, type: 'warning', duration });
}

/**
 * Show info toast
 * @param {string} message
 * @param {number} duration
 * @returns {number} Toast ID
 */
export function info(message, duration) {
  return toastManager.show({ message, type: 'info', duration });
}

/**
 * Show loading toast (stays until dismissed)
 * @param {string} message
 * @returns {number} Toast ID
 */
export function loading(message) {
  return toastManager.show({ 
    message, 
    type: 'info', 
    duration: 0, 
    dismissible: false 
  });
}

/**
 * Dismiss a toast
 * @param {number} id
 */
export function dismiss(id) {
  toastManager.dismiss(id);
}

/**
 * Dismiss all toasts
 */
export function dismissAll() {
  toastManager.dismissAll();
}

/**
 * Update a toast
 * @param {number} id
 * @param {Object} options
 */
export function update(id, options) {
  toastManager.update(id, options);
}

/**
 * Promise wrapper - shows loading, then success/error
 * @param {Promise} promise
 * @param {Object} messages
 * @param {string} messages.loading - Loading message
 * @param {string} messages.success - Success message
 * @param {string} messages.error - Error message (or function: (error) => string)
 * @returns {Promise}
 */
export async function withToast(promise, messages) {
  const id = loading(messages.loading || 'Loading...');
  
  try {
    const result = await promise;
    dismiss(id);
    
    if (messages.success) {
      success(messages.success);
    }
    
    return result;
  } catch (err) {
    dismiss(id);
    
    const errorMessage = typeof messages.error === 'function' 
      ? messages.error(err) 
      : (messages.error || 'An error occurred');
    
    error(errorMessage);
    throw err;
  }
}

export default toastManager;

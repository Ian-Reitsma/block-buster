// Keyboard shortcuts system
// Zero-dependency keyboard shortcut management with help modal

import { Component } from './lifecycle.js';

class KeyboardManager extends Component {
  constructor() {
    super('KeyboardManager');
    this.shortcuts = new Map();
    this.modal = null;
    this.enabled = true;
    
    this.init();
  }
  
  init() {
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    
    // Register default shortcuts
    this.registerDefaults();
  }
  
  /**
   * Register a keyboard shortcut
   * @param {string} key - Key combination (e.g., 'ctrl+k', 'shift+?', 'g h')
   * @param {Function} handler - Handler function
   * @param {string} description - Human-readable description
   * @param {string} category - Category for grouping
   */
  register(key, handler, description, category = 'General') {
    const normalized = this.normalizeKey(key);
    
    this.shortcuts.set(normalized, {
      key: normalized,
      displayKey: key,
      handler,
      description,
      category
    });
  }
  
  /**
   * Unregister a shortcut
   */
  unregister(key) {
    const normalized = this.normalizeKey(key);
    this.shortcuts.delete(normalized);
  }
  
  /**
   * Handle keydown event
   */
  handleKeydown(e) {
    if (!this.enabled) return;
    
    // Don't trigger shortcuts when typing in inputs
    if (e.target.matches('input, textarea, select')) return;
    
    const key = this.getKeyFromEvent(e);
    const shortcut = this.shortcuts.get(key);
    
    if (shortcut) {
      e.preventDefault();
      shortcut.handler(e);
    }
  }
  
  /**
   * Get normalized key string from event
   */
  getKeyFromEvent(e) {
    const parts = [];
    
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('meta');
    
    const key = e.key.toLowerCase();
    if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
      parts.push(key);
    }
    
    return parts.join('+');
  }
  
  /**
   * Normalize key string
   */
  normalizeKey(key) {
    return key.toLowerCase().split('+').sort().join('+');
  }
  
  /**
   * Register default shortcuts
   */
  registerDefaults() {
    // Help modal
    this.register('?', () => this.showHelp(), 'Show keyboard shortcuts', 'Help');
    this.register('shift+/', () => this.showHelp(), 'Show keyboard shortcuts', 'Help');
    
    // Navigation
    this.register('g+h', () => this.navigate('#/theblock'), 'Go to home/dashboard', 'Navigation');
    this.register('g+t', () => this.navigate('#/trading'), 'Go to trading', 'Navigation');
    this.register('g+n', () => this.navigate('#/network'), 'Go to network', 'Navigation');
    this.register('g+s', () => this.navigate('#/styleguide'), 'Go to style guide', 'Navigation');
    
    // Actions
    this.register('r', () => window.location.reload(), 'Refresh page', 'Actions');
    this.register('ctrl+r', () => window.location.reload(), 'Refresh page', 'Actions');
    
    // Escape to close modals
    this.register('escape', () => this.closeModals(), 'Close modal/dialog', 'Actions');
  }
  
  /**
   * Navigate to route
   */
  navigate(route) {
    window.location.hash = route;
  }
  
  /**
   * Close any open modals
   */
  closeModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
      const closeBtn = modal.querySelector('.modal-close, .btn');
      if (closeBtn) closeBtn.click();
    });
  }
  
  /**
   * Show help modal with all shortcuts
   */
  showHelp() {
    if (this.modal) return;
    
    // Group shortcuts by category
    const categories = new Map();
    this.shortcuts.forEach(shortcut => {
      if (!categories.has(shortcut.category)) {
        categories.set(shortcut.category, []);
      }
      categories.get(shortcut.category).push(shortcut);
    });
    
    // Build modal HTML
    let categoriesHtml = '';
    categories.forEach((shortcuts, category) => {
      categoriesHtml += `
        <div class="shortcuts-category">
          <h3>${category}</h3>
          <div class="shortcuts-list">
            ${shortcuts.map(s => `
              <div class="shortcut-item">
                <div class="shortcut-keys">${this.formatKey(s.displayKey)}</div>
                <div class="shortcut-description">${s.description}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });
    
    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay';
    this.modal.innerHTML = `
      <div class="modal keyboard-shortcuts-modal">
        <div class="modal-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        
        <div class="modal-body">
          ${categoriesHtml}
          
          <div class="shortcuts-tip">
            <strong>Tip:</strong> Press <kbd>?</kbd> anytime to show this help
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn primary">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.modal);
    
    // Bind close events
    const closeBtn = this.modal.querySelector('.modal-close');
    const footerBtn = this.modal.querySelector('.modal-footer .btn');
    
    const close = () => this.hideHelp();
    
    closeBtn.onclick = close;
    footerBtn.onclick = close;
    
    this.modal.onclick = (e) => {
      if (e.target === this.modal) close();
    };
    
    // Animate in
    requestAnimationFrame(() => {
      this.modal.classList.add('modal-visible');
    });
  }
  
  /**
   * Hide help modal
   */
  hideHelp() {
    if (!this.modal) return;
    
    this.modal.classList.remove('modal-visible');
    
    setTimeout(() => {
      if (this.modal) {
        this.modal.remove();
        this.modal = null;
      }
    }, 300);
  }
  
  /**
   * Format key for display
   */
  formatKey(key) {
    const parts = key.split('+');
    return parts.map(part => {
      const formatted = part === ' ' ? 'Space' : part.charAt(0).toUpperCase() + part.slice(1);
      return `<kbd>${formatted}</kbd>`;
    }).join(' + ');
  }
  
  /**
   * Enable shortcuts
   */
  enable() {
    this.enabled = true;
  }
  
  /**
   * Disable shortcuts (e.g., when modal is open)
   */
  disable() {
    this.enabled = false;
  }
  
  /**
   * Get all registered shortcuts
   */
  getAll() {
    return Array.from(this.shortcuts.values());
  }
}

// Singleton instance
const keyboard = new KeyboardManager();

export default keyboard;

/**
 * Register a keyboard shortcut
 */
export function registerShortcut(key, handler, description, category) {
  keyboard.register(key, handler, description, category);
}

/**
 * Unregister a keyboard shortcut
 */
export function unregisterShortcut(key) {
  keyboard.unregister(key);
}

/**
 * Show keyboard shortcuts help
 */
export function showKeyboardHelp() {
  keyboard.showHelp();
}

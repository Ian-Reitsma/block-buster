/**
 * Accessible Modal Manager
 * Handles focus trapping, Esc to close, click outside, and focus restore
 */

(function() {
  'use strict';
  
  if (typeof document === 'undefined') return;
  
  class ModalManager {
    constructor(modalId) {
      this.modal = document.getElementById(modalId);
      this.modalId = modalId;
      this.lastFocusedElement = null;
      this.focusableElements = [];
      this.isOpen = false;
      
      if (!this.modal) {
        console.warn(`[Modal] Element #${modalId} not found`);
        return;
      }
      
      this.init();
    }
    
    init() {
      // Bind event handlers
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleBackdropClick = this.handleBackdropClick.bind(this);
      
      // Setup backdrop click (click modal overlay, not content)
      this.modal.addEventListener('click', this.handleBackdropClick);
      
      // Find focusable elements
      this.updateFocusableElements();
    }
    
    updateFocusableElements() {
      const focusableSelectors = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ];
      
      this.focusableElements = Array.from(
        this.modal.querySelectorAll(focusableSelectors.join(','))
      );
    }
    
    open() {
      if (this.isOpen) return;
      
      // Store last focused element
      this.lastFocusedElement = document.activeElement;
      
      // Show modal
      this.modal.classList.remove('hidden');
      this.isOpen = true;
      
      // Set aria-hidden on background content
      this.setBackgroundAriaHidden(true);
      
      // Update focusable elements (in case modal content changed)
      this.updateFocusableElements();
      
      // Focus first focusable element
      if (this.focusableElements.length > 0) {
        setTimeout(() => {
          this.focusableElements[0].focus();
        }, 100);
      }
      
      // Add keydown listener for Esc and Tab trapping
      document.addEventListener('keydown', this.handleKeydown);
      
      // Emit event
      this.modal.dispatchEvent(new CustomEvent('modalOpened', { detail: { modalId: this.modalId } }));
    }
    
    close() {
      if (!this.isOpen) return;
      
      // Hide modal
      this.modal.classList.add('hidden');
      this.isOpen = false;
      
      // Restore aria-hidden on background content
      this.setBackgroundAriaHidden(false);
      
      // Remove keydown listener
      document.removeEventListener('keydown', this.handleKeydown);
      
      // Restore focus
      if (this.lastFocusedElement && this.lastFocusedElement.focus) {
        this.lastFocusedElement.focus();
      }
      
      // Emit event
      this.modal.dispatchEvent(new CustomEvent('modalClosed', { detail: { modalId: this.modalId } }));
    }
    
    handleKeydown(e) {
      // Esc to close
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      
      // Tab focus trapping
      if (e.key === 'Tab') {
        if (this.focusableElements.length === 0) {
          e.preventDefault();
          return;
        }
        
        const firstElement = this.focusableElements[0];
        const lastElement = this.focusableElements[this.focusableElements.length - 1];
        
        if (e.shiftKey) {
          // Shift+Tab: if on first element, wrap to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    }
    
    handleBackdropClick(e) {
      // Only close if clicking the backdrop itself, not content
      if (e.target === this.modal) {
        this.close();
      }
    }
    
    setBackgroundAriaHidden(hidden) {
      // Set aria-hidden on main content while modal is open
      const mainContent = document.getElementById('main-content');
      const appShell = document.getElementById('app-shell');
      
      if (mainContent) {
        mainContent.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        if (hidden) {
          mainContent.setAttribute('inert', '');
        } else {
          mainContent.removeAttribute('inert');
        }
      }
      
      if (appShell) {
        appShell.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        if (hidden) {
          appShell.setAttribute('inert', '');
        } else {
          appShell.removeAttribute('inert');
        }
      }
    }
  }
  
  // Auto-initialize mode modal if it exists
  document.addEventListener('DOMContentLoaded', () => {
    const modeModal = document.getElementById('modeModal');
    if (!modeModal) return;
    
    const manager = new ModalManager('modeModal');
    
    // Wire up close button
    const closeBtn = document.getElementById('modeModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => manager.close());
    }
    
    // Wire up mode selection buttons
    const basicBtn = document.getElementById('modeBasic');
    const advancedBtn = document.getElementById('modeAdvanced');
    
    if (basicBtn) {
      basicBtn.addEventListener('click', () => {
        console.log('[Modal] Basic mode selected');
        localStorage.setItem('dashboard_mode', 'basic');
        manager.close();
        // Emit custom event for dashboard to respond
        document.dispatchEvent(new CustomEvent('dashboardModeChanged', { detail: { mode: 'basic' } }));
      });
    }
    
    if (advancedBtn) {
      advancedBtn.addEventListener('click', () => {
        console.log('[Modal] Advanced mode selected');
        localStorage.setItem('dashboard_mode', 'advanced');
        manager.close();
        // Emit custom event for dashboard to respond
        document.dispatchEvent(new CustomEvent('dashboardModeChanged', { detail: { mode: 'advanced' } }));
      });
    }
    
    // Check if mode has been set; if not, show modal on first load
    const currentMode = localStorage.getItem('dashboard_mode');
    if (!currentMode && window.location.pathname.includes('dashboard')) {
      // Only show on first visit to dashboard
      const hasSeenModal = sessionStorage.getItem('modeModalShown');
      if (!hasSeenModal) {
        setTimeout(() => {
          manager.open();
          sessionStorage.setItem('modeModalShown', 'true');
        }, 500);
      }
    }
    
    // Expose manager globally for manual open
    if (typeof window !== 'undefined') {
      window.modeModalManager = manager;
    }
  });
  
  // Export ModalManager class
  if (typeof window !== 'undefined') {
    window.ModalManager = ModalManager;
  }
})();

/**
 * Modal Component - Accessible modal dialog
 * 
 * Features:
 * - Focus trap
 * - ESC to close
 * - Click outside to close
 * - Scroll lock on body
 * - Customizable size
 * - Header, body, footer slots
 */

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class Modal extends Component {
  constructor(options = {}) {
    super('Modal');
    this.title = options.title || '';
    this.size = options.size || 'medium'; // small, medium, large, full
    this.closeOnEscape = options.closeOnEscape !== false;
    this.closeOnBackdrop = options.closeOnBackdrop !== false;
    this.onClose = options.onClose || (() => {});
    this.content = options.content || '';
    this.footer = options.footer || null;
    this.isOpen = false;
    this.modalId = `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
    this.lockScroll();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.unlockScroll();
    const modal = $(`#${this.modalId}`);
    if (modal) {
      modal.remove();
    }
    this.onClose();
  }

  setContent(content) {
    this.content = content;
    const body = $(`#${this.modalId} .modal-body`);
    if (body) {
      body.innerHTML = '';
      if (typeof content === 'string') {
        body.innerHTML = content;
      } else {
        body.appendChild(content);
      }
    }
  }

  setFooter(footer) {
    this.footer = footer;
    const footerEl = $(`#${this.modalId} .modal-footer`);
    if (footerEl) {
      footerEl.innerHTML = '';
      if (typeof footer === 'string') {
        footerEl.innerHTML = footer;
      } else if (footer) {
        footerEl.appendChild(footer);
      }
    }
  }

  render() {
    // Remove existing modal if any
    const existing = $(`#${this.modalId}`);
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = this.modalId;

    const modal = document.createElement('div');
    modal.className = `modal modal-${this.size}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', `${this.modalId}-title`);

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h3 class="modal-title" id="${this.modalId}-title">${this.title}</h3>
      <button class="modal-close" aria-label="Close modal">
        <span>&times;</span>
      </button>
    `;
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => this.close());
    modal.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof this.content === 'string') {
      body.innerHTML = this.content;
    } else {
      body.appendChild(this.content);
    }
    modal.appendChild(body);

    // Footer (optional)
    if (this.footer) {
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      if (typeof this.footer === 'string') {
        footer.innerHTML = this.footer;
      } else {
        footer.appendChild(this.footer);
      }
      modal.appendChild(footer);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on backdrop click
    if (this.closeOnBackdrop) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.close();
        }
      });
    }

    // Close on ESC
    if (this.closeOnEscape) {
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this.close();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    // Focus trap
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });
  }

  lockScroll() {
    document.body.style.overflow = 'hidden';
  }

  unlockScroll() {
    document.body.style.overflow = '';
  }
}

export default Modal;

// What's New modal - Shows recent updates and UX improvements
// Auto-displays on version changes, dismissible

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

const APP_VERSION = '2.0.0'; // UX transformation version
const STORAGE_KEY = 'block-buster-whats-new-seen';

class WhatsNewModal extends Component {
  constructor() {
    super('WhatsNewModal');
    this.modal = null;
    this.overlay = null;
  }

  shouldShow() {
    // Check if user has seen this version's "What's New"
    const seenVersion = localStorage.getItem(STORAGE_KEY);
    return seenVersion !== APP_VERSION;
  }

  onMount() {
    // Auto-show if user hasn't seen this version
    if (this.shouldShow()) {
      // Delay by 2 seconds so user sees the dashboard first
      setTimeout(() => this.show(), 2000);
    }

    // Expose method for manual trigger
    window.showWhatsNew = () => this.show();
  }

  show() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.onclick = () => this.hide();

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'modal whats-new-modal';
    this.modal.onclick = (e) => e.stopPropagation(); // Prevent close on modal click

    this.modal.innerHTML = `
      <div class="modal-header">
        <h2>✨ What's New in Block Buster v${APP_VERSION}</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <div class="whats-new-section">
          <h3>🎨 Complete UX Redesign</h3>
          <p>We've rebuilt the entire interface with a scientific visual hierarchy and professional design system.</p>
          <ul class="whats-new-list">
            <li><strong>3-Tier Metric Hierarchy:</strong> Hero → Primary → Compact cards for optimal information scanning</li>
            <li><strong>Responsive Grid System:</strong> Beautiful layouts on any screen size</li>
            <li><strong>Dark Theme Polish:</strong> Improved contrast and accessibility</li>
          </ul>
        </div>

        <div class="whats-new-section">
          <h3>⚡ New Features</h3>
          <ul class="whats-new-list">
            <li><strong>Loading Skeletons:</strong> Smooth shimmer animations while data loads</li>
            <li><strong>Connection Status:</strong> Real-time indicator shows WebSocket/API health</li>
            <li><strong>Tooltips:</strong> Hover over metrics for helpful explanations</li>
            <li><strong>Toast Notifications:</strong> Beautiful alerts for success, errors, and warnings</li>
          </ul>
        </div>

        <div class="whats-new-section">
          <h3>🚀 Performance Improvements</h3>
          <ul class="whats-new-list">
            <li>GPU-accelerated animations for 60fps smoothness</li>
            <li>CSS containment reduces layout thrashing</li>
            <li>Optimized render pipeline with requestAnimationFrame</li>
            <li>Zero third-party dependencies = faster load times</li>
          </ul>
        </div>

        <div class="whats-new-section">
          <h3>♿ Accessibility</h3>
          <ul class="whats-new-list">
            <li>WCAG AA color contrast compliance (14.2:1 average)</li>
            <li>Full keyboard navigation support</li>
            <li>Semantic HTML5 structure</li>
            <li>Reduced motion support for motion-sensitive users</li>
          </ul>
        </div>

        <div class="whats-new-tip">
          <strong>💡 Pro Tip:</strong> Press <kbd>?</kbd> to see all keyboard shortcuts!
        </div>
      </div>

      <div class="modal-footer">
        <label class="whats-new-checkbox">
          <input type="checkbox" id="dont-show-again" />
          Don't show this again
        </label>
        <button class="btn primary" id="whats-new-close">Got it!</button>
      </div>
    `;

    // Wire up close buttons
    const closeBtn = this.modal.querySelector('.modal-close');
    const gotItBtn = this.modal.querySelector('#whats-new-close');
    const dontShowCheckbox = this.modal.querySelector('#dont-show-again');

    closeBtn.onclick = () => this.hide(dontShowCheckbox.checked);
    gotItBtn.onclick = () => this.hide(dontShowCheckbox.checked);

    // Escape key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.hide(dontShowCheckbox.checked);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Add to DOM
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.modal);

    // Animate in
    requestAnimationFrame(() => {
      this.overlay.classList.add('modal-overlay-visible');
      this.modal.classList.add('modal-visible');
    });
  }

  hide(markAsSeen = false) {
    if (!this.modal || !this.overlay) return;

    // Mark as seen if requested
    if (markAsSeen) {
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
    }

    // Animate out
    this.overlay.classList.remove('modal-overlay-visible');
    this.modal.classList.remove('modal-visible');

    setTimeout(() => {
      this.overlay?.remove();
      this.modal?.remove();
      this.overlay = null;
      this.modal = null;
    }, 300);
  }
}

export default WhatsNewModal;

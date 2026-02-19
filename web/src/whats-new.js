// "What's New" onboarding modal
// Introduce users to new features and UX improvements

import { Component } from './lifecycle.js';
import { $, $$ } from './utils.js';

class WhatsNewModal extends Component {
  constructor() {
    super('WhatsNewModal');
    this.version = '2.0.0'; // Current version
    this.storageKey = 'block-buster-whats-new-seen';
    this.modal = null;
  }
  
  /**
   * Check if user should see the modal
   */
  shouldShow() {
    const seen = localStorage.getItem(this.storageKey);
    return seen !== this.version;
  }
  
  /**
   * Mark as seen
   */
  markAsSeen() {
    localStorage.setItem(this.storageKey, this.version);
  }
  
  /**
   * Show the modal
   */
  show() {
    if (this.modal) return;
    
    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay';
    this.modal.innerHTML = `
      <div class="modal whats-new-modal">
        <div class="modal-header">
          <h2>🎉 What's New in Block Buster 2.0</h2>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="whats-new-feature">
            <div class="feature-icon" style="background: linear-gradient(135deg, var(--accent) 0%, var(--success) 100%);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </div>
            <div class="feature-content">
              <h3>3-Tier Metric Hierarchy</h3>
              <p>Critical metrics are now larger and more prominent. Hero cards (48px) → Primary cards (32px) → Compact cards (20px) create a clear visual hierarchy.</p>
            </div>
          </div>
          
          <div class="whats-new-feature">
            <div class="feature-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div class="feature-content">
              <h3>Professional Trading Interface</h3>
              <p>New 3-column trading layout with live price ticker, real-time order book, and streamlined order entry. Matches industry-standard trading UX.</p>
            </div>
          </div>
          
          <div class="whats-new-feature">
            <div class="feature-icon" style="background: linear-gradient(135deg, var(--success) 0%, #2dd4bf 100%);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div class="feature-content">
              <h3>Real-Time Updates</h3>
              <p>WebSocket streaming provides sub-100ms latency for all metrics. Watch your network metrics update instantly without page refreshes.</p>
            </div>
          </div>
          
          <div class="whats-new-feature">
            <div class="feature-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M2 12h20"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div class="feature-content">
              <h3>Enhanced Network Monitoring</h3>
              <p>New Network Strength page with comprehensive metrics: consensus status, peer topology, market health, and scheduler performance.</p>
            </div>
          </div>
          
          <div class="whats-new-feature">
            <div class="feature-icon" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div class="feature-content">
              <h3>Complete Design System</h3>
              <p>1,100+ lines of design tokens, responsive grids, and component patterns. Consistent spacing, typography, and color usage throughout.</p>
            </div>
          </div>
          
          <div class="whats-new-tips">
            <h3>💡 Quick Tips</h3>
            <ul>
              <li><strong>Hover tooltips:</strong> Hover over any compact metric label for detailed explanations</li>
              <li><strong>Keyboard shortcuts:</strong> Press <kbd>?</kbd> to see all available shortcuts</li>
              <li><strong>Responsive:</strong> Works perfectly on desktop, tablet, and mobile devices</li>
              <li><strong>Auto-refresh:</strong> All data updates automatically every 30 seconds</li>
            </ul>
          </div>
        </div>
        
        <div class="modal-footer">
          <label class="checkbox-label">
            <input type="checkbox" id="dont-show-again" />
            Don't show this again
          </label>
          <button class="btn primary" id="got-it-btn">Got it!</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.modal);
    
    // Bind events
    const closeBtn = this.modal.querySelector('.modal-close');
    const gotItBtn = this.modal.querySelector('#got-it-btn');
    const checkbox = this.modal.querySelector('#dont-show-again');
    
    const close = () => {
      if (checkbox.checked) {
        this.markAsSeen();
      }
      this.hide();
    };
    
    closeBtn.onclick = close;
    gotItBtn.onclick = close;
    
    // Close on overlay click
    this.modal.onclick = (e) => {
      if (e.target === this.modal) close();
    };
    
    // Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    // Animate in
    requestAnimationFrame(() => {
      this.modal.classList.add('modal-visible');
    });
  }
  
  /**
   * Hide the modal
   */
  hide() {
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
   * Show if needed (call on app init)
   */
  showIfNeeded() {
    // Wait a bit so the user sees the main UI first
    setTimeout(() => {
      if (this.shouldShow()) {
        this.show();
      }
    }, 1000);
  }
  
  /**
   * Force show (for testing or help menu)
   */
  forceShow() {
    this.show();
  }
}

// Singleton instance
const whatsNew = new WhatsNewModal();

export default whatsNew;

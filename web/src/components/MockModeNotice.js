// Mock Mode Notice - Shows when backend is unavailable
// Automatically enables mock mode with realistic data

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class MockModeNotice extends Component {
  constructor() {
    super('MockModeNotice');
    this.notice = null;
    this.countdown = 3;
  }

  onMount() {
    // This component renders inline in the app
  }

  /**
   * Show the notice banner
   * @param {Function} onDismiss - Callback when user dismisses
   */
  show(onDismiss) {
    // Create banner at top of content
    this.notice = document.createElement('div');
    this.notice.className = 'mock-mode-notice';
    this.notice.innerHTML = `
      <div class="mock-mode-notice-content">
        <div class="mock-mode-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="mock-mode-text">
          <div class="mock-mode-title">Node Data Unavailable</div>
          <div class="mock-mode-message">
            Live network health data not present. Proceeding with <strong>realistic mock data</strong> that represents typical blockchain network activity.
          </div>
        </div>
        <button class="mock-mode-dismiss" aria-label="Dismiss">×</button>
      </div>
    `;

    // Wire up dismiss button
    const dismissBtn = this.notice.querySelector('.mock-mode-dismiss');
    dismissBtn.onclick = () => {
      this.hide();
      if (onDismiss) onDismiss();
    };

    // Add to top of app content
    const appContent = $('.app-content') || document.body;
    appContent.insertBefore(this.notice, appContent.firstChild);

    // Animate in
    requestAnimationFrame(() => {
      this.notice.classList.add('mock-mode-notice-visible');
    });

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (this.notice) {
        this.hide();
        if (onDismiss) onDismiss();
      }
    }, 10000);
  }

  hide() {
    if (!this.notice) return;

    this.notice.classList.remove('mock-mode-notice-visible');
    this.notice.classList.add('mock-mode-notice-hiding');

    setTimeout(() => {
      this.notice?.remove();
      this.notice = null;
    }, 300);
  }

  /**
   * Show full-screen interstitial (for initial load)
   * @param {Function} onContinue - Callback when user clicks continue
   */
  showInterstitial(onContinue) {
    const overlay = document.createElement('div');
    overlay.className = 'mock-mode-interstitial';
    overlay.innerHTML = `
      <div class="mock-mode-interstitial-content">
        <div class="mock-mode-interstitial-icon">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        
        <h1>Node Connection Unavailable</h1>
        
        <p class="mock-mode-interstitial-message">
          Unable to connect to The Block node. Live network health data is not present.
        </p>
        
        <div class="mock-mode-interstitial-box">
          <h3>📦 Mock Data Mode</h3>
          <p>Proceeding with <strong>realistic simulated data</strong> that represents typical blockchain network activity:</p>
          <ul class="mock-mode-features">
            <li>✅ TPS: 800-2,500 (with realistic spikes)</li>
            <li>✅ Block height incrementing every 2 seconds</li>
            <li>✅ P2P latency: 15-45ms with variance</li>
            <li>✅ Peer count: 45-85 active connections</li>
            <li>✅ Network fees: 2-15 BLOCK per block</li>
            <li>✅ Validator set: 21 validators</li>
          </ul>
        </div>
        
        <div class="mock-mode-interstitial-actions">
          <button class="btn primary large" id="continue-mock">
            Continue with Mock Data
          </button>
          <button class="btn secondary large" id="retry-connection">
            Retry Connection
          </button>
        </div>
        
        <p class="mock-mode-interstitial-note">
          <small>To connect to a live node, start The Block node and refresh this page.</small>
        </p>
      </div>
    `;

    // Wire up buttons
    const continueBtn = overlay.querySelector('#continue-mock');
    const retryBtn = overlay.querySelector('#retry-connection');

    continueBtn.onclick = () => {
      overlay.classList.add('mock-mode-interstitial-hiding');
      setTimeout(() => {
        overlay.remove();
        if (onContinue) onContinue();
      }, 300);
    };

    retryBtn.onclick = () => {
      window.location.reload();
    };

    // Add to DOM
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('mock-mode-interstitial-visible');
    });

    // Auto-continue after 5 seconds
    let countdown = 5;
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        continueBtn.textContent = `Continue with Mock Data (${countdown}s)`;
      } else {
        clearInterval(countdownInterval);
        continueBtn.click();
      }
    }, 1000);
  }
}

export default MockModeNotice;

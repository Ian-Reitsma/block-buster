// Keyboard shortcuts guide modal
// Displays all available keyboard shortcuts
// Trigger with '?' or Ctrl+/

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class KeyboardShortcuts extends Component {
  constructor(router) {
    super('KeyboardShortcuts');
    this.router = router;
    this.modal = null;
    this.overlay = null;
  }

  onMount() {
    // Listen for '?' key globally
    document.addEventListener('keydown', (e) => {
      // Trigger on '?' or Ctrl+/
      if (e.key === '?' || (e.ctrlKey && e.key === '/')) {
        e.preventDefault();
        this.toggle();
      }
    });

    // Expose method for manual trigger
    window.showKeyboardShortcuts = () => this.show();
  }

  toggle() {
    if (this.modal) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (this.modal) return; // Already showing

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.onclick = () => this.hide();

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'modal keyboard-shortcuts-modal';
    this.modal.onclick = (e) => e.stopPropagation();

    this.modal.innerHTML = `
      <div class="modal-header">
        <h2>⌨️ Keyboard Shortcuts</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <div class="shortcuts-section">
          <h3>Navigation</h3>
          <div class="shortcuts-list">
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>1</kbd></div>
              <div class="shortcut-description">Go to The Block dashboard</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>2</kbd></div>
              <div class="shortcut-description">Go to Trading page</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>3</kbd></div>
              <div class="shortcut-description">Go to Network page</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>H</kbd></div>
              <div class="shortcut-description">Go to Home / Default page</div>
            </div>
          </div>
        </div>

        <div class="shortcuts-section">
          <h3>Actions</h3>
          <div class="shortcuts-list">
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>R</kbd></div>
              <div class="shortcut-description">Refresh current page data</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>K</kbd></div>
              <div class="shortcut-description">Open command palette (future)</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>Esc</kbd></div>
              <div class="shortcut-description">Close modal or cancel action</div>
            </div>
          </div>
        </div>

        <div class="shortcuts-section">
          <h3>Help</h3>
          <div class="shortcuts-list">
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>?</kbd></div>
              <div class="shortcut-description">Show this keyboard shortcuts guide</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>/</kbd></div>
              <div class="shortcut-description">Toggle keyboard shortcuts</div>
            </div>
          </div>
        </div>

        <div class="shortcuts-section">
          <h3>Development (localhost only)</h3>
          <div class="shortcuts-list">
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd></div>
              <div class="shortcut-description">Toggle debug mode</div>
            </div>
            <div class="shortcut-item">
              <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd></div>
              <div class="shortcut-description">Toggle mock RPC mode</div>
            </div>
          </div>
        </div>

        <div class="shortcuts-tip">
          <strong>💡 Tip:</strong> You can also use Tab and Arrow keys to navigate through interactive elements.
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn primary" id="shortcuts-close">Close</button>
      </div>
    `;

    // Wire up close buttons
    const closeBtn = this.modal.querySelector('.modal-close');
    const closeFooterBtn = this.modal.querySelector('#shortcuts-close');

    closeBtn.onclick = () => this.hide();
    closeFooterBtn.onclick = () => this.hide();

    // Escape key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.hide();
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

  hide() {
    if (!this.modal || !this.overlay) return;

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

  // Implement actual keyboard shortcuts
  handleKeyboardShortcuts(e) {
    // Don't trigger if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case '1':
        e.preventDefault();
        this.router.navigate('theblock');
        break;
      case '2':
        e.preventDefault();
        this.router.navigate('trading');
        break;
      case '3':
        e.preventDefault();
        this.router.navigate('network');
        break;
      case 'h':
      case 'H':
        e.preventDefault();
        this.router.navigate('theblock');
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        window.location.reload();
        break;
    }

    // Development shortcuts (localhost only)
    if (window.location.hostname === 'localhost') {
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === 'D') {
          e.preventDefault();
          console.log('[Debug] Toggle debug mode');
          // TODO: Implement debug mode toggle
        }
        if (e.key === 'M') {
          e.preventDefault();
          console.log('[Debug] Toggle mock mode');
          if (window.enableMockMode && window.disableMockMode) {
            // Check current state and toggle
            const mockEnabled = localStorage.getItem('features.mock_rpc') === 'true';
            if (mockEnabled) {
              window.disableMockMode();
            } else {
              window.enableMockMode();
            }
          }
        }
      }
    }
  }
}

export default KeyboardShortcuts;

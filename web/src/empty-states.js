// Empty state components with SVG illustrations
// Zero-dependency, inline SVG for various empty states

/**
 * SVG icons for empty states
 */
const icons = {
  noData: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2" opacity="0.2"/>
    <path d="M20 32h24M32 20v24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
    <circle cx="32" cy="32" r="4" fill="currentColor" opacity="0.4"/>
  </svg>`,
  
  noTransactions: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="16" y="20" width="32" height="24" rx="2" stroke="currentColor" stroke-width="2" opacity="0.2"/>
    <path d="M16 28h32M24 34h16M24 38h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
    <circle cx="44" cy="44" r="8" fill="var(--bg)" stroke="currentColor" stroke-width="2"/>
    <path d="M40 44l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  </svg>`,
  
  noPeers: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="24" r="6" stroke="currentColor" stroke-width="2" opacity="0.3"/>
    <path d="M22 40c0-5.5 4.5-10 10-10s10 4.5 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
    <circle cx="48" cy="30" r="4" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
    <circle cx="16" cy="30" r="4" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
    <path d="M32 48v-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  </svg>`,
  
  noOperations: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="16" width="24" height="32" rx="2" stroke="currentColor" stroke-width="2" opacity="0.2"/>
    <circle cx="26" cy="24" r="1.5" fill="currentColor" opacity="0.3"/>
    <circle cx="26" cy="32" r="1.5" fill="currentColor" opacity="0.3"/>
    <circle cx="26" cy="40" r="1.5" fill="currentColor" opacity="0.3"/>
    <path d="M30 24h8M30 32h8M30 40h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  </svg>`,
  
  disconnected: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 20c12-12 24-12 36 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
    <path d="M24 26c8-8 16-8 24 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
    <path d="M28 32c4-4 8-4 12 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
    <line x1="18" y1="46" x2="46" y2="18" stroke="var(--danger)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="40" r="3" fill="currentColor" opacity="0.3"/>
  </svg>`,
  
  noReceipts: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 12h24l8 8v32a2 2 0 01-2 2H20a2 2 0 01-2-2V14a2 2 0 012-2z" stroke="currentColor" stroke-width="2" opacity="0.2"/>
    <path d="M44 12v8h8" stroke="currentColor" stroke-width="2" opacity="0.3"/>
    <path d="M26 28h12M26 34h12M26 40h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  </svg>`,
  
  error: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="24" stroke="var(--danger)" stroke-width="2" opacity="0.3"/>
    <path d="M32 22v12M32 40v2" stroke="var(--danger)" stroke-width="3" stroke-linecap="round"/>
  </svg>`
};

/**
 * Create empty state component
 * @param {Object} options
 * @param {string} options.icon - Icon key from icons object
 * @param {string} options.title - Main heading
 * @param {string} options.message - Descriptive message
 * @param {Object} options.action - Optional action button {text, onClick}
 * @returns {HTMLElement}
 */
export function createEmptyState({ icon, title, message, action }) {
  const container = document.createElement('div');
  container.className = 'empty-state';
  
  const iconHtml = icons[icon] || icons.noData;
  
  container.innerHTML = `
    <div class="empty-state-icon">
      ${iconHtml}
    </div>
    <h3 class="empty-state-title">${title}</h3>
    <p class="empty-state-message">${message}</p>
  `;
  
  if (action) {
    const button = document.createElement('button');
    button.className = 'btn primary mt-4';
    button.textContent = action.text;
    button.onclick = action.onClick;
    container.appendChild(button);
  }
  
  return container;
}

/**
 * Preset empty states
 */
export const emptyStates = {
  noTransactions() {
    return createEmptyState({
      icon: 'noTransactions',
      title: 'No transactions found',
      message: 'There are no transactions matching your criteria. Try adjusting your filters or check back later.'
    });
  },
  
  noPeers() {
    return createEmptyState({
      icon: 'noPeers',
      title: 'No peers connected',
      message: 'Your node is not connected to any peers. Check your network connection and firewall settings.',
      action: {
        text: 'Retry Connection',
        onClick: () => window.location.reload()
      }
    });
  },
  
  noOperations() {
    return createEmptyState({
      icon: 'noOperations',
      title: 'No pending operations',
      message: 'All operations have been completed. New operations will appear here as they are submitted.'
    });
  },
  
  noReceipts() {
    return createEmptyState({
      icon: 'noReceipts',
      title: 'No receipts available',
      message: 'No transaction receipts found. Receipts will appear here once transactions are processed.'
    });
  },
  
  disconnected() {
    return createEmptyState({
      icon: 'disconnected',
      title: 'Connection lost',
      message: 'Unable to connect to the blockchain node. Please check that the node is running.',
      action: {
        text: 'Retry',
        onClick: () => window.location.reload()
      }
    });
  },
  
  error(message) {
    return createEmptyState({
      icon: 'error',
      title: 'Something went wrong',
      message: message || 'An unexpected error occurred. Please try again.',
      action: {
        text: 'Reload Page',
        onClick: () => window.location.reload()
      }
    });
  },
  
  noData(context = 'data') {
    return createEmptyState({
      icon: 'noData',
      title: `No ${context} available`,
      message: `There is currently no ${context} to display. This section will update automatically when ${context} becomes available.`
    });
  }
};

/**
 * Replace element content with empty state
 * @param {HTMLElement} element
 * @param {string} stateKey - Key from emptyStates
 * @param {*} args - Arguments for the state function
 */
export function showEmptyState(element, stateKey, ...args) {
  const state = emptyStates[stateKey];
  if (!state) {
    console.warn(`[EmptyState] Unknown state: ${stateKey}`);
    return;
  }
  
  element.innerHTML = '';
  element.appendChild(state(...args));
}

/**
 * Check if container has content, show empty state if not
 * @param {HTMLElement} container
 * @param {string} selector - Selector for content items
 * @param {string} stateKey - Empty state to show
 * @param {*} args - Arguments for state function
 */
export function checkEmpty(container, selector, stateKey, ...args) {
  const items = container.querySelectorAll(selector);
  
  if (items.length === 0) {
    showEmptyState(container, stateKey, ...args);
    return true;
  }
  
  return false;
}

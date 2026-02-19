// Tooltip system
// Zero-dependency tooltips with smart positioning

class TooltipManager {
  constructor() {
    this.activeTooltip = null;
    this.showDelay = 400; // ms
    this.hideDelay = 100;
    this.showTimer = null;
    this.hideTimer = null;
    this.offset = 8; // px from target
    
    this.init();
  }
  
  init() {
    // Create tooltip container
    const container = document.createElement('div');
    container.id = 'tooltip-container';
    container.className = 'tooltip-container';
    document.body.appendChild(container);
    
    // Event delegation for all tooltips
    document.addEventListener('mouseenter', this.handleMouseEnter.bind(this), true);
    document.addEventListener('mouseleave', this.handleMouseLeave.bind(this), true);
    document.addEventListener('focus', this.handleFocus.bind(this), true);
    document.addEventListener('blur', this.handleBlur.bind(this), true);
  }
  
  handleMouseEnter(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    
    clearTimeout(this.hideTimer);
    this.showTimer = setTimeout(() => {
      this.show(target);
    }, this.showDelay);
  }
  
  handleMouseLeave(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    
    clearTimeout(this.showTimer);
    this.hideTimer = setTimeout(() => {
      this.hide();
    }, this.hideDelay);
  }
  
  handleFocus(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    
    this.show(target);
  }
  
  handleBlur(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    
    this.hide();
  }
  
  show(target) {
    const text = target.getAttribute('data-tooltip');
    const position = target.getAttribute('data-tooltip-position') || 'top';
    
    if (!text) return;
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = `tooltip tooltip-${position}`;
    tooltip.textContent = text;
    tooltip.setAttribute('role', 'tooltip');
    
    const container = document.getElementById('tooltip-container');
    container.innerHTML = '';
    container.appendChild(tooltip);
    
    // Position tooltip
    this.position(tooltip, target, position);
    
    // Animate in
    requestAnimationFrame(() => {
      tooltip.classList.add('tooltip-visible');
    });
    
    this.activeTooltip = { tooltip, target };
  }
  
  hide() {
    if (!this.activeTooltip) return;
    
    const { tooltip } = this.activeTooltip;
    tooltip.classList.remove('tooltip-visible');
    
    setTimeout(() => {
      const container = document.getElementById('tooltip-container');
      if (container) container.innerHTML = '';
      this.activeTooltip = null;
    }, 150);
  }
  
  position(tooltip, target, preferredPosition) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    let position = preferredPosition;
    let left = 0;
    let top = 0;
    
    // Calculate position
    switch (position) {
      case 'top':
        left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        top = targetRect.top - tooltipRect.height - this.offset;
        
        // Check if tooltip goes off top
        if (top < 0) {
          position = 'bottom';
          top = targetRect.bottom + this.offset;
        }
        break;
        
      case 'bottom':
        left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        top = targetRect.bottom + this.offset;
        
        // Check if tooltip goes off bottom
        if (top + tooltipRect.height > viewport.height) {
          position = 'top';
          top = targetRect.top - tooltipRect.height - this.offset;
        }
        break;
        
      case 'left':
        left = targetRect.left - tooltipRect.width - this.offset;
        top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        
        // Check if tooltip goes off left
        if (left < 0) {
          position = 'right';
          left = targetRect.right + this.offset;
        }
        break;
        
      case 'right':
        left = targetRect.right + this.offset;
        top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        
        // Check if tooltip goes off right
        if (left + tooltipRect.width > viewport.width) {
          position = 'left';
          left = targetRect.left - tooltipRect.width - this.offset;
        }
        break;
    }
    
    // Constrain to viewport horizontally
    if (left < this.offset) {
      left = this.offset;
    } else if (left + tooltipRect.width > viewport.width - this.offset) {
      left = viewport.width - tooltipRect.width - this.offset;
    }
    
    // Constrain to viewport vertically
    if (top < this.offset) {
      top = this.offset;
    } else if (top + tooltipRect.height > viewport.height - this.offset) {
      top = viewport.height - tooltipRect.height - this.offset;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.className = `tooltip tooltip-${position}`;
  }
}

// Singleton instance
const tooltipManager = new TooltipManager();

/**
 * Add tooltip to element
 * @param {HTMLElement} element
 * @param {string} text
 * @param {string} position - 'top' | 'bottom' | 'left' | 'right'
 */
export function addTooltip(element, text, position = 'top') {
  element.setAttribute('data-tooltip', text);
  element.setAttribute('data-tooltip-position', position);
}

/**
 * Remove tooltip from element
 * @param {HTMLElement} element
 */
export function removeTooltip(element) {
  element.removeAttribute('data-tooltip');
  element.removeAttribute('data-tooltip-position');
}

/**
 * Update tooltip text
 * @param {HTMLElement} element
 * @param {string} text
 */
export function updateTooltip(element, text) {
  element.setAttribute('data-tooltip', text);
}

/**
 * Add tooltips to all compact metrics (abbreviated labels)
 */
export function addCompactMetricTooltips() {
  const tooltips = {
    'TPS': 'Transactions per second - Network throughput',
    'Avg Block Time': 'Average time between blocks in milliseconds',
    'P2P Latency': 'Peer-to-peer network latency in milliseconds',
    'Network Load': 'Current network utilization as percentage of capacity',
    'Validators': 'Active validators securing the network',
    'Supply': 'Total circulating BLOCK tokens',
    'Issuance': 'Hourly token issuance rate',
    'Unconfirmed': 'Number of blocks awaiting finalization',
    'Finalized': 'Latest finalized block height',
    'Peers': 'Connected peer nodes in the network',
    'Network Fees': 'Total network fees collected',
    'Block Height': 'Current blockchain height',
  };
  
  document.querySelectorAll('.card-metric-compact h3, .card-metric-primary h3, .card-metric-hero h3').forEach(heading => {
    const text = heading.textContent.trim();
    if (tooltips[text]) {
      addTooltip(heading, tooltips[text]);
    }
  });
}

export default tooltipManager;

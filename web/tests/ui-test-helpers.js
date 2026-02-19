/**
 * UI Testing Helpers for UX Transformation
 * Utilities for testing grid layouts, responsive behavior, and component rendering
 */

/**
 * Test if element has correct grid layout
 */
export function assertGridLayout(element, expectedColumns) {
  const computedStyle = window.getComputedStyle(element);
  const gridTemplateColumns = computedStyle.getPropertyValue('grid-template-columns');
  const actualColumns = gridTemplateColumns.split(' ').length;
  
  if (actualColumns !== expectedColumns) {
    throw new Error(
      `Expected ${expectedColumns} grid columns, got ${actualColumns}. ` +
      `Grid template: ${gridTemplateColumns}`
    );
  }
  
  return true;
}

/**
 * Test if element has correct card class
 */
export function assertCardTier(element, tier) {
  const expectedClass = `card-metric-${tier}`;
  
  if (!element.classList.contains(expectedClass)) {
    throw new Error(
      `Expected element to have class "${expectedClass}". ` +
      `Classes: ${element.className}`
    );
  }
  
  return true;
}

/**
 * Test responsive breakpoint behavior
 */
export function testBreakpoint(viewport, callback) {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  
  try {
    // Set viewport size
    window.resizeTo(viewport.width, viewport.height);
    
    // Wait for layout to settle
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        callback();
        resolve();
      });
    });
  } finally {
    // Restore original size
    window.resizeTo(originalWidth, originalHeight);
  }
}

/**
 * Test data binding
 */
export function assertDataBinding(element, bindKey, value, format) {
  const boundElement = element.querySelector(`[data-bind="${bindKey}"]`);
  
  if (!boundElement) {
    throw new Error(`No element found with data-bind="${bindKey}"`);
  }
  
  const expectedValue = formatValue(value, format);
  const actualValue = boundElement.textContent.trim();
  
  if (actualValue !== expectedValue) {
    throw new Error(
      `Expected bound value "${expectedValue}", got "${actualValue}"`
    );
  }
  
  return true;
}

/**
 * Format value according to data-format attribute
 */
function formatValue(value, format) {
  switch (format) {
    case 'number':
      return new Intl.NumberFormat().format(value);
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    case 'ms':
      return `${value}ms`;
    case 'percent':
      return `${value}%`;
    default:
      return String(value);
  }
}

/**
 * Test color contrast ratio (WCAG AA = 4.5:1 for normal text)
 */
export function assertColorContrast(foreground, background, minRatio = 4.5) {
  const fgLuminance = getRelativeLuminance(foreground);
  const bgLuminance = getRelativeLuminance(background);
  
  const ratio = (Math.max(fgLuminance, bgLuminance) + 0.05) /
                (Math.min(fgLuminance, bgLuminance) + 0.05);
  
  if (ratio < minRatio) {
    throw new Error(
      `Contrast ratio ${ratio.toFixed(2)}:1 is below minimum ${minRatio}:1. ` +
      `Foreground: ${foreground}, Background: ${background}`
    );
  }
  
  return ratio;
}

/**
 * Calculate relative luminance for color contrast
 */
function getRelativeLuminance(hexColor) {
  const rgb = hexToRgb(hexColor);
  const [r, g, b] = rgb.map((val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ] : null;
}

/**
 * Test if element is visible in viewport
 */
export function assertInViewport(element) {
  const rect = element.getBoundingClientRect();
  const inViewport = (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
  
  if (!inViewport) {
    throw new Error(
      `Element is not in viewport. Bounds: ${JSON.stringify(rect)}`
    );
  }
  
  return true;
}

/**
 * Test component render performance
 */
export async function measureRenderTime(component) {
  const startTime = performance.now();
  
  await component.render();
  
  const endTime = performance.now();
  const renderTime = endTime - startTime;
  
  return {
    renderTime,
    withinBudget: renderTime < 16, // 60fps = 16ms budget
  };
}

/**
 * Test if metrics are properly grouped
 */
export function assertMetricGrouping(container, tierClass, expectedCount) {
  const cards = container.querySelectorAll(`.${tierClass}`);
  
  if (cards.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} cards with class "${tierClass}", found ${cards.length}`
    );
  }
  
  return true;
}

/**
 * Test empty state rendering
 */
export function assertEmptyState(container, expectedMessage) {
  const emptyState = container.querySelector('.muted.small.text-center');
  
  if (!emptyState) {
    throw new Error('No empty state element found');
  }
  
  if (expectedMessage && !emptyState.textContent.includes(expectedMessage)) {
    throw new Error(
      `Empty state message "${emptyState.textContent}" does not contain "${expectedMessage}"`
    );
  }
  
  return true;
}

/**
 * Test loading state
 */
export function assertLoadingState(container) {
  const loadingIndicator = container.querySelector('[data-loading="true"]') ||
                           container.textContent.includes('Loading');
  
  if (!loadingIndicator) {
    throw new Error('No loading state found');
  }
  
  return true;
}

/**
 * Test table rendering
 */
export function assertTableStructure(table, expectedColumns, expectedRows) {
  const headers = table.querySelectorAll('thead th');
  const rows = table.querySelectorAll('tbody tr');
  
  if (headers.length !== expectedColumns) {
    throw new Error(
      `Expected ${expectedColumns} table columns, found ${headers.length}`
    );
  }
  
  if (rows.length !== expectedRows) {
    throw new Error(
      `Expected ${expectedRows} table rows, found ${rows.length}`
    );
  }
  
  return true;
}

/**
 * Test pill/badge rendering
 */
export function assertPillVariant(pill, expectedVariant) {
  if (!pill.classList.contains('pill')) {
    throw new Error('Element is not a pill');
  }
  
  if (expectedVariant && !pill.classList.contains(expectedVariant)) {
    throw new Error(
      `Expected pill variant "${expectedVariant}", got "${pill.className}"`
    );
  }
  
  return true;
}

/**
 * Test button state
 */
export function assertButtonState(button, expectedState) {
  const states = {
    primary: button.classList.contains('primary'),
    danger: button.classList.contains('danger'),
    disabled: button.disabled,
  };
  
  if (expectedState in states && !states[expectedState]) {
    throw new Error(
      `Expected button to be "${expectedState}", but it's not`
    );
  }
  
  return true;
}

/**
 * Snapshot test helper (compare DOM structure)
 */
export function createSnapshot(element) {
  return {
    html: element.innerHTML,
    classes: Array.from(element.classList),
    children: element.children.length,
    bounds: element.getBoundingClientRect(),
    styles: window.getComputedStyle(element),
  };
}

/**
 * Compare snapshots
 */
export function compareSnapshots(snapshot1, snapshot2, options = {}) {
  const differences = [];
  
  if (options.compareHTML && snapshot1.html !== snapshot2.html) {
    differences.push('HTML content differs');
  }
  
  if (options.compareClasses) {
    const classes1 = snapshot1.classes.sort().join(' ');
    const classes2 = snapshot2.classes.sort().join(' ');
    if (classes1 !== classes2) {
      differences.push(`Classes differ: "${classes1}" vs "${classes2}"`);
    }
  }
  
  if (options.compareChildren && snapshot1.children !== snapshot2.children) {
    differences.push(`Child count differs: ${snapshot1.children} vs ${snapshot2.children}`);
  }
  
  return {
    equal: differences.length === 0,
    differences,
  };
}

/**
 * Test utility - wait for element to appear
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element);
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

/**
 * Test utility - simulate user interaction
 */
export function simulateClick(element) {
  const event = new MouseEvent('click', {
    view: window,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

export function simulateInput(element, value) {
  element.value = value;
  const event = new Event('input', {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

/**
 * Test utility - mock data generator
 */
export const mockData = {
  metrics: () => ({
    tps: Math.floor(Math.random() * 1000),
    fees: Math.random() * 10,
    latencyMs: Math.floor(Math.random() * 100),
    peers: Math.floor(Math.random() * 50),
    blockHeight: Math.floor(Math.random() * 1000000),
    finalizedHeight: Math.floor(Math.random() * 1000000),
    issuance: Math.floor(Math.random() * 5000),
    avgBlockTime: Math.floor(Math.random() * 1000),
  }),
  
  orders: (count = 10) => {
    const orders = [];
    for (let i = 0; i < count; i++) {
      orders.push({
        token: 'BLOCK',
        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
        qty: Math.floor(Math.random() * 100) + 1,
        price: 1.0 + Math.random() * 0.5,
        timestamp: Date.now() - i * 1000,
      });
    }
    return orders;
  },
  
  network: () => ({
    metrics: {
      peers: Math.floor(Math.random() * 50),
      active: Math.floor(Math.random() * 40),
      avgLatency: Math.floor(Math.random() * 100),
      validators: Math.floor(Math.random() * 20),
      block_height: Math.floor(Math.random() * 1000000),
      finalized_height: Math.floor(Math.random() * 1000000),
      tps: Math.floor(Math.random() * 1000),
      block_time_ms: Math.floor(Math.random() * 1000),
      network_strength: ['Weak', 'Moderate', 'Strong'][Math.floor(Math.random() * 3)],
    },
    lastUpdated: Date.now(),
    error: null,
  }),
};

/**
 * Example test suite
 */
export const exampleTests = {
  'TheBlock Dashboard': async () => {
    // Test hero metrics grid
    const heroGrid = document.querySelector('.metrics-hero-grid');
    assertMetricGrouping(heroGrid, 'card-metric-hero', 4);
    
    // Test data binding
    const mockMetrics = mockData.metrics();
    assertDataBinding(heroGrid, 'tps', mockMetrics.tps, 'number');
    
    // Test responsive behavior
    await testBreakpoint({ width: 768, height: 1024 }, () => {
      // Verify grid collapses on tablet
    });
  },
  
  'Trading Layout': () => {
    const tradingLayout = document.querySelector('.layout-trading');
    assertGridLayout(tradingLayout, 3);
    
    // Test order book rendering
    const orderBook = document.querySelector('#order-book-content');
    if (!orderBook) throw new Error('Order book not rendered');
  },
  
  'Color Contrast': () => {
    // Test WCAG AA compliance
    assertColorContrast('#e9f1ff', '#0b1220', 4.5);
    assertColorContrast('#8aa2c2', '#121b2e', 4.5);
  },
};

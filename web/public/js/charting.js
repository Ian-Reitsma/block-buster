/**
 * Block-Buster Chart.js Theme & Utilities
 * Consolidated theming system to eliminate duplicate Chart.js config across pages
 * Preserves existing utilities while adding unified theme management
 */

const chartRefs = {};
const pendingFrames = {};
const pooledCanvases = new Map();

// ========================================
// CENTRALIZED THEME CONFIGURATION
// ========================================

/**
 * Unified color palette for all charts
 * Single source of truth for chart colors
 */
export const BLOCK_CHART_THEME = {
  colors: {
    amber: { border: 'rgb(251, 191, 36)', bg: 'rgba(251, 191, 36, 0.1)' },
    cyan: { border: 'rgb(34, 211, 238)', bg: 'rgba(34, 211, 238, 0.1)' },
    purple: { border: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.1)' },
    green: { border: 'rgb(74, 222, 128)', bg: 'rgba(74, 222, 128, 0.1)' },
    red: { border: 'rgb(248, 113, 113)', bg: 'rgba(248, 113, 113, 0.1)' },
    blue: { border: 'rgb(59, 130, 246)', bg: 'rgba(59, 130, 246, 0.1)' },
    gray: { border: 'rgb(156, 163, 175)', bg: 'rgba(156, 163, 175, 0.1)' },
    yellow: { border: 'rgb(250, 204, 21)', bg: 'rgba(250, 204, 21, 0.1)' },
  },

  /**
   * Default options applied to all charts
   * Ensures consistent look and feel across the application
   */
  defaults: {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750,
      easing: 'easeInOutQuart',
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
        labels: {
          color: '#e5e7eb',
          usePointStyle: true,
          font: {
            family: 'JetBrains Mono, monospace',
            size: 11,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        borderColor: 'rgba(251, 191, 36, 0.3)',
        borderWidth: 1,
        padding: 12,
        titleColor: '#fff',
        bodyColor: '#d1d5db',
        bodyFont: {
          family: 'JetBrains Mono, monospace',
          size: 11,
        },
        cornerRadius: 8,
        displayColors: true,
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
          drawBorder: false,
        },
        ticks: {
          color: '#9ca3af',
          font: {
            family: 'JetBrains Mono, monospace',
            size: 11,
          },
        },
      },
      y: {
        display: true,
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
          drawBorder: false,
        },
        ticks: {
          color: '#9ca3af',
          font: {
            family: 'JetBrains Mono, monospace',
            size: 11,
          },
        },
      },
    },
  },

  /**
   * Deep merge utility for combining config objects
   * @param {Object} target - Target object
   * @param {...Object} sources - Source objects to merge
   * @returns {Object} Merged object
   */
  mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (typeof target === 'object' && typeof source === 'object') {
      for (const key in source) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.mergeDeep(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return this.mergeDeep(target, ...sources);
  },

  /**
   * Create a themed Chart.js instance
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {string} type - Chart type (line, bar, doughnut, etc.)
   * @param {Object} config - Chart configuration {data, options}
   * @returns {Chart} Chart.js instance
   */
  createChart(ctx, type, config) {
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return null;
    }

    // Deep clone defaults to avoid mutation
    const defaultOptions = JSON.parse(JSON.stringify(this.defaults));

    // Merge user options with defaults
    const mergedOptions = this.mergeDeep(defaultOptions, config.options || {});

    return new Chart(ctx, {
      type,
       config.data,
      options: mergedOptions,
    });
  },
};

/**
 * Convenience wrapper for creating themed charts
 * @param {CanvasRenderingContext2D|string} ctxOrId - Canvas context or canvas ID
 * @param {string} type - Chart type
 * @param {Object} config - Chart configuration
 * @returns {Chart} Chart.js instance
 */
export function createThemedChart(ctxOrId, type, config) {
  let ctx = ctxOrId;
  if (typeof ctxOrId === 'string') {
    const canvas = document.getElementById(ctxOrId);
    if (!canvas) {
      console.error(`Canvas with ID '${ctxOrId}' not found`);
      return null;
    }
    ctx = canvas.getContext('2d');
  }
  return BLOCK_CHART_THEME.createChart(ctx, type, config);
}

// ========================================
// LEGACY UTILITIES (Preserved)
// ========================================

const tooltipDelegate = {
  id: 'delegateTooltip',
  beforeEvent(chart, args) {
    const event = args.event;
    if (!event || event.type !== 'mousemove') return;
    Chart.helpers.almostEquals = Chart.helpers.almostEquals;
  },
};

/**
 * Apply global Chart.js defaults
 * Legacy function - consider using createThemedChart instead
 */
function applyChartTheme() {
  if (typeof Chart === 'undefined') return;
  if (!Chart.registry.plugins.get('delegateTooltip')) {
    Chart.register(tooltipDelegate);
  }
  Chart.defaults.color = '#e5e7eb';
  Chart.defaults.font.family = 'JetBrains Mono, monospace';
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.95)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(251, 191, 36, 0.3)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.bar.borderRadius = 6;
  Chart.defaults.scales.linear.grid.color = 'rgba(156, 163, 175, 0.1)';
  Chart.defaults.scales.category.grid.color = 'rgba(156, 163, 175, 0.1)';
  Chart.defaults.scales.linear.ticks.color = '#9ca3af';
  Chart.defaults.scales.category.ticks.color = '#9ca3af';
}

function stateNode(canvas) {
  const next = canvas.nextElementSibling;
  if (next && next.classList.contains('chart-state')) return next;
  const div = document.createElement('div');
  div.className = 'chart-state hidden';
  canvas.parentNode.insertBefore(div, canvas.nextSibling);
  return div;
}

function showState(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const el = stateNode(canvas);
  el.textContent = message;
  el.classList.remove('hidden');
  canvas.classList.add('hidden');
}

function hideState(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const el = stateNode(canvas);
  el.classList.add('hidden');
  canvas.classList.remove('hidden');
}

function destroyChart(key) {
  if (chartRefs[key]) {
    chartRefs[key].destroy();
    chartRefs[key] = null;
  }
}

function batchChartUpdate(key, fn) {
  if (pendingFrames[key]) return;
  pendingFrames[key] = true;
  requestAnimationFrame(() => {
    pendingFrames[key] = false;
    fn();
  });
}

function trimChartPoints(chart, maxPoints = 60) {
  if (!maxPoints) return;
  if (!chart || !chart.data || !chart.data.labels) return;
  while (chart.data.labels.length > maxPoints) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((ds) => Array.isArray(ds.data) && ds.data.shift());
  }
}

/**
 * Build a chart with shared defaults and basic state handling
 * @param {string} key - logical chart key for reuse/destroy
 * @param {string} canvasId - DOM id of canvas
 * @param {object} config - Chart.js config
 * @param {object} opts - {emptyMessage?, errorMessage?, allowEmpty?, maxPoints?}
 * @returns {Chart|null} Chart.js instance or null
 */
function buildChart(key, canvasId, config, opts = {}) {
  if (typeof Chart === 'undefined') return null;
  let canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // Reuse pooled canvas contexts
  if (!pooledCanvases.has(canvasId)) {
    pooledCanvases.set(canvasId, canvas.getContext('2d'));
  }
  const ctx = pooledCanvases.get(canvasId);

  const hasData =
    config?.data?.datasets?.some((ds) => Array.isArray(ds.data) && ds.data.length > 0) ?? false;

  if (!hasData && !opts.allowEmpty) {
    showState(canvasId, opts.emptyMessage || 'No data yet');
    destroyChart(key);
    return null;
  }

  hideState(canvasId);
  destroyChart(key);
  config.options = config.options || {};
  config.options.plugins = config.options.plugins || {};
  if (!config.options.plugins.delegateTooltip) {
    config.options.plugins.delegateTooltip = tooltipDelegate;
  }
  if (config.type === 'line') {
    config.options.plugins.decimation = Object.assign(
      { enabled: true, algorithm: 'lttb', samples: opts.maxPoints || 120 },
      config.options.plugins.decimation || {}
    );
    if (Array.isArray(config.data?.datasets)) {
      config.data.datasets.forEach((ds) => {
        if (Array.isArray(ds.data) && ds.data.length > 120) {
          ds.data = ds.data.slice(-120);
        }
      });
    }
  }
  chartRefs[key] = new Chart(ctx, config);
  trimChartPoints(chartRefs[key], opts.maxPoints || 0);
  return chartRefs[key];
}

// ========================================
// EXPORTS
// ========================================

// Expose for modules
if (typeof window !== 'undefined') {
  window.BLOCK_CHART_THEME = BLOCK_CHART_THEME;
  window.createThemedChart = createThemedChart;
  window.applyChartTheme = applyChartTheme;
  window.buildChart = buildChart;
  window.destroyChart = destroyChart;
  window.batchChartUpdate = batchChartUpdate;
  window.trimChartPoints = trimChartPoints;
}

export {
  applyChartTheme,
  buildChart,
  destroyChart,
  batchChartUpdate,
  trimChartPoints,
  showState,
  hideState,
};

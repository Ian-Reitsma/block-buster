// Shared Chart.js theme + state helpers (first-party only)
// Applies consistent typography, colors, and grid styling across all charts
// and exposes small helpers for loading/empty/error states.

const chartRefs = {};
const pendingFrames = {};
const pooledCanvases = new Map();
const tooltipDelegate = {
  id: 'delegateTooltip',
  beforeEvent(chart, args) {
    const event = args.event;
    if (!event || event.type !== 'mousemove') return;
    // Share a single tooltip handler by forwarding to the active chart
    Chart.helpers.almostEquals = Chart.helpers.almostEquals; // no-op to keep treeshake satisfied
  },
};

function applyChartTheme() {
  if (typeof Chart === 'undefined') return;
  if (!Chart.registry.plugins.get('delegateTooltip')) {
    Chart.register(tooltipDelegate);
  }
  Chart.defaults.color = '#e5e7eb';
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 17, 17, 0.9)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.08)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.bar.borderRadius = 6;
  Chart.defaults.scales.linear.grid.color = 'rgba(255, 255, 255, 0.06)';
  Chart.defaults.scales.category.grid.color = 'rgba(255, 255, 255, 0.06)';
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
    chart.data.datasets.forEach(ds => Array.isArray(ds.data) && ds.data.shift());
  }
}

/**
 * Build a chart with shared defaults and basic state handling.
 * @param {string} key - logical chart key for reuse/destroy
 * @param {string} canvasId - DOM id of canvas
 * @param {object} config - Chart.js config
 * @param {object} opts - {emptyMessage?, errorMessage?, allowEmpty?, maxPoints?}
 */
function buildChart(key, canvasId, config, opts = {}) {
  if (typeof Chart === 'undefined') return null;
  let canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // reuse pooled canvas contexts across charts to avoid excessive allocations
  if (!pooledCanvases.has(canvasId)) {
    pooledCanvases.set(canvasId, canvas.getContext('2d'));
  }
  const ctx = pooledCanvases.get(canvasId);

  const hasData =
    config?.data?.datasets?.some(ds => Array.isArray(ds.data) && ds.data.length > 0) ?? false;

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
      config.data.datasets.forEach(ds => {
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

// Expose for other modules
const chartingRoot = typeof window !== 'undefined' ? window : globalThis;
chartingRoot.applyChartTheme = applyChartTheme;
chartingRoot.buildChart = buildChart;
chartingRoot.destroyChart = destroyChart;
chartingRoot.batchChartUpdate = batchChartUpdate;
chartingRoot.trimChartPoints = trimChartPoints;

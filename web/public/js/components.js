/**
 * Block-Buster Component Library
 * Reusable UI components to eliminate copy-paste HTML across pages
 * All components return HTML strings for easy integration
 */

// ========================================
// STATUS & BADGE COMPONENTS
// ========================================

/**
 * Status pill component for gate states
 * @param {Object} props
 * @param {'trade'|'rehearsal'|'gated'|'active'} props.status - Status type
 * @param {string} props.text - Display text
 * @param {string} [props.icon] - Optional icon/emoji
 * @returns {string} HTML string
 */
export function StatusPill({ status, text, icon = '' }) {
  const classes = {
    trade: 'status-trade',
    rehearsal: 'status-rehearsal',
    gated: 'status-gated',
    active: 'status-active',
  };
  const statusClass = classes[status] || 'status-gated';
  return `<span class="chip chip-pill status-pill ${statusClass}">${icon ? `${icon} ` : ''}${text}</span>`;
}

/**
 * Simple badge component
 * @param {Object} props
 * @param {string} props.text - Badge text
 * @param {string} [props.color='gray'] - Color variant
 * @returns {string} HTML string
 */
export function Badge({ text, color = 'gray' }) {
  const colorClasses = {
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    green: 'bg-green-500/20 text-green-400 border-green-500/40',
    red: 'bg-red-500/20 text-red-400 border-red-500/40',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  };
  return `<span class="inline-flex px-2 py-1 text-xs rounded border ${colorClasses[color] || colorClasses.gray}">${text}</span>`;
}

// ========================================
// METRIC & KPI COMPONENTS
// ========================================

/**
 * Metric card (KPI display)
 * @param {Object} props
 * @param {string} props.label - Metric label
 * @param {string|number} props.value - Main value
 * @param {string} [props.meta] - Optional metadata/subtext
 * @param {string} [props.icon] - Optional icon/emoji
 * @param {string} [props.trend] - Optional trend indicator ('up', 'down', 'neutral')
 * @returns {string} HTML string
 */
export function MetricCard({ label, value, meta, icon = '', trend }) {
  let trendIndicator = '';
  if (trend === 'up') {
    trendIndicator = '<span class="text-green-400 text-sm">↑</span>';
  } else if (trend === 'down') {
    trendIndicator = '<span class="text-red-400 text-sm">↓</span>';
  }

  return `
    <div class="kpi">
      <div class="kpi-label">${icon ? `${icon} ` : ''}${label}</div>
      <div class="kpi-value">${value} ${trendIndicator}</div>
      ${meta ? `<div class="kpi-meta">${meta}</div>` : ''}
    </div>
  `;
}

/**
 * Simple stat display (inline version)
 * @param {Object} props
 * @param {string} props.label - Stat label
 * @param {string|number} props.value - Stat value
 * @returns {string} HTML string
 */
export function Stat({ label, value }) {
  return `
    <div class="flex items-center justify-between py-2">
      <span class="text-sm text-gray-400">${label}</span>
      <span class="text-sm font-semibold text-white">${value}</span>
    </div>
  `;
}

// ========================================
// GATE & MARKET COMPONENTS
// ========================================

/**
 * Gate readiness card
 * @param {Object} props
 * @param {string} props.market - Market name (storage, compute, energy, domain, ads)
 * @param {'Trade'|'Rehearsal'|'Gated'} props.status - Gate status
 * @param {number} props.readiness - Readiness percentage (0-100)
 * @param {number} [props.threshold=80] - Threshold for "ready" state
 * @param {Object} [props.metrics] - Optional metrics object {volume, liquidity, etc.}
 * @returns {string} HTML string
 */
export function GateCard({ market, status, readiness, threshold = 80, metrics }) {
  const marketInfo = {
    storage: { name: 'Storage Market', icon: '💾', color: 'cyan' },
    compute: { name: 'Compute Market', icon: '⚡', color: 'amber' },
    energy: { name: 'Energy Market', icon: '🔋', color: 'green' },
    domain: { name: 'Domain Market', icon: '🌐', color: 'purple' },
    ads: { name: 'Ad Market', icon: '📢', color: 'blue' },
  };

  const info = marketInfo[market] || { name: market, icon: '📊', color: 'gray' };
  const isReady = readiness >= threshold;
  const statusClass = status === 'Trade' ? 'trade' : status === 'Rehearsal' ? 'rehearsal' : 'gated';

  let metricsHtml = '';
  if (metrics) {
    metricsHtml = Object.entries(metrics)
      .map(([key, val]) => Stat({ label: key, value: val }))
      .join('');
  }

  return `
    <div class="gate-card">
      <div class="gate-card-header">
        <div class="gate-card-title">
          <span class="gate-card-icon">${info.icon}</span>
          ${info.name}
        </div>
        ${StatusPill({ status: statusClass, text: status })}
      </div>
      
      ${ProgressBar({ value: readiness, max: 100, color: `bg-${info.color}-500`, label: 'Readiness', showPercentage: true })}
      
      ${metricsHtml ? `<div class="mt-3 space-y-1 border-t border-gray-700/50 pt-3">${metricsHtml}</div>` : ''}
    </div>
  `;
}

// ========================================
// PROGRESS & LOADING COMPONENTS
// ========================================

/**
 * Progress bar with percentage
 * @param {Object} props
 * @param {number} props.value - Current value
 * @param {number} [props.max=100] - Maximum value
 * @param {string} [props.color='bg-amber-500'] - Bar color (Tailwind class)
 * @param {string} [props.label] - Optional label
 * @param {boolean} [props.showPercentage=true] - Show percentage text
 * @returns {string} HTML string
 */
export function ProgressBar({ value, max = 100, color = 'bg-amber-500', label, showPercentage = true }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return `
    <div class="w-full">
      ${label ? `<div class="text-xs font-semibold text-gray-400 mb-1">${label}</div>` : ''}
      ${showPercentage ? `<div class="text-xs text-gray-400 mb-1">${pct.toFixed(1)}%</div>` : ''}
      <div class="progress-bar-container">
        <div class="progress-bar ${color}" style="width: ${pct}%"></div>
      </div>
    </div>
  `;
}

/**
 * Loading skeleton
 * @param {Object} props
 * @param {string} [props.height='80px'] - Skeleton height
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {string} HTML string
 */
export function Skeleton({ height = '80px', className = '' }) {
  return `<div class="skeleton ${className}" style="height: ${height};"></div>`;
}

/**
 * Loading spinner
 * @param {Object} props
 * @param {string} [props.size='md'] - Size variant (sm, md, lg)
 * @param {string} [props.message] - Optional loading message
 * @returns {string} HTML string
 */
export function LoadingSpinner({ size = 'md', message }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };
  return `
    <div class="flex flex-col items-center justify-center p-8">
      <div class="loading-spinner ${sizes[size] || sizes.md}"></div>
      ${message ? `<div class="text-sm text-gray-400 mt-3">${message}</div>` : ''}
    </div>
  `;
}

// ========================================
// EMPTY & ERROR STATES
// ========================================

/**
 * Empty state message
 * @param {Object} props
 * @param {string} props.title - Title text
 * @param {string} [props.message] - Optional description
 * @param {string} [props.icon='📄'] - Icon/emoji
 * @param {string} [props.action] - Optional action HTML (e.g., button)
 * @returns {string} HTML string
 */
export function EmptyState({ title, message, icon = '📄', action }) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      ${message ? `<div class="empty-state-message">${message}</div>` : ''}
      ${action ? `<div class="mt-4">${action}</div>` : ''}
    </div>
  `;
}

/**
 * Error state message
 * @param {Object} props
 * @param {string} props.title - Error title
 * @param {string} [props.message] - Error details
 * @param {string} [props.action] - Optional retry/action HTML
 * @returns {string} HTML string
 */
export function ErrorState({ title, message, action }) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon text-red-400">⚠️</div>
      <div class="empty-state-title text-red-400">${title}</div>
      ${message ? `<div class="empty-state-message">${message}</div>` : ''}
      ${action ? `<div class="mt-4">${action}</div>` : ''}
    </div>
  `;
}

// ========================================
// BUTTON COMPONENTS
// ========================================

/**
 * Button component
 * @param {Object} props
 * @param {string} props.text - Button text
 * @param {string} [props.variant='primary'] - Button variant (primary, secondary, ghost)
 * @param {string} [props.size='md'] - Size variant (sm, md, lg)
 * @param {string} [props.onClick] - onclick handler
 * @param {string} [props.className=''] - Additional classes
 * @returns {string} HTML string
 */
export function Button({ text, variant = 'primary', size = 'md', onClick, className = '' }) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
  };
  const sizes = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };
  return `<button class="btn ${variants[variant]} ${sizes[size]} ${className}" ${onClick ? `onclick="${onClick}"` : ''}>${text}</button>`;
}

// ========================================
// TABLE COMPONENTS
// ========================================

/**
 * Simple table component
 * @param {Object} props
 * @param {Array<string>} props.headers - Table headers
 * @param {Array<Array<string>>} props.rows - Table rows (2D array)
 * @param {string} [props.className=''] - Additional classes
 * @returns {string} HTML string
 */
export function Table({ headers, rows, className = '' }) {
  const headerHtml = headers.map((h) => `<th>${h}</th>`).join('');
  const rowsHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('');

  return `
    <div class="table-container">
      <table class="table ${className}">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

// ========================================
// TOAST NOTIFICATIONS
// ========================================

let toastCounter = 0;

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} [type='info'] - Toast type (error, success, warning, info)
 * @param {number} [duration=3000] - Auto-dismiss duration in ms (0 = no auto-dismiss)
 */
export function showToast(message, type = 'info', duration = 3000) {
  const id = `toast-${++toastCounter}`;
  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.remove();
    }, duration);
  }

  return id;
}

/**
 * Dismiss toast by ID
 * @param {string} id - Toast ID returned by showToast
 */
export function dismissToast(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ========================================
// PANEL COMPONENTS
// ========================================

/**
 * Panel/card wrapper
 * @param {Object} props
 * @param {string} props.content - Panel content HTML
 * @param {string} [props.title] - Optional panel title
 * @param {string} [props.variant='blade'] - Panel variant (blade, hologram, glass)
 * @param {string} [props.className=''] - Additional classes
 * @returns {string} HTML string
 */
export function Panel({ content, title, variant = 'blade', className = '' }) {
  const variants = {
    blade: 'panel-blade',
    hologram: 'hologram-panel',
    glass: 'glass-panel',
  };
  return `
    <div class="${variants[variant] || variants.blade} ${className}">
      ${title ? `<h3 class="text-lg font-bold text-white mb-3">${title}</h3>` : ''}
      ${content}
    </div>
  `;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Format number with commas and optional decimals
 * @param {number} num - Number to format
 * @param {number} [decimals=0] - Decimal places
 * @returns {string} Formatted string
 */
export function formatNumber(num, decimals = 0) {
  if (num == null || isNaN(num)) return '—';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format currency
 * @param {number} num - Amount
 * @param {string} [currency='USD'] - Currency code
 * @returns {string} Formatted currency string
 */
export function formatCurrency(num, currency = 'USD') {
  if (num == null || isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
}

/**
 * Format percentage
 * @param {number} num - Number (0-100 or 0-1)
 * @param {number} [decimals=1] - Decimal places
 * @param {boolean} [isDecimal=false] - Is input 0-1 (true) or 0-100 (false)
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(num, decimals = 1, isDecimal = false) {
  if (num == null || isNaN(num)) return '—';
  const value = isDecimal ? num * 100 : num;
  return `${value.toFixed(decimals)}%`;
}

// ========================================
// EXPORTS
// ========================================

// Expose to window for non-module usage
if (typeof window !== 'undefined') {
  window.BlockComponents = {
    StatusPill,
    Badge,
    MetricCard,
    Stat,
    GateCard,
    ProgressBar,
    Skeleton,
    LoadingSpinner,
    EmptyState,
    ErrorState,
    Button,
    Table,
    showToast,
    dismissToast,
    Panel,
    formatNumber,
    formatCurrency,
    formatPercentage,
  };
}

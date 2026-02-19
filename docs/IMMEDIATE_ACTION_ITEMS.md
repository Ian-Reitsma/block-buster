# Block-Buster: Immediate Action Items

**Generated:** February 12, 2026  
**Based on:** DEV_AUDIT_2026.md  
**Timeline:** 2 weeks to implement P0 items

---

## Week 1: Tooling & Foundation

### Day 1-2: Build System Setup
**Owner:** DevOps + Frontend Lead  
**Effort:** 8-12 hours

```bash
# Initialize modern tooling
cd ~/projects/the-block/block-buster/web
npm init -y

# Install dependencies
npm install -D \
  vite \
  tailwindcss \
  postcss \
  autoprefixer \
  eslint \
  prettier \
  @vitejs/plugin-legacy

# Configure Tailwind
npx tailwindcss init -p

# Create vite.config.js
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'public/dashboard.html'),
        economics: resolve(__dirname, 'public/economics.html'),
        network: resolve(__dirname, 'public/network.html'),
        trading: resolve(__dirname, 'public/trading.html'),
        theblock: resolve(__dirname, 'public/theblock.html'),
        strategies: resolve(__dirname, 'public/strategies.html'),
        whales: resolve(__dirname, 'public/whales.html'),
        sentiment: resolve(__dirname, 'public/sentiment.html'),
        mev: resolve(__dirname, 'public/mev.html'),
        settings: resolve(__dirname, 'public/settings.html')
      }
    }
  },
  server: {
    port: 4173,
    proxy: {
      '/rpc': 'http://localhost:5000',
      '/health': 'http://localhost:5000',
      '/theblock': 'http://localhost:5000'
    }
  }
});
EOF

# Update package.json scripts
npm pkg set scripts.dev="vite"
npm pkg set scripts.build="vite build"
npm pkg set scripts.preview="vite preview"
npm pkg set scripts.lint="eslint public/js/**/*.js"
npm pkg set scripts.format="prettier --write public/**/*.{js,html,css}"
```

**Test:**
```bash
npm run dev
# Open http://localhost:4173/dashboard.html
# Verify all pages load correctly
# Verify RPC calls work through proxy
```

**Success Criteria:**
- ✅ `npm run dev` starts dev server with HMR
- ✅ `npm run build` outputs to `dist/` with fingerprinted assets
- ✅ All 10 pages render identically to current
- ✅ RPC proxy works (no CORS issues)

---

### Day 3-4: Design System Consolidation
**Owner:** Frontend Lead  
**Effort:** 10-14 hours

**Task 1: Extract design tokens**
```javascript
// tailwind.config.js
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        // Primary palette
        'block-purple': '#a855f7',
        'block-amber': '#fbbf24',
        'block-cyan': '#22d3ee',
        'block-green': '#4ade80',
        'block-blue': '#3b82f6',
        
        // Background system
        'panel-black': 'rgb(12, 18, 28)',
        'bg-base': '#050910',
        
        // Blade palette (from dashboard.css)
        'blade-amber': '#ffb74d',
        'cyan-glow': '#80f2ff',
        
        // Status colors
        'status': {
          'ok': '#3fd8ad',
          'warn': '#f0a500',
          'bad': '#ef5b6b',
          'info': '#5ca9ff'
        }
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['IBM Plex Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      fontSize: {
        'xs': '11px',
        'sm': '13px',
        'md': '15px',
        'lg': '18px',
        'xl': '22px',
        'kpi': '30px'
      }
    }
  },
  plugins: []
};
```

**Task 2: Create shared CSS**
```bash
# Create new file
cat > public/css/block-buster.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom Components */
@layer components {
  .panel-blade {
    @apply bg-panel-black/90 border border-gray-700/50 rounded-xl p-4 shadow-lg;
  }
  
  .hologram-panel {
    @apply bg-gray-900/90 border border-amber-500/40 rounded-lg;
    box-shadow: 0 0 10px rgba(251, 191, 36, 0.2);
  }
  
  .status-pill {
    @apply inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs uppercase tracking-wide border;
  }
  
  .status-trade { @apply border-green-500/60 bg-green-500/10 text-green-400; }
  .status-rehearsal { @apply border-yellow-500/60 bg-yellow-500/10 text-yellow-400; }
  .status-gated { @apply border-gray-500/60 bg-gray-500/10 text-gray-400; }
  
  .kpi {
    @apply bg-panel-black border border-gray-700/50 rounded-xl p-4;
  }
  
  .kpi-label {
    @apply text-xs uppercase tracking-wider text-gray-500;
  }
  
  .kpi-value {
    @apply text-3xl font-bold text-white;
  }
}
EOF

# Build CSS
npx tailwindcss -i public/css/block-buster.css -o public/css/tailwind.built.css --watch
```

**Task 3: Update HTML files**
```bash
# Remove inline styles, use Tailwind classes
# Replace:
#   <link rel="stylesheet" href="css/tailwind.min.css?v=20260205">
# With:
#   <link rel="stylesheet" href="css/tailwind.built.css">
```

**Success Criteria:**
- ✅ All colors referenced from `tailwind.config.js`
- ✅ No inline `<style>` tags (except economics.html tooltips)
- ✅ Consistent component classes across pages
- ✅ Design tokens documented in README

---

### Day 5: RPC Client Unification
**Owner:** Backend + Frontend  
**Effort:** 6-8 hours

**Create unified client:**
```javascript
// public/js/rpc-client.js
/**
 * Unified RPC client for The Block with retry logic and middleware support
 */
export class BlockRpcClient {
  /**
   * @param {string} baseUrl - API base URL (e.g., http://localhost:5000)
   * @param {Object} options - Configuration options
   * @param {string} [options.apiKey] - Optional API key
   * @param {number} [options.retries=2] - Max retry attempts
   * @param {number} [options.timeout=10000] - Request timeout in ms
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = options.apiKey;
    this.retries = options.retries || 2;
    this.timeout = options.timeout || 10000;
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  /**
   * Call an RPC method with automatic retry and deduplication
   * @param {string} method - RPC method name (e.g., 'governor.status')
   * @param {Object} params - Method parameters
   * @returns {Promise<any>} Response data
   */
  async call(method, params = {}) {
    // Deduplicate identical in-flight requests
    const cacheKey = `${method}:${JSON.stringify(params)}`;
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const promise = this._executeWithRetry(method, params);
    this.pendingRequests.set(cacheKey, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  async _executeWithRetry(method, params) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this._execute(method, params);
      } catch (err) {
        lastError = err;
        if (attempt < this.retries) {
          await this._sleep(Math.pow(2, attempt) * 500); // Exponential backoff
        }
      }
    }
    throw lastError;
  }

  async _execute(method, params) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const payload = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params
    };

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    try {
      const startTime = performance.now();
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const latencyMs = performance.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      return { result: data.result, latencyMs };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods for common endpoints
  async governorStatus() { return this.call('governor.status'); }
  async governorDecisions(limit = 100) { return this.call('governor.decisions', { limit }); }
  async blockHeight() { return this.call('consensus.block_height'); }
  async blockReward() { return this.call('consensus.block_reward'); }
  async ledgerBalance(address) { return this.call('ledger.balance', { address }); }
  async ledgerSupply() { return this.call('ledger.supply'); }
  async marketMetrics() { return this.call('analytics.market_metrics'); }
  async treasuryBalance() { return this.call('treasury.balance'); }
}

// Export singleton instance
export const rpcClient = new BlockRpcClient(
  typeof window !== 'undefined' ? (window.API_BASE || 'http://localhost:5000') : 'http://localhost:5000',
  { apiKey: typeof window !== 'undefined' ? window.API_KEY : undefined }
);
```

**Migrate economics.js to use it:**
```javascript
// Before:
const api = {
  async call(method, params = {}) { /* 50 lines */ }
};

// After:
import { rpcClient } from './rpc-client.js';
const { result } = await rpcClient.governorStatus();
```

**Success Criteria:**
- ✅ All pages use `BlockRpcClient`
- ✅ No duplicate RPC logic
- ✅ Request deduplication works (test with DevTools)
- ✅ Retry logic tested (simulate network failure)

---

## Week 2: Chart Consolidation & Components

### Day 6-7: Chart.js Theme Consolidation
**Owner:** Frontend  
**Effort:** 6-8 hours

**Centralize theming:**
```javascript
// public/js/charting.js (updated)
export const BLOCK_CHART_THEME = {
  colors: {
    amber: { border: 'rgb(251, 191, 36)', bg: 'rgba(251, 191, 36, 0.1)' },
    cyan: { border: 'rgb(34, 211, 238)', bg: 'rgba(34, 211, 238, 0.1)' },
    purple: { border: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.1)' },
    green: { border: 'rgb(74, 222, 128)', bg: 'rgba(74, 222, 128, 0.1)' },
    red: { border: 'rgb(248, 113, 113)', bg: 'rgba(248, 113, 113, 0.1)' },
    gray: { border: 'rgb(156, 163, 175)', bg: 'rgba(156, 163, 175, 0.1)' }
  },
  
  defaults: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 750, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        borderColor: 'rgba(251, 191, 36, 0.3)',
        borderWidth: 1,
        padding: 12,
        titleColor: '#fff',
        bodyColor: '#d1d5db',
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        display: true,
        grid: { color: 'rgba(156, 163, 175, 0.1)', drawBorder: false },
        ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 11 } }
      },
      y: {
        display: true,
        grid: { color: 'rgba(156, 163, 175, 0.1)', drawBorder: false },
        ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 11 } }
      }
    }
  },
  
  /**
   * Deep merge objects
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
   */
  createChart(ctx, type, config) {
    const mergedOptions = this.mergeDeep(
      JSON.parse(JSON.stringify(this.defaults)), // Deep clone
      config.options || {}
    );
    
    return new Chart(ctx, {
      type,
       config.data,
      options: mergedOptions
    });
  }
};

// Export convenience wrapper
export function createThemedChart(ctx, type, config) {
  return BLOCK_CHART_THEME.createChart(ctx, type, config);
}
```

**Update economics.js:**
```javascript
// Before:
state.charts.simulator = new Chart(simChartCtx, {
  type: 'line',
   { /* ... */ },
  options: { /* 50 lines of config */ }
});

// After:
import { createThemedChart, BLOCK_CHART_THEME } from './charting.js';
state.charts.simulator = createThemedChart(simChartCtx, 'line', {
   { /* ... */ },
  options: {
    scales: { y: { min: 0, max: 40 } } // Only overrides
  }
});
```

**Success Criteria:**
- ✅ All charts use `createThemedChart`
- ✅ Theme changes in one place propagate everywhere
- ✅ Chart code reduced by ~40%

---

### Day 8-9: Component Library
**Owner:** Frontend  
**Effort:** 8-10 hours

**Create component library:**
```javascript
// public/js/components.js
/**
 * Reusable UI components for Block-Buster
 */

/**
 * Status pill component
 * @param {Object} props
 * @param {'trade'|'rehearsal'|'gated'} props.status
 * @param {string} props.text
 * @returns {string} HTML string
 */
export function StatusPill({ status, text }) {
  const classes = {
    trade: 'status-trade',
    rehearsal: 'status-rehearsal',
    gated: 'status-gated'
  };
  return `<span class="chip chip-pill ${classes[status] || 'status-gated'}">${text}</span>`;
}

/**
 * Metric card (KPI display)
 */
export function MetricCard({ label, value, meta, icon = '' }) {
  return `
    <div class="kpi">
      <div class="kpi-label">${icon ? `${icon} ` : ''}${label}</div>
      <div class="kpi-value">${value}</div>
      ${meta ? `<div class="kpi-meta">${meta}</div>` : ''}
    </div>
  `;
}

/**
 * Loading skeleton
 */
export function Skeleton({ height = '80px', className = '' }) {
  return `<div class="skeleton ${className}" style="height: ${height};"></div>`;
}

/**
 * Empty state message
 */
export function EmptyState({ title, message, icon = '📄' }) {
  return `
    <div class="p-8 text-center text-gray-500">
      <div class="text-4xl mb-3">${icon}</div>
      <div class="text-sm font-semibold">${title}</div>
      ${message ? `<div class="text-xs mt-2">${message}</div>` : ''}
    </div>
  `;
}

/**
 * Progress bar with percentage
 */
export function ProgressBar({ value, max = 100, color = 'bg-amber-500', showPercentage = true }) {
  const pct = (value / max) * 100;
  return `
    <div class="w-full">
      ${showPercentage ? `<div class="text-xs text-gray-400 mb-1">${pct.toFixed(1)}%</div>` : ''}
      <div class="w-full bg-gray-700/30 rounded-full h-3 overflow-hidden">
        <div class="${color} h-3 rounded-full transition-all duration-600" style="width: ${pct}%"></div>
      </div>
    </div>
  `;
}

/**
 * Gate readiness card
 */
export function GateCard({ market, status, readiness, threshold = 80 }) {
  const marketInfo = {
    storage: { name: 'Storage Market', icon: '💾' },
    compute: { name: 'Compute Market', icon: '⚙️' },
    energy: { name: 'Energy Market', icon: '⚡' },
    ads: { name: 'Ad Marketplace', icon: '📊' }
  };
  
  const info = marketInfo[market] || { name: market, icon: '🔹' };
  const isOpen = status === 'Trade';
  const gap = isOpen ? 0 : Math.max(0, threshold - readiness);
  
  return `
    <div class="p-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <span class="text-2xl">${info.icon}</span>
          <div>
            <div class="text-sm font-semibold">${info.name}</div>
            ${StatusPill({ status: status.toLowerCase(), text: status })}
          </div>
        </div>
        <div class="text-right">
          <div class="text-2xl font-bold">${readiness.toFixed(1)}%</div>
        </div>
      </div>
      ${ProgressBar({ value: readiness, max: 100, showPercentage: false })}
      <div class="mt-2 text-xs text-gray-500">
        ${isOpen ? '✓ Market is open' : gap > 50 ? '🔒 Gated' : `🔓 ${gap.toFixed(1)}% to unlock`}
      </div>
    </div>
  `;
}
```

**Usage example:**
```javascript
import { GateCard, MetricCard, EmptyState } from './components.js';

// Render gates
const gatesHtml = Object.entries(governorStatus.gates).map(([market, data]) => 
  GateCard({
    market,
    status: data.state,
    readiness: data.readiness * 100,
    threshold: 80
  })
).join('');

document.getElementById('gates-container').innerHTML = gatesHtml;
```

**Success Criteria:**
- ✅ 5+ reusable components documented
- ✅ Used in at least 3 different pages
- ✅ Storybook or demo page created

---

### Day 10: Testing Setup
**Owner:** DevOps  
**Effort:** 4-6 hours

**Install test framework:**
```bash
npm install -D vitest @vitest/ui happy-dom
```

**Create test file:**
```javascript
// tests/rpc-client.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockRpcClient } from '../web/public/js/rpc-client.js';

describe('BlockRpcClient', () => {
  let client;
  
  beforeEach(() => {
    client = new BlockRpcClient('http://test-api', { retries: 2 });
    global.fetch = vi.fn();
  });

  it('should make successful RPC call', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: {  'test' } })
    });

    const { result } = await client.call('test.method');
    expect(result.data).toBe('test');
  });

  it('should retry on failure', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: 'success' })
      });

    const { result } = await client.call('test.method');
    expect(result).toBe('success');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should deduplicate identical requests', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: 'data' })
    });

    // Fire 3 identical requests simultaneously
    const [r1, r2, r3] = await Promise.all([
      client.call('test.method', { id: 1 }),
      client.call('test.method', { id: 1 }),
      client.call('test.method', { id: 1 })
    ]);

    expect(r1.result).toBe('data');
    expect(global.fetch).toHaveBeenCalledTimes(1); // Only 1 actual fetch
  });
});
```

**Add to package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

**Success Criteria:**
- ✅ `npm test` runs successfully
- ✅ RPC client has >80% coverage
- ✅ CI/CD runs tests automatically

---

## Deliverables Checklist

### End of Week 1
- [ ] Vite dev server working (`npm run dev`)
- [ ] Tailwind config with design tokens
- [ ] ESLint + Prettier configured
- [ ] RPC client unified across all pages
- [ ] Documentation updated (README, OPERATIONS.md)

### End of Week 2
- [ ] Chart.js theme centralized
- [ ] Component library with 5+ components
- [ ] Test suite with >50% coverage
- [ ] Build pipeline (`npm run build`) working
- [ ] All pages migrated to new patterns

---

## Success Metrics

**Code Quality:**
- Lines of code: -30% (deduplication)
- Test coverage: >50%
- Linting errors: 0

**Performance:**
- Bundle size: -25%
- First contentful paint: <1s
- Time to interactive: <2s

**Developer Experience:**
- Hot reload: <200ms
- Build time: <10s
- Type errors caught: +40%

---

## Support & Questions

**Blocked?** Ping #block-buster-dev on Slack  
**Need help?** See DEV_AUDIT_2026.md for detailed explanations  
**Found a bug?** Create issue with `migration` label

---

*Let's ship this! 🚀*

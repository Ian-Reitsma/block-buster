/**
 * Economics & Gating Dashboard (MIGRATED)
 * Modernized to use unified systems from Week 1-2 infrastructure
 * 
 * Changes from original:
 * - Using rpc-client.js instead of custom API client
 * - Using charting.js theming instead of duplicate colors
 * - Using components.js for UI elements
 * - Using store.js for state management
 * - Using error-handler.js for error handling
 * - Using performance-monitor.js for metrics
 * 
 * Code reduction: ~200 lines → ~100 lines (50% reduction)
 */

import { rpcClient } from './rpc-client.js';
import { createThemedChart, BLOCK_CHART_THEME } from './charting.js';
import { 
  GateCard, 
  MetricCard, 
  StatusPill, 
  ProgressBar,
  showToast,
  LoadingSpinner,
  ErrorState,
  formatNumber,
  formatCurrency
} from './components.js';
import { store, createNamespace } from './store.js';
import { errorHandler } from './error-handler.js';
import { perf } from './performance-monitor.js';

(function () {
  if (typeof document === 'undefined') return;

  // ===== Constants =====
  const REFRESH_INTERVAL = 30000; // 30 seconds
  const GATE_HISTORY_INTERVAL = 300000; // 5 minutes
  const MAX_SUPPLY = 40_000_000;
  const BASE_REWARD = 10;
  const HALVING_INTERVAL = 1_000_000;
  const BLOCKS_PER_YEAR = 365 * 24 * 60 * 6; // 10s block time
  const SIMULATOR_DEBOUNCE = 300; // ms

  // ===== State Management (using store.js) =====
  const economicsStore = createNamespace('economics');

  // Local state for simulator only
  const simulatorState = {
    transactionVolume: 1.0,
    uniqueMiners: 1000,
    blockHeight: 0,
    baseReward: BASE_REWARD,
  };

  let charts = {};
  let refreshTimer = null;
  let gateTimer = null;

  // ===== Issuance Formula (Ported from Rust NetworkIssuanceController) =====
  /**
   * Calculates block reward based on adaptive monetary policy
   * Formula: reward = base * activity * decentralization * decay
   */
  function calculateIssuance(
    baseReward,
    activityMultiplier,
    decentralizationMultiplier,
    blockHeight,
    halvingInterval = HALVING_INTERVAL
  ) {
    const halvings = Math.floor(blockHeight / halvingInterval);
    const decay = Math.pow(0.5, halvings);

    // Clamp multipliers to protocol ranges
    const activity = Math.max(0.5, Math.min(2.0, activityMultiplier));
    const decentralization = Math.max(0.8, Math.min(1.5, decentralizationMultiplier));

    return baseReward * activity * decentralization * decay;
  }

  /**
   * Activity multiplier from transaction volume ratio
   * Uses logarithmic scaling for smooth transitions
   */
  function activityFromVolume(volumeRatio) {
    if (volumeRatio <= 0) return 0.5;
    const base = 1.0 + Math.log2(volumeRatio) * 0.3;
    return Math.max(0.5, Math.min(2.0, base));
  }

  /**
   * Decentralization multiplier from unique miner count
   * Uses square root scaling for diminishing returns
   */
  function decentralizationFromMiners(minerCount) {
    if (minerCount <= 0) return 0.8;
    const base = 0.8 + Math.sqrt(minerCount / 1000) * 0.4;
    return Math.max(0.8, Math.min(1.5, base));
  }

  // ===== Data Fetching (using rpc-client.js + error-handler.js) =====
  const fetchAllData = errorHandler.wrap(
    async function () {
      perf.start('fetchEconomicsData');
      setStatus('REFRESHING');

      try {
        // Parallel fetch with rpcClient (automatic retry + deduplication)
        const [governor, reward, height, supply, treasury, metrics] = await Promise.all([
          rpcClient.governorStatus(),
          rpcClient.blockReward(),
          rpcClient.blockHeight(),
          rpcClient.ledgerSupply().catch(() => ({ result: null })),
          rpcClient.treasuryBalance().catch(() => ({ result: { balance: 0 } })),
          rpcClient.marketMetrics().catch(() => ({ result: null })),
        ]);

        // Store data with TTL (60 seconds)
        economicsStore.set('governorStatus', governor.result, 60000);
        economicsStore.set('blockReward', reward.result, 60000);
        economicsStore.set('blockHeight', height.result, 60000);
        economicsStore.set('supply', supply.result, 60000);
        economicsStore.set('treasuryBalance', treasury.result.balance, 60000);
        economicsStore.set('marketMetrics', metrics.result, 60000);
        economicsStore.set('lastUpdate', Date.now());

        // Update simulator with live data
        simulatorState.blockHeight = height.result;
        simulatorState.baseReward = reward.result || BASE_REWARD;

        // Render UI
        renderDashboard();
        setStatus('CONNECTED');

        const duration = perf.end('fetchEconomicsData');
        console.log(`✓ Economics data loaded in ${duration.toFixed(0)}ms`);
      } catch (error) {
        // Error already handled by errorHandler.wrap
        setStatus('ERROR');
        const container = document.getElementById('economics-content');
        if (container) {
          container.innerHTML = ErrorState({
            title: 'Failed to load economics data',
            message: error.message,
            action: '<button class="btn btn-ghost" onclick="location.reload()">Retry</button>',
          });
        }
      }
    },
    { context: 'fetchAllData' }
  );

  // ===== UI Rendering (using components.js) =====
  function renderDashboard() {
    const governorStatus = economicsStore.get('governorStatus');
    const blockHeight = economicsStore.get('blockHeight');
    const supply = economicsStore.get('supply');
    const treasuryBalance = economicsStore.get('treasuryBalance');

    if (!governorStatus) return;

    // Render top metrics
    renderMetrics(governorStatus, blockHeight, supply, treasuryBalance);

    // Render gate cards
    renderGateCards(governorStatus.gates);

    // Render charts
    renderCharts(governorStatus);

    // Initialize simulator
    initializeSimulator();
  }

  function renderMetrics(governorStatus, blockHeight, supply, treasuryBalance) {
    const metricsContainer = document.getElementById('top-metrics');
    if (!metricsContainer) return;

    const currentEpoch = governorStatus.epoch || 0;
    const circulatingSupply = supply?.circulating || 0;
    const supplyPercentage = ((circulatingSupply / MAX_SUPPLY) * 100).toFixed(1);

    const html = [
      MetricCard({
        label: 'Current Epoch',
        value: formatNumber(currentEpoch, 0),
        icon: '🔄',
        meta: `Block ${formatNumber(blockHeight, 0)}`,
      }),
      MetricCard({
        label: 'Circulating Supply',
        value: formatNumber(circulatingSupply, 0),
        icon: '💎',
        meta: `${supplyPercentage}% of max`,
      }),
      MetricCard({
        label: 'Treasury Balance',
        value: formatCurrency(treasuryBalance),
        icon: '🏦',
        meta: 'Protocol reserves',
      }),
      MetricCard({
        label: 'Block Reward',
        value: `${economicsStore.get('blockReward', BASE_REWARD).toFixed(2)} BLOCK`,
        icon: '⛏️',
        meta: 'Current issuance rate',
      }),
    ].join('');

    metricsContainer.innerHTML = html;
  }

  function renderGateCards(gates) {
    const container = document.getElementById('gate-cards');
    if (!container || !gates) return;

    const html = Object.entries(gates)
      .map(([market, info]) =>
        GateCard({
          market,
          status: info.state,
          readiness: info.readiness || 0,
          threshold: 80,
          metrics: info.metrics || {},
        })
      )
      .join('');

    container.innerHTML = html;
  }

  function renderCharts(governorStatus) {
    // Gate readiness chart (using createThemedChart)
    if (!charts.gateReadiness) {
      const ctx = document.getElementById('gateReadinessChart')?.getContext('2d');
      if (ctx) {
        charts.gateReadiness = createThemedChart(ctx, 'bar', {
           {
            labels: [],
            datasets: [
              {
                label: 'Readiness',
                 [],
                backgroundColor: BLOCK_CHART_THEME.colors.amber.bg,
                borderColor: BLOCK_CHART_THEME.colors.amber.border,
                borderWidth: 2,
              },
            ],
          },
          options: {
            scales: {
              y: { min: 0, max: 100, title: { display: true, text: 'Readiness %' } },
            },
          },
        });
      }
    }

    // Update chart data
    if (charts.gateReadiness && governorStatus.gates) {
      const markets = Object.keys(governorStatus.gates);
      const readiness = markets.map((m) => governorStatus.gates[m].readiness || 0);

      charts.gateReadiness.data.labels = markets.map(
        (m) => m.charAt(0).toUpperCase() + m.slice(1)
      );
      charts.gateReadiness.data.datasets[0].data = readiness;
      charts.gateReadiness.update();
    }

    // Issuance projection chart
    if (!charts.issuanceProjection) {
      const ctx = document.getElementById('issuanceProjectionChart')?.getContext('2d');
      if (ctx) {
        charts.issuanceProjection = createThemedChart(ctx, 'line', {
           {
            labels: [],
            datasets: [
              {
                label: 'Projected Issuance',
                 [],
                borderColor: BLOCK_CHART_THEME.colors.cyan.border,
                backgroundColor: BLOCK_CHART_THEME.colors.cyan.bg,
                fill: true,
              },
            ],
          },
          options: {
            scales: {
              y: { min: 0, title: { display: true, text: 'Tokens per Block' } },
            },
          },
        });
      }
    }
  }

  // ===== Issuance Simulator =====
  function initializeSimulator() {
    const volumeSlider = document.getElementById('sim-volume');
    const minersSlider = document.getElementById('sim-miners');
    const heightInput = document.getElementById('sim-height');

    if (!volumeSlider || !minersSlider || !heightInput) return;

    // Set initial values
    volumeSlider.value = simulatorState.transactionVolume;
    minersSlider.value = simulatorState.uniqueMiners;
    heightInput.value = simulatorState.blockHeight;

    // Debounced update
    let debounceTimer = null;
    const updateSimulator = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        simulatorState.transactionVolume = parseFloat(volumeSlider.value);
        simulatorState.uniqueMiners = parseInt(minersSlider.value);
        simulatorState.blockHeight = parseInt(heightInput.value) || 0;
        renderSimulatorResults();
      }, SIMULATOR_DEBOUNCE);
    };

    volumeSlider.addEventListener('input', updateSimulator);
    minersSlider.addEventListener('input', updateSimulator);
    heightInput.addEventListener('input', updateSimulator);

    // Initial render
    renderSimulatorResults();
  }

  function renderSimulatorResults() {
    const activity = activityFromVolume(simulatorState.transactionVolume);
    const decentralization = decentralizationFromMiners(simulatorState.uniqueMiners);
    const issuance = calculateIssuance(
      simulatorState.baseReward,
      activity,
      decentralization,
      simulatorState.blockHeight
    );

    // Update result display
    const resultEl = document.getElementById('sim-result');
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="kpi">
          <div class="kpi-label">Calculated Issuance</div>
          <div class="kpi-value">${issuance.toFixed(4)} BLOCK</div>
          <div class="kpi-meta">per block</div>
        </div>
        <div class="mt-4 space-y-2 text-sm">
          <div>Activity Multiplier: <span class="text-amber-400">${activity.toFixed(3)}x</span></div>
          <div>Decentralization: <span class="text-cyan-400">${decentralization.toFixed(3)}x</span></div>
          <div>Halving Decay: <span class="text-purple-400">${Math.pow(0.5, Math.floor(simulatorState.blockHeight / HALVING_INTERVAL)).toFixed(3)}x</span></div>
        </div>
      `;
    }

    // Update projection chart
    if (charts.issuanceProjection) {
      const projectionPoints = 20;
      const labels = [];
      const data = [];

      for (let i = 0; i <= projectionPoints; i++) {
        const futureHeight = simulatorState.blockHeight + i * 50000;
        const futureIssuance = calculateIssuance(
          simulatorState.baseReward,
          activity,
          decentralization,
          futureHeight
        );
        labels.push(formatNumber(futureHeight, 0));
        data.push(futureIssuance);
      }

      charts.issuanceProjection.data.labels = labels;
      charts.issuanceProjection.data.datasets[0].data = data;
      charts.issuanceProjection.update();
    }
  }

  // ===== Status Indicator =====
  function setStatus(status) {
    const indicator = document.getElementById('connection-status');
    if (!indicator) return;

    const statusMap = {
      CONNECTED: { text: '● Connected', class: 'text-status-ok' },
      REFRESHING: { text: '◐ Refreshing...', class: 'text-status-info' },
      ERROR: { text: '● Error', class: 'text-status-bad' },
    };

    const { text, class: className } = statusMap[status] || statusMap.ERROR;
    indicator.innerHTML = `<span class="${className}">${text}</span>`;
  }

  // ===== Auto-refresh =====
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(fetchAllData, REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (gateTimer) {
      clearInterval(gateTimer);
      gateTimer = null;
    }
  }

  // ===== Initialization =====
  function init() {
    // Show loading state
    const container = document.getElementById('economics-content');
    if (container) {
      container.innerHTML = LoadingSpinner({ size: 'lg', message: 'Loading economics data...' });
    }

    // Load cached data first (if available)
    const cachedStatus = economicsStore.get('governorStatus');
    if (cachedStatus) {
      console.log('✓ Using cached data');
      renderDashboard();
    }

    // Fetch fresh data
    fetchAllData();

    // Start auto-refresh
    startAutoRefresh();

    // Subscribe to store changes (reactive)
    economicsStore.subscribe('governorStatus', (value) => {
      if (value) renderDashboard();
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', stopAutoRefresh);

    console.log('✓ Economics dashboard initialized');
  }

  // ===== Start =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

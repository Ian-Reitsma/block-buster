// Network health and proof board component
// Complex state management with multiple data sources
// Refactored with improved spatial organization and visual hierarchy

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { bind } from '../bind.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';
import errorBoundary from '../errors.js';
import mockDataManager from '../mock-data-manager.js';

class Network extends Component {
  constructor(rpc) {
    super('Network');
    this.rpc = rpc;
    this.container = null;
  }

  onMount() {
    this.container = $('#app');
    this.render();

    // Subscribe to network data updates
    this.subscribe(appState, 'network', () => {
      requestAnimationFrame(() => this.updateNetworkData());
    });

    this.subscribe(appState, 'fullcheck', () => {
      requestAnimationFrame(() => this.updateFullCheckUI());
    });

    // Poll network data every 2s
    this.interval(() => this.fetchNetworkData(), 2000);

    // Initial fetch
    this.fetchNetworkData();
  }

  async fetchNetworkData() {
    try {
      // Fetch data using RPC client batch methods
      const [networkOverview, marketStates, schedulerStats] = await Promise.all([
        this.rpc.getNetworkOverview().catch(() => ({ peers: [], stats: {}, validators: [], errors: [] })),
        this.rpc.getMarketStates().catch(() => ({ energy: {}, compute: {}, ad: {}, errors: [] })),
        this.rpc.getSchedulerStats().catch(() => null),
      ]);

      // Transform to component state
      appState.set('network', {
        metrics: {
          peers: networkOverview.stats.total || 0,
          active: networkOverview.stats.active || 0,
          avgLatency: networkOverview.stats.avgLatency || 0,
          bandwidth: networkOverview.stats.bandwidth || {},
          validators: networkOverview.validators.length || 0,
          block_height: networkOverview.stats.blockHeight || 0,
          finalized_height: networkOverview.stats.finalizedHeight || 0,
          tps: networkOverview.stats.tps || 0,
          block_time_ms: networkOverview.stats.avgBlockTime || 0,
          network_strength: this.calculateNetworkStrength(networkOverview.stats),
          // Network load % — normalised against max_tps from issuance schema.
          // Protocol ceiling: 10,000 TPS (receipts_validation.rs: RECEIPT_BYTE_BUDGET /
          // MIN_RECEIPT_BYTE_FLOOR = 10 MB / 1 KB = 10,000 receipts/block ÷ 1s).
          // Fallback 10,000 fires only before first mock tick.
          network_load: (() => {
            const issuance = mockDataManager.get('issuance') || {};
            const maxTps   = issuance.max_tps || 10_000;
            const tps      = networkOverview.stats.tps || 0;
            return maxTps > 0 ? Math.min(100, Math.round((tps / maxTps) * 100)) : 0;
          })(),
          network_max_tps:    (mockDataManager.get('issuance') || {}).max_tps    || 10_000,
          network_target_tps: (mockDataManager.get('issuance') || {}).target_tps ||  6_000,
        },
        markets: marketStates,
        scheduler: schedulerStats,
        peers: networkOverview.peers,
        lastUpdated: Date.now(),
        error: null,
      });

      appState.set('offline', false);
      
      // Log any RPC errors
      const allErrors = [
        ...(networkOverview.errors || []),
        ...(marketStates.errors || []),
      ];
      
      if (allErrors.length > 0) {
        console.warn('[Network] Some RPC calls failed:', allErrors);
      }
      
    } catch (error) {
      errorBoundary.catch(error, { component: 'Network', action: 'fetchNetworkData' });
      appState.set('network', {
        ...appState.get('network'),
        error: error.message,
      });
    }
  }

  calculateNetworkStrength(stats) {
    // Use target_tps (EIP-1559 fee controller target, 60% of max capacity = 6,000 TPS) as
    // the reference, not max_tps (10,000). This way the health check asks:
    //   "is the network sustaining at least 2% of its target throughput?"
    // = 6,000 × 0.02 = 120 TPS — a reasonable floor for a live early-network with 20-30 miners.
    // Pre-mock-init fallback: 6,000 (BLOCK_TARGET_TPS) so the card shows 'Weak' not 'Strong'
    // when no data has loaded yet (0 TPS does not pass 120 TPS threshold).
    const issuance   = mockDataManager.get('issuance') || {};
    const targetTps  = issuance.target_tps || 6_000;
    const tpsHealthy = (stats.tps || 0) >= targetTps * 0.02; // ≥2% of target = ~120 TPS
    const factors = [
      (stats.total || 0) > 10 ? 1 : 0,
      (stats.active || 0) > 5  ? 1 : 0,
      (stats.avgLatency || 999) < 100 ? 1 : 0,
      tpsHealthy ? 1 : 0,
    ];
    const score = factors.reduce((a, b) => a + b, 0);
    return score >= 3 ? 'Strong' : score >= 2 ? 'Moderate' : 'Weak';
  }

  render() {
    if (!this.container) return;

    perf.mark('render-network-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Hero section
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
      <h2>Network Health + Proof Board</h2>
      <p>Visual, read-only sweep of consensus, markets, scheduler, receipts, and storage. Runs without third-party code.</p>
    `;
    content.appendChild(hero);

    // Error banner
    const errorBanner = document.createElement('div');
    errorBanner.id = 'network-error';
    errorBanner.className = 'offline hidden';
    content.appendChild(errorBanner);

    // NETWORK METRICS (Hero-tier - 3x2 grid)
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'metrics-hero-grid';
    metricsGrid.id = 'network-metrics-grid';
    metricsGrid.innerHTML = `
      <div class="card-metric-hero">
        <h3>Block Height</h3>
        <div class="value" data-bind="block_height" data-format="number">—</div>
        <div class="label">Current height</div>
      </div>
      <div class="card-metric-hero">
        <h3>Finalized</h3>
        <div class="value" data-bind="finalized_height" data-format="number">—</div>
        <div class="label">Confirmed blocks</div>
      </div>
      <div class="card-metric-hero">
        <h3>TPS</h3>
        <div class="value" data-bind="tps" data-format="number">—</div>
        <div class="label">Transactions/sec</div>
      </div>
      <div class="card-metric-hero">
        <h3>Peers</h3>
        <div class="value" data-bind="peers" data-format="number">—</div>
        <div class="label">Connected nodes</div>
      </div>
      <div class="card-metric-hero">
        <h3>Avg Block Time</h3>
        <div class="value" data-bind="block_time_ms" data-format="ms">—</div>
        <div class="label">Block production</div>
      </div>
      <div class="card-metric-hero">
        <h3>Network Strength</h3>
        <div class="value" data-bind="network_strength">—</div>
        <div class="label">Health score</div>
      </div>
      <div class="card-metric-hero">
        <h3>Network Load</h3>
        <div class="value" id="network-load-pct">—</div>
        <div class="label" id="network-load-tps-label">— / — TPS</div>
        <div style="margin-top:6px;height:4px;background:rgba(255,255,255,0.10);border-radius:2px;overflow:hidden;">
          <div id="network-load-bar" style="height:4px;width:0%;border-radius:2px;background:var(--success);transition:width 0.4s ease,background 0.4s ease;"></div>
        </div>
      </div>
    `;
    content.appendChild(metricsGrid);

    // PROOF BOARD SECTION (full width, elevated card)
    content.appendChild(this.createProofBoard());

    // NETWORK ARTIFACTS (3-column layout)
    content.appendChild(this.createArtifactsSection());

    // PEER DETAILS (sidebar layout)
    content.appendChild(this.createPeerDetailsSection());

    this.container.innerHTML = '';
    this.container.appendChild(content);

    // Initial data update
    const network = appState.get('network');
    if (network) {
      this.updateNetworkData();
    }

    perf.measure('render-network', 'render-network-start', 'render');
  }

  createProofBoard() {
    const proof = document.createElement('div');
    proof.className = 'card proof';
    proof.id = 'proof-board';

    const header = document.createElement('div');
    header.className = 'row space-between align-center mb-6';
    header.innerHTML = `
      <div>
        <h3 style="margin:0;">Full-Chain Proof Board</h3>
        <div class="muted small">Runs the visual equivalent of run-tests-verbose.sh using read-only RPC sweeps.</div>
      </div>
      <div class="score" id="proof-score">
        <div class="score-value">—</div>
        <div class="muted small">score</div>
      </div>
    `;
    proof.appendChild(header);

    // Controls grid
    const controls = document.createElement('div');
    controls.className = 'control-grid';
    controls.id = 'proof-controls';

    // Domain input
    const domainControl = document.createElement('div');
    domainControl.className = 'control';
    domainControl.innerHTML = `
      <label>.block domain (optional)</label>
      <input type="text" id="domain-input" placeholder="demo.block" />
    `;
    const domainInput = domainControl.querySelector('#domain-input');
    this.listen(domainInput, 'input', (e) => {
      const current = appState.get('fullcheckInput') || {};
      appState.set('fullcheckInput', { ...current, domain: e.target.value });
    });
    controls.appendChild(domainControl);

    // File input
    const fileControl = document.createElement('div');
    fileControl.className = 'control';
    fileControl.id = 'file-control';
    fileControl.innerHTML = `
      <label>Storage sample file (optional)</label>
      <input type="file" id="file-input" />
      <div id="file-meta" class="muted small mt-2"></div>
    `;
    const fileInput = fileControl.querySelector('#file-input');
    this.listen(fileInput, 'change', (e) => this.handleFileSelect(e.target.files[0]));
    controls.appendChild(fileControl);

    // Dry run toggle
    const dryRunControl = document.createElement('div');
    dryRunControl.className = 'control';
    dryRunControl.innerHTML = `
      <label>
        <input type="checkbox" id="dry-run-checkbox" />
        Use storage.put (dry-run, no persistence)
      </label>
    `;
    const dryRunCheckbox = dryRunControl.querySelector('#dry-run-checkbox');
    this.listen(dryRunCheckbox, 'change', (e) => {
      const current = appState.get('fullcheckInput') || {};
      appState.set('fullcheckInput', { ...current, storageDryRun: e.target.checked });
    });
    controls.appendChild(dryRunControl);

    // Run button
    const runBtnControl = document.createElement('div');
    runBtnControl.className = 'control';
    runBtnControl.style.display = 'flex';
    runBtnControl.style.alignItems = 'flex-end';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn primary';
    runBtn.id = 'run-fullcheck-btn';
    runBtn.textContent = 'Run visual suite';
    runBtn.style.width = '100%';
    this.listen(runBtn, 'click', () => this.runFullCheck());
    runBtnControl.appendChild(runBtn);
    controls.appendChild(runBtnControl);

    proof.appendChild(controls);

    // Error display
    const errorDiv = document.createElement('div');
    errorDiv.id = 'fullcheck-error';
    errorDiv.className = 'offline hidden';
    proof.appendChild(errorDiv);

    // Steps container
    const stepsContainer = document.createElement('div');
    stepsContainer.id = 'fullcheck-steps';
    stepsContainer.style.marginTop = 'var(--space-6)';
    proof.appendChild(stepsContainer);

    return proof;
  }

  async handleFileSelect(file) {
    if (!file) return;

    const current = appState.get('fullcheckInput') || {};
    appState.set('fullcheckInput', { ...current, hashing: true });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      appState.set('fullcheckInput', {
        ...current,
        fileMeta: {
          name: file.name,
          size_bytes: file.size,
          sha256: hashHex,
        },
        hashing: false,
      });

      // Update file meta display
      const fileMeta = $('#file-meta');
      if (fileMeta) {
        fileMeta.innerHTML = `File: ${file.name} (${fmt.num(file.size)} bytes)<br/>SHA-256: ${hashHex.substring(0, 16)}...`;
      }
    } catch (error) {
      errorBoundary.catch(error, { component: 'Network', action: 'handleFileSelect' });
      appState.set('fullcheckInput', { ...current, hashing: false });
    }
  }

  async runFullCheck() {
    const fullcheck = appState.get('fullcheck') || {};
    if (fullcheck.running) return;

    appState.set('fullcheck', {
      status: 'running',
      running: true,
      steps: [],
      summary_score: null,
      duration_ms: null,
      started_at: Date.now(),
      error: null,
    });

    try {
      const fullcheckInput = appState.get('fullcheckInput') || {};
      const body = {
        domain: fullcheckInput.domain || null,
        file_meta: fullcheckInput.fileMeta || null,
        storage_dry_run: fullcheckInput.storageDryRun || false,
      };

      const result = await perf.time(
        'runFullCheck',
        () => this.rpc.runFullCheck(body),
        'fetch',
      );

      appState.set('fullcheck', {
        status: 'complete',
        running: false,
        steps: result.steps || [],
        summary_score: result.summary_score,
        duration_ms: result.duration_ms,
        started_at: result.started_at,
        error: null,
      });
    } catch (error) {
      errorBoundary.catch(error, { component: 'Network', action: 'runFullCheck' });
      appState.set('fullcheck', {
        ...appState.get('fullcheck'),
        status: 'error',
        running: false,
        error: error.message,
      });
    }
  }

  createArtifactsSection() {
    const artifacts = document.createElement('div');
    artifacts.className = 'card';
    artifacts.id = 'network-artifacts';
    artifacts.style.marginTop = 'var(--space-8)';

    artifacts.innerHTML = `
      <h3>Live Network Inputs</h3>
      <p class="muted small mb-4">Auto-refreshed every 2s from /theblock/* endpoints.</p>
      
      <div class="metrics-primary-grid">
        <div class="card-metric-primary">
          <h3>Markets Healthy</h3>
          <div class="value" id="markets-healthy">—</div>
        </div>
        <div class="card-metric-primary">
          <h3>Scheduler Queue</h3>
          <div class="value" id="scheduler-queue">—</div>
        </div>
        <div class="card-metric-primary">
          <h3>Validators</h3>
          <div class="value" id="validator-count">—</div>
        </div>
      </div>
      
      <div class="muted small text-right mt-4" id="last-updated"></div>
    `;

    return artifacts;
  }

  createPeerDetailsSection() {
    const section = document.createElement('div');
    section.className = 'layout-split';
    section.style.marginTop = 'var(--space-8)';

    // Peer list
    const peerCard = document.createElement('div');
    peerCard.className = 'card';
    peerCard.innerHTML = `
      <h3>Connected Peers</h3>
      <p class="muted small mb-4">Active P2P connections</p>
      <div id="peer-list" class="muted small text-center p-8">Loading...</div>
    `;
    section.appendChild(peerCard);

    // Market states
    const marketCard = document.createElement('div');
    marketCard.className = 'card';
    marketCard.innerHTML = `
      <h3>Market States</h3>
      <p class="muted small mb-4">Energy, Compute, and Ad marketplaces</p>
      <div id="market-states" class="muted small text-center p-8">Loading...</div>
    `;
    section.appendChild(marketCard);

    return section;
  }

  updateNetworkData() {
    const network = appState.get('network');
    if (!network) return;

    // Update error banner
    const errorBanner = $('#network-error');
    if (errorBanner) {
      if (network.error) {
        errorBanner.textContent = `Network refresh failed: ${network.error}`;
        errorBanner.classList.remove('hidden');
      } else {
        errorBanner.classList.add('hidden');
      }
    }

    // Update metrics grid
    const metricsGrid = $('#network-metrics-grid');
    if (metricsGrid && network.metrics) {
      bind(metricsGrid, network.metrics);
    }

    // Update network load card
    if (network.metrics) {
      const pct    = network.metrics.network_load    ?? 0;
      const maxTps = network.metrics.network_max_tps ?? 500;
      const tps    = network.metrics.tps             ?? 0;

      const pctEl  = $('#network-load-pct');
      const lblEl  = $('#network-load-tps-label');
      const barEl  = $('#network-load-bar');

      if (pctEl)  pctEl.textContent  = `${pct}%`;
      if (lblEl)  lblEl.textContent  = `${fmt.num(tps)} / ${fmt.num(maxTps)} TPS`;
      if (barEl) {
        barEl.style.width      = `${pct}%`;
        // Green < 50%, amber 50–80%, red > 80%
        barEl.style.background = pct >= 80 ? 'var(--danger)'
                                : pct >= 50 ? 'var(--warn)'
                                : 'var(--success)';
      }
    }

    // Update artifacts
    const marketsHealthy = $('#markets-healthy');
    if (marketsHealthy && network.markets) {
      const healthyCount = Object.values(network.markets).filter(m => m.healthy).length;
      const totalCount = Object.keys(network.markets).length;
      marketsHealthy.textContent = `${healthyCount}/${totalCount}`;
    }

    const schedulerQueue = $('#scheduler-queue');
    if (schedulerQueue && network.scheduler) {
      schedulerQueue.textContent = fmt.num(network.scheduler.queue_depth || 0);
    }

    const validatorCount = $('#validator-count');
    if (validatorCount && network.metrics) {
      validatorCount.textContent = fmt.num(network.metrics.validators || 0);
    }

    const lastUpdated = $('#last-updated');
    if (lastUpdated && network.lastUpdated) {
      const seconds = Math.floor((Date.now() - network.lastUpdated) / 1000);
      lastUpdated.textContent = `Last updated ${seconds}s ago`;
    }

    // Update peer list
    this.updatePeerList(network.peers);
    this.updateMarketStates(network.markets);
  }

  updatePeerList(peers) {
    const peerList = $('#peer-list');
    if (!peerList) return;

    // Ensure peers is an array
    const peerArray = Array.isArray(peers) ? peers : (peers?.peers || []);
    
    if (!peerArray || peerArray.length === 0) {
      peerList.innerHTML = '<div class="muted small text-center">No peers connected</div>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'list';
    peerArray.slice(0, 10).forEach(peer => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="small">${peer.id?.substring(0, 8) || 'Unknown'}</span>
        <span class="pill">${peer.latency || 0}ms</span>
      `;
      ul.appendChild(li);
    });
    
    peerList.innerHTML = '';
    peerList.appendChild(ul);
  }

  updateMarketStates(markets) {
    const marketStates = $('#market-states');
    if (!marketStates) return;

    if (!markets) {
      marketStates.innerHTML = '<div class="muted small text-center">No market data</div>';
      return;
    }

    const marketList = document.createElement('div');
    marketList.className = 'column';
    marketList.style.gap = 'var(--space-3)';

    Object.entries(markets).forEach(([name, state]) => {
      const row = document.createElement('div');
      row.className = 'row space-between';
      row.innerHTML = `
        <span class="small">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
        <span class="pill ${state.healthy ? 'success' : 'danger'}">${state.healthy ? 'Healthy' : 'Down'}</span>
      `;
      marketList.appendChild(row);
    });

    marketStates.innerHTML = '';
    marketStates.appendChild(marketList);
  }

  updateFullCheckUI() {
    const fullcheck = appState.get('fullcheck');
    if (!fullcheck) return;

    // Update score
    const scoreValue = $('#proof-score .score-value');
    if (scoreValue) {
      scoreValue.textContent = fullcheck.summary_score !== null ? fullcheck.summary_score : '—';
    }

    // Update run button
    const runBtn = $('#run-fullcheck-btn');
    if (runBtn) {
      runBtn.textContent = fullcheck.running ? 'Running…' : 'Run visual suite';
      runBtn.disabled = fullcheck.running || (appState.get('fullcheckInput') || {}).hashing || appState.get('offline');
    }

    // Update error
    const errorDiv = $('#fullcheck-error');
    if (errorDiv) {
      if (fullcheck.error) {
        errorDiv.textContent = `Full check failed: ${fullcheck.error}`;
        errorDiv.classList.remove('hidden');
      } else {
        errorDiv.classList.add('hidden');
      }
    }

    // Update steps
    this.renderSteps();
  }

  renderSteps() {
    const stepsContainer = $('#fullcheck-steps');
    if (!stepsContainer) return;

    const fullcheck = appState.get('fullcheck');
    const steps = fullcheck?.steps || [];

    stepsContainer.innerHTML = '';

    if (fullcheck?.running) {
      const loading = document.createElement('div');
      loading.className = 'muted text-center p-8';
      loading.textContent = 'Running full-chain sweep…';
      stepsContainer.appendChild(loading);
      return;
    }

    if (steps.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'muted small text-center p-8';
      placeholder.textContent = 'Click "Run visual suite" to start the full-chain proof check.';
      stepsContainer.appendChild(placeholder);
      return;
    }

    // Render steps
    steps.forEach((step, index) => {
      const stepEl = document.createElement('div');
      stepEl.className = 'step';
      
      const icon = document.createElement('div');
      icon.className = `step-icon ${step.success ? 'success' : 'error'}`;
      icon.textContent = step.success ? '✓' : '✗';
      
      const content = document.createElement('div');
      content.className = 'step-content';
      content.innerHTML = `
        <div class="step-title">${step.name || `Step ${index + 1}`}</div>
        <div class="step-meta">${step.duration_ms}ms ${step.message ? `• ${step.message}` : ''}</div>
      `;
      
      stepEl.appendChild(icon);
      stepEl.appendChild(content);
      stepsContainer.appendChild(stepEl);
    });
  }

  onUnmount() {
    console.log('[Network] Cleanup complete');
  }
}

export default Network;

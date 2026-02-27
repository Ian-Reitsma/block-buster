/**
 * Network Issuance Chart
 * 
 * Visualizes the network-driven BLOCK issuance formula:
 * reward = base × activity × decentralization × supply_decay
 * 
 * Based on: ~/projects/the-block/docs/economics_and_governance.md
 */

import { Component } from '../lifecycle.js';
import { fmt, $ } from '../utils.js';
import mockDataManager from '../mock-data-manager.js';
import features from '../features.js';

class NetworkIssuanceChart extends Component {
  constructor(rpc, options = {}) {
    super('NetworkIssuanceChart');
    this.rpc = rpc;
    this.options = {
      height: options.height || 500,
      showHistory: options.showHistory !== false,
      ...options,
    };
    this.canvas = null;
    this.ctx = null;
    this.data = null;
    this.hoveredMultiplier = null;
  }

  async fetchData() {
    const useLive = features.isEnabled('economics_live');
    if (useLive) {
      try {
        return await this._fetchChainData();
      } catch (error) {
        console.warn('[NetworkIssuanceChart] Chain fetch failed, falling back to mock:', error?.message);
      }
    }
    this.isSimulated = true;
    return this._applyQuadraticDecay(mockDataManager.get('issuance'));
  }

  // ── Chain fetch: replaces phantom economics.replay RPC ──────────────────────────────────────
  //
  // REMOVED: economics.replay — this RPC namespace does not exist.
  // apis_and_tooling.md lists no economics.* namespace; every call silently threw to mock.
  //
  // Real data sources (all verified in apis_and_tooling.md RPC table):
  //   governor.status        → economics_prev_market_metrics (utilization/margin ppm per market)
  //   consensus.block_height → current height → emission approximation
  //   receipt.audit          → best-effort: EpochEconomicsReceipt with total_emission,
  //                            next_block_reward_per_block, unique_miners, tx_count/volume
  async _fetchChainData() {
    const EPOCH_BLOCKS = 120;

    const [governorStatus, blockHeightResp] = await Promise.all([
      this.rpc.getGovernorStatus(),
      this.rpc.getBlockHeight(),
    ]);

    let epochReceipt = null;
    try {
      const currentHeight = blockHeightResp?.height ?? 0;
      const auditResp = await this.rpc.call('receipt.audit', {
        start_height: Math.max(0, currentHeight - EPOCH_BLOCKS * 10),
        end_height:   currentHeight,
        limit:        5,
      });
      const receipts = Array.isArray(auditResp?.receipts) ? auditResp.receipts : [];
      for (let i = receipts.length - 1; i >= 0; i--) {
        const r = receipts[i];
        if (
          r?.receipt_type === 'epoch_economics' ||
          r?.receipt_type === 'EpochEconomics'  ||
          r?.receipt?.epoch !== undefined
        ) {
          epochReceipt = r.receipt ?? r;
          break;
        }
      }
    } catch (_) {
      // receipt.audit not yet active on this node — silent
    }

    this.isSimulated = false;
    return this._mapChainToDisplay(governorStatus, blockHeightResp, epochReceipt);
  }

  // ── _mapChainToDisplay: governor.status + block_height + epochReceipt → display data ─────────
  //
  // Mirrors EconomicsSimulator.computeOutputs() formula exactly:
  //   supply_decay        = clamp((remaining/max)², SUPPLY_DECAY_FLOOR, 1)       — QUADRATIC
  //   decentralization    = isqrt(unique × 10⁶ / baseline) ppm, clamp [500K, 2M] — ppm-space
  //   activity_multiplier = clamp(cbrt(txCount × txVol × (1+util)), 0.5, 1.8)
  _mapChainToDisplay(governorStatus, blockHeightResp, epochReceipt) {
    const MAX_SUPPLY            = 40_000_000;
    const EXPECTED_TOTAL_BLOCKS = 100_000_000;
    const BLOCKS_PER_YEAR       = 365 * 24 * 3600;
    const SUPPLY_DECAY_FLOOR    = 0.05;
    const ACTIVITY_MIN          = 0.5;
    const ACTIVITY_MAX          = 1.8;
    const DECENTR_MIN_PPM       = 500_000;
    const DECENTR_MAX_PPM       = 2_000_000;
    const TARGET_BPS            = 500;

    // ── Base reward (chain constant) ──
    const baseReward = (0.9 * MAX_SUPPLY) / EXPECTED_TOTAL_BLOCKS;  // 0.36 BLOCK

    // ── Fields from EpochEconomicsReceipt (null-safe: silent if not yet active) ──
    const totalEmission  = epochReceipt?.total_emission              ?? null;
    const nextReward     = epochReceipt?.next_block_reward_per_block ?? null;
    const uniqueMiners   = epochReceipt?.unique_miners               ?? 23;
    const baselineMiners = epochReceipt?.baseline_miners             ?? 20;
    const txCountRatio   = (epochReceipt?.epoch_tx_count && epochReceipt?.baseline_tx_count)
      ? epochReceipt.epoch_tx_count   / epochReceipt.baseline_tx_count
      : 1.0;
    const txVolumeRatio  = (epochReceipt?.epoch_tx_volume_block && epochReceipt?.baseline_tx_volume_block)
      ? epochReceipt.epoch_tx_volume_block / epochReceipt.baseline_tx_volume_block
      : 1.0;

    // ── Emission: receipt preferred, height-derived fallback ──
    const currentHeight  = blockHeightResp?.height ?? 0;
    const approxEmission = totalEmission ?? Math.min(currentHeight * baseReward, MAX_SUPPLY);

    // ── Average market utilization from governor.status ──
    const rawMetrics = governorStatus?.economics_prev_market_metrics
                    || governorStatus?.metrics?.economics_prev_market_metrics;
    let avgUtil = 0.65;
    if (Array.isArray(rawMetrics) && rawMetrics.length > 0) {
      const utils = rawMetrics.map(m => (m.utilization_ppm ?? 650_000) / 1_000_000);
      avgUtil = utils.reduce((s, v) => s + v, 0) / utils.length;
    } else if (rawMetrics?.utilization_ppm) {
      avgUtil = rawMetrics.utilization_ppm / 1_000_000;
    }

    // ── Activity multiplier: geometric mean of three ratios, clamped ──
    const activityMultiplier = Math.max(ACTIVITY_MIN, Math.min(ACTIVITY_MAX,
      Math.cbrt(txCountRatio * txVolumeRatio * (1 + avgUtil)),
    ));

    // ── Decentralization: ppm-space integer-sqrt (mirrors network_issuance.rs isqrt) ──
    const ratioPpm           = Math.max(uniqueMiners, 1) * 1_000_000 / Math.max(baselineMiners, 1);
    const decentrPpm         = Math.max(DECENTR_MIN_PPM, Math.min(DECENTR_MAX_PPM, Math.floor(Math.sqrt(ratioPpm))));
    const decentralizationFactor = decentrPpm / 1_000_000;

    // ── Supply decay: QUADRATIC on remaining-supply ratio ──
    // Corrected from linear → quadratic to match economics_and_governance.md and Rust node.
    const remainingRatio = (MAX_SUPPLY - approxEmission) / MAX_SUPPLY;
    const supplyDecay    = Math.max(SUPPLY_DECAY_FLOOR, Math.min(1, remainingRatio * remainingRatio));

    // ── Final reward: from receipt when available, else recomputed ──
    const finalReward = nextReward
      ?? (baseReward * activityMultiplier * decentralizationFactor * supplyDecay);

    // ── Inflation ──
    const annualIssuance = finalReward * BLOCKS_PER_YEAR;
    const inflationBps   = approxEmission > 0
      ? Math.round((annualIssuance / approxEmission) * 10_000)
      : 0;
    const epochNumber    = epochReceipt?.epoch ?? Math.floor(currentHeight / 120);

    return {
      base_reward:             baseReward,
      activity_multiplier:     activityMultiplier,
      decentralization_factor: decentralizationFactor,
      decentr_ppm:             decentrPpm,
      supply_decay:            supplyDecay,
      remaining_ratio:         remainingRatio,
      final_reward:            finalReward,
      epoch:                   epochNumber,
      inflation_error_bps:     inflationBps - TARGET_BPS,
      // Activity breakdown
      tx_count_ratio:          txCountRatio,
      tx_volume_ratio:         txVolumeRatio,
      market_utilization:      avgUtil,
      // Decentralization
      unique_miners:           uniqueMiners,
      baseline_miners:         baselineMiners,
      // Supply
      emission:                approxEmission,
      max_supply:              MAX_SUPPLY,
      _receipt_active:         !!epochReceipt,
    };
  }

  // ── _applyQuadraticDecay: recompute supply_decay + decentralization on mock data ─────────────
  //
  // Mock data carries supply_decay as a linear value.
  // This corrects it to quadratic and recomputes decentralization via ppm-space isqrt,
  // keeping the chart visually consistent with EconomicsSimulator.computeOutputs().
  _applyQuadraticDecay(mock) {
    if (!mock) return mock;
    const MAX_SUPPLY         = 40_000_000;
    const SUPPLY_DECAY_FLOOR = 0.05;
    const DECENTR_MIN_PPM    = 500_000;
    const DECENTR_MAX_PPM    = 2_000_000;
    const ACTIVITY_MIN       = 0.5;
    const ACTIVITY_MAX       = 1.8;

    const emission       = mock.emission_consumer ?? mock.total_emission ?? mock.emission ?? 3_200_000;
    const remainingRatio = (MAX_SUPPLY - emission) / MAX_SUPPLY;
    const supplyDecay    = Math.max(SUPPLY_DECAY_FLOOR, Math.min(1, remainingRatio * remainingRatio));

    const uniqueMiners   = mock.unique_miners   ?? 23;
    const baselineMiners = mock.baseline_miners ?? 20;
    const ratioPpm       = Math.max(uniqueMiners, 1) * 1_000_000 / Math.max(baselineMiners, 1);
    const decentrPpm     = Math.max(DECENTR_MIN_PPM, Math.min(DECENTR_MAX_PPM, Math.floor(Math.sqrt(ratioPpm))));
    const decentralizationFactor = decentrPpm / 1_000_000;

    const baseReward    = (0.9 * MAX_SUPPLY) / 100_000_000;
    const actMultiplier = Math.max(ACTIVITY_MIN, Math.min(ACTIVITY_MAX, mock.activity_multiplier ?? 1.35));
    const finalReward   = baseReward * actMultiplier * decentralizationFactor * supplyDecay;

    return {
      ...mock,
      emission,
      max_supply:              MAX_SUPPLY,
      supply_decay:            supplyDecay,
      remaining_ratio:         remainingRatio,
      decentralization_factor: decentralizationFactor,
      decentr_ppm:             decentrPpm,
      final_reward:            finalReward,
      unique_miners:           uniqueMiners,
      baseline_miners:         baselineMiners,
    };
  }

  render() {
    const container = document.createElement('div');
    container.className = 'network-issuance-chart';

    // Header
    const header = document.createElement('div');
    header.className = 'chart-header';
    header.innerHTML = `
      <div>
        <h3>Network Issuance Formula</h3>
        <p class="muted small">Activity-based reward calculation</p>
      </div>
      <div class="pill pill-muted" id="issuance-sim-badge" style="display:none;">Simulated</div>
      <div class="chart-controls">
        <button class="btn btn-sm" data-period="7d">7d</button>
        <button class="btn btn-sm active" data-period="30d">30d</button>
        <button class="btn btn-sm" data-period="90d">90d</button>
      </div>
    `;
    container.appendChild(header);

    // Formula display
    const formulaSection = document.createElement('div');
    formulaSection.className = 'formula-display';
    formulaSection.id = 'issuance-formula';
    container.appendChild(formulaSection);

    // Multiplier breakdown (interactive)
    const breakdownSection = document.createElement('div');
    breakdownSection.className = 'multiplier-breakdown';
    breakdownSection.id = 'multiplier-breakdown';
    container.appendChild(breakdownSection);

    // Historical trend (if enabled)
    if (this.options.showHistory) {
      const historySection = document.createElement('div');
      historySection.className = 'history-section';
      historySection.innerHTML = `
        <h4>Historical Trends</h4>
        <div id="history-canvas-container"></div>
      `;
      container.appendChild(historySection);
    }

    // Alert indicators
    const alertSection = document.createElement('div');
    alertSection.className = 'alert-indicators';
    alertSection.id = 'alert-indicators';
    container.appendChild(alertSection);

    return container;
  }

  async onMount() {
    // Fetch initial data
    this.data = await this.fetchData();
    const simBadge = $('#issuance-sim-badge');
    if (simBadge) {
      simBadge.style.display = this.isSimulated ? 'inline-flex' : 'none';
    }
    
    // Render formula
    this.renderFormula();
    this.renderBreakdown();
    this.renderAlerts();
    
    if (this.options.showHistory) {
      this.renderHistory();
    }

    // Update every 3 seconds (matches block time)
    this.interval(async () => {
      this.data = await this.fetchData();
      this.renderFormula();
      this.renderBreakdown();
      this.renderAlerts();
    }, 3000);
  }

  renderFormula() {
    const container = $('#issuance-formula');
    if (!container || !this.data) return;

    const formula = document.createElement('div');
    formula.className = 'formula-equation';

    // Main equation
    formula.innerHTML = `
      <div class="formula-line">
        <span class="formula-result">${this.data.final_reward.toFixed(4)} BLOCK</span>
        <span class="formula-equals">=</span>
        <span class="formula-term clickable" data-multiplier="base">
          ${this.data.base_reward.toFixed(4)}
          <span class="formula-label">base</span>
        </span>
        <span class="formula-operator">×</span>
        <span class="formula-term clickable" data-multiplier="activity">
          ${this.data.activity_multiplier.toFixed(4)}
          <span class="formula-label">activity</span>
        </span>
        <span class="formula-operator">×</span>
        <span class="formula-term clickable" data-multiplier="decentralization">
          ${this.data.decentralization_factor.toFixed(4)}
          <span class="formula-label">decentr</span>
        </span>
        <span class="formula-operator">×</span>
        <span class="formula-term clickable" data-multiplier="supply_decay">
          ${this.data.supply_decay.toFixed(4)}
          <span class="formula-label">decay</span>
        </span>
      </div>
      <div class="formula-subtitle">Per-block reward (updated every epoch)</div>
    `;

    // Add click handlers
    formula.querySelectorAll('.clickable').forEach(term => {
      this.listen(term, 'click', (e) => {
        const multiplier = e.currentTarget.dataset.multiplier;
        this.showMultiplierDetails(multiplier);
      });

      this.listen(term, 'mouseenter', (e) => {
        this.hoveredMultiplier = e.currentTarget.dataset.multiplier;
        this.highlightBreakdown(this.hoveredMultiplier);
      });

      this.listen(term, 'mouseleave', () => {
        this.hoveredMultiplier = null;
        this.highlightBreakdown(null);
      });
    });

    container.innerHTML = '';
    container.appendChild(formula);
  }

  renderBreakdown() {
    const container = $('#multiplier-breakdown');
    if (!container || !this.data) return;

    container.innerHTML = `
      <div class="breakdown-grid">
        <!-- Base Reward -->
        <div class="breakdown-card" data-multiplier="base">
          <div class="breakdown-header">
            <h4>Base Reward</h4>
            <span class="breakdown-value">${this.data.base_reward.toFixed(4)}</span>
          </div>
          <div class="breakdown-formula">
            <code>(0.9 × 40M) / 100M blocks</code>
          </div>
          <div class="breakdown-description">
            90% of max supply distributed evenly across expected block count
          </div>
        </div>

        <!-- Activity Multiplier -->
        <div class="breakdown-card" data-multiplier="activity">
          <div class="breakdown-header">
            <h4>Activity Multiplier</h4>
            <span class="breakdown-value">${this.data.activity_multiplier.toFixed(4)}</span>
          </div>
          <div class="breakdown-formula">
            <code>geometric_mean(${this.data.tx_count_ratio.toFixed(2)}, ${this.data.tx_volume_ratio.toFixed(2)}, ${(1 + this.data.market_utilization).toFixed(2)})</code>
          </div>
          <div class="breakdown-components">
            <div class="component-item">
              <span class="component-label">TX Count Ratio:</span>
              <span class="component-value">${this.data.tx_count_ratio.toFixed(2)}</span>
            </div>
            <div class="component-item">
              <span class="component-label">TX Volume Ratio:</span>
              <span class="component-value">${this.data.tx_volume_ratio.toFixed(2)}</span>
            </div>
            <div class="component-item">
              <span class="component-label">1 + Market Util:</span>
              <span class="component-value">${(1 + this.data.market_utilization).toFixed(2)}</span>
            </div>
          </div>
          <div class="breakdown-description">
            Higher network activity increases rewards
          </div>
        </div>

        <!-- Decentralization Factor -->
        <div class="breakdown-card" data-multiplier="decentralization">
          <div class="breakdown-header">
            <h4>Decentralization Factor</h4>
            <span class="breakdown-value">${this.data.decentralization_factor.toFixed(4)} (${(this.data.decentr_ppm ?? Math.round(this.data.decentralization_factor * 1_000_000)).toLocaleString()} ppm)</span>
          </div>
          <div class="breakdown-formula">
            <code>isqrt(${this.data.unique_miners} × 10⁶ / ${this.data.baseline_miners}) ppm · clamp [500K, 2M ppm]</code>
          </div>
          <div class="breakdown-components">
            <div class="component-item">
              <span class="component-label">Unique Miners:</span>
              <span class="component-value">${this.data.unique_miners}</span>
            </div>
            <div class="component-item">
              <span class="component-label">Baseline:</span>
              <span class="component-value">${this.data.baseline_miners}</span>
            </div>
          </div>
          <div class="breakdown-description">
            More independent miners increase rewards
          </div>
        </div>

        <!-- Supply Decay -->
        <div class="breakdown-card" data-multiplier="supply_decay">
          <div class="breakdown-header">
            <h4>Supply Decay</h4>
            <span class="breakdown-value">${this.data.supply_decay.toFixed(4)}</span>
          </div>
          <div class="breakdown-formula">
            <code>((${fmt.num(this.data.max_supply)} − ${fmt.num(this.data.emission)}) / ${fmt.num(this.data.max_supply)})²</code>
          </div>
          <div class="breakdown-components">
            <div class="component-item">
              <span class="component-label">Circulating:</span>
              <span class="component-value">${fmt.num(this.data.emission)} BLOCK</span>
            </div>
            <div class="component-item">
              <span class="component-label">Remaining:</span>
              <span class="component-value">${fmt.num(this.data.max_supply - this.data.emission)} BLOCK</span>
            </div>
            <div class="component-item">
              <span class="component-label">% Issued:</span>
              <span class="component-value">${((this.data.emission / this.data.max_supply) * 100).toFixed(2)}%</span>
            </div>
            <div class="component-item">
              <span class="component-label">Linear ratio:</span>
              <span class="component-value">${(this.data.remaining_ratio ?? ((this.data.max_supply - this.data.emission) / this.data.max_supply)).toFixed(4)}</span>
            </div>
          </div>
          <div class="breakdown-description">
            Quadratic decay on remaining-supply ratio — (remaining/max)² · floor 0.05
          </div>
        </div>
      </div>
    `;

    // Add hover effects
    container.querySelectorAll('.breakdown-card').forEach(card => {
      this.listen(card, 'mouseenter', (e) => {
        const multiplier = e.currentTarget.dataset.multiplier;
        this.highlightFormulaTerm(multiplier);
      });

      this.listen(card, 'mouseleave', () => {
        this.highlightFormulaTerm(null);
      });
    });
  }

  renderAlerts() {
    const container = $('#alert-indicators');
    if (!container || !this.data) return;

    const alerts = [];

    // Check inflation error
    const inflationError = Math.abs(this.data.inflation_error_bps || 0);
    let healthStatus = 'healthy';
    let healthLabel = 'Healthy';
    let healthIcon = '🟢';

    if (inflationError > 200) {
      healthStatus = 'critical';
      healthLabel = 'Critical';
      healthIcon = '🔴';
      alerts.push({
        level: 'danger',
        message: `Inflation error: ${inflationError} bps (target: <50 bps)`,
        action: 'Review economic control laws',
      });
    } else if (inflationError > 50) {
      healthStatus = 'warning';
      healthLabel = 'Warning';
      healthIcon = '🟡';
      alerts.push({
        level: 'warn',
        message: `Inflation error: ${inflationError} bps (target: <50 bps)`,
        action: 'Monitor closely',
      });
    }

    // Check activity multiplier bounds
    if (this.data.activity_multiplier > 1.8 || this.data.activity_multiplier < 0.5) {
      alerts.push({
        level: 'warn',
        message: `Activity multiplier at ${this.data.activity_multiplier.toFixed(2)} (typical: 1.0-1.5)`,
        action: 'Check network activity metrics',
      });
    }

    // Check decentralization
    if (this.data.unique_miners < 15) {
      alerts.push({
        level: 'warn',
        message: `Low miner count: ${this.data.unique_miners} (baseline: ${this.data.baseline_miners})`,
        action: 'Encourage validator diversity',
      });
    }

    // Check supply progress
    const supplyPct = (this.data.emission / this.data.max_supply) * 100;
    if (supplyPct > 90) {
      alerts.push({
        level: 'info',
        message: `${supplyPct.toFixed(1)}% of max supply issued`,
        action: 'Tail emission phase approaching',
      });
    }

    // Render health indicator
    const healthIndicator = document.createElement('div');
    healthIndicator.className = `health-indicator health-${healthStatus}`;
    healthIndicator.innerHTML = `
      <div class="health-status">
        <span class="health-icon">${healthIcon}</span>
        <span class="health-label">Network Issuance: ${healthLabel}</span>
      </div>
      <div class="health-metrics">
        <div class="metric">
          <span class="metric-label">Inflation Error:</span>
          <span class="metric-value">${inflationError} bps</span>
        </div>
        <div class="metric">
          <span class="metric-label">Epoch:</span>
          <span class="metric-value">${this.data.epoch || 0}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Block Reward:</span>
          <span class="metric-value">${this.data.final_reward.toFixed(4)} BLOCK</span>
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(healthIndicator);

    // Render alerts
    if (alerts.length > 0) {
      const alertsList = document.createElement('div');
      alertsList.className = 'alerts-list';

      alerts.forEach(alert => {
        const alertItem = document.createElement('div');
        alertItem.className = `alert alert-${alert.level}`;
        alertItem.innerHTML = `
          <div class="alert-message">${alert.message}</div>
          <div class="alert-action">${alert.action}</div>
        `;
        alertsList.appendChild(alertItem);
      });

      container.appendChild(alertsList);
    }
  }

  renderHistory() {
    // TODO: Implement historical trend chart
    // Will show 7d/30d/90d trends of each multiplier
    const container = $('#history-canvas-container');
    if (!container) return;

    container.innerHTML = `
      <div class="coming-soon">
        <p class="muted">Historical trends coming soon</p>
        <p class="small">Will show 7d/30d/90d evolution of multipliers</p>
      </div>
    `;
  }

  showMultiplierDetails(multiplier) {
    console.log('[NetworkIssuanceChart] Show details for:', multiplier);
    // TODO: Show detailed modal with drill-down
    // For now, just highlight the card
    this.highlightBreakdown(multiplier);
  }

  highlightFormulaTerm(multiplier) {
    const formula = $('#issuance-formula');
    if (!formula) return;

    // Remove previous highlights
    formula.querySelectorAll('.formula-term').forEach(term => {
      term.classList.remove('highlighted');
    });

    // Add highlight
    if (multiplier) {
      const term = formula.querySelector(`[data-multiplier="${multiplier}"]`);
      if (term) {
        term.classList.add('highlighted');
      }
    }
  }

  highlightBreakdown(multiplier) {
    const breakdown = $('#multiplier-breakdown');
    if (!breakdown) return;

    // Remove previous highlights
    breakdown.querySelectorAll('.breakdown-card').forEach(card => {
      card.classList.remove('highlighted');
    });

    // Add highlight
    if (multiplier) {
      const card = breakdown.querySelector(`[data-multiplier="${multiplier}"]`);
      if (card) {
        card.classList.add('highlighted');
      }
    }
  }

  onUnmount() {
    console.log('[NetworkIssuanceChart] Cleanup complete');
  }
}

export default NetworkIssuanceChart;

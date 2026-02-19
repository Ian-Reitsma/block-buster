/**
 * Economics Simulator ("Economics Lab")
 *
 * Interactive playground for the BLOCK monetary policy:
 * - Adjust activity, decentralization, and supply knobs
 * - See block reward, annual issuance, and inflation error instantly
 * - Experiment with Launch Governor economics gate inputs
 *
 * Sources: docs/economics_and_governance.md, node/src/economics/network_issuance.rs
 */

import { Component } from '../lifecycle.js';
import { $, fmt, clamp } from '../utils.js';
import mockDataManager from '../mock-data-manager.js';

class EconomicsSimulator extends Component {
  constructor(rpc) {
    super('EconomicsSimulator');
    this.rpc = rpc;

    // Immutable constants
    this.EXPECTED_TOTAL_BLOCKS = 100_000_000;
    this.BLOCKS_PER_YEAR = 365 * 24 * 3600; // 1s blocks
    this.EPOCH_SECONDS = 120; // crate::EPOCH_BLOCKS default (see node/src/lib.rs)

    // Mutable inputs (initialized in onMount)
    this.inputs = this.defaultInputs();

    // Cached DOM refs for fast updates
    this.refs = {};
  }

  defaultInputs() {
    return {
      txCountRatio: 1.10,
      txVolumeRatio: 1.25,
      marketUtil: 0.62,
      uniqueMiners: 26,
      baselineMiners: 20,
      emission: 3_200_000,
      maxSupply: 40_000_000,
      targetInflationBps: 500,
      utilizationPpm: 650_000,
      providerMarginPpm: 120_000,
      gateStreak: 9,
      windowSecs: 240, // default governor window = 2 * EPOCH_SECONDS
    };
  }

  render() {
    const container = document.createElement('div');
    container.className = 'economics-lab';

    container.innerHTML = `
      <div class="lab-grid">
        <section class="lab-panel">
          <header class="lab-header">
            <div>
              <p class="eyebrow">Scenario</p>
              <h3>Interactive Economics Lab</h3>
              <p class="muted small">Tweak inputs and see the monetary outputs immediately.</p>
            </div>
            <div class="lab-actions">
              <button class="btn btn-sm" data-scenario="early">Early Network</button>
              <button class="btn btn-sm" data-scenario="growth">Growth</button>
              <button class="btn btn-sm" data-scenario="mainnet">Mainnet</button>
              <button class="btn btn-sm" data-scenario="stress">Stress</button>
            </div>
          </header>

          <div class="lab-controls">
            ${this.renderSlider('txCountRatio', 'TX Count Ratio', 0.6, 2.2, 0.01, 'Relative to 30d baseline')}
            ${this.renderSlider('txVolumeRatio', 'TX Volume Ratio', 0.6, 2.2, 0.01, 'Volume vs baseline')}
            ${this.renderSlider('marketUtil', 'Market Utilization', 0.2, 0.95, 0.01, 'Across storage/compute/energy')}
            ${this.renderSlider('uniqueMiners', 'Unique Miners', 5, 120, 1, 'Active miners in epoch')}
            ${this.renderSlider('emission', 'Issued Supply (BLOCK)', 500_000, 40_000_000, 50_000, 'Total emitted so far')}
            ${this.renderSlider('targetInflationBps', 'Target Inflation (bps)', 50, 1500, 10, 'Governor target')}
            <div class="lab-subgrid">
              ${this.renderSlider('utilizationPpm', 'Utilization (ppm)', 10_000, 950_000, 10_000, 'Launch governor input')}
              ${this.renderSlider('providerMarginPpm', 'Provider Margin (ppm)', -500_000, 300_000, 5_000, 'Launch governor input')}
              ${this.renderSlider('gateStreak', 'Gate Streak (days)', 0, 30, 1, 'Consecutive healthy days')}
              ${this.renderSlider('windowSecs', 'Governor Window (s)', 30, 600, 10, 'TB_GOVERNOR_WINDOW_SECS')}
            </div>
          </div>
        </section>

        <section class="lab-panel metrics-panel">
          <header class="lab-header">
            <div>
              <p class="eyebrow">Outputs</p>
              <h3>Reward &amp; Inflation</h3>
            </div>
            <div class="lab-actions">
              <button class="btn btn-sm" id="sync-live">Sync Live</button>
              <button class="btn btn-sm btn-secondary" id="sync-mock">Mock Baseline</button>
              <button class="btn btn-sm btn-secondary" id="sync-governor">Sync Governor</button>
            </div>
          </header>

          <div class="metrics-grid">
            <div class="metric-card">
              <p class="label">Block Reward</p>
              <h2 id="reward-value">0.0000 BLOCK</h2>
              <p class="muted small">base × activity × decentralization × decay</p>
            </div>
            <div class="metric-card">
              <p class="label">Annual Issuance</p>
              <h2 id="annual-issuance">—</h2>
              <p class="muted small">Assumes 1s blocks (~31.5M blocks/yr)</p>
            </div>
            <div class="metric-card">
              <p class="label">Inflation vs Target</p>
              <h2 id="inflation">—</h2>
              <p class="muted small" id="inflation-delta">—</p>
            </div>
            <div class="metric-card">
              <p class="label">Launch Governor</p>
              <h2 id="gate-status">Evaluating…</h2>
              <p class="muted small" id="gate-details">Utilization + margins + streak</p>
            </div>
          </div>

          <div class="formula-grid">
            <div class="formula-block">
              <p class="eyebrow">Activity Multiplier</p>
              <h4 id="activity-multiplier">—</h4>
              <div class="bar" aria-label="activity bar">
                <span id="activity-bar"></span>
              </div>
              <p class="muted tiny" id="activity-breakdown">—</p>
            </div>
            <div class="formula-block">
              <p class="eyebrow">Decentralization</p>
              <h4 id="decentr">—</h4>
              <div class="bar" aria-label="decentralization bar">
                <span id="decentr-bar"></span>
              </div>
              <p class="muted tiny">sqrt(unique_miners / baseline_miners)</p>
            </div>
            <div class="formula-block">
              <p class="eyebrow">Supply Decay</p>
              <h4 id="decay">—</h4>
              <div class="bar" aria-label="decay bar">
                <span id="decay-bar"></span>
              </div>
              <p class="muted tiny">Remaining supply / max supply</p>
            </div>
          </div>
        </section>
      </div>
    `;

    return container;
  }

  renderSlider(key, label, min, max, step, helper) {
    const value = this.inputs[key];
    return `
      <label class="lab-control" data-key="${key}">
        <div class="lab-control__meta">
          <span>${label}</span>
          <span class="value" id="${key}-value">${this.displayValue(key, value)}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
        <p class="muted tiny">${helper || ''}</p>
      </label>
    `;
  }

  displayValue(key, value) {
    if (key === 'marketUtil') return `${(value * 100).toFixed(1)}%`;
    if (key === 'targetInflationBps') return `${value.toFixed(0)} bps`;
    if (key === 'utilizationPpm' || key === 'providerMarginPpm') {
      return `${Math.round(value / 10_000) / 100}%`;
    }
    if (key === 'emission' || key === 'maxSupply') return fmt.num(value);
    if (key === 'windowSecs') return `${value.toFixed(0)} s`;
    return value.toFixed ? value.toFixed(2) : value;
  }

  async onMount() {
    this.bindControls();
    await this.loadBaseline();
    this.updateOutputs();
  }

  bindControls() {
    // Sliders
    document.querySelectorAll('.lab-control input[type="range"]').forEach((input) => {
      this.listen(input, 'input', (e) => {
        const key = e.target.closest('.lab-control').dataset.key;
        const raw = parseFloat(e.target.value);
        this.inputs[key] = raw;
        const label = document.getElementById(`${key}-value`);
        if (label) label.textContent = this.displayValue(key, raw);
        this.updateOutputs();
      });
    });

    // Scenario chips
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      this.listen(btn, 'click', () => {
        this.applyScenario(btn.dataset.scenario);
      });
    });

    // Sync buttons
    const syncLive = $('#sync-live');
    const syncMock = $('#sync-mock');
    const syncGovernor = $('#sync-governor');
    if (syncLive) {
      this.listen(syncLive, 'click', () => this.syncFromLive());
    }
    if (syncMock) {
      this.listen(syncMock, 'click', () => this.syncFromMock());
    }
    if (syncGovernor) {
      this.listen(syncGovernor, 'click', () => this.syncFromGovernor());
    }
  }

  async loadBaseline() {
    // Prefer live data if node is connected; fall back to mock
    if (mockDataManager.isLiveMode && mockDataManager.isLiveMode()) {
      await this.syncFromLive();
    } else {
      this.syncFromMock();
    }
  }

  applyScenario(name) {
    const presets = {
      early: {
        txCountRatio: 0.85,
        txVolumeRatio: 0.95,
        marketUtil: 0.45,
        uniqueMiners: 18,
        emission: 2_200_000,
        targetInflationBps: 700,
        utilizationPpm: 520_000,
        providerMarginPpm: 95_000,
        gateStreak: 4,
      },
      growth: {
        txCountRatio: 1.25,
        txVolumeRatio: 1.35,
        marketUtil: 0.68,
        uniqueMiners: 42,
        emission: 6_500_000,
        targetInflationBps: 500,
        utilizationPpm: 680_000,
        providerMarginPpm: 135_000,
        gateStreak: 12,
      },
      mainnet: {
        txCountRatio: 1.45,
        txVolumeRatio: 1.55,
        marketUtil: 0.74,
        uniqueMiners: 64,
        emission: 9_000_000,
        targetInflationBps: 500,
        utilizationPpm: 720_000,
        providerMarginPpm: 155_000,
        gateStreak: 18,
      },
      stress: {
        txCountRatio: 1.10,
        txVolumeRatio: 1.80,
        marketUtil: 0.92,
        uniqueMiners: 32,
        emission: 7_500_000,
        targetInflationBps: 500,
        utilizationPpm: 810_000,
        providerMarginPpm: 60_000,
        gateStreak: 2,
      },
    };
    this.inputs = { ...this.inputs, ...(presets[name] || {}) };
    this.refreshSliders();
    this.updateOutputs();
  }

  refreshSliders() {
    Object.entries(this.inputs).forEach(([key, value]) => {
      const input = document.querySelector(`.lab-control[data-key="${key}"] input`);
      const label = document.getElementById(`${key}-value`);
      if (input) input.value = value;
      if (label) label.textContent = this.displayValue(key, value);
    });
  }

  async syncFromLive() {
    try {
      const economics = await this.rpc.call('economics.replay', { to_height: 'tip' });
      const live = this.transformLive(economics);
      this.inputs = { ...this.inputs, ...live };
      this.refreshSliders();
      this.updateOutputs();
    } catch (err) {
      console.warn('[EconomicsSimulator] Live sync failed, falling back to mock:', err?.message);
      this.syncFromMock();
    }
  }

  syncFromMock() {
    const mock = mockDataManager.get ? mockDataManager.get('issuance') : null;
    if (!mock) return;
    this.inputs = {
      ...this.inputs,
      txCountRatio: mock.activity_breakdown?.tx_count_ratio ?? this.inputs.txCountRatio,
      txVolumeRatio: mock.activity_breakdown?.tx_volume_ratio ?? this.inputs.txVolumeRatio,
      marketUtil: mock.activity_breakdown?.avg_market_utilization ?? this.inputs.marketUtil,
      uniqueMiners: mock.unique_miners ?? this.inputs.uniqueMiners,
      emission: mock.emission_consumer ?? this.inputs.emission,
      targetInflationBps: mock.target_inflation_bps ?? this.inputs.targetInflationBps,
      utilizationPpm: 650_000,
      providerMarginPpm: 120_000,
      gateStreak: 8,
    };
    this.refreshSliders();
    this.updateOutputs();
  }

  async syncFromGovernor() {
    try {
      const status = await this.rpc.getGovernorStatus();
      const econ = status?.economics_prev_market_metrics || status?.metrics?.economics_prev_market_metrics;
      const gateStreak =
        status?.gates?.economics?.enter_streak ??
        status?.gates?.economics?.streak ??
        this.inputs.gateStreak;
      this.inputs = {
        ...this.inputs,
        utilizationPpm: econ?.utilization_ppm ?? this.inputs.utilizationPpm,
        providerMarginPpm: econ?.provider_margin_ppm ?? this.inputs.providerMarginPpm,
        gateStreak,
      };
      this.refreshSliders();
      this.updateOutputs();
    } catch (err) {
      console.warn('[EconomicsSimulator] Governor sync failed:', err?.message || err);
    }
  }

  transformLive(e) {
    return {
      txCountRatio: e.tx_count_ratio ?? 1.0,
      txVolumeRatio: e.tx_volume_ratio ?? 1.0,
      marketUtil: e.avg_market_utilization ?? 0.6,
      uniqueMiners: e.unique_miners ?? 20,
      emission: e.emission_consumer ?? e.emission ?? this.inputs.emission,
      targetInflationBps: e.target_inflation_bps ?? this.inputs.targetInflationBps,
      utilizationPpm: e.economics_prev_market_metrics_utilization_ppm ?? this.inputs.utilizationPpm,
      providerMarginPpm: e.economics_prev_market_metrics_provider_margin_ppm ?? this.inputs.providerMarginPpm,
      gateStreak: 10,
    };
  }

  computeOutputs() {
    // Mirrors launch_governor economics controller thresholds
    const MIN_UTIL_PCT = 1.0;   // 0.01 in Rust
    const MAX_UTIL_PCT = 95.0;  // 0.95 in Rust
    const MIN_MARGIN_PCT = -50.0; // -0.5 in Rust
    const MAX_MARGIN_PCT = 300.0; // 3.0 in Rust
    const REQUIRED_STREAK = Math.max(
      1,
      Math.floor(this.EPOCH_SECONDS / Math.max(this.inputs.windowSecs, 1)),
    );

    const {
      txCountRatio,
      txVolumeRatio,
      marketUtil,
      uniqueMiners,
      baselineMiners,
      emission,
      maxSupply,
      targetInflationBps,
      utilizationPpm,
      providerMarginPpm,
      gateStreak,
    } = this.inputs;

    const baseReward = (0.9 * maxSupply) / this.EXPECTED_TOTAL_BLOCKS;
    const activityMultiplier = clamp(
      Math.pow(txCountRatio * txVolumeRatio * (1 + marketUtil), 1 / 3),
      0.5,
      1.8,
    );
    const decentralization = Math.sqrt(Math.max(uniqueMiners, 1) / Math.max(baselineMiners, 1));
    const supplyDecay = clamp((maxSupply - emission) / maxSupply, 0.05, 1);
    const blockReward = baseReward * activityMultiplier * decentralization * supplyDecay;
    const annualIssuance = blockReward * this.BLOCKS_PER_YEAR;
    const inflationBps = emission > 0 ? (annualIssuance / emission) * 10_000 : 0;
    const inflationDelta = inflationBps - targetInflationBps;

    // Gate readiness mirrors launch_governor market sanity checks
    const utilPct = utilizationPpm / 10_000; // convert ppm -> %
    const marginPct = providerMarginPpm / 10_000;
    const gateReady =
      utilPct >= MIN_UTIL_PCT &&
      utilPct <= MAX_UTIL_PCT &&
      marginPct >= MIN_MARGIN_PCT &&
      marginPct <= MAX_MARGIN_PCT &&
      gateStreak >= REQUIRED_STREAK;

    return {
      baseReward,
      activityMultiplier,
      decentralization,
      supplyDecay,
      blockReward,
      annualIssuance,
      inflationBps,
      inflationDelta,
      gateReady,
      utilPct,
      marginPct,
      requiredStreak: REQUIRED_STREAK,
      minUtilPct: MIN_UTIL_PCT,
      maxUtilPct: MAX_UTIL_PCT,
      minMarginPct: MIN_MARGIN_PCT,
      maxMarginPct: MAX_MARGIN_PCT,
    };
  }

  updateOutputs() {
    const o = this.computeOutputs();

    this.setText('reward-value', `${o.blockReward.toFixed(4)} BLOCK`);
    this.setText('annual-issuance', `${fmt.num(Math.round(o.annualIssuance))} BLOCK/yr`);

    const inflationStr = `${o.inflationBps.toFixed(0)} bps`;
    const deltaStr =
      o.inflationDelta === 0
        ? 'On target'
        : `${o.inflationDelta > 0 ? '+' : ''}${o.inflationDelta.toFixed(0)} bps vs target`;
    this.setText('inflation', inflationStr);
    this.setText('inflation-delta', deltaStr);

    this.setText('activity-multiplier', o.activityMultiplier.toFixed(3));
    this.setBar('activity-bar', o.activityMultiplier / 1.8);
    this.setText(
      'activity-breakdown',
      `gm(${this.inputs.txCountRatio.toFixed(2)}, ${this.inputs.txVolumeRatio.toFixed(
        2,
      )}, ${(1 + this.inputs.marketUtil).toFixed(2)})`,
    );

    this.setText('decentr', o.decentralization.toFixed(3));
    this.setBar('decentr-bar', Math.min(o.decentralization / 2.5, 1));

    this.setText('decay', o.supplyDecay.toFixed(3));
    this.setBar('decay-bar', o.supplyDecay);

    const gateText = o.gateReady ? 'READY' : 'NOT READY';
    const gateDetails = `Util ${o.utilPct.toFixed(1)}% (${o.minUtilPct}-${o.maxUtilPct}%) • Margin ${o.marginPct.toFixed(
      1,
    )}% (${o.minMarginPct} to ${o.maxMarginPct}%) • Streak ${this.inputs.gateStreak}/${o.requiredStreak}`;
    this.setText('gate-status', gateText);
    this.setText('gate-details', gateDetails);

    // Color cues
    const gateEl = $('#gate-status');
    if (gateEl) {
      gateEl.style.color = o.gateReady ? 'var(--success)' : 'var(--danger)';
    }
  }

  setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  setBar(id, fraction) {
    const el = document.getElementById(id);
    if (el) {
      el.style.width = `${clamp(fraction, 0, 1) * 100}%`;
    }
  }

  onUnmount() {
    // Nothing long-lived to clean up; intervals would go here if added later.
  }
}

export default EconomicsSimulator;

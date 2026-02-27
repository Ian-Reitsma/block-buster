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
import features from '../features.js';
import {
  CONSTANTS,
  computeIssuance,
  computeCoinbaseBreakdown,
  evaluateGates,
  fetchLiveInputs,
  fetchAdReadiness,
  projectEmissionSchedule,
  computeSensitivity,
} from '../EconomicsEngine.js';

class EconomicsSimulator extends Component {
  constructor(rpc) {
    super('EconomicsSimulator');
    this.rpc = rpc;
    // false → live chain data loaded; true → using mock or chain sync failed
    this._simulated = true;

    // ── Immutable chain constants (imported from EconomicsEngine) ────────────
    // All formula constants are now canonical in EconomicsEngine.CONSTANTS.
    // This removes the local copies that diverged from the engine definition.
    this.CONSTANTS = CONSTANTS;

    // Mutable inputs (initialized in onMount)
    this.inputs = this.defaultInputs();

    // Cached DOM refs for fast updates
    this.refs = {};

    // P5: debounce timer for chart re-render on slider input
    // 150ms window prevents canvas thrash while dragging sliders.
    // Cleared in onUnmount to avoid stale callbacks after component teardown.
    this._updateTimer = null;

    // P8: pinned scenario snapshot — null = no pin active.
    // Shape when set: { label: string, inputs: Object, pinnedAt: number }
    // Stores inputs only (not computed outputs) so deltas always recompute from the
    // live EconomicsEngine — no stale numbers if engine constants change between
    // pin and unpin. Written by _pin(), cleared by _unpin().
    this._pinned = null;

    // Ad quality auto-refresh interval handle (30s polling when live — cleared in onUnmount)
    this._adRefreshInterval = null;
    // Last raw ad readiness snapshot from chain (set by syncFromChain / _refreshAdReadiness)
    this._adReadinessRaw = null;
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
      gateStreak: 9,
      windowSecs: 240, // default governor window = 2 * EPOCH_SECONDS
      // ── P4: Per-market utilization ppm ────────────────────────────────────────────────────
      // Source: governor.status.economics_prev_market_metrics[i].utilization_ppm
      // avg_util = mean(4 markets) / 1e6 → fed into activity multiplier as (1 + avg_util)
      storageUtilPpm: CONSTANTS.STORAGE_UTIL_PPM_DEFAULT,   // 650_000 = 65%
      computeUtilPpm: CONSTANTS.COMPUTE_UTIL_PPM_DEFAULT,   // 680_000 = 68%
      energyUtilPpm:  CONSTANTS.ENERGY_UTIL_PPM_DEFAULT,    // 590_000 = 59%
      adUtilPpm:      CONSTANTS.AD_UTIL_PPM_DEFAULT,        // 720_000 = 72%
      // ── P4: Per-market provider margin ppm ──────────────────────────────────────────────
      // Source: governor.status.economics_prev_market_metrics[i].provider_margin_ppm
      // Each evaluated independently against GATE_MARGIN_MIN (100_000 ppm = 10%).
      // A market at 0 ppm margin = providers breaking even = gate fails for that market.
      storageMarginPpm: CONSTANTS.STORAGE_MARGIN_PPM_DEFAULT,  // 120_000 = 12%
      computeMarginPpm: CONSTANTS.COMPUTE_MARGIN_PPM_DEFAULT,  // 135_000 = 13.5%
      energyMarginPpm:  CONSTANTS.ENERGY_MARGIN_PPM_DEFAULT,   // 110_000 = 11%
      adMarginPpm:      CONSTANTS.AD_MARGIN_PPM_DEFAULT,       // 145_000 = 14.5%
      // ── Coinbase governance params (P3 — Advanced section) ────────────────────────────────────────
      // Defaults mirror CONSTANTS; user-tunable so governance sensitivity is immediately visible.
      // renderCoinbaseBreakdown() uses these every time a slider changes.
      treasuryPercent:   CONSTANTS.TREASURY_PERCENT_DEFAULT,    // % of blockReward → treasury
      subsidyStorageBps: CONSTANTS.SUBSIDY_STORAGE_BPS_DEFAULT, // bps → STORAGE_SUB bucket
      subsidyReadBps:    CONSTANTS.SUBSIDY_READ_BPS_DEFAULT,    // bps → READ_SUB bucket
      subsidyComputeBps: CONSTANTS.SUBSIDY_COMPUTE_BPS_DEFAULT, // bps → COMPUTE_SUB bucket

      // ── EMA baseline modeling ────────────────────────────────────────────────────────────────
      // Both fields fed directly to computeIssuance() which pre-processes tx ratios
      // into EMA-normalised effective ratios before the activity multiplier formula.
      //
      // emaAlphaPpm:    governance param (baseline_ema_alpha_ppm) — how fast the EMA baseline
      //                 responds to tx volume changes. 50_000 = 5% per epoch.
      // baselineEpochs: "network age" descriptor — how many EMA epochs have run.
      //                 0 = genesis (baseline = 1.0), ~500 = mainnet-mature (baseline converged).
      //                 Drag this up while watching the Activity Multiplier to see how early-net
      //                 tx spikes become absorbed once the EMA has enough history.
      emaAlphaPpm:    CONSTANTS.EMA_ALPHA_PPM_DEFAULT,   // 50_000 = 5%
      baselineEpochs: CONSTANTS.BASELINE_EPOCHS_DEFAULT, // 10 epochs (testnet launch)

      // ── Ad Market Quality (Q_cohort) modeling ──────────────────────────────────────────────
      // Docs formula:
      //   Q_cohort = clamp((freshness × privacy × readiness)^(1/3), floor, ceiling)
      //   effective_bid = base_bid × Q_creative × Q_cohort
      // Values are expressed as multipliers in ppm (1_000_000 = 1.0×) to match the
      // rest of the economics UI style.
      adFreshnessPpm: 900_000,   // 0.90× (slightly stale cohorts)
      adPrivacyPpm:   950_000,   // 0.95× (privacy budget mostly available)
      adReadinessPpm: 850_000,   // 0.85× (readiness/streak not perfect)
      adQFloorPpm:    500_000,   // 0.50× min quality
      adQCeilPpm:   1_500_000,   // 1.50× max quality
      adCreativeQ:   1.000,      // Q_creative multiplier (0–2) — placeholder until creative scoring UI exists
      adBaseBid:     0.050,      // BLOCK — base bid before quality multipliers
    };
  }

  render() {
    const container = document.createElement('div');
    container.className = 'economics-lab';

    container.innerHTML = `
      <style>
        /* EconLab off-canvas controls panel + no-scrollbar chrome */
        .economics-lab .econlab-controls-toggle {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }
        .economics-lab .econlab-controls-backdrop {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.65);
          z-index: 80;
          backdrop-filter: blur(2px);
        }
        .economics-lab .lab-grid {
          grid-template-columns: 1fr;
        }
        .economics-lab .lab-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          width: min(420px, 92vw);
          max-width: 92vw;
          z-index: 90;
          background: rgba(10, 10, 12, 0.98);
          border-right: 1px solid var(--border-color, rgba(255,255,255,0.1));
          box-shadow: 4px 0 24px rgba(0,0,0,0.5);
          transform: translateX(-105%);
          transition: transform 160ms ease;
          overflow: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }
        /* Hide scrollbar chrome but keep scrolling */
        .economics-lab .lab-sidebar { scrollbar-width: none; }
        .economics-lab .lab-sidebar::-webkit-scrollbar { width: 0; height: 0; }

        .economics-lab .econlab-controls-toggle:checked ~ .econlab-controls-backdrop {
          display: block;
        }
        .economics-lab .econlab-controls-toggle:checked ~ .lab-sidebar {
          transform: translateX(0);
        }
        .economics-lab .lab-main {
          grid-column: 1 / -1;
        }
        .economics-lab .econlab-controls-close {
          margin-left: 12px;
          flex: 0 0 auto;
        }
      </style>

      <div class="lab-grid">
        <input type="checkbox" id="econlab-controls-toggle" class="econlab-controls-toggle" />
        <label class="econlab-controls-backdrop" for="econlab-controls-toggle" aria-label="Close controls"></label>

        <aside class="lab-sidebar" aria-label="Scenario controls">
          <header class="lab-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
            <div>
              <p class="eyebrow">Scenario</p>
              <h3>Controls</h3>
              <p class="muted small">Edit inputs precisely; outputs update instantly.</p>
            </div>
            <label class="btn btn-sm btn-secondary econlab-controls-close" for="econlab-controls-toggle" title="Close controls">Close</label>
          </header>

          <div class="lab-actions" style="display:flex; gap:8px; margin-bottom:1rem; flex-wrap:wrap;">
            <button class="btn btn-sm" id="sync-live">Sync Live</button>
            <button class="btn btn-sm btn-secondary" id="sync-mock">Mock Baseline</button>
            <button class="btn btn-sm btn-secondary" id="sync-governor">Sync Gov</button>
          </div>

          <div class="lab-actions" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:1rem;">
            <button class="btn btn-sm" data-scenario="early">Early</button>
            <button class="btn btn-sm" data-scenario="growth">Growth</button>
            <button class="btn btn-sm" data-scenario="mainnet">Mainnet</button>
            <button class="btn btn-sm" data-scenario="stress">Stress</button>
            <button class="btn btn-sm" data-scenario="genesis">Genesis (EMA cold)</button>
            <button class="btn btn-sm" data-scenario="mature">Mature (EMA settled)</button>
            <button class="btn btn-sm" data-scenario="gate-pass">Gate Pass (min margins)</button>
            <button class="btn btn-sm" data-scenario="gate-fail">Gate Fail (margins)</button>
            <button class="btn btn-sm btn-secondary" id="econlab-pin" title="Compare: pin current inputs as baseline overlay">Compare</button>
            <button class="btn btn-sm btn-secondary" id="econlab-unpin" style="display:none;" title="Clear comparison overlay">Clear Compare</button>
          </div>

          <div class="lab-controls">
            ${this.renderNumericInput('txCountRatio', 'TX Count Ratio', 0.6, 2.2, 0.01, 'Relative to 30d baseline')}
            ${this.renderNumericInput('txVolumeRatio', 'TX Volume Ratio', 0.6, 2.2, 0.01, 'Volume vs baseline')}
            ${this.renderNumericInput('uniqueMiners', 'Unique Miners', 5, 120, 1, 'Active miners in epoch')}
            ${this.renderNumericInput('emission', 'Issued Supply (BLOCK)', 500000, 40000000, 50000, 'Total emitted so far')}
            ${this.renderNumericInput('targetInflationBps', 'Target Inflation (bps)', 50, 1500, 10, 'Governor target')}

            <div class="lab-subgrid">
              <p class="eyebrow" style="margin:0 0 6px;font-size:11px;opacity:0.6;">Market Utilization (ppm)</p>
              ${this.renderNumericInput('storageUtilPpm', 'Storage Util', 10000, 950000, 10000,
                'storage utilization_ppm · governor.status.economics_prev_market_metrics[0].utilization_ppm · early-net: 50–70%')}
              ${this.renderNumericInput('computeUtilPpm', 'Compute Util', 10000, 950000, 10000,
                'compute utilization_ppm · governor.status.economics_prev_market_metrics[1].utilization_ppm · early-net: 55–75%')}
            ${this.renderNumericInput('energyUtilPpm', 'Energy Util', 10000, 950000, 10000,
              'energy utilization_ppm · governor.status.economics_prev_market_metrics[2].utilization_ppm · oracle ramp lag: 45–65%')}
            ${this.renderNumericInput('adUtilPpm', 'Ad Util', 10000, 950000, 10000,
              'ad utilization_ppm · governor.status.economics_prev_market_metrics[3].utilization_ppm · ad is most volatile market')}
            </div>

            <div class="lab-subgrid">
              <p class="eyebrow" style="margin:0 0 6px;font-size:11px;opacity:0.6;">Provider Margin (ppm)</p>
              ${this.renderNumericInput('storageMarginPpm', 'Storage Margin', 0, 500000, 5000,
                'storage provider_margin_ppm · governor.status.economics_prev_market_metrics[0].provider_margin_ppm · gate ≥ 10%')}
              ${this.renderNumericInput('computeMarginPpm', 'Compute Margin', 0, 500000, 5000,
                'compute provider_margin_ppm · governor.status.economics_prev_market_metrics[1].provider_margin_ppm · gate ≥ 10%')}
            ${this.renderNumericInput('energyMarginPpm', 'Energy Margin', 0, 500000, 5000,
              'energy provider_margin_ppm · governor.status.economics_prev_market_metrics[2].provider_margin_ppm · gate ≥ 10%')}
            ${this.renderNumericInput('adMarginPpm', 'Ad Margin', 0, 500000, 5000,
              'ad provider_margin_ppm · governor.status.economics_prev_market_metrics[3].provider_margin_ppm · gate ≥ 10%')}
            </div>

            ${this.renderNumericInput('gateStreak', 'Gate Streak (epochs)', 0, 60, 1, 'Consecutive healthy epochs')}
            ${this.renderNumericInput('windowSecs', 'Governor Window (s)', 30, 600, 10, 'Affects required streak')}

            <details class="advanced-section">
              <summary class="advanced-toggle">
                <span class="eyebrow" style="pointer-events:none;">Advanced: Coinbase</span>
              </summary>
              <div class="advanced-controls">
                ${this.renderNumericInput('treasuryPercent', 'Treasury %', 0, 30, 1, '% of block reward → treasury')}
                ${this.renderNumericInput('subsidyStorageBps', 'Storage Sub (bps)', 0, 5000, 50, 'Storage subsidy bps')}
                ${this.renderNumericInput('subsidyReadBps', 'Read Sub (bps)', 0, 3000, 50, 'Read/relay subsidy bps')}
                ${this.renderNumericInput('subsidyComputeBps', 'Compute Sub (bps)', 0, 4000, 50, 'Compute subsidy bps')}
              </div>
            </details>

            <details class="advanced-section">
              <summary class="advanced-toggle">
                <span class="eyebrow" style="pointer-events:none;">EMA Baseline</span>
              </summary>
              <div class="advanced-controls">
                ${this.renderNumericInput('emaAlphaPpm', 'EMA Alpha (higher=smoother)', 5000, 200000, 5000, 'baseline_ema_alpha_ppm')}
                ${this.renderNumericInput('baselineEpochs', 'Baseline Epochs (0=genesis)', 0, 1000, 5, 'Network age proxy')}
                <div id="ema-preview" style="padding:8px 4px 4px; font-size:11px; color:var(--muted); font-family:monospace; line-height:1.7; border-top:1px solid rgba(255,255,255,0.06); margin-top:8px;"></div>
              </div>
            </details>

            <details class="advanced-section">
              <summary class="advanced-toggle">
                <span class="eyebrow" style="pointer-events:none;">Ad Quality</span>
              </summary>
              <div class="advanced-controls">
                ${this.renderNumericInput('adBaseBid', 'Base Bid (BLOCK)', 0.001, 2.0, 0.001, 'Base bid before quality')}
                ${this.renderNumericInput('adCreativeQ', 'Q_creative', 0.10, 2.00, 0.01, 'Creative multiplier')}
                ${this.renderNumericInput('adFreshnessPpm', 'Freshness (ppm)', 0, 2000000, 10000, 'Freshness multiplier')}
                ${this.renderNumericInput('adPrivacyPpm', 'Privacy (ppm)', 0, 2000000, 10000, 'Privacy multiplier')}
                ${this.renderNumericInput('adReadinessPpm', 'Readiness (from chain)', 0, 2000000, 10000, 'Readiness multiplier')}
                ${this.renderNumericInput('adQFloorPpm', 'Q_floor (ppm)', 0, 1000000, 10000, 'Clamp floor')}
                ${this.renderNumericInput('adQCeilPpm', 'Q_ceil (ppm)', 1000000, 2000000, 10000, 'Clamp ceiling')}
                <div id="adq-preview" style="padding:8px 4px 4px; font-size:11px; color:var(--muted); font-family:monospace; line-height:1.7; border-top:1px solid rgba(255,255,255,0.06); margin-top:8px;"></div>
                <div id="ad-quality-diagnostics"></div>
              </div>
            </details>
          </div>
        </aside>

        <main class="lab-main">
          <header class="lab-header">
            <div>
              <label class="eyebrow" for="econlab-controls-toggle" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;" title="Open scenario controls">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                Controls
              </label>
              <h3>Reward &amp; Inflation</h3>
            </div>
            <div class="lab-actions">
              <span class="pill pill-muted" id="econlab-pinned-badge" style="display:none; font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
              <span class="pill pill-muted" id="econlab-sim-badge" style="display:none;">Simulated</span>
            </div>
          </header>

          <div class="metrics-grid">
            <div class="metric-card">
              <p class="label">Block Reward</p>
              <h2 id="reward-value">0.0000 BLOCK</h2>
              <p class="muted small">base × activity × decentralization × decay</p>
              <p class="muted tiny" id="reward-delta" style="display:none; margin-top:4px;"></p>
            </div>
            <div class="metric-card">
              <p class="label">Annual Issuance</p>
              <h2 id="annual-issuance">—</h2>
              <p class="muted small">Assumes 1s blocks (~31.5M blocks/yr)</p>
              <p class="muted tiny" id="annual-issuance-delta" style="display:none; margin-top:4px;"></p>
            </div>
            <div class="metric-card">
              <p class="label">Inflation vs Target</p>
              <h2 id="inflation">—</h2>
              <p class="muted small" id="inflation-delta">—</p>
              <p class="muted tiny" id="inflation-pinned-delta" style="display:none; margin-top:4px;"></p>
            </div>
          </div>

          <div class="gate-matrix-section" id="gate-matrix-section" style="margin-bottom: 2rem;">
            <header class="lab-header" style="margin-bottom:1rem; align-items:center;">
              <div>
                <p class="eyebrow">Launch Governor</p>
                <h3 style="display:flex; align-items:center; gap:12px;">
                  Gate Status
                  <span id="gate-overall-badge" class="pill" style="background:var(--panel-elevated); color:var(--muted); font-size:12px;">Evaluating...</span>
                </h3>
              </div>
              <div style="text-align:right;">
                <p class="eyebrow">Current Streak</p>
                <h3 id="gate-streak-val">—</h3>
              </div>
            </header>
            <div class="gate-grid" id="gate-grid" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:12px;"></div>
          </div>

          <section class="charts-section" style="margin-top:2rem;">
            <header class="lab-header" style="margin-bottom:1rem;">
              <div>
                <p class="eyebrow">Emission Schedule</p>
                <h3>100M Block Horizon (40M Max Supply)</h3>
              </div>
            </header>
            <div class="charts-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;">
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Block Reward</p><canvas id="chart-block-reward" width="560" height="220" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Cumulative Emission</p><canvas id="chart-total-emitted" width="560" height="220" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Annual Issuance</p><canvas id="chart-annual-issuance" width="560" height="220" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Inflation Rate (bps)</p><canvas id="chart-inflation-bps" width="560" height="220" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
            </div>
          </section>

          <div class="sensitivity-section" id="sensitivity-section" style="margin-bottom: 2rem; margin-top: 2rem;">
            <header class="lab-header" style="margin-bottom:1rem;">
              <div><p class="eyebrow">Sensitivity</p><h3>What moves block reward?</h3></div>
            </header>
            <div class="chart-card" style="padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--panel);">
              <canvas id="sensitivity-chart" style="width:100%; height:220px;"></canvas>
            </div>
          </div>

          <!-- coinbase breakdown intentionally removed (was visually out-of-place in the lab) -->

          <div class="formula-grid">
            <div class="formula-block"><p class="eyebrow">Activity Multiplier</p><h4 id="activity-multiplier">—</h4><div class="bar"><span id="activity-bar"></span></div><p class="muted tiny" id="activity-breakdown">—</p></div>
            <div class="formula-block"><p class="eyebrow">Decentralization</p><h4 id="decentr">—</h4><div class="bar"><span id="decentr-bar"></span></div></div>
            <div class="formula-block"><p class="eyebrow">Supply Decay</p><h4 id="decay">—</h4><div class="bar"><span id="decay-bar"></span></div></div>
          </div>
        </main>
      </div>
    `;

    return container;
  }

  renderNumericInput(key, label, min, max, step, helper) {
    const value = this.inputs[key];

    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `
      <div class="lab-input-group" data-key="${key}" data-min="${min}" data-max="${max}" data-step="${step}">
        <div class="lab-input-header">
          <label class="lab-input-label">
            ${esc(label)}
            ${helper ? `<span class="tooltip-icon" data-tooltip="${esc(helper)}" tabindex="0">ⓘ</span>` : ''}
          </label>
          <span class="value-display" id="${key}-value">${esc(this.displayValue(key, value))}</span>
        </div>

        <div class="numeric-stepper">
          <button type="button" class="stepper-btn" data-key="${key}" data-dir="-1">−</button>
          <input
            class="stepper-input"
            type="number"
            inputmode="decimal"
            data-key="${key}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}"
          />
          <button type="button" class="stepper-btn" data-key="${key}" data-dir="1">+</button>
        </div>
      </div>
    `;
  }

  displayValue(key, value) {
    if (key === 'marketUtil') return `${(value * 100).toFixed(1)}%`;
    if (key === 'targetInflationBps') return `${value.toFixed(0)} bps`;
    // P4: per-market util and margin ppm keys — show as % with ppm in parens
    if (
      key === 'storageUtilPpm'  || key === 'computeUtilPpm'  ||
      key === 'energyUtilPpm'   || key === 'adUtilPpm'       ||
      key === 'storageMarginPpm'|| key === 'computeMarginPpm'||
      key === 'energyMarginPpm' || key === 'adMarginPpm'
    ) {
      return `${(value / 10_000).toFixed(1)}% (${(value / 1000).toFixed(0)}k ppm)`;
    }
    // Legacy single-value keys kept for backward compat during any transition
    if (key === 'utilizationPpm' || key === 'providerMarginPpm') {
      return `${Math.round(value / 10_000) / 100}%`;
    }
    if (key === 'emission' || key === 'maxSupply') return fmt.num(value);
    if (key === 'windowSecs') return `${value.toFixed(0)} s`;
    if (key === 'treasuryPercent') return `${value.toFixed(0)}%`;
    if (key === 'subsidyStorageBps' || key === 'subsidyReadBps' || key === 'subsidyComputeBps') {
      return `${value} bps (${(value / 100).toFixed(1)}%)`;
    }
    return value.toFixed ? value.toFixed(2) : value;
  }

  async onMount() {
    this.bindControls();
    await this.loadBaseline();
    this.updateOutputs();

    // Defer chart render so offsetWidth resolves after browser paints grid layout
    requestAnimationFrame(() => this._renderCharts());

    // Badge is driven by _simulated flag, set by syncFromChain() on success
    // and by syncFromMock() whenever it runs. Safety-net here catches edge cases.
    const badge = document.getElementById('econlab-sim-badge');
    if (badge) badge.style.display = this._simulated ? 'inline-flex' : 'none';

    // Start 30s auto-refresh of F/P/R — only fires when live chain data is loaded.
    // If still simulated after loadBaseline(), the interval noop-s every tick until
    // the user clicks Sync Live. Cleared in onUnmount to avoid ghost intervals.
    this._adRefreshInterval = setInterval(() => {
      if (!this._simulated) this._refreshAdReadiness();
    }, 30_000);
  }

  bindControls() {
    const clampNum = (x, min, max) => Math.min(max, Math.max(min, x));

    const roundToStep = (val, step) => {
      const s = Number(step);
      if (!isFinite(s) || s <= 0) return val;
      const inv = 1 / s;
      // Avoid float drift: snap on step grid.
      return Math.round(val * inv) / inv;
    };

    const commit = (key, raw) => {
      const group = document.querySelector(`.lab-input-group[data-key="${key}"]`);
      const min = Number(group?.dataset?.min ?? -Infinity);
      const max = Number(group?.dataset?.max ?? Infinity);
      const step = Number(group?.dataset?.step ?? 0);

      let v = Number(raw);
      if (!isFinite(v)) v = Number(this.inputs[key]) || 0;
      v = clampNum(v, min, max);
      v = roundToStep(v, step);

      this.inputs[key] = v;

      const inp = document.querySelector(`.stepper-input[data-key="${key}"]`);
      if (inp) inp.value = String(v);

      const label = document.getElementById(`${key}-value`);
      if (label) label.textContent = this.displayValue(key, v);

      this._debouncedUpdate();
    };

    // Numeric inputs
    document.querySelectorAll('.stepper-input').forEach((input) => {
      this.listen(input, 'input', (e) => {
        const key = e.target.dataset.key;
        commit(key, e.target.value);
      });
    });

    // +/- buttons
    document.querySelectorAll('.stepper-btn').forEach((btn) => {
      this.listen(btn, 'click', (e) => {
        const key = e.currentTarget.dataset.key;
        const dir = Number(e.currentTarget.dataset.dir);
        const group = document.querySelector(`.lab-input-group[data-key="${key}"]`);
        const step = Number(group?.dataset?.step ?? 1);

        const cur = Number(this.inputs[key]) || 0;
        commit(key, cur + dir * step);
      });
    });

    // Scenario chips
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      this.listen(btn, 'click', () => {
        this.applyScenario(btn.dataset.scenario);
      });
    });

    // Sync buttons
    const syncLive     = $('#sync-live');
    const syncMock     = $('#sync-mock');
    const syncGovernor = $('#sync-governor');
    if (syncLive)     this.listen(syncLive,     'click', () => this.syncFromChain());
    if (syncMock)     this.listen(syncMock,     'click', () => this.syncFromMock());
    if (syncGovernor) this.listen(syncGovernor, 'click', () => this.syncFromChain());

    // Tooltips (custom, position-correct, unclipped)
    const tooltipEl = (() => {
      let el = document.getElementById('econlab-tooltip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'econlab-tooltip';
        el.className = 'econlab-tooltip';
        document.body.appendChild(el);
      }
      return el;
    })();

    const showTooltip = (iconEl, text, evt = null) => {
      if (!text) return;
      tooltipEl.textContent = text;
      tooltipEl.style.display = 'block';
      tooltipEl.style.opacity = '1';

      const r = iconEl.getBoundingClientRect();
      const x = (evt?.clientX ?? (r.left + r.width / 2));
      const y = (evt?.clientY ?? r.top);

      // Default: above the icon, centered.
      tooltipEl.style.left = `${x}px`;
      tooltipEl.style.top  = `${Math.max(8, y - 10)}px`;
      tooltipEl.style.transform = 'translate(-50%, -100%)';

      // Clamp into viewport horizontally after it has a size.
      const tw = tooltipEl.offsetWidth;
      const margin = 8;
      const left = Math.min(window.innerWidth - margin, Math.max(margin, x));
      // If clamped, keep it visually aligned.
      tooltipEl.style.left = `${left}px`;
    };

    const hideTooltip = () => {
      tooltipEl.style.opacity = '0';
      tooltipEl.style.display = 'none';
    };

    document.querySelectorAll('.tooltip-icon[data-tooltip]').forEach((icon) => {
      this.listen(icon, 'pointerenter', (e) => showTooltip(icon, icon.dataset.tooltip, e));
      this.listen(icon, 'pointermove',  (e) => showTooltip(icon, icon.dataset.tooltip, e));
      this.listen(icon, 'pointerleave', hideTooltip);
      this.listen(icon, 'focus',        () => showTooltip(icon, icon.dataset.tooltip));
      this.listen(icon, 'blur',         hideTooltip);
    });
  }

  async loadBaseline() {
    // syncFromChain() falls back to syncFromMock() internally on any RPC failure.
    if (mockDataManager.isLiveMode && mockDataManager.isLiveMode()) {
      await this.syncFromChain();
    } else {
      this.syncFromMock();
    }
  }

  applyScenario(name) {
    // P4: All presets now specify per-market util + margin ppm.
    // Values chosen to tell the actual network story per scenario:
    //
    //   early   — oracle ramp-up: energy lags badly (42%), ad below threshold (margins < gate)
    //             most markets FAIL gate until streak builds. This is the honest early-net view.
    //   growth  — all markets crossing gate threshold, energy catching up (oracle adoption)
    //             streak building toward REQUIRED_STREAK; ad starting to stabilize
    //   mainnet — all markets well above gate, healthy spread; energy oracle mature
    //             20+ epoch streak; block reward near governance target
    //   stress  — ad market compression (margins near floor), energy spike + oracle lag,
    //             compute oversupply (util high but margin compressed by provider competition)
    //             streak broken: gate NOT READY despite high utilization
    //
    // baselineMiners per scenario reflects realistic decentralization growth:
    //   early: 10 → growth: 30 → mainnet: 50 (as noted in the P8 audit)
    const presets = {
      early: {
        txCountRatio:    0.85,
        txVolumeRatio:   0.95,
        marketUtil:      0.45,   // legacy field; computeOutputs re-derives avg from per-market
        uniqueMiners:    18,
        baselineMiners:  10,     // early network: small baseline
        emission:        2_200_000,
        targetInflationBps: 700,
        gateStreak: 4,
        // utilization: energy lagging (oracle bootstrapping), storage/compute modest
        storageUtilPpm: 480_000,   // 48% — storage providers still onboarding
        computeUtilPpm: 510_000,   // 51% — compute demand below break-even incentive
        energyUtilPpm:  250_000,   // 25% — oracle barely active, most readings rejected
        adUtilPpm:      380_000,   // 38% — ad cohorts not built yet
        // margins: all below or near gate floor (10%) — this is why early gate is NOT READY
        storageMarginPpm:  85_000,   // 8.5% — FAIL (< 100k gate threshold)
        computeMarginPpm:  78_000,   // 7.8% — FAIL
        energyMarginPpm:   45_000,   // 4.5% — FAIL (oracle losses on stale credits)
        adMarginPpm:       92_000,   // 9.2% — FAIL (near-threshold but not there)
      },
      growth: {
        txCountRatio:    1.25,
        txVolumeRatio:   1.35,
        marketUtil:      0.68,
        uniqueMiners:    42,
        baselineMiners:  30,     // growth: network reaching early-mainnet miner count
        emission:        6_500_000,
        targetInflationBps: 500,
        gateStreak: 12,
        // utilization: all markets above gate minimum, energy catching up
        storageUtilPpm:  650_000,   // 65% — PASS util gate
        computeUtilPpm:  695_000,   // 69.5% — PASS
        energyUtilPpm:   615_000,   // 61.5% — PASS (oracle adoption accelerating)
        adUtilPpm:       730_000,   // 73% — PASS (cohort quality improving)
        // margins: all crossing threshold — streak building
        storageMarginPpm:  115_000,   // 11.5% — PASS
        computeMarginPpm:  130_000,   // 13.0% — PASS
        energyMarginPpm:   105_000,   // 10.5% — PASS (barely)
        adMarginPpm:       125_000,   // 12.5% — PASS
      },
      mainnet: {
        txCountRatio:    1.45,
        txVolumeRatio:   1.55,
        marketUtil:      0.74,
        uniqueMiners:    64,
        baselineMiners:  50,     // mainnet: mature validator set
        emission:        9_000_000,
        targetInflationBps: 500,
        gateStreak: 21,
        // utilization: mature network, well above gate minimums with healthy spread
        storageUtilPpm:  745_000,   // 74.5%
        computeUtilPpm:  760_000,   // 76%
        energyUtilPpm:   720_000,   // 72% — energy oracle fully operational
        adUtilPpm:       810_000,   // 81% — ad market prime time
        // margins: healthy and stable above floor; providers profitable
        storageMarginPpm:  155_000,   // 15.5%
        computeMarginPpm:  170_000,   // 17%
        energyMarginPpm:   145_000,   // 14.5%
        adMarginPpm:       195_000,   // 19.5% — premium on ad quality
      },
      stress: {
        txCountRatio:    1.10,
        txVolumeRatio:   1.80,
        marketUtil:      0.92,
        uniqueMiners:    32,
        baselineMiners:  50,     // stress uses mainnet baseline; churn hits harder
        emission:        7_500_000,
        targetInflationBps: 500,
        gateStreak: 2,
        // EMA: 100 epochs in — partially settled. txVolumeRatio=1.80 at N=100:
        // decay=(0.95)^100≈0.006 → baseline≈0.994×1.80=1.79 → effective≈1.006
        // Volume spike nearly absorbed — stress shows in margin compression, not tx ratio.
        emaAlphaPpm:    50_000, // 5%
        baselineEpochs:    100, // 100 epochs: mid-settled, stress hits margins not activity
        // utilization: high demand but oracle lag + validator churn is breaking margins
        storageUtilPpm:  840_000,   // 84% — high demand spiking
        computeUtilPpm:  910_000,   // 91% — near saturation
        energyUtilPpm:   620_000,   // 62% — oracle timeout surge causing drops
        adUtilPpm:       750_000,   // 75% — volume up but quality signals degrading
        // margins: stress scenario: compute near-monopoly + ad race-to-bottom + energy slashing
        storageMarginPpm:  105_000,   // 10.5% — barely PASS but streak just broke
        computeMarginPpm:   55_000,   // 5.5%  — FAIL (provider competition oversupply)
        energyMarginPpm:    40_000,   // 4.0%  — FAIL (slashing from oracle timeouts)
        adMarginPpm:        72_000,   // 7.2%  — FAIL (bid floor collapse)
      },
      genesis: {
        baselineEpochs: 0,
        emaAlphaPpm: 50_000,
        txCountRatio: 0.85,
        txVolumeRatio: 0.90,
        uniqueMiners: 12,
        emission: 150_000,
        // Genesis: low utilization across the board
        storageUtilPpm: 300_000, computeUtilPpm: 300_000, energyUtilPpm: 100_000, adUtilPpm: 200_000,
        // Genesis: margins failing
        storageMarginPpm: 90_000, computeMarginPpm: 90_000, energyMarginPpm: 90_000, adMarginPpm: 90_000,
      },
      mature: {
        baselineEpochs: 600, // Mature baseline
        emaAlphaPpm: 50_000,
        txCountRatio: 1.05,
        txVolumeRatio: 1.10,
        uniqueMiners: 45,
        emission: 12_000_000,
        // Mature: healthy utilization
        storageUtilPpm: 750_000, computeUtilPpm: 750_000, energyUtilPpm: 750_000, adUtilPpm: 750_000,
        // Mature: healthy margins
        storageMarginPpm: 150_000, computeMarginPpm: 150_000, energyMarginPpm: 150_000, adMarginPpm: 150_000,
        gateStreak: 25,
      },
      'gate-pass': {
        gateStreak: 10,
        windowSecs: 240,
        // All margins > 100k
        storageMarginPpm: 120_000, computeMarginPpm: 120_000, energyMarginPpm: 120_000, adMarginPpm: 120_000,
      },
      'gate-fail': {
        gateStreak: 10,
        windowSecs: 240,
        // Storage margin < 100k
        storageMarginPpm: 95_000,
        computeMarginPpm: 120_000, energyMarginPpm: 120_000, adMarginPpm: 120_000,
      },
    };
    this.inputs = { ...this.inputs, ...(presets[name] || {}) };
    this.refreshControls();
    this.updateOutputs();
  }

  // ── P4: Build per-market array for evaluateGates() and avg util for computeIssuance() ───────
  //
  // The Rust economics_prev_market_metrics is an ordered array [storage, compute, energy, ad].
  // This helper constructs the same shape from the 4+4 slider inputs.
  // Called in computeOutputs() and updateOutputs().
  _buildMarkets() {
    return [
      { name: 'storage', utilizationPpm: this.inputs.storageUtilPpm,  providerMarginPpm: this.inputs.storageMarginPpm },
      { name: 'compute', utilizationPpm: this.inputs.computeUtilPpm,  providerMarginPpm: this.inputs.computeMarginPpm },
      { name: 'energy',  utilizationPpm: this.inputs.energyUtilPpm,   providerMarginPpm: this.inputs.energyMarginPpm  },
      { name: 'ad',      utilizationPpm: this.inputs.adUtilPpm,       providerMarginPpm: this.inputs.adMarginPpm      },
    ];
  }

  // ── P4: Avg utilization across all 4 markets as decimal (0.0–0.95) ─────────────────────
  //
  // Used as the marketUtil input to computeIssuance().
  // The activity multiplier formula: cbrt(txCountRatio * txVolumeRatio * (1 + marketUtil))
  // marketUtil = avg_utilization_decimal so the (1 + marketUtil) term stays bounded near [1.0, 1.95].
  _avgUtilDecimal() {
    const m = this._buildMarkets();
    return m.reduce((sum, mkt) => sum + mkt.utilizationPpm, 0) / m.length / 1_000_000;
  }

  // ── P8: Pin / unpin actions ──────────────────────────────────────────────────────────────────

  _pin() {
    this._pinned = {
      label:    this._pinLabel(),
      inputs:   this._cloneInputs(this.inputs),
      pinnedAt: Date.now(),
    };
    this.updateOutputs();
  }

  _unpin() {
    this._pinned = null;
    this.updateOutputs();
  }

  _pinLabel() {
    // Short timestamp that fits in the pill without truncation.
    const now = new Date();
    return `Pinned ${now.toLocaleTimeString()}`;
  }

  // Deep-copy of inputs. All values are primitives/numbers so JSON roundtrip is safe
  // and won't carry stale DOM references. structuredClone is preferred on modern browsers.
  _cloneInputs(inp) {
    if (typeof structuredClone === 'function') return structuredClone(inp);
    return JSON.parse(JSON.stringify(inp));
  }

  // Derive avg utilization decimal from an arbitrary inputs object (stateless — no this.inputs).
  // Mirrors _avgUtilDecimal() but accepts any snapshot so the pinned scenario can be re-derived
  // on every updateOutputs() call without touching current slider state.
  _avgUtilDecimalFromInputs(inp) {
    const total =
      (inp.storageUtilPpm ?? 0) +
      (inp.computeUtilPpm ?? 0) +
      (inp.energyUtilPpm  ?? 0) +
      (inp.adUtilPpm      ?? 0);
    return (total / 4) / 1_000_000;
  }

  // Compute issuance outputs for an arbitrary inputs object.
  // Used by _renderPinnedDelta() to get pinned blockReward/inflationBps without
  // mutating this.inputs. Pure function — safe to call on every updateOutputs() tick.
  _computeOutputsForInputs(inp) {
    const avgUtil = this._avgUtilDecimalFromInputs(inp);
    return computeIssuance({ ...inp, marketUtil: avgUtil });
  }

  // ── P8: Delta column renderer ────────────────────────────────────────────────────────────────
  //
  // Called at the end of every updateOutputs() to keep badge + delta rows in sync.
  // Receives `o` — the already-computed outputs from this.computeOutputs() so we never
  // double-compute the current scenario. Pinned outputs are derived once per call via
  // _computeOutputsForInputs(this._pinned.inputs).
  //
  // DOM targets:
  //   #econlab-pinned-badge    — timestamped pill (visible iff pinned)
  //   #econlab-pin             — hidden while pinned (replaced by unpin button)
  //   #econlab-unpin           — visible while pinned
  //   #reward-delta            — Δ blockReward text
  //   #annual-issuance-delta   — Δ annualIssuance text
  //   #inflation-pinned-delta  — Δ inflationBps text
  _renderPinnedDelta(o) {
    const pinnedBadge = document.getElementById('econlab-pinned-badge');
    const pinBtn      = document.getElementById('econlab-pin');
    const unpinBtn    = document.getElementById('econlab-unpin');
    const rewardDel   = document.getElementById('reward-delta');
    const annDel      = document.getElementById('annual-issuance-delta');
    const inflDel     = document.getElementById('inflation-pinned-delta');

    if (!this._pinned?.inputs) {
      // No pin — hide all delta UI
      if (pinnedBadge) pinnedBadge.style.display = 'none';
      if (pinBtn)      pinBtn.style.display       = '';
      if (unpinBtn)    unpinBtn.style.display      = 'none';
      if (rewardDel)   rewardDel.style.display     = 'none';
      if (annDel)      annDel.style.display         = 'none';
      if (inflDel)     inflDel.style.display        = 'none';
      return;
    }

    // Pin is active — show badge + unpin, hide pin button
    const sig8 = (inputs) => {
      const stable = (v) => {
        if (v === null) return 'null';
        const t = typeof v;
        if (t === 'number') return Number.isFinite(v) ? String(v) : '0';
        if (t === 'string') return JSON.stringify(v);
        if (t === 'boolean') return v ? 'true' : 'false';
        if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
        if (t === 'object') {
          const keys = Object.keys(v).sort();
          return `{${keys.map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
        }
        return JSON.stringify(String(v));
      };
      const s = stable(inputs);
      let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193); // FNV prime
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    };

    const sig = sig8(this._pinned.inputs);
    if (pinnedBadge) {
      pinnedBadge.style.display = 'inline-flex';
      pinnedBadge.textContent = `Pinned: ${this._pinned.label} · ${sig}`;
    }
    if (pinBtn)      pinBtn.style.display   = 'none';
    if (unpinBtn)    unpinBtn.style.display = '';

    // Recompute pinned outputs from stored inputs (never stale — engine is pure)
    const p = this._computeOutputsForInputs(this._pinned.inputs);

    const dReward = o.blockReward    - p.blockReward;
    const dAnn    = o.annualIssuance - p.annualIssuance;
    const dInfl   = o.inflationBps   - p.inflationBps;

    // Direction coloring:
    //   blockReward / annualIssuance: green = higher (more miner reward)
    //   inflationBps: green = lower (less inflation) → invert color logic
    const col     = (x) => x === 0 ? 'var(--muted)' : x > 0 ? 'var(--success, #4ade80)' : 'var(--danger, #f45b69)';
    const colInv  = (x) => col(-x);
    const sf      = (x, d) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
    const si      = (x) => `${x >= 0 ? '+' : '-'}${Math.round(Math.abs(x)).toLocaleString()}`;

    if (rewardDel) {
      rewardDel.style.display = 'block';
      rewardDel.style.color   = col(dReward);
      rewardDel.textContent   = `Δ vs pinned: ${sf(dReward, 4)} BLOCK`;
    }
    if (annDel) {
      annDel.style.display = 'block';
      annDel.style.color   = col(dAnn);
      annDel.textContent   = `Δ vs pinned: ${si(dAnn)} BLOCK/yr`;
    }
    if (inflDel) {
      inflDel.style.display = 'block';
      inflDel.style.color   = colInv(dInfl);
      inflDel.textContent   = `Δ vs pinned: ${sf(dInfl, 0)} bps`;
    }
  }

  // ── EMA preview renderer ──────────────────────────────────────────────────────────────────
  // Updates:
  //   - #activity-breakdown  (raw vs effective ratios when EMA active)
  //   - #ema-preview         (decomposition: raw → baseline → effective)
  _renderEmaPreview(o) {
    // Overwrite activity-breakdown with EMA-aware text (safe even if older call already ran).
    const hasEma = !!(o && o.ema && typeof o.ema.txCountBaseline === 'number');

    const rawC = typeof this.inputs.txCountRatio === 'number' ? this.inputs.txCountRatio : 0;
    const rawV = typeof this.inputs.txVolumeRatio === 'number' ? this.inputs.txVolumeRatio : 0;
    const effC = typeof o.effectiveTxCountRatio === 'number' ? o.effectiveTxCountRatio : rawC;
    const effV = typeof o.effectiveTxVolumeRatio === 'number' ? o.effectiveTxVolumeRatio : rawV;

    const txCLabel = hasEma ? `${rawC.toFixed(2)}→${effC.toFixed(3)}` : rawC.toFixed(2);
    const txVLabel = hasEma ? `${rawV.toFixed(2)}→${effV.toFixed(3)}` : rawV.toFixed(2);

    // avg util is already derived in computeOutputs() and returned as o.avgUtil
    const avgUtil = typeof o.avgUtil === 'number' ? o.avgUtil : this._avgUtilDecimal();

    this.setText(
      'activity-breakdown',
      `cbrt(${txCLabel} × ${txVLabel} × ${(1 + avgUtil).toFixed(2)}) · avg_util=${(avgUtil * 100).toFixed(1)}%` +
      (hasEma ? ` · EMA α=${(o.ema.alpha * 100).toFixed(1)}% N=${o.ema.n}ep` : '') +
      ` · clamp[${CONSTANTS.ACTIVITY_MIN_PPM / 1_000_000}×, ${CONSTANTS.ACTIVITY_MAX_PPM / 1_000_000}×]`,
    );

    const box = document.getElementById('ema-preview');
    if (!box) return;

    if (!hasEma) {
      box.innerHTML = '<span style="color:var(--muted-dim)">EMA disabled (emaAlphaPpm=0)</span>';
      return;
    }

    const e = o.ema;
    box.innerHTML = [
      `<b style="color:var(--text)">EMA decomposition</b>`,
      `raw txCount:  ${rawC.toFixed(3)}  →  baseline: ${e.txCountBaseline.toFixed(3)}  →  effective: <b style="color:#00ff88">${effC.toFixed(3)}</b>`,
      `raw txVolume: ${rawV.toFixed(3)}  →  baseline: ${e.txVolumeBaseline.toFixed(3)}  →  effective: <b style="color:#00ff88">${effV.toFixed(3)}</b>`,
      `α=${(e.alpha * 100).toFixed(1)}%  N=${e.n} epochs  decay=(1-α)^N=${e.decay.toFixed(4)}`,
      `<span style="color:var(--muted-dim)">baseline = seed×decay + observed×(1-decay)</span>`,
    ].join('<br>');
  }

  // ── Ad Market Quality renderer (Q_cohort) ──────────────────────────────────────────────────
  // Updates the #adq-preview panel inside the Ad Market Quality details block.
  _renderAdQuality() {
    const box = document.getElementById('adq-preview');
    if (!box) return;

    const ppm = (v) => (typeof v === 'number' ? v : 0);

    const F = ppm(this.inputs.adFreshnessPpm) / 1_000_000;
    const P = ppm(this.inputs.adPrivacyPpm)   / 1_000_000;
    const R = ppm(this.inputs.adReadinessPpm) / 1_000_000;

    const floor = ppm(this.inputs.adQFloorPpm) / 1_000_000;
    const ceil  = ppm(this.inputs.adQCeilPpm)  / 1_000_000;

    const qRaw   = Math.cbrt(Math.max(0, F) * Math.max(0, P) * Math.max(0, R));
    const qCohort = Math.min(Math.max(qRaw, Math.min(floor, ceil)), Math.max(floor, ceil));

    const baseBid   = typeof this.inputs.adBaseBid === 'number' ? this.inputs.adBaseBid : 0;
    const qCreative = typeof this.inputs.adCreativeQ === 'number' ? this.inputs.adCreativeQ : 1;
    const effectiveBid = baseBid * qCreative * qCohort;

    box.innerHTML = [
      `<b style="color:var(--text)">Q_cohort</b> = clamp(cbrt(F×P×R), floor, ceil)`,
      `F=${F.toFixed(3)}  P=${P.toFixed(3)}  R=${R.toFixed(3)}  →  raw=${qRaw.toFixed(3)}  →  <b style="color:#00aaff">Q=${qCohort.toFixed(3)}×</b>`,
      `effective_bid = base(${baseBid.toFixed(3)} BLOCK) × Q_creative(${qCreative.toFixed(3)}×) × Q_cohort(${qCohort.toFixed(3)}×)`,
      `<b style="color:#00ff88">effective_bid = ${effectiveBid.toFixed(4)} BLOCK</b>`,
      this._simulated
        ? `<span style="color:var(--muted);opacity:0.6;font-size:10px">↑ F/P/R from sliders — click Sync Live for chain data</span>`
        : `<span style="color:var(--muted);opacity:0.6;font-size:10px">↑ F/P/R synced from ad_market.readiness</span>`,
    ].join('<br>');

    // Diagnostics: raw snapshot fields from ad_market.readiness
    const diag = document.getElementById('ad-quality-diagnostics');
    if (diag) {
      if (this._adReadinessRaw) {
        const r = this._adReadinessRaw;
        const utilPct    = r.utilization_summary?.mean_ppm != null
          ? (r.utilization_summary.mean_ppm / 10_000).toFixed(2) + '%' : 'n/a';
        const privPct    = r.segment_readiness?.privacy_budget?.remaining_ppm != null
          ? (r.segment_readiness.privacy_budget.remaining_ppm / 10_000).toFixed(2) + '%' : 'n/a';
        diag.innerHTML = `
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;font-size:11px;color:var(--text-dim);user-select:none;">
              Raw Readiness Diagnostics (${this._simulated ? 'mock' : 'live'})
            </summary>
            <pre style="font-size:10px;color:var(--muted);background:rgba(0,0,0,0.22);padding:6px 8px;border-radius:4px;overflow-x:auto;margin-top:4px;line-height:1.7;">Ready: ${r.ready}   Streak: ${r.ready_streak_windows ?? 'n/a'}
Util Mean:      ${utilPct}
Privacy Budget: ${privPct}
Host Count:     ${r.host_count ?? 'n/a'}
Unique Viewers: ${r.unique_viewers ?? 'n/a'}</pre>
          </details>`;
      } else {
        diag.innerHTML = `<p style="font-size:10px;color:var(--muted);margin-top:6px;opacity:0.5;">Sync Live to populate raw diagnostics.</p>`;
      }
    }
  }

  refreshControls() {
    document.querySelectorAll('.stepper-input').forEach((inp) => {
      const key = inp.dataset.key;
      if (!(key in this.inputs)) return;
      inp.value = String(this.inputs[key]);
      const label = document.getElementById(`${key}-value`);
      if (label) label.textContent = this.displayValue(key, this.inputs[key]);
    });
  }

  // ── Live chain sync: replaces syncFromLive() + syncFromGovernor() + transformLive() ───────────
  //
  // syncFromLive() called 'economics.replay' which does not exist in any RPC namespace
  // (docs/apis_and_tooling.md lists no economics.* namespace at all).
  // syncFromGovernor() was correct but only pulled gate/margin — no block height or tx ratios.
  //
  // Real data sources (all verified in apis_and_tooling.md RPC table):
  //   1. governor.status        → economics_prev_market_metrics (util/margin ppm per market),
  //                                gate.economics.{enter_streak,streak}, active_gates
  //   2. consensus.block_height → current height for emission approximation
  //   3. receipt.audit          → best-effort scan for latest EpochEconomicsReceipt:
  //      total_emission, epoch_tx_count, epoch_tx_volume_block, unique_miners,
  //      baseline_tx_count, baseline_tx_volume_block, baseline_miners
  //      (silently skipped if node hasn't activated this endpoint yet)
  //
  // Falls back to syncFromMock() on any primary failure so UI always has a state.
  async syncFromChain() {
    const useLive = features.isEnabled('economics_live');
    if (!useLive) {
      console.warn('[EconomicsSimulator] economics_live flag disabled — using mock baseline');
      this.syncFromMock();
      return;
    }

    try {
      // Delegate to EconomicsEngine.fetchLiveInputs which handles:
      //   1. governor.status + consensus.block_height (parallel)
      //   2. receipt.audit pass 1: filtered by market='epoch_economics'
      //   3. receipt.audit pass 2: unfiltered limit=64 (fallback for older node builds)
      // All three silent-fail individually — epochReceipt may be null on pre-receipts nodes.
      const { governorStatus, blockHeight, epochReceipt,
              adFreshnessPpm, adPrivacyPpm, adReadinessPpm, adReadinessRaw } = await fetchLiveInputs(this.rpc);

      // Map chain response onto flat simulator inputs
      const mapped = this._mapChainToInputs(governorStatus, { height: blockHeight }, epochReceipt);
      this.inputs     = { ...this.inputs, ...mapped };

      // ── Ad Market Quality: map F/P/R from ad_market.readiness ─────────────────────────
      // Null-guard each: if ad readiness RPC failed, preserve the existing slider value.
      // Same pattern as per-market ppm fields above — missing data never zeros a slider.
      if (adFreshnessPpm != null) this.inputs.adFreshnessPpm = adFreshnessPpm;
      if (adPrivacyPpm   != null) this.inputs.adPrivacyPpm   = adPrivacyPpm;
      if (adReadinessPpm != null) this.inputs.adReadinessPpm = adReadinessPpm;
      if (adReadinessRaw != null) this._adReadinessRaw = adReadinessRaw;

      this._simulated = false; // success — live chain data

      this.refreshControls();
      this.updateOutputs();
      const badge = document.getElementById('econlab-sim-badge');
      if (badge) badge.style.display = 'none';
    } catch (err) {
      console.warn('[EconomicsSimulator] Chain sync failed, falling back to mock:', err?.message);
      this.syncFromMock();
    }
  }

  // Pure mapping helper: governor.status + block height + optional EpochEconomicsReceipt
  // → flat inputs object. No RPC calls. Called only from syncFromChain().
  _mapChainToInputs(governorStatus, blockHeightResp, epochReceipt) {
    // ── governor.status: economics_prev_market_metrics ──
    // Shape: object {utilization_ppm, provider_margin_ppm} or array of per-market objects.
    // The governor.status RPC returns: "economics_prev_market_metrics array (ppm values per market)"
    // (docs/apis_and_tooling.md). Handle both flat-object and array forms.
    // ── P4: Map economics_prev_market_metrics array → 8 per-market named fields ──────────────────
    // governor.status returns economics_prev_market_metrics as an ordered array:
    //   [0] = storage, [1] = compute, [2] = energy, [3] = ad
    // (confirmed in apis_and_tooling.md + economics_and_governance.md telemetry section)
    //
    // 3 shapes handled:
    //   Array (canonical P4): index-keyed, name field may or may not be present
    //   Flat object (legacy):  single utilization_ppm / provider_margin_ppm — broadcast to all 4
    //   Absent (pre-governor): keep current slider values unchanged (perMarketOverrides stays {})
    const raw = governorStatus?.economics_prev_market_metrics
             || governorStatus?.metrics?.economics_prev_market_metrics;

    // Input key arrays — index matches Rust array order [storage, compute, energy, ad]
    const MARKET_UTIL_KEYS   = ['storageUtilPpm',   'computeUtilPpm',   'energyUtilPpm',   'adUtilPpm'];
    const MARKET_MARGIN_KEYS = ['storageMarginPpm', 'computeMarginPpm', 'energyMarginPpm', 'adMarginPpm'];

    const perMarketOverrides = {};
    if (Array.isArray(raw) && raw.length > 0) {
      // Array form: up to 4 entries — any missing index preserves current slider value
      raw.forEach((m, i) => {
        if (i < 4) {
          if (m.utilization_ppm    !== undefined) perMarketOverrides[MARKET_UTIL_KEYS[i]]   = m.utilization_ppm;
          if (m.provider_margin_ppm !== undefined) perMarketOverrides[MARKET_MARGIN_KEYS[i]] = m.provider_margin_ppm;
        }
      });
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      // Legacy flat-object: broadcast single value to all 4 markets
      const u = raw.utilization_ppm;
      const p = raw.provider_margin_ppm;
      if (u !== undefined) MARKET_UTIL_KEYS.forEach(k   => { perMarketOverrides[k] = u; });
      if (p !== undefined) MARKET_MARGIN_KEYS.forEach(k => { perMarketOverrides[k] = p; });
    }

    // ── governor.status: per-market gate streaks ──
    // Node/mock exports per-market gates: storage|compute|energy|ad.
    // Simulator expects a single gateStreak slider; use the bottleneck streak.
    const gates = governorStatus?.gates || {};
    const streaks = ['storage', 'compute', 'energy', 'ad']
      .map((m) => gates[m]?.enter_streak ?? gates[m]?.streak)
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
    
    const gateStreak = streaks.length > 0 ? Math.min(...streaks) : this.inputs.gateStreak;

    // ── EpochEconomicsReceipt (best-effort, may be null) ──
    // Full schema documented in economics_and_governance.md:
    //   epoch, start_height, end_height, baseline_tx_count, baseline_tx_volume_block,
    //   baseline_miners, epoch_tx_count, epoch_tx_volume_block, unique_miners,
    //   market_metrics_ppm, prev_annual_issuance_block, next_block_reward_per_block,
    //   treasury_inflow_block, total_emission, governance_params_hash
    const baselineTxCount = epochReceipt?.baseline_tx_count       ?? null;
    const epochTxCount    = epochReceipt?.epoch_tx_count           ?? null;
    const baselineTxVol   = epochReceipt?.baseline_tx_volume_block ?? null;
    const epochTxVol      = epochReceipt?.epoch_tx_volume_block    ?? null;
    const uniqueMiners    = epochReceipt?.unique_miners             ?? null;
    const baselineMiners  = epochReceipt?.baseline_miners           ?? null;
    const totalEmission   = epochReceipt?.total_emission            ?? null;

    // Ratios: only compute when both baseline and epoch are present and baseline > 0
    const txCountRatio = (baselineTxCount > 0 && epochTxCount !== null)
      ? epochTxCount / baselineTxCount
      : this.inputs.txCountRatio;
    const txVolumeRatio = (baselineTxVol > 0 && epochTxVol !== null)
      ? epochTxVol / baselineTxVol
      : this.inputs.txVolumeRatio;

    // Emission: prefer receipt total_emission (authoritative) over height approximation.
    // Height approximation = baseReward × height, a rough upper-bound that ignores
    // decay and activity — used only for the "you are here" cursor in P5 charts.
    const baseReward     = (0.9 * this.inputs.maxSupply) / CONSTANTS.EXPECTED_TOTAL_BLOCKS;
    const approxEmission = totalEmission
      ?? Math.min((blockHeightResp?.height ?? 0) * baseReward, this.inputs.maxSupply * 0.99);

    return {
      txCountRatio,
      txVolumeRatio,
      // marketUtil: legacy field preserved for scenario compat; computeOutputs uses _avgUtilDecimal()
      uniqueMiners:   uniqueMiners   ?? this.inputs.uniqueMiners,
      baselineMiners: baselineMiners ?? this.inputs.baselineMiners,
      emission:       approxEmission,
      // targetInflationBps: governance param, not in governor.status — preserve current value
      // P4: fan out governor.status per-market metrics into 8 named slider fields
      ...perMarketOverrides,
      gateStreak,
    };
  }

  syncFromMock() {
    const mock = mockDataManager.get ? mockDataManager.get('issuance') : null;
    if (!mock) return;
    // Resolve mock market metrics from the mock object first.
    // Only fall back to testnet defaults if the mock truly provides nothing.
    // -- P4: Resolve per-market ppm from mock data (array=per-market, flat=broadcast, absent=keep)
    // Mock shape: economics_prev_market_metrics may be an array (P4) or flat object (legacy).
    // Falls back to CONSTANTS defaults if mock provides nothing for a given market.
    const rawMock = mock.economics_prev_market_metrics ?? mock.market_metrics;
    const _mockUtil = (idx, key) => {
      if (Array.isArray(rawMock) && rawMock[idx]?.utilization_ppm !== undefined)
        return rawMock[idx].utilization_ppm;
      if (rawMock && !Array.isArray(rawMock) && rawMock.utilization_ppm !== undefined)
        return rawMock.utilization_ppm;
      return CONSTANTS[key]; // e.g. CONSTANTS.STORAGE_UTIL_PPM_DEFAULT
    };
    const _mockMargin = (idx, key) => {
      if (Array.isArray(rawMock) && rawMock[idx]?.provider_margin_ppm !== undefined)
        return rawMock[idx].provider_margin_ppm;
      if (rawMock && !Array.isArray(rawMock) && rawMock.provider_margin_ppm !== undefined)
        return rawMock.provider_margin_ppm;
      return CONSTANTS[key];
    };
    this.inputs = {
      ...this.inputs,
      txCountRatio:       mock.activity_breakdown?.tx_count_ratio         ?? this.inputs.txCountRatio,
      txVolumeRatio:      mock.activity_breakdown?.tx_volume_ratio        ?? this.inputs.txVolumeRatio,
      marketUtil:         mock.activity_breakdown?.avg_market_utilization ?? this.inputs.marketUtil,
      uniqueMiners:       mock.unique_miners                              ?? this.inputs.uniqueMiners,
      emission:           mock.emission_consumer ?? mock.total_emission   ?? this.inputs.emission,
      targetInflationBps: mock.target_inflation_bps                       ?? this.inputs.targetInflationBps,
      gateStreak:         mock.gate_streak ?? 8,
      // P4: per-market fields — from mock array, broadcast from flat-object, or CONSTANTS default
      storageUtilPpm:   _mockUtil(0,   'STORAGE_UTIL_PPM_DEFAULT'),
      computeUtilPpm:   _mockUtil(1,   'COMPUTE_UTIL_PPM_DEFAULT'),
      energyUtilPpm:    _mockUtil(2,   'ENERGY_UTIL_PPM_DEFAULT'),
      adUtilPpm:        _mockUtil(3,   'AD_UTIL_PPM_DEFAULT'),
      storageMarginPpm: _mockMargin(0, 'STORAGE_MARGIN_PPM_DEFAULT'),
      computeMarginPpm: _mockMargin(1, 'COMPUTE_MARGIN_PPM_DEFAULT'),
      energyMarginPpm:  _mockMargin(2, 'ENERGY_MARGIN_PPM_DEFAULT'),
      adMarginPpm:      _mockMargin(3, 'AD_MARGIN_PPM_DEFAULT'),
    };
    this._simulated = true;
    // P_: Use the actual MockDataManager ad readiness snapshot to stay in sync with RpcMock
    this._adReadinessRaw = mockDataManager.get('adReadiness') || {
      ready: true,
      ready_streak_windows: 8,
      utilization_summary: { mean_ppm: 720000 },
      segment_readiness: { privacy_budget: { remaining_ppm: 950000 } },
      host_count: 42,
      unique_viewers: 1337
    };
    const badge = document.getElementById('econlab-sim-badge');
    if (badge) badge.style.display = 'inline-flex';
    this.refreshControls();
    this.updateOutputs();
  }

  computeOutputs() {
    // ── P4: Derive avg market util from 4 per-market sliders ────────────────────────────────────
    // _avgUtilDecimal() = mean(storageUtilPpm, computeUtilPpm, energyUtilPpm, adUtilPpm) / 1e6
    // This replaces the old single `marketUtil` slider as input to the activity multiplier.
    // this.inputs.marketUtil is kept in state (scenario presets write it) but computeIssuance
    // receives the live-derived avg so the 4 per-market sliders are the actual authority.
    const avgUtil  = this._avgUtilDecimal();
    const markets  = this._buildMarkets();

    // Delegate all formula math to the shared EconomicsEngine.
    // EconomicsEngine is the single source of truth for:
    //   - activityMultiplier (cbrt geometric mean, ppm-clamped)
    //   - decentralization   (integer-sqrt ppm, clamped [0.5, 2.0])
    //   - supplyDecay        (quadratic (remaining/max)^2, floored at 0.05)
    //   - blockReward, annualIssuance, inflationBps, inflationDelta
    const issuance = computeIssuance({ ...this.inputs, marketUtil: avgUtil });
    const gates    = evaluateGates({ ...this.inputs, markets });

    // Gate window: how many governor windows fit in one epoch?
    // At default windowSecs=240, EPOCH_BLOCKS=120 => floor(120/240)=0 => max(1,0)=1
    const windowSecs     = Math.max(this.inputs.windowSecs, 1);
    const requiredStreak = Math.max(1, Math.floor(CONSTANTS.EPOCH_BLOCKS / windowSecs));

    return {
      ...issuance,
      // decentrPpm: integer ppm for bar label — matches governor.status reporting format
      decentrPpm:     Math.round(issuance.decentralization * 1_000_000),
      remainingRatio: Math.max(0, (this.inputs.maxSupply - this.inputs.emission) / this.inputs.maxSupply),
      avgUtil,
      // P4: full per-market gate result object + top-level status
      gates,
      gateReady:      gates.status === 'READY',
      requiredStreak,
      minUtilPct:     CONSTANTS.GATE_UTILIZATION_MIN * 100,
      maxUtilPct:     95.0,
      minMarginPct:   CONSTANTS.GATE_MARGIN_MIN * 100,
      maxMarginPct:   300.0,
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
    // Normalize against ACTIVITY_MAX_PPM ceiling (1.8×), not the prior hardcoded 1.8 magic number
    this.setBar('activity-bar', o.activityMultiplier / (CONSTANTS.ACTIVITY_MAX_PPM / 1_000_000));
    // P4: show avg_util derived from 4 per-market sliders, not the stale legacy marketUtil field
    this.setText(
      'activity-breakdown',
      `cbrt(${this.inputs.txCountRatio.toFixed(2)} × ${this.inputs.txVolumeRatio.toFixed(2)} × ${(1 + o.avgUtil).toFixed(2)}) · avg_util=${(o.avgUtil * 100).toFixed(1)}% · clamp[${CONSTANTS.ACTIVITY_MIN_PPM / 1_000_000}×, ${CONSTANTS.ACTIVITY_MAX_PPM / 1_000_000}×]`,
    );

    // Show both decimal and raw ppm so the display matches what governor.status reports
    this.setText('decentr', `${o.decentralization.toFixed(3)} (${o.decentrPpm.toLocaleString()} ppm)`);
    // Normalize against DECENTR_MAX_PPM ceiling (2.0×). Prior code used magic /2.5 which was wrong.
    this.setBar('decentr-bar', o.decentralization / (CONSTANTS.DECENTR_MAX_PPM / 1_000_000));

    this.setText('decay', o.supplyDecay.toFixed(3));
    this.setBar('decay-bar', o.supplyDecay);

    // ── P6: Multi-gate Matrix Display ─────────────────────────────────────────────────────────────
    // Constructs the 5-gate grid (Economics + 4 Markets) to show detailed PASS/FAIL states.
    //
    // 1. Construct the 5-element markets array (Economics = aggregate/global gate)
    const markets = [
      {
        name: 'economics',
        // P8 fix: use o.avgUtil (derived by _avgUtilDecimal from the 4 per-market sliders)
        // NOT this.inputs.marketUtil (legacy field). The economics aggregate gate card now
        // shows the same utilization value that computeIssuance() actually consumed.
        utilizationPpm: o.avgUtil * 1_000_000,
        // derived margin: average of the 4 physical markets represents system-wide provider health
        providerMarginPpm: (this.inputs.storageMarginPpm + this.inputs.computeMarginPpm + this.inputs.energyMarginPpm + this.inputs.adMarginPpm) / 4,
      },
      { name: 'storage', utilizationPpm: this.inputs.storageUtilPpm, providerMarginPpm: this.inputs.storageMarginPpm },
      { name: 'compute', utilizationPpm: this.inputs.computeUtilPpm, providerMarginPpm: this.inputs.computeMarginPpm },
      { name: 'energy',  utilizationPpm: this.inputs.energyUtilPpm,  providerMarginPpm: this.inputs.energyMarginPpm },
      { name: 'ad',      utilizationPpm: this.inputs.adUtilPpm,      providerMarginPpm: this.inputs.adMarginPpm },
    ];

    // 2. Evaluate
    const gateRes = evaluateGates({ ...this.inputs, markets });
    
    // 3. Update Header Badges
    const overallBadge = document.getElementById('gate-overall-badge');
    if (overallBadge) {
      const ready = gateRes.status === 'READY';
      overallBadge.textContent = ready ? 'READY' : 'NOT READY';
      overallBadge.style.background = ready ? 'rgba(74, 222, 128, 0.2)' : 'rgba(244, 91, 105, 0.2)';
      overallBadge.style.color      = ready ? '#4ade80' : '#f45b69';
    }

    // Streak status logic
    const epochsToFlip = Math.max(0, gateRes.streak.threshold - gateRes.streak.val);
    let streakNote = '';
    
    if (gateRes.status === 'READY') {
      streakNote = 'Target Met';
    } else if (gateRes.allMarketsPass) {
      streakNote = `${epochsToFlip} epochs to flip`;
    } else {
      streakNote = 'Paused (markets failing)';
    }

    this.setText('gate-streak-val', `${gateRes.streak.val} / ${gateRes.streak.threshold}`);
    const streakEl = document.getElementById('gate-streak-val');
    if (streakEl) {
      streakEl.style.color = gateRes.streak.pass ? 'var(--success)' : 'var(--text)';
      // Append note if element supports it, or just set text content with span
      streakEl.innerHTML = `${gateRes.streak.val} <span style="color:var(--muted); font-size:12px;">/ ${gateRes.streak.threshold}</span> <div style="font-size:11px; color:var(--text-dim); font-weight:400; margin-top:2px;">${streakNote}</div>`;
    }

    // 4. Render Grid Cards
    const grid = document.getElementById('gate-grid');
    if (grid) {
      grid.innerHTML = gateRes.markets.map(m => {
        // Condition checks
        const utilPass   = m.isUtilGood;
        const marginPass = m.isMarginGood;
        const cardPass   = m.pass;
        
        // Colors
        const borderColor = cardPass ? 'var(--success)' : 'var(--border)';
        const opacity     = cardPass ? '1' : '0.7';
        
        // Values
        const utilPct   = (m.util * 100).toFixed(0);
        const marginPct = (m.margin * 100).toFixed(1);
        
        // Thresholds (from evaluateGates details or constants)
        // We know constants: UTIL >= 60%, MARGIN >= 10%
        const UTIL_MIN   = CONSTANTS.GATE_UTILIZATION_MIN * 100;
        const MARGIN_MIN = CONSTANTS.GATE_MARGIN_MIN * 100;

        return `
          <div style="
            background: var(--panel); 
            border: 1px solid ${borderColor}; 
            border-radius: 6px; 
            padding: 10px; 
            opacity: ${opacity};
            display: flex;
            flex-direction: column;
            gap: 8px;
          ">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600; font-size:12px; text-transform:uppercase; color:var(--muted);">${m.name}</span>
              <span style="font-size:12px;">${cardPass ? '✓' : ''}</span>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:4px;">
              <!-- Utilization -->
              <div style="display:flex; justify-content:space-between; font-size:11px;">
                <span style="color:var(--text-dim)">Util</span>
                <span style="color:${utilPass ? 'var(--success)' : 'var(--danger)'}">
                  ${utilPct}% <span style="opacity:0.5; font-size:10px;">/ ${UTIL_MIN}%</span>
                </span>
              </div>
              
              <!-- Margin -->
              <div style="display:flex; justify-content:space-between; font-size:11px;">
                <span style="color:var(--text-dim)">Margin</span>
                <span style="color:${marginPass ? 'var(--success)' : 'var(--danger)'}">
                  ${marginPct}% <span style="opacity:0.5; font-size:10px;">/ ${MARGIN_MIN}%</span>
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }


    // P7: Sensitivity analysis — recompute cheaply on every update (no RPCs)
    // (debounce not required: 6 perturbation recomputes of computeIssuance is sub-millisecond)
    this._renderSensitivity();

    // Coinbase breakdown removed from EconLab UI (was visually out-of-place).

    // P5: render projection charts if canvases are mounted.
    // Called directly from syncFromChain/Mock/applyScenario (not debounced — full sync).
    // Called via _debouncedUpdate() from slider input (150ms debounce).
    this._renderCharts();

    // P_: EMA Baseline preview + activity breakdown (raw → effective)
    // This is a pure DOM write pass — safe to do on every updateOutputs() tick.
    this._renderEmaPreview(o);

    // P_: Ad Market Quality preview (Q_cohort formula)
    this._renderAdQuality();

    // P8: sync delta rows + badge visibility (pure DOM text, no canvas work — always instant)
    this._renderPinnedDelta(o);
  }

  // ── P3: Coinbase decomposition renderer ─────────────────────────────────────────────────
  //
  // Renders a horizontal stacked bar showing how each block reward splits across coinbase buckets.
  // Driven by computeCoinbaseBreakdown() in EconomicsEngine.js — pure formula, zero DOM coupling.
  //
  // Visual encoding (color → economic role):
  //   ■ Green  (miner)    — direct validator incentive, the primary security subsidy
  //   ■ Amber  (treasury) — community fund; disbursement requires governance supermajority
  //   ■ Blue   (storage)  — STORAGE_SUB bucket — incentivizes storage provider participation
  //   ■ Purple (read)     — READ_SUB bucket    — incentivizes bandwidth/relay operators
  //   ■ Orange (compute)  — COMPUTE_SUB bucket — incentivizes compute market providers
  //
  // Conservation identity (economics_and_governance.md):
  //   coinbase_total = miner_payout + treasury_payout + storage_sub + read_sub + compute_sub
  //   Shown as “∑ = X BLOCK ✓” when bd.conserved === true; “⚠” when governance params overflow 100%.
  renderCoinbaseBreakdown(bd) {
    const container = document.getElementById('coinbase-breakdown');
    if (!container) return;

    const pct = (r) => (r * 100).toFixed(1);
    const b4  = (v) => v.toFixed(4);

    // Segment definition: [label, value, ratio, hex color, full hover tooltip]
    // Order mirrors mine_block_with_ts() payout sequence in network_issuance.rs
    const segs = [
      ['Miner',
        bd.minerPayout,  bd.minerRatio,    '#00ff88',
        'miner_payout = blockReward − treasury_cut − storage_sub − read_sub − compute_sub'],
      ['Treasury',
        bd.treasuryCut,  bd.treasuryRatio, '#ffaa00',
        `treasury_payout = floor(reward × treasury_percent / 100) = ${b4(bd.treasuryCut)} BLOCK`],
      ['Storage',
        bd.storageSub,   bd.storageRatio,  '#00aaff',
        `storage_sub = reward × subsidyStorageBps / 10_000 = ${b4(bd.storageSub)} BLOCK`],
      ['Read',
        bd.readSub,      bd.readRatio,     '#aa77ff',
        `read_sub = reward × subsidyReadBps / 10_000 = ${b4(bd.readSub)} BLOCK`],
      ['Compute',
        bd.computeSub,   bd.computeRatio,  '#ff8844',
        `compute_sub = reward × subsidyComputeBps / 10_000 = ${b4(bd.computeSub)} BLOCK`],
    ];

    // Conservation status line — fails only when governance params accidentally sum > 100%
    const okColor  = '#00ff88';
    const warnColor = '#ff4444';
    const conserveColor = bd.conserved ? okColor : warnColor;
    const conserveTip   = bd.conserved
      ? `Conservation holds: ${b4(bd.conservation)} ≈ ${b4(bd.blockReward)} BLOCK`
      : `⚠ Params overflow: sum ${b4(bd.conservation)} > blockReward ${b4(bd.blockReward)} — miner payout clamped to 0`;

    container.innerHTML = `
      <div class="cb-wrap">
        <div class="cb-header">
          <p class="eyebrow" style="margin:0 0 0.5rem">Per-Block Distribution</p>
          <span
            title="${conserveTip}"
            style="font-size:11px;cursor:default;color:${conserveColor};white-space:nowrap;"
          >∑ = ${b4(bd.blockReward)} BLOCK ${bd.conserved ? '✓' : '⚠'}</span>
        </div>
        <div class="cb-bar" role="img" aria-label="Coinbase distribution stacked bar">
          ${segs.map(([label, val, ratio, color, tip]) =>
            ratio > 0
              ? `<div class="cb-seg" style="width:${pct(ratio)}%;background:${color};min-width:3px" title="${tip}: ${b4(val)} BLOCK (${pct(ratio)}%)"></div>`
              : ''
          ).join('')}
        </div>
        <div class="cb-legend">
          ${segs.map(([label, val, ratio, color]) => `
            <div class="cb-legend-row">
              <span class="cb-dot" style="background:${color}"></span>
              <span class="cb-name">${label}</span>
              <span class="cb-val">${b4(val)}</span>
              <span class="cb-pct muted tiny">${pct(ratio)}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }


  _renderSensitivity() {
    const canvas = document.getElementById('sensitivity-chart');
    if (!canvas) return;

    // Computation delegated to EconomicsEngine.computeSensitivity() — no local logic here.
    const rows = computeSensitivity(this.inputs);
    const ctx = canvas.getContext('2d');

    const S = this._chartStyle();

    // DPI-aware sizing
    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || 560;
    const cssH = canvas.offsetHeight || 220;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = cssW;
    const H = cssH;

    ctx.clearRect(0, 0, W, H);

    // Empty-state
    if (!rows || rows.length === 0) {
      ctx.fillStyle = S.value;
      ctx.font = S.font(11);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Sensitivity unavailable (block reward is 0 or invalid).', 12, 12);
      return;
    }

    // Layout
    const PAD_L = 190;  // room for labels
    const PAD_R = 52;   // room for % text
    const PAD_T = 10;
    const PAD_B = 10;

    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    const rowH  = plotH / rows.length;
    const midX  = PAD_L + plotW / 2;

    // Domain: symmetric around 0, padded to nearest 5%, clamped to minimum 10% domain
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.pct)), 0.01);
    const domain = Math.max(10, Math.ceil((maxAbs + 0.001) / 5) * 5); // e.g. 12.3 → 15, 2.1 → 10

    // Grid: center line + ±domain/2 ticks
    ctx.strokeStyle = S.grid;
    ctx.lineWidth = 1;
    
    // center
    ctx.beginPath();
    ctx.moveTo(midX, PAD_T);
    ctx.lineTo(midX, PAD_T + plotH);
    ctx.stroke();

    // ± ticks
    [-domain, -domain/2, domain/2, domain].forEach(v => {
      const x = midX + (v / domain) * (plotW / 2);
      ctx.beginPath();
      ctx.moveTo(x, PAD_T);
      ctx.lineTo(x, PAD_T + plotH);
      ctx.stroke();
    });

    // Axis labels
    ctx.fillStyle = S.tick;
    ctx.font = S.font(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [-domain, -domain/2, 0, domain/2, domain].forEach(v => {
      const x = midX + (v / domain) * (plotW / 2);
      ctx.fillText(`${v}%`, x, PAD_T + plotH + 4);
    });

    // Bars
    rows.forEach((r, i) => {
      const yMid = PAD_T + i * rowH + rowH / 2;
      const barH = Math.max(10, rowH * 0.55);

      // label
      ctx.fillStyle = S.label;
      ctx.font = S.font(11);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.label, 10, yMid);

      // value text
      const pctStr = `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`;
      ctx.fillStyle = S.value;
      ctx.textAlign = 'right';
      ctx.fillText(pctStr, W - 10, yMid);

      // bar geometry
      const clamped = Math.max(-domain, Math.min(domain, r.pct));
      const dx = (clamped / domain) * (plotW / 2);
      const x0 = midX;
      const x1 = midX + dx;
      const left = Math.min(x0, x1);
      const width = Math.abs(x1 - x0);

      // color: green for +, red for -
      const fill = r.pct >= 0 ? 'rgba(74, 222, 128, 0.75)' : 'rgba(244, 91, 105, 0.75)';
      ctx.fillStyle = fill;
      ctx.fillRect(left, yMid - barH/2, Math.max(2, width), barH);

      // outline
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.strokeRect(left, yMid - barH/2, Math.max(2, width), barH);
    });
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

  // ── P5: Debounced update ────────────────────────────────────────────────────────────────────
  //
  // Called by slider 'input' events. Metric cards (text/bars) still update sync via
  // updateOutputs() — this just gates the expensive canvas redraws at 150ms.
  //
  // Why separate from updateOutputs(): the metric card DOM writes are <1ms and must
  // feel instant. The 4 canvas draws are ~5-15ms combined — imperceptible in isolation
  // but visibly janky at 60fps during fast slider drag without debouncing.
  _debouncedUpdate() {
    // Always update text/bar metrics immediately (zero perceived latency)
    this.updateOutputs();

    // Re-arm the chart debounce timer
    if (this._updateTimer !== null) clearTimeout(this._updateTimer);
    this._updateTimer = setTimeout(() => {
      this._updateTimer = null;
      // Charts already rendered inside updateOutputs() above on the last tick.
      // This extra call handles the edge case where the final slider value differs
      // from the value that triggered the last updateOutputs() within the 150ms window.
      this._renderCharts();
    }, 150);
  }

  // ── P5: Render all 4 projection charts ─────────────────────────────────────────────────────
  //
  // Called from updateOutputs() on every full sync (live/mock/scenario) and from the
  // _debouncedUpdate 150ms trailing edge on slider drag.
  //
  // projectEmissionSchedule() takes ~0.3ms for 200 samples. Safe to call synchronously.
  // Canvas renders take ~5ms combined on modern hardware at 560×220px.
  //
  // "You are here" cursor: linear scan to first sample where totalEmitted >= inputs.emission.
  // Rendered as a vertical dashed line + label at that x position on all 4 charts.
  // ── P5 + P8: Render all 4 projection charts ─────────────────────────────────────────────────────────
  //
  // P5: samples emission schedule from current this.inputs and draws 4 canvases.
  // P8: when this._pinned is set, also projects the pinned scenario and passes it
  //     to _renderSingleChart as `overlay` for a dashed comparison line.
  //     Both schedules use NSAMPLES=200 so xOf(i) maps to the same block position
  //     on both lines — no x-axis skew when scenarios have different emission states.
  _chartStyle() {
    const font = (px) => `${px}px Inter, system-ui, sans-serif`;
    return {
      font,
      grid: 'rgba(255,255,255,0.06)',
      tick: 'rgba(255,255,255,0.35)',
      label: 'rgba(255,255,255,0.75)',
      value: 'rgba(255,255,255,0.55)',
    };
  }

  _renderCharts() {
    const canvases = {
      blockReward:    document.getElementById('chart-block-reward'),
      totalEmitted:   document.getElementById('chart-total-emitted'),
      annualIssuance: document.getElementById('chart-annual-issuance'),
      inflationBps:   document.getElementById('chart-inflation-bps'),
    };

    // Guard: charts section may not be mounted yet (e.g. first updateOutputs() call in constructor)
    if (!canvases.blockReward) return;

    const NSAMPLES = 200;
    const schedule  = projectEmissionSchedule(this.inputs, NSAMPLES);

    // Current scenario "you are here" cursor
    const hereIdx   = schedule.findIndex(p => p.totalEmitted >= this.inputs.emission);
    const cursorIdx = hereIdx >= 0 ? hereIdx : schedule.length - 1;

    // P8: pinned scenario overlay (null when no pin — _renderSingleChart skips the overlay branch)
    let pinnedSchedule  = null;
    let pinnedCursorIdx = -1;
    if (this._pinned?.inputs) {
      pinnedSchedule = projectEmissionSchedule(this._pinned.inputs, NSAMPLES);
      const pHere    = pinnedSchedule.findIndex(p => p.totalEmitted >= this._pinned.inputs.emission);
      pinnedCursorIdx = pHere >= 0 ? pHere : pinnedSchedule.length - 1;
    }

    // Render each chart — overlay is null in single-scenario mode, schedule in comparison mode
    this._renderSingleChart(canvases.blockReward,    schedule, 'blockReward',    { label: 'BLOCK/block',  cursorIdx, color: '#00ff88', overlay: pinnedSchedule, overlayCursorIdx: pinnedCursorIdx });
    this._renderSingleChart(canvases.totalEmitted,   schedule, 'totalEmitted',   { label: 'BLOCK minted', cursorIdx, color: '#00aaff', overlay: pinnedSchedule, overlayCursorIdx: pinnedCursorIdx });
    this._renderSingleChart(canvases.annualIssuance, schedule, 'annualIssuance', { label: 'BLOCK/yr',     cursorIdx, color: '#aa77ff', overlay: pinnedSchedule, overlayCursorIdx: pinnedCursorIdx });
    this._renderSingleChart(canvases.inflationBps,   schedule, 'inflationBps',   { label: 'bps',          cursorIdx, color: '#ffaa00', overlay: pinnedSchedule, overlayCursorIdx: pinnedCursorIdx, clampTop: 5000 });
  }

  // ── P5: Single-canvas chart renderer ───────────────────────────────────────────────────────
  //
  // Draws one line chart on `canvas` from `schedule[].{field}` values.
  // Handles: axis ticks, labels, gradient fill, "you are here" cursor, hover crosshair setup.
  //
  // options:
  //   label     — y-axis unit label (shown top-right)
  //   cursorIdx — index in schedule[] for the "you are here" vertical cursor
  //   color     — hex or CSS color for line + gradient
  //   clampTop  — optional max y value (clips inflation bps chart to avoid genesis-spike infinity)
  _renderSingleChart(canvas, schedule, field, options = {}) {
    const { label = '', cursorIdx = -1, color = '#00ff88', clampTop = null } = options;
    const ctx = canvas.getContext('2d');

    // DPI-aware sizing: read CSS size, set pixel buffer to match devicePixelRatio
    const dpr    = window.devicePixelRatio || 1;
    const cssW   = canvas.offsetWidth  || canvas.width  || 560;
    const cssH   = canvas.offsetHeight || canvas.height || 220;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;
    const PAD_L = 52;  // left: y-axis labels
    const PAD_R = 12;
    const PAD_T = 18;
    const PAD_B = 28;  // bottom: x-axis labels

    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, W, H);

    // Extract values, apply optional clamp, filter out NaN/Infinity at genesis
    const vals = schedule.map(p => {
      let v = p[field] ?? 0;
      if (!isFinite(v) || isNaN(v)) v = 0;
      if (clampTop !== null && v > clampTop) v = clampTop;
      return v;
    });

    const minV  = 0; // always start y-axis at 0 for economic charts
    const maxV  = Math.max(...vals, 0.000001); // avoid zero-range
    const range = maxV - minV;

    // Helpers: data → pixel
    const xOf = (i)   => PAD_L + (i / (schedule.length - 1)) * plotW;
    const yOf = (v)   => PAD_T + plotH - ((Math.max(v, 0) - minV) / range) * plotH;

    const S = this._chartStyle();

    // ── Grid lines (4 horizontal) ──────────────────────────────────────────────────────
    ctx.strokeStyle = S.grid;
    ctx.lineWidth   = 1;
    for (let t = 0; t <= 4; t++) {
      const y = PAD_T + (t / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + plotW, y);
      ctx.stroke();

      // Y-axis tick label
      const tickVal = maxV - (t / 4) * range;
      ctx.fillStyle   = S.tick;
      ctx.font        = S.font(10);
      ctx.textAlign   = 'right';
      ctx.textBaseline = 'middle';
      const tickStr = tickVal >= 1_000_000
        ? `${(tickVal / 1_000_000).toFixed(1)}M`
        : tickVal >= 1_000
          ? `${(tickVal / 1_000).toFixed(0)}k`
          : tickVal >= 1
            ? tickVal.toFixed(2)
            : tickVal.toFixed(4);
      ctx.fillText(tickStr, PAD_L - 4, y);
    }

    // ── X-axis labels (0, 25M, 50M, 75M, 100M) ────────────────────────────────────────
    ctx.fillStyle    = S.tick;
    ctx.font         = S.font(10);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    [0, 0.25, 0.5, 0.75, 1.0].forEach(frac => {
      const x     = PAD_L + frac * plotW;
      const block = Math.round(frac * 100_000_000);
      const lbl   = block === 0 ? '0' : `${block / 1_000_000}M`;
      ctx.fillText(lbl, x, PAD_T + plotH + 4);
    });

        // ── Gradient fill under line ───────────────────────────────────────────────────────
    const rgba = (c, a) => {
      if (typeof c !== 'string' || !c) return `rgba(0,255,136,${a})`;
      if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
        const hex = c.length === 7
          ? c.slice(1)
          : c.slice(1).split('').map(ch => ch + ch).join('');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
      }
      // rgb(...) / rgba(...) / named colors: best-effort fallback
      if (c.startsWith('rgb('))  return c.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
      if (c.startsWith('rgba(')) return c.replace(/rgba\(([^)]+),\s*[^,]+\)\s*$/, `rgba($1, ${a})`);
      return c;
    };

    const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + plotH);
    grad.addColorStop(0, rgba(color, 0.18));
    grad.addColorStop(1, rgba(color, 0.00));

    ctx.beginPath();
    schedule.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(vals[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(schedule.length - 1), PAD_T + plotH);
    ctx.lineTo(PAD_L, PAD_T + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Main line ─────────────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    schedule.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(vals[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // ── P8: Pinned scenario overlay (dashed line + hollow cursor marker) ──────────────
    // Drawn before the primary cursor so the primary filled dot always renders on top.
    // options.overlay = pinnedSchedule (same NSAMPLES → xOf(i) aligns across scenarios).
    if (options.overlay && options.overlay.length === schedule.length) {
      const ov = options.overlay;
      const ovVals = ov.map(p => {
        let v = p[field] ?? 0;
        if (!isFinite(v) || isNaN(v)) v = 0;
        if (clampTop !== null && v > clampTop) v = clampTop;
        return v;
      });

      ctx.save();
      // Secondary comparison line: dashed + lower alpha + tinted to the series color
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.2;
      ctx.lineJoin    = 'round';
      ctx.setLineDash([5, 4]);

      ctx.beginPath();
      ov.forEach((_, i) => {
        const x = xOf(i);
        const y = yOf(ovVals[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Hollow circle at pinned "now" — distinct from the filled dot on the primary line
      if (typeof options.overlayCursorIdx === 'number' && options.overlayCursorIdx >= 0) {
        const pi = Math.min(options.overlayCursorIdx, ov.length - 1);
        ctx.globalAlpha = 0.80;
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(xOf(pi), yOf(ovVals[pi]), 3.5, 0, Math.PI * 2);
        ctx.stroke(); // hollow — stroke only, no fill
      }

      ctx.restore();
    }

    // ── "You are here" cursor ─────────────────────────────────────────────────────────
    // Vertical dashed line at cursorIdx + dot on the line + small label
    if (cursorIdx >= 0 && cursorIdx < schedule.length) {
      const cx = xOf(cursorIdx);
      const cy = yOf(vals[cursorIdx]);

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, PAD_T);
      ctx.lineTo(cx, PAD_T + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot on the line
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // "Now" label above cursor
      ctx.fillStyle    = 'rgba(255,255,255,0.6)';
      ctx.font         = '9px Inter, system-ui, sans-serif';
      ctx.textAlign    = cx > W / 2 ? 'right' : 'left';
      ctx.textBaseline = 'bottom';
      const offsetX    = cx > W / 2 ? -5 : 5;
      ctx.fillText('now', cx + offsetX, PAD_T + 2);
      ctx.restore();
    }

    // ── Unit label & Legend (top-right) ───────────────────────────────────────────────
    ctx.fillStyle    = S.tick;
    ctx.font         = S.font(9);
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';

    if (options.overlay) {
      // "Pinned" legend: dashed swatch + label
      const legX = PAD_L + plotW;
      const legY = PAD_T;
      
      ctx.fillText('Pinned', legX, legY);
      const textW = ctx.measureText('Pinned').width;
      
      // Dashed swatch to the left of the text
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.2;
      ctx.lineJoin    = 'round';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(legX - textW - 20, legY + 5);
      ctx.lineTo(legX - textW - 4, legY + 5);
      ctx.stroke();
      ctx.restore();

      // Primary unit label below the legend
      ctx.fillText(label, legX, legY + 12);
    } else {
      // Just the unit label
      ctx.fillText(label, PAD_L + plotW, PAD_T);
    }
  }

  onUnmount() {
    // P5: clear debounce timer so _renderCharts doesn't fire after DOM teardown
    if (this._updateTimer !== null) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    // Clear ad quality auto-refresh so it doesn't fire after DOM teardown
    if (this._adRefreshInterval !== null) {
      clearInterval(this._adRefreshInterval);
      this._adRefreshInterval = null;
    }
  }

  // ── Ad quality auto-refresh — called by 30s interval when live (¬_simulated) ———————————
  //
  // Pulls only F/P/R from fetchLiveInputs — the cheapest slice of the live sync.
  // Skips the heavy governor.status + receipt.audit calls that syncFromChain() does;
  // those only run on explicit user-triggered Sync Live clicks.
  //
  // Null-guard mirrors syncFromChain(): missing data from a failed RPC is silently
  // skipped so the slider retains its last known-good value (never zeroed by a
  // transient network hiccup).
  async _refreshAdReadiness() {
    if (this._simulated) return;
    try {
      // Use the new lightweight RPC helper that only hits ad_market.readiness
      const { adFreshnessPpm, adPrivacyPpm, adReadinessPpm, adReadinessRaw } = await fetchAdReadiness(this.rpc);
      if (adFreshnessPpm != null) this.inputs.adFreshnessPpm = adFreshnessPpm;
      if (adPrivacyPpm   != null) this.inputs.adPrivacyPpm   = adPrivacyPpm;
      if (adReadinessPpm != null) this.inputs.adReadinessPpm = adReadinessPpm;
      if (adReadinessRaw != null) this._adReadinessRaw = adReadinessRaw;
      this.refreshControls();
      this.updateOutputs();
      console.log('[EconomicsSimulator] Auto-refreshed ad readiness', { F: adFreshnessPpm, P: adPrivacyPpm, R: adReadinessPpm });
    } catch (err) {
      console.warn('[EconomicsSimulator] Auto-refresh failed (will retry in 30s)', err);
    }
  }
}

export default EconomicsSimulator;

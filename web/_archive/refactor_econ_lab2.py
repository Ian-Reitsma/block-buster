import os
import re

path = os.path.expanduser('~/projects/the-block/block-buster/web/src/components/EconomicsSimulator.js')

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to replace the ENTIRE render() function. 
# We'll use a regex to match from `  render() {` to the matching end brace.
# However, `render()` is huge, and has nested braces. 
# A safer way is to match from `  render() {` to `return container;\n  }`

old_render_start = "  render() {\n    const container = document.createElement('div');"
old_render_end = "return container;\n  }"

idx_start = content.find(old_render_start)
idx_end = content.find(old_render_end, idx_start)

if idx_start != -1 and idx_end != -1:
    idx_end += len(old_render_end)
    
    new_render = """  render() {
    const container = document.createElement('div');
    container.className = 'economics-lab';

    container.innerHTML = `
      <div class="lab-grid">
        <aside class="lab-sidebar">
          <header class="lab-header">
            <div>
              <p class="eyebrow">Scenario</p>
              <h3>Controls</h3>
              <p class="muted small">Edit inputs precisely; outputs update instantly.</p>
            </div>
          </header>

          <div class="lab-actions" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:1rem;">
            <button class="btn btn-sm" data-scenario="early">Early</button>
            <button class="btn btn-sm" data-scenario="growth">Growth</button>
            <button class="btn btn-sm" data-scenario="mainnet">Mainnet</button>
            <button class="btn btn-sm" data-scenario="stress">Stress</button>
            <button class="btn btn-sm btn-secondary" id="econlab-pin" title="Pin current inputs as comparison baseline">Pin</button>
            <button class="btn btn-sm btn-secondary" id="econlab-unpin" style="display:none;" title="Remove pinned comparison">Unpin</button>
          </div>

          <div class="lab-controls">
            ${this.renderNumericInput('txCountRatio', 'TX Count Ratio', 0.6, 2.2, 0.01, 'Relative to 30d baseline')}
            ${this.renderNumericInput('txVolumeRatio', 'TX Volume Ratio', 0.6, 2.2, 0.01, 'Volume vs baseline')}
            ${this.renderNumericInput('uniqueMiners', 'Unique Miners', 5, 120, 1, 'Active miners in epoch')}
            ${this.renderNumericInput('emission', 'Issued Supply (BLOCK)', 500000, 40000000, 50000, 'Total emitted so far')}
            ${this.renderNumericInput('targetInflationBps', 'Target Inflation (bps)', 50, 1500, 10, 'Governor target')}

            <div class="lab-subgrid">
              <p class="eyebrow" style="margin:0 0 6px;font-size:11px;opacity:0.6;">Market Utilization (ppm)</p>
              ${this.renderNumericInput('storageUtilPpm', 'Storage Util', 10000, 950000, 10000, 'utilization_ppm')}
              ${this.renderNumericInput('computeUtilPpm', 'Compute Util', 10000, 950000, 10000, 'utilization_ppm')}
              ${this.renderNumericInput('energyUtilPpm', 'Energy Util', 10000, 950000, 10000, 'utilization_ppm')}
              ${this.renderNumericInput('adUtilPpm', 'Ad Util', 10000, 950000, 10000, 'utilization_ppm')}
            </div>

            <div class="lab-subgrid">
              <p class="eyebrow" style="margin:0 0 6px;font-size:11px;opacity:0.6;">Provider Margin (ppm)</p>
              ${this.renderNumericInput('storageMarginPpm', 'Storage Margin', 0, 500000, 5000, 'provider_margin_ppm')}
              ${this.renderNumericInput('computeMarginPpm', 'Compute Margin', 0, 500000, 5000, 'provider_margin_ppm')}
              ${this.renderNumericInput('energyMarginPpm', 'Energy Margin', 0, 500000, 5000, 'provider_margin_ppm')}
              ${this.renderNumericInput('adMarginPpm', 'Ad Margin', 0, 500000, 5000, 'provider_margin_ppm')}
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
                ${this.renderNumericInput('emaAlphaPpm', 'EMA Alpha (ppm)', 5000, 200000, 5000, 'baseline_ema_alpha_ppm')}
                ${this.renderNumericInput('baselineEpochs', 'Baseline Epochs', 0, 1000, 5, 'Network age proxy')}
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
                ${this.renderNumericInput('adReadinessPpm', 'Readiness (ppm)', 0, 2000000, 10000, 'Readiness multiplier')}
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
              <p class="eyebrow">Outputs</p>
              <h3>Reward &amp; Inflation</h3>
            </div>
            <div class="lab-actions">
              <button class="btn btn-sm" id="sync-live">Sync Live</button>
              <button class="btn btn-sm btn-secondary" id="sync-mock">Mock Baseline</button>
              <button class="btn btn-sm btn-secondary" id="sync-governor">Sync Governor</button>
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
                <h3>Full 100M Block Projection</h3>
              </div>
            </header>
            <div class="charts-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;">
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Block Reward</p><canvas id="chart-block-reward" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Cumulative Emission</p><canvas id="chart-total-emitted" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Annual Issuance</p><canvas id="chart-annual-issuance" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
              <div class="chart-card"><p class="eyebrow" style="margin-bottom:4px;">Inflation Rate (bps)</p><canvas id="chart-inflation-bps" style="width:100%;height:220px;display:block;border-radius:6px;background:var(--surface-2,#111);"></canvas></div>
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

          <div class="coinbase-breakdown" id="coinbase-breakdown"></div>

          <div class="formula-grid">
            <div class="formula-block"><p class="eyebrow">Activity Multiplier</p><h4 id="activity-multiplier">—</h4><div class="bar"><span id="activity-bar"></span></div><p class="muted tiny" id="activity-breakdown">—</p></div>
            <div class="formula-block"><p class="eyebrow">Decentralization</p><h4 id="decentr">—</h4><div class="bar"><span id="decentr-bar"></span></div></div>
            <div class="formula-block"><p class="eyebrow">Supply Decay</p><h4 id="decay">—</h4><div class="bar"><span id="decay-bar"></span></div></div>
          </div>
        </main>
      </div>
    `;

    return container;
  }"""
    
    content = content[:idx_start] + new_render + content[idx_end:]
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Replaced render()")
else:
    print("Could not find render() block")

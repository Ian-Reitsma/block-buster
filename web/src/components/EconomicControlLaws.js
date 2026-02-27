/**
 * Economic Control Laws Dashboard
 * 
 * Four-layer economic control system monitoring:
 * - Layer 1: Inflation Control (target 5% annual)
 * - Layer 2: Subsidy Allocation (storage/compute/energy/ad)
 * - Layer 3: Market Multipliers (dual control: utilization + margins)
 * - Layer 4: Ad Splits & Tariff (platform/user/publisher, treasury)
 * 
 * Based on: ~/projects/the-block/docs/economics_operator_runbook.md
 */

import { Component } from '../lifecycle.js';
import { fmt, $ } from '../utils.js';
import mockDataManager from '../mock-data-manager.js';
import features from '../features.js';

class EconomicControlLaws extends Component {
  constructor(rpc) {
    super('EconomicControlLaws');
    this.rpc = rpc;
    this.data = null;
    this.simulated = true;
  }

  // ── Data fetch: same code path for live and mock ────────────────────────────────────────────────
  //
  // KEY PRINCIPLE: mock mode no longer short-circuits to a different data shape.
  // Instead, we instantiate RpcMock (which wraps MockDataManager and emits the same JSON
  // response shapes as the real node) and run _fetchChainData(rpcMock) through the
  // identical transform path as live. This guarantees:
  //   1. The UI renders the same field paths in both modes.
  //   2. Any RPC response shape change breaks both modes equally — caught in dev.
  //   3. syncFromMock() in EconomicsSimulator is the only place that feeds mock
  //      inputs from mock-data-manager; everything else goes through the chain path.
  async fetchData() {
    // Prefer live economics if enabled AND we're actually connected to a live node.
    // Otherwise use the same RPC interface (which is MockRpcClient in mock mode).
    const preferLive = features.isEnabled('economics_live') && mockDataManager.isLiveMode();

    try {
      this.simulated = !preferLive;
      return await this._fetchChainData(this.rpc);
    } catch (err) {
      console.warn('[EconomicControlLaws] RPC fetch failed, falling back to simulated:', err?.message);
      this.simulated = true;
      // In the current app architecture, mock mode already injects MockRpcClient as this.rpc,
      // so retrying through the same interface is sufficient.
      return await this._fetchChainData(this.rpc);
    }
  }

  async _fetchChainData(rpc = this.rpc) {
    const EPOCH_BLOCKS = 120;

    // ── Primary: parallel fetches for governor state, block height, ad policy ──
    const [governorStatus, blockHeightResp, adSplits] = await Promise.all([
      rpc.getGovernorStatus(),
      rpc.getBlockHeight(),
      rpc.call('ad_market.policy_snapshot', {}).catch(() => null),  // non-fatal
    ]);

    // ── Best-effort: latest EpochEconomicsReceipt via receipt.audit ──
    // Two-pass robust scan (receipt.audit docs: apis_and_tooling.md):
    //   Pass 1: filtered by market='epoch_economics' (fast path; if node supports filter)
    //   Pass 2: unfiltered limit=64, 10-epoch window (fallback for older node builds)
    // Sorted block_height ASC — walk newest-first. Silent on any failure.
    let epochReceipt = null;
    const currentHeight = blockHeightResp?.height ?? 0;
    const _auditBase = {
      start_height: Math.max(0, currentHeight - EPOCH_BLOCKS * 10),
      end_height:   currentHeight,
      limit:        64,  // was 5 — increased to reliably capture epoch boundary receipts
    };
    const _findEpoch = (receipts) => {
      for (let i = (receipts || []).length - 1; i >= 0; i--) {
        const r = receipts[i];
        // We return the full audit record so downstream layers can use per-block metadata
        // like subsidy buckets, and then unwrap the receipt payload later.
        if (
          r?.receipt_type === 'epoch_economics' ||
          r?.receipt_type === 'EpochEconomics'  ||
          r?.receipt?.epoch !== undefined ||
          r?.receipt?.EpochEconomics?.epoch !== undefined ||
          r?.receipt?.epoch_economics?.epoch !== undefined
        ) return r;
      }
      return null;
    };
    // Pass 1: filtered by market (fast if supported by this node build)
    try {
      const auditResp = await rpc.call('receipt.audit', { ..._auditBase, market: 'epoch_economics' });
      epochReceipt = _findEpoch(auditResp?.receipts);
    } catch (_) { /* market filter not supported on this build — fall through */ }
    // Pass 2: unfiltered (covers all node versions)
    if (!epochReceipt) {
      try {
        const auditResp = await rpc.call('receipt.audit', _auditBase);
        epochReceipt = _findEpoch(auditResp?.receipts);
      } catch (_auditErr) {
        console.info('[EconomicControlLaws] receipt.audit not yet available on this node');
      }
    }
    this.simulated = false;
    return this._transformChainData(governorStatus, blockHeightResp, epochReceipt, adSplits);
  }

  _transformChainData(governorStatus, blockHeightResp, epochReceipt, adSplits) {
    const EPOCH_BLOCKS    = 120;
    const BLOCKS_PER_YEAR = 365 * 24 * 3600;

    // ── Layer 1: Inflation ──
    // Realized rate = next_block_reward_per_block × BLOCKS_PER_YEAR / total_emission × 10_000
    // Source fields are from EpochEconomicsReceipt (economics_and_governance.md schema).
    // null = receipt.audit not yet active; UI renders "—" and a source-pending note.
    // Epoch receipt can arrive in different shapes depending on how the node serializes the Receipt enum.
    // Prefer common tagged forms, then fall back to the raw object.
    const epochRecord = epochReceipt;
    const epochData = epochRecord?.receipt?.EpochEconomics
                   ?? epochRecord?.receipt?.epoch_economics
                   ?? epochRecord?.receipt
                   ?? epochRecord;

    const totalEmission  = epochData?.total_emission              ?? null;
    const nextReward     = epochData?.next_block_reward_per_block ?? null;
    const annualIssuance = nextReward !== null ? nextReward * BLOCKS_PER_YEAR : null;
    const realizedBps    = (annualIssuance !== null && totalEmission > 0)
      ? Math.round((annualIssuance / totalEmission) * 10_000)
      : null;
    const TARGET_BPS = 500;  // governance default: inflation_target_bps

    // ── Layer 3: Market Multipliers ──
    // Source: governor.status.economics_prev_market_metrics — ppm values per market.
    // The node does NOT expose computed multiplier values; we show the raw utilization/margin
    // ppm signals that feed into subsidy_allocator.rs’s dual-control loop.
    const rawMetrics  = governorStatus?.economics_prev_market_metrics
                     || governorStatus?.metrics?.economics_prev_market_metrics;
    const marketOrder = ['storage', 'compute', 'energy', 'ad'];
    const perMarket   = {};
    if (Array.isArray(rawMetrics) && rawMetrics.length > 0) {
      rawMetrics.forEach((m, i) => {
        const name = m.market ?? marketOrder[i] ?? `market_${i}`;
        perMarket[name] = {
          utilization_ppm: m.utilization_ppm    ?? 0,
          margin_ppm:      m.provider_margin_ppm ?? 0,
          utilization:     (m.utilization_ppm    ?? 0) / 1_000_000,
          margin:          (m.provider_margin_ppm ?? 0) / 1_000_000,
          _source: 'governor.status',
        };
      });
    } else if (rawMetrics && typeof rawMetrics === 'object') {
      // Flat object (single-market or legacy shape) — broadcast to all markets
      const u = rawMetrics.utilization_ppm    ?? 650_000;
      const p = rawMetrics.provider_margin_ppm ?? 120_000;
      marketOrder.forEach(n => {
        perMarket[n] = {
          utilization_ppm: u, margin_ppm: p,
          utilization: u / 1_000_000, margin: p / 1_000_000,
          _source: 'governor.status',
        };
      });
    } else {
      // No live metrics available — fill with chain defaults, mark source
      marketOrder.forEach(n => {
        perMarket[n] = {
          utilization_ppm: 650_000, margin_ppm: 120_000,
          utilization: 0.65, margin: 0.12,
          _source: 'default',
        };
      });
    }

    // ── Layer 4: Ad Splits — from ad_market.policy_snapshot (real endpoint, unchanged) ──
    const adLayer = {
      splits: {
        platform:  adSplits?.platform_share_bps  ?? 2800,
        user:      adSplits?.user_share_bps       ?? 2200,
        publisher: adSplits?.publisher_share_bps  ?? 5000,
        targets:   { platform: 2800, user: 2200, publisher: 5000 },
        _source:   adSplits ? 'ad_market.policy_snapshot' : 'default',
      },
      tariff: {
        current_bps:               adSplits?.tariff_bps               ?? 50,
        target_bps:                100,
        treasury_contribution_pct: adSplits?.treasury_contribution_pct ?? 8.5,
        drift_rate:                0.05,
      },
    };

    const currentHeight = blockHeightResp?.height ?? 0;
    const epochNumber   = epochData?.epoch ?? Math.floor(currentHeight / EPOCH_BLOCKS);

    return {
      // Governor state
      launch_mode: governorStatus?.launch_mode || 'trade',
      gates: governorStatus?.gates || {},
      active_gates: governorStatus?.active_gates || 0,
      
      // Layer 1
      inflation: {
        target_bps:         TARGET_BPS,
        realized_bps:       realizedBps,  // null = receipt not yet available
        error_bps:          realizedBps !== null ? realizedBps - TARGET_BPS : null,
        annual_issuance:    annualIssuance !== null ? Math.round(annualIssuance) : null,
        next_reward:        nextReward,
        total_emission:     totalEmission,
        controller_gain:    0.10,  // legacy controller reference — not active policy
        convergence_epochs: 30,    // rough estimate from legacy controller doc
        _source:            epochReceipt ? 'receipt.audit' : 'unavailable',
      },
      // Layer 2: subsidy buckets are emitted by receipt.audit as per-block metadata.
      // null signals renderLayer2Subsidies() to use estimated values with a visible badge.
      subsidies: epochRecord?.subsidies ?? null,
      // Layer 3
      multipliers: {
        ...perMarket,
        ceiling: 10.0,
        floor:   0.1,
      },
      // Layer 4
      ad: adLayer,
      epoch:     epochNumber,
      timestamp: Date.now(),
      _sources: {
        governor:     !!governorStatus,
        blockHeight:  !!blockHeightResp,
        epochReceipt: !!epochData,
        adPolicy:     !!adSplits,
      },
    };
  }

  render() {
    const container = document.createElement('div');
    container.className = 'economic-control-laws';

    // Header
    const header = document.createElement('div');
    header.className = 'control-laws-header';
    header.innerHTML = `
      <div>
        <h3>Economic Control Laws</h3>
        <p class="muted small">Four-layer automatic stabilization system (updates every 120 blocks / ~2 min)</p>
      </div>
      <div class="epoch-counter">
        <span class="epoch-label">Current Epoch:</span>
        <span class="epoch-value" id="current-epoch">--</span>
        <span class="pill pill-muted" id="econ-sim-badge" style="margin-left: var(--space-2); display:none;">Simulated</span>
      </div>
    `;
    container.appendChild(header);

    // Overall health indicator
    const healthSection = document.createElement('div');
    healthSection.className = 'overall-health';
    healthSection.id = 'overall-health';
    container.appendChild(healthSection);

    // Launch Gates section
    const gatesSection = document.createElement('div');
    gatesSection.className = 'launch-gates';
    gatesSection.id = 'launch-gates';
    container.appendChild(gatesSection);

    // Four layers
    const layersSection = document.createElement('div');
    layersSection.className = 'control-layers';
    layersSection.innerHTML = `
      <div id="layer-1-inflation" class="control-layer"></div>
      <div id="layer-2-subsidies" class="control-layer"></div>
      <div id="layer-3-multipliers" class="control-layer"></div>
      <div id="layer-4-ad" class="control-layer"></div>
    `;
    container.appendChild(layersSection);

    // Emergency procedures
    const emergencySection = document.createElement('div');
    emergencySection.className = 'emergency-procedures';
    emergencySection.innerHTML = `
      <h4>Emergency Procedures</h4>
      <div class="procedure-links">
        <a href="#" class="procedure-link" data-procedure="runaway-inflation">
          🚨 Runaway Inflation
        </a>
        <a href="#" class="procedure-link" data-procedure="multiplier-ceiling">
          🚨 Multiplier at Ceiling
        </a>
        <a href="#" class="procedure-link" data-procedure="subsidy-oscillation">
          🚨 Subsidy Oscillation
        </a>
        <a href="#" class="procedure-link" data-procedure="tariff-stuck">
          🚨 Tariff Stuck at Bounds
        </a>
      </div>
    `;
    container.appendChild(emergencySection);

    return container;
  }

  // Keep the simulated pill in sync across all data refresh cycles.
  // Call after every fetchData() — initial mount AND the 5s polling interval.
  _updateSimBadge() {
    const badge = document.getElementById('econ-sim-badge');
    if (badge) badge.style.display = this.simulated ? 'inline-flex' : 'none';
  }

  async onMount() {
    // Fetch initial data
    this.data = await this.fetchData();
    this._updateSimBadge();
    
    // Render all layers
    this.renderOverallHealth();
    this.renderLaunchGates();
    this.renderLayer1Inflation();
    this.renderLayer2Subsidies();
    this.renderLayer3Multipliers();
    this.renderLayer4Ad();
    
    // Update epoch counter
    this.updateEpochCounter();

    // Update every 5 seconds
    this.interval(async () => {
      this.data = await this.fetchData();
      this._updateSimBadge();
      this.renderOverallHealth();
      this.renderLaunchGates();
      this.renderLayer1Inflation();
      this.renderLayer2Subsidies();
      this.renderLayer3Multipliers();
      this.renderLayer4Ad();
      this.updateEpochCounter();
    }, 5000);

    // Attach emergency procedure handlers
    const links = document.querySelectorAll('.procedure-link');
    links.forEach(link => {
      this.listen(link, 'click', (e) => {
        e.preventDefault();
        const procedure = e.currentTarget.dataset.procedure;
        this.showEmergencyProcedure(procedure);
      });
    });
  }

  updateEpochCounter() {
    const counter = $('#current-epoch');
    if (counter && this.data) {
      counter.textContent = this.data.epoch || '--';
    }
  }

  renderOverallHealth() {
    const container = $('#overall-health');
    if (!container || !this.data) return;

    const { status, label, icon, issues } = this.calculateOverallHealth();

    container.innerHTML = `
      <div class="health-card health-${status}">
        <div class="health-icon">${icon}</div>
        <div class="health-content">
          <div class="health-label">System Health: ${label}</div>
          <div class="health-issues">
            ${issues.length > 0 ? issues.map(issue => `<div class="issue">${issue}</div>`).join('') : '<div class="issue-none">All systems nominal</div>'}
          </div>
        </div>
      </div>
    `;

    if (this.simulated) {
      const badge = document.createElement('div');
      badge.className = 'muted tiny';
      badge.textContent = 'Simulated economics (mock fallback — chain receipts/governor metrics unavailable)';
      container.appendChild(badge);
    }
  }

  renderLaunchGates() {
    const container = $('#launch-gates');
    if (!container || !this.data) return;

    const mode = this.data.launch_mode || 'unknown';
    const active = this.data.active_gates || 0;
    const gates = this.data.gates || {};
    const markets = ['storage', 'compute', 'energy', 'ad'];

    const modeColor = mode === 'trade' ? 'var(--success)' : 'var(--warning)';

    container.innerHTML = `
      <div class="card mb-4" style="border-left: 4px solid ${modeColor};">
        <div class="row space-between align-center mb-4">
          <div>
            <h4 style="margin: 0; display: inline-flex; align-items: center; gap: 8px;">
              Launch Governor <span class="pill pill-outline" style="border-color: ${modeColor}; color: ${modeColor};">${mode.toUpperCase()}</span>
            </h4>
            <p class="muted small mt-1">Active Gates: ${active} / 4 — Markets advancing to trade phase</p>
          </div>
        </div>
        <div class="gates-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          ${markets.map(m => {
            const g = gates[m] || { mode: 'shadow', streak: 0, utilization_ok: false, margin_ok: false };
            const mColor = g.mode === 'trade' ? 'var(--success)' : g.mode === 'rehearsal' ? 'var(--warning)' : 'var(--danger)';
            return `
              <div class="gate-card" style="padding: 12px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <div class="row space-between mb-2">
                  <strong style="text-transform: capitalize;">${m}</strong>
                  <span style="color: ${mColor}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${g.mode}</span>
                </div>
                <div class="muted small mb-2">Streak: ${g.streak} epochs</div>
                <div class="row align-center gap-2 mb-1">
                  <span style="font-size: 10px;">${g.utilization_ok ? '✅' : '❌'}</span>
                  <span class="small" style="color: ${g.utilization_ok ? 'var(--text)' : 'var(--danger)'};">Utilization</span>
                </div>
                <div class="row align-center gap-2">
                  <span style="font-size: 10px;">${g.margin_ok ? '✅' : '❌'}</span>
                  <span class="small" style="color: ${g.margin_ok ? 'var(--text)' : 'var(--danger)'};">Margin</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  calculateOverallHealth() {
    if (!this.data) return { status: 'unknown', label: 'Unknown', icon: '⚪', issues: [] };

    const issues = [];
    let status = 'healthy';

    // Check Layer 1: Inflation
    // error_bps is null when receipt.audit is not yet active on this node.
    // null-guard: skip check rather than silently reporting healthy on missing data.
    const inflationError = this.data.inflation.error_bps !== null
      ? Math.abs(this.data.inflation.error_bps)
      : null;
    if (inflationError !== null) {
      if (inflationError > 200) {
        status = 'critical';
        issues.push(`🔴 Inflation error: ${inflationError} bps (receipt.audit)`);
      } else if (inflationError > 100) {
        if (status === 'healthy') status = 'warning';
        issues.push(`🟡 Inflation error: ${inflationError} bps (receipt.audit)`);
      }
    } else {
      issues.push('⚪ Inflation: receipt.audit pending — realized rate unavailable');
    }

    // Check Layer 3: Multipliers
    // Live data shape: {utilization, margin, utilization_ppm, margin_ppm, _source}
    // (node does not expose a computed .value — use utilization as the health signal,
    // matching the runbook thresholds used in renderLayer3Multipliers)
    Object.entries(this.data.multipliers).forEach(([market, data]) => {
      if (typeof data !== 'object' || data._source === undefined) return; // skip ceiling/floor keys
      if (data.utilization >= 0.93 || data.margin < 0.05) {
        status = 'critical';
        issues.push(`🔴 ${market}: util ${(data.utilization * 100).toFixed(0)}% / margin ${(data.margin * 100).toFixed(1)}%`);
      } else if (data.utilization >= 0.80 || data.margin < 0.12) {
        if (status === 'healthy') status = 'warning';
        issues.push(`🟡 ${market}: util ${(data.utilization * 100).toFixed(0)}% / margin ${(data.margin * 100).toFixed(1)}%`);
      }
    });

    // Check Layer 2: Subsidy distress
    // subsidies is null in live-chain mode (subsidy_allocator.rs has no RPC endpoint).
    // Iterate only when mock data is present.
    if (this.data.subsidies !== null && this.data.subsidies !== undefined) {
      Object.entries(this.data.subsidies).forEach(([market, data]) => {
        if (typeof data === 'object' && typeof data.distress === 'number') {
          if (data.distress > 0.5) {
            if (status === 'healthy') status = 'warning';
            issues.push(`🟡 ${market} market in distress: ${(data.distress * 100).toFixed(0)}%`);
          }
        }
      });
    }

    const label = status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : 'Healthy';
    const icon = status === 'critical' ? '🔴' : status === 'warning' ? '🟡' : '🟢';

    return { status, label, icon, issues };
  }

  renderLayer1Inflation() {
    const container = $('#layer-1-inflation');
    if (!container || !this.data) return;

    const inflation = this.data.inflation;
    // realized_bps / error_bps / annual_issuance are null when receipt.audit is not yet active.
    const hasRealized = inflation.realized_bps !== null;
    const errorAbs    = hasRealized ? Math.abs(inflation.error_bps) : 0;
    const errorStatus = !hasRealized
      ? 'healthy'
      : errorAbs > 200 ? 'critical' : errorAbs > 50 ? 'warning' : 'healthy';
    const errorSign   = (hasRealized && inflation.error_bps > 0) ? '+' : '';
    const realizedStr = hasRealized ? `${(inflation.realized_bps / 100).toFixed(2)}%` : '—';
    const errorStr    = hasRealized ? `${errorSign}${inflation.error_bps} bps` : '— (receipt unavailable)';
    const progressPct = hasRealized
      ? Math.min(100, (inflation.realized_bps / inflation.target_bps) * 100)
      : 0;
    const issuanceStr = inflation.annual_issuance !== null
      ? `${fmt.num(inflation.annual_issuance)} BLOCK`
      : '— (receipt unavailable)';
    const sourceLabel = inflation._source === 'unavailable'
      ? 'Realized rate: pending receipt.audit activation on node'
      : `Source: ${inflation._source}`;

    container.innerHTML = `
      <div class="layer-header">
        <h4>Layer 1: Inflation Control</h4>
        <span class="layer-status status-${errorStatus}">
          ${errorStatus === 'critical' ? '🔴' : errorStatus === 'warning' ? '🟡' : '🟢'}
        </span>
      </div>
      <div class="layer-content">
        <div class="metrics-row">
          <div class="metric">
            <div class="metric-label">Target</div>
            <div class="metric-value">${(inflation.target_bps / 100).toFixed(2)}%</div>
            <div class="metric-unit">annual</div>
          </div>
          <div class="metric">
            <div class="metric-label">Realized</div>
            <div class="metric-value">${realizedStr}</div>
            <div class="metric-unit">actual</div>
          </div>
          <div class="metric">
            <div class="metric-label">Error</div>
            <div class="metric-value status-${errorStatus}">${errorStr}</div>
            <div class="metric-unit">deviation</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progressPct}%"></div>
          </div>
          <div class="progress-labels">
            <span>0%</span>
            <span class="target-marker">Target: ${(inflation.target_bps / 100).toFixed(1)}%</span>
            <span>10%</span>
          </div>
        </div>
        <div class="layer-info">
          <div class="info-row">
            <span class="info-label">Annual Issuance:</span>
            <span class="info-value">${issuanceStr}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Controller Gain:</span>
            <span class="info-value">${(inflation.controller_gain * 100).toFixed(0)}% (legacy ref)</span>
          </div>
          <div class="info-row">
            <span class="info-label">Convergence:</span>
            <span class="info-value">±1% in ${inflation.convergence_epochs} epochs (~1 hour)</span>
          </div>
          <div class="info-row muted tiny">
            <span>${sourceLabel}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderLayer2Subsidies() {
    const container = $('#layer-2-subsidies');
    if (!container || !this.data) return;

    // subsidies is null in live chain mode — subsidy_allocator.rs computes splits internally,
    // no RPC endpoint exists to retrieve them. Use governance-default estimates and badge clearly.
    const ESTIMATED_SUBSIDIES = {
      storage: { share_bps: 1500, distress: 0.2 },
      compute: { share_bps: 3000, distress: 0.1 },
      energy:  { share_bps: 2000, distress: 0.5 },
      ad:      { share_bps: 3500, distress: 0.0 },
      drift_rate:  0.01,
      temperature: 10_000,
    };
    const subsidies   = this.data.subsidies ?? ESTIMATED_SUBSIDIES;
    const isEstimated = this.data.subsidies === null;
    const markets = ['storage', 'compute', 'energy', 'ad'];

    const totalShares = markets.reduce((sum, m) => sum + (subsidies[m]?.share_bps || 0), 0);
    const maxDistress = Math.max(...markets.map(m => subsidies[m]?.distress || 0));
    const layerStatus = maxDistress > 0.5 ? 'warning' : 'healthy';
    const estimatedBadge = isEstimated
      ? '<span class="pill pill-muted" title="No RPC endpoint — subsidy_allocator.rs computes splits internally">Estimated</span>'
      : '';

    container.innerHTML = `
      <div class="layer-header">
        <h4>Layer 2: Subsidy Allocation ${estimatedBadge}</h4>
        <span class="layer-status status-${layerStatus}">
          ${layerStatus === 'warning' ? '🟡' : '🟢'}
        </span>
      </div>
      <div class="layer-content">
        <div class="subsidy-grid">
          ${markets.map(market => {
            const data = subsidies[market];
            const sharePct = (data.share_bps / 100).toFixed(1);
            const distressPct = (data.distress * 100).toFixed(0);
            const distressStatus = data.distress > 0.5 ? 'warning' : data.distress > 0.2 ? 'attention' : 'healthy';
            
            return `
              <div class="subsidy-card status-${distressStatus}">
                <div class="subsidy-market">${market}</div>
                <div class="subsidy-share">${sharePct}%</div>
                <div class="subsidy-bar">
                  <div class="bar-fill" style="width: ${sharePct}%"></div>
                </div>
                <div class="subsidy-distress">
                  Distress: ${distressPct}%
                  ${data.distress > 0.2 ? `<span class="distress-indicator">⚠️</span>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="layer-info">
          <div class="info-row">
            <span class="info-label">Drift Rate:</span>
            <span class="info-value">${(subsidies.drift_rate * 100).toFixed(1)}% per epoch</span>
          </div>
          <div class="info-row">
            <span class="info-label">Temperature:</span>
            <span class="info-value">${fmt.num(subsidies.temperature)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Total Shares:</span>
            <span class="info-value">${(totalShares / 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    `;
  }

  renderLayer3Multipliers() {
    const container = $('#layer-3-multipliers');
    if (!container || !this.data) return;

    const multipliers = this.data.multipliers;
    const markets = ['storage', 'compute', 'energy', 'ad'];

    // The node does NOT expose computed multiplier values via any RPC endpoint.
    // (subsidy_allocator.rs computes them internally.) We show the two ppm signals
    // that DRIVE the dual-control loop: utilization_ppm and provider_margin_ppm.
    // Health thresholds mirror the high-utilization warning bounds in the runbook:
    //   utilization >80% (800_000 ppm) = warning, >93% (930_000 ppm) = critical
    //   margin <5% (50_000 ppm) = warning (provider squeeze)
    const maxUtil   = Math.max(...markets.map(m => multipliers[m]?.utilization ?? 0));
    const minMargin = Math.min(...markets.map(m => multipliers[m]?.margin      ?? 1));
    const layerStatus = maxUtil >= 0.93 || minMargin < 0.05
      ? 'critical'
      : maxUtil >= 0.80 || minMargin < 0.12
        ? 'warning'
        : 'healthy';

    container.innerHTML = `
      <div class="layer-header">
        <h4>Layer 3: Market Multipliers</h4>
        <span class="layer-status status-${layerStatus}">
          ${layerStatus === 'critical' ? '🔴' : layerStatus === 'warning' ? '🟡' : '🟢'}
        </span>
        <span class="muted tiny" style="margin-left:auto" title="Node does not expose computed multiplier values — showing raw dual-control input signals from governor.status">
          Showing dual-control input signals (utilization + margin ppm)
        </span>
      </div>
      <div class="layer-content">
        <div class="multipliers-grid">
          ${markets.map(market => {
            const data = multipliers[market];
            if (!data || typeof data !== 'object' || data._source === undefined) return '';
            const utilizationPct = (data.utilization * 100).toFixed(1);
            const marginPct      = (data.margin      * 100).toFixed(2);
            // Health per-card: high util or negative/thin margin = warning
            const cardStatus = data.utilization >= 0.93 || data.margin < 0.05
              ? 'critical'
              : data.utilization >= 0.80 || data.margin < 0.12
                ? 'warning'
                : 'healthy';
            const utilBarPct = Math.round(data.utilization * 100);
            return `
              <div class="multiplier-card status-${cardStatus}">
                <div class="multiplier-header">
                  <span class="multiplier-market">${market}</span>
                  <span class="multiplier-value muted tiny" title="Computed value not exposed by node RPC">value: —</span>
                </div>
                <div class="multiplier-gauge">
                  <div class="gauge-track">
                    <div class="gauge-fill" style="width: ${utilBarPct}%"></div>
                    <div class="gauge-markers">
                      <span class="marker" style="left: 65%" title="65% util"></span>
                      <span class="marker" style="left: 80%" title="80% — warning"></span>
                      <span class="marker critical" style="left: 93%" title="93% — critical"></span>
                    </div>
                  </div>
                </div>
                <div class="multiplier-metrics">
                  <div class="metric-small">
                    <span class="metric-label">Utilization:</span>
                    <span class="metric-value">${utilizationPct}% <span class="muted tiny">(${data.utilization_ppm.toLocaleString()} ppm)</span></span>
                  </div>
                  <div class="metric-small">
                    <span class="metric-label">Margin:</span>
                    <span class="metric-value">${marginPct}% <span class="muted tiny">(${data.margin_ppm.toLocaleString()} ppm)</span></span>
                  </div>
                  <div class="metric-small">
                    <span class="metric-label muted tiny">src:</span>
                    <span class="metric-value muted tiny">${data._source}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="layer-info">
          <div class="info-row">
            <span class="info-label">Control law:</span>
            <span class="info-value">Dual (utilization + margins ppm)</span>
          </div>
          <div class="info-row">
            <span class="info-label">Warn threshold:</span>
            <span class="info-value">util &gt; 80% | margin &lt; 12%</span>
          </div>
          <div class="info-row">
            <span class="info-label">Source:</span>
            <span class="info-value">governor.status → economics_prev_market_metrics</span>
          </div>
        </div>
      </div>
    `;
  }

  renderLayer4Ad() {
    const container = $('#layer-4-ad');
    if (!container || !this.data) return;

    const ad = this.data.ad;
    const splits = ad.splits;
    const tariff = ad.tariff;
    
    const splitsDrift = Math.abs(splits.platform - splits.targets.platform) +
                         Math.abs(splits.user - splits.targets.user) +
                         Math.abs(splits.publisher - splits.targets.publisher);
    const tariffDrift = Math.abs(tariff.current_bps - tariff.target_bps);
    const layerStatus = splitsDrift > 500 || tariffDrift > 50 ? 'warning' : 'healthy';

    container.innerHTML = `
      <div class="layer-header">
        <h4>Layer 4: Ad Splits & Tariff</h4>
        <span class="layer-status status-${layerStatus}">
          ${layerStatus === 'warning' ? '🟡' : '🟢'}
        </span>
      </div>
      <div class="layer-content">
        <div class="ad-splits-section">
          <h5>Revenue Splits</h5>
          <div class="splits-grid">
            <div class="split-item">
              <div class="split-label">Platform</div>
              <div class="split-value">${(splits.platform / 100).toFixed(1)}%</div>
              <div class="split-target">Target: ${(splits.targets.platform / 100).toFixed(1)}%</div>
              <div class="split-bar">
                <div class="bar-current" style="width: ${(splits.platform / 100)}%"></div>
                <div class="bar-target" style="left: ${(splits.targets.platform / 100)}%"></div>
              </div>
            </div>
            <div class="split-item">
              <div class="split-label">User</div>
              <div class="split-value">${(splits.user / 100).toFixed(1)}%</div>
              <div class="split-target">Target: ${(splits.targets.user / 100).toFixed(1)}%</div>
              <div class="split-bar">
                <div class="bar-current" style="width: ${(splits.user / 100)}%"></div>
                <div class="bar-target" style="left: ${(splits.targets.user / 100)}%"></div>
              </div>
            </div>
            <div class="split-item">
              <div class="split-label">Publisher</div>
              <div class="split-value">${(splits.publisher / 100).toFixed(1)}%</div>
              <div class="split-target">Target: ${(splits.targets.publisher / 100).toFixed(1)}%</div>
              <div class="split-bar">
                <div class="bar-current" style="width: ${(splits.publisher / 100)}%"></div>
                <div class="bar-target" style="left: ${(splits.targets.publisher / 100)}%"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="ad-tariff-section">
          <h5>Treasury Tariff</h5>
          <div class="tariff-metrics">
            <div class="metric">
              <div class="metric-label">Current</div>
              <div class="metric-value">${(tariff.current_bps / 100).toFixed(2)}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Target</div>
              <div class="metric-value">${(tariff.target_bps / 100).toFixed(2)}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Treasury Contrib.</div>
              <div class="metric-value">${tariff.treasury_contribution_pct.toFixed(1)}%</div>
            </div>
          </div>
          <div class="tariff-info">
            <span class="info-label">Drift Rate:</span>
            <span class="info-value">${(tariff.drift_rate * 100).toFixed(0)}% per epoch</span>
          </div>
        </div>
      </div>
    `;
  }

  showEmergencyProcedure(procedure) {
    console.log('[EconomicControlLaws] Emergency procedure:', procedure);
    
    // TODO: Show modal with detailed emergency procedure
    // For now, alert
    const procedures = {
      'runaway-inflation': 'Check circulating supply calculation, verify epoch execution, inspect coinbase payouts',
      'multiplier-ceiling': 'Identify distressed market, check utilization/margins, review parameter changes',
      'subsidy-oscillation': 'Lower temperature/drift rate, balance alpha/beta, check for multiple distress',
      'tariff-stuck': 'Review treasury contribution targets, check tariff bounds, inspect ad market activity',
    };

    alert(`Emergency Procedure: ${procedure}\n\n${procedures[procedure]}\n\nSee: docs/economics_operator_runbook.md`);
  }

  onUnmount() {
    console.log('[EconomicControlLaws] Cleanup complete');
  }
}

export default EconomicControlLaws;

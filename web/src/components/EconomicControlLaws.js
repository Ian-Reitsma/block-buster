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

class EconomicControlLaws extends Component {
  constructor(rpc) {
    super('EconomicControlLaws');
    this.rpc = rpc;
    this.data = null;
  }

  async fetchData() {
    try {
      if (mockDataManager.isLiveMode()) {
        const [economics, subsidies, multipliers, adSplits] = await Promise.all([
          this.rpc.call('economics.replay', { to_height: 'tip' }),
          this.rpc.call('economics.subsidy_allocation', {}),
          this.rpc.call('economics.market_multipliers', {}),
          this.rpc.call('ad_market.policy_snapshot', {}),
        ]);
        return this.transformLiveData({ economics, subsidies, multipliers, adSplits });
      } else {
        return mockDataManager.mockEconomicControlLaws();
      }
    } catch (error) {
      console.error('[EconomicControlLaws] Failed to fetch:', error);
      return mockDataManager.mockEconomicControlLaws();
    }
  }

  transformLiveData(data) {
    return {
      // Layer 1: Inflation
      inflation: {
        target_bps: data.economics.inflation_target_bps || 500,
        realized_bps: data.economics.realized_inflation_bps || 480,
        error_bps: data.economics.inflation_error_bps || -20,
        annual_issuance: data.economics.annual_issuance_block || 2_000_000,
        controller_gain: data.economics.inflation_controller_gain || 0.10,
        convergence_epochs: 30,
      },
      // Layer 2: Subsidy Allocation
      subsidies: {
        storage: data.subsidies?.storage || { share_bps: 1500, distress: 0.2 },
        compute: data.subsidies?.compute || { share_bps: 3000, distress: 0.1 },
        energy: data.subsidies?.energy || { share_bps: 2000, distress: 0.5 },
        ad: data.subsidies?.ad || { share_bps: 3500, distress: 0.0 },
        drift_rate: data.subsidies?.drift_rate || 0.01,
        temperature: data.subsidies?.temperature || 10000,
      },
      // Layer 3: Market Multipliers
      multipliers: {
        storage: data.multipliers?.storage || { value: 1.2, utilization: 0.65, margin: 0.15 },
        compute: data.multipliers?.compute || { value: 2.5, utilization: 0.82, margin: 0.10 },
        energy: data.multipliers?.energy || { value: 1.8, utilization: 0.58, margin: 0.12 },
        ad: data.multipliers?.ad || { value: 1.5, utilization: 0.70, margin: 0.18 },
        ceiling: 10.0,
        floor: 0.1,
      },
      // Layer 4: Ad Splits & Tariff
      ad: {
        splits: {
          platform: data.adSplits?.platform_share_bps || 2800,
          user: data.adSplits?.user_share_bps || 2200,
          publisher: data.adSplits?.publisher_share_bps || 5000,
          targets: { platform: 2800, user: 2200, publisher: 5000 },
        },
        tariff: {
          current_bps: data.adSplits?.tariff_bps || 50,
          target_bps: 100,
          treasury_contribution_pct: 8.5,
          drift_rate: 0.05,
        },
      },
      epoch: data.economics?.epoch || 0,
      timestamp: Date.now(),
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
      </div>
    `;
    container.appendChild(header);

    // Overall health indicator
    const healthSection = document.createElement('div');
    healthSection.className = 'overall-health';
    healthSection.id = 'overall-health';
    container.appendChild(healthSection);

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

  async onMount() {
    // Fetch initial data
    this.data = await this.fetchData();
    
    // Render all layers
    this.renderOverallHealth();
    this.renderLayer1Inflation();
    this.renderLayer2Subsidies();
    this.renderLayer3Multipliers();
    this.renderLayer4Ad();
    
    // Update epoch counter
    this.updateEpochCounter();

    // Update every 5 seconds
    this.interval(async () => {
      this.data = await this.fetchData();
      this.renderOverallHealth();
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
  }

  calculateOverallHealth() {
    if (!this.data) return { status: 'unknown', label: 'Unknown', icon: '⚪', issues: [] };

    const issues = [];
    let status = 'healthy';

    // Check Layer 1: Inflation
    const inflationError = Math.abs(this.data.inflation.error_bps);
    if (inflationError > 200) {
      status = 'critical';
      issues.push(`🔴 Inflation error: ${inflationError} bps`);
    } else if (inflationError > 100) {
      if (status === 'healthy') status = 'warning';
      issues.push(`🟡 Inflation error: ${inflationError} bps`);
    }

    // Check Layer 3: Multipliers
    Object.entries(this.data.multipliers).forEach(([market, data]) => {
      if (typeof data === 'object' && data.value) {
        if (data.value >= 9.5) {
          status = 'critical';
          issues.push(`🔴 ${market} multiplier at ceiling: ${data.value.toFixed(2)}`);
        } else if (data.value >= 7.0) {
          if (status === 'healthy') status = 'warning';
          issues.push(`🟡 ${market} multiplier high: ${data.value.toFixed(2)}`);
        }
      }
    });

    // Check Layer 2: Subsidy distress
    Object.entries(this.data.subsidies).forEach(([market, data]) => {
      if (typeof data === 'object' && typeof data.distress === 'number') {
        if (data.distress > 0.5) {
          if (status === 'healthy') status = 'warning';
          issues.push(`🟡 ${market} market in distress: ${(data.distress * 100).toFixed(0)}%`);
        }
      }
    });

    const label = status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : 'Healthy';
    const icon = status === 'critical' ? '🔴' : status === 'warning' ? '🟡' : '🟢';

    return { status, label, icon, issues };
  }

  renderLayer1Inflation() {
    const container = $('#layer-1-inflation');
    if (!container || !this.data) return;

    const inflation = this.data.inflation;
    const errorAbs = Math.abs(inflation.error_bps);
    const errorStatus = errorAbs > 200 ? 'critical' : errorAbs > 50 ? 'warning' : 'healthy';
    const errorSign = inflation.error_bps > 0 ? '+' : '';

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
            <div class="metric-value">${(inflation.realized_bps / 100).toFixed(2)}%</div>
            <div class="metric-unit">actual</div>
          </div>
          <div class="metric">
            <div class="metric-label">Error</div>
            <div class="metric-value status-${errorStatus}">${errorSign}${inflation.error_bps} bps</div>
            <div class="metric-unit">deviation</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${Math.min(100, (inflation.realized_bps / inflation.target_bps) * 100)}%"></div>
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
            <span class="info-value">${fmt.num(inflation.annual_issuance)} BLOCK</span>
          </div>
          <div class="info-row">
            <span class="info-label">Controller Gain:</span>
            <span class="info-value">${(inflation.controller_gain * 100).toFixed(0)}%</span>
          </div>
          <div class="info-row">
            <span class="info-label">Convergence:</span>
            <span class="info-value">±1% in ${inflation.convergence_epochs} epochs (~1 hour)</span>
          </div>
        </div>
      </div>
    `;
  }

  renderLayer2Subsidies() {
    const container = $('#layer-2-subsidies');
    if (!container || !this.data) return;

    const subsidies = this.data.subsidies;
    const markets = ['storage', 'compute', 'energy', 'ad'];
    
    const totalShares = markets.reduce((sum, m) => sum + (subsidies[m]?.share_bps || 0), 0);
    const maxDistress = Math.max(...markets.map(m => subsidies[m]?.distress || 0));
    const layerStatus = maxDistress > 0.5 ? 'warning' : 'healthy';

    container.innerHTML = `
      <div class="layer-header">
        <h4>Layer 2: Subsidy Allocation</h4>
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
    
    const maxMultiplier = Math.max(...markets.map(m => multipliers[m]?.value || 0));
    const layerStatus = maxMultiplier >= 9.5 ? 'critical' : maxMultiplier >= 7.0 ? 'warning' : 'healthy';

    container.innerHTML = `
      <div class="layer-header">
        <h4>Layer 3: Market Multipliers</h4>
        <span class="layer-status status-${layerStatus}">
          ${layerStatus === 'critical' ? '🔴' : layerStatus === 'warning' ? '🟡' : '🟢'}
        </span>
      </div>
      <div class="layer-content">
        <div class="multipliers-grid">
          ${markets.map(market => {
            const data = multipliers[market];
            const multiplierStatus = data.value >= 9.5 ? 'critical' : data.value >= 7.0 ? 'warning' : 'healthy';
            const utilizationPct = (data.utilization * 100).toFixed(0);
            const marginPct = (data.margin * 100).toFixed(1);
            
            return `
              <div class="multiplier-card status-${multiplierStatus}">
                <div class="multiplier-header">
                  <span class="multiplier-market">${market}</span>
                  <span class="multiplier-value">${data.value.toFixed(2)}x</span>
                </div>
                <div class="multiplier-gauge">
                  <div class="gauge-track">
                    <div class="gauge-fill" style="width: ${Math.min(100, (data.value / multipliers.ceiling) * 100)}%"></div>
                    <div class="gauge-markers">
                      <span class="marker" style="left: 10%"></span>
                      <span class="marker" style="left: 50%"></span>
                      <span class="marker critical" style="left: 95%" title="Ceiling: ${multipliers.ceiling}x"></span>
                    </div>
                  </div>
                </div>
                <div class="multiplier-metrics">
                  <div class="metric-small">
                    <span class="metric-label">Utilization:</span>
                    <span class="metric-value">${utilizationPct}%</span>
                  </div>
                  <div class="metric-small">
                    <span class="metric-label">Margin:</span>
                    <span class="metric-value">${marginPct}%</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="layer-info">
          <div class="info-row">
            <span class="info-label">Ceiling:</span>
            <span class="info-value">${multipliers.ceiling}x</span>
          </div>
          <div class="info-row">
            <span class="info-label">Floor:</span>
            <span class="info-value">${multipliers.floor}x</span>
          </div>
          <div class="info-row">
            <span class="info-label">Control:</span>
            <span class="info-value">Dual (Utilization + Margins)</span>
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

/**
 * Provider Performance Leaderboard
 * 
 * Tracks and ranks providers across all markets:
 * - Service badges (operational readiness)
 * - Uptime and reliability
 * - Margin and profitability
 * - Settlement volumes
 * - Dispute rates
 * 
 * Based on: ~/projects/the-block/docs/architecture.md#market-receipts-and-audit-trail
 */

import mockDataManager from '../mock-data-manager.js';

export default class ProviderLeaderboard {
  constructor(container) {
    this.container = container;
    this.selectedMarket = 'all';
    this.sortBy = 'score_desc';
    this.timeRange = '24h';
    this.updateInterval = null;
  }

  render() {
    const data = this.getLeaderboardData();
    
    this.container.innerHTML = `
      <div class="provider-leaderboard">
        <!-- Header -->
        <div class="leaderboard-header">
          <h2>Provider Performance Leaderboard</h2>
          <div class="leaderboard-subtitle">
            Rankings based on service badges, uptime, margin, and reliability
          </div>
        </div>

        <!-- Summary Stats -->
        <div class="leaderboard-summary">
          <div class="summary-card">
            <div class="summary-label">Total Providers</div>
            <div class="summary-value">${data.total_providers}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Active (24h)</div>
            <div class="summary-value">${data.active_providers_24h}</div>
            <div class="summary-change positive">↑ ${data.new_providers_24h} new</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Avg Uptime</div>
            <div class="summary-value">${data.avg_uptime_pct.toFixed(2)}%</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">With Badges</div>
            <div class="summary-value">${data.badged_providers}</div>
            <div class="summary-pct">${(data.badged_providers / data.total_providers * 100).toFixed(1)}%</div>
          </div>
        </div>

        <!-- Controls -->
        <div class="leaderboard-controls">
          <div class="control-group">
            <label>Market:</label>
            <select id="market-filter">
              <option value="all" ${this.selectedMarket === 'all' ? 'selected' : ''}>All Markets</option>
              <option value="storage" ${this.selectedMarket === 'storage' ? 'selected' : ''}>Storage</option>
              <option value="compute" ${this.selectedMarket === 'compute' ? 'selected' : ''}>Compute</option>
              <option value="energy" ${this.selectedMarket === 'energy' ? 'selected' : ''}>Energy</option>
              <option value="ad" ${this.selectedMarket === 'ad' ? 'selected' : ''}>Ad</option>
            </select>
          </div>

          <div class="control-group">
            <label>Time Range:</label>
            <select id="time-range">
              <option value="1h" ${this.timeRange === '1h' ? 'selected' : ''}>Last Hour</option>
              <option value="24h" ${this.timeRange === '24h' ? 'selected' : ''}>Last 24h</option>
              <option value="7d" ${this.timeRange === '7d' ? 'selected' : ''}>Last 7 days</option>
              <option value="30d" ${this.timeRange === '30d' ? 'selected' : ''}>Last 30 days</option>
              <option value="all" ${this.timeRange === 'all' ? 'selected' : ''}>All Time</option>
            </select>
          </div>

          <div class="control-group">
            <label>Sort By:</label>
            <select id="sort-by">
              <option value="score_desc" ${this.sortBy === 'score_desc' ? 'selected' : ''}>Performance Score</option>
              <option value="uptime_desc" ${this.sortBy === 'uptime_desc' ? 'selected' : ''}>Uptime</option>
              <option value="volume_desc" ${this.sortBy === 'volume_desc' ? 'selected' : ''}>Settlement Volume</option>
              <option value="margin_desc" ${this.sortBy === 'margin_desc' ? 'selected' : ''}>Margin</option>
              <option value="reliability_desc" ${this.sortBy === 'reliability_desc' ? 'selected' : ''}>Reliability</option>
            </select>
          </div>

          <button id="export-leaderboard" class="secondary-button">Export CSV</button>
        </div>

        <!-- Service Badge Legend -->
        <div class="badge-legend">
          <h3>Service Badge Tiers</h3>
          <div class="badge-legend-items">
            <div class="badge-legend-item">
              <div class="badge-icon gold">★</div>
              <div class="badge-info">
                <div class="badge-name">Gold Badge</div>
                <div class="badge-reqs">99.9%+ uptime, 0 disputes, 30d+ streak</div>
              </div>
            </div>
            <div class="badge-legend-item">
              <div class="badge-icon silver">★</div>
              <div class="badge-info">
                <div class="badge-name">Silver Badge</div>
                <div class="badge-reqs">99%+ uptime, <2 disputes, 14d+ streak</div>
              </div>
            </div>
            <div class="badge-legend-item">
              <div class="badge-icon bronze">★</div>
              <div class="badge-info">
                <div class="badge-name">Bronze Badge</div>
                <div class="badge-reqs">95%+ uptime, <5 disputes, 7d+ streak</div>
              </div>
            </div>
            <div class="badge-legend-item">
              <div class="badge-icon none">○</div>
              <div class="badge-info">
                <div class="badge-name">No Badge</div>
                <div class="badge-reqs">Below badge thresholds</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Leaderboard Table -->
        <div class="leaderboard-table-container">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th class="rank-col">Rank</th>
                <th class="badge-col">Badge</th>
                <th class="provider-col">Provider</th>
                <th class="market-col">Market</th>
                <th class="score-col">Score</th>
                <th class="uptime-col">Uptime</th>
                <th class="volume-col">Volume</th>
                <th class="margin-col">Margin</th>
                <th class="reliability-col">Reliability</th>
                <th class="disputes-col">Disputes</th>
                <th class="streak-col">Streak</th>
              </tr>
            </thead>
            <tbody>
              ${this.renderLeaderboardRows(data.providers)}
            </tbody>
          </table>
        </div>

        <!-- Provider Details Modal (hidden by default) -->
        <div id="provider-modal" class="modal" style="display: none;">
          <div class="modal-content">
            <span class="modal-close">&times;</span>
            <div id="provider-details"></div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderLeaderboardRows(providers) {
    const filtered = this.filterProviders(providers);
    const sorted = this.sortProviders(filtered);
    
    return sorted.map((provider, index) => {
      const rank = index + 1;
      const rankClass = rank <= 3 ? `top-${rank}` : '';
      const badgeIcon = this.getBadgeIcon(provider.badge);
      const badgeClass = provider.badge || 'none';
      
      return `
        <tr class="provider-row ${rankClass}" data-provider-id="${provider.id}">
          <td class="rank-col">
            <div class="rank-badge ${rankClass}">${rank}</div>
          </td>
          <td class="badge-col">
            <div class="service-badge ${badgeClass}" title="${provider.badge || 'No badge'}">
              ${badgeIcon}
            </div>
          </td>
          <td class="provider-col">
            <div class="provider-info">
              <div class="provider-name">${provider.name}</div>
              <div class="provider-id-short">${provider.id.slice(0, 12)}...</div>
            </div>
          </td>
          <td class="market-col">
            <span class="market-badge ${provider.market}">${this.formatMarket(provider.market)}</span>
          </td>
          <td class="score-col">
            <div class="score-value">${provider.performance_score.toFixed(1)}</div>
            <div class="score-bar">
              <div class="score-fill" style="width: ${provider.performance_score}%"></div>
            </div>
          </td>
          <td class="uptime-col">
            <div class="uptime-value ${this.getUptimeClass(provider.uptime_pct)}">
              ${provider.uptime_pct.toFixed(2)}%
            </div>
          </td>
          <td class="volume-col">
            <div class="volume-value">${this.formatVolume(provider.settlement_volume)}</div>
            <div class="volume-count">${provider.settlement_count} txs</div>
          </td>
          <td class="margin-col">
            <div class="margin-value ${this.getMarginClass(provider.margin_pct)}">
              ${provider.margin_pct > 0 ? '+' : ''}${provider.margin_pct.toFixed(1)}%
            </div>
          </td>
          <td class="reliability-col">
            <div class="reliability-value">${(provider.reliability_score * 100).toFixed(1)}%</div>
          </td>
          <td class="disputes-col">
            <div class="disputes-value ${provider.disputes > 0 ? 'warning' : 'success'}">
              ${provider.disputes}
            </div>
          </td>
          <td class="streak-col">
            <div class="streak-value">${provider.uptime_streak_days}d</div>
          </td>
        </tr>
      `;
    }).join('');
  }

  getBadgeIcon(badge) {
    const icons = {
      gold: '★',
      silver: '★',
      bronze: '★',
    };
    return icons[badge] || '○';
  }

  getUptimeClass(uptime) {
    if (uptime >= 99.9) return 'excellent';
    if (uptime >= 99.0) return 'good';
    if (uptime >= 95.0) return 'fair';
    return 'poor';
  }

  getMarginClass(margin) {
    if (margin >= 15) return 'excellent';
    if (margin >= 10) return 'good';
    if (margin >= 5) return 'fair';
    if (margin >= 0) return 'marginal';
    return 'negative';
  }

  formatMarket(market) {
    const names = {
      storage: 'Storage',
      compute: 'Compute',
      energy: 'Energy',
      ad: 'Ad',
    };
    return names[market] || market;
  }

  formatVolume(volume) {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(2)}K`;
    return volume.toString();
  }

  getLeaderboardData() {
    if (mockDataManager.isMockMode()) {
      return mockDataManager.mockProviderLeaderboard({
        market: this.selectedMarket,
        timeRange: this.timeRange,
      });
    }
    // TODO: Fetch from live RPC
    return mockDataManager.mockProviderLeaderboard({
      market: this.selectedMarket,
      timeRange: this.timeRange,
    });
  }

  filterProviders(providers) {
    if (this.selectedMarket === 'all') {
      return providers;
    }
    return providers.filter(p => p.market === this.selectedMarket);
  }

  sortProviders(providers) {
    const sorted = [...providers];
    switch (this.sortBy) {
      case 'score_desc':
        return sorted.sort((a, b) => b.performance_score - a.performance_score);
      case 'uptime_desc':
        return sorted.sort((a, b) => b.uptime_pct - a.uptime_pct);
      case 'volume_desc':
        return sorted.sort((a, b) => b.settlement_volume - a.settlement_volume);
      case 'margin_desc':
        return sorted.sort((a, b) => b.margin_pct - a.margin_pct);
      case 'reliability_desc':
        return sorted.sort((a, b) => b.reliability_score - a.reliability_score);
      default:
        return sorted;
    }
  }

  attachEventListeners() {
    // Market filter
    const marketFilter = this.container.querySelector('#market-filter');
    if (marketFilter) {
      marketFilter.addEventListener('change', (e) => {
        this.selectedMarket = e.target.value;
        this.render();
      });
    }

    // Time range
    const timeRange = this.container.querySelector('#time-range');
    if (timeRange) {
      timeRange.addEventListener('change', (e) => {
        this.timeRange = e.target.value;
        this.render();
      });
    }

    // Sort
    const sortBy = this.container.querySelector('#sort-by');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.render();
      });
    }

    // Export
    const exportBtn = this.container.querySelector('#export-leaderboard');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToCSV());
    }

    // Provider row click
    const providerRows = this.container.querySelectorAll('.provider-row');
    providerRows.forEach(row => {
      row.addEventListener('click', (e) => {
        const providerId = e.currentTarget.dataset.providerId;
        this.showProviderDetails(providerId);
      });
    });

    // Modal close
    const modalClose = this.container.querySelector('.modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        this.hideProviderDetails();
      });
    }
  }

  showProviderDetails(providerId) {
    const modal = this.container.querySelector('#provider-modal');
    const detailsContainer = this.container.querySelector('#provider-details');
    
    // Get provider data
    const data = this.getLeaderboardData();
    const provider = data.providers.find(p => p.id === providerId);
    
    if (!provider) return;

    detailsContainer.innerHTML = `
      <h2>${provider.name}</h2>
      <div class="provider-details-grid">
        <div class="detail-section">
          <h3>Identity</h3>
          <div class="detail-item">
            <span class="detail-label">Provider ID:</span>
            <span class="detail-value mono">${provider.id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Market:</span>
            <span class="detail-value">${this.formatMarket(provider.market)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Badge:</span>
            <span class="detail-value">${provider.badge || 'None'}</span>
          </div>
        </div>

        <div class="detail-section">
          <h3>Performance</h3>
          <div class="detail-item">
            <span class="detail-label">Score:</span>
            <span class="detail-value">${provider.performance_score.toFixed(2)}/100</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Uptime:</span>
            <span class="detail-value">${provider.uptime_pct.toFixed(3)}%</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Reliability:</span>
            <span class="detail-value">${(provider.reliability_score * 100).toFixed(2)}%</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Streak:</span>
            <span class="detail-value">${provider.uptime_streak_days} days</span>
          </div>
        </div>

        <div class="detail-section">
          <h3>Settlements</h3>
          <div class="detail-item">
            <span class="detail-label">Volume:</span>
            <span class="detail-value">${this.formatVolume(provider.settlement_volume)} BLOCK</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Count:</span>
            <span class="detail-value">${provider.settlement_count.toLocaleString()}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Margin:</span>
            <span class="detail-value">${provider.margin_pct.toFixed(2)}%</span>
          </div>
        </div>

        <div class="detail-section">
          <h3>Disputes</h3>
          <div class="detail-item">
            <span class="detail-label">Total:</span>
            <span class="detail-value">${provider.disputes}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Resolved:</span>
            <span class="detail-value">${provider.disputes_resolved}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Pending:</span>
            <span class="detail-value">${provider.disputes - provider.disputes_resolved}</span>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'block';
  }

  hideProviderDetails() {
    const modal = this.container.querySelector('#provider-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  exportToCSV() {
    const data = this.getLeaderboardData();
    const filtered = this.filterProviders(data.providers);
    const sorted = this.sortProviders(filtered);
    
    const csv = [
      ['Rank', 'Provider ID', 'Name', 'Market', 'Badge', 'Score', 'Uptime %', 'Volume', 'Margin %', 'Reliability', 'Disputes', 'Streak (days)'].join(','),
      ...sorted.map((provider, index) => [
        index + 1,
        provider.id,
        provider.name,
        provider.market,
        provider.badge || 'none',
        provider.performance_score.toFixed(2),
        provider.uptime_pct.toFixed(3),
        provider.settlement_volume,
        provider.margin_pct.toFixed(2),
        (provider.reliability_score * 100).toFixed(2),
        provider.disputes,
        provider.uptime_streak_days,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provider_leaderboard_${this.selectedMarket}_${Date.now()}.csv`;
    a.click();
  }

  startAutoUpdate(interval = 10000) {
    this.stopAutoUpdate();
    this.updateInterval = setInterval(() => {
      this.render();
    }, interval);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  destroy() {
    this.stopAutoUpdate();
  }
}

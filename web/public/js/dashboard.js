/**
 * Dashboard Health Metrics Controller
 * Populates compressed header + hero tiles with real-time system health
 */

(function() {
  'use strict';
  
  if (typeof document === 'undefined') return;
  
  // Only run on dashboard page
  const isDashboard = window.location.pathname.includes('dashboard.html') || 
                     window.location.pathname.endsWith('dashboard');
  if (!isDashboard) return;

  // ===== STATE =====
  let healthData = {
    lag: null,
    errors: null,
    db: null,
    flush: null,
    comp: null,
    uptime: null,
    blockHeight: null,
    engine: null,
    wallet: null,
    gates: null,
    netPnl: null,
    lastUpdated: null
  };

  // ===== ELEMENTS =====
  const elements = {
    // Header elements
    systemHealthPill: document.getElementById('system-health-pill'),
    gateSummary: document.getElementById('gate-summary'),
    healthErrorsPrimary: document.getElementById('health-errors-primary'),
    healthLagPrimary: document.getElementById('health-lag-primary'),
    healthDetails: document.getElementById('health-details'),
    
    // Detail breakdown (inside <details>)
    healthLag: document.getElementById('health-lag'),
    healthErrors: document.getElementById('health-errors'),
    healthDb: document.getElementById('health-db'),
    healthFlush: document.getElementById('health-flush'),
    healthComp: document.getElementById('health-comp'),
    dashboardUpdated: document.getElementById('dashboard-updated'),
    
    // Hero strip - chain metrics
    uptime: document.getElementById('uptime'),
    uptimePill: document.getElementById('uptime-pill'),
    uptimeUpdated: document.getElementById('uptime-updated'),
    blockHeight: document.getElementById('block-height'),
    networkPill: document.getElementById('network-pill'),
    blockUpdated: document.getElementById('block-updated'),
    engineState: document.getElementById('engine-state'),
    enginePill: document.getElementById('engine-pill'),
    engineUpdated: document.getElementById('engine-updated'),
    heroMarketGate: document.getElementById('hero-market-gate'),
    heroMarketGatePill: document.getElementById('hero-market-gate-pill'),
    heroMarketGateUpdated: document.getElementById('hero-market-gate-updated'),
    
    // Hero strip - trading metrics
    walletStatus: document.getElementById('wallet-status'),
    walletEligibility: document.getElementById('wallet-eligibility'),
    walletPill: document.getElementById('wallet-pill'),
    walletUpdated: document.getElementById('wallet-updated'),
    walletGuidance: document.getElementById('wallet-guidance'),
    walletGuidanceDismiss: document.getElementById('wallet-guidance-dismiss'),
    heroNetPnl: document.getElementById('hero-net-pnl'),
    heroNetPnlChange: document.getElementById('hero-net-pnl-change'),
    heroNetPnlPill: document.getElementById('hero-net-pnl-pill'),
    heroNetPnlUpdated: document.getElementById('hero-net-pnl-updated')
  };

  // ===== HELPERS =====
  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function formatTime(ms) {
    if (ms == null || isNaN(ms)) return '—';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 10000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatUptime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function formatNumber(val) {
    if (val == null || isNaN(val)) return '—';
    return val.toLocaleString();
  }

  function formatCurrency(val) {
    if (val == null || isNaN(val)) return '—';
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatPercent(val) {
    if (val == null || isNaN(val)) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  }

  function now() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function setPillStatus(el, status) {
    if (!el) return;
    el.className = 'pill';
    switch (status) {
      case 'good':
      case 'live':
      case 'ok':
        el.classList.add('pill--good');
        break;
      case 'warn':
      case 'degraded':
        el.classList.add('pill--warn');
        break;
      case 'bad':
      case 'down':
        el.classList.add('pill--bad');
        break;
      default:
        el.classList.add('pill--info');
    }
  }

  // ===== SYSTEM HEALTH COMPUTATION =====
  function computeSystemHealth() {
    // Determine overall status from metrics
    const { errors, lag, db, flush } = healthData;
    
    // Critical: high errors or severe lag
    if (errors != null && errors > 10) return 'bad';
    if (lag != null && lag > 5000) return 'bad'; // > 5s lag
    
    // Degraded: some errors or moderate lag
    if (errors != null && errors > 3) return 'warn';
    if (lag != null && lag > 1000) return 'warn'; // > 1s lag
    if (db != null && db > 100) return 'warn'; // DB WAL > 100MB
    if (flush != null && flush > 60) return 'warn'; // Flush > 60s
    
    // Good: everything nominal
    return 'good';
  }

  // ===== UPDATE FUNCTIONS =====
  function updateHealthHeader() {
    const status = computeSystemHealth();
    const { errors, lag } = healthData;
    
    // Update primary pill
    if (elements.systemHealthPill) {
      setPillStatus(elements.systemHealthPill, status);
      const labels = { good: 'LIVE', warn: 'DEGRADED', bad: 'DOWN' };
      setText(elements.systemHealthPill, labels[status] || 'UNKNOWN');
      elements.systemHealthPill.dataset.status = status;
    }
    
    // Update primary metrics (errors + lag)
    setText(elements.healthErrorsPrimary, `errors: ${errors ?? '—'}`);
    setText(elements.healthLagPrimary, `lag: ${formatTime(lag)}`);
    
    // Update detail breakdown
    setText(elements.healthLag, formatTime(lag));
    setText(elements.healthErrors, errors ?? '—');
    setText(elements.healthDb, healthData.db != null ? `${healthData.db}MB` : '—');
    setText(elements.healthFlush, healthData.flush != null ? `${healthData.flush}s` : '—');
    setText(elements.healthComp, healthData.comp ?? '—');
    
    // Update last updated time
    setText(elements.dashboardUpdated, now());
  }

  function updateChainMetrics() {
    const { uptime, blockHeight, engine } = healthData;
    
    // Uptime
    if (elements.uptime) {
      setText(elements.uptime, formatUptime(uptime));
      elements.uptime.classList.remove('skeleton');
      setText(elements.uptimeUpdated, now());
      if (elements.uptimePill) {
        if (uptime != null && uptime > 3600) {
          setPillStatus(elements.uptimePill, 'good');
          setText(elements.uptimePill, 'STABLE');
        } else {
          setPillStatus(elements.uptimePill, 'warn');
          setText(elements.uptimePill, 'RECENT');
        }
      }
    }
    
    // Block Height
    if (elements.blockHeight) {
      setText(elements.blockHeight, formatNumber(blockHeight));
      elements.blockHeight.classList.remove('skeleton');
      setText(elements.blockUpdated, now());
    }
    
    // Engine
    if (elements.engineState) {
      const stateText = engine?.state || 'Unknown';
      setText(elements.engineState, stateText);
      elements.engineState.classList.remove('skeleton');
      setText(elements.engineUpdated, now());
      if (elements.enginePill) {
        const status = stateText.toLowerCase();
        if (status.includes('running') || status.includes('active')) {
          setPillStatus(elements.enginePill, 'good');
          setText(elements.enginePill, 'ACTIVE');
        } else if (status.includes('idle') || status.includes('ready')) {
          setPillStatus(elements.enginePill, 'info');
          setText(elements.enginePill, 'READY');
        } else {
          setPillStatus(elements.enginePill, 'warn');
          setText(elements.enginePill, 'PENDING');
        }
      }
    }
  }

  function updateGateMetrics() {
    const { gates } = healthData;
    
    if (gates && elements.gateSummary) {
      const openGates = gates.filter(g => g.state?.toLowerCase() === 'trade').length;
      const total = gates.length;
      setText(elements.gateSummary, `gates ${openGates}/${total}`);
      
      // Update hero market gate tile
      if (elements.heroMarketGate) {
        const summary = openGates === total ? 'All Open' : 
                       openGates === 0 ? 'All Closed' : 
                       `${openGates}/${total} Open`;
        setText(elements.heroMarketGate, summary);
        elements.heroMarketGate.classList.remove('skeleton');
        setText(elements.heroMarketGateUpdated, now());
        
        if (elements.heroMarketGatePill) {
          if (openGates === total) {
            setPillStatus(elements.heroMarketGatePill, 'good');
            setText(elements.heroMarketGatePill, 'TRADE');
          } else if (openGates > 0) {
            setPillStatus(elements.heroMarketGatePill, 'warn');
            setText(elements.heroMarketGatePill, 'PARTIAL');
          } else {
            setPillStatus(elements.heroMarketGatePill, 'info');
            setText(elements.heroMarketGatePill, 'GATED');
          }
        }
      }
    }
  }

  function updateWalletMetrics() {
    const { wallet } = healthData;
    
    if (elements.walletStatus) {
      const status = wallet?.connected ? 'Connected' : 'Disconnected';
      const address = wallet?.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : null;
      setText(elements.walletStatus, address || status);
      elements.walletStatus.classList.remove('skeleton');
      setText(elements.walletUpdated, now());
      
      // Update eligibility
      if (elements.walletEligibility) {
        const eligible = wallet?.tradingEligible ? 'Eligible' : 'Ineligible';
        setText(elements.walletEligibility, `Eligibility: ${eligible}`);
      }
      
      // Update pill
      if (elements.walletPill) {
        if (wallet?.connected && wallet?.tradingEligible) {
          setPillStatus(elements.walletPill, 'good');
          setText(elements.walletPill, 'READY');
        } else if (wallet?.connected) {
          setPillStatus(elements.walletPill, 'warn');
          setText(elements.walletPill, 'CONNECTED');
        } else {
          setPillStatus(elements.walletPill, 'info');
          setText(elements.walletPill, 'DISCONNECTED');
        }
      }
      
      // Show/hide wallet guidance banner
      if (elements.walletGuidance) {
        if (!wallet?.connected || !wallet?.tradingEligible) {
          elements.walletGuidance.classList.remove('hidden');
        }
      }
    }
  }

  function updatePnlMetrics() {
    const { netPnl } = healthData;
    
    if (elements.heroNetPnl && netPnl != null) {
      setText(elements.heroNetPnl, formatCurrency(netPnl.value));
      elements.heroNetPnl.classList.remove('skeleton');
      setText(elements.heroNetPnlUpdated, now());
      
      // Update change indicator
      if (elements.heroNetPnlChange && netPnl.change != null) {
        const changeText = formatPercent(netPnl.change);
        setText(elements.heroNetPnlChange, changeText);
        elements.heroNetPnlChange.className = 'text-xs';
        if (netPnl.change > 0) {
          elements.heroNetPnlChange.classList.add('text-good');
        } else if (netPnl.change < 0) {
          elements.heroNetPnlChange.classList.add('text-bad');
        } else {
          elements.heroNetPnlChange.classList.add('text-gray-400');
        }
      }
      
      // Update pill
      if (elements.heroNetPnlPill) {
        if (netPnl.value > 0) {
          setPillStatus(elements.heroNetPnlPill, 'good');
          setText(elements.heroNetPnlPill, 'PROFIT');
        } else if (netPnl.value < 0) {
          setPillStatus(elements.heroNetPnlPill, 'bad');
          setText(elements.heroNetPnlPill, 'LOSS');
        } else {
          setPillStatus(elements.heroNetPnlPill, 'info');
          setText(elements.heroNetPnlPill, 'FLAT');
        }
      }
    }
  }

  // ===== DATA FETCHING =====
  async function fetchHealthMetrics() {
    try {
      const response = await fetch(`${window.API_BASE || ''}/health`, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
      
      const data = await response.json();
      
      // Update health data
      healthData.lag = data.feature_lag_ms;
      healthData.errors = data.error_count;
      healthData.db = data.db_wal_mb;
      healthData.flush = data.flush_lag_s;
      healthData.comp = data.compaction_queue;
      healthData.uptime = data.uptime_s;
      healthData.lastUpdated = Date.now();
      
      updateHealthHeader();
      updateChainMetrics();
    } catch (error) {
      console.warn('Failed to fetch health metrics:', error);
      // Set degraded state on fetch failure
      if (elements.systemHealthPill) {
        setPillStatus(elements.systemHealthPill, 'warn');
        setText(elements.systemHealthPill, 'DEGRADED');
      }
    }
  }

  async function fetchNetworkStatus() {
    try {
      const response = await fetch(`${window.API_BASE || ''}/theblock/network`, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`Network endpoint returned ${response.status}`);
      
      const data = await response.json();
      
      healthData.blockHeight = data.block_height;
      healthData.engine = { state: data.engine_state || 'Unknown' };
      
      updateChainMetrics();
    } catch (error) {
      console.warn('Failed to fetch network status:', error);
    }
  }

  async function fetchGateStatus() {
    try {
      const response = await fetch(`${window.API_BASE || ''}/theblock/gates`, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`Gates endpoint returned ${response.status}`);
      
      const gates = await response.json();
      healthData.gates = Array.isArray(gates) ? gates : [];
      
      updateGateMetrics();
    } catch (error) {
      console.warn('Failed to fetch gate status:', error);
    }
  }

  async function fetchWalletStatus() {
    try {
      const response = await fetch(`${window.API_BASE || ''}/wallet/status`, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`Wallet endpoint returned ${response.status}`);
      
      const data = await response.json();
      healthData.wallet = data;
      
      updateWalletMetrics();
    } catch (error) {
      console.warn('Failed to fetch wallet status:', error);
      // Default to disconnected on error
      healthData.wallet = { connected: false, tradingEligible: false };
      updateWalletMetrics();
    }
  }

  async function fetchPnlStatus() {
    try {
      const response = await fetch(`${window.API_BASE || ''}/risk/pnl`, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`PnL endpoint returned ${response.status}`);
      
      const data = await response.json();
      healthData.netPnl = {
        value: data.net_pnl || 0,
        change: data.change_24h_pct || 0
      };
      
      updatePnlMetrics();
    } catch (error) {
      console.warn('Failed to fetch PnL status:', error);
    }
  }

  async function refreshDashboard() {
    await Promise.all([
      fetchHealthMetrics(),
      fetchNetworkStatus(),
      fetchGateStatus(),
      fetchWalletStatus(),
      fetchPnlStatus()
    ]);
  }

  // ===== EVENT HANDLERS =====
  function setupEventHandlers() {
    // Wallet guidance dismiss
    if (elements.walletGuidanceDismiss) {
      elements.walletGuidanceDismiss.addEventListener('click', () => {
        if (elements.walletGuidance) {
          elements.walletGuidance.classList.add('hidden');
          localStorage.setItem('walletGuidanceDismissed', 'true');
        }
      });
    }
    
    // Check if guidance was dismissed
    if (localStorage.getItem('walletGuidanceDismissed') === 'true' && elements.walletGuidance) {
      elements.walletGuidance.classList.add('hidden');
    }
    
    // Rotate chevron on details toggle
    if (elements.healthDetails) {
      elements.healthDetails.addEventListener('toggle', () => {
        const chevron = document.getElementById('health-chevron');
        if (chevron) {
          if (elements.healthDetails.open) {
            chevron.style.transform = 'rotate(180deg)';
          } else {
            chevron.style.transform = 'rotate(0deg)';
          }
        }
      });
    }
  }

  // ===== INITIALIZATION =====
  function init() {
    console.log('[Dashboard] Initializing health metrics controller');
    
    setupEventHandlers();
    
    // Initial fetch
    refreshDashboard();
    
    // Poll every 5 seconds
    setInterval(refreshDashboard, 5000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

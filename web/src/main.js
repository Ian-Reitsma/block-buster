// Block Buster Dashboard - First-party, zero-dependency SPA
// Architecture: Observable state + lifecycle management + declarative rendering

import appState from './state.js';
import RpcClient from './rpc.js';
import MockRpcClient from './rpc-mock.js';
import Router from './router.js';
import Navigation from './components/Navigation.js';
import ConnectionStatus from './components/ConnectionStatus.js';
import MockModeNotice from './components/MockModeNotice.js';
import WhatsNewModal from './components/WhatsNewModal.js';
import KeyboardShortcuts from './components/KeyboardShortcuts.js';
import TheBlock from './components/TheBlock.js';
import Economics from './components/Economics.js';
import Trading from './components/Trading.js';
import Network from './components/Network.js';
import EnergyMarket from './components/EnergyMarket.js';
import AdMarket from './components/AdMarket.js';
import ComputeMarket from './components/ComputeMarket.js';
import StorageMarket from './components/StorageMarket.js';
import Governance from './components/Governance.js';
import Treasury from './components/Treasury.js';
import BlockWebSocket from './ws.js';
import errorBoundary from './errors.js';
import features from './features.js';
import perf from './perf.js';
import { $ } from './utils.js';
import mockDataManager from './mock-data-manager.js';

// Configuration
const API_BASE = window.BLOCK_BUSTER_API || 'http://localhost:5000';
const WS_URL = window.BLOCK_BUSTER_WS || 'ws://localhost:5000/ws';
const HEALTH_URL = window.BLOCK_BUSTER_HEALTH || `${API_BASE}/health`;

// Initialize RPC client (real or mock based on feature flag and backend availability)
let rpc;
let backendAvailable = false;

function initializeRpcClient(forceMock = false) {
  // Check if mock mode is forced or enabled
  if (forceMock || features.isEnabled('mock_rpc')) {
    console.log('[App] Using mock RPC client with realistic blockchain data');
    return new MockRpcClient(API_BASE);
  }
  
  // Use real RPC client
  console.log('[App] Using real RPC client');
  return new RpcClient(API_BASE, {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
  });
}

// Initialize WebSocket (conditional on feature flag)
let websocket = null;

// Initialize router
const router = new Router();

// Define routes configuration
const routesConfig = [
  { path: 'theblock', label: 'The Block', component: TheBlock },
  { path: 'economics', label: 'Economics', component: Economics },
  { path: 'energy', label: 'Energy Market', component: EnergyMarket },
  { path: 'ads', label: 'Ad Market', component: AdMarket },
  { path: 'compute', label: 'Compute Market', component: ComputeMarket },
  { path: 'storage', label: 'Storage Market', component: StorageMarket },
  { path: 'governance', label: 'Governance', component: Governance },
  { path: 'treasury', label: 'Treasury', component: Treasury },
  { path: 'trading', label: 'Trading', component: Trading },
  { path: 'network', label: 'Network', component: Network },
];

// Initialize components (will be created after RPC client is initialized)
const components = {};

// Initialize navigation
const navigation = new Navigation(routesConfig);

// Initialize connection status indicator
const connectionStatus = new ConnectionStatus();

// Initialize What's New modal
const whatsNewModal = new WhatsNewModal();

// Initialize keyboard shortcuts (will be passed router later)
let keyboardShortcuts = null;

// Initialize mock mode notice
const mockModeNotice = new MockModeNotice();

// Initialize global state
function initializeState() {
  // Set initial state values
  appState.set('offline', false);
  appState.set('route', router.getCurrentPath());
  appState.set('connectionMode', 'DETECTING');

  // Mock data for initial render (will be replaced by API calls)
  appState.set('metrics', {
    tps: 0,
    fees: 0,
    latencyMs: 0,
    peers: 0,
    blockHeight: 0,
    issuance: 0,
  });

  appState.set('priceHistory', [12, 18, 14, 20, 25, 21, 26, 24, 28, 27]);

  appState.set('orders', [
    { token: 'BLOCK', side: 'BUY', qty: 120, price: 1.12, timestamp: Date.now() },
    { token: 'BLOCK', side: 'SELL', qty: 80, price: 1.15, timestamp: Date.now() },
    { token: 'GPU', side: 'BUY', qty: 5, price: 220.0, timestamp: Date.now() },
  ]);

  appState.set('network', {
    metrics: null,
    markets: null,
    scheduler: null,
    peers: null,
    lastUpdated: null,
    error: null,
  });

  appState.set('fullcheck', {
    status: 'idle',
    running: false,
    steps: [],
    summary_score: null,
    duration_ms: null,
    started_at: null,
    error: null,
  });

  appState.set('fullcheckInput', {
    domain: 'demo.block',
    fileMeta: null,
    hashing: false,
    storageDryRun: false,
  });
}

// Health check for offline detection
async function checkHealth() {
  // If we're already in mock mode, we are intentionally offline
  if (mockDataManager.isMockMode() || features.isEnabled('mock_rpc')) {
    appState.set('offline', false);
    return false;
  }

  // Reuse the mock data manager's detection loop so state stays in sync
  const detected = await mockDataManager.detectNode(3000);
  const live = detected && mockDataManager.isLiveMode();
  appState.set('offline', !live);
  return live;
}

// Offline banner management
function initializeOfflineBanner() {
  appState.subscribe('offline', (isOffline) => {
    requestAnimationFrame(() => updateOfflineBanner(isOffline));
  });
}

function updateOfflineBanner(isOffline) {
  let banner = $('#offline-banner');

  if (isOffline) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.innerHTML = `
        <span>⚠️ Offline: API unreachable. Showing cached data.</span>
        <button id="retry-connection">Retry</button>
      `;

      const retryBtn = banner.querySelector('#retry-connection');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => checkHealth());
      }

      document.body.insertBefore(banner, document.body.firstChild);
    }
  } else {
    if (banner) {
      banner.remove();
    }
  }
}

// Performance monitoring
function initializePerformanceMonitoring() {
  // Set custom budgets
  perf.setBudget('render', 16.67); // 60fps
  perf.setBudget('fetch', 300);
  perf.setBudget('interaction', 100);

  // Log web vitals on load
  window.addEventListener('load', () => {
    setTimeout(() => {
      const vitals = perf.getWebVitals();
      console.log('[Perf] Web Vitals:', vitals);

      // Log budget violations
      const stats = perf.getStats();
      if (stats) {
        console.log('[Perf] Performance Stats:', stats);
      }
    }, 2000);
  });
}

// Error reporting
function initializeErrorReporting() {
  // Set error reporting endpoint (if available)
  if (window.BLOCK_BUSTER_ERROR_ENDPOINT) {
    errorBoundary.setReportEndpoint(window.BLOCK_BUSTER_ERROR_ENDPOINT);
  }

  // Optional: Display recent errors in console
  if (window.location.hostname === 'localhost') {
    window.getRecentErrors = () => errorBoundary.getRecentErrors();
    console.log('[Dev] Run getRecentErrors() to see error history');
  }
}

// Feature flags debugging
function initializeFeatureFlags() {
  // Log enabled features
  const enabledFeatures = features.getAll();
  console.log('[Features] Enabled:', enabledFeatures);

  // Expose feature flags in dev mode
  if (window.location.hostname === 'localhost') {
    window.features = features;
    console.log('[Dev] Use window.features to toggle feature flags');
  }
}

// WebSocket real-time updates
function initializeWebSocket() {
  if (!features.isEnabled('websockets')) {
    console.log('[WS] WebSocket disabled via feature flag');
    return null;
  }

  try {
    websocket = new BlockWebSocket(WS_URL, {
      maxReconnectAttempts: 10,
      pingInterval: 30000,
    });

    websocket.mount();
    console.log('[WS] WebSocket initialized');

    // Subscribe to connection status
    appState.subscribe('ws', (wsState) => {
      if (wsState.connected) {
        console.log('[WS] Connected - disabling polling');
        appState.set('usePolling', false);
      } else {
        console.log('[WS] Disconnected - falling back to polling');
        appState.set('usePolling', true);
      }
    });

    return websocket;
  } catch (error) {
    console.error('[WS] Failed to initialize:', error);
    appState.set('usePolling', true);
    return null;
  }
}

// Global state debugging
function initializeStateDebugging() {
  if (window.location.hostname === 'localhost') {
    window.appState = appState;
    window.getStateHistory = (key = null) => appState.getHistory(key);
    console.log('[Dev] Use window.appState to inspect state');
    console.log('[Dev] Use getStateHistory(key) to see change history');
  }
}

// Main initialization
async function init() {
  perf.mark('app-init-start');

  console.log('[App] Initializing Block Buster Dashboard...');

  // Initialize subsystems
  initializeState();
  initializeOfflineBanner();
  initializePerformanceMonitoring();
  initializeErrorReporting();
  initializeFeatureFlags();
  initializeStateDebugging();
  
  // Check API health first (before showing UI)
  backendAvailable = await mockDataManager.detectNode(5000);
  console.log(`[App] Backend status: ${backendAvailable ? 'CONNECTED' : 'UNAVAILABLE'}`);
  
  // If backend unavailable and not in mock mode, show interstitial
  if (!backendAvailable && !features.isEnabled('mock_rpc')) {
    console.log('[App] Backend unavailable - showing mock mode interstitial');
    
    // Show interstitial screen and wait for user action
    await new Promise((resolve) => {
      mockModeNotice.showInterstitial(() => {
        // User clicked "Continue with Mock Data"
        features.enable('mock_rpc');
        console.log('[App] Mock mode enabled with realistic blockchain data');
        resolve();
      });
    });
  }
  
  // Initialize RPC client (real or mock based on backend availability)
  const useMock = !backendAvailable || features.isEnabled('mock_rpc');
  rpc = initializeRpcClient(useMock);
  
  // Show persistent notice banner if using mock mode
  if (useMock) {
    mockModeNotice.mount();
    // Delay banner slightly so navigation loads first
    setTimeout(() => {
      mockModeNotice.show(() => {
        console.log('[App] Mock mode notice dismissed');
      });
    }, 1500);
  }
  
  // Initialize components with RPC client
  components.theblock = new TheBlock(rpc);
  components.energyMarket = new EnergyMarket(rpc);
  components.adMarket = new AdMarket(rpc);
  components.computeMarket = new ComputeMarket(rpc);
  components.storageMarket = new StorageMarket(rpc);
  components.economics = new Economics(rpc);
  components.governance = new Governance(rpc);
  components.treasury = new Treasury(rpc);
  components.trading = new Trading(rpc);
  components.network = new Network(rpc);
  
  // Re-register routes with updated components
  router
    .register('theblock', components.theblock)
    .register('economics', components.economics)
    .register('energy', components.energyMarket)
    .register('ads', components.adMarket)
    .register('compute', components.computeMarket)
    .register('storage', components.storageMarket)
    .register('governance', components.governance)
    .register('treasury', components.treasury)
    .register('trading', components.trading)
    .register('network', components.network)
    .setDefault('theblock');
  
  // Initialize WebSocket if backend available and feature enabled
  if (backendAvailable && !useMock && features.isEnabled('websockets')) {
    websocket = initializeWebSocket();
  }
  
  // Set initial polling state
  appState.set('usePolling', useMock || !features.isEnabled('websockets'));

  // Mount navigation
  navigation.mount();

  // Mount connection status indicator
  connectionStatus.mount();

  // Mount What's New modal (auto-shows if new version)
  whatsNewModal.mount();

  // Initialize and mount keyboard shortcuts
  keyboardShortcuts = new KeyboardShortcuts(router);
  keyboardShortcuts.mount();

  // Register keyboard shortcuts handler
  document.addEventListener('keydown', (e) => {
    keyboardShortcuts.handleKeyboardShortcuts(e);
  });

  // Mount router (handles initial route)
  router.mount();

  // Global cleanup on page unload
  window.addEventListener('beforeunload', () => {
    console.log('[App] Unmounting all components...');
    if (websocket) websocket.unmount();
    router.unmount();
    navigation.unmount();
    connectionStatus.unmount();
    whatsNewModal.unmount();
    keyboardShortcuts.unmount();
    Object.values(components).forEach((component) => {
      if (component.unmount) component.unmount();
    });
  });

  perf.measure('app-init', 'app-init-start', 'interaction');
  console.log('[App] Initialization complete');
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose for debugging
if (window.location.hostname === 'localhost') {
  window.perf = perf;
  window.router = router;
  window.rpc = rpc;
  window.ws = websocket;
  window.enableMockMode = () => {
    features.enable('mock_rpc');
    console.log('[Dev] Mock mode enabled. Reload page to take effect.');
    console.log('[Dev] Run: location.reload()');
  };
  window.disableMockMode = () => {
    features.disable('mock_rpc');
    console.log('[Dev] Mock mode disabled. Reload page to take effect.');
    console.log('[Dev] Run: location.reload()');
  };
  console.log('[Dev] Exposed: window.perf, window.router, window.rpc, window.ws');
  console.log('[Dev] Helpers: window.enableMockMode(), window.disableMockMode()');
}
import './styles/trading.css';
import './styles/economics.css';

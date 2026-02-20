/**
 * Mock RPC Client for Local Development
 * Provides realistic fake data when backend is unavailable
 */

import features from './features.js';
import mockDataManager from './mock-data-manager.js';

/**
 * Generate deterministic but varying mock data based on time
 */
class MockRpcClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.requestId = 1;
    this.startTime = Date.now();
    this.lastTps = null;
    this.lastHeight = mockDataManager.currentBlock || 0;

    // Force a single source of truth for mock data
    if (mockDataManager.mode !== 'MOCK') {
      mockDataManager.mode = 'MOCK';
      mockDataManager.initializeMockData();
      mockDataManager.startMockUpdates();
    }
    
    console.log('[MockRPC] Using mock RPC client - backend not required');
    console.log('[MockRPC] Disable with: features.disable(\'mock_rpc\')');
  }

  /**
   * Simulate network delay
   */
  async delay(ms = 50 + Math.random() * 100) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get mock block height (increments over time - realistic 2s block time)
   */
  getMockBlockHeight() {
    const current = mockDataManager.currentBlock || 0;
    const next = Math.max(current, this.lastHeight + 1);
    this.lastHeight = next;
    return next;
  }

  /**
   * Get mock metrics with realistic variance
   * Based on actual blockchain patterns:
   * - TPS: 800-1500 typical, spikes to 2500
   * - Latency: 15-45ms P2P
   * - Block time: 1.8-2.2s with occasional variance
   * - Peers: 45-85 active connections
   * - Fees: 2-15 BLOCK per block
   */
  getMockMetrics() {
    const tpsHistory = mockDataManager.get('tpsHistory') || [];
    const lastTps = tpsHistory.length ? tpsHistory[tpsHistory.length - 1].value : 1000;
    // Keep legacy high-TPS feel while tying to mockDataManager state
    const tps = Math.max(800, lastTps);
    this.lastTps = tps;

    const feeHistory = mockDataManager.get('feeHistory') || [];
    const lastFee = feeHistory.length ? feeHistory[feeHistory.length - 1].value : 25_000;

    return {
      tps,
      avgLatency: 28,
      avgBlockTime: 2.0,
      activePeers: 58,
      fees: lastFee / 1_000_000,
      validators: 21,
      totalSupply: mockDataManager.currentEmission || 0,
    };
  }

  /**
   * Get realistic market data
   */
  getMockMarketData() {
    // Prefer deterministic mockDataManager markets if present
    if (mockDataManager.mockData) {
      return {
        compute: mockDataManager.mockData.computeMarket || {
          utilization: 0.72,
          providers: 12,
          avgMargin: 0.12,
          volume24h: 50000,
        },
        storage: mockDataManager.mockData.storageMarket || {
          utilization: 0.6,
          providers: 20,
          avgMargin: 0.10,
          volume24h: 30000,
        },
        energy: mockDataManager.mockData.energyMarket || {
          utilization: 0.7,
          providers: 12,
          avgMargin: 0.18,
          volume24h: 20000,
        },
        ad: mockDataManager.mockData.adQuality || {
          utilization: 0.5,
          providers: 8,
          avgMargin: 0.2,
          volume24h: 8000,
        },
      };
    }

    const utilization = 45 + Math.random() * 40; // fallback
    return {
      compute: {
        utilization: utilization,
        providers: Math.floor(15 + Math.random() * 10),
        avgMargin: 0.15 + Math.random() * 0.10,
        volume24h: Math.floor(50000 + Math.random() * 30000),
      },
      storage: {
        utilization: utilization * 0.8,
        providers: Math.floor(20 + Math.random() * 15),
        avgMargin: 0.12 + Math.random() * 0.08,
        volume24h: Math.floor(30000 + Math.random() * 20000),
      },
      energy: {
        utilization: utilization * 1.2,
        providers: Math.floor(8 + Math.random() * 7),
        avgMargin: 0.20 + Math.random() * 0.15,
        volume24h: Math.floor(15000 + Math.random() * 10000),
      },
      ad: {
        utilization: utilization * 0.6,
        providers: Math.floor(5 + Math.random() * 5),
        avgMargin: 0.25 + Math.random() * 0.20,
        volume24h: Math.floor(8000 + Math.random() * 5000),
      },
    };
  }

  /**
   * Get realistic peer data
   */
  getMockPeers() {
    const peerCount = Math.floor(45 + Math.random() * 40);
    const peers = [];
    
    for (let i = 0; i < Math.min(peerCount, 10); i++) {
      peers.push({
        id: `peer-${i}-${Math.random().toString(36).substr(2, 9)}`,
        address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latency: Math.floor(10 + Math.random() * 50),
        isValidator: Math.random() > 0.7,
        syncStatus: Math.random() > 0.95 ? 'syncing' : 'synced',
        connectedAt: Date.now() - Math.floor(Math.random() * 3600000),
      });
    }
    
    return peers;
  }

  /**
   * Mock RPC call
   */
  async call(method, params = []) {
    await this.delay();
    
    const id = this.requestId++;
    
    // Route to mock handlers
    const result = this.routeMethod(method, params);
    
    return result;
  }

  /**
   * Mock batch call
   */
  async batch(calls) {
    await this.delay();
    
    return calls.map((call) => {
      try {
        const result = this.routeMethod(call.method, call.params || []);
        return { result };
      } catch (error) {
        return {
          error: {
            code: -32600,
            message: error.message,
          },
        };
      }
    });
  }

  /**
   * Route method to mock handler
   */
  routeMethod(method, params) {
    const handlers = {
      // Consensus
      'consensus.block_height': () => ({
        height: this.getMockBlockHeight(),
        finalized_height: this.getMockBlockHeight() - 5,
      }),

      'consensus.tps': () => {
        const metrics = this.getMockMetrics();
        return {
          tps: metrics.tps,
          avgBlockTime: metrics.avgBlockTime,
        };
      },

      'consensus.finality_status': () => ({
        finalized_height: this.getMockBlockHeight() - 5,
        finalized_hash: `0x${Math.random().toString(16).slice(2, 18)}`,
        current_height: this.getMockBlockHeight(),
        blocks_until_finality: 0,
      }),
      
      'consensus.stats': () => {
        const metrics = this.getMockMetrics();
        return {
          tps: metrics.tps,
          avg_block_time_ms: metrics.avgBlockTime * 1000,
        };
      },
      
      'consensus.block': ([height]) => ({
        height: height || this.getMockBlockHeight(),
        hash: `0x${Math.random().toString(16).slice(2, 18)}`,
        timestamp: Date.now() - Math.random() * 60000,
        tx_count: Math.floor(Math.random() * 100),
        transactions: [],
      }),
      
      'consensus.validators': () => ({
        validators: Array.from({ length: 5 }, (_, i) => ({
          id: `validator-${i + 1}`,
          stake: Math.floor(1000000 + Math.random() * 500000),
          commission: 0.05 + Math.random() * 0.05,
          uptime: 0.95 + Math.random() * 0.04,
        })),
      }),
      
      // Ledger
      balance: ([paramsObj = {}]) => ({
        amount: 100_000 + (paramsObj.address ? paramsObj.address.length : 0),
      }),
      
      'ledger.balance': ([account]) => ({
        account: account || '0x0000',
        balance: Math.floor(10000 + Math.random() * 90000),
        nonce: Math.floor(Math.random() * 100),
      }),
      
      'ledger.transactions': ([params = {}]) => ({
        transactions: Array.from({ length: params.limit || 5 }, (_, i) => ({
          hash: `0x${Math.random().toString(16).slice(2, 18)}`,
          from: `0x${Math.random().toString(16).slice(2, 10)}`,
          to: `0x${Math.random().toString(16).slice(2, 10)}`,
          amount: Math.floor(Math.random() * 1000),
          fee: Math.floor(Math.random() * 10),
          timestamp: Date.now() - i * 60000,
          status: 'confirmed',
        })),
        total: 1234,
        limit: params.limit || 5,
        offset: params.offset || 0,
      }),
      
      // Peer / Net
      'net.overlay_status': () => ({
        backend: 'mock',
        active_peers: 64,
        persisted_peers: 64,
        database_path: null,
      }),

      'net.peer_stats_all': ([args = {}]) => {
        const peers = this.getMockPeers();
        const offset = args.offset || 0;
        const limit = args.limit || peers.length;
        return peers.slice(offset, offset + limit).map((p) => ({
          peer_id: p.id,
          metrics: {
            requests: 100 + Math.floor(Math.random() * 50),
            bytes_sent: 1_000_000 + Math.floor(Math.random() * 250_000),
            reputation: { score: 900 + Math.floor(Math.random() * 80) },
            last_updated: Date.now(),
            req_avg: 5.0,
            byte_avg: 1024,
            throttled_until: 0,
            throttle_reason: null,
            last_handshake_ms: Date.now() - 500,
            backoff_level: 0,
          },
        }));
      },

      'net.peer_stats': ([paramsObj = {}]) => {
        const peers = this.getMockPeers();
        const found = peers.find((p) => p.id === paramsObj.peer_id) || peers[0];
        return {
          requests: 100,
          bytes_sent: 1_000_000,
          drops: {},
          handshake_fail: {},
          reputation: { score: 900 },
          last_updated: Date.now(),
          req_avg: 5.0,
          byte_avg: 1024,
          throttled_until: 0,
          throttle_reason: null,
          backoff_level: 0,
        };
      },

      'peer.list': () => ({
        peers: this.getMockPeers().map((p) => ({
          id: p.id,
          address: p.address,
          latency: p.latency,
          uptime: p.uptime || 3600,
          version: '1.0.0',
        })),
      }),

      'peer.stats': () => ({
        total: 64,
        active: 58,
        avgLatency: 22,
        bandwidth: {
          inbound: 1_000_000,
          outbound: 800_000,
        },
      }),
      
      // Scheduler
      'compute_market.scheduler_stats': () => ({
        queue_size: 5,
        active_jobs: 2,
      }),
      'scheduler.stats': () => ({
        queue_size: 5,
        active_jobs: 2,
      }),
      
      // Governance
      'governance.proposals': () => ({
        proposals: Array.from({ length: 3 }, (_, i) => ({
          id: `proposal-${i + 1}`,
          title: `Proposal ${i + 1}`,
          status: ['active', 'pending', 'passed'][i % 3],
          votes: {
            yes: Math.floor(500000 + Math.random() * 500000),
            no: Math.floor(100000 + Math.random() * 200000),
          },
        })),
      }),
      
      'governor.status': () => ({
        active_gates: Math.floor(3 + Math.random() * 3),
        gates: {
          energy: true,
          compute: true,
          storage: false,
        },
        economics_prev_market_metrics: {
          utilization_ppm: 750000,
          provider_margin_ppm: 150000,
        },
      }),
      
      'governor.decisions': () => ({
        decisions: Array.from({ length: 5 }, (_, i) => ({
          id: `decision-${i + 1}`,
          title: `Parameter update ${i + 1}`,
          status: ['passed', 'pending', 'rejected'][i % 3],
          executed: i % 3 === 0,
        })),
      }),
      
      // Energy
      'energy.market_state': () => ({
        totalSupply: Math.floor(45000 + Math.random() * 10000),
        totalDemand: Math.floor(42000 + Math.random() * 6000),
        price: 1.15 + Math.random() * 0.3,
        providers: Math.floor(35 + Math.random() * 15),
      }),
      
      'energy.providers': () => ({
        providers: Array.from({ length: 5 }, (_, i) => ({
          id: `energy-0x${i + 1}`,
          capacity: Math.floor(800 + Math.random() * 400),
          available: Math.floor(600 + Math.random() * 300),
          price: 1.1 + Math.random() * 0.3,
          reputation: 0.92 + Math.random() * 0.07,
        })),
      }),
      
      // Compute Market
      'compute_market.stats': () => ({
        industrial_backlog: 3,
        industrial_utilization: 0.72,
        industrial_units_total: 1200,
        active_jobs: 20,
        pending: 3,
      }),
      
      'compute_market.state': () => ({
        active_jobs: 20,
        total_capacity: 1500,
      }),
      
      'compute_market.jobs': () => ({
        jobs: Array.from({ length: 3 }, (_, i) => ({
          id: `job-${i + 1}`,
          status: ['running', 'pending', 'completed'][i % 3],
          compute_units: Math.floor(10 + Math.random() * 90),
        })),
      }),
      
      // Ad Market
      'ad_market.inventory': () => ({
        slots: 120,
        filled: 96,
      }),

      'ad_market.broker_state': () => mockDataManager.get('adQuality') || {},
      
      'ad_market.state': () => ({
        total_bids: 150,
        active_campaigns: 12,
      }),

      'ad_market.bids': () => ({
        bids: Array.from({ length: 5 }, (_, i) => ({
          id: `bid-${i + 1}`,
          amount: Math.floor(100 + Math.random() * 900),
          status: ['active', 'pending', 'won'][i % 3],
        })),
      }),

      'ad_market.readiness': () => ({
        ready: true,
        pending: 0,
        backlog: 0,
      }),
      
      // Treasury
      'treasury.balance': () => ({
        balance: Math.floor(5000000 + Math.random() * 1000000),
        allocations: {
          development: 2000000,
          operations: 1500000,
          reserves: 2500000,
        },
      }),
      
      'treasury.disbursements': () => ({
        disbursements: Array.from({ length: 3 }, (_, i) => ({
          id: `disb-${i + 1}`,
          amount: Math.floor(10000 + Math.random() * 90000),
          recipient: `0x${Math.random().toString(16).slice(2, 10)}`,
          status: ['completed', 'pending', 'scheduled'][i % 3],
        })),
      }),
      
      // Analytics
      analytics: () => ({
        daily_transactions: mockDataManager.get('tpsHistory')?.slice(-1)[0]?.value || 0,
        daily_volume: mockDataManager.get('priceHistory')?.slice(-1)[0]?.value || 0,
        active_accounts: 5000,
      }),
    };

    const handler = handlers[method];
    if (handler) {
      return handler(params);
    }

    throw new Error(`Mock handler not found for method: ${method}`);
  }

  // ========== Delegate to routeMethod ==========

  async getBlockHeight() {
    return this.call('consensus.block_height');
  }

  async getTPS() {
    const stats = await this.call('consensus.stats');
    return { tps: stats.tps, avgBlockTime: stats.avg_block_time_ms / 1000 };
  }

  async getBlock(height) {
    return this.call('consensus.block', [height]);
  }

  async getValidators() {
    return this.call('consensus.validators');
  }

  async getBalance(account) {
    const res = await this.call('ledger.balance', [account]);
    return { account, balance: res.balance ?? res.amount ?? 0, nonce: res.nonce ?? 0 };
  }

  async getTransactions(params = {}) {
    return this.call('ledger.transactions', [params]);
  }

  async listPeers() {
    const peers = await this.call('peer.list');
    return peers;
  }

  async getPeerStats() {
    return this.call('peer.stats');
  }

  async getSchedulerStats() {
    return this.call('scheduler.stats');
  }

  async getProposals(params = {}) {
    return this.call('governance.proposals', [params]);
  }

  async getGovernorStatus() {
    return this.call('governor.status');
  }

  async getGovernorDecisions(params = {}) {
    return this.call('governor.decisions', [params]);
  }

  async getEnergyMarketState(params = {}) {
    return this.call('energy.market_state', [params]);
  }

  async listEnergyProviders(params = {}) {
    return this.call('energy.providers', [params]);
  }

  async getComputeMarketState() {
    return this.call('compute_market.state');
  }

  async getComputeJobs(params = {}) {
    return this.call('compute_market.jobs', [params]);
  }

  async getAdMarketState() {
    return this.call('ad_market.state');
  }

  async getAdBids(params = {}) {
    return this.call('ad_market.bids', [params]);
  }

  async getTreasuryBalance() {
    return this.call('treasury.balance');
  }

  async getDisbursements(params = {}) {
    return this.call('treasury.disbursements', [params]);
  }

  async getAnalytics(params = {}) {
    return this.call('analytics', [params]);
  }

  // ========== Helper Methods ==========

  async getDashboardMetrics() {
    // Generate realistic mock data
    const metrics = this.getMockMetrics();
    const blockHeight = this.getMockBlockHeight();
    const tps = Math.max(800, metrics.tps);
    
    return {
      blockHeight: blockHeight,
      finalizedHeight: blockHeight - Math.floor(3 + Math.random() * 5), // 3-7 blocks behind
      tps,
      avgBlockTime: metrics.avgBlockTime,
      peers: 64, // Fixed to match peer.stats
      activePeers: 58, // Fixed to match peer.stats
      avgLatency: metrics.avgLatency,
      fees: metrics.fees,
      validators: metrics.validators,
      totalSupply: metrics.totalSupply,
      schedulerQueueSize: Math.floor(50 + Math.random() * 200),
      governorActiveGates: Math.floor(8 + Math.random() * 15),
      errors: [], // No errors in mock mode
    };
  }

  async getNetworkOverview() {
    const metrics = this.getMockMetrics();
    const peers = this.getMockPeers();
    
    return {
      peers: peers,
      stats: {
        total: metrics.activePeers,
        active: metrics.activePeers,
        avgLatency: metrics.avgLatency,
        syncing: Math.floor(Math.random() * 3),
      },
      validators: Array.from({ length: metrics.validators }, (_, i) => ({
        id: `validator-${i + 1}`,
        stake: Math.floor(50000 + Math.random() * 200000),
        isActive: Math.random() > 0.1,
        uptime: 0.95 + Math.random() * 0.05,
      })),
      errors: [],
    };
  }

  async getMarketStates() {
    const markets = this.getMockMarketData();
    
    return {
      energy: { ...markets.energy, healthy: true },
      compute: { ...markets.compute, healthy: true },
      storage: { ...markets.storage, healthy: true },
      ad: { ...markets.ad, healthy: true },
      errors: [],
    };
  }
}

export default MockRpcClient;

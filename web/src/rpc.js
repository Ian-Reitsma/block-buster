import mockDataManager from './mock-data-manager.js';

/**
 * JSON-RPC Client for The Block Node
 * Wraps the generic HTTP client with RPC-specific logic
 * 
 * @typedef {Object} BlockHeightResponse
 * @property {number} height - Current block height
 * @property {number} finalized_height - Last finalized block height
 * 
 * @typedef {Object} TPSResponse
 * @property {number} tps - Transactions per second
 * @property {number} avgBlockTime - Average block time in seconds
 * 
 * @typedef {Object} BlockResponse
 * @property {number} height - Block height
 * @property {string} hash - Block hash
 * @property {number} timestamp - Block timestamp (ms)
 * @property {number} tx_count - Number of transactions
 * @property {Transaction[]} transactions - Block transactions
 * 
 * @typedef {Object} Transaction
 * @property {string} hash - Transaction hash
 * @property {string} from - Sender address
 * @property {string} to - Recipient address
 * @property {number} amount - Transaction amount
 * @property {number} fee - Transaction fee
 * @property {string} status - Transaction status
 * 
 * @typedef {Object} Validator
 * @property {string} id - Validator ID
 * @property {number} stake - Staked amount
 * @property {number} commission - Commission rate (0-1)
 * @property {number} uptime - Uptime percentage (0-1)
 * 
 * @typedef {Object} ValidatorsResponse
 * @property {Validator[]} validators - List of validators
 * 
 * @typedef {Object} BalanceResponse
 * @property {string} account - Account address
 * @property {number} balance - Account balance
 * @property {number} nonce - Account nonce
 * 
 * @typedef {Object} TransactionsResponse
 * @property {Transaction[]} transactions - List of transactions
 * @property {number} total - Total matching transactions
 * @property {number} limit - Page limit
 * @property {number} offset - Page offset
 * 
 * @typedef {Object} Peer
 * @property {string} id - Peer ID
 * @property {string} address - Peer address (IP:port)
 * @property {number} latency - Peer latency (ms)
 * @property {number} uptime - Peer uptime (seconds)
 * @property {string} version - Peer version
 * 
 * @typedef {Object} PeerListResponse
 * @property {Peer[]} peers - List of peers
 * 
 * @typedef {Object} Bandwidth
 * @property {number} inbound - Inbound bandwidth (bytes/sec)
 * @property {number} outbound - Outbound bandwidth (bytes/sec)
 * 
 * @typedef {Object} PeerStatsResponse
 * @property {number} total - Total peers
 * @property {number} active - Active peers
 * @property {number} avgLatency - Average latency (ms)
 * @property {Bandwidth} bandwidth - Bandwidth stats
 * 
 * @typedef {Object} SchedulerStatsResponse
 * @property {number} queue_size - Queue size
 * @property {number} active_jobs - Active jobs
 * 
 * @typedef {Object} Proposal
 * @property {string} id - Proposal ID
 * @property {string} title - Proposal title
 * @property {string} status - Proposal status
 * @property {Object} votes - Vote counts
 * 
 * @typedef {Object} ProposalsResponse
 * @property {Proposal[]} proposals - List of proposals
 * 
 * @typedef {Object} GovernorStatusResponse
 * @property {number} active_gates - Number of active gates
 * @property {Object} gates - Gate statuses
 * @property {Object} economics_prev_market_metrics - Previous market metrics
 * 
 * @typedef {Object} Decision
 * @property {string} id - Decision ID
 * @property {string} title - Decision title
 * @property {string} status - Decision status
 * @property {boolean} executed - Whether executed
 * 
 * @typedef {Object} DecisionsResponse
 * @property {Decision[]} decisions - List of decisions
 * 
 * @typedef {Object} EnergyMarketStateResponse
 * @property {number} totalSupply - Total energy supply
 * @property {number} totalDemand - Total energy demand
 * @property {number} price - Current price
 * @property {number} providers - Number of providers
 * 
 * @typedef {Object} EnergyProvider
 * @property {string} id - Provider ID
 * @property {number} capacity - Capacity (kWh)
 * @property {number} available - Available capacity
 * @property {number} price - Price per kWh
 * @property {number} reputation - Reputation score (0-1)
 * 
 * @typedef {Object} EnergyProvidersResponse
 * @property {EnergyProvider[]} providers - List of providers
 * 
 * @typedef {Object} ComputeMarketStateResponse
 * @property {number} active_jobs - Active jobs
 * @property {number} total_capacity - Total capacity
 * 
 * @typedef {Object} ComputeJob
 * @property {string} id - Job ID
 * @property {string} status - Job status
 * @property {number} compute_units - Compute units required
 * 
 * @typedef {Object} ComputeJobsResponse
 * @property {ComputeJob[]} jobs - List of jobs
 * 
 * @typedef {Object} AdMarketStateResponse
 * @property {number} total_bids - Total bids
 * @property {number} active_campaigns - Active campaigns
 * 
 * @typedef {Object} AdBid
 * @property {string} id - Bid ID
 * @property {number} amount - Bid amount
 * @property {string} status - Bid status
 * 
 * @typedef {Object} AdBidsResponse
 * @property {AdBid[]} bids - List of bids
 * 
 * @typedef {Object} TreasuryBalanceResponse
 * @property {number} balance - Treasury balance
 * @property {Object} allocations - Balance allocations
 * 
 * @typedef {Object} Disbursement
 * @property {string} id - Disbursement ID
 * @property {number} amount - Disbursement amount
 * @property {string} recipient - Recipient address
 * @property {string} status - Disbursement status
 * 
 * @typedef {Object} DisbursementsResponse
 * @property {Disbursement[]} disbursements - List of disbursements
 * 
 * @typedef {Object} DashboardMetrics
 * @property {number} blockHeight - Current block height
 * @property {number} finalizedHeight - Finalized height
 * @property {number} tps - Transactions per second
 * @property {number} avgBlockTime - Average block time
 * @property {number} peers - Total peers
 * @property {number} activePeers - Active peers
 * @property {number} avgLatency - Average latency
 * @property {number} schedulerQueueSize - Scheduler queue size
 * @property {number} governorActiveGates - Active governor gates
 * @property {number} validatorCount - Number of validators
 * @property {Object} analytics - Analytics data
 * @property {Array} errors - Any RPC errors encountered
 * 
 * @typedef {Object} NetworkOverview
 * @property {Peer[]} peers - List of peers
 * @property {PeerStatsResponse} stats - Peer statistics
 * @property {Validator[]} validators - List of validators
 * @property {Array} errors - Any RPC errors encountered
 * 
 * @typedef {Object} MarketStates
 * @property {EnergyMarketStateResponse} energy - Energy market state
 * @property {ComputeMarketStateResponse} compute - Compute market state
 * @property {AdMarketStateResponse} ad - Ad market state
 * @property {Array} errors - Any RPC errors encountered
 * 
 * @typedef {Object} RpcError
 * @property {number} code - Error code
 * @property {string} message - Error message
 * @property {*} [data] - Optional error data
 */

import ApiClient from './api.js';
import errorBoundary from './errors.js';
import { Capabilities } from './capabilities.js';
import { getActionMetadata } from './capabilities_rpc.js';

// The Block RPC Error Codes
const RPC_ERROR_CODES = {
  AUTH_MISSING: -33009,
  RATE_LIMIT: -33010,
};

class RpcClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.apiClient = new ApiClient(baseUrl, options);
    this.requestId = 1;
  }

  /**
   * Make a JSON-RPC call
   * @template T
   * @param {string} method - RPC method (e.g., 'consensus.block_height')
   * @param {Array} [params=[]] - Method parameters
   * @returns {Promise<T>} Result from RPC call
   */
  async call(method, params = []) {
    const meta = getActionMetadata(method);
    if (meta) {
      const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);
      if (!allowed) {
        const err = new Error(`Action blocked by network phase: ${reason}`);
        err.code = -32090; // Standardize internal phase-gate code
        err.isPhaseGate = true;
        err.data = { capability_code: code, reason, market: meta.market, actionType: meta.type };
        throw err;
      }
    }
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    try {
      const response = await this.apiClient.post('/rpc', payload);

      // Handle JSON-RPC error responses
      if (response.error) {
        const error = new Error(response.error.message || 'RPC Error');
        error.code = response.error.code;
        error.data = response.error.data;
        throw error;
      }

      return response.result;
    } catch (error) {
      errorBoundary.catch(error, {
        component: 'RpcClient',
        method,
        params,
      });
      throw error;
    }
  }

  /**
   * Batch multiple RPC calls
   * @param {Array<{method: string, params?: Array}>} calls - Array of RPC calls
   * @returns {Promise<Array<{result?: any, error?: RpcError}>>} Results array
   */
  async batch(calls) {
    // Pre-validate each call.
    const preValidated = calls.map((call, index) => {
      const meta = getActionMetadata(call.method);
      if (meta) {
        const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);
        if (!allowed) {
          const err = new Error(`Action blocked by network phase: ${reason}`);
          err.code = -32090;
          err.isPhaseGate = true;
          err.method = call.method;
          err.data = { capability_code: code, reason, market: meta.market, actionType: meta.type };
          return { originalIndex: index, call: null, error: err };
        }
      }
      return { originalIndex: index, call, error: null };
    });

    const validCalls = preValidated.filter(v => v.call !== null);
    const payload = validCalls.map((v) => ({
      jsonrpc: '2.0',
      method: v.call.method,
      params: v.call.params || [],
      id: this.requestId++,
    }));

    try {
      let responses = [];
      if (payload.length > 0) {
        responses = await this.apiClient.post('/rpc', payload);
      }

      // Reconstruct the array matching the original 'calls' index
      let responseIndex = 0;
      return preValidated.map((v) => {
        if (v.error) {
          return { error: v.error };
        }
        const response = responses[responseIndex++];
        if (response.error) {
          const error = new Error(response.error.message || 'RPC Error');
          error.code = response.error.code;
          error.data = response.error.data;
          error.method = v.call.method;
          return { error };
        }
        return { result: response.result };
      });
    } catch (error) {
      errorBoundary.catch(error, {
        component: 'RpcClient',
        action: 'batch',
        callCount: calls.length,
      });
      throw error;
    }
  }

  // ========== Consensus Namespace ==========

  /**
   * Get current block height and finalized height
   * @returns {Promise<BlockHeightResponse>}
   */
  async getBlockHeight() {
    return this.call('consensus.block_height');
  }

  /**
   * Get transactions per second and average block time
   * @returns {Promise<TPSResponse>}
   */
  async getTPS() {
    try {
      const stats = await this.call('consensus.stats');
      const avgMs =
        stats?.avg_block_time_ms ??
        (typeof stats?.avgBlockTime === 'number' ? stats.avgBlockTime * 1000 : 0);
      return {
        tps: stats?.tps ?? 0,
        avgBlockTime: avgMs / 1000,
      };
    } catch {
      // Legacy fallback for older nodes/tests
      const tps = await this.call('consensus.tps');
      return { tps: tps?.tps ?? 0, avgBlockTime: tps?.avgBlockTime ?? 0 };
    }
  }

  /**
   * Get block by height
   * @param {number} height - Block height
   * @returns {Promise<BlockResponse>}
   */
  async getBlock(height) {
    return this.call('consensus.block', [height]);
  }

  /**
   * Get list of validators
   * @returns {Promise<ValidatorsResponse>}
   */
  async getValidators() {
    try {
      return await this.call('consensus.validators');
    } catch {
      return { validators: [] };
    }
  }

  // ========== Ledger Namespace ==========

  /**
   * Get account balance
   * @param {string} account - Account address
   * @returns {Promise<BalanceResponse>}
   */
  async getBalance(account) {
    try {
      const res = await this.call('balance', [{ address: account }]);
      return {
        account,
        balance: res?.amount ?? res?.balance ?? 0,
        nonce: res?.nonce ?? 0,
      };
    } catch {
      const res = await this.call('ledger.balance', [account]);
      return {
        account,
        balance: res?.balance ?? res?.amount ?? 0,
        nonce: res?.nonce ?? 0,
      };
    }
  }

  /**
   * Get transactions with optional filters
   * @param {{account?: string, limit?: number, offset?: number}} [params={}] - Query parameters
   * @returns {Promise<TransactionsResponse>}
   */
  async getTransactions(params = {}) {
    try {
      return this.call('ledger.transactions', [params]);
    } catch {
      return {
        transactions: [],
        total: 0,
        limit: params.limit || 0,
        offset: params.offset || 0,
        unsupported: true,
      };
    }
  }

  // ========== Peer Namespace ==========

  /**
   * List all connected peers
   * @returns {Promise<PeerListResponse>}
   */
  async listPeers() {
    try {
      const peers = await this.call('net.peer_stats_all', [{ offset: 0, limit: 100 }]);
      const arr = Array.isArray(peers) ? peers : peers?.peers || [];
      return {
        peers: arr.map((p) => ({
          id: p.peer_id || p.id,
          address: p.peer_id || p.id,
          latency: p.metrics?.avg_latency_ms || 0,
          uptime: p.metrics?.last_updated || 0,
          version: p.metrics?.version || 'n/a',
          metrics: p.metrics,
        })),
      };
    } catch {
      return this.call('peer.list');
    }
  }

  /**
   * Get peer statistics
   * @returns {Promise<PeerStatsResponse>}
   */
  async getPeerStats() {
    try {
      const overlay = await this.call('net.overlay_status');
      const peers = await this.call('net.peer_stats_all', [{ offset: 0, limit: 100 }]);
      const len = Array.isArray(peers) ? peers.length : peers?.length || peers?.total || 0;
      return {
        total: overlay?.persisted_peers ?? overlay?.total ?? len,
        active: overlay?.active_peers ?? overlay?.active ?? peers?.active ?? len,
        avgLatency: peers?.avgLatency ?? overlay?.avgLatency ?? 0,
        bandwidth: {},
        peers,
      };
    } catch {
      return this.call('peer.stats');
    }
  }

  // ========== Scheduler Namespace ==========

  /**
   * Get scheduler queue statistics
   * @returns {Promise<SchedulerStatsResponse>}
   */
  async getSchedulerStats() {
    try {
      return this.call('compute_market.scheduler_stats');
    } catch {
      return this.call('scheduler.stats');
    }
  }

  // ========== Governance Namespace ==========

  async getProposals(params = {}) {
    return this.call('governance.proposals', [params]);
  }

  async getGovernorStatus() {
    return this.call('governor.status');
  }

  async getGovernorDecisions(params = {}) {
    return this.call('governor.decisions', [params]);
  }

  // ========== Energy Namespace ==========

  async getEnergyMarketState(params = {}) {
    return this.call('energy.market_state', [params]);
  }

  async listEnergyProviders(params = {}) {
    try {
      return this.call('energy.providers', [params]);
    } catch {
      return { providers: [] };
    }
  }

  // ========== Compute Market Namespace ==========

  async getComputeJobs(params = {}) {
    try {
      return this.call('compute_market.jobs', [params]);
    } catch {
      return this.call('compute_market.stats', [params]);
    }
  }

  async getCourierStatus(params = {}) {
    return this.call('compute_market.courier_status', [params]);
  }

  async getSlaHistory(params = {}) {
    return this.call('compute_market.sla_history', [params]);
  }

  // ========== Ad Market Namespace ==========

  async getAdInventory(params = {}) {
    return this.call('ad_market.inventory', [params]);
  }

  async listAdCampaigns(params = {}) {
    return this.call('ad_market.list_campaigns', [params]);
  }

  async getAdDistribution(params = {}) {
    return this.call('ad_market.distribution', [params]);
  }

  async getAdBudget(params = {}) {
    return this.call('ad_market.budget', [params]);
  }

  async getAdReadiness(params = {}) {
    return this.call('ad_market.readiness', [params]);
  }

  async getAdPolicySnapshot(params = {}) {
    return this.call('ad_market.policy_snapshot', [params]);
  }

  async getAdBrokerState(params = {}) {
    return this.call('ad_market.broker_state', [params]);
  }

  async getAdReadiness(params = {}) {
    return this.call('ad_market.readiness', [params]);
  }

  // ========== Treasury Namespace ==========

  async getTreasuryBalance() {
    return this.call('treasury.balance');
  }

  async getDisbursements(params = {}) {
    return this.call('treasury.list_disbursements', [params]);
  }

  // ========== Analytics Namespace ==========

  async getAnalytics(params = {}) {
    return this.call('analytics', [params]);
  }

  // ========== State Stream (WebSocket handled separately) ==========

  // ========== Helper Methods ==========

  /**
   * Get comprehensive dashboard metrics
   * Batches multiple RPC calls for efficiency
   * @returns {Promise<DashboardMetrics>}
   */
  async getDashboardMetrics() {
    const calls = [
      { method: 'consensus.block_height' },
      { method: 'consensus.finality_status' },
      { method: 'consensus.stats' },
      { method: 'net.overlay_status' },
      { method: 'net.peer_stats_all', params: [{ offset: 0, limit: 50 }] },
      { method: 'compute_market.scheduler_stats' },
      { method: 'governor.status' },
      { method: 'analytics', params: [{}] },
    ];

    const results = await this.batch(calls);

    const [
      blockHeight = {},
      finality = {},
      stats = {},
      overlay = {},
      peerStatsAll = {},
      schedulerStats = {},
      governorStatus = {},
      analytics = {},
    ] = results;

    const statsRes = stats.result || {};
    const overlayRes = overlay.result || {};
    const peersRes = peerStatsAll.result;
    const peerTotal =
      overlayRes.persisted_peers ?? overlayRes.total ?? (Array.isArray(peersRes) ? peersRes.length : 0);
    const peerActive =
      overlayRes.active_peers ?? overlayRes.active ?? (Array.isArray(peersRes) ? peersRes.length : 0);

    return {
      blockHeight: blockHeight.result?.height || 0,
      finalizedHeight: finality.result?.finalized_height || blockHeight.result?.height || 0,
      tps: statsRes.tps || 0,
      avgBlockTime:
        (statsRes.avg_block_time_ms ??
          (typeof statsRes.avgBlockTime === 'number' ? statsRes.avgBlockTime * 1000 : 0)) / 1000,
      peers: peerTotal,
      activePeers: peerActive,
      avgLatency: 0,
      schedulerQueueSize: schedulerStats.result?.queue_size || 0,
      governorActiveGates: governorStatus.result?.active_gates || 0,
      validatorCount: 0,
      analytics: analytics?.result || {},
      errors: results.filter((r) => r.error).map((r) => r.error),
    };
  }

  /**
   * Get network overview with peers, stats, and validators
   * @returns {Promise<NetworkOverview>}
   */
  async getNetworkOverview() {
    const calls = [
      { method: 'net.peer_stats_all', params: [{ offset: 0, limit: 50 }] },
      { method: 'net.overlay_status' },
      { method: 'consensus.block_height' },
      { method: 'consensus.finality_status' },
      { method: 'consensus.stats' },
    ];

    const results = await this.batch(calls);
    const [peers, overlay, blockHeight, finality, stats] = results;
    const peerList = (Array.isArray(peers.result) ? peers.result : peers.result?.peers || []).map((p) => ({
      ...p,
      id: p.peer_id || p.id,
    }));
    const statsRes = stats.result || {};
    const overlayRes = overlay.result || {};
    const totalPeers = overlayRes.persisted_peers ?? overlayRes.total ?? peerList.length;
    const activePeers = overlayRes.active_peers ?? overlayRes.active ?? peerList.length;

    return {
      peers: peerList,
      stats: {
        total: totalPeers,
        active: activePeers,
        avgLatency: 0,
        blockHeight: blockHeight.result?.height || 0,
        finalizedHeight: finality.result?.finalized_height || blockHeight.result?.height || 0,
        tps: statsRes.tps || 0,
        avgBlockTime:
          (statsRes.avg_block_time_ms ??
            (typeof statsRes.avgBlockTime === 'number' ? statsRes.avgBlockTime * 1000 : 0)) / 1000,
      },
      validators: [],
      errors: results.filter((r) => r.error).map((r) => r.error),
    };
  }

  /**
   * Get market states (energy, compute, ad)
   * @returns {Promise<MarketStates>}
   */
  async getMarketStates() {
    const calls = [
      { method: 'energy.market_state', params: [{}] },
      { method: 'compute_market.stats', params: [{}] },
      { method: 'ad_market.broker_state', params: [{}] },
      { method: 'ad_market.inventory', params: [{}] },
    ];

    const results = await this.batch(calls);
    const [energy, computeStats, adBroker, adInventory] = results;

    return {
      energy: { ...(energy.result || {}), healthy: Boolean(energy.result) },
      compute: {
        stats: computeStats.result || {},
        jobs: { active_jobs: computeStats.result?.active_jobs ?? computeStats.result?.pending ?? 0 },
        healthy: Boolean(computeStats.result),
      },
      ad: {
        broker: adBroker.result || {},
        inventory: adInventory.result || {},
        healthy: Boolean(adBroker.result || adInventory.result),
      },
      errors: results.filter((r) => r.error).map((r) => r.error),
    };
  }
}

export default RpcClient;

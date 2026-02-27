/**
 * Mock RPC Client for Local Development
 * Provides realistic fake data when backend is unavailable
 */

import features from './features.js';
import mockDataManager from './mock-data-manager.js';
import { Capabilities } from './capabilities.js';
import { getActionMetadata } from './capabilities_rpc.js';

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
  async delay(ms = null) {
    const sim = mockDataManager.get('simulation') || {};
    const base = sim.avgLatencyMs != null ? sim.avgLatencyMs : 28;
    // Model RPC/overlay jitter as a function of network latency (±50% jitter)
    const jitter = base * (0.5 + mockDataManager.rng() * 1.0);
    const finalMs = ms != null ? ms : Math.max(10, Math.round(jitter));
    return new Promise((resolve) => setTimeout(resolve, finalMs));
  }

  /**
   * Get mock block height (driven by MockDataManager network tick)
   */
  getMockBlockHeight() {
    const current = mockDataManager.currentBlock || 0;
    this.lastHeight = current;
    return current;
  }

  /**
   * Get mock metrics with realistic variance
   * Based on actual blockchain patterns:
   * - TPS: 30-500 typical (early-stage), peaks higher as network matures
   * - Latency: 15-45ms P2P
   * - Block time: ~1.0s (mock mode)
   * - Peers: 45-85 active connections
   * - Fees: derived from feeHistory
   */
  getMockMetrics() {
    const tpsHistory = mockDataManager.get('tpsHistory') || [];
    const lastTps = tpsHistory.length ? tpsHistory[tpsHistory.length - 1].value : 80;
    const tps = Math.max(10, lastTps);
    this.lastTps = tps;

    const feeHistory = mockDataManager.get('feeHistory') || [];
    const lastFee = feeHistory.length ? feeHistory[feeHistory.length - 1].value : 25_000;

    const validatorCount = (mockDataManager.get('validators') || []).length || 20;

    const sim = mockDataManager.get('simulation') || {};
    const avgLatency = sim.avgLatencyMs != null ? sim.avgLatencyMs : 28;
    const activePeers = sim.activePeerCount != null ? sim.activePeerCount : 58;

    return {
      tps,
      avgLatency,
      avgBlockTime: 1.0,
      activePeers,
      fees: lastFee / 1_000_000,
      validators: validatorCount,
      totalSupply: mockDataManager.currentEmission || 0,
    };
  }

  /**
   * Get realistic market data
   */
  getMockMarketData() {
    const cm = mockDataManager.get('computeMarket');
    const sm = mockDataManager.get('storageMarket');
    const em = mockDataManager.get('energyMarket');
    const ad = mockDataManager.get('adQuality');

    return {
      compute: cm ? {
        utilization: cm.avg_utilization,
        providers:   (cm.providers || []).length,
        avgMargin:   0.135,
        volume24h:   cm.volume_24h_block || 0,
      } : {
        utilization: 0.72,
        providers: 14,
        avgMargin: 0.135,
        volume24h: 50000,
      },

      storage: sm ? {
        utilization: sm.avg_utilization,
        providers:   (sm.providers || []).length,
        avgMargin:   0.12,
        volume24h:   sm.volume_24h_block || 0,
      } : {
        utilization: 0.6,
        providers: 20,
        avgMargin: 0.10,
        volume24h: 30000,
      },

      energy: em ? {
        utilization: em.avg_utilization,
        providers:   (em.providers || []).length,
        avgMargin:   0.11,
        volume24h:   em.total_delivered || 0,
      } : {
        utilization: 0.7,
        providers: 12,
        avgMargin: 0.18,
        volume24h: 20000,
      },

      ad: ad ? {
        utilization: ad.cohort_utilization || 0.72,
        providers:   8,
        avgMargin:   0.145,
        volume24h:   8000,
      } : {
        utilization: 0.5,
        providers: 8,
        avgMargin: 0.2,
        volume24h: 8000,
      },
    };
  }

  /**
   * Get realistic peer data
   */
  getMockPeers() {
    const sim = mockDataManager.get('simulation') || {};
    const active = sim.activePeerCount != null ? sim.activePeerCount : 58;
    const baseLatency = sim.avgLatencyMs != null ? sim.avgLatencyMs : 28;

    // Cap what we return for UI (we only show up to 10 entries)
    const peerCount = Math.max(1, Math.min(active, 10));
    const peers = [];

    for (let i = 0; i < peerCount; i++) {
      const a = 10 + Math.floor(mockDataManager.rng() * 200);
      const b = 10 + Math.floor(mockDataManager.rng() * 200);
      const c = 10 + Math.floor(mockDataManager.rng() * 200);

      // Latency distribution: log-ish skew using squared RNG
      const r = mockDataManager.rng();
      const latency = Math.max(5, Math.round(baseLatency * (0.6 + r * r * 2.2) + mockDataManager.noise(baseLatency * 0.05)));

      // OUTAGE/ATTACK: more syncing peers + more validator disconnects
      const outage = Boolean(sim.outageActive);
      const syncChance = outage ? 0.35 : (sim.preset === 'ATTACK' ? 0.18 : 0.05);
      const isSyncing = mockDataManager.rng() < syncChance;

      const isValidator = mockDataManager.rng() > (outage ? 0.85 : 0.70);

      peers.push({
        id: `peer-${i}-${String(Math.floor(mockDataManager.rng() * 1e9)).padStart(9,'0')}`,
        address: `192.168.${a}.${b}:${10000 + (i * 7)}`,
        latency,
        isValidator,
        syncStatus: isSyncing ? 'syncing' : 'synced',
        connectedAt: Date.now() - Math.floor(mockDataManager.rng() * 3600000),
        uptime: Math.floor(600 + mockDataManager.rng() * 12_000),
      });
    }

    return peers;
  }

  // Typed helpers — keep parity with RpcClient helpers used by components
  async getBlockHeight() {
    return this.routeMethod('consensus.block_height', []);
  }

  async getGovernorStatus() {
    return this.routeMethod('governor.status', []);
  }

  /**
   * Mock RPC call
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
      const meta = getActionMetadata(call.method);
      if (meta) {
        const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);
        if (!allowed) {
          const err = new Error(`Action blocked by network phase: ${reason}`);
          err.code = -32090;
          err.isPhaseGate = true;
          return {
            error: {
              code: err.code,
              message: err.message,
              data: { capability_code: code, reason, market: meta.market, actionType: meta.type },
              isPhaseGate: true,
              method: call.method,
            },
          };
        }
      }
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
      // Governance (matches Governance.js component callsites)
      'governance.proposals': () => {
        const now = Date.now();
        const gd = mockDataManager.mockData.governance || (mockDataManager.mockData.governance = {
          next_id: 1,
          proposals: [],
          // Keep this schema-shaped for Governance.js fetchGovernanceData()
          parameters: {
            quorum_default_pct: 51,
            voting_period_default_days: 7,
            pass_rule: 'for_gt_against_with_quorum',
          },
          voting_power: { account: '0x0000', power: 1000 },
          total_voting_power: 100000,
          votes_by_proposal: {}, // proposal_id -> { account -> 'for'|'against' }
        });

        // Always sync voting power to the latest wallet balance dynamically
        // We need to look up the balance using the ledger handler logic or direct wallet access
        const wallet = mockDataManager.mockData.wallet || {};
        const userBalance = wallet['0x0000']?.balance || 1000;
        gd.voting_power.power = userBalance;

        // Finalize proposals whose voting window ended
        for (const p of gd.proposals) {
          if (p.status !== 'active') continue;
          if (now < (p.ends_at || 0)) continue;

          const turnout = (Number(p.votes_for || 0) + Number(p.votes_against || 0));
          const quorumPct = Number(p.quorum || gd.parameters.quorum_default_pct || 51);
          const quorumNeeded = (Number(gd.total_voting_power || 0) * quorumPct) / 100;

          if (turnout < quorumNeeded) {
            p.status = 'rejected';
            p.result_reason = 'quorum_not_met';
          } else {
            p.status = (Number(p.votes_for || 0) > Number(p.votes_against || 0)) ? 'passed' : 'rejected';
            p.result_reason = (p.status === 'passed') ? 'majority_for' : 'majority_against';
          }
          p.finalized_at = now;
        }

        return {
          proposals: gd.proposals,
          parameters: gd.parameters,
          voting_power: gd.voting_power,
          total_voting_power: gd.total_voting_power,
        };
      },

      'governance.create_proposal': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const now = Date.now();

        const gd = mockDataManager.mockData.governance || (mockDataManager.mockData.governance = {
          next_id: 1,
          proposals: [],
          parameters: { quorum_default_pct: 51, voting_period_default_days: 7, pass_rule: 'for_gt_against_with_quorum' },
          voting_power: { account: '0x0000', power: 1000 },
          total_voting_power: 100000,
          votes_by_proposal: {},
        });

        const id = gd.next_id++;
        const votingPeriodDays = Math.max(1, Math.floor(Number(p.voting_period || gd.parameters.voting_period_default_days || 7)));
        const quorum = Math.max(1, Math.min(100, Math.floor(Number(p.quorum || gd.parameters.quorum_default_pct || 51))));

        const proposal = {
          id,
          title: String(p.title || `Proposal #${id}`),
          type: String(p.type || 'general'),
          description: String(p.description || ''),
          proposer: '0x0000',
          created_at: now,
          ends_at: now + votingPeriodDays * 24 * 3600 * 1000,
          voting_period: votingPeriodDays,
          quorum,
          votes_for: 0,
          votes_against: 0,
          status: 'active',
        };

        gd.proposals.unshift(proposal);
        gd.votes_by_proposal[id] = gd.votes_by_proposal[id] || {};
        return { ok: true, proposal_id: id };
      },

      'governance.vote': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const now = Date.now();

        const proposalId = Number(p.proposal_id);
        const vote = String(p.vote || '');
        if (!Number.isFinite(proposalId)) throw new Error('governance.vote: proposal_id required');
        if (!(vote === 'for' || vote === 'against')) throw new Error('governance.vote: vote must be for|against');

        const gd = mockDataManager.mockData.governance || (mockDataManager.mockData.governance = {
          next_id: 1,
          proposals: [],
          parameters: { quorum_default_pct: 51, voting_period_default_days: 7, pass_rule: 'for_gt_against_with_quorum' },
          voting_power: { account: '0x0000', power: 1000 },
          total_voting_power: 100000,
          votes_by_proposal: {},
        });

        const prop = gd.proposals.find(x => Number(x.id) === proposalId);
        if (!prop) throw new Error('governance.vote: proposal not found');
        if (prop.status !== 'active') throw new Error(`governance.vote: proposal not active (${prop.status})`);
        if (now >= (prop.ends_at || 0)) throw new Error('governance.vote: voting period ended');

        const account = '0x0000';
        
        // Dynamically get current voting power from ledger balance
        const wallet = mockDataManager.mockData.wallet || {};
        const power = wallet[account]?.balance || 1000;

        gd.votes_by_proposal[proposalId] = gd.votes_by_proposal[proposalId] || {};
        const prev = gd.votes_by_proposal[proposalId][account];

        // Remove previous vote (allows changing vote in mock mode)
        if (prev === 'for') prop.votes_for = Math.max(0, Number(prop.votes_for || 0) - power);
        if (prev === 'against') prop.votes_against = Math.max(0, Number(prop.votes_against || 0) - power);

        // Apply new vote
        gd.votes_by_proposal[proposalId][account] = vote;
        if (vote === 'for') prop.votes_for = Number(prop.votes_for || 0) + power;
        else prop.votes_against = Number(prop.votes_against || 0) + power;

        prop.last_vote_at = now;

        // Real-time status update (early finalize if >50% of total voting power)
        const total = Number(gd.total_voting_power || 0);
        if (prop.votes_for > total * 0.5) {
          prop.status = 'passed';
          prop.finalized_at = now;
          prop.result_reason = 'early_majority_for';
        } else if (prop.votes_against > total * 0.5) {
          prop.status = 'rejected';
          prop.finalized_at = now;
          prop.result_reason = 'early_majority_against';
        }

        return { ok: true, proposal_id: proposalId, status: prop.status, votes_for: prop.votes_for, votes_against: prop.votes_against };
      },
      // Storage (matches StorageMarket.js component callsites)
      'storage.list': () => {
        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.files = Array.isArray(sm.files) ? sm.files : [];
        sm.providers = Array.isArray(sm.providers) ? sm.providers : [];
        sm.escrow = Array.isArray(sm.escrow) ? sm.escrow : [];
        return { files: sm.files, providers: sm.providers, escrow: sm.escrow };
      },

      'storage.upload': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.files = Array.isArray(sm.files) ? sm.files : [];
        sm.providers = Array.isArray(sm.providers) ? sm.providers : [];
        sm.escrow = Array.isArray(sm.escrow) ? sm.escrow : [];

        const now = Date.now();
        const sizeBytes = Math.max(0, Math.floor(Number(p.size || 0)));
        const rentDays = Math.max(1, Math.floor(Number(p.rent_days || p.days || 30)));
        const filename = String(p.filename || `file-${now}.bin`);
        const cid = `Qm${String(Math.floor(mockDataManager.rng() * 1e16)).padStart(16,'0')}`;

        // Provider selection
        const requestedProvider = p.provider ? String(p.provider) : null;
        const provider = sm.providers.find(x => x.id === requestedProvider) || sm.providers[0] || { id: 'provider-00', price_per_gb: 0.25, status: 'active' };

        // Cost model: price_per_gb is interpreted as monthly price; pro-rate by rentDays/30.
        const BYTES_PER_GB = 1024 * 1024 * 1024;
        const sizeGb = sizeBytes / BYTES_PER_GB;
        const pricePerGbMonth = Number(provider.price_per_gb || 0.25);
        const cost = Math.max(0, sizeGb * pricePerGbMonth * (rentDays / 30));

        // Debit wallet + record escrow per file
        const wallet = mockDataManager.mockData.wallet || {};
        const user = wallet['0x0000'];
        if (user) {
          if (user.balance < cost) throw new Error(`Insufficient funds: needed ${cost}, have ${user.balance}`);
          user.balance -= cost;
          user.nonce++;
        }

        const rentPaidUntil = now + rentDays * 24 * 3600 * 1000;
        const file = {
          cid,
          name: filename,
          size: sizeBytes,
          uploaded_at: now,
          rent_paid_until: rentPaidUntil,
          provider: provider.id,
          pin_ipfs: Boolean(p.pin_ipfs),
          // Mock persistence for downloads
          base64Data: String(p.base64Data || ''),
          mime_type: 'application/octet-stream',
        };

        sm.files.unshift(file);

        const escrowEntry = sm.escrow.find(e => e.cid === cid);
        if (escrowEntry) {
          escrowEntry.balance = Number(escrowEntry.balance || 0) + cost;
          escrowEntry.updated_at = now;
        } else {
          sm.escrow.unshift({ cid, balance: cost, updated_at: now, rent_paid_until: rentPaidUntil });
        }

        return { ok: true, cid };
      },

      'storage.get': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const cid = String(p.cid || '');
        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.files = Array.isArray(sm.files) ? sm.files : [];
        const file = sm.files.find(f => f.cid === cid);
        if (!file) throw new Error('storage.get: file not found');
        return { cid, data: String(file.base64Data || ''), mime_type: file.mime_type || 'application/octet-stream' };
      },

      'storage.extend_rent': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const cid = String(p.cid || '');
        const days = Math.max(1, Math.floor(Number(p.days || 30)));
        const now = Date.now();

        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.files = Array.isArray(sm.files) ? sm.files : [];
        sm.providers = Array.isArray(sm.providers) ? sm.providers : [];
        sm.escrow = Array.isArray(sm.escrow) ? sm.escrow : [];

        const file = sm.files.find(f => f.cid === cid);
        if (!file) throw new Error('storage.extend_rent: file not found');

        const provider = sm.providers.find(x => x.id === file.provider) || sm.providers[0] || { id: 'provider-00', price_per_gb: 0.25, status: 'active' };
        const BYTES_PER_GB = 1024 * 1024 * 1024;
        const sizeGb = Number(file.size || 0) / BYTES_PER_GB;
        const pricePerGbMonth = Number(provider.price_per_gb || 0.25);
        const cost = Math.max(0, sizeGb * pricePerGbMonth * (days / 30));

        const wallet = mockDataManager.mockData.wallet || {};
        const user = wallet['0x0000'];
        if (user) {
          if (user.balance < cost) throw new Error(`Insufficient funds: needed ${cost}, have ${user.balance}`);
          user.balance -= cost;
          user.nonce++;
        }

        const base = Math.max(now, Number(file.rent_paid_until || now));
        file.rent_paid_until = base + days * 24 * 3600 * 1000;

        const escrowEntry = sm.escrow.find(e => e.cid === cid);
        if (escrowEntry) {
          escrowEntry.balance = Number(escrowEntry.balance || 0) + cost;
          escrowEntry.updated_at = now;
          escrowEntry.rent_paid_until = file.rent_paid_until;
        } else {
          sm.escrow.unshift({ cid, balance: cost, updated_at: now, rent_paid_until: file.rent_paid_until });
        }

        return { ok: true, cid, rent_paid_until: file.rent_paid_until };
      },

      'storage.bulk_extend_rent': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const cids = Array.isArray(p.cids) ? p.cids.map(String) : [];
        const days = Math.max(1, Math.floor(Number(p.days || 30)));
        const results = [];
        for (const cid of cids) {
          results.push(handlers['storage.extend_rent']([{ cid, days }]));
        }
        return { ok: true, results };
      },

      'storage.deposit_escrow': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const amount = Number(p.amount || 0);
        if (amount <= 0) throw new Error('Amount must be positive');

        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.escrow = Array.isArray(sm.escrow) ? sm.escrow : [];
        
        // Debit wallet
        const wallet = mockDataManager.mockData.wallet || {};
        const user = wallet['0x0000'];
        if (user) {
          if (user.balance < amount) throw new Error(`Insufficient funds: needed ${amount}, have ${user.balance}`);
          user.balance -= amount;
          user.nonce++;
        }

        // Credit escrow (general bucket for simplicity in mock, or find 'general' entry)
        // We'll use a 'general_deposit' entry for unallocated funds
        let generalEntry = sm.escrow.find(e => e.cid === 'general_deposit');
        if (!generalEntry) {
          generalEntry = { cid: 'general_deposit', balance: 0, updated_at: Date.now() };
          sm.escrow.unshift(generalEntry);
        }
        generalEntry.balance += amount;
        generalEntry.updated_at = Date.now();

        return { ok: true, new_balance: generalEntry.balance };
      },

      'storage.withdraw_escrow': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const amount = Number(p.amount || 0);
        if (amount <= 0) throw new Error('Amount must be positive');

        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.escrow = Array.isArray(sm.escrow) ? sm.escrow : [];

        // Find available funds (checking 'general_deposit' first)
        let generalEntry = sm.escrow.find(e => e.cid === 'general_deposit');
        if (!generalEntry || generalEntry.balance < amount) {
           throw new Error(`Insufficient escrow funds: needed ${amount}, have ${generalEntry ? generalEntry.balance : 0}`);
        }

        // Debit escrow
        generalEntry.balance -= amount;
        generalEntry.updated_at = Date.now();

        // Credit wallet
        const wallet = mockDataManager.mockData.wallet || {};
        const user = wallet['0x0000'];
        if (user) {
          user.balance += amount;
          user.nonce++;
        }

        return { ok: true, new_balance: generalEntry.balance };
      },

      'storage.delete': (rawParams) => {
        const p = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const cid = String(p.cid || '');
        const sm = mockDataManager.mockData.storageMarket || (mockDataManager.mockData.storageMarket = {});
        sm.files = Array.isArray(sm.files) ? sm.files : [];
        sm.escrow = Array.isArray(sm.escrow) ? sm.escrow : [];

        const idx = sm.files.findIndex(f => f.cid === cid);
        if (idx === -1) return { ok: false, error: 'file_not_found' };

        // Refund escrow for this file back to the wallet to keep accounting sane.
        const eIdx = sm.escrow.findIndex(e => e.cid === cid);
        if (eIdx !== -1) {
          const entry = sm.escrow[eIdx];
          const refund = Number(entry.balance || 0);
          const wallet = mockDataManager.mockData.wallet || {};
          const user = wallet['0x0000'];
          if (user && refund > 0) {
            user.balance += refund;
            user.nonce++;
          }
          sm.escrow.splice(eIdx, 1);
        }

        sm.files.splice(idx, 1);
        return { ok: true };
      },

      // Consensus
      'consensus.block_height': () => {
        const height = this.getMockBlockHeight();
        const sim = mockDataManager.get('simulation') || {};
        const lag = sim.finalityLagBlocks != null ? sim.finalityLagBlocks : 5;
        return {
          height,
          finalized_height: Math.max(0, height - lag),
        };
      },

      'consensus.tps': () => {
        const metrics = this.getMockMetrics();
        return {
          tps: metrics.tps,
          avgBlockTime: metrics.avgBlockTime,
        };
      },

      'consensus.finality_status': () => {
        const height = this.getMockBlockHeight();
        const sim = mockDataManager.get('simulation') || {};
        const lag = sim.finalityLagBlocks != null ? sim.finalityLagBlocks : 5;
        const finalized_height = Math.max(0, height - lag);
        return {
          finalized_height,
          finalized_hash: `0x${Math.floor(mockDataManager.rng() * 0xFFFFFFFFFFFF).toString(16).padStart(12,'0')}`,
          current_height: height,
          blocks_until_finality: Math.max(0, lag - 1),
        };
      },
      
      'consensus.stats': () => {
        const metrics = this.getMockMetrics();
        return {
          tps: metrics.tps,
          avg_block_time_ms: metrics.avgBlockTime * 1000,
        };
      },
      
      'consensus.block': ([height]) => {
        const h = height || this.getMockBlockHeight();
        // Deterministic hash: derived from block height so same height = same hash every call
        const hashA = ((h * 0x9E3779B9) >>> 0).toString(16).padStart(8, '0');
        const hashB = ((h * 0x6C62272E) >>> 0).toString(16).padStart(8, '0');
        const hashC = ((h * 0x85EBCA77) >>> 0).toString(16).padStart(8, '0');
        const tpsHistory = mockDataManager.get('tpsHistory') || [];
        const lastTps = tpsHistory.length ? tpsHistory[tpsHistory.length - 1].value : 80;
        return {
          height: h,
          hash: `0x${hashA}${hashB}${hashC}`,
          // Timestamp: each block is exactly 1s behind the previous from current time
          timestamp: Date.now() - ((mockDataManager.currentBlock - h) * 1000),
          tx_count: Math.max(1, Math.round(lastTps)),
          transactions: [],
        };
      },

      'consensus.validators': () => {
        const validators = mockDataManager.get('validators') || [];
        // Always prefer mockDataManager validators; inline fallback only fires before init
        return { validators: validators.length ? validators : Array.from({ length: 20 }, (_, i) => ({
          id: `validator-${String(i + 1).padStart(2, '0')}`,
          stake: Math.floor(50_000 + mockDataManager.rng() * 150_000),
          commission: 0.03 + mockDataManager.rng() * 0.07,
          uptime: 0.96 + mockDataManager.rng() * 0.04,
          is_active: true,
          blocks_proposed: 0,
          blocks_missed: 0,
        })) };
      },
      
      // Ledger
      balance: ([paramsObj = {}]) => ({
        amount: 100_000 + (paramsObj.address ? paramsObj.address.length : 0),
      }),
      
      'ledger.balance': ([account]) => {
        const addr = account || '0x0000';
        const wallet = mockDataManager.mockData.wallet || {};
        if (wallet[addr]) return { account: addr, ...wallet[addr] };

        // Fallback to deterministic balance if not found in state
        let h = 5381;
        for (let c = 0; c < addr.length; c++) h = ((h << 5) + h) + addr.charCodeAt(c);
        const balance = 10_000 + (Math.abs(h) % 90_000);
        const nonce   = Math.abs(h ^ (h >>> 16)) % 100;
        return { account: addr, balance, nonce };
      },

      'ledger.transactions': ([params = {}]) => {
        const limit  = params.limit  || 5;
        const offset = params.offset || 0;
        const tip    = mockDataManager.currentBlock || 0;
        const feeHistory = mockDataManager.get('feeHistory') || [];
        const baseFee = feeHistory.length ? feeHistory[feeHistory.length - 1].value : 25_000;
        const transactions = Array.from({ length: limit }, (_, i) => {
          const idx  = offset + i;
          const blk  = tip - idx;
          // Deterministic hash per (block, index) pair
          const hashA = ((blk  * 0x9E3779B9) >>> 0).toString(16).padStart(8, '0');
          const hashB = ((idx  * 0x6C62272E) >>> 0).toString(16).padStart(8, '0');
          const fromA = ((blk  * 0x517CC1B7) >>> 0).toString(16).padStart(8, '0');
          const toA   = ((idx  * 0xBF58476D) >>> 0).toString(16).padStart(8, '0');
          const amount = 10 + ((blk * 31 + idx * 17) % 990);
          const fee    = Math.round(baseFee / 1_000_000 * (1 + (idx % 3) * 0.15) * 100) / 100;
          return {
            hash: `0x${hashA}${hashB}`,
            from: `0x${fromA}${fromA}`,
            to:   `0x${toA}${toA}`,
            amount,
            fee,
            timestamp: Date.now() - idx * 1000,
            status: 'confirmed',
          };
        });
        return {
          transactions,
          total: tip,   // total confirmed txs ≈ block height
          limit,
          offset,
        };
      },
      
      // Peer / Net
      'net.overlay_status': () => {
        const sim = mockDataManager.get('simulation') || {};
        const active = sim.activePeerCount != null ? sim.activePeerCount : 64;
        return {
          backend: 'mock',
          active_peers: active,
          persisted_peers: active,
          database_path: null,
        };
      },

      'net.peer_stats_all': ([args = {}]) => {
        const peers = this.getMockPeers();
        const sim = mockDataManager.get('simulation') || {};
        const outage = Boolean(sim.outageActive);
        const offset = args.offset || 0;
        const limit = args.limit || peers.length;
        return peers.slice(offset, offset + limit).map((p) => {
          const baseReq = outage ? 12 : 120;
          const reqJitter = Math.round(mockDataManager.rng() * (outage ? 30 : 80));
          const req = baseReq + reqJitter;

          const baseBytes = outage ? 50_000 : 1_250_000;
          const bytes = baseBytes + Math.round(mockDataManager.rng() * baseBytes * 0.35);

          // Reputation degrades under outage/attack; also correlates with latency
          const repBase = outage ? 520 : (sim.preset === 'ATTACK' ? 720 : 920);
          const rep = Math.max(100, Math.round(repBase - (p.latency / 3) + mockDataManager.noise(15)));

          return {
            peer_id: p.id,
            metrics: {
              requests: req,
              bytes_sent: bytes,
              reputation: { score: rep },
              last_updated: Date.now(),
              req_avg: Math.max(0.2, req / 20),
              byte_avg: Math.max(64, Math.round(bytes / 1000)),
              throttled_until: 0,
              throttle_reason: null,
              last_handshake_ms: Date.now() - Math.round(200 + mockDataManager.rng() * 1200),
              backoff_level: outage ? 2 : (sim.preset === 'ATTACK' ? 1 : 0),
            },
          };
        });
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

      'peer.stats': () => {
        const sim = mockDataManager.get('simulation') || {};
        const total = sim.activePeerCount != null ? sim.activePeerCount : 64;
        const active = sim.activePeerCount != null ? sim.activePeerCount : 58;
        const avgLatency = sim.avgLatencyMs != null ? sim.avgLatencyMs : 22;
        return {
          total,
          active,
          avgLatency,
          bandwidth: {
            inbound: Math.round(1_000_000 * (sim.outageActive ? 0.15 : 1.0)),
            outbound: Math.round(800_000 * (sim.outageActive ? 0.20 : 1.0)),
          },
        };
      },
      
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
      'governance.proposals': () => {
        // Vote tallies grow deterministically per block so they visibly advance without jumping
        const tip = mockDataManager.currentBlock || 0;
        return {
          proposals: Array.from({ length: 3 }, (_, i) => ({
            id: `proposal-${i + 1}`,
            title: `Proposal ${i + 1}`,
            status: ['active', 'pending', 'passed'][i % 3],
            votes: {
              yes: 500_000 + ((tip + i * 4201) % 500_000),
              no:  100_000 + ((tip + i * 1733) % 200_000),
            },
          })),
        };
      },
      
      'governor.status': () => {
        const adQ  = mockDataManager.mockData?.adQuality    || {};
        const eMkt = mockDataManager.mockData?.energyMarket  || {};
        const sim  = mockDataManager.get('simulation')       || {};

        // Synthetic localnet: trade (open) by default; outage/attack pushes toward rehearsal/shadow.
        const isOutage = Boolean(sim.outageActive);
        const isAttack = sim.preset === 'ATTACK';
        const gateMode = (isOutage || isAttack) ? 'rehearsal' : 'trade';

        return {
          // Top-level governor launch mode: shadow | rehearsal | trade
          launch_mode: gateMode,

          // active_gates is scenario-driven: outage/attack suppress gate activity
          active_gates: (() => {
            const base = isOutage ? 1 : (isAttack ? 2 : 3);
            return base + ((mockDataManager.currentBlock || 0) % 3 === 0 ? 1 : 0);
          })(),

          // Per-market gate objects: { mode, streak, utilization_ok, margin_ok }
          gates: {
            storage: { mode: gateMode, streak: 18, utilization_ok: !isOutage, margin_ok: true },
            compute: { mode: gateMode, streak: 22, utilization_ok: !isOutage, margin_ok: !isAttack },
            energy:  { mode: isOutage ? 'shadow' : gateMode, streak: isOutage ? 0 : 12, utilization_ok: !isOutage, margin_ok: true },
            ad:      { mode: gateMode, streak: 9,  utilization_ok: true,      margin_ok: true },
          },

          // Per-market array — index-ordered: storage, compute, energy, ad
          economics_prev_market_metrics: [
            { market: 'storage', utilization_ppm: 650_000, provider_margin_ppm: 120_000 },
            { market: 'compute', utilization_ppm: 680_000, provider_margin_ppm: 135_000 },
            { market: 'energy',  utilization_ppm: Math.round((eMkt.avg_utilization ?? 0.58) * 1_000_000), provider_margin_ppm: 110_000 },
            { market: 'ad',      utilization_ppm: Math.round((adQ.cohort_utilization  ?? 0.72) * 1_000_000), provider_margin_ppm: 145_000 },
          ],

          // Gate streak + thresholds (Economics/Launch Governor panel)
          gate_streak:      isOutage ? 0 : (mockDataManager.currentBlock || 0) % 28,
          streak_target:    14,
          utilization_gate: 0.60,
          margin_gate:      0.10,
        };
      },
      
      'governor.decisions': () => ({
        decisions: Array.from({ length: 5 }, (_, i) => ({
          id: `decision-${i + 1}`,
          title: `Parameter update ${i + 1}`,
          status: ['passed', 'pending', 'rejected'][i % 3],
          executed: i % 3 === 0,
        })),
      }),
      
      // Energy
      'energy.market_state': () => {
        // Delegate to mockDataManager for the authoritative provider array
        const eMkt = mockDataManager.get('energyMarket') || {};
        const providers = eMkt.providers || [];
        // Generate mock receipts and disputes shaped to match EnergyMarket.js expectations
        const receipts = providers.flatMap((p, pi) =>
          Array.from({ length: p.receipts_count ? Math.min(p.receipts_count, 3) : 0 }, (_, ri) => ({
            receipt_id: `rcpt-${pi}-${ri}`,
            provider_id: p.provider_id,
            energy_kwh: Math.floor(p.delivered_kwh / Math.max(1, p.receipts_count) * (0.8 + mockDataManager.rng() * 0.4)),
            amount: parseFloat((p.price_per_kwh * p.delivered_kwh / Math.max(1, p.receipts_count)).toFixed(2)),
            timestamp: Date.now() - Math.floor(mockDataManager.rng() * 86400000),
          }))
        );
        const disputes = providers
          .filter(p => p.disputes_count > 0)
          .map((p, i) => ({
            id: `dispute-${i}`,
            provider_id: p.provider_id,
            reason: ['meter_mismatch', 'delivery_shortfall', 'price_dispute'][i % 3],
            status: 'pending',
            created_at: Date.now() - Math.floor(mockDataManager.rng() * 604800000),
          }));
        return {
          providers,
          receipts,
          disputes,
          total_capacity: eMkt.total_capacity || 0,
          total_delivered: eMkt.total_delivered || 0,
          avg_utilization: eMkt.avg_utilization || 0,
          avg_price: eMkt.avg_price || 0,
        };
      },
      
      'energy.providers': () => {
        // Prefer authoritative provider array from mockDataManager energyMarket;
        // only fall back to synthesized set if it hasn't initialised yet.
        const eMkt = mockDataManager.get('energyMarket') || {};
        if (eMkt.providers && eMkt.providers.length) {
          return { providers: eMkt.providers };
        }
        const sim = mockDataManager.get('simulation') || {};
        return {
          providers: Array.from({ length: 5 }, (_, i) => {
            const cap = Math.floor(800 + mockDataManager.rng() * 400);
            return {
              id: `energy-0x${i + 1}`,
              capacity: cap,
              available: Math.floor(cap * (0.65 + mockDataManager.rng() * 0.30)),
              price: parseFloat((1.1 + mockDataManager.rng() * 0.3).toFixed(4)),
              reputation: parseFloat((0.92 + mockDataManager.rng() * 0.07).toFixed(4)),
            };
          }),
        };
      },
      
      // Compute Market
      'compute_market.stats': () => {
        const cm = mockDataManager.get('computeMarket') || {};
        return {
          industrial_backlog:      cm.pending               || 3,
          industrial_utilization:  cm.avg_utilization       || 0.72,
          industrial_units_total:  cm.total_capacity        || 1200,
          active_jobs:             cm.active_jobs           || 20,
          pending:                 cm.pending               || 3,
        };
      },

      'compute_market.state': () => {
        const cm = mockDataManager.get('computeMarket') || {};
        return {
          active_jobs:     cm.active_jobs      || 20,
          total_capacity:  cm.total_capacity   || 1500,
          avg_utilization: cm.avg_utilization  || 0.72,
          providers:       (cm.providers || []).length,
        };
      },

      'compute_market.jobs': () => {
        const cm = mockDataManager.get('computeMarket') || {};
        if (cm.jobs && Array.isArray(cm.jobs)) return { jobs: cm.jobs };
        const providers = cm.providers || [];
        const jobs = providers.flatMap((p, pi) =>
          Array.from({ length: p.active_jobs || 0 }, (_, ji) => ({
            id: `job-${pi}-${ji}`,
            provider_id: p.provider_id,
            status: ['running', 'pending', 'completing'][ji % 3],
            compute_units: Math.floor(10 + mockDataManager.rng() * 90),
            started_at: Date.now() - Math.floor(mockDataManager.rng() * 3600000),
          }))
        ).slice(0, 20);
        return { jobs };
      },

      // ── Mutating RPCs (Stateful Mock) ─────────────────────────────────────────────
      'compute_market.submit_job': (rawParams) => {
        const data = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const cm = mockDataManager.mockData.computeMarket || (mockDataManager.mockData.computeMarket = {});
        cm.jobs = Array.isArray(cm.jobs) ? cm.jobs : [];
        cm.providers = Array.isArray(cm.providers) ? cm.providers : [];
        if (!cm.providers.length) {
          cm.providers = [{ provider_id: 'provider-00', active_jobs: 0, total_capacity: 1000 }];
        }

        // Simple heuristic: pick provider with lowest active jobs
        let best = cm.providers[0];
        for (const p of cm.providers) {
          if ((p.active_jobs || 0) < (best.active_jobs || 0)) best = p;
        }

        const job_id = `job-${Date.now()}-${String(Math.floor(mockDataManager.rng()*1e9)).padStart(9,'0')}`;
        const job = {
          id: job_id,
          provider_id: best.provider_id,
          status: 'pending',
          compute_units: Math.max(1, Math.floor(Number(data.compute_units || data.units || 10))),
          started_at: Date.now(),
          submitted_at: Date.now(),
          spec: data,
        };

        // Charge the wallet for the job
        const wallet = mockDataManager.mockData.wallet || {};
        const user = wallet['0x0000'];
        if (user) {
          const cost = job.compute_units * 0.05; // 0.05 BLOCK per unit
          if (user.balance < cost) throw new Error(`Insufficient funds: needed ${cost}, have ${user.balance}`);
          user.balance -= cost;
          user.nonce++;
        }

        cm.jobs.unshift(job); // add to top
        best.active_jobs = (best.active_jobs || 0) + 1;
        cm.pending = (cm.pending || 0) + 1;
        cm.active_jobs = (cm.active_jobs || 0) + 1;

        return { job_id };
      },

      'compute_market.cancel_job': (rawParams) => {
        const params = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const jobId = params.job_id || params.id;
        const cm = mockDataManager.mockData.computeMarket || (mockDataManager.mockData.computeMarket = {});
        cm.jobs = Array.isArray(cm.jobs) ? cm.jobs : [];
        cm.providers = Array.isArray(cm.providers) ? cm.providers : [];

        const j = cm.jobs.find(x => x.id === jobId);
        if (!j) return { ok: false, error: 'job_not_found' };
        if (j.status === 'cancelled') return { ok: true };
        j.status = 'cancelled';
        j.cancelled_at = Date.now();

        const p = cm.providers.find(x => x.provider_id === j.provider_id);
        if (p && (p.active_jobs || 0) > 0) p.active_jobs -= 1;
        if ((cm.pending || 0) > 0) cm.pending -= 1;
        if ((cm.active_jobs || 0) > 0) cm.active_jobs -= 1;

        return { ok: true };
      },

      'dex.place_order': (rawParams) => {
        const params = Array.isArray(rawParams) ? (rawParams[0] || {}) : (rawParams || {});
        const side = String(params.side || '').toLowerCase();
        const qty = Number(params.qty ?? params.quantity ?? 0);
        const price = Number(params.price ?? 0);
        
        if (!(side === 'buy' || side === 'sell')) throw new Error('dex.place_order: side must be buy|sell');
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('dex.place_order: qty must be > 0');
        // Deduct balance from mock wallet
        const wallet = mockDataManager.mockData.wallet || {};
        const user = wallet['0x0000'];
        if (user) {
          const cost = Number(price) * Number(qty);
          if (side === 'buy') {
            if (user.balance < cost) throw new Error(`Insufficient funds: needed ${cost}, have ${user.balance}`);
            user.balance -= cost;
          } else {
            // For sell, we'd check token balance, but we only track BLOCK (native) right now.
            // Just increment balance to simulate a \"sell into BLOCK\" if the pair is reversed,
            // or assume we are selling tokens for BLOCK.
            // For now, simple model: sell = receive BLOCK.
            user.balance += cost;
          }
          user.nonce++;
        }

        // Mutate the single shared orderBook snapshot
        const ob = mockDataManager.mockData.orderBook || (mockDataManager.mockData.orderBook = {});
        ob.source = 'mock';
        ob.updated_at = Date.now();

        // Push the mid toward the limit price by a bounded fraction (market impact)
        const mid = Number(ob.mid_price ?? ob.midPrice ?? price);
        const alpha = 0.12; 
        const nextMid = mid + (price - mid) * alpha;
        ob.mid_price = nextMid;
        ob.last_trade_price = nextMid;

        // Attribute notional as 24h volume
        const notional = qty * price;
        ob.volume_24h_usd = Number(ob.volume_24h_usd || 0) + notional;
        
        // ── Depth Chart Coherence ──
        // In mock mode, actual orders must impact the depth directly.
        if (!ob.bids) ob.bids = [];
        if (!ob.asks) ob.asks = [];
        
        const isBuy = side === 'buy';
        const targetArray = isBuy ? ob.bids : ob.asks;
        
        // Find exact price level or insert, matching expected depth structure (price, qty, ...)
        const priceStr = price.toFixed(4);
        const existingIdx = targetArray.findIndex(lvl => 
          (Array.isArray(lvl) && lvl[0] === priceStr) || 
          (lvl.price && lvl.price.toString() === priceStr)
        );
        
        if (existingIdx >= 0) {
          if (Array.isArray(targetArray[existingIdx])) {
             targetArray[existingIdx][1] += qty;
          } else {
             targetArray[existingIdx].qty = (targetArray[existingIdx].qty || 0) + qty;
          }
        } else {
          // Most likely array based on standard crypto schemas. Fallback format.
          targetArray.push([priceStr, qty]);
        }

        // Sort orderbook 
        ob.bids.sort((a, b) => {
           const pa = Array.isArray(a) ? Number(a[0]) : Number(a.price);
           const pb = Array.isArray(b) ? Number(b[0]) : Number(b.price);
           return pb - pa; // bids descending
        });
        ob.asks.sort((a, b) => {
           const pa = Array.isArray(a) ? Number(a[0]) : Number(a.price);
           const pb = Array.isArray(b) ? Number(b[0]) : Number(b.price);
           return pa - pb; // asks ascending
        });

        const order = {
          token: params.token || 'BLOCK',
          side: side.toUpperCase(),
          qty,
          price,
          timestamp: Date.now(),
          source: 'mock',
        };

        return { ok: true, order, order_book: ob };
      },

      // Storage Market
      'storage_market.state': () => {
        const sm = mockDataManager.get('storageMarket') || {};
        return {
          total_capacity_gb: sm.total_capacity_gb || 0,
          total_used_gb:     sm.total_used_gb     || 0,
          avg_utilization:   sm.avg_utilization   || 0,
          providers:         (sm.providers || []).length,
          volume_24h_block:  sm.volume_24h_block  || 0,
        };
      },

      'storage_market.providers': () => {
        const sm = mockDataManager.get('storageMarket') || {};
        return { providers: sm.providers || [] };
      },

      // Receipt audit (canonical explorer surface)
      'receipt.audit': ([params = {}]) => {
        const startH = params.start_height || Math.max(0, (mockDataManager.currentBlock || 0) - 240);
        const endH   = params.end_height   || (mockDataManager.currentBlock || 0);
        const limit  = Math.min(params.limit || 128, 512);

        const span = Math.max(0, endH - startH + 1);
        const count = Math.min(limit, span);

        const receipts = Array.from({ length: count }, (_, i) => {
          const blk  = startH + i;
          const hashA = ((blk * 0x9E3779B9) >>> 0).toString(16).padStart(8, '0');
          const hashB = ((blk * 0x6C62272E) >>> 0).toString(16).padStart(8, '0');
          const markets = ['storage', 'compute', 'energy', 'ad'];
          const market  = markets[blk % markets.length];
          const isEpoch = (blk % 120 === 0);

          return {
            block_height:   blk,
            receipt_index:  0,
            receipt_type:   isEpoch ? 'EpochEconomics' : market,
            digest_hex:     `${hashA}${hashB}`,
            amount:         isEpoch ? 0 : Math.floor(10 + (blk * 7) % 500),
            receipt: {
              market,
              provider_id:  `${market}-0x${String((blk % 12) + 1).padStart(2,'0')}`,
              buyer:        `0x${hashA}${hashA}`,
              block_height: blk,
            },
            audit_queries:     1,
            invariants:        'pass',
            causality:         'valid',
            provider_identity: 'verified',
            subsidies: {
              storage_sub: isEpoch ? 0 : Math.floor(2 + (blk % 8)),
              read_sub:    isEpoch ? 0 : Math.floor(1 + (blk % 4)),
              compute_sub: isEpoch ? 0 : Math.floor(2 + (blk % 6)),
              ad_sub:      0,
              rebate:      0,
            },
            disputes: [],
          };
        });

        return {
          schema_version: 1,
          receipts,
          scanned_range: { start: startH, end: endH },
          truncated: span > limit,
          next_start_height: span > limit ? (startH + limit) : null,
        };
      },
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
          amount: Math.floor(100 + mockDataManager.rng() * 900),
          status: ['active', 'pending', 'won'][i % 3],
        })),
      }),

      'ad_market.readiness': () => {
        const snap = mockDataManager.mockData?.adReadiness;
        if (snap) return snap;
        // Fallback: minimal but schema-compatible object
        return {
          segment_readiness: {
            presence_buckets: {
              cohort_0: {
                freshness_histogram: {
                  under_1h_ppm: 620_000,
                  hours_1_to_6_ppm: 250_000,
                  hours_6_to_24_ppm: 100_000,
                  over_24h_ppm: 30_000,
                },
              },
            },
            privacy_budget: { remaining_ppm: 880_000 },
          },
          utilization_summary: { mean_ppm: 760_000 },
          ready_streak_windows: 8,
          ready: true,
          unique_viewers: 12_400,
          host_count: 37,
        };
      },

      'ad_market.policy_snapshot': () => {
        const snap = mockDataManager.mockData?.adPolicySnapshot;
        if (snap) return snap;
        return {
          as_of_ms: Date.now(),
          note: 'Mock policy snapshot (placeholder)',
          cohort_quality_floor_ppm: 500_000,
          cohort_quality_ceil_ppm: 1_500_000,
          base_bid_median_microunits: 50_000, // 0.050 BLOCK
        };
      },
      
      // Treasury — balance is emission-derived (protocol treasury takes a % of block rewards)
      'treasury.balance': () => {
        // Protocol: treasury_cut = floor(blockReward × TREASURY_PERCENT / 100) per block.
        // Accumulated treasury ≈ total_emission × (treasury_percent / 100).
        const TREASURY_PCT = 0.10; // mirrors CONSTANTS.TREASURY_PERCENT_DEFAULT
        const emission   = mockDataManager.currentEmission || 3_200_000;
        const balance    = Math.round(emission * TREASURY_PCT);

        const dev_alloc  = Math.round(balance * 0.40);
        const ops_alloc  = Math.round(balance * 0.30);
        const res_alloc  = balance - dev_alloc - ops_alloc;

        return {
          balance,
          total_inflow:  Math.round(emission * TREASURY_PCT * 0.95),
          total_outflow: Math.round(emission * TREASURY_PCT * 0.05),
          allocations: { development: dev_alloc, operations: ops_alloc, reserves: res_alloc },
        };
      },

      'treasury.disbursements': () => {
        const tip = mockDataManager.currentBlock || 0;
        return {
          disbursements: Array.from({ length: 3 }, (_, i) => {
            const recipA = ((tip * 0x517CC1B7 + i * 0xDEADBEEF) >>> 0).toString(16).padStart(8, '0');
            return {
              id: `disb-${i + 1}`,
              amount: 10_000 + ((tip * 31 + i * 1337) % 90_000),
              recipient: `0x${recipA}${recipA}`,
              status: ['completed', 'pending', 'scheduled'][i % 3],
            };
          }),
        };
      },
      
      // Analytics
      analytics: () => {
        const tpsHistory  = mockDataManager.get('tpsHistory')  || [];
        const lastTps     = tpsHistory.length ? tpsHistory[tpsHistory.length - 1].value : 80;
        const ob          = mockDataManager.get('orderBook')   || {};
        const validators  = mockDataManager.get('validators')  || [];

        const daily_transactions = Math.round(lastTps * 86_400);
        const daily_volume_usd  = ob.volume_24h_usd || 0;

        const emission = mockDataManager.currentEmission || 3_200_000;
        const active_accounts = Math.round(emission / 160);

        return {
          daily_transactions,
          daily_volume:       daily_volume_usd,
          daily_volume_usd,
          daily_volume_block: ob.volume_24h_block || 0,
          active_accounts,
          active_validators:  validators.filter(v => v.is_active).length || 20,
          block_height:       mockDataManager.currentBlock || 0,
          current_epoch:      mockDataManager.currentEpoch || 0,
        };
      },
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

  async getAdReadiness(params = {}) {
    return this.call('ad_market.readiness', [params]);
  }

  async getAdPolicySnapshot(params = {}) {
    return this.call('ad_market.policy_snapshot', [params]);
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
    const metrics     = this.getMockMetrics();
    const blockHeight = this.getMockBlockHeight();
    const sim         = mockDataManager.get('simulation') || {};
    const lag         = sim.finalityLagBlocks != null ? sim.finalityLagBlocks : 5;

    // Do NOT clamp tps to 800 — that was masking actual scenario signal.
    // Realistic early-network baseline is 80–200 TPS; respect it.
    const tps = Math.max(10, metrics.tps);

    // Queue pressure grows under STRESS/ATTACK (more pending jobs)
    const queueBase = sim.preset === 'STRESS' ? 300 : (sim.preset === 'ATTACK' ? 600 : 50);
    const schedulerQueueSize = queueBase + ((blockHeight % 100));

    // Active governor gates are suppressed during OUTAGE
    const governorActiveGates = sim.outageActive ? 2 : (sim.preset === 'ATTACK' ? 5 : 8 + (blockHeight % 7));

    return {
      blockHeight,
      finalizedHeight: Math.max(0, blockHeight - lag),
      tps,
      avgBlockTime: metrics.avgBlockTime,
      peers:       metrics.activePeers,
      activePeers: metrics.activePeers,
      avgLatency:  metrics.avgLatency,
      fees:        metrics.fees,
      validators:  metrics.validators,
      totalSupply: metrics.totalSupply,
      schedulerQueueSize,
      governorActiveGates,
      errors: [],
    };
  }

  async getNetworkOverview() {
    const metrics    = this.getMockMetrics();
    const peers      = this.getMockPeers();
    const sim        = mockDataManager.get('simulation') || {};

    // Syncing count reflects outage/attack scenario directly
    const syncingCount = sim.outageActive
      ? Math.round(peers.length * 0.6)
      : (sim.preset === 'ATTACK' ? Math.round(peers.length * 0.3) : 0);

    // Use the live validator array from mockDataManager — it already has all fields
    // (uptime_pct, is_active, blocks_proposed, blocks_missed) updated by updateValidatorTick.
    const validators = mockDataManager.get('validators') || [];

    return {
      peers,
      stats: {
        total:      metrics.activePeers,
        active:     metrics.activePeers,
        avgLatency: metrics.avgLatency,
        blockHeight:  mockDataManager.currentBlock || 0,
        finalizedHeight: Math.max(0, (mockDataManager.currentBlock || 0) - (sim.finalityLagBlocks || 5)),
        bandwidth: {
          inbound:  Math.round(1_000_000 * (sim.outageActive ? 0.15 : 1.0)),
          outbound: Math.round(800_000  * (sim.outageActive ? 0.20 : 1.0)),
        },
        syncing: syncingCount,
      },
      validators,
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

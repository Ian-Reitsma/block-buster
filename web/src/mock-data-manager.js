/**
 * Mock Data Manager
 * 
 * Provides formula-based realistic data when node is not connected.
 * Detects node for 5 seconds before falling back to mock mode.
 * 
 * All mock data is generated using actual blockchain formulas from:
 * ~/projects/the-block/docs/economics_and_governance.md
 * ~/projects/the-block/node/src/dex/order_book.rs
 */

import appState from './state.js';
import { CONSTANTS, computeIssuance } from './EconomicsEngine.js';

// ── Block capacity constants — mirrors node/src/receipts_validation.rs ────────────────────────
// These are protocol constants derived from block execution budgets (NOT configurable knobs).
// Dashboard uses them to compute TPS utilization percentages accurately in mock mode.
// Must stay in sync with receipts_validation.rs if those values ever change.
//
//   RECEIPT_BYTE_BUDGET    = 10_000_000  (10 MB/block — bandwidth + storage pressure limit)
//   RECEIPT_VERIFY_BUDGET  = 100_000     (verify-units/block — deterministic CPU budget)
//   MIN_RECEIPT_BYTE_FLOOR = 1_000       (min encoded bytes per receipt)
//   MIN_RECEIPT_VERIFY_UNITS = 10        (min verify-units per receipt)
//   HARD_RECEIPT_CEILING   = 50_000      (absolute fuse — never exceeded)
//
// MAX_RECEIPTS_PER_BLOCK = min(10_000_000/1_000, 100_000/10, 50_000) = 10,000
// BLOCK_MAX_TPS          = 10,000 receipts/block ÷ 1s/block = 10,000 TPS
// BLOCK_TARGET_TPS       = 10,000 × 0.60 (EIP-1559 controller target fraction) = 6,000 TPS
const _RECEIPT_BYTE_BOUND   = Math.floor(10_000_000 / 1_000);   // 10,000
const _RECEIPT_VERIFY_BOUND = Math.floor(100_000    / 10);       // 10,000
const BLOCK_MAX_RECEIPTS    = Math.min(_RECEIPT_BYTE_BOUND, _RECEIPT_VERIFY_BOUND, 50_000); // 10,000
const BLOCK_MAX_TPS         = BLOCK_MAX_RECEIPTS;                // 10,000 (at 1s block cadence)
const BLOCK_TARGET_TPS      = Math.round(BLOCK_MAX_TPS * 0.60); //  6,000 (fee controller target)

// ── Deterministic RNG for Mock Data ──────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCENARIOS = {
  NONE:      { tpsMul: 1.0, utilMul: 1.0, feeMul: 1.0, outagePpm: 0,      spamMul: 1.0, priceVolMul: 1.0 },
  STRESS:    { tpsMul: 2.5, utilMul: 1.4, feeMul: 1.8, outagePpm: 0,      spamMul: 2.0, priceVolMul: 1.5 },
  OUTAGE:    { tpsMul: 0.2, utilMul: 0.6, feeMul: 0.7, outagePpm: 80_000, spamMul: 1.0, priceVolMul: 2.0 },
  ATTACK:    { tpsMul: 3.5, utilMul: 1.1, feeMul: 3.0, outagePpm: 10_000, spamMul: 4.0, priceVolMul: 2.5 },
  FEE_SPIKE: { tpsMul: 1.2, utilMul: 1.0, feeMul: 4.0, outagePpm: 0,      spamMul: 1.5, priceVolMul: 1.2 },
  VOLATILITY:{ tpsMul: 1.0, utilMul: 1.0, feeMul: 1.0, outagePpm: 0,      spamMul: 1.0, priceVolMul: 4.0 },
};

class MockDataManager {
  constructor() {
    this.mode = 'DETECTING'; // DETECTING | LIVE | MOCK
    this.mockData = {};
    this.updateInterval = null;
    
    // Simulation state
    this.sim = {
      mode: appState.get('simulationMode') || 'LOCALNET',
      preset: appState.get('scenarioPreset') || 'NONE',
      intensity: appState.get('scenarioIntensity') ?? 0.5,
      seed: appState.get('scenarioSeed') ?? 1337,
    };
    this._rngSeed = this.sim.seed;
    this.rng = mulberry32(this.sim.seed);

    // Consensus + network state (updated each tick)
    this.missedSlotStreak   = 0;
    this.totalMissedBlocks  = 0;
    this.finalityLagBlocks  = 5;
    this.lastProducedBlocks = 3;
    this.activePeerCount    = 64;
    this.avgLatencyMs       = 28;

    // Adaptive baseline state mirrors NetworkIssuanceController
    this.baselineTxCount = 100;
    this.baselineTxVolume = 10_000;
    this.baselineMiners = 10;
    this.prevAnnualIssuance = 0;
    // Use same base URL as main app (default: empty for relative paths via proxy)
    this.nodeUrl = window.BLOCK_BUSTER_API ?? '';
  }

  /**
   * Detect node connection for specified timeout
   * @param {number} timeout - Milliseconds to wait for node
   * @returns {Promise<boolean>} - True if node detected
   */
  async detectNode(timeout = 5000) {
    console.log(`[MockDataManager] Detecting node at ${this.nodeUrl} (${timeout}ms timeout)...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        // Try health endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        
        const response = await fetch(`${this.nodeUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const bootstrap = payload?.bootstrap || {};

          // Primary contract: health payload advertises whether RPC is actually usable.
          // Fallback contract: some health payloads omit bootstrap; probe JSON-RPC directly.
          let rpcConnected = Boolean(
            bootstrap.rpc_connected ?? bootstrap.genesis_ready ?? false,
          );

          if (!rpcConnected) {
            try {
              const controller2 = new AbortController();
              const timeoutId2 = setTimeout(() => controller2.abort(), 1000);

              const rpcRes = await fetch(`${this.nodeUrl}/rpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller2.signal,
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'consensus.block_height',
                  params: [],
                }),
              });

              clearTimeout(timeoutId2);

              if (rpcRes.ok) {
                const rpcJson = await rpcRes.json().catch(() => null);
                const h = rpcJson?.result?.height;
                if (typeof h === 'number' && Number.isFinite(h) && h >= 0) {
                  rpcConnected = true;
                }
              }
            } catch (e) {
              // Ignore; we'll keep waiting below.
            }
          }

          if (!rpcConnected) {
            // Dashboard reachable but node RPC not yet authoritative; keep waiting.
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          console.log('[MockDataManager] ✅ Node detected - using LIVE mode');
          this.mode = 'LIVE';
          appState.set('connectionMode', 'LIVE');
          return true;
        }
      } catch (e) {
        // Node not responding, continue waiting
      }
      
      // Wait 500ms before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.warn(`[MockDataManager] ⚠️ Node not detected after ${timeout}ms - using MOCK mode`);
    console.log('[MockDataManager] Mock data will use formula-based generation');
    this.mode = 'MOCK';
    appState.set('connectionMode', 'MOCK');
    this.initializeMockData();
    this.startMockUpdates();
    return false;
  }

  /**
   * Initialize all mock data using blockchain formulas
   */
  initializeMockData() {
    console.log('[MockDataManager] Initializing formula-based mock data...');
    console.log('[MockDataManager] Simulating early-stage network (8% of max supply issued)');
    
    // Network state (realistic early-stage network)
    this.networkStart = Date.now() - (1.2 * 365 * 24 * 3600 * 1000); // Started 1.2 years ago
    this.currentBlock = Math.floor((Date.now() - this.networkStart) / 1000); // ~1s blocks
    this.currentEpoch = Math.floor(this.currentBlock / 120); // 120 blocks per epoch
    this.currentEmission = 3_200_000; // 8% of 40M max supply (early stage)
    
    // Time-of-day adjustment (affects TPS, activity)
    this.timeOfDayMultiplier = this.getTimeOfDayMultiplier();
    
    // Energy market — must init BEFORE issuance so mockNetworkIssuance() reads real avg_utilization
    // not the 0.60 fallback. Ordering here is load-bearing.
    this.mockData.energyMarket = this.mockEnergyMarket();

    // Network issuance (from economics_and_governance.md)
    this.mockData.issuance = this.mockNetworkIssuance();
    
    // Ad market quality (from economics_and_governance.md)
    this.mockData.adQuality = this.mockAdQuality();

    // Ad market readiness snapshot — schema-complete mirror of AdReadinessSnapshot
    // (node/src/ad_readiness.rs). Every field the UI or fetchAdReadiness() reads must
    // exist here so mock mode never produces undefined-field crashes.
    this.mockData.adReadiness = {
      // Core readiness thresholds (mirrors AdReadinessConfig defaults)
      window_secs:          6 * 60 * 60, // DEFAULT_WINDOW_SECS
      min_unique_viewers:   250,         // DEFAULT_MIN_VIEWERS
      min_host_count:       25,          // DEFAULT_MIN_HOSTS
      min_provider_count:   10,          // DEFAULT_MIN_PROVIDERS
      // Observed values (early-stage network)
      unique_viewers:       12_400,
      host_count:           37,
      provider_count:       12,
      ready:                true,
      blockers:             [],
      last_updated:         Date.now(),
      // Economic extras
      total_usd_micros:         0,
      settlement_count:         0,
      price_usd_micros:         0,
      market_price_usd_micros:  0,
      cohort_utilization:       [],
      utilization_summary: {
        cohort_count: 2,
        mean_ppm:     760_000,
        min_ppm:      620_000,
        max_ppm:      860_000,
        last_updated: Date.now(),
      },
      ready_streak_windows: 8,
      // F/P/R block — AdSegmentReadiness
      segment_readiness: {
        domain_tiers: {
          premium: { supply_ppm: 420_000, readiness_score: 82, cohort_count: 3 },
          standard: { supply_ppm: 580_000, readiness_score: 74, cohort_count: 5 },
        },
        interest_tags: {
          tech:    { supply_ppm: 310_000, readiness_score: 88, cohort_count: 2 },
          finance: { supply_ppm: 270_000, readiness_score: 79, cohort_count: 2 },
        },
        presence_buckets: {
          cohort_0: {
            freshness_histogram: {
              under_1h_ppm:      620_000,
              hours_1_to_6_ppm:  250_000,
              hours_6_to_24_ppm: 100_000,
              over_24h_ppm:       30_000,
            },
            ready_slots: 480,
            kind: 'localnet',
          },
          cohort_1: {
            freshness_histogram: {
              under_1h_ppm:      710_000,
              hours_1_to_6_ppm:  190_000,
              hours_6_to_24_ppm:  80_000,
              over_24h_ppm:       20_000,
            },
            ready_slots: 560,
            kind: 'localnet',
          },
        },
        privacy_budget: {
          remaining_ppm:     880_000,
          denied_count:      0,
          last_denial_reason: null,
        },
      },
    };

    // Ad policy snapshot (placeholder until node exposes full policy surface)
    this.mockData.adPolicySnapshot = {
      as_of_ms: Date.now(),
      note: 'Mock policy snapshot (placeholder)',
      cohort_quality_floor_ppm: 500_000,
      cohort_quality_ceil_ppm: 1_500_000,
      base_bid_median_microunits: 50_000, // 0.050 BLOCK
    };
    
    // Time-series data (REALISTIC TPS for early network)
    const baselineTPS = this.getRealisticTPS(); // 80-200 TPS typical
    this.mockData.tpsHistory = this.mockTimeSeries({
      length: 100,
      baseValue: baselineTPS,
      trend: 0.001, // Slow growth
      volatility: 0.15, // ±15% variance
      cyclePeriod: 24, // Daily cycle
      timeOfDay: true, // Enable day/night patterns
    });
    
    this.mockData.priceHistory = this.mockTimeSeries({
      length: 100,
      baseValue: 115000, // 1.15 USD in micro-units
      trend: 0.0002,
      volatility: 0.02,
      cyclePeriod: 24,
    });
    
    // DEX order book — must init AFTER priceHistory so mockOrderBook() reads live mid price
    this.mockData.orderBook = this.mockOrderBook();
    appState.set('orderBook', this.mockData.orderBook);

    // Fee history — seeded from shared currentBaseFee so mockMempool reads the same state
    this.currentBaseFee = 25000; // 0.025 BLOCK — single source of truth for base fee
    this.mockData.feeHistory = this.mockTimeSeries({
      length: 100,
      baseValue: this.currentBaseFee,
      trend: 0.0001,
      volatility: 0.08,
      cyclePeriod: 24,
    });

    // Validators — 20 entries, must match uniqueMiners = 20 in mockNetworkIssuance()
    this.mockData.validators = this.mockValidators();

    // Initialize mock wallet with default balance
    this.mockData.wallet = {
      '0x0000': { balance: 10000, nonce: 0 }, // Default user
      'treasury': { balance: 5000000, nonce: 0 } // Mock treasury
    };

    // Compute + storage markets — schema-driven mock surfaces used by panels + rpc-mock.js
    this.mockData.computeMarket = this.mockComputeMarket();
    this.mockData.storageMarket = this.mockStorageMarket();

    // Expose scenario/network sim state as a mockData key so rpc-mock.js reads
    // a single, consistent source instead of undefined.
    this.mockData.simulation = this._buildSimSnapshot(false);
    
    console.log(`[MockDataManager] Network: block ${this.currentBlock.toLocaleString()}, epoch ${this.currentEpoch}, emission ${this.currentEmission.toLocaleString()} BLOCK`);
    console.log(`[MockDataManager] TPS baseline: ${Math.floor(baselineTPS)}, time multiplier: ${this.timeOfDayMultiplier.toFixed(2)}x`);
    console.log('[MockDataManager] Mock data initialized');
  }

  /**
   * Network Issuance Formula
   * Delegates entirely to the canonical EconomicsEngine to ensure perfect math parity.
   */
  mockNetworkIssuance(params = {}) {
    const PPM = 1_000_000;

    // Build the inputs required by computeIssuance based on current mock state
    const tpsSeries = this.mockData.tpsHistory || [];
    const currentTps = tpsSeries.length ? tpsSeries[tpsSeries.length - 1].value : 80;
    const epochSeconds = CONSTANTS.EPOCH_BLOCKS;
    
    // Simulate observed epoch tx data
    const tx_count = Math.max(1, Math.round(currentTps * epochSeconds));
    const tx_volume_block = Math.max(1, Math.round(tx_count * 0.5));
    const uniqueMiners = 20;
    
    // Simulate average market utilization across 4 markets
    const eMkt = this.mockData.energyMarket || {};
    const avgUtil = (params.avgUtilOverride != null) ? params.avgUtilOverride : (eMkt.avg_utilization || 0.60);

    // Convert raw tx counts into the ratios that computeIssuance expects
    // By dividing against the adaptive baselines
    const txCountRatio = tx_count / Math.max(1, this.baselineTxCount);
    const txVolumeRatio = tx_volume_block / Math.max(1, this.baselineTxVolume);

    // Run the actual engine formula
    const engineOut = computeIssuance({
      txCountRatio,
      txVolumeRatio,
      marketUtil: avgUtil,
      uniqueMiners,
      baselineMiners: this.baselineMiners,
      emission: this.currentEmission,
      maxSupply: CONSTANTS.MAX_SUPPLY,
      targetInflationBps: 500, // 5%
      // Pass EMA params so the engine performs baseline smoothing automatically
      emaAlphaPpm: CONSTANTS.EMA_ALPHA_PPM_DEFAULT,
      baselineEpochs: 10,
    });

    const reward = engineOut.blockReward;
    const annual_issuance = engineOut.annualIssuance;
    
    // Drift clamp (5%/yr) - smooths out mock volatility
    const MAX_ANNUAL_DRIFT_PPM = 50_000;
    let final_reward = reward;
    if (this.prevAnnualIssuance > 0) {
      const drift_ppm = Math.round(
        Math.abs(annual_issuance - this.prevAnnualIssuance) / Math.max(1, this.prevAnnualIssuance) * PPM,
      );
      if (drift_ppm > MAX_ANNUAL_DRIFT_PPM) {
        const cap = Math.round(
          this.prevAnnualIssuance * (1 + MAX_ANNUAL_DRIFT_PPM / PPM),
        );
        const capped_reward = cap / CONSTANTS.BLOCKS_PER_YEAR;
        final_reward = Math.min(final_reward, capped_reward);
      }
    }

    // Update adaptive baselines (EMA) - mirror Rust node behavior
    const alpha = CONSTANTS.EMA_ALPHA_PPM_DEFAULT / PPM;
    this.baselineTxCount = Math.max(
      100,
      Math.min(
        10_000,
        (1 - alpha) * this.baselineTxCount + alpha * tx_count,
      ),
    );
    this.baselineTxVolume = Math.max(
      10_000,
      Math.min(
        1_000_000,
        (1 - alpha) * this.baselineTxVolume + alpha * tx_volume_block,
      ),
    );
    this.baselineMiners = Math.max(
      10,
      Math.min(
        100,
        (1 - alpha) * this.baselineMiners + alpha * uniqueMiners,
      ),
    );

    this.prevAnnualIssuance = annual_issuance;

    // History points for charts
    const history = [];
    for (let i = 0; i < 100; i++) {
      const epochNum = this.currentEpoch - 99 + i;
      const blockNum = epochNum * CONSTANTS.EPOCH_BLOCKS;
      history.push({
        epoch: epochNum,
        block: blockNum,
        reward: final_reward,
        timestamp: Date.now() - (99 - i) * CONSTANTS.EPOCH_BLOCKS * 1000,
      });
    }

    // Return the shape expected by EconomicControlLaws and EconomicsSimulator mock paths
    return {
      base_reward: CONSTANTS.BASE_REWARD,
      activity_multiplier: engineOut.activityMultiplier,
      activity_breakdown: {
        tx_count_ratio: txCountRatio,
        tx_volume_ratio: txVolumeRatio,
        avg_market_utilization: avgUtil,
      },
      decentralization_factor: engineOut.decentralization,
      uniqueMiners,
      unique_miners: uniqueMiners, // snake_case alias for UI syncFromMock()
      gate_streak: 9,              // early-net simulated streak (used by governor gate UI)
      // P4: schema-complete per-market metrics so EconomicsSimulator can sync its sliders
      economics_prev_market_metrics: [
        {
          utilization_ppm: CONSTANTS.STORAGE_UTIL_PPM_DEFAULT,
          provider_margin_ppm: CONSTANTS.STORAGE_MARGIN_PPM_DEFAULT,
        },
        {
          utilization_ppm: CONSTANTS.COMPUTE_UTIL_PPM_DEFAULT,
          provider_margin_ppm: CONSTANTS.COMPUTE_MARGIN_PPM_DEFAULT,
        },
        {
          utilization_ppm: CONSTANTS.ENERGY_UTIL_PPM_DEFAULT,
          provider_margin_ppm: CONSTANTS.ENERGY_MARGIN_PPM_DEFAULT,
        },
        {
          utilization_ppm: CONSTANTS.AD_UTIL_PPM_DEFAULT,
          provider_margin_ppm: CONSTANTS.AD_MARGIN_PPM_DEFAULT,
        },
      ],
      baseline_miners: this.baselineMiners,
      supply_decay: engineOut.supplyDecay,
      emission_consumer: this.currentEmission,
      remaining_supply: CONSTANTS.MAX_SUPPLY - this.currentEmission,
      max_supply: CONSTANTS.MAX_SUPPLY,
      final_reward,
      block_reward_per_block: final_reward,
      annual_issuance: final_reward * CONSTANTS.BLOCKS_PER_YEAR,
      realized_inflation_bps: this.currentEmission
        ? (annual_issuance / this.currentEmission) * 10_000
        : 0,
      target_inflation_bps: 500,
      inflation_error_bps: this.currentEmission
        ? (annual_issuance / this.currentEmission) * 10_000 - 500
        : 0,
      epoch: this.currentEpoch,
      block_height: this.currentBlock,
      history,

      // ── Network capacity (derived from receipts_validation.rs constants) ──────────────────
      // max_tps: protocol hard ceiling — 10,000 receipts/block at 1s cadence = 10,000 TPS.
      // target_tps: EIP-1559 fee controller target (60% of capacity) = 6,000 TPS.
      // Early-network realistic TPS (80–200) is ~0.8–2% of max_tps — this is correct and
      // expected for a localnet/testnet with 20-30 miners; the utilization % will show accurately.
      max_receipts_per_block: BLOCK_MAX_RECEIPTS,  // 10,000
      max_tps:                BLOCK_MAX_TPS,        // 10,000
      target_tps:             BLOCK_TARGET_TPS,     //  6,000
      // Total emitted supply — for TheBlock "Supply" compact card
      total_emission:         this.currentEmission,
    };
  }

  /**
   * DEX Order Book
   * Mimics BTreeMap<u64, VecDeque<Order>> from Rust
   */
  mockOrderBook(params = {}) {
    // Derive mid price from live priceHistory — single source of truth
    const priceHist = this.mockData.priceHistory || [];
    const liveMid = priceHist.length ? priceHist[priceHist.length - 1].value : 115000;
    const midPrice = params.midPrice || liveMid;
    const spread_bps = params.spread_bps || 87;
    const depth = params.depth || 20;
    const volumeProfile = params.volumeProfile || 'exponential';

    // Liquidity depth scales with circulating supply — more emission = more market depth
    const supplyScale = this.currentEmission
      ? Math.min(2.0, this.currentEmission / 5_000_000)
      : 0.64;
    const baseVolume = Math.floor(800 * Math.max(0.4, supplyScale));

    const bids = [];
    const asks = [];

    const spreadAmount = Math.floor((midPrice * spread_bps) / 20000);
    const bestBid = midPrice - spreadAmount;
    const bestAsk = midPrice + spreadAmount;
    
    // Tick size: 0.05% of mid price — stays proportional at any price level
    // Hardcoded 100 micro-USD was only correct near $1.15; drifts badly at any other price.
    const tickSize = Math.max(1, Math.round(midPrice * 0.0005));

    // Generate bids (descending price)
    for (let i = 0; i < depth; i++) {
      const price = bestBid - i * tickSize;
      const distanceFromMid = (midPrice - price) / midPrice;

      let volumeMultiplier;
      if (volumeProfile === 'exponential') {
        volumeMultiplier = Math.exp(-distanceFromMid * 10);
      } else {
        volumeMultiplier = 1 / (1 + distanceFromMid * 5);
      }

      const volume = Math.floor(baseVolume * volumeMultiplier * (0.8 + this.rng() * 0.4));
      
      const numOrders = Math.floor(this.rng() * 3) + 1;
      const orders = [];
      let remaining = volume;
      
      for (let j = 0; j < numOrders && remaining > 0; j++) {
        const orderSize = j === numOrders - 1 
          ? remaining 
          : Math.floor(remaining * (0.3 + this.rng() * 0.4));
        
        orders.push({
          id: Date.now() + i * 100 + j,
          account: `addr${Math.floor(this.rng() * 1000)}`,
          side: 'Buy',
          amount: orderSize,
          price,
          max_slippage_bps: 100,
        });
        
        remaining -= orderSize;
      }
      
      bids.push({ price, orders });
    }
    
    // Generate asks (ascending price)
    for (let i = 0; i < depth; i++) {
      const price = bestAsk + i * tickSize;
      const distanceFromMid = (price - midPrice) / midPrice;

      let volumeMultiplier;
      if (volumeProfile === 'exponential') {
        volumeMultiplier = Math.exp(-distanceFromMid * 10);
      } else {
        volumeMultiplier = 1 / (1 + distanceFromMid * 5);
      }

      const volume = Math.floor(baseVolume * volumeMultiplier * (0.8 + this.rng() * 0.4));

      const numOrders = Math.floor(this.rng() * 3) + 1;
      const orders = [];
      let remaining = volume;

      for (let j = 0; j < numOrders && remaining > 0; j++) {
        const orderSize = j === numOrders - 1
          ? remaining
          : Math.floor(remaining * (0.3 + this.rng() * 0.4));

        orders.push({
          id: Date.now() + i * 100 + j + 10000,
          account: `addr${Math.floor(this.rng() * 1000)}`,
          side: 'Sell',
          amount: orderSize,
          price,
          max_slippage_bps: 100,
        });
        
        remaining -= orderSize;
      }
      
      asks.push({ price, orders });
    }
    
    const total_bid_volume = bids.reduce(
      (sum, level) => sum + level.orders.reduce((s, o) => s + o.amount, 0),
      0
    );
    const total_ask_volume = asks.reduce(
      (sum, level) => sum + level.orders.reduce((s, o) => s + o.amount, 0),
      0
    );
    
    // 24h simulated DEX trade volume: 2–8× book depth turnover (realistic thin early market)
    const totalBookDepthBLOCK = total_bid_volume + total_ask_volume;
    const turnoverMultiplier = 2 + this.rng() * 6; // 2×–8× daily turnover
    const volume_24h_block = Math.round(totalBookDepthBLOCK * turnoverMultiplier);
    const volume_24h_usd = Math.round(volume_24h_block * midPrice / 100000);

    // Book depth as % of market cap — key thin-market liquidity signal for dashboard
    const circulatingSupply = this.currentEmission || 3_200_000;
    const market_cap_usd = Math.round(circulatingSupply * midPrice / 100000);
    const total_depth_usd = Math.round(totalBookDepthBLOCK * midPrice / 100000);
    const depth_to_mcap_pct = market_cap_usd > 0
      ? ((total_depth_usd / market_cap_usd) * 100).toFixed(3)
      : '0.000';

    return {
      bids,
      asks,
      spread: spreadAmount * 2,
      spread_bps,
      total_bid_volume,
      total_ask_volume,
      volume_24h_block,
      volume_24h_usd,
      market_cap_usd,
      depth_to_mcap_pct,
      last_trade_price: midPrice,
      last_trade_time: Date.now(),
    };
  }

  /**
   * Validator Set
   * 20 entries — must match uniqueMiners = 20 in mockNetworkIssuance().
   * Shape mirrors consensus.validators RPC response so rpc-mock.js delegates here.
   */
  mockValidators() {
    const count = 20;
    const validators = [];
    for (let i = 0; i < count; i++) {
      const uptimePct = 0.96 + this.rng() * 0.04; // 96–100%
      const stakeBase = 50_000 + Math.floor(this.rng() * 150_000); // 50k–200k BLOCK
      validators.push({
        id: `validator-${String(i + 1).padStart(2, '0')}`,
        address: `0x${this.randomHex(40)}`,
        stake: stakeBase,
        stake_weight_ppm: Math.floor((stakeBase / (count * 125_000)) * 1_000_000),
        commission_bps: 300 + Math.floor(this.rng() * 700), // 3–10%
        uptime_pct: uptimePct,
        uptime_streak_blocks: Math.floor(uptimePct * (this.currentBlock || 0)),
        blocks_proposed: Math.max(0, Math.floor((this.currentBlock || 0) / count + this.noise(100))),
        blocks_missed: Math.max(0, Math.floor((1 - uptimePct) * (this.currentBlock || 0) / count)),
        last_seen_block: (this.currentBlock || 0) - Math.floor(this.rng() * 3),
        is_active: true,
      });
    }
    // Sort by stake ascending so jailing logic can deterministically "jail lowest stake".
    validators.sort((a, b) => a.stake - b.stake);
    return validators;
  }

  /**
   * Ad Market Quality Formula
   * Q_cohort = clamp((F × P × R)^(1/3), 0.10, 2.50)
   */
  mockAdQuality(params = {}) {
    const freshness = params.freshness || {
      under_1h_ppm: 600000,
      '1h_to_6h_ppm': 250000,
      '6h_to_24h_ppm': 100000,
      over_24h_ppm: 50000,
    };
    
    const w1 = 1000000;
    const w2 = 800000;
    const w3 = 500000;
    const w4 = 200000;
    
    const F = (
      w1 * freshness.under_1h_ppm +
      w2 * freshness['1h_to_6h_ppm'] +
      w3 * freshness['6h_to_24h_ppm'] +
      w4 * freshness.over_24h_ppm
    ) / 1000000;
    
    const ready_streak_windows = params.ready_streak_windows || 5;
    const readiness_target = params.readiness_target || 6;
    const R = Math.max(0.10, Math.min(1.0, ready_streak_windows / readiness_target));
    
    const privacy_remaining_ppm = params.privacy_remaining_ppm || 850000;
    const privacy_denied_ppm = params.privacy_denied_ppm || 50000;
    const P = Math.max(
      0.10,
      Math.min(1.0, Math.min(privacy_remaining_ppm, 1000000 - privacy_denied_ppm) / 1000000)
    );
    
    const Q_cohort = Math.max(0.10, Math.min(2.50, Math.pow(F * P * R, 1/3)));
    
    const base_bid = params.base_bid || 5000;
    const creative_quality = params.creative_quality || 1.25;
    const effective_bid = base_bid * creative_quality * Q_cohort;
    
    return {
      freshness_histogram: freshness,
      freshness_factor: F,
      readiness_factor: R,
      ready_streak_windows,
      readiness_target,
      privacy_factor: P,
      privacy_remaining_ppm,
      privacy_denied_ppm,
      cohort_quality: Q_cohort,
      base_bid,
      creative_quality,
      effective_bid,
    };
  }

  /**
   * Energy Market Data
   */
  mockEnergyMarket(params = {}) {
    const numProviders = params.numProviders || 12;
    const providers = [];
    
    for (let i = 0; i < numProviders; i++) {
      const capacity_kwh = 1000 + Math.floor(this.rng() * 9000);
      const utilization = 0.4 + this.rng() * 0.5;
      const delivered_kwh = Math.floor(capacity_kwh * utilization);
      
      const base_price = 0.08; // 8 cents per kWh (USD)
      const price_variance = 0.8 + this.rng() * 0.4;
      const price_per_kwh = parseFloat((base_price * price_variance).toFixed(3));
      
      providers.push({
        provider_id: `energy-provider-${i}`,
        name: `Provider ${String.fromCharCode(65 + i)}`,
        capacity_kwh,
        delivered_kwh,
        utilization,
        price_per_kwh,
        stake: 10000 + Math.floor(this.rng() * 90000),
        meter_address: `meter_${i}_${Date.now()}`,
        jurisdiction: ['US_CA', 'US_TX', 'US_NY', 'EU_DE'][Math.floor(this.rng() * 4)],
        credits_pending: Math.floor(this.rng() * 500),
        receipts_count: Math.floor(this.rng() * 1000),
        disputes_count: this.rng() > 0.9 ? 1 : 0,
        last_reading_time: Date.now() - Math.floor(this.rng() * 3600000),
      });
    }
    
    return {
      providers,
      total_capacity: providers.reduce((sum, p) => sum + p.capacity_kwh, 0),
      total_delivered: providers.reduce((sum, p) => sum + p.delivered_kwh, 0),
      avg_utilization: providers.reduce((sum, p) => sum + p.utilization, 0) / providers.length,
      avg_price: providers.reduce((sum, p) => sum + p.price_per_kwh, 0) / providers.length,
      total_credits: providers.reduce((sum, p) => sum + p.credits_pending, 0),
      total_receipts: providers.reduce((sum, p) => sum + p.receipts_count, 0),
      active_disputes: providers.reduce((sum, p) => sum + p.disputes_count, 0),
    };
  }

  /**
   * Get realistic TPS for current network state
   * Accounts for time of day, network growth stage, and organic variation
   */
  getRealisticTPS() {
    // Early-stage network: 30–500 TPS, scales with emission maturity
    // Matches MOCK_DATA_REALISM_UPGRADE.md formula exactly
    const maturityFactor = Math.min(1.0, this.currentEmission / 10_000_000);
    const minTPS = 30 + maturityFactor * 70;   // 30 (launch) → 100 (mature)
    const maxTPS = 100 + maturityFactor * 400; // 100 (launch) → 500 (mature)
    const baseline = (minTPS + maxTPS) / 2;
    return baseline * this.timeOfDayMultiplier;
  }

  /**
   * Get time-of-day multiplier for activity
   * Simulates daily cycles (low at night, high during business hours)
   */
  getTimeOfDayMultiplier() {
    const now = new Date();
    const hour = now.getUTCHours(); // Use UTC for consistency
    
    // Daily activity cycle (peak 14:00-20:00 UTC, low 02:00-08:00 UTC)
    // Formula: 0.5 to 1.5 multiplier
    const peakHour = 17; // 5 PM UTC
    const hoursFromPeak = Math.abs(hour - peakHour);
    const cycleFactor = Math.cos((hoursFromPeak / 12) * Math.PI);
    
    // Weekend vs weekday (Sat=6, Sun=0)
    const dayOfWeek = now.getUTCDay();
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;
    
    // Combined: 0.4 (weekend night) to 1.5 (weekday peak)
    const multiplier = (0.75 + cycleFactor * 0.35) * weekendFactor;
    
    return Math.max(0.4, Math.min(1.5, multiplier));
  }

  /**
   * Time-Series Data Generator
   * Creates smooth, realistic time-series with trends and cycles
   */
  mockTimeSeries(params = {}) {
    const length = params.length || 100;
    const baseValue = params.baseValue || 100;
    const trend = params.trend || 0.001;
    const volatility = params.volatility || 0.05;
    const cyclePeriod = params.cyclePeriod || 20;
    const enableTimeOfDay = params.timeOfDay || false;
    
    const series = [];
    let value = baseValue;
    
    for (let i = 0; i < length; i++) {
      value *= (1 + trend);
      
      // Sine wave cycle (daily/weekly patterns)
      const cycleEffect = Math.sin((i / cyclePeriod) * 2 * Math.PI) * volatility * baseValue;
      
      // Random walk (market noise)
      const randomWalk = (this.rng() - 0.5) * volatility * baseValue * 0.5;
      
      // Time-of-day effect (if enabled)
      let timeMultiplier = 1.0;
      if (enableTimeOfDay) {
        const minutesAgo = (length - i) * 60; // Each point is 1 minute apart
        const timestamp = Date.now() - minutesAgo * 60000;
        const hourOfDay = new Date(timestamp).getUTCHours();
        const peakHour = 17;
        const hoursFromPeak = Math.abs(hourOfDay - peakHour);
        timeMultiplier = 0.75 + Math.cos((hoursFromPeak / 12) * Math.PI) * 0.35;
      }
      
      const finalValue = (value + cycleEffect + randomWalk) * timeMultiplier;
      
      series.push({
        timestamp: Date.now() - (length - i) * 60000,
        value: Math.max(0, finalValue),
      });
    }
    
    return series;
  }

  /**
   * Start periodic updates to mock data
   */
  startMockUpdates() {
    if (this.updateInterval) return;
    
    console.log('[MockDataManager] Starting mock data updates (3s interval)');
    
    this.updateInterval = setInterval(() => {
      this.updateMockData();
    }, 3000);
  }

  /**
   * Update mock data smoothly (called every 3 seconds)
   * Advances network state and updates all time-series
   */
  updateMockData() {
    this.validateInvariants();
    
    // Read simulation state dynamically to allow UI updates on the fly
    this.sim = {
      mode: appState.get('simulationMode') || 'LOCALNET',
      preset: appState.get('scenarioPreset') || 'NONE',
      intensity: appState.get('scenarioIntensity') ?? 0.5,
      seed: appState.get('scenarioSeed') ?? 1337,
    };

    // Seed hot-swap: if user changed seed at runtime, rebuild deterministic RNG
    if (this.sim.seed !== this._rngSeed) {
      this._rngSeed = this.sim.seed;
      this.rng = mulberry32(this.sim.seed);
      // Reset accumulators so the new seed starts clean
      this.missedSlotStreak   = 0;
      this.totalMissedBlocks  = 0;
      this.finalityLagBlocks  = 5;
      this.lastProducedBlocks = 3;
      this.activePeerCount    = 64;
      this.avgLatencyMs       = 28;
      console.log(`[MockDataManager] RNG re-seeded to ${this.sim.seed}`);
    }

    const sim = this.sim;
    const preset = SCENARIOS[sim.preset] || SCENARIOS.NONE;
    const k = Math.max(0, Math.min(1, sim.intensity));
    const lerp = (a, b, t) => a + (b - a) * t;

    const tpsMul      = lerp(1.0, preset.tpsMul, k);
    const utilMul     = lerp(1.0, preset.utilMul, k);
    const feeMul      = lerp(1.0, preset.feeMul, k);
    const spamMul     = lerp(1.0, preset.spamMul, k);
    const priceVolMul = lerp(1.0, preset.priceVolMul, k);
    const outagePpm   = Math.round(lerp(0, preset.outagePpm, k));
    const outageHit   = (Math.floor(this.rng() * 1_000_000) < outagePpm);

    // Keep compute/storage markets and the simulation snapshot in sync with the live scenario.
    // rpc-mock.js reads these keys and should never see undefined or stale state.
    this.mockData.computeMarket = this.mockComputeMarket();
    this.mockData.storageMarket = this.mockStorageMarket();

    // ── Consensus: produced blocks this tick ─────────────────────────────────
    // Normal cadence: 3 blocks per 3s tick. Each block independently may be
    // missed based on slotMissPpm. Full outage collapses production to 0.
    const slotMissPpm   = Math.round(lerp(1_000,    preset.slotMissPpm,  k));
    const targetFinLag  = Math.round(lerp(5,         preset.finalityLag + 5, k));
    const peerDropPct   = lerp(0.0, preset.peerDropPct,   k);
    const latencyMul    = lerp(1.0, preset.latencyMul,    k);
    const validatorJail = lerp(0.0, preset.validatorJail, k);
    const reorgRisk     = Math.round(lerp(0, preset.reorgRisk, k));
    const reorgHit      = !outageHit && (Math.floor(this.rng() * 1_000_000) < reorgRisk);

    let producedBlocks = 0;
    let missedThisTick = 0;
    if (!outageHit) {
      for (let b = 0; b < 3; b++) {
        const missed = (Math.floor(this.rng() * 1_000_000) < slotMissPpm);
        if (missed) { missedThisTick++; } else { producedBlocks++; }
      }
    } else {
      missedThisTick = 3;
    }
    this.lastProducedBlocks  = producedBlocks;
    this.totalMissedBlocks  += missedThisTick;
    if (missedThisTick > 0) { this.missedSlotStreak++; } else { this.missedSlotStreak = 0; }

    // Finality lag: smooth convergence to scenario target; reorg spikes it
    const finLagDelta = (targetFinLag - this.finalityLagBlocks) * 0.15;
    this.finalityLagBlocks = Math.max(5, Math.round(
      this.finalityLagBlocks + finLagDelta + (reorgHit ? 5 : 0)
    ));

    // Peer count + latency: smoothly approach scenario targets
    const targetPeers   = Math.round(64 * (1 - peerDropPct));
    const targetLatency = Math.round(28 * latencyMul);
    this.activePeerCount = Math.max(3,  Math.round(this.activePeerCount + (targetPeers   - this.activePeerCount) * 0.12));
    this.avgLatencyMs    = Math.max(8,  Math.round(this.avgLatencyMs    + (targetLatency - this.avgLatencyMs)    * 0.12));

    // Publish simulation snapshot after core network state updates so consumers
    // (rpc-mock + UI) always see consistent fields.
    this.mockData.simulation = this._buildSimSnapshot(outageHit);

    // Advance chain height (at least +1 even on full outage — time still moves)
    const blockAdvance = Math.max(1, producedBlocks);
    this.currentBlock += blockAdvance;
    this.currentEpoch  = Math.floor(this.currentBlock / 120);

    // Emission: only produced (not missed) blocks earn rewards
    const lastIssuance  = this.mockData.issuance;
    const rewardPerBlock = lastIssuance ? lastIssuance.final_reward : 0.36;
    this.currentEmission += rewardPerBlock * producedBlocks;
    
    // Recalculate time-of-day multiplier
    this.timeOfDayMultiplier = this.getTimeOfDayMultiplier();
    
    // Update TPS history (with time-of-day effects and simulation modifiers)
    const lastTps = this.mockData.tpsHistory[this.mockData.tpsHistory.length - 1].value;
    let tpsTarget = this.getRealisticTPS() * tpsMul;
    if (outageHit) tpsTarget *= 0.05;
    tpsTarget = Math.min(BLOCK_MAX_TPS * 0.95, Math.max(10, tpsTarget));
    
    const tpsAdjustment = (tpsTarget - lastTps) * 0.1; // Smooth transition
    const newTps = lastTps + tpsAdjustment + this.noise(lastTps * 0.08 * spamMul);
    
    this.mockData.tpsHistory.push({
      timestamp: Date.now(),
      value: Math.max(10, newTps), // Never below 10 TPS
    });
    this.mockData.tpsHistory.shift();
    
    // Update price history — trend derived from miner sell pressure vs. market demand.
    // Unconditional positive drift was wrong; real early-network price is sell-pressure dominated.
    const lastPrice = this.mockData.priceHistory[this.mockData.priceHistory.length - 1].value;
    const finalReward = this.mockData.issuance?.final_reward || 0.36;
    const dailyEmission = finalReward * 86400; // BLOCK emitted per day
    // ~35% of block rewards market-sold by miners to cover operating costs
    const dailySellBLOCK = dailyEmission * 0.35;
    // Fraction of circulating supply sold per 3s tick
    const tickSellFraction = dailySellBLOCK / Math.max(1, this.currentEmission) / (86400 / 3);
    const sellPressureDrift = -tickSellFraction * lastPrice * 0.5;       // dampened downward
    // Buy pressure tracks market utilization: higher util = more demand for BLOCK
    const avgUtil = (this.mockData.energyMarket?.avg_utilization || 0.6) * utilMul;
    const buyPressureDrift = avgUtil * tickSellFraction * lastPrice * 0.4;
    const netDrift = sellPressureDrift + buyPressureDrift;
    const priceWalk = this.noise(lastPrice * 0.008) * priceVolMul;
    const newPrice = lastPrice + netDrift + priceWalk;
    
    this.mockData.priceHistory.push({
      timestamp: Date.now(),
      value: Math.max(50000, newPrice), // Never below $0.05
    });
    this.mockData.priceHistory.shift();
    
    // Update fee history — keep currentBaseFee in sync (shared state with mockMempool)
    const lastFee = this.mockData.feeHistory[this.mockData.feeHistory.length - 1].value;
    const baseFeeTarget = 25000 * feeMul;
    const feeAdjustment = (baseFeeTarget - lastFee) * 0.05; // smooth approach
    const feeWalk = this.noise(lastFee * 0.05) * feeMul;
    const newFee = Math.max(10000, lastFee + feeAdjustment + feeWalk); // Never below 0.01 BLOCK
    this.currentBaseFee = newFee; // sync shared state so mockMempool reads same base fee
    
    this.mockData.feeHistory.push({
      timestamp: Date.now(),
      value: newFee,
    });
    this.mockData.feeHistory.shift();
    
    // Update order book every tick using the LATEST priceHistory price
    // This is the single source of truth — order book always tracks price history
    const latestPrice = this.mockData.priceHistory[this.mockData.priceHistory.length - 1].value;
    this.mockData.orderBook = this.mockOrderBook({
      midPrice: latestPrice,
      spread_bps: 87,
    });
    appState.set('orderBook', this.mockData.orderBook);

    // Update issuance — pass effective utilization so OUTAGE/STRESS affects the
    // issuance controller inputs the same way a real chain's market utilization would.
    const avgUtilBase      = this.mockData.energyMarket?.avg_utilization || 0.60;
    const avgUtilEffective = Math.min(1.0, avgUtilBase * utilMul);
    this.mockData.issuance = this.mockNetworkIssuance({ avgUtilOverride: avgUtilEffective });

    // Update validators to reflect scenario consensus state
    this.updateValidatorTick({ validatorJail, slotMissPpm, producedBlocks, missedThisTick });

    // ── Publish simulation snapshot — single source of truth for rpc-mock.js ──
    this.mockData.simulation = {
      preset:            sim.preset,
      intensity:         k,
      outageActive:      outageHit,
      reorgHit,
      producedBlocks,
      missedThisTick,
      missedSlotStreak:  this.missedSlotStreak,
      totalMissedBlocks: this.totalMissedBlocks,
      finalityLagBlocks: this.finalityLagBlocks,
      activePeerCount:   this.activePeerCount,
      avgLatencyMs:      this.avgLatencyMs,
      latencyMul,
      peerDropPct,
      validatorJail,
      tpsMul,
      feeMul,
      avgUtilEffective,
      timestamp:         Date.now(),
    };
  }

  /**
   * Update validator set each tick based on scenario consensus state.
   * Called after block production is computed so all numbers are coherent:
   *   - blocks_proposed on each validator sums to ~producedBlocks (stake-weighted)
   *   - jailed validators degrade uptime and go inactive
   *   - missed slots propagate into blocks_missed + reset uptime_streak_blocks
   */
  updateValidatorTick({ validatorJail, slotMissPpm, producedBlocks, missedThisTick }) {
    const validators = this.mockData.validators;
    if (!validators || validators.length === 0) return;

    const count      = validators.length;
    const totalStake = validators.reduce((s, v) => s + v.stake, 0);
    const jailCount  = Math.round(count * validatorJail);

    validators.forEach((v, i) => {
      const isJailed = i < jailCount; // lowest-stake validators jailed first

      if (isJailed) {
        // Jailed: rapid uptime decay, mark offline
        v.uptime_pct      = Math.max(0.30, (v.uptime_pct || 0.96) - 0.02);
        v.is_active       = false;
        v.last_seen_block = Math.max(0, this.currentBlock - 20 - Math.round(this.rng() * 50));
      } else {
        // Active: slow uptime recovery if previously degraded
        v.uptime_pct  = Math.min(0.999, (v.uptime_pct || 0.96) + 0.001);
        v.is_active   = true;
        v.last_seen_block = this.currentBlock - Math.floor(this.rng() * 3);

        // Stake-weighted block proposal attribution
        const weight       = v.stake / Math.max(1, totalStake);
        const proposedThis = Math.round(producedBlocks * weight * count);
        v.blocks_proposed  = Math.max(0, (v.blocks_proposed || 0) + proposedThis);

        // Missed slots allocated proportionally across active validators
        const missedShare = Math.round(
          missedThisTick * weight * (count / Math.max(1, count - jailCount))
        );
        v.blocks_missed = Math.max(0, (v.blocks_missed || 0) + missedShare);

        if (missedShare === 0) {
          v.uptime_streak_blocks = (v.uptime_streak_blocks || 0) + producedBlocks;
        } else {
          v.uptime_streak_blocks = 0; // reset streak on miss
        }
      }
    });
  }

  /**
   * Get mock data by key
   */
  get(key) {
    if (this.mode === 'MOCK') {
      return this.mockData[key];
    }
    return null;
  }

  /**
   * Check if in live mode
   */
  isLiveMode() {
    return this.mode === 'LIVE';
  }

  /**
   * Check if in mock mode
   */
  isMockMode() {
    return this.mode === 'MOCK';
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Stop mock updates
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Mock Economic Control Laws
   * Based on: ~/projects/the-block/docs/economics_operator_runbook.md
   */
  mockEconomicControlLaws() {
    const now = Date.now();
    const epoch = Math.floor(now / (120 * 1000)); // 120 blocks per epoch

    return {
      // Layer 1: Inflation Control — derived from live issuance engine, not hardcoded
      inflation: (() => {
        const iss = this.mockData.issuance || {};
        const realizedBps = iss.realized_inflation_bps || 3950;
        const targetBps = iss.target_inflation_bps || 500;
        return {
          target_bps: targetBps,
          realized_bps: realizedBps + this.noise(20),
          error_bps: (realizedBps - targetBps) + this.noise(15),
          annual_issuance: iss.annual_issuance || 12_650_000,
          controller_gain: 0.10,
          convergence_epochs: 30,
        };
      })(),
      // Layer 2: Subsidy Allocation
      subsidies: {
        storage: {
          share_bps: 1500 + this.noise(50),
          distress: Math.max(0, 0.2 + this.noise(0.1)),
        },
        compute: {
          share_bps: 3000 + this.noise(50),
          distress: Math.max(0, 0.1 + this.noise(0.05)),
        },
        energy: {
          share_bps: 2000 + this.noise(50),
          distress: Math.max(0, 0.5 + this.noise(0.15)),
        },
        ad: {
          share_bps: 3500 + this.noise(50),
          distress: Math.max(0, 0.0 + this.noise(0.05)),
        },
        drift_rate: 0.01,
        temperature: 10000,
      },
      // Layer 3: Market Multipliers
      multipliers: {
        storage: {
          value: 1.2 + this.noise(0.1),
          utilization: 0.65 + this.noise(0.05),
          margin: 0.15 + this.noise(0.02),
        },
        compute: {
          value: 2.5 + this.noise(0.3),
          utilization: 0.82 + this.noise(0.05),
          margin: 0.10 + this.noise(0.02),
        },
        energy: {
          value: 1.8 + this.noise(0.2),
          utilization: 0.58 + this.noise(0.05),
          margin: 0.12 + this.noise(0.02),
        },
        ad: {
          value: 1.5 + this.noise(0.15),
          utilization: 0.70 + this.noise(0.05),
          margin: 0.18 + this.noise(0.02),
        },
        ceiling: 10.0,
        floor: 0.1,
      },
      // Layer 4: Ad Splits & Tariff
      ad: {
        splits: {
          platform: 2800 + this.noise(20),
          user: 2200 + this.noise(20),
          publisher: 5000 + this.noise(20),
          targets: { platform: 2800, user: 2200, publisher: 5000 },
        },
        tariff: {
          current_bps: 50 + this.noise(10),
          target_bps: 100,
          treasury_contribution_pct: 8.5 + this.noise(0.5),
          drift_rate: 0.05,
        },
      },
      epoch,
      timestamp: now,
    };
  }

  /**
   * Mock Receipt Audit
   * Based on: ~/projects/the-block/docs/apis_and_tooling.md (receipt.audit RPC)
   */
  mockReceiptAudit(filters) {
    const startHeight = filters.start_height || 1000;
    const endHeight = filters.end_height || 2000;
    const limit = Math.min(filters.limit || 128, 512);
    const providerFilter = filters.provider_id || '';
    const marketFilter = filters.market || '';

    const receipts = [];
    const receiptTypes = ['storage', 'compute', 'energy', 'ad', 'relay'];

    // Generate receipts
    for (let height = startHeight; height <= endHeight && receipts.length < limit; height++) {
      const receiptsPerBlock = this.random(1, 5);

      for (let i = 0; i < receiptsPerBlock && receipts.length < limit; i++) {
        const receiptType = receiptTypes[this.random(0, receiptTypes.length - 1)];
        const market = receiptType;

        // Apply filters
        if (marketFilter && market !== marketFilter) continue;

        const providerId = `${market}-${this.randomHex(4)}`;
        if (providerFilter && !providerId.includes(providerFilter)) continue;

        const amount = this.random(10, 1000) * 100000; // micro-USD
        const hasDispute = this.rng() < 0.1; // 10% have disputes

        receipts.push({
          block_height: height,
          receipt_index: i,
          receipt_type: `${receiptType}_receipt`,
          market,
          amount,
          provider_id: providerId,
          publisher_id: receiptType === 'ad' ? `pub-${this.randomHex(4)}` : null,
          digest_hex: this.randomHex(32),
          subsidies: {
            storage_sub: receiptType === 'storage' ? this.random(10, 50) : 0,
            read_sub: receiptType === 'storage' ? this.random(5, 20) : 0,
            compute_sub: receiptType === 'compute' ? this.random(50, 200) : 0,
            ad_sub: receiptType === 'ad' ? this.random(20, 100) : 0,
            rebate: this.random(0, 10),
          },
          audit: {
            audit_queries: this.random(1, 5),
            invariants: true,
            causality: 'verified',
            provider_identity: 'verified',
          },
          disputes: hasDispute ? [{
            id: `dispute-${this.randomHex(8)}`,
            status: this.rng() < 0.3 ? 'resolved' : 'pending',
            reason: ['meter_mismatch', 'quality_violation', 'timeout'][this.random(0, 2)],
            timestamp: Date.now() - this.random(3600000, 86400000),
            meta: {
              flagged_by: `validator-${this.randomHex(4)}`,
              evidence_hash: this.randomHex(32),
            },
          }] : [],
          receipt: {
            // Full receipt payload (simplified)
            type: receiptType,
            provider: providerId,
            amount,
            timestamp: Date.now(),
          },
        });
      }
    }

    return {
      receipts,
      scannedRange: { start: startHeight, end: endHeight },
      truncated: receipts.length >= limit,
      nextStartHeight: receipts.length >= limit ? endHeight + 1 : null,
    };
  }

  /**
   * Build a stable snapshot of the current synthetic-localnet simulation state.
   * This is consumed by rpc-mock.js so all RPC surfaces share the same scenario truth.
   */
  _buildSimSnapshot(outageActive) {
    return {
      mode:               this.sim.mode,
      preset:             this.sim.preset,
      intensity:          this.sim.intensity,
      avgLatencyMs:       this.avgLatencyMs,
      activePeerCount:    this.activePeerCount,
      finalityLagBlocks:  this.finalityLagBlocks,
      missedSlotStreak:   this.missedSlotStreak,
      totalMissedBlocks:  this.totalMissedBlocks,
      outageActive:       Boolean(outageActive),
      lastProducedBlocks: this.lastProducedBlocks,
    };
  }

  /**
   * Compute market synthetic localnet state.
   * Not consensus-critical, but must be coherent with scenario preset + overall utilization.
   */
  mockComputeMarket() {
    const preset = SCENARIOS[this.sim.preset] || SCENARIOS.NONE;
    const k = Math.max(0, Math.min(1, this.sim.intensity));
    const utilBase = 0.72;
    const util = Math.min(0.98, utilBase * (1 + (preset.utilMul - 1) * k));

    const providerCount = 14;
    const providers = Array.from({ length: providerCount }, (_, i) => {
      const cap = Math.floor(400 + this.rng() * 800); // compute units
      const used = Math.floor(cap * (util * (0.85 + this.rng() * 0.30)));
      return {
        provider_id: `compute-0x${String(i + 1).padStart(2, '0')}`,
        capacity_units: cap,
        used_units: Math.min(cap, used),
        price_per_unit: parseFloat((0.001 + this.rng() * 0.002).toFixed(5)), // BLOCK/unit
        sla_uptime: parseFloat((0.96 + this.rng() * 0.04).toFixed(4)),
        active_jobs: Math.floor(1 + this.rng() * 5),
        reputation: parseFloat((880 + this.rng() * 110).toFixed(0)),
      };
    });

    const total_capacity = providers.reduce((s, p) => s + p.capacity_units, 0);
    const total_used = providers.reduce((s, p) => s + p.used_units, 0);
    const avg_utilization = total_capacity > 0 ? total_used / total_capacity : util;
    const active_jobs = providers.reduce((s, p) => s + p.active_jobs, 0);
    const pending = Math.floor(3 + this.rng() * 10);

    return {
      providers,
      total_capacity,
      total_used,
      avg_utilization,
      industrial_utilization: avg_utilization,
      industrial_backlog: pending,
      active_jobs,
      pending,
      volume_24h_block: Math.round(active_jobs * 120 * avg_utilization * (1 + this.rng() * 0.4)),
    };
  }

  /**
   * Storage market synthetic localnet state.
   */
  mockStorageMarket() {
    const preset = SCENARIOS[this.sim.preset] || SCENARIOS.NONE;
    const k = Math.max(0, Math.min(1, this.sim.intensity));
    const utilBase = 0.61;
    const util = Math.min(0.97, utilBase * (1 + (preset.utilMul - 1) * k));

    const providerCount = 22;
    const providers = Array.from({ length: providerCount }, (_, i) => {
      const cap_gb = Math.floor(500 + this.rng() * 2000);
      const used_gb = Math.floor(cap_gb * (util * (0.80 + this.rng() * 0.35)));
      return {
        provider_id: `storage-0x${String(i + 1).padStart(2, '0')}`,
        capacity_gb: cap_gb,
        used_gb: Math.min(cap_gb, used_gb),
        price_per_gb_block: parseFloat((0.0001 + this.rng() * 0.0003).toFixed(6)),
        reputation: parseFloat((860 + this.rng() * 130).toFixed(0)),
        region: ['us-east', 'us-west', 'eu-central', 'ap-southeast'][i % 4],
      };
    });

    const total_capacity_gb = providers.reduce((s, p) => s + p.capacity_gb, 0);
    const total_used_gb = providers.reduce((s, p) => s + p.used_gb, 0);
    const avg_utilization = total_capacity_gb > 0 ? total_used_gb / total_capacity_gb : util;

    return {
      providers,
      total_capacity_gb,
      total_used_gb,
      avg_utilization,
      volume_24h_block: Math.round(total_used_gb * 0.01 * (1 + this.rng() * 0.5)),
    };
  }

  /**
   * Mock Mempool Data
   * Real-time transaction pool with fee lanes and admission tracking
   */
  mockMempool() {
    const now = Date.now();
    const currentTPS = this.getRealisticTPS();
    const maxTPS = BLOCK_MAX_TPS; // 10,000 — mirrors receipts_validation.rs, not a guess
    
    // Base pending count scales with network maturity
    const maturityFactor = Math.min(1.0, this.currentEmission / 10_000_000);
    const basePending = Math.floor(50 + maturityFactor * 150); // 50 early → 200 mature
    const actualPending = Math.floor(basePending * (0.8 + this.rng() * 0.4));
    
    // Fee lanes distribution
    const lanes = {
      consumer: {
        pending: Math.floor(actualPending * 0.45),
        avg_fee: 25000 + this.noise(5000), // 0.025 BLOCK
        floor: 15000,
        utilization_pct: 45 + this.noise(10),
        health: 'healthy',
      },
      industrial_storage: {
        pending: Math.floor(actualPending * 0.20),
        avg_fee: 50000 + this.noise(10000),
        floor: 30000,
        utilization_pct: 60 + this.noise(15),
        health: 'healthy',
      },
      industrial_compute: {
        pending: Math.floor(actualPending * 0.25),
        avg_fee: 120000 + this.noise(30000),
        floor: 80000,
        utilization_pct: 75 + this.noise(10),
        health: 'warning', // High demand
      },
      industrial_energy: {
        pending: Math.floor(actualPending * 0.08),
        avg_fee: 60000 + this.noise(15000),
        floor: 40000,
        utilization_pct: 35 + this.noise(10),
        health: 'healthy',
      },
      governance: {
        pending: Math.floor(actualPending * 0.02),
        avg_fee: 10000,
        floor: 10000,
        utilization_pct: 5 + this.noise(3),
        health: 'healthy',
      },
    };

    // Generate individual transactions
    const transactions = [];
    Object.entries(lanes).forEach(([lane, laneData]) => {
      for (let i = 0; i < laneData.pending; i++) {
        const age = this.rng() * 120000; // 0-120 seconds
        const feeFactor = 0.7 + this.rng() * 0.6; // 0.7-1.3x
        
        transactions.push({
          id: `${lane}-${Date.now()}-${i}`,
          hash: this.randomHex(64),
          lane,
          from: `addr_${this.randomHex(40)}`,
          to: `addr_${this.randomHex(40)}`,
          value: Math.floor(this.rng() * 10000000000), // 0-10000 BLOCK
          fee: Math.floor(laneData.avg_fee * feeFactor),
          size: 200 + Math.floor(this.rng() * 1000),
          timestamp: now - age,
          priority: age < 5000 ? 'high' : age < 30000 ? 'medium' : 'low',
        });
      }
    });

    // Base fee (EIP-1559 style) — driven by shared currentBaseFee, not an independent draw
    const base_fee = Math.round((this.currentBaseFee || 25000) * (1 + this.noise(0.05)));
    const base_fee_trend = this.noise(5); // ±5% change

    return {
      total_pending: actualPending,
      pending_trend: Math.floor(this.noise(10)),
      avg_wait_time: 8 + this.noise(3),
      base_fee,
      base_fee_trend,
      current_tps: Math.floor(currentTPS),
      max_tps: maxTPS,
      throughput_pct: (currentTPS / maxTPS) * 100,
      lanes,
      transactions,
      predictions: {
        next_block: base_fee * 1.5,
        fast: base_fee * 1.2,
        normal: base_fee * 1.0,
        economy: base_fee * 0.8,
      },
      admission: {
        admitted_1m: Math.floor(currentTPS * 60 * 0.95),
        rejected_1m: Math.floor(currentTPS * 60 * 0.05),
        evicted_1m: Math.floor(actualPending * 0.02),
        reject_reasons: {
          'fee_too_low': Math.floor(currentTPS * 60 * 0.03),
          'invalid_nonce': Math.floor(currentTPS * 60 * 0.01),
          'insufficient_balance': Math.floor(currentTPS * 60 * 0.01),
        },
        eviction_reasons: {
          'replaced': Math.floor(actualPending * 0.01),
          'timeout': Math.floor(actualPending * 0.008),
          'pool_full': Math.floor(actualPending * 0.002),
        },
      },
    };
  }

  /**
   * Mock Provider Leaderboard
   * Service badges, uptime, margins, and rankings
   */
  mockProviderLeaderboard(filters = {}) {
    const market = filters.market || 'all';
    const timeRange = filters.timeRange || '24h';
    
    const markets = market === 'all' 
      ? ['storage', 'compute', 'energy', 'ad']
      : [market];
    
    const providers = [];
    const providersPerMarket = 25;
    
    markets.forEach(mkt => {
      for (let i = 0; i < providersPerMarket; i++) {
        const uptimePct = 94 + this.rng() * 6; // 94-100%
        const marginPct = -5 + this.rng() * 30; // -5% to 25%
        const reliabilityScore = 0.85 + this.rng() * 0.15; // 0.85-1.0
        const settlementVolume = Math.floor(10000 + this.rng() * 1000000);
        const disputes = this.rng() < 0.15 ? Math.floor(this.rng() * 3) + 1 : 0;
        const streakDays = Math.floor(this.rng() * 90);
        
        // Badge determination
        let badge = null;
        if (uptimePct >= 99.9 && disputes === 0 && streakDays >= 30) {
          badge = 'gold';
        } else if (uptimePct >= 99.0 && disputes <= 1 && streakDays >= 14) {
          badge = 'silver';
        } else if (uptimePct >= 95.0 && disputes <= 4 && streakDays >= 7) {
          badge = 'bronze';
        }
        
        // Performance score (weighted)
        const performanceScore = Math.min(100, 
          uptimePct * 0.4 + 
          reliabilityScore * 30 + 
          Math.min(marginPct, 20) * 1.5 + 
          Math.max(0, 10 - disputes) * 1.0
        );
        
        providers.push({
          id: `${mkt}-provider-${this.randomHex(8)}`,
          name: `${mkt.charAt(0).toUpperCase() + mkt.slice(1)} Provider ${String.fromCharCode(65 + i)}`,
          market: mkt,
          badge,
          performance_score: performanceScore,
          uptime_pct: uptimePct,
          uptime_streak_days: streakDays,
          settlement_volume: settlementVolume,
          settlement_count: Math.floor(settlementVolume / 100),
          margin_pct: marginPct,
          reliability_score: reliabilityScore,
          disputes,
          disputes_resolved: disputes > 0 ? Math.floor(disputes * 0.7) : 0,
        });
      }
    });
    
    const badgedProviders = providers.filter(p => p.badge).length;
    const activeProviders = Math.floor(providers.length * 0.85);
    
    return {
      total_providers: providers.length,
      active_providers_24h: activeProviders,
      new_providers_24h: Math.floor(providers.length * 0.05),
      badged_providers: badgedProviders,
      avg_uptime_pct: providers.reduce((sum, p) => sum + p.uptime_pct, 0) / providers.length,
      providers,
    };
  }


  // Utility: Gaussian noise with mean 0
  noise(stddev) {
    // Box-Muller transform for Gaussian distribution using deterministic RNG
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = this.rng(); // Converting [0,1) to (0,1)
    while (u2 === 0) u2 = this.rng();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stddev;
  }

  // Utility: Random integer in range [min, max]
  random(min, max) {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  // Utility: Random hex string of given character length
  randomHex(len) {
    let result = '';
    while (result.length < len) {
      result += Math.floor(this.rng() * 0xFFFFFFFF).toString(16).padStart(8, '0');
    }
    return result.slice(0, len);
  }

  // ── Invariant assertions (mock mode) ─────────────────────────────────────────────
  validateInvariants() {
    const errors = [];

    // Protocol Capacity invariants
    const issuance = this.mockData.issuance || {};
    if (issuance.max_tps != null && issuance.max_tps !== BLOCK_MAX_TPS) {
      errors.push(`issuance.max_tps (${issuance.max_tps}) != BLOCK_MAX_TPS (${BLOCK_MAX_TPS})`);
    }
    if (issuance.target_tps != null && issuance.target_tps !== BLOCK_TARGET_TPS) {
      errors.push(`issuance.target_tps (${issuance.target_tps}) != BLOCK_TARGET_TPS (${BLOCK_TARGET_TPS})`);
    }

    // DEX/orderbook invariants
    const ob = this.mockData.orderBook || {};
    const mid = Number(ob.mid_price ?? ob.midPrice);
    if (Number.isFinite(mid)) {
      const bids = Array.isArray(ob.bids) ? ob.bids : [];
      const asks = Array.isArray(ob.asks) ? ob.asks : [];
      const bestBid = bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : null;
      const bestAsk = asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : null;
      if (bestBid != null && bestAsk != null && bestBid > bestAsk) {
        errors.push(`orderBook crossed: bestBid (${bestBid}) > bestAsk (${bestAsk})`);
      }
      if (bestBid != null && mid < bestBid * 0.90) {
        errors.push(`orderBook mid too low vs bid: mid (${mid}) < 0.90*bestBid (${bestBid})`);
      }
      if (bestAsk != null && mid > bestAsk * 1.10) {
        errors.push(`orderBook mid too high vs ask: mid (${mid}) > 1.10*bestAsk (${bestAsk})`);
      }
    }

    this.mockData.invariants = { ok: errors.length === 0, errors, timestamp: Date.now() };

    // Emit warnings to console in dev mode
    if (errors.length) {
      console.warn('[MockDataManager] Invariant violations:', errors);
    }
    return this.mockData.invariants;
  }
}

// Export singleton instance
export default new MockDataManager();

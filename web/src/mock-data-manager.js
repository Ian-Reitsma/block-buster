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

class MockDataManager {
  constructor() {
    this.mode = 'DETECTING'; // DETECTING | LIVE | MOCK
    this.mockData = {};
    this.updateInterval = null;
    // Adaptive baseline state mirrors NetworkIssuanceController
    this.baselineTxCount = 100;
    this.baselineTxVolume = 10_000;
    this.baselineMiners = 10;
    this.prevAnnualIssuance = 0;
    // Use same base URL as main app (default: localhost:5000)
    this.nodeUrl = window.BLOCK_BUSTER_API || 'http://localhost:5000';
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
          const rpcConnected = Boolean(
            bootstrap.rpc_connected ?? bootstrap.genesis_ready ?? false,
          );
          if (!rpcConnected) {
            // Dashboard reachable but node offline; keep waiting.
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
    
    // Network issuance (from economics_and_governance.md)
    this.mockData.issuance = this.mockNetworkIssuance();
    
    // DEX order book (from node/src/dex/order_book.rs)
    this.mockData.orderBook = this.mockOrderBook();
    
    // Ad market quality (from economics_and_governance.md)
    this.mockData.adQuality = this.mockAdQuality();
    
    // Energy market
    this.mockData.energyMarket = this.mockEnergyMarket();
    
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
    
    // Fee history (consumer + industrial lanes)
    this.mockData.feeHistory = this.mockTimeSeries({
      length: 100,
      baseValue: 25000, // 0.025 BLOCK average fee
      trend: 0.0001,
      volatility: 0.08,
      cyclePeriod: 24,
    });
    
    console.log(`[MockDataManager] Network: block ${this.currentBlock.toLocaleString()}, epoch ${this.currentEpoch}, emission ${this.currentEmission.toLocaleString()} BLOCK`);
    console.log(`[MockDataManager] TPS baseline: ${Math.floor(baselineTPS)}, time multiplier: ${this.timeOfDayMultiplier.toFixed(2)}x`);
    console.log('[MockDataManager] Mock data initialized');
  }

  /**
   * Network Issuance Formula (ACTUAL FORMULA FROM DOCS)
   * reward = base × activity × decentralization × supply_decay
   * 
   * Based on: ~/projects/the-block/docs/economics_and_governance.md
   */
  mockNetworkIssuance(params = {}) {
    const PPM = 1_000_000;
    const paramsDefault = {
      max_supply_block: 40_000_000,
      expected_total_blocks: 20_000_000,
      baseline_tx_count: 100,
      baseline_tx_volume_block: 10_000,
      baseline_miners: 10,
      activity_multiplier_min_ppm: 500_000,
      activity_multiplier_max_ppm: 2_000_000,
      decentralization_multiplier_min_ppm: 500_000,
      decentralization_multiplier_max_ppm: 1_500_000,
      adaptive_baselines_enabled: true,
      baseline_ema_alpha_ppm: 50_000,
      kill_switch_reduction_ppm: 0,
    };

    const paramsMerged = { ...paramsDefault, ...params };
    const alpha = paramsMerged.baseline_ema_alpha_ppm / PPM;

    // Helpers (ppm aware)
    const clampPpm = (v, min, max) => Math.min(Math.max(v, min), max);
    const mulDivPpm = (a, b, denom) => (denom === 0 ? 0 : Math.round((a * b) / denom));
    const sqrtPpm = (v) => Math.round(Math.sqrt(v / PPM) * PPM);
    const pow2Ppm = (v) => Math.min(Math.round((v * v) / PPM), Number.MAX_SAFE_INTEGER);

    // Observed metrics from mock state
    const tpsSeries = this.mockData.tpsHistory || [];
    const currentTps = tpsSeries.length ? tpsSeries[tpsSeries.length - 1].value : 80;
    const epochSeconds = 120;
    const tx_count = Math.max(1, Math.round(currentTps * epochSeconds));
    const tx_volume_block = Math.max(1, Math.round(tx_count * 0.5));
    const unique_miners = 20;
    const avg_market_utilization_ppm = Math.round(
      clampPpm(
        Math.floor(((this.mockData?.energyMarket?.avg_utilization || 0.6) * PPM)),
        0,
        PPM,
      ),
    );

    // Base reward in ppm terms
    const distributable_supply = mulDivPpm(
      paramsMerged.max_supply_block,
      900_000,
      PPM,
    );
    const base_reward_ppm = mulDivPpm(
      distributable_supply,
      PPM,
      paramsMerged.expected_total_blocks,
    );

    // Activity multiplier (geometric mean with utilization bonus)
    const tx_ratio_ppm = mulDivPpm(tx_count, PPM, Math.max(1, this.baselineTxCount));
    const volume_ratio_ppm = mulDivPpm(
      tx_volume_block,
      PPM,
      Math.max(1, this.baselineTxVolume),
    );
    const tx_factor_ppm = sqrtPpm(Math.max(tx_ratio_ppm, 10_000));
    const volume_factor_ppm = sqrtPpm(Math.max(volume_ratio_ppm, 10_000));
    const utilization_bonus_ppm = 1_000_000 + avg_market_utilization_ppm;
    const activity_multiplier_ppm = clampPpm(
      mulDivPpm(
        tx_factor_ppm,
        mulDivPpm(volume_factor_ppm, utilization_bonus_ppm, PPM),
        PPM,
      ),
      paramsMerged.activity_multiplier_min_ppm,
      paramsMerged.activity_multiplier_max_ppm,
    );

    // Decentralization multiplier
    const miner_ratio_ppm = mulDivPpm(unique_miners, PPM, Math.max(1, this.baselineMiners));
    const decentralization_multiplier_ppm = clampPpm(
      sqrtPpm(Math.max(miner_ratio_ppm, 10_000)),
      paramsMerged.decentralization_multiplier_min_ppm,
      paramsMerged.decentralization_multiplier_max_ppm,
    );

    // Supply decay (quadratic)
    const remaining = paramsMerged.max_supply_block - this.currentEmission;
    const remaining_ratio_ppm = mulDivPpm(
      remaining,
      PPM,
      paramsMerged.max_supply_block,
    );
    const supply_decay_ppm = pow2Ppm(remaining_ratio_ppm);

    // Combine
    const reward_unclamped_ppm = mulDivPpm(
      mulDivPpm(
        mulDivPpm(base_reward_ppm, activity_multiplier_ppm, PPM),
        decentralization_multiplier_ppm,
        PPM,
      ),
      supply_decay_ppm,
      PPM,
    );

    const reward_reduced_ppm = mulDivPpm(
      reward_unclamped_ppm,
      PPM - Math.min(paramsMerged.kill_switch_reduction_ppm, PPM),
      PPM,
    );

    const reward = Math.round((reward_reduced_ppm + PPM / 2) / PPM);
    const annual_issuance = reward * 31_536_000;

    // Drift clamp (5%/yr)
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
        const capped_reward = Math.round(cap / 31_536_000);
        final_reward = Math.min(final_reward, capped_reward);
      }
    }

    // Update adaptive baselines (EMA)
    this.baselineTxCount = Math.max(
      paramsMerged.baseline_tx_count,
      Math.min(
        10_000,
        (1 - alpha) * this.baselineTxCount + alpha * tx_count,
      ),
    );
    this.baselineTxVolume = Math.max(
      paramsMerged.baseline_tx_volume_block,
      Math.min(
        1_000_000,
        (1 - alpha) * this.baselineTxVolume + alpha * tx_volume_block,
      ),
    );
    this.baselineMiners = Math.max(
      paramsMerged.baseline_miners,
      Math.min(
        100,
        (1 - alpha) * this.baselineMiners + alpha * unique_miners,
      ),
    );

    this.prevAnnualIssuance = annual_issuance;

    // History points for charts (keep same shape)
    const history = [];
    for (let i = 0; i < 100; i++) {
      const epochNum = this.currentEpoch - 99 + i;
      const blockNum = epochNum * 120;
      history.push({
        epoch: epochNum,
        block: blockNum,
        reward: final_reward,
        timestamp: Date.now() - (99 - i) * 120 * 1000,
      });
    }

    return {
      base_reward: base_reward_ppm / PPM,
      activity_multiplier: activity_multiplier_ppm / PPM,
      activity_breakdown: {
        tx_count_ratio: tx_ratio_ppm / PPM,
        tx_volume_ratio: volume_ratio_ppm / PPM,
        avg_market_utilization: avg_market_utilization_ppm / PPM,
      },
      decentralization_factor: decentralization_multiplier_ppm / PPM,
      unique_miners,
      baseline_miners: this.baselineMiners,
      supply_decay: supply_decay_ppm / PPM,
      emission_consumer: this.currentEmission,
      remaining_supply: paramsMerged.max_supply_block - this.currentEmission,
      max_supply: paramsMerged.max_supply_block,
      final_reward,
      block_reward_per_block: final_reward,
      annual_issuance,
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
    };
  }

  /**
   * DEX Order Book
   * Mimics BTreeMap<u64, VecDeque<Order>> from Rust
   */
  mockOrderBook(params = {}) {
    const midPrice = params.midPrice || 115000; // 1.15 USD in micro-units
    const spread_bps = params.spread_bps || 87;
    const depth = params.depth || 20;
    const volumeProfile = params.volumeProfile || 'exponential';
    
    const bids = [];
    const asks = [];
    
    const spreadAmount = Math.floor((midPrice * spread_bps) / 20000);
    const bestBid = midPrice - spreadAmount;
    const bestAsk = midPrice + spreadAmount;
    
    // Generate bids (descending price)
    for (let i = 0; i < depth; i++) {
      const price = bestBid - i * 100;
      const distanceFromMid = (midPrice - price) / midPrice;
      
      let volumeMultiplier;
      if (volumeProfile === 'exponential') {
        volumeMultiplier = Math.exp(-distanceFromMid * 10);
      } else {
        volumeMultiplier = 1 / (1 + distanceFromMid * 5);
      }
      
      const baseVolume = 1000;
      const volume = Math.floor(baseVolume * volumeMultiplier * (0.8 + Math.random() * 0.4));
      
      const numOrders = Math.floor(Math.random() * 3) + 1;
      const orders = [];
      let remaining = volume;
      
      for (let j = 0; j < numOrders && remaining > 0; j++) {
        const orderSize = j === numOrders - 1 
          ? remaining 
          : Math.floor(remaining * (0.3 + Math.random() * 0.4));
        
        orders.push({
          id: Date.now() + i * 100 + j,
          account: `addr${Math.floor(Math.random() * 1000)}`,
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
      const price = bestAsk + i * 100;
      const distanceFromMid = (price - midPrice) / midPrice;
      
      let volumeMultiplier;
      if (volumeProfile === 'exponential') {
        volumeMultiplier = Math.exp(-distanceFromMid * 10);
      } else {
        volumeMultiplier = 1 / (1 + distanceFromMid * 5);
      }
      
      const baseVolume = 1000;
      const volume = Math.floor(baseVolume * volumeMultiplier * (0.8 + Math.random() * 0.4));
      
      const numOrders = Math.floor(Math.random() * 3) + 1;
      const orders = [];
      let remaining = volume;
      
      for (let j = 0; j < numOrders && remaining > 0; j++) {
        const orderSize = j === numOrders - 1 
          ? remaining 
          : Math.floor(remaining * (0.3 + Math.random() * 0.4));
        
        orders.push({
          id: Date.now() + i * 100 + j + 10000,
          account: `addr${Math.floor(Math.random() * 1000)}`,
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
    
    return {
      bids,
      asks,
      spread: spreadAmount * 2,
      spread_bps,
      total_bid_volume,
      total_ask_volume,
      last_trade_price: midPrice,
      last_trade_time: Date.now(),
    };
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
      const capacity_kwh = 1000 + Math.floor(Math.random() * 9000);
      const utilization = 0.4 + Math.random() * 0.5;
      const delivered_kwh = Math.floor(capacity_kwh * utilization);
      
      const base_price = 80000;
      const price_variance = 0.8 + Math.random() * 0.4;
      const price_per_kwh = Math.floor(base_price * price_variance);
      
      providers.push({
        id: `energy-provider-${i}`,
        name: `Provider ${String.fromCharCode(65 + i)}`,
        capacity_kwh,
        delivered_kwh,
        utilization,
        price_per_kwh,
        stake: 10000 + Math.floor(Math.random() * 90000),
        meter_address: `meter_${i}_${Date.now()}`,
        jurisdiction: ['US_CA', 'US_TX', 'US_NY', 'EU_DE'][Math.floor(Math.random() * 4)],
        credits_pending: Math.floor(Math.random() * 500),
        receipts_count: Math.floor(Math.random() * 1000),
        disputes_count: Math.random() > 0.9 ? 1 : 0,
        last_reading_time: Date.now() - Math.floor(Math.random() * 3600000),
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
    // Simulate an active network: 800–1500 TPS with day/night modulation
    const maturityFactor = Math.min(1.0, this.currentEmission / 10_000_000);
    const minTPS = 800 + maturityFactor * 200;  // 800 → 1000
    const maxTPS = 1200 + maturityFactor * 300; // 1200 → 1500
    const baseline = minTPS + (maxTPS - minTPS) * 0.5;
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
      const randomWalk = (Math.random() - 0.5) * volatility * baseValue * 0.5;
      
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
    // Advance network state (~3 blocks per update at 1s block time)
    this.currentBlock += 3;
    this.currentEpoch = Math.floor(this.currentBlock / 120);
    
    // Update emission (very slowly, ~0.5 BLOCK per 3s = ~5M BLOCK/year)
    const blocksPerSecond = 1;
    const rewardPerBlock = 0.36 * 1.2 * 1.07 * 0.92; // Approximate from formula
    this.currentEmission += rewardPerBlock * 3; // 3 seconds = 3 blocks
    
    // Recalculate time-of-day multiplier
    this.timeOfDayMultiplier = this.getTimeOfDayMultiplier();
    
    // Update TPS history (with time-of-day effects)
    const lastTps = this.mockData.tpsHistory[this.mockData.tpsHistory.length - 1].value;
    const tpsTarget = this.getRealisticTPS();
    const tpsAdjustment = (tpsTarget - lastTps) * 0.1; // Smooth transition
    const newTps = lastTps + tpsAdjustment + this.noise(lastTps * 0.08);
    
    this.mockData.tpsHistory.push({
      timestamp: Date.now(),
      value: Math.max(10, newTps), // Never below 10 TPS
    });
    this.mockData.tpsHistory.shift();
    
    // Update price history
    const lastPrice = this.mockData.priceHistory[this.mockData.priceHistory.length - 1].value;
    const priceWalk = this.noise(lastPrice * 0.01);
    const newPrice = lastPrice * 1.0002 + priceWalk; // Slight upward trend
    
    this.mockData.priceHistory.push({
      timestamp: Date.now(),
      value: Math.max(50000, newPrice), // Never below $0.05
    });
    this.mockData.priceHistory.shift();
    
    // Update fee history
    const lastFee = this.mockData.feeHistory[this.mockData.feeHistory.length - 1].value;
    const feeWalk = this.noise(lastFee * 0.05);
    const newFee = lastFee + feeWalk;
    
    this.mockData.feeHistory.push({
      timestamp: Date.now(),
      value: Math.max(10000, newFee), // Never below 0.01 BLOCK
    });
    this.mockData.feeHistory.shift();
    
    // Update order book (simulate trades)
    if (Math.random() > 0.7) {
      const currentMid = this.mockData.orderBook.last_trade_price;
      const priceChange = this.noise(100);
      this.mockData.orderBook = this.mockOrderBook({
        midPrice: currentMid + priceChange,
        spread_bps: this.mockData.orderBook.spread_bps,
      });
      
      // Notify subscribers
      appState.set('orderBook', this.mockData.orderBook);
    }
    
    // Update issuance (recalculate with new network state)
    this.mockData.issuance = this.mockNetworkIssuance();
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
      // Layer 1: Inflation Control
      inflation: {
        target_bps: 500, // 5% annual
        realized_bps: 480 + this.noise(20),
        error_bps: -20 + this.noise(15),
        annual_issuance: 2_000_000 + this.noise(100_000),
        controller_gain: 0.10,
        convergence_epochs: 30,
      },
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
        const hasDispute = Math.random() < 0.1; // 10% have disputes

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
            status: Math.random() < 0.3 ? 'resolved' : 'pending',
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
   * Mock Mempool Data
   * Real-time transaction pool with fee lanes and admission tracking
   */
  mockMempool() {
    const now = Date.now();
    const currentTPS = this.getRealisticTPS();
    const maxTPS = 500; // Theoretical max
    
    // Base pending count scales with network maturity
    const maturityFactor = Math.min(1.0, this.currentEmission / 10_000_000);
    const basePending = Math.floor(50 + maturityFactor * 150); // 50 early → 200 mature
    const actualPending = Math.floor(basePending * (0.8 + Math.random() * 0.4));
    
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
        const age = Math.random() * 120000; // 0-120 seconds
        const feeFactor = 0.7 + Math.random() * 0.6; // 0.7-1.3x
        
        transactions.push({
          id: `${lane}-${Date.now()}-${i}`,
          hash: this.randomHex(64),
          lane,
          from: `addr_${this.randomHex(40)}`,
          to: `addr_${this.randomHex(40)}`,
          value: Math.floor(Math.random() * 10000000000), // 0-10000 BLOCK
          fee: Math.floor(laneData.avg_fee * feeFactor),
          size: 200 + Math.floor(Math.random() * 1000),
          timestamp: now - age,
          priority: age < 5000 ? 'high' : age < 30000 ? 'medium' : 'low',
        });
      }
    });

    // Base fee (EIP-1559 style)
    const base_fee = 20000 + this.noise(3000);
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
        const uptimePct = 94 + Math.random() * 6; // 94-100%
        const marginPct = -5 + Math.random() * 30; // -5% to 25%
        const reliabilityScore = 0.85 + Math.random() * 0.15; // 0.85-1.0
        const settlementVolume = Math.floor(10000 + Math.random() * 1000000);
        const disputes = Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0;
        const streakDays = Math.floor(Math.random() * 90);
        
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

  // Utility: Random hex string
  randomHex(length) {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  // Utility: Gaussian noise with mean 0
  noise(stddev) {
    // Box-Muller transform for Gaussian distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stddev;
  }

  // Utility: Random integer in range [min, max]
  random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

// Export singleton instance
export default new MockDataManager();

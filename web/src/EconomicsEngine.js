/**
 * Economics Engine
 *
 * Pure computation module for The Block's economic policy.
 * Shared by EconomicsSimulator and EconomicControlLaws.
 * 
 * Sources: 
 * - docs/economics_and_governance.md
 * - node/src/economics/network_issuance.rs
 */

export const CONSTANTS = {
  EXPECTED_TOTAL_BLOCKS: 100_000_000,
  BLOCKS_PER_YEAR: 365 * 24 * 3600, // Assumes 1s block time
  MAX_SUPPLY: 40_000_000,
  EPOCH_BLOCKS: 120,
  
  // Governance params (defaults)
  ACTIVITY_MIN_PPM: 500_000,    // 0.5x
  ACTIVITY_MAX_PPM: 1_800_000,  // 1.8x
  DECENTR_MIN_PPM: 500_000,     // 0.5x
  DECENTR_MAX_PPM: 2_000_000,   // 2.0x
  SUPPLY_DECAY_FLOOR: 0.05,     // 5% floor
  
  // Base reward: 90% of 40M cap distributed over 100M blocks
  // (40,000,000 * 0.90) / 100,000,000 = 0.36 BLOCK
  BASE_REWARD: 0.36,

  // Gate thresholds (Launch Governor defaults)
  GATE_UTILIZATION_MIN: 0.60,
  GATE_MARGIN_MIN: 0.10,
  GATE_STREAK_MIN: 14,

  // ── Per-market defaults for P4 per-market sliders ─────────────────────────────────────────
  // Source: governor.status.economics_prev_market_metrics (utilization_ppm / provider_margin_ppm
  // per market). These are testnet-era baselines; live sync overrides them from governor.status.
  //
  // Market order matches the Rust economics_prev_market_metrics array index:
  //   [0] = storage, [1] = compute, [2] = energy, [3] = ad
  //
  // Utilization spread reflects typical early-network observations:
  //   Storage runs slightly under compute, energy lags (oracle ramp-up), ad is most volatile.
  STORAGE_UTIL_PPM_DEFAULT:    650_000,   // 65.0% utilization
  COMPUTE_UTIL_PPM_DEFAULT:    680_000,   // 68.0% utilization
  ENERGY_UTIL_PPM_DEFAULT:     590_000,   // 59.0% utilization (oracle ramp-up lag)
  AD_UTIL_PPM_DEFAULT:         720_000,   // 72.0% utilization

  // Provider margin spread: compute and ad tend to compress margins faster at scale.
  STORAGE_MARGIN_PPM_DEFAULT:  120_000,   // 12.0% margin
  COMPUTE_MARGIN_PPM_DEFAULT:  135_000,   // 13.5% margin
  ENERGY_MARGIN_PPM_DEFAULT:   110_000,   // 11.0% margin
  AD_MARGIN_PPM_DEFAULT:       145_000,   // 14.5% margin

  // ── Coinbase distribution governance defaults ──────────────────────────────────────────────
  // Source: node/src/economics/network_issuance.rs + subsidy_allocator.rs param defaults.
  // These are the protocol defaults before any governance proposal overrides them.
  // If the Rust defaults change, update these to match (grep: treasury_percent, subsidy_storage_bps).
  //
  //   treasury_cut  = floor(blockReward × TREASURY_PERCENT       / 100)     ← mine_block_with_ts
  //   storage_sub   = blockReward × SUBSIDY_STORAGE_BPS          / 10_000   ← subsidy_allocator
  //   read_sub      = blockReward × SUBSIDY_READ_BPS             / 10_000
  //   compute_sub   = blockReward × SUBSIDY_COMPUTE_BPS          / 10_000
  //   miner_payout  = blockReward - treasury_cut - storage_sub - read_sub - compute_sub
  //
  // Default allocation at genesis:
  //   10% treasury + 15% storage + 8% read + 12% compute = 45% allocated → 55% miner
  TREASURY_PERCENT_DEFAULT:       10,  // treasury_percent param
  SUBSIDY_STORAGE_BPS_DEFAULT: 1500,   // storage_sub = reward × 1500 / 10_000 = 15%
  SUBSIDY_READ_BPS_DEFAULT:     800,   // read_sub    = reward ×  800 / 10_000 =  8%
  SUBSIDY_COMPUTE_BPS_DEFAULT: 1200,   // compute_sub = reward × 1200 / 10_000 = 12%

  // ── EMA baseline smoothing (activity multiplier) ──────────────────────────────────────────────
  // Source: docs/economics_and_governance.md — "Baseline EMA uses integer ppm smoothing
  //   (baseline_ema_alpha_ppm)." The Rust node runs this per-epoch in network_issuance.rs.
  //
  // The ratio fed into the activity multiplier is:
  //   effective_tx_count_ratio = epoch_tx_count / ema_baseline_tx_count
  // where the EMA baseline updates each epoch:
  //   new_baseline = old_baseline * (1 - alpha) + observed * alpha,  alpha = emaAlphaPpm / 1e6
  //
  // Impact on block reward (the early-network story):
  //   Early network (N small): baseline still near seed 1.0; a 2x tx spike yields an
  //   effective ratio of ~1.63 because the baseline hasn’t caught up — reward is amplified.
  //   Mainnet (N large):  baseline has converged to the long-run tx rate so effective
  //   ratio gravitates toward 1.0 regardless of raw observed count — reward stabilises.
  EMA_ALPHA_PPM_DEFAULT:    50_000,  // 5% per epoch — baseline_ema_alpha_ppm governance default
  BASELINE_EPOCHS_DEFAULT:      10,  // epochs of EMA history at testnet launch (early-network)
};

// Utility to clamp values
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

/**
 * Compute all economic outputs based on inputs.
 * Implements the "Four-factor formula" from economics_and_governance.md.
 */
export function computeIssuance(inputs) {
  const {
    txCountRatio:   rawTxCountRatio,
    txVolumeRatio:  rawTxVolumeRatio,
    marketUtil,
    uniqueMiners,
    baselineMiners,
    emission,
    maxSupply,
    targetInflationBps,
    emaAlphaPpm,
    baselineEpochs,
  } = inputs;

  // ── EMA preprocessing (optional) ────────────────────────────────────────────────────────────
  // When emaAlphaPpm + baselineEpochs are present in inputs, the raw slider tx ratios are
  // converted to EMA-normalised effective ratios before entering the activity formula.
  // This makes the simulator faithful to the Rust node: the activity multiplier is driven
  // by (observed / ema_baseline), not raw observed values.
  // computeEmaSmoothedRatios() is defined below; hoisting not needed in ESM.
  let txCountRatio  = rawTxCountRatio;
  let txVolumeRatio = rawTxVolumeRatio;
  let emaIntermediate = null;

  if (typeof emaAlphaPpm === 'number' && emaAlphaPpm > 0 &&
      typeof baselineEpochs === 'number' && baselineEpochs >= 0) {
    emaIntermediate = computeEmaSmoothedRatios(
      rawTxCountRatio,
      rawTxVolumeRatio,
      emaAlphaPpm,
      baselineEpochs,
    );
    txCountRatio  = emaIntermediate.effectiveTxCountRatio;
    txVolumeRatio = emaIntermediate.effectiveTxVolumeRatio;
  }

  // 1. Activity Multiplier
  // Formula: clamp(((txCountRatio * txVolumeRatio * (1 + marketUtil)) ^ (1/3)), 0.5, 1.8)
  // marketUtil is passed as decimal (e.g. 0.62), so (1 + marketUtil) is correct.
  // When EMA is active: txCountRatio / txVolumeRatio are already EMA-normalised at this point.
  const activityRaw = Math.cbrt(txCountRatio * txVolumeRatio * (1 + marketUtil));
  const activityMultiplier = clamp(
    activityRaw,
    CONSTANTS.ACTIVITY_MIN_PPM / 1_000_000,
    CONSTANTS.ACTIVITY_MAX_PPM / 1_000_000
  );

  // 2. Decentralization Multiplier
  // Formula: isqrt(unique * 10^6 / baseline) / 10^6, clamped [0.5, 2.0]
  // Implemented with integer math to match Rust behavior
  const uMiners = Math.max(uniqueMiners, 1);
  const bMiners = Math.max(baselineMiners, 1);
  const ratioPpm = Math.floor((uMiners * 1_000_000) / bMiners);
  const sqrtPpm = Math.floor(Math.sqrt(ratioPpm));
  const decentrPpm = clamp(
    sqrtPpm, 
    CONSTANTS.DECENTR_MIN_PPM, 
    CONSTANTS.DECENTR_MAX_PPM
  );
  const decentralization = decentrPpm / 1_000_000;

  // 3. Supply Decay
  // Formula: Quadratic decay on remaining supply ratio: ((max - emission) / max)^2
  // Clamped to floor (0.05)
  const remainingRatio = Math.max(0, (maxSupply - emission) / maxSupply);
  const supplyDecay = clamp(
    Math.pow(remainingRatio, 2),
    CONSTANTS.SUPPLY_DECAY_FLOOR,
    1.0
  );

  // 4. Block Reward
  const blockReward = CONSTANTS.BASE_REWARD * activityMultiplier * decentralization * supplyDecay;

  // 5. Inflation
  // Annual Issuance = blockReward * BLOCKS_PER_YEAR
  // Inflation bps = (Annual Issuance / Circulating Supply) * 10000
  // Note: Using 'emission' as proxy for circulating supply per current UI convention
  const annualIssuance = blockReward * CONSTANTS.BLOCKS_PER_YEAR;
  
  let inflationBps = 0;
  if (emission > 0) {
    inflationBps = (annualIssuance / emission) * 10_000;
  }
  
  const inflationDelta = inflationBps - targetInflationBps;

  return {
    activityMultiplier,
    decentralization,
    supplyDecay,
    blockReward,
    annualIssuance,
    inflationBps,
    inflationDelta,
    // EMA intermediates — null when disabled (no emaAlphaPpm in inputs).
    // When set: { alpha, n, decay, txCountBaseline, txVolumeBaseline,
    //             effectiveTxCountRatio, effectiveTxVolumeRatio }
    ema: emaIntermediate,
    // Effective ratios actually fed into the formula (raw when EMA off, smoothed when on)
    effectiveTxCountRatio:  txCountRatio,
    effectiveTxVolumeRatio: txVolumeRatio,
    // Raw slider values always echoed back so the UI can show "raw vs effective" diff
    rawTxCountRatio:  rawTxCountRatio  ?? txCountRatio,
    rawTxVolumeRatio: rawTxVolumeRatio ?? txVolumeRatio,
  };
}

/**
 * Compute EMA-smoothed effective tx ratios for the activity multiplier.
 *
 * The Rust node maintains an EMA baseline for epoch_tx_count and epoch_tx_volume_block:
 *   new_baseline = old_baseline × (1 - alpha) + observed × alpha
 *   where alpha = emaAlphaPpm / 1_000_000
 *
 * After N epochs of constant input R starting from a seed baseline of 1.0:
 *   baseline_N = 1.0 × (1-α)^N + R × (1 - (1-α)^N)
 *   effective_ratio = R / baseline_N
 *
 * Key intuitions:
 *   N=0   : baseline = 1.0  → effective_ratio = R  (fresh — no smoothing yet)
 *   N=∞   : baseline = R    → effective_ratio = 1.0 (fully converged — mainnet)
 *   Spike: R=2.0, N=5, α=5% → effective_ratio ≈ 1.63 (early-net amplification)
 *   Spike: R=2.0, N=500     → effective_ratio ≈ 1.00 (absorbed by converged EMA)
 *
 * Exported so the UI can display raw vs effective ratios in the activity breakdown.
 *
 * @param {number} txCountRatio   raw observed/seed ratio (slider value)
 * @param {number} txVolumeRatio  raw observed/seed ratio (slider value)
 * @param {number} emaAlphaPpm    baseline_ema_alpha_ppm governance param (0–1_000_000)
 * @param {number} baselineEpochs epochs of EMA history consumed (0 = genesis)
 */
export function computeEmaSmoothedRatios(txCountRatio, txVolumeRatio, emaAlphaPpm, baselineEpochs) {
  const alpha = Math.max(0, Math.min(1, emaAlphaPpm / 1_000_000));
  const n     = Math.max(0, Math.floor(baselineEpochs));

  // Decay factor: how much of the seed baseline (1.0) remains after N epochs.
  // (1-alpha)^N → 0 as N grows, so the baseline fully converges to the observed value.
  const decay = Math.pow(1 - alpha, n);

  // EMA baseline after N epochs of constant input R (seed = 1.0):
  //   baseline = seed × decay + R × (1 - decay)
  const txCountBaseline  = decay + txCountRatio  * (1 - decay);
  const txVolumeBaseline = decay + txVolumeRatio * (1 - decay);

  // Effective ratios — clamp denominator away from 0 to prevent explosion at extreme inputs.
  const effectiveTxCountRatio  = txCountRatio  / Math.max(txCountBaseline,  1e-6);
  const effectiveTxVolumeRatio = txVolumeRatio / Math.max(txVolumeBaseline, 1e-6);

  return {
    alpha,
    n,
    decay,
    txCountBaseline,
    txVolumeBaseline,
    effectiveTxCountRatio:  Math.max(0, effectiveTxCountRatio),
    effectiveTxVolumeRatio: Math.max(0, effectiveTxVolumeRatio),
  };
}

/**
 * Evaluate Launch Governor gates based on inputs.
 *
 * P4: Accepts per-market data via inputs.markets array. Falls back to the legacy
 * single-value shape (inputs.utilizationPpm / inputs.providerMarginPpm) when
 * inputs.markets is absent so EconomicControlLaws and any external callers don't break.
 *
 * inputs.markets shape (P4 mode):
 *   [ { name: 'storage'|'compute'|'energy'|'ad',
 *       utilizationPpm: number,   // 0–1_000_000
 *       providerMarginPpm: number // 0–1_000_000 (signed OK: negative = margin compression)
 *     }, ... ]
 *
 * Returns:
 *   status         — 'READY' | 'NOT READY'  (all markets must pass AND streak must pass)
 *   markets        — per-market array with { name, util, margin, isUtilGood, isMarginGood, pass }
 *   streak         — { val, pass, threshold }
 *   allMarketsPass — boolean
 *   details        — legacy single-value view (first market) for backward compat
 */
export function evaluateGates(inputs) {
  const gateStreak   = inputs.gateStreak ?? 0;
  const isStreakGood = gateStreak >= CONSTANTS.GATE_STREAK_MIN;

  // ── Build market list ─────────────────────────────────────────────────────────────────────
  // P4 mode: inputs.markets is an array of per-market ppm values.
  // Legacy mode: single inputs.utilizationPpm / inputs.providerMarginPpm — wrap in a single-
  //              element array so all downstream logic is uniform.
  const markets = Array.isArray(inputs.markets) && inputs.markets.length > 0
    ? inputs.markets
    : [{
        name:             'economics',
        utilizationPpm:   inputs.utilizationPpm   ?? 650_000,
        providerMarginPpm: inputs.providerMarginPpm ?? 120_000,
      }];

  // ── Per-market evaluation ─────────────────────────────────────────────────────────────────
  const marketResults = markets.map(m => {
    const util   = m.utilizationPpm    / 1_000_000;
    const margin = m.providerMarginPpm / 1_000_000;
    const isUtilGood   = util   >= CONSTANTS.GATE_UTILIZATION_MIN;
    const isMarginGood = margin >= CONSTANTS.GATE_MARGIN_MIN;
    return {
      name:        m.name,
      util,
      margin,
      isUtilGood,
      isMarginGood,
      pass: isUtilGood && isMarginGood,
      // Raw ppm echoed back so the UI can display without dividing again
      utilizationPpm:    m.utilizationPpm,
      providerMarginPpm: m.providerMarginPpm,
    };
  });

  const allMarketsPass = marketResults.every(m => m.pass);
  const status = (allMarketsPass && isStreakGood) ? 'READY' : 'NOT READY';

  // ── Legacy single-value compat (first market) for any caller still using details.util ─────
  const first = marketResults[0];

  return {
    status,
    allMarketsPass,
    markets: marketResults,
    streak: { val: gateStreak, pass: isStreakGood, threshold: CONSTANTS.GATE_STREAK_MIN },
    // details: kept for backward compat; points at first market
    details: {
      util:   { val: first?.util   ?? 0, pass: first?.isUtilGood   ?? false, threshold: CONSTANTS.GATE_UTILIZATION_MIN },
      margin: { val: first?.margin ?? 0, pass: first?.isMarginGood ?? false, threshold: CONSTANTS.GATE_MARGIN_MIN },
      streak: { val: gateStreak, pass: isStreakGood, threshold: CONSTANTS.GATE_STREAK_MIN },
    },
  };
}

/**
 * Compute the per-block coinbase breakdown into miner/treasury/provider buckets.
 *
 * Implements the coinbase conservation identity from economics_and_governance.md:
 *   coinbase_total = miner_payout + treasury_payout + storage_sub + read_sub + compute_sub
 *   (rebates, slashes, consumer/industrial fee routing also appear in the full identity
 *    but do not change the BLOCK minting math — they are not modeled here)
 *
 * Formula source references:
 *   treasury_cut  = floor(blockReward × treasury_percent / 100)    node/src/economics/network_issuance.rs
 *   storage_sub   = blockReward × subsidyStorageBps / 10_000       node/src/economics/subsidy_allocator.rs
 *   read_sub      = blockReward × subsidyReadBps    / 10_000
 *   compute_sub   = blockReward × subsidyComputeBps / 10_000
 *   miner_payout  = blockReward − treasury_cut − storage_sub − read_sub − compute_sub
 *
 * @param {number} blockReward  BLOCK per block from computeIssuance().blockReward
 * @param {Object} govParams    Governance-configurable knobs; all have CONSTANTS defaults
 */
export function computeCoinbaseBreakdown(blockReward, govParams = {}) {
  const {
    treasuryPercent   = CONSTANTS.TREASURY_PERCENT_DEFAULT,
    subsidyStorageBps = CONSTANTS.SUBSIDY_STORAGE_BPS_DEFAULT,
    subsidyReadBps    = CONSTANTS.SUBSIDY_READ_BPS_DEFAULT,
    subsidyComputeBps = CONSTANTS.SUBSIDY_COMPUTE_BPS_DEFAULT,
  } = govParams;

  // treasury_cut: floor(reward × treasury_percent / 100)
  // Rust uses integer division on a fixed-point scale; mirror with Math.floor on ppm
  // to avoid cumulative float drift on the conservative direction (never overpays treasury).
  const treasuryCut = Math.floor(blockReward * (treasuryPercent / 100) * 1_000_000) / 1_000_000;

  // Subsidy buckets: bps (basis points = 1/10_000) of the full block reward.
  // Applied to blockReward (not to blockReward - treasury_cut) per subsidy_allocator.rs.
  const storageSub = blockReward * subsidyStorageBps / 10_000;
  const readSub    = blockReward * subsidyReadBps    / 10_000;
  const computeSub = blockReward * subsidyComputeBps / 10_000;

  // Miner payout: residual after all allocations.
  // Clamped to 0 so invalid governance params that sum > 100% don't produce negative rewards.
  // When conservation fails (miner = 0) the UI renders a ⚠ on the identity check.
  const providerTotal = storageSub + readSub + computeSub;
  const minerPayout   = Math.max(0, blockReward - treasuryCut - providerTotal);

  // Conservation identity: miner + treasury + providers should == blockReward within float epsilon.
  // A slight residual (~1e-10) is expected from the treasury floor operation; > 1e-9 = real overflow.
  const conservation = minerPayout + treasuryCut + providerTotal;
  const conserved    = Math.abs(conservation - blockReward) < 1e-9;

  // Safe-divide helper: never produce NaN/Infinity when blockReward is 0 (early slider range)
  const ratio = (v) => blockReward > 0 ? v / blockReward : 0;

  return {
    blockReward,
    minerPayout,
    treasuryCut,
    storageSub,
    readSub,
    computeSub,
    providerTotal,
    conservation,
    conserved,
    // Segment ratios (0.0–1.0) — used directly as stacked-bar widths
    minerRatio:    ratio(minerPayout),
    treasuryRatio: ratio(treasuryCut),
    storageRatio:  ratio(storageSub),
    readRatio:     ratio(readSub),
    computeRatio:  ratio(computeSub),
  };
}

/**
 * Compute local sensitivity of blockReward to key inputs (1% perturbation).
 *
 * Returned rows are sorted by absolute impact (descending).
 * Each row is:
 *   { key, label, pct }
 * where pct means:
 *   +1% change in input → pct% change in blockReward
 *
 * Implementation notes:
 * - Uses canonical computeIssuance() and computes avg market utilization from inputs
 *   (P4 per-market sliders when present; otherwise inputs.marketUtil).
 * - Miner counts are treated as integers (rounded after perturbation).
 * - “Avg market utilization” is modeled by bumping all 4 per-market utilizations
 *   simultaneously when P4 keys are present; otherwise bumps inputs.marketUtil.
 */
export function computeSensitivity(inputs) {
  const avgUtilFromInputs = (inp) => {
    // P4 slider keys
    const hasP4 =
      typeof inp.storageUtilPpm === 'number' &&
      typeof inp.computeUtilPpm === 'number' &&
      typeof inp.energyUtilPpm  === 'number' &&
      typeof inp.adUtilPpm      === 'number';

    if (hasP4) {
      return (
        (inp.storageUtilPpm + inp.computeUtilPpm + inp.energyUtilPpm + inp.adUtilPpm) / 4
      ) / 1_000_000;
    }

    // P4 alt: inputs.markets array
    if (Array.isArray(inp.markets) && inp.markets.length > 0) {
      const phys = inp.markets.filter(m => ['storage','compute','energy','ad'].includes(m.name));
      if (phys.length > 0) {
        const meanPpm = phys.reduce((acc, m) => acc + (m.utilizationPpm ?? 0), 0) / phys.length;
        return meanPpm / 1_000_000;
      }
    }

    // Legacy single decimal
    return typeof inp.marketUtil === 'number' ? inp.marketUtil : 0;
  };

  const blockRewardFor = (inp) => {
    const avgUtil = avgUtilFromInputs(inp);
    const out = computeIssuance({
      txCountRatio:       inp.txCountRatio,
      txVolumeRatio:      inp.txVolumeRatio,
      marketUtil:         avgUtil,
      uniqueMiners:       inp.uniqueMiners,
      baselineMiners:     inp.baselineMiners,
      emission:           inp.emission,
      maxSupply:          inp.maxSupply,
      targetInflationBps: inp.targetInflationBps,
    });
    return out.blockReward;
  };

  const baseReward = blockRewardFor(inputs);
  if (!isFinite(baseReward) || baseReward <= 0) return [];

  // Helpers
  const bump = (v) => v * 1.01;
  const bumpInt = (v) => Math.max(1, Math.round(bump(v)));

  // P4 util sliders clamp at 950k in the UI; keep engine sensitivity consistent.
  const bumpPpm = (v) => Math.max(0, Math.min(950_000, Math.round(bump(v))));

  const hasP4Util =
    typeof inputs.storageUtilPpm === 'number' &&
    typeof inputs.computeUtilPpm === 'number' &&
    typeof inputs.energyUtilPpm  === 'number' &&
    typeof inputs.adUtilPpm      === 'number';

  const cases = [
    {
      key: 'emission',
      label: 'Issued supply (emission)',
      apply: (inp) => ({ ...inp, emission: bump(inp.emission) }),
    },
    {
      key: 'uniqueMiners',
      label: 'Unique miners',
      apply: (inp) => ({ ...inp, uniqueMiners: bumpInt(inp.uniqueMiners) }),
    },
    {
      key: 'txCountRatio',
      label: 'TX count ratio',
      apply: (inp) => ({ ...inp, txCountRatio: bump(inp.txCountRatio) }),
    },
    {
      key: 'txVolumeRatio',
      label: 'TX volume ratio',
      apply: (inp) => ({ ...inp, txVolumeRatio: bump(inp.txVolumeRatio) }),
    },
    {
      key: 'avgUtil',
      label: 'Avg market utilization',
      apply: (inp) => {
        if (hasP4Util) {
          return {
            ...inp,
            storageUtilPpm: bumpPpm(inp.storageUtilPpm),
            computeUtilPpm: bumpPpm(inp.computeUtilPpm),
            energyUtilPpm:  bumpPpm(inp.energyUtilPpm),
            adUtilPpm:      bumpPpm(inp.adUtilPpm),
          };
        }

        // Legacy decimal marketUtil; clamp to the slider max (0.95)
        const mu = typeof inp.marketUtil === 'number' ? inp.marketUtil : 0;
        return { ...inp, marketUtil: Math.max(0, Math.min(0.95, bump(mu))) };
      },
    },
    {
      key: 'baselineMiners',
      label: 'Baseline miners',
      apply: (inp) => ({ ...inp, baselineMiners: bumpInt(inp.baselineMiners) }),
    },
    // EMA alpha sensitivity: how much does a 1% increase in alpha change blockReward?
    // Only included when emaAlphaPpm is active in inputs; skipped when EMA is disabled
    // (otherwise it would perturb a zero and always return 0% sensitivity).
    {
      key: 'emaAlphaPpm',
      label: 'EMA alpha (baseline responsiveness)',
      apply: (inp) => {
        if (typeof inp.emaAlphaPpm !== 'number' || inp.emaAlphaPpm <= 0) return inp;
        return { ...inp, emaAlphaPpm: Math.min(500_000, Math.round(bump(inp.emaAlphaPpm))) };
      },
    },
  ];

  const rows = cases.map(c => {
    const r2  = blockRewardFor(c.apply(inputs));
    const pct = ((r2 - baseReward) / baseReward) * 100;
    return { key: c.key, label: c.label, pct: isFinite(pct) ? pct : 0 };
  });

  rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return rows;
}

/**
 * Project the full emission schedule over the 100M block lifetime.
 *
 * Samples nSamples evenly-spaced block heights across [0, EXPECTED_TOTAL_BLOCKS],
 * computing blockReward at each sample using the CURRENT activity and decentralization
 * factor settings (held constant) while supplyDecay varies as emission accumulates.
 *
 * Answers: "given these market conditions freeze in place, what does the reward curve
 * and supply schedule look like for the entire network lifetime?"
 *
 * Returned shape per point:
 *   block          — target block height at this sample (0 → EXPECTED_TOTAL_BLOCKS)
 *   blockReward    — BLOCK per block at this emission level (quadratic supplyDecay^2 applied)
 *   totalEmitted   — cumulative BLOCK minted up to this point
 *   annualIssuance — blockReward × BLOCKS_PER_YEAR
 *   inflationBps   — annualIssuance / totalEmitted × 10_000 (0 at genesis)
 *   supplyDecay    — the quadratic decay factor (0.05 floor) at this sample
 *
 * Performance: 200 samples × computeIssuance() < 1ms. Safe to call on the 150ms
 * debounce tick from EconomicsSimulator.updateOutputs().
 *
 * The "You are here" cursor in renderCharts() finds the sample index where
 * totalEmitted >= inputs.emission and draws a vertical dashed line at that x.
 *
 * @param {object} inputs    current EconomicsSimulator inputs (all fields used)
 * @param {number} nSamples  number of data points (default 200)
 */
export function projectEmissionSchedule(inputs, nSamples = 200) {
  const { maxSupply } = inputs;
  const totalBlocks   = CONSTANTS.EXPECTED_TOTAL_BLOCKS;
  const blocksPerYear = CONSTANTS.BLOCKS_PER_YEAR;

  const points = [];
  let cumEmission = 0;

  for (let i = 0; i <= nSamples; i++) {
    const targetBlock = Math.round((i / nSamples) * totalBlocks);

    // Hold all inputs constant except emission, so only supplyDecay varies.
    // This isolates the decay curve from ephemeral activity/decentralization noise.
    const sample = computeIssuance({ ...inputs, emission: cumEmission });

    const annualIssuance = sample.blockReward * blocksPerYear;
    const inflationBps = cumEmission > 0
      ? (annualIssuance / cumEmission) * 10_000
      : 0;

    points.push({
      block:         targetBlock,
      blockReward:   sample.blockReward,
      totalEmitted:  cumEmission,
      annualIssuance,
      inflationBps,
      supplyDecay:   sample.supplyDecay,
    });

    // Advance emission: reward × blocks in this interval.
    // Linear approximation over each ~500k-block interval (200 samples / 100M blocks);
    // error is negligible compared to the decay slope at that scale.
    if (i < nSamples) {
      const nextBlock   = Math.round(((i + 1) / nSamples) * totalBlocks);
      const blocksToNext = nextBlock - targetBlock;
      cumEmission = Math.min(
        cumEmission + sample.blockReward * blocksToNext,
        maxSupply * 0.9999,
      );
    }
  }

  return points;
}

/**
 * Fetch live data from chain using correct RPCs.
 * Shared by Simulator and Control Laws.
 */
export async function fetchLiveInputs(rpc) {
    const [governorStatus, blockHeightResp, adReadinessResp] = await Promise.all([
        rpc.getGovernorStatus(),
        rpc.getBlockHeight(),
        rpc.getAdReadiness({}).catch(() => null),
    ]);

    const currentHeight = blockHeightResp?.height ?? 0;
    
    // Receipt audit: robust scan
    // 1. Try filtered by market='epoch_economics'
    // 2. Fallback to unfiltered with larger limit
    const auditArgsBase = {
        start_height: Math.max(0, currentHeight - CONSTANTS.EPOCH_BLOCKS * 10),
        end_height: currentHeight,
        limit: 64,
    };

    let epochReceipt = null;

    // Pass 1: filtered
    try {
        const resp = await rpc.call('receipt.audit', { ...auditArgsBase, market: 'epoch_economics' });
        if (resp && resp.receipts) {
            // Find newest
             for (let i = resp.receipts.length - 1; i >= 0; i--) {
                const r = resp.receipts[i];
                if (r?.receipt_type === 'epoch_economics' || r?.receipt_type === 'EpochEconomics' || r?.receipt?.epoch !== undefined) {
                    epochReceipt = r.receipt ?? r;
                    break;
                }
            }
        }
    } catch (e) {
        // ignore
    }

    // Pass 2: unfiltered if needed
    if (!epochReceipt) {
        try {
            const resp = await rpc.call('receipt.audit', auditArgsBase);
             if (resp && resp.receipts) {
                 for (let i = resp.receipts.length - 1; i >= 0; i--) {
                    const r = resp.receipts[i];
                    if (r?.receipt_type === 'epoch_economics' || r?.receipt_type === 'EpochEconomics' || r?.receipt?.epoch !== undefined) {
                        epochReceipt = r.receipt ?? r;
                        break;
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }

    // ── Ad Market Quality: derive F/P/R from AdReadinessSnapshot ──────────────────────────
    // Source: node/src/ad_readiness.rs — AdReadinessSnapshot + AdSegmentReadiness structs.
    //
    // F (Freshness ppm):
    //   Weighted average of freshness_histogram across all presence buckets.
    //   Weights model proof-age decay: <1h=1.00×, 1–6h=0.75×, 6–24h=0.40×, >24h=0.10×
    //   Histogram bins are ppm-scaled; each bucket's weighted score ∈ [100_000, 1_000_000].
    //   Field: segment_readiness.presence_buckets[id].freshness_histogram.*
    //
    // P (Privacy ppm):
    //   Remaining privacy budget fraction. 1_000_000 = fully available; 0 = exhausted.
    //   Field: segment_readiness.privacy_budget.remaining_ppm
    //
    // R (Readiness ppm):
    //   Mean cohort utilization score (primary).
    //   Field: utilization_summary.mean_ppm
    //   Fallback: ready_streak_windows / GATE_STREAK_MIN clamped to [0, 1_000_000].
    //
    // All three are null when the RPC fails or the node doesn't expose ad readiness yet.
    // Null values are skipped in syncFromChain(), preserving existing slider defaults.
    const adReadiness = adReadinessResp ?? {};
    let adFreshnessPpm = null;
    let adPrivacyPpm   = null;
    let adReadinessPpm = null;

    const segReady = adReadiness.segment_readiness ?? null;

    // F — weighted freshness histogram across all presence buckets
    if (segReady?.presence_buckets && Object.keys(segReady.presence_buckets).length > 0) {
        const buckets = Object.values(segReady.presence_buckets);
        let sumF = 0, countF = 0;
        for (const b of buckets) {
            const h      = b.freshness_histogram ?? {};
            const under1h = typeof h.under_1h_ppm      === 'number' ? h.under_1h_ppm      : 0;
            const h1to6   = typeof h.hours_1_to_6_ppm  === 'number' ? h.hours_1_to_6_ppm  : 0;
            const h6to24  = typeof h.hours_6_to_24_ppm === 'number' ? h.hours_6_to_24_ppm : 0;
            const over24  = typeof h.over_24h_ppm      === 'number' ? h.over_24h_ppm      : 0;
            sumF   += under1h * 1.00 + h1to6 * 0.75 + h6to24 * 0.40 + over24 * 0.10;
            countF += 1;
        }
        if (countF > 0) adFreshnessPpm = Math.round(sumF / countF);
    }

    // P — privacy budget remaining
    if (typeof segReady?.privacy_budget?.remaining_ppm === 'number') {
        adPrivacyPpm = segReady.privacy_budget.remaining_ppm;
    }

    // R — mean cohort utilization (primary) or streak-derived (fallback)
    if (typeof adReadiness.utilization_summary?.mean_ppm === 'number') {
        adReadinessPpm = adReadiness.utilization_summary.mean_ppm;
    } else if (typeof adReadiness.ready_streak_windows === 'number') {
        adReadinessPpm = Math.round(
            Math.min(1, adReadiness.ready_streak_windows / CONSTANTS.GATE_STREAK_MIN) * 1_000_000
        );
    }

    return {
        governorStatus,
        blockHeight: currentHeight,
        epochReceipt,
        // Ad Market Quality — null when RPC unavailable; syncFromChain() skips nulls.
        adFreshnessPpm,
        adPrivacyPpm,
        adReadinessPpm,
        adReadinessRaw: adReadiness,
    };
}

/**
 * Fetch and normalize the ad readiness snapshot from the node.
 *
 * Tries the schema-stable `ad_market.readiness` (raw AdReadinessSnapshot) first,
 * then falls back to `ad_market.readiness_enriched` for older nodes that haven't
 * been updated yet.  Both paths return the same normalized shape so consumers
 * never need to branch.
 *
 * Normalization guarantees:
 *   - Every field the UI reads is present (defaults to 0 / [] / null).
 *   - `segment_readiness` is always an object (never undefined).
 *   - Works identically with the real RpcClient and MockRpcClient.
 *
 * Returns null when the RPC is unavailable or the handle is disabled on the node.
 *
 * @param {object} rpc - RpcClient or MockRpcClient instance
 * @returns {Promise<AdReadinessSnapshot|null>}
 */
export async function fetchAdReadiness(rpc) {
    if (!rpc || typeof rpc.call !== 'function') return null;

    // Prefer the canonical raw snapshot; enriched kept for side-effects on older nodes.
    const candidates = ['ad_market.readiness', 'ad_market.readiness_enriched'];

    for (const method of candidates) {
        try {
            const out  = await rpc.call(method, []);
            // MockRpcClient returns the object directly; RpcClient wraps in {result}.
            const snap = out?.result ?? out;

            // Guard: node returned {status:"unavailable"} — handle not enabled.
            if (!snap || snap.status === 'unavailable') continue;

            // Normalize into a stable shape the UI can consume without null checks.
            const seg = snap.segment_readiness ?? {};
            return {
                // Core readiness fields
                window_secs:          snap.window_secs          ?? 0,
                min_unique_viewers:   snap.min_unique_viewers   ?? 0,
                min_host_count:       snap.min_host_count       ?? 0,
                min_provider_count:   snap.min_provider_count   ?? 0,
                unique_viewers:       snap.unique_viewers       ?? 0,
                host_count:           snap.host_count           ?? 0,
                provider_count:       snap.provider_count       ?? 0,
                ready:                Boolean(snap.ready),
                blockers:             Array.isArray(snap.blockers) ? snap.blockers : [],
                last_updated:         snap.last_updated         ?? 0,
                // Economic extras
                total_usd_micros:         snap.total_usd_micros         ?? 0,
                settlement_count:         snap.settlement_count         ?? 0,
                price_usd_micros:         snap.price_usd_micros         ?? 0,
                market_price_usd_micros:  snap.market_price_usd_micros  ?? 0,
                cohort_utilization:       Array.isArray(snap.cohort_utilization) ? snap.cohort_utilization : [],
                utilization_summary:      snap.utilization_summary ?? null,
                ready_streak_windows:     snap.ready_streak_windows ?? 0,
                // F/P/R block — always an object so callers can safely do .segment_readiness.X
                segment_readiness: {
                    domain_tiers:     seg.domain_tiers     ?? {},
                    interest_tags:    seg.interest_tags    ?? {},
                    presence_buckets: seg.presence_buckets ?? {},
                    privacy_budget:   seg.privacy_budget   ?? null,
                },
            };
        } catch (_) {
            // Method unavailable on this node — try next candidate.
        }
    }

    return null;
}

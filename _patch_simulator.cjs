#!/usr/bin/env node
// _patch_simulator.cjs — run from block-buster root: node _patch_simulator.cjs
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'web/src/components/EconomicsSimulator.js');
let src = fs.readFileSync(FILE, 'utf8');
const original = src;

// ── Patch 3: Replace computeOutputs() with engine delegation ───────────────────────────────
const newComputeOutputs = `  computeOutputs() {
    // Delegate all formula math to the shared EconomicsEngine.
    // EconomicsEngine is the single source of truth for:
    //   - activityMultiplier (cbrt geometric mean, ppm-clamped)
    //   - decentralization   (integer-sqrt ppm, clamped [0.5, 2.0])
    //   - supplyDecay        (quadratic (remaining/max)^2, floored at 0.05)
    //   - blockReward, annualIssuance, inflationBps, inflationDelta
    const issuance = computeIssuance(this.inputs);
    const gates    = evaluateGates(this.inputs);

    const utilPct   = this.inputs.utilizationPpm / 10_000;
    const marginPct = this.inputs.providerMarginPpm / 10_000;

    // Gate window: how many governor windows fit in one epoch?
    // At default windowSecs=240, EPOCH_BLOCKS=120 => floor(120/240)=0 => max(1,0)=1
    const windowSecs     = Math.max(this.inputs.windowSecs, 1);
    const requiredStreak = Math.max(1, Math.floor(CONSTANTS.EPOCH_BLOCKS / windowSecs));

    return {
      ...issuance,
      // decentrPpm: integer ppm value for the bar label (matches governor.status reporting)
      decentrPpm:    Math.round(issuance.decentralization * 1_000_000),
      remainingRatio: Math.max(0, (this.inputs.maxSupply - this.inputs.emission) / this.inputs.maxSupply),
      gateReady:     gates.status === 'READY',
      utilPct,
      marginPct,
      requiredStreak,
      minUtilPct:  CONSTANTS.GATE_UTILIZATION_MIN * 100,
      maxUtilPct:  95.0,
      minMarginPct: CONSTANTS.GATE_MARGIN_MIN * 100,
      maxMarginPct: 300.0,
    };
  }

  updateOutputs`;

src = src.replace(
  /  computeOutputs\(\)[\s\S]*?\n\n  updateOutputs/,
  newComputeOutputs
);
if (src === original) { console.error('FAIL: computeOutputs not matched'); process.exit(1); }
console.log('Patch 3 (computeOutputs -> engine): OK');

const after3 = src;

// ── Patch 4: Fix this.X_PPM refs in updateOutputs ───────────────────────────────────────────
src = src
  .replace(/this\.ACTIVITY_MAX_PPM/g, 'CONSTANTS.ACTIVITY_MAX_PPM')
  .replace(/this\.ACTIVITY_MIN_PPM/g, 'CONSTANTS.ACTIVITY_MIN_PPM')
  .replace(/this\.DECENTR_MAX_PPM/g,  'CONSTANTS.DECENTR_MAX_PPM')
  .replace(/this\.DECENTR_MIN_PPM/g,  'CONSTANTS.DECENTR_MIN_PPM')
  .replace(/this\.SUPPLY_DECAY_FLOOR/g, 'CONSTANTS.SUPPLY_DECAY_FLOOR')
  .replace(/this\.EXPECTED_TOTAL_BLOCKS/g, 'CONSTANTS.EXPECTED_TOTAL_BLOCKS')
  .replace(/this\.BLOCKS_PER_YEAR/g,   'CONSTANTS.BLOCKS_PER_YEAR')
  .replace(/this\.EPOCH_BLOCKS/g,      'CONSTANTS.EPOCH_BLOCKS');
if (src === after3) { console.log('Patch 4: no this.X refs remaining (already clean)'); }
else { console.log('Patch 4 (this.CONSTANTS -> CONSTANTS): OK'); }

const after4 = src;

// ── Patch 5: Replace syncFromChain() try block to use fetchLiveInputs ───────────────────
const newSyncTry = `    try {
      // Delegate to EconomicsEngine.fetchLiveInputs which handles:
      //   1. governor.status + consensus.block_height (parallel)
      //   2. receipt.audit: pass 1 filtered, pass 2 unfiltered (limit=64, 10-epoch window)
      const { governorStatus, blockHeight, epochReceipt } = await fetchLiveInputs(this.rpc);

      this._mapChainToInputs(governorStatus, { height: blockHeight }, epochReceipt);
      this._simulated = false; // success — live chain data loaded

      const badge = document.getElementById('econlab-sim-badge');
      if (badge) badge.style.display = 'none';

      this.refreshSliders();
      this.updateOutputs();
    } catch (err) {
      console.warn('[EconomicsSimulator] Chain sync failed, falling back to mock:', err?.message);
      this.syncFromMock();
    }`;

// Match the old try block: from "    try {" inside syncFromChain through the catch
const syncTryMatch = src.match(/(    try \{[\s\S]*?this\._mapChainToInputs\(governorStatus, blockHeightResp, epochReceipt\)[\s\S]*?\}\s*\} catch \(err\) \{[\s\S]*?this\.syncFromMock\(\);\s*\})/m);
if (!syncTryMatch) {
  console.log('Patch 5: syncFromChain try block not matched — may already be patched, skipping');
} else {
  src = src.replace(syncTryMatch[0], newSyncTry);
  console.log('Patch 5 (syncFromChain -> fetchLiveInputs): OK');
}

// ── Write back ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, src, 'utf8');
console.log('Done. Final length:', src.length);

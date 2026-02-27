#!/usr/bin/env node
// _patch_simulator.js
// Patches EconomicsSimulator.js to use EconomicsEngine.js
// Run once from block-buster root: node web/src/_patch_simulator.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'components/EconomicsSimulator.js');
let src = fs.readFileSync(FILE, 'utf8');
const original = src;

// ── Patch 3: Replace computeOutputs() with engine delegation ──────────────────────────────────
// Match from start of method to the closing brace right before updateOutputs
const newComputeOutputs = `  computeOutputs() {
    // Delegate all formula math to the shared EconomicsEngine.
    // EconomicsEngine is the single source of truth for:
    //   - activityMultiplier (cbrt geometric mean, ppm-clamped)
    //   - decentralization (integer-sqrt ppm, clamped)
    //   - supplyDecay (quadratic, floored)
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
      // decentrPpm: raw integer ppm value shown in the bar label
      // Engine returns decentralization as decimal; multiply back for display
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

// Replace computeOutputs through to the start of updateOutputs
src = src.replace(
  /  computeOutputs\(\)[\s\S]*?\n\n  updateOutputs/,
  newComputeOutputs
);

if (src === original) {
  console.error('ERROR: computeOutputs patch did not match — check file content');
  process.exit(1);
}
console.log('Patch 3 (computeOutputs): OK');

// ── Patch 4: Fix this.ACTIVITY_MAX_PPM etc in updateOutputs ───────────────────────────────────
src = src
  .replace(/this\.ACTIVITY_MAX_PPM/g, 'CONSTANTS.ACTIVITY_MAX_PPM')
  .replace(/this\.ACTIVITY_MIN_PPM/g, 'CONSTANTS.ACTIVITY_MIN_PPM')
  .replace(/this\.DECENTR_MAX_PPM/g,  'CONSTANTS.DECENTR_MAX_PPM')
  .replace(/this\.DECENTR_MIN_PPM/g,  'CONSTANTS.DECENTR_MIN_PPM')
  .replace(/this\.SUPPLY_DECAY_FLOOR/g, 'CONSTANTS.SUPPLY_DECAY_FLOOR')
  .replace(/this\.EXPECTED_TOTAL_BLOCKS/g, 'CONSTANTS.EXPECTED_TOTAL_BLOCKS')
  .replace(/this\.BLOCKS_PER_YEAR/g,   'CONSTANTS.BLOCKS_PER_YEAR')
  .replace(/this\.EPOCH_BLOCKS/g,      'CONSTANTS.EPOCH_BLOCKS');
console.log('Patch 4 (CONSTANTS refs): OK');

// ── Patch 5: Replace syncFromChain() try block to use fetchLiveInputs ─────────────────────────
const oldSyncTry = `    try {
      // ── 1. governor.status + block height in parallel ──
      const [governorStatus, blockHeightResp] = await Promise.all([
        this.rpc.getGovernorStatus(),  // governor.status
        this.rpc.getBlockHeight(),     // consensus.block_height
      ]);

      // ── 2. Best-effort: latest EpochEconomicsReceipt via receipt.audit ──
      // Scan a 10-epoch trailing window (1,200 blocks at default EPOCH_BLOCKS=120).
      // receipt.audit is sorted block_height ASC; walk newest-first to find epoch receipt.
      // Silent failure — not fatal if endpoint not yet active on the node.
      let epochReceipt = null;
      try {
        const currentHeight = blockHeightResp?.height ?? 0;
        const scanStart     = Math.max(0, currentHeight - this.EPOCH_BLOCKS * 10);
        const auditResp     = await this.rpc.call('receipt.audit', {
          start_height: scanStart,
          end_height:   currentHeight,
          limit:        5,
        });
        const receipts = Array.isArray(auditResp?.receipts) ? auditResp.receipts : [];
        for (let i = receipts.length - 1; i >= 0; i--) {
          const r = receipts[i];
          // EpochEconomicsReceipt: probe both snake_case and PascalCase receipt_type names
          if (
            r?.receipt_type === 'epoch_economics' ||
            r?.receipt_type === 'EpochEconomics'  ||
            r?.receipt?.epoch !== undefined
          ) {
            epochReceipt = r.receipt ?? r;
            break;
          }
        }
      } catch (_auditErr) {
        console.info('[EconomicsSimulator] receipt.audit probe failed (expected on pre-receipts node builds)');
      }

      this._mapChainToInputs(governorStatus, blockHeightResp, epochReceipt);
      this._simulated = false; // success
      
      const badge = document.getElementById('econlab-sim-badge');
      if (badge) badge.style.display = 'none';

      this.refreshSliders();
      this.updateOutputs();
    } catch (err) {
      console.warn('[EconomicsSimulator] Chain sync failed:', err);
      this.syncFromMock();
    }`;

const newSyncTry = `    try {
      // Delegate to EconomicsEngine.fetchLiveInputs which handles:
      //   1. governor.status + consensus.block_height (parallel)
      //   2. receipt.audit: pass 1 filtered, pass 2 unfiltered (64 receipts, 10-epoch window)
      const { governorStatus, blockHeight, epochReceipt } = await fetchLiveInputs(this.rpc);

      this._mapChainToInputs(governorStatus, { height: blockHeight }, epochReceipt);
      this._simulated = false; // success — real chain data

      const badge = document.getElementById('econlab-sim-badge');
      if (badge) badge.style.display = 'none';

      this.refreshSliders();
      this.updateOutputs();
    } catch (err) {
      console.warn('[EconomicsSimulator] Chain sync failed, falling back to mock:', err?.message);
      this.syncFromMock();
    }`;

if (!src.includes(oldSyncTry.slice(0, 60))) {
  console.error('ERROR: syncFromChain try block not found — skipping patch 5');
} else {
  src = src.replace(oldSyncTry, newSyncTry);
  console.log('Patch 5 (syncFromChain fetchLiveInputs): OK');
}

// ── Write back ─────────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, src, 'utf8');
console.log('All patches written. Final length:', src.length);

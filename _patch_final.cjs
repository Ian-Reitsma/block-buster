#!/usr/bin/env node
// _patch_final.cjs — run from block-buster root
const fs = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────────────────────────────
const SIM_FILE = path.join(__dirname, 'web/src/components/EconomicsSimulator.js');
let sim = fs.readFileSync(SIM_FILE, 'utf8');
const simOrig = sim;

// Patch SIM-1: Replace the inline syncFromChain try block with fetchLiveInputs delegation.
// The current try block in syncFromChain does its own governor+blockHeight+audit fetching.
// We replace the ENTIRE try block (from 'try {' to the matching 'catch') with fetchLiveInputs.
//
// Strategy: match from the line with '// ── 1. governor.status' (unique anchor)
// through to the catch block close.
const simSyncAnchor = `      // ── 1. governor.status + block height in parallel ──`;
if (!sim.includes(simSyncAnchor)) {
  console.log('SIM-1: anchor not found — syncFromChain may already be patched. Skipping.');
} else {
  // Find the 'try {' that immediately precedes the anchor
  const tryIdx = sim.lastIndexOf('    try {', sim.indexOf(simSyncAnchor));
  if (tryIdx < 0) { console.error('SIM-1: could not find try { before anchor'); process.exit(1); }

  // Find the end of the outer catch block after this try
  // The catch closes with: this.syncFromMock();\n    }\n  }
  // Walk forward from tryIdx to find 'this.syncFromMock();' then the next two '}'s
  const catchClose = '      this.syncFromMock();\n    }';
  const catchCloseIdx = sim.indexOf(catchClose, tryIdx);
  if (catchCloseIdx < 0) { console.error('SIM-1: could not find catch close'); process.exit(1); }
  const endIdx = catchCloseIdx + catchClose.length;

  const oldBlock = sim.slice(tryIdx, endIdx);
  const newBlock = `    try {
      // Delegate to EconomicsEngine.fetchLiveInputs which handles:
      //   1. governor.status + consensus.block_height (parallel)
      //   2. receipt.audit pass 1: filtered by market='epoch_economics'
      //   3. receipt.audit pass 2: unfiltered limit=64 (fallback for older node builds)
      // All three silent-fail individually — epochReceipt may be null on pre-receipts nodes.
      const { governorStatus, blockHeight, epochReceipt } = await fetchLiveInputs(this.rpc);

      // Map chain response onto flat simulator inputs
      const mapped = this._mapChainToInputs(governorStatus, { height: blockHeight }, epochReceipt);
      this.inputs     = { ...this.inputs, ...mapped };
      this._simulated = false; // success — live chain data

      this.refreshSliders();
      this.updateOutputs();
      const badge = document.getElementById('econlab-sim-badge');
      if (badge) badge.style.display = 'none';
    } catch (err) {
      console.warn('[EconomicsSimulator] Chain sync failed, falling back to mock:', err?.message);
      this.syncFromMock();
    }`;

  sim = sim.slice(0, tryIdx) + newBlock + sim.slice(endIdx);
  console.log('SIM-1 (syncFromChain -> fetchLiveInputs): OK');
}

if (sim !== simOrig) {
  fs.writeFileSync(SIM_FILE, sim, 'utf8');
  console.log('EconomicsSimulator.js written. Length:', sim.length);
}

// ────────────────────────────────────────────────────────────────────────────────
const CL_FILE = path.join(__dirname, 'web/src/components/EconomicControlLaws.js');
let cl = fs.readFileSync(CL_FILE, 'utf8');
const clOrig = cl;

// Patch CL-A: Replace the receipt.audit block in _fetchChainData.
// Anchor: the comment line starting the audit block (unique in file).
const clAuditAnchor = `    // ── Best-effort: latest EpochEconomicsReceipt via receipt.audit ──`;
if (!cl.includes(clAuditAnchor)) {
  // Could be using the box chars ── vs literal dashes
  console.log('CL-A: checking raw index...');
  console.log('  indexOf result:', cl.indexOf('Best-effort: latest EpochEconomicsReceipt'));
}

if (cl.includes('limit:        5,')) {
  // Find the anchor for the audit comment
  const auditStart = cl.lastIndexOf(clAuditAnchor);
  if (auditStart < 0) {
    console.error('CL-A: comment anchor not found with box chars — trying plain text search');
    process.exit(1);
  }
  // Find 'this.simulated = false;' after the audit block — that's right after the block closes
  const afterAudit = cl.indexOf('\n    this.simulated = false;', auditStart);
  if (afterAudit < 0) { console.error('CL-A: could not find end of audit block'); process.exit(1); }

  const oldAuditBlock = cl.slice(auditStart, afterAudit);
  const newAuditBlock = `    // ── Best-effort: latest EpochEconomicsReceipt via receipt.audit ──
    // Two-pass robust scan (receipt.audit docs: apis_and_tooling.md):
    //   Pass 1: filtered by market='epoch_economics' (fast path; if node supports filter)
    //   Pass 2: unfiltered limit=64, 10-epoch window (fallback for older node builds)
    // Sorted block_height ASC — walk newest-first. Silent on any failure.
    let epochReceipt = null;
    const currentHeight = blockHeightResp?.height ?? 0;
    const _auditBase = {
      start_height: Math.max(0, currentHeight - EPOCH_BLOCKS * 10),
      end_height:   currentHeight,
      limit:        64,  // was 5 — increased to reliably capture epoch boundary receipts
    };
    const _findEpoch = (receipts) => {
      for (let i = (receipts || []).length - 1; i >= 0; i--) {
        const r = receipts[i];
        if (
          r?.receipt_type === 'epoch_economics' ||
          r?.receipt_type === 'EpochEconomics'  ||
          r?.receipt?.epoch !== undefined
        ) return r.receipt ?? r;
      }
      return null;
    };
    // Pass 1: filtered by market (fast if supported by this node build)
    try {
      const auditResp = await this.rpc.call('receipt.audit', { ..._auditBase, market: 'epoch_economics' });
      epochReceipt = _findEpoch(auditResp?.receipts);
    } catch (_) { /* market filter not supported on this build — fall through */ }
    // Pass 2: unfiltered (covers all node versions)
    if (!epochReceipt) {
      try {
        const auditResp = await this.rpc.call('receipt.audit', _auditBase);
        epochReceipt = _findEpoch(auditResp?.receipts);
      } catch (_auditErr) {
        console.info('[EconomicControlLaws] receipt.audit not yet available on this node');
      }
    }`;

  cl = cl.slice(0, auditStart) + newAuditBlock + cl.slice(afterAudit);
  console.log('CL-A (two-pass receipt.audit): OK');
} else {
  console.log('CL-A: limit:5 not found — audit block may already be patched. Skipping.');
}

if (cl !== clOrig) {
  fs.writeFileSync(CL_FILE, cl, 'utf8');
  console.log('EconomicControlLaws.js written. Length:', cl.length);
} else {
  console.log('EconomicControlLaws.js: no changes.');
}

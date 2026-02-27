#!/usr/bin/env node
// _patch_controlLaws.cjs — run from block-buster root: node _patch_controlLaws.cjs
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'web/src/components/EconomicControlLaws.js');
let src = fs.readFileSync(FILE, 'utf8');
const original = src;

// ── Patch A: Two-pass receipt.audit (limit 5 -> 64) ────────────────────────────────────────────
const newAuditBlock = `    // ── Best-effort: latest EpochEconomicsReceipt via receipt.audit ──
    // Two-pass robust scan:
    //   Pass 1: filtered by market='epoch_economics' (if node supports filter param)
    //   Pass 2: unfiltered with limit=64 over 10-epoch window (fallback)
    // receipt.audit is sorted block_height ASC; walk newest-first.
    // Silent on failure — not active on all node versions.
    let epochReceipt = null;
    const currentHeight = blockHeightResp?.height ?? 0;
    const _auditBase = {
      start_height: Math.max(0, currentHeight - EPOCH_BLOCKS * 10),
      end_height:   currentHeight,
      limit:        64,
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
    // Pass 1: filtered
    try {
      const auditResp = await this.rpc.call('receipt.audit', { ..._auditBase, market: 'epoch_economics' });
      epochReceipt = _findEpoch(auditResp?.receipts);
    } catch (_) { /* filter param not supported on this build — fall through */ }
    // Pass 2: unfiltered
    if (!epochReceipt) {
      try {
        const auditResp = await this.rpc.call('receipt.audit', _auditBase);
        epochReceipt = _findEpoch(auditResp?.receipts);
      } catch (_auditErr) {
        console.info('[EconomicControlLaws] receipt.audit not yet available on this node');
      }
    }`;

// Match: old audit block starts with a comment and ends before closing _fetchChainData paren
const auditMatch = src.match(/(    \/\/ ── Best-effort: latest EpochEconomicsReceipt via receipt\.audit ──[\s\S]*?\}\s*\}\s*\n\n    this\.simulated = false)/m);
if (!auditMatch) {
  console.error('FAIL: receipt.audit block not matched in EconomicControlLaws.js');
  // Debug: show the range where it should be
  const idx = src.indexOf('Best-effort: latest EpochEconomicsReceipt');
  console.log('  Searching near index', idx, ':', idx > 0 ? src.slice(idx, idx + 200) : 'not found');
} else {
  // Replace everything from the start of the comment up to (but not including) 'this.simulated = false'
  const oldBlock = auditMatch[0].replace(/\n\n    this\.simulated = false$/, '');
  src = src.replace(oldBlock, newAuditBlock);
  console.log('Patch A (two-pass receipt.audit): OK');
}

// ── Patch B: this.data.simulated → this.simulated in renderOverallHealth ────────────────────
if (!src.includes('this.data.simulated')) {
  console.log('Patch B (badge fix): already correct — skipping');
} else {
  src = src
    .replace(
      `badge.textContent = 'Simulated economics (node does not expose economics.* RPC)';`,
      `badge.textContent = 'Simulated economics (mock fallback \u2014 chain receipts/governor metrics unavailable)';`
    )
    .replace(/this\.data\.simulated/g, 'this.simulated');
  console.log('Patch B (this.data.simulated -> this.simulated): OK');
}

// ── Patch C: Add _updateSimBadge() before onMount ───────────────────────────────────────────
if (src.includes('_updateSimBadge')) {
  console.log('Patch C (_updateSimBadge): already present — skipping');
} else {
  src = src.replace(
    `  async onMount() {`,
    `  // Keep the simulated pill in sync across all data refresh cycles.
  // Call after every fetchData() — initial mount AND the 5s polling interval.
  _updateSimBadge() {
    const badge = document.getElementById('econ-sim-badge');
    if (badge) badge.style.display = this.simulated ? 'inline-flex' : 'none';
  }

  async onMount() {`
  );
  console.log('Patch C (_updateSimBadge method added): OK');
}

// ── Patch D: Wire _updateSimBadge into onMount ──────────────────────────────────────────────
const oldOnMountBadge = `    const badge = $('#econ-sim-badge');
    if (badge) {
      badge.style.display = this.simulated ? 'inline-flex' : 'none';
    }`;
if (!src.includes(oldOnMountBadge.slice(0, 36))) {
  console.log('Patch D (onMount badge): pattern not found — may already be patched or differs');
} else {
  src = src.replace(oldOnMountBadge, `    this._updateSimBadge();`);
  console.log('Patch D (onMount -> _updateSimBadge): OK');
}

// ── Patch E: Wire _updateSimBadge into 5s interval ────────────────────────────────────────────
const oldInterval = `    this.interval(async () => {
      this.data = await this.fetchData();
      this.renderOverallHealth();`;
const newInterval = `    this.interval(async () => {
      this.data = await this.fetchData();
      this._updateSimBadge();
      this.renderOverallHealth();`;
if (!src.includes(oldInterval.slice(0, 50))) {
  console.log('Patch E (interval): pattern not found — may already be patched or differs');
} else {
  src = src.replace(oldInterval, newInterval);
  console.log('Patch E (interval -> _updateSimBadge): OK');
}

// ── Write back ─────────────────────────────────────────────────────────────────────────────────
if (src === original) {
  console.error('WARNING: No patches applied — source unchanged');
} else {
  fs.writeFileSync(FILE, src, 'utf8');
  console.log('Done. Final length:', src.length);
}

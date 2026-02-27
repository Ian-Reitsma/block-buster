#!/usr/bin/env node
// _patch_controlLaws.js
// Patches EconomicControlLaws.js:
//   1. Replace receipt.audit block: limit 5 -> 64, add two-pass filtered+unfiltered
//   2. Fix this.data.simulated -> this.simulated in renderOverallHealth
//   3. Add _updateSimBadge() and wire into onMount + interval
// Run once from block-buster root: node web/src/_patch_controlLaws.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'components/EconomicControlLaws.js');
let src = fs.readFileSync(FILE, 'utf8');
const original = src;

// ── Patch A: Two-pass receipt.audit (limit 5 -> 64, filtered+unfiltered) ─────────────────────
const oldAuditBlock = `    // ── Best-effort: latest EpochEconomicsReceipt via receipt.audit ──
    // Scans trailing 10-epoch window newest-first for an epoch_economics receipt.
    // Silent on failure — receipt.audit may not be active on all node versions yet.
    let epochReceipt = null;
    try {
      const currentHeight = blockHeightResp?.height ?? 0;
      const auditResp = await this.rpc.call('receipt.audit', {
        start_height: Math.max(0, currentHeight - EPOCH_BLOCKS * 10),
        end_height:   currentHeight,
        limit:        5,
      });
      const receipts = Array.isArray(auditResp?.receipts) ? auditResp.receipts : [];
      for (let i = receipts.length - 1; i >= 0; i--) {
        const r = receipts[i];
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
      console.info('[EconomicControlLaws] receipt.audit not yet available on this node');
    }`;

const newAuditBlock = `    // ── Best-effort: latest EpochEconomicsReceipt via receipt.audit ──
    // Two-pass robust scan:
    //   Pass 1: filtered by market='epoch_economics' (fast, if node supports filter param)
    //   Pass 2: unfiltered, limit=64 over 10-epoch window (fallback for older node builds)
    // receipt.audit is sorted block_height ASC; walk newest-first for the epoch receipt.
    // Silent on failure — not active on all node versions.
    let epochReceipt = null;
    const currentHeight = blockHeightResp?.height ?? 0;
    const _auditBase = {
      start_height: Math.max(0, currentHeight - EPOCH_BLOCKS * 10),
      end_height:   currentHeight,
      limit:        64,
    };
    const _findEpochReceipt = (receipts) => {
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
      epochReceipt = _findEpochReceipt(auditResp?.receipts);
    } catch (_) { /* not supported on this build — fall through */ }
    // Pass 2: unfiltered
    if (!epochReceipt) {
      try {
        const auditResp = await this.rpc.call('receipt.audit', _auditBase);
        epochReceipt = _findEpochReceipt(auditResp?.receipts);
      } catch (_auditErr) {
        console.info('[EconomicControlLaws] receipt.audit not yet available on this node');
      }
    }`;

if (!src.includes(oldAuditBlock.slice(0, 80))) {
  console.error('ERROR: receipt.audit block not found in EconomicControlLaws.js — skipping patch A');
} else {
  src = src.replace(oldAuditBlock, newAuditBlock);
  console.log('Patch A (two-pass receipt.audit): OK');
}

// ── Patch B: Fix this.data.simulated -> this.simulated in renderOverallHealth ──────────────────
const oldSimBadge = `    if (this.data.simulated) {
      const badge = document.createElement('div');
      badge.className = 'muted tiny';
      badge.textContent = 'Simulated economics (node does not expose economics.* RPC)';
      container.appendChild(badge);
    }`;

const newSimBadge = `    if (this.simulated) {
      const badge = document.createElement('div');
      badge.className = 'muted tiny';
      badge.textContent = 'Simulated economics (mock fallback — chain receipts/governor metrics unavailable)';
      container.appendChild(badge);
    }`;

if (!src.includes('this.data.simulated')) {
  console.log('Patch B (badge fix): already correct or not found — skipping');
} else {
  src = src.replace(oldSimBadge, newSimBadge);
  console.log('Patch B (this.data.simulated -> this.simulated): OK');
}

// ── Patch C: Add _updateSimBadge() method before onMount ───────────────────────────────────
if (src.includes('_updateSimBadge')) {
  console.log('Patch C (_updateSimBadge): already present — skipping');
} else {
  src = src.replace(
    `  async onMount() {`,
    `  // Keep the simulated pill in sync on every data refresh.
  // Must be called after every fetchData() — both initial mount and the 5s interval.
  _updateSimBadge() {
    const badge = document.getElementById('econ-sim-badge');
    if (badge) badge.style.display = this.simulated ? 'inline-flex' : 'none';
  }

  async onMount() {`
  );
  console.log('Patch C (_updateSimBadge method): OK');
}

// ── Patch D: Wire _updateSimBadge() into onMount ──────────────────────────────────────────
const oldOnMountBadge = `    const badge = $('#econ-sim-badge');
    if (badge) {
      badge.style.display = this.simulated ? 'inline-flex' : 'none';
    }`;

const newOnMountBadge = `    this._updateSimBadge();`;

if (!src.includes(oldOnMountBadge.slice(0, 40))) {
  console.log('Patch D (onMount badge wire): pattern not found — skipping');
} else {
  src = src.replace(oldOnMountBadge, newOnMountBadge);
  console.log('Patch D (onMount _updateSimBadge): OK');
}

// ── Patch E: Wire _updateSimBadge() into the 5s interval after fetchData ──────────────────
const oldInterval = `    this.interval(async () => {
      this.data = await this.fetchData();
      this.renderOverallHealth();`;

const newInterval = `    this.interval(async () => {
      this.data = await this.fetchData();
      this._updateSimBadge();
      this.renderOverallHealth();`;

if (!src.includes(oldInterval.slice(0, 50))) {
  console.log('Patch E (interval badge wire): pattern not found — skipping');
} else {
  src = src.replace(oldInterval, newInterval);
  console.log('Patch E (interval _updateSimBadge): OK');
}

// ── Write back ─────────────────────────────────────────────────────────────────────────────────
if (src === original) {
  console.error('WARNING: No patches applied — source unchanged');
} else {
  fs.writeFileSync(FILE, src, 'utf8');
  console.log('All patches written. Final length:', src.length);
}

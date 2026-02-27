/**
 * RPC Compatibility
 *
 * Purpose: Determine whether the connected node exposes expected methods,
 * and gate dashboard functionality (1% operator bar) when a node is missing
 * required surfaces.
 */

export const RPC_COMPAT = {
  // Minimal set required for the dashboard to be meaningful.
  REQUIRED_METHODS: [
    'consensus.block_height',
    'consensus.stats',
    'governor.status',
  ],

  // Feature-specific, used to disable specific panels/actions.
  OPTIONAL_METHODS: {
    energy: ['energy.market_state'],
    compute: ['compute_market.jobs'],
    storage: ['storage.list'],
    ad: ['ad_market.policy_snapshot'],
    dex: ['dex.order_book'],
    treasury: ['treasury.status'],
  },
};

/**
 * Probes JSON-RPC for method existence by calling a small set of safe methods.
 *
 * NOTE: JSON-RPC doesn't have a standard "list methods" call. We approximate by
 * calling each method and recording which ones return MethodNotFound.
 */
export async function probeRpcMethods(rpc, methods, timeoutMs = 2500) {
  const results = {};

  // Run sequentially to keep node load trivial and preserve easy debugging.
  for (const m of methods) {
    try {
      const p = rpc.call(m, []);
      const res = await Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('probe-timeout')), timeoutMs)),
      ]);
      results[m] = { ok: true, result: res };
    } catch (e) {
      const msg = String(e?.message || e);
      const code = e?.code;
      results[m] = { ok: false, code, message: msg };
    }
  }

  return results;
}

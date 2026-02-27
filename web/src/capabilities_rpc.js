export const REQUIRED_RPC_METHODS = [
  'consensus.block_height',
  'consensus.stats',
  'energy.market_state',
  'compute_market.jobs',
  'storage.list',
  'ad_market.policy_snapshot',
  'governor.status'
];

export const MUTATOR_METHODS = {
  // DEX / Trading
  'dex.place_order': { market: 'global', type: 'settlement' },

  // Compute Market
  'compute_market.submit_job': { market: 'compute', type: 'settlement' },
  'compute_market.cancel_job': { market: 'compute', type: 'mutation' },

  // Storage Market (matches component callsites)
  'storage.upload':           { market: 'storage', type: 'settlement' },
  'storage.extend_rent':      { market: 'storage', type: 'settlement' },
  'storage.bulk_extend_rent': { market: 'storage', type: 'settlement' },
  'storage.deposit_escrow':   { market: 'storage', type: 'settlement' },
  'storage.withdraw_escrow':  { market: 'storage', type: 'settlement' },
  'storage.delete':           { market: 'storage', type: 'mutation' },

  // Energy Market (matches component callsites)
  'energy.register_provider': { market: 'energy', type: 'mutation' },
  'energy.submit_reading':    { market: 'energy', type: 'mutation' },
  'energy.flag_dispute':      { market: 'energy', type: 'mutation' },
  'energy.resolve_dispute':   { market: 'energy', type: 'mutation' },
  'energy.settle':            { market: 'energy', type: 'settlement' },

  // Ad Market (matches component callsites)
  'ad_market.create_campaign': { market: 'ad', type: 'settlement' },
  'ad_market.submit_bid':      { market: 'ad', type: 'settlement' },
  'ad_market.pause_campaign':  { market: 'ad', type: 'mutation' },
  'ad_market.bulk_pause':      { market: 'ad', type: 'mutation' },

  // Governance (matches component callsites)
  'governance.create_proposal': { market: 'global', type: 'settlement' },
  'governance.vote':            { market: 'global', type: 'settlement' },

  // Treasury (matches component callsites)
  'treasury.create_disbursement': { market: 'global', type: 'settlement' },
  'treasury.approve':             { market: 'global', type: 'settlement' },
  'treasury.reject':              { market: 'global', type: 'mutation' },
};

export function getActionMetadata(method) {
  return MUTATOR_METHODS[method] || null;
}

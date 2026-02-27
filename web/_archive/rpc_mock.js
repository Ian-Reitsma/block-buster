/**
 * Mock RPC Client
 * Exposes the same async interface as RpcClient but serves data from MockDataManager
 * Enables components like EconomicControlLaws to use a single code path.
 */

export class RpcMock {
  constructor(mockDataManager) {
    this.mockMgr = mockDataManager;
    // RpcClient returns { result, error } wrapped responses for .call() and .batch()
    // Direct methods (getBlockHeight, etc) return unwrapped results or throw
  }

  // ── Generic Call Interface ────────────────────────────────────────────────────────
  async call(method, params = {}) {
    try {
      const result = await this._routeCall(method, params);
      return result; // Direct result, mirroring RpcClient.call returning json.result
    } catch (e) {
      throw e;
    }
  }

  async batch(calls) {
    // RpcClient.batch returns array of { result, error }
    return Promise.all(
      calls.map(async (c) => {
        try {
          const result = await this._routeCall(c.method, c.params?.[0] || {});
          return { result };
        } catch (error) {
          return { error: { message: error.message } };
        }
      })
    );
  }

  // Route methods to mock data
  async _routeCall(method, params) {
    const data = this.mockMgr.mockData;

    switch (method) {
      case 'receipt.audit': {
        // Find mocked epoch receipt from history
        const history = data.issuance?.history || [];
        const latest = history[history.length - 1];
        if (!latest) return { receipts: [] };

        const totalEmission = data.issuance?.total_emission ?? this.mockMgr.currentEmission ?? 3_200_000;

        return {
          receipts: [
            {
              block_height: this.mockMgr.currentBlock || 0,
              receipt_index: 0,
              receipt_type: 'epoch_economics',
              receipt: {
                epoch: latest.epoch,
                total_emission: totalEmission,
                next_block_reward_per_block: latest.reward,
                epoch_tx_count: latest.epoch_tx_count ?? 12_000,
                epoch_tx_volume_block: latest.epoch_tx_volume_block ?? 6_000,
                unique_miners: latest.unique_miners ?? 20,
                baseline_miners: latest.baseline_miners ?? 10,
              },
              // Mirror node's audit metadata surface so Layer 2 can render real splits.
              subsidies: {
                storage_sub: 12_500,
                read_sub: 8_200,
                read_sub_viewer: 3_000,
                read_sub_host: 2_500,
                read_sub_hardware: 800,
                read_sub_verifier: 600,
                read_sub_liquidity: 300,
                compute_sub: 9_100,
                ad_viewer: 4_400,
                ad_host: 3_200,
                ad_hardware: 1_100,
                ad_verifier: 900,
                ad_liquidity: 600,
                ad_miner: 2_100,
                proof_rebate: 500,
              },
            }
          ]
        };
      }
      case 'ad_market.policy_snapshot':
        return data.adPolicySnapshot || {};
      case 'ad_market.readiness':
        return data.adReadiness || {};
      default:
        return {};
    }
  }

  // ── Typed Helpers (Matching RpcClient) ──────────────────────────────────────────

  async getBlockHeight() {
    return {
      height: this.mockMgr.currentBlock || 1000000,
      finalized_height: (this.mockMgr.currentBlock || 1000000) - 2,
    };
  }

  async getGovernorStatus() {
    // Shape needed by EconomicControlLaws & EconomicsSimulator
    const adQ = this.mockMgr.mockData.adQuality || {};
    const eMkt = this.mockMgr.mockData.energyMarket || {};
    return {
      active_gates: 5,
      gates: {
        economics: { enter_streak: 8, streak: 8 }
      },
      economics_prev_market_metrics: [
        { market: 'storage', utilization_ppm: 650_000, provider_margin_ppm: 120_000 },
        { market: 'compute', utilization_ppm: 680_000, provider_margin_ppm: 135_000 },
        { market: 'energy',  utilization_ppm: Math.round((eMkt.avg_utilization || 0.58) * 1e6), provider_margin_ppm: 110_000 },
        { market: 'ad',      utilization_ppm: Math.round((adQ.cohort_utilization || 0.72) * 1e6), provider_margin_ppm: 145_000 },
      ]
    };
  }

  async getAdReadiness(params = {}) {
    return this.call('ad_market.readiness', params);
  }

  // Stubs for other endpoints that components might call via RpcClient
  async getTPS() { return { tps: 80, avgBlockTime: 1.0 }; }
  async getDashboardMetrics() {
    const bh = await this.getBlockHeight();
    return { blockHeight: bh.height, finalizedHeight: bh.finalized_height };
  }
}

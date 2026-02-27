/**
 * Capabilities Matrix
 * 
 * Enforces the "1% Operator Bar" by ensuring no component allows a destructive or
 * settlement-bearing action if the global launch_mode or per-market gates forbid it.
 */

import appState from './state.js';

export const Capabilities = {
  /**
   * Evaluates whether an action is permitted based on the current network phase.
   * @param {string} market - The market or domain (e.g., 'compute', 'storage', 'ad', 'energy', 'global')
   * @param {string} actionType - 'settlement' (costs money/collateral) or 'mutation' (state change but no funds)
   * @returns {{ allowed: boolean, reason: string }}
   */
  canPerformAction(market, actionType = 'settlement') {
    const launchMode = appState.get('launch_mode') || 'unknown';
    const govStatus = appState.get('governorStatus') || {};
    const gates = govStatus.gates || {};

    // 0. Cold-start safety: Deny settlement if launch mode isn't loaded yet
    if (launchMode === 'unknown' && actionType === 'settlement') {
      return {
        allowed: false,
        reason: 'Launch mode unknown (governor.status not loaded yet)',
        code: 'LAUNCH_MODE_UNKNOWN'
      };
    }

    // If RPC compatibility probe says this market surface is missing, hard-disable.
    const rpcCompat = appState.get('rpcCompat') || {};
    const probe = rpcCompat.probe || {};
    if (market && market !== 'global') {
      // Map market -> one representative required method to consider it "present".
      const marketMethod =
        market === 'energy'   ? 'energy.market_state' :
        market === 'compute'  ? 'compute_market.jobs' :
        market === 'storage'  ? 'storage.list' :
        market === 'ad'       ? 'ad_market.policy_snapshot' :
        null;

      if (marketMethod && probe[marketMethod] && probe[marketMethod].ok === false) {
        return { 
          allowed: false, 
          reason: `Node RPC missing required method: ${marketMethod}`,
          code: 'RPC_MISSING_METHOD'
        };
      }
    }

    // 1. Global Launch Mode overrides
    if (launchMode === 'shadow') {
      return { 
        allowed: false, 
        reason: 'Network is in SHADOW mode (settlement suspended)',
        code: 'LAUNCH_MODE_SHADOW'
      };
    }
    
    // If the action requires collateral/slashing risk, rehearsal mode forbids it globally
    if (launchMode === 'rehearsal' && actionType === 'settlement') {
      return { 
        allowed: false, 
        reason: 'Network is in REHEARSAL mode (live settlement disabled)',
        code: 'LAUNCH_MODE_REHEARSAL'
      };
    }

    // 2. Per-Market Gates
    if (market !== 'global' && gates[market]) {
      const marketGate = gates[market];
      
      if (marketGate.mode === 'shadow') {
        return { 
          allowed: false, 
          reason: `${market.toUpperCase()} market is in SHADOW mode`,
          code: 'MARKET_SHADOW'
        };
      }
      if (marketGate.mode === 'rehearsal' && actionType === 'settlement') {
        return { 
          allowed: false, 
          reason: `${market.toUpperCase()} market is in REHEARSAL mode`,
          code: 'MARKET_REHEARSAL'
        };
      }
      
      // If utilization or margin is failing, we might optionally warn, but mode is the strict gate.
      if (!marketGate.utilization_ok || !marketGate.margin_ok) {
        // Just a warning in state, but let it pass if mode is 'trade'
      }
    }

    // 3. Connection Status
    const connectionMode = appState.get('connectionMode');
    if (connectionMode === 'MOCK' || connectionMode === 'DETECTING') {
      // In mock mode, we allow interactions to demonstrate the UI,
      // BUT we still enforce the simulated launch_mode strictly to show how it behaves.
      // (The logic above already catches the mock launch_mode)
    }

    return { allowed: true, reason: 'Network phase allows this action', code: 'OK' };
  },

  /**
   * Helper to attach capabilities check to a DOM button.
   * Modifies button state and adds a tooltip if disabled.
   */
  bindButton(buttonElement, market, actionType = 'settlement') {
    if (!buttonElement) return;

    const { allowed, reason } = this.canPerformAction(market, actionType);
    
    if (!allowed) {
      buttonElement.disabled = true;
      buttonElement.classList.add('disabled-by-phase');
      buttonElement.title = `Action disabled: ${reason}`;
      buttonElement.style.cursor = 'not-allowed';
      buttonElement.style.opacity = '0.5';
    } else {
      buttonElement.disabled = false;
      buttonElement.classList.remove('disabled-by-phase');
      buttonElement.title = '';
      buttonElement.style.cursor = '';
      buttonElement.style.opacity = '1';
    }
  }
};
# Economics Page Vision & Implementation Plan

**Scope:** Design a comprehensive, interactive Economics & Gating dashboard for Block Buster.  
**Goal:** Visualize the "single token" economy, market gating status, and automated issuance policy in real-time.  
**Target Audience:** Network operators, validators, and token holders tracking the path to mainnet/open markets.

---

## 1. Core Philosophy

> **"One Token, Many Markets"**

The page must visually reinforce that **BLOCK** is the singular settlement layer for all markets (Storage, Compute, Energy, Ad). It needs to bridge the gap between "hard" ledger data (supply, issuance) and "soft" policy data (gates, governor signals).

### Key Themes
1.  **Gating is First-Class:** Users need to know *when* markets open. The "Path to Mainnet" isn't a blog post; it's a live data visualization of governor thresholds.
2.  **Issuance is Reactive:** Show *why* rewards are changing (activity vs. decentralization), not just the current rate.
3.  **Unified Settlement:** Demonstrate how diverse workloads (ads, energy readings) all settle into the same treasury and validator rewards.

---

## 2. Information Architecture & Hierarchy

The page should follow a "Macro to Micro" flow:

### Section 1: The Macro Economy (Top Fold)
*   **Hero Metric:** Circulating Supply vs. Total Cap (40M).
*   **Network Status:** "Mainnet Beta" / "Testnet" indicator driven by gate status.
*   **Issuance Pulse:** Current block reward and the factors driving it (Activity × Decentralization).

### Section 2: Path to Open Markets (The Gating Graph)
*   **Visual:** A timeline or radar chart showing each market's progress toward "Trade" mode.
*   **Data:** `governor.status` signals (utilization, provider margin, peer count) vs. thresholds.
*   **Interactivity:** "What if" sliders to see how network growth unlocks markets.

### Section 3: Market Micro-Economics (Tabs/Grid)
*   **Storage:** Rent cost, capacity utilization, subsidy share.
*   **Compute:** Spot price, job volume, verification cost.
*   **Energy:** KWh delivered, oracle settlement volume, carbon impact (implied).
*   **Ads:** Bid density, quality multipliers, cohort readiness.

### Section 4: Treasury & Governance
*   **Treasury Inflow:** Fees + Energy Surcharges.
*   **Disbursements:** Recent proposals and resulting token flows.

---

## 3. Detailed Component Design

### A. The "Path to Mainnet" Gating Visualizer
*   **Concept:** A multi-line progress chart or "gates" visualization.
*   **Data Source:** `governor.status` RPC + `economics_prev_market_metrics`.
*   **X-Axis:** Epochs / Time.
*   **Y-Axis:** "Readiness Score" (0-100%).
*   **Lines:**
    *   `Storage Gate`: Driven by `utilization_ppm` vs target.
    *   `Compute Gate`: Driven by `provider_margin_ppm` vs target.
    *   `Energy Gate`: Driven by `active_peers` and `oracle_consistency`.
*   **Threshold Line:** A dotted line at the "Open" threshold (e.g., 80% readiness).
*   **Tooltip:** "Storage is 65% ready. Need +15% utilization to unlock."

### B. Interactive Supply & Issuance Modeler
*   **Visual:** Stacked area chart of Total Issued Supply.
*   **Controls (Sliders):**
    *   *Transaction Volume* (0.5x - 5x current)
    *   *Unique Miners* (Current - 10k)
*   **Output:** Dynamic projection of "Time to Cap" and "Annual Inflation Rate".
*   **Formula:** Implement `reward = base * activity * decentralization * decay` (from `economics_and_governance.md`) in JS.
*   **Why:** Educates users on the adaptive monetary policy.

### C. Market Deep Dives (Cards)

#### 1. Energy Market
*   **Key Metric:** KWh Delivered (Settled).
*   **Secondary:** Oracle Trust Score (signature validation rate).
*   **Visual:** Bar chart of `energy.settle` volumes.
*   **Connection:** Show how `treasury_fee` from energy directly boosts the Treasury balance.

#### 2. Ad Market
*   **Key Metric:** Effective Bid Price (CPM).
*   **Quality Multiplier:** Gauge showing average `Q_cohort` (freshness/privacy).
*   **Visual:** Scatter plot of recent winning bids vs. Quality Score.
*   **Insight:** "High privacy cohorts are commanding a 1.5x premium."

### D. The "Single Token" Flowchart (Sankey Diagram)
*   **Input (Left):** Coinbase Minting, User Fees, Energy Surcharges.
*   **Distribution (Center):** Validator Rewards, Treasury, Rebates.
*   **Output (Right):** Circulating Supply, Burnt (if applicable), Lockups.
*   **Tech:** D3.js or Chart.js Sankey plugin.
*   **Data:** `receipt.audit` aggregation + `treasury.balance`.

---

## 4. Implementation Plan & Checklist

### Phase 1: Data Plumbing (The "Hard" Part)
*   [ ] **API Wrapper:** Extend `js/shell.js` or create `js/economics.js` to fetch:
    *   `consensus.block_reward` (Base reward)
    *   `governor.status` (Gates & signals)
    *   `ledger.supply` (Total/Circulating)
    *   `analytics.market_metrics` (Aggregated volume/utilization)
*   [ ] **Model Port:** Port the `NetworkIssuanceController` logic (Rust) to JavaScript for the interactive calculator.
    *   *Reference:* `node/src/economics/network_issuance.rs`
    *   *Inputs:* `transaction_count`, `volume_ratio`, `unique_miners`.

### Phase 2: Core UI Components
*   [ ] **Layout:** Create `economics.html` using the new `network.html` grid system (3-col top, 2-col charts).
*   [ ] **Supply Widget:** "Big Number" card for Circulating Supply with a progress bar toward 40M.
*   [ ] **Issuance Gauge:** Radial gauge for the current `Activity Multiplier` (e.g., "1.05x - Network is Growing").

### Phase 3: The Gating Visualization
*   [ ] **Gate Logic:** Implement `js/gates.js` to parse `governor.status`.
    *   Map `MarketMode::Rehearsal` -> "Testing" (Yellow).
    *   Map `MarketMode::Trade` -> "Live" (Green).
*   [ ] **Chart:** Line chart showing the *history* of gate signals (needs `governor.decisions` with `limit=100`).

### Phase 4: Interactivity
*   [ ] **Simulator:** Add the sliders for "Simulate Network Growth".
    *   Link sliders to the Issuance Chart update function.
    *   Add "Reset to Live Data" button.

---

## 5. Technical Specifications

### API Endpoints (from `apis_and_tooling.md`)

| Metric | Endpoint / Method | Notes |
| :--- | :--- | :--- |
| **Gate Status** | `governor.status` | Returns `gate_states` and `economics_prev_market_metrics`. |
| **Gate History** | `governor.decisions` | Use to plot the timeline of gate changes. |
| **Supply** | `ledger.balance` (system accounts) | Need to sum specific reserve accounts vs. user accounts. |
| **Issuance** | `consensus.block_reward` | Real-time reward emission per block. |
| **Energy** | `energy.market_state` | Provider count, active capacity. |
| **Ads** | `ad_market.policy_snapshot` | Current floor prices and quality weights. |

### Data Structures (JSON)

**Governor Status Response (Mock):**
```json
{
  "epoch": 105,
  "gates": {
    "storage": { "state": "Rehearsal", "readiness": 0.65 },
    "compute": { "state": "Trade", "readiness": 1.0 },
    "energy": { "state": "Rehearsal", "readiness": 0.42 }
  },
  "metrics": {
    "storage_utilization_ppm": 450000,
    "compute_margin_ppm": 120000
  }
}
```

### Design Constraints
*   **No External APIs:** Must rely *only* on the Block node RPCs.
*   **Deterministic:** The "Simulate" mode must match the Rust implementation exactly.
*   **Responsive:** Must work on mobile (single column stack) as per the new UX standard.

---

## 6. Economics Lab Presets & Gate Constants (Spec Mirror)

These values are mirrored in `src/components/EconomicsSimulator.js` and must stay aligned with the Rust governor (`node/src/launch_governor/mod.rs`).

**Launch Governor Economics Gate (market sanity)**
- Utilization bounds: **1% – 95%** (`MIN_UTIL=0.01`, `MAX_UTIL=0.95`).
- Provider margin bounds: **-50% – 300%** (`MIN_MARGIN=-0.5`, `MAX_MARGIN=3.0`).
- Streak requirement: `required_streak = max(1, floor(EPOCH_SECONDS / TB_GOVERNOR_WINDOW_SECS))`; default window is `2 * EPOCH_SECONDS` (EPOCH_SECONDS=120s today) → streak `=1`. If ops tighten TB_GOVERNOR_WINDOW_SECS the simulator slider must match.

**Simulator Presets**
- *Early Network:* tx_count_ratio 0.85, tx_volume_ratio 0.95, utilization 45%, unique_miners 18, emission 2.2M, target_inflation 700 bps, utilization_ppm 520k, margin_ppm 95k, streak 4.
- *Growth:* tx_count_ratio 1.25, tx_volume_ratio 1.35, utilization 68%, unique_miners 42, emission 6.5M, target_inflation 500 bps, utilization_ppm 680k, margin_ppm 135k, streak 12.
- *Mainnet:* tx_count_ratio 1.45, tx_volume_ratio 1.55, utilization 74%, unique_miners 64, emission 9.0M, target_inflation 500 bps, utilization_ppm 720k, margin_ppm 155k, streak 18.
- *Stress:* tx_count_ratio 1.10, tx_volume_ratio 1.80, utilization 92%, unique_miners 32, emission 7.5M, target_inflation 500 bps, utilization_ppm 810k, margin_ppm 60k, streak 2.

When gate constants or presets change in Rust or policy, update this section first (spec-first) and then adjust the simulator implementation.

## 6. Next Steps for Developer

1.  **Read:** `node/src/economics/network_issuance.rs` to understand the issuance formula math.
2.  **Scaffold:** Copy `network.html` to `economics.html` to inherit the grid layout.
3.  **Fetch:** Verify you can hit `governor.status` from the browser (CORS/Auth check).
4.  **Build:** Start with the "Path to Mainnet" visualization—it's the highest value feature for operators right now.

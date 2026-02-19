# Economics Page Implementation Checklist

Use this checklist to track progress on building the `economics.html` dashboard. Refer to `ECONOMICS_PAGE_VISION.md` for design details.

## Phase 1: Setup & Data Access
- [ ] **Create File:** Copy `web/public/network.html` to `web/public/economics.html` to inherit the layout.
- [ ] **Create Script:** Create `web/public/js/economics.js` and link it in the HTML.
- [ ] **API Client:** Add methods to `js/shell.js` (or `economics.js`) to fetch:
    - [ ] `governor.status`
    - [ ] `governor.decisions` (with `limit` param)
    - [ ] `consensus.block_reward`
    - [ ] `ledger.supply` (if available, or estimate from block height)
- [ ] **Test Connectivity:** Verify `governor.*` RPCs are accessible from the browser console.

## Phase 2: "Path to Mainnet" (Priority Feature)
- [ ] **Gate Parser:** Write a function to parse `governor.status` JSON.
    - [ ] Extract state (Rehearsal/Trade) for Storage, Compute, Energy, Ads.
    - [ ] Extract readiness metrics (utilization ppm, margin ppm, etc.).
- [ ] **Readiness Visual:** Create a chart/visual showing current readiness vs. threshold (100%).
    - [ ] Suggestion: 4 horizontal progress bars or a radar chart.
- [ ] **Gate History:** Plot `governor.decisions` on a timeline chart to show progress over epochs.

## Phase 3: Macro Economy Metrics
- [ ] **Supply Display:**
    - [ ] Calculate `Total Mined = Block Height * Reward`.
    - [ ] Display "Circulating Supply" vs "Max Supply (40M)".
- [ ] **Issuance Pulse:**
    - [ ] Display current `Block Reward`.
    - [ ] Show the `Activity Multiplier` and `Decentralization Multiplier` components.

## Phase 4: Market Deep Dives
- [ ] **Grid Layout:** Create a 2x2 grid for the four markets (Storage, Compute, Energy, Ads).
- [ ] **Storage Card:** Show utilization and rent cost trends.
- [ ] **Compute Card:** Show spot price and job volume.
- [ ] **Energy Card:** Show KWh delivered and active providers.
- [ ] **Ad Card:** Show bid density and quality scores.

## Phase 5: Interactive Simulator
- [ ] **Port Math:** Translate `NetworkIssuanceController` logic from Rust to JS.
    - [ ] Formula: `Base * Activity * Decentralization * Decay`.
- [ ] **UI Controls:** Add sliders for Transaction Volume and Unique Miners.
- [ ] **Chart:** Add a line chart showing projected supply curve based on slider inputs.

## Phase 6: Polish & Review
- [ ] **Responsive Check:** Ensure grid collapses correctly on mobile.
- [ ] **Theme Check:** Verify colors match the "hologram" aesthetic.
- [ ] **Documentation:** Update `web/CHANGES.md` with new page details.

# Block-Buster Dashboard: Dev Session Status (Feb 2026)

## Current State: "1% Operator Grade" Architecture
We have transitioned the dashboard from a passive viewer to a robust, phase-aware operator tool. The codebase now explicitly handles "Not Wired" and "Restricted Phase" states.

### Core Systems Implemented
1.  **RPC Compatibility Probing (`rpc-compat.js`)**
    *   **What it does:** Probes the connected node for required RPC methods (e.g., `energy.market_state`, `storage.list`).
    *   **UI Effect:** `ConnectionStatus` shows "Degraded" if methods are missing. `RpcCompatModal` lists exact missing methods.
    *   **Safety:** `Navigation.js` disables links to panels with missing RPC surfaces.

2.  **Capabilities Matrix (`capabilities.js`)**
    *   **What it does:** Central logic that determines if an action (e.g., "Submit Job", "Disburse Funds") is allowed based on:
        *   `launch_mode` (Trade vs Shadow vs Rehearsal)
        *   Per-market Gates (`governorStatus.gates.compute`, etc.)
        *   RPC method availability
    *   **Usage:** `Capabilities.bindButton($btn, 'market', 'actionType')` automatically handles disabled state/tooltips.

3.  **Data Table Correctness**
    *   Fixed all `DataTable` instantiations to use correct `` property, resolving "empty table" bugs.

### Remaining Work (Next Steps)

#### 1. Complete Gating Coverage
The following components still need `Capabilities.bindButton` integration:
*   **`Governance.js`**: "Submit Proposal", "Vote" buttons.
*   **`Treasury.js`**: "Disburse", "Allocate" buttons.
*   **`EnergyMarket.js`**: Finish modals beyond Register/Reading (e.g., Disputes).
*   **`Trading.js`**: "Reset Orders" and generic wallet interactions.

#### 2. Stateful Mock Data (High Value)
Make the mock mode interactive. `MockDataManager` needs mutation methods called by `rpc-mock.js`.
*   **Goal:** User submits "Compute Job" in Mock Mode -> Job appears in table.
*   **Impl:** Add `submitJob(job)` to `MockDataManager` that pushes to `this.mockData.computeMarket.jobs`.

#### 3. Resilience (Schema Validation)
Add Zod-like runtime checks in `rpc.js` to prevent UI crashes when Rust backend changes field casing (snake_case vs camelCase).

#### 4. Styles
Ensure `web/src/styles/components.css` is properly loaded and the new `.connection-status.degraded` styles are rendering correctly in the build.

### Quick Start for Next Dev
1.  **Check `capabilities.js`** to understand the gating logic.
2.  **Run the App:** `npm run dev` (or equivalent).
3.  **Test Gating:**
    *   Mock "Shadow" mode in `mock-data-manager.js` (set `this.mockData.governorStatus.launch_mode = 'shadow'`).
    *   Verify "Submit" buttons are disabled with tooltips.

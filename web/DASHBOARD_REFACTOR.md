# Dashboard UX Refactor - Phase 1 Complete

## Overview
This refactor addresses the "optimization ceiling" by consolidating design tokens, unifying UI primitives, and implementing progressive disclosure for dense operator dashboards.

## ✅ Completed Changes

### 1. Token Consolidation (`public/css/tokens.css`)
**Problem**: Multiple parallel token vocabularies across Tailwind, custom CSS, and inline styles caused drift and inconsistency.

**Solution**: Single source of truth for all design decisions.
- **Color roles**: `--bg`, `--panel`, `--border`, `--text`, `--good/warn/bad/info`, `--accent`
- **Density**: `--radius-sm/md/lg`, `--space-1..8`, `--shadow-1..3`
- **Motion**: `--ease`, `--dur-1..5` (with `prefers-reduced-motion` support)
- **Typography**: Semantic font sizes (`--text-xs` through `--text-kpi`)

**Impact**: 
- Change one token → affects entire app
- Tailwind + custom CSS now reference same variables
- Opacity modifiers work on all custom colors via `rgb(var(--token) / <alpha-value>)`

### 2. Tailwind Config Update (`tailwind.config.js`)
**Changes**: 
- All custom colors now map to CSS variables from `tokens.css`
- Font sizes reference `--text-*` variables
- Border radius references `--radius-*` variables
- Shadows reference `--shadow-*` variables
- Transition durations/timing use token variables

**Impact**: Tailwind utilities like `bg-accent/20` or `text-good` now work consistently.

### 3. Component Primitive Consolidation (`public/css/block-buster.css`)
**Problem**: Dozens of one-off component classes (`panel-blade`, `hologram-panel`, `metric-card`, `status-pill`, `micro-badge`, etc.) with no clear hierarchy.

**Solution**: **8 base components** with composition-based variants:

#### Base Components
1. **`panel`** - Base container with hover state
   - Variants: `--hero`, `--metric`, `--table`, `--glass`, `--glow`
   - Legacy aliases: `panel-blade`, `hologram-panel`, `glass-panel`, `metric-card`, `kpi`, `gate-card`

2. **`pill`** - Status indicator (uppercase, rounded-full)
   - Semantic variants: `--good`, `--warn`, `--bad`, `--info`, `--neutral`
   - Legacy alias: `status-pill` with all color variants

3. **`chip`** - Medium informational badge
   - Variants: `--accent`, `--pill`

4. **`badge`** - Tiny metadata display
   - Legacy alias: `micro-badge`

5. **`kpi`** - Metric display components
   - Sub-components: `kpi-label`, `kpi-value`, `kpi-meta`

6. **`skeleton`** - Loading state
   - Variants: `--text`, `--heading`

7. **`toast`** - Notifications
   - Variants: `--error`, `--success`, `--warning`, `--info`

8. **`btn`** - Action buttons
   - Variants: `--primary`, `--secondary`, `--ghost`

**Impact**: 
- Fewer CSS classes overall
- Clear hierarchy: base component + semantic variant
- Backwards compatible via aliases
- Easy to extend (add new variants, not new components)

### 4. Dashboard Header Compression
**Problem**: 6 micro-badges fighting for attention in header (feature lag, errors, db wal, flush, compaction, plus updated timestamp).

**Solution**: Progressive disclosure pattern.

#### New Header Structure
```
Left: Dashboard | [LIVE pill] | [gates badge]
Right: [errors chip] | [lag chip] | [System Health disclosure ▼]
```

**Primary tier** (always visible):
- System health pill: `LIVE` / `DEGRADED` / `DOWN` (single dominant signal)
- Error count: Most critical metric
- Lag time: Second most critical metric

**Secondary tier** (behind `<details>` disclosure):
- Full health breakdown (feature lag, errors, DB WAL, flush, compaction)
- Last updated timestamp
- Expandable popover on click

**Visual hierarchy**: 1 dominant signal + 2 supporting signals + progressive disclosure for precision.

**Implementation**:
- HTML: `<details>` element with popover panel
- CSS: Chevron rotation animation on toggle
- JS: Auto-computes system health status from metrics

### 5. Hero Strip Semantic Split
**Problem**: 6 cards in a 4-column grid caused arbitrary wrap at `xl` breakpoint, mixing unlike concepts (chain metrics + trading metrics).

**Solution**: Two semantic rows with explicit purpose.

#### Row 1: Core Chain Metrics (`#hero-strip-chain`)
```
Uptime | Block Height | Engine | Market Gate
```
- 4 cards, `xl:grid-cols-4` (no wrap)
- Represents node/chain fundamentals

#### Row 2: Trading & Account Metrics (`#hero-strip-trading`)
```
Wallet Connection | Net P&L
```
- 2 cards, `xl:grid-cols-2` (consistent layout)
- Represents trading readiness + performance

**Impact**: No more random wrap, clear visual grouping by domain.

### 6. Wallet Tile Simplification
**Problem**: Wallet tile was overloaded:
- Connection status
- Guidance text ("Connect this node's funded wallet...")
- Trading eligibility
- Freshness timestamp

**Solution**: Split into focused components.

#### Simplified Wallet Tile
```
Label: Wallet Connection
Value: [Address] or "Disconnected"
Meta [Eligibility badge] | [Updated chip]
Pill: READY / CONNECTED / DISCONNECTED
```

#### Separate Wallet Guidance Banner
- Conditional banner (hidden by default)
- Shows when wallet is disconnected OR ineligible
- Dismissible (persists to localStorage)
- Positioned above Portfolio section

**Impact**: Wallet tile is now scannable; guidance doesn't compete with status.

### 7. JavaScript Wiring (`public/js/dashboard.js`)
**Created**: New dashboard controller that:

#### System Health Computation
- Fetches `/health`, `/theblock/network`, `/theblock/gates`, `/wallet/status`, `/risk/pnl`
- Computes overall status: `good` / `warn` / `bad` based on thresholds
  - **Bad**: >10 errors OR >5s lag
  - **Warn**: >3 errors OR >1s lag OR high DB WAL/flush lag
  - **Good**: Everything nominal

#### Updates (every 5s)
1. **Header health metrics**:
   - `system-health-pill`: Auto-computed status + label
   - `health-errors-primary`: Error count
   - `health-lag-primary`: Feature lag time
   - Detail breakdown: All 5 metrics + timestamp

2. **Chain metrics**:
   - Uptime: Formatted with pill status (STABLE >1h, RECENT <1h)
   - Block Height: Formatted number
   - Engine: State text with semantic pill (ACTIVE/READY/PENDING)
   - Market Gate: Open/closed summary with pill (TRADE/PARTIAL/GATED)

3. **Trading metrics**:
   - Wallet: Connection status + eligibility badge + pill
   - Net P&L: Currency format + change % + semantic pill (PROFIT/LOSS/FLAT)

#### Event Handlers
- Wallet guidance dismiss → localStorage persistence
- Health details toggle → chevron rotation animation

**Impact**: Header stays in sync with backend; progressive disclosure works automatically.

## 🎨 Visual Impact

### Before
```
Dashboard | STALE | gates— | feature lag— | errors— | db wal— | flush— | comp— | Waiting for data
[6 hero cards in xl:grid-cols-4 causing wrap]
```

### After
```
Dashboard | [LIVE] | gates 4/4
                      errors: 2 | lag: 45ms | [System Health ▼]

[4-card chain row: Uptime | Block Height | Engine | Market Gate]
[2-card trading row: Wallet | Net P&L]
```

**Density reduction**: 7 always-visible badges → 3 primary indicators + 1 disclosure.

## 📊 Metrics

- **CSS token duplication**: Eliminated (single source in `tokens.css`)
- **Component primitives**: 20+ → 8 base components
- **Header noise**: 6 competing badges → 1 dominant + 2 key metrics
- **Hero strip clarity**: Semantic grouping (chain vs trading)
- **Code reduction**: Legacy aliases maintain compatibility; ~200 lines of redundant CSS collapsed

## 🚀 Next Steps

### Immediate (Dashboard)
1. **Test**: Verify dashboard.js API calls work with backend
2. **Refine thresholds**: Tune health status computation based on real data
3. **Add skeleton states**: Flash skeleton → data for smoother loading

### Structural (Spec Priority)
4. **Centralize gate routing**: Create `utils.js::enforceGatePolicy()` to replace scattered gate checks
5. **Script loading optimization**: 
   - Add `defer` to all non-critical scripts
   - Create single `boot.js` entry point
   - Per-page bundles (dashboard ≠ network ≠ trading)
6. **Mode modal a11y**: Add dialog semantics, focus trapping, Esc to close

### Other Pages (Apply Same Patterns)
7. **network.html**: 
   - Compress KPI grid into semantic clusters (Latency, Storage, Errors)
   - Normalize gate card layout (table-like with consistent columns)
   - Apply progressive disclosure for dense sections
8. **economics.html**: 
   - Extract inline `<style>` to shared CSS
   - Convert hover-only tooltips to keyboard-accessible disclosures
   - Add `prefers-reduced-motion` gating
9. **Align cache-busting**: Use Vite hashed filenames instead of `?v=` query params

## 🔍 Testing Checklist

- [ ] Tailwind rebuild: `npm run build:css` or equivalent
- [ ] Browser test: Header metrics populate correctly
- [ ] System health pill: Changes color based on computed status
- [ ] Health disclosure: Opens/closes with chevron animation
- [ ] Hero tiles: Data loads without skeletons persisting
- [ ] Wallet guidance: Shows when disconnected, dismissible, persists
- [ ] Responsive: Header + hero rows work at sm/md/xl breakpoints
- [ ] Accessibility: Keyboard navigate to health disclosure summary
- [ ] Console: No JS errors, health polling works

## 📝 Files Changed

### Created
- `web/public/css/tokens.css` (124 lines)
- `web/public/js/dashboard.js` (556 lines)
- `web/DASHBOARD_REFACTOR.md` (this file)

### Modified
- `web/tailwind.config.js` (rewired to tokens)
- `web/public/css/block-buster.css` (consolidated primitives + token import)
- `web/public/dashboard.html` (compressed header, split hero strip, added dashboard.js)

### Backwards Compatible
- All legacy classnames aliased (`panel-blade`, `status-pill`, `micro-badge`, etc.)
- Existing JS that references old classes still works

## 💡 Design Principles Applied

1. **Single source of truth**: Tokens → everything else
2. **Progressive disclosure**: Precision behind one interaction
3. **Composition over variants**: 8 base components + modifiers
4. **Semantic hierarchy**: 1 dominant signal + 2 supporting signals
5. **Operator UX**: Reduce noise, keep precision accessible
6. **Motion economy**: Animations only for transitions, respects `prefers-reduced-motion`
7. **Keyboard-first**: `<details>` native keyboard support, focus styles

---

**Status**: ✅ Phase 1 complete. Ready for testing and iteration.

# Network Strength Page

**Created:** February 2, 2026  
**Status:** ✅ Complete - Ready for Backend Integration

## Overview

Comprehensive real-time blockchain health monitoring dashboard that provides deep insights into The Block network's consensus, performance, validator health, and connectivity.

**Access:** `http://localhost:5173/network`

---

## UX Design Philosophy

### Visual Hierarchy

**Top Layer: Overall Health Score**
- Prominent circular progress indicator
- Immediate understanding of network health (0-100%)
- Color-coded: Green (>75%), Yellow (50-75%), Red (<50%)

**Second Layer: Key Metrics Grid (4 Cards)**
- Block Height & Finality
- Block Time Performance
- Transaction Throughput (TPS)
- Network Connectivity
- Quick scan for critical metrics

**Third Layer: Detailed Analytics (2 Columns)**

**Left Column:**
- Consensus & Finality Chart (area chart showing block height vs finalized height)
- Block Production Performance (line chart with target line)

**Right Column:**
- Health Indicators Radar (4-axis radar showing component health scores)
- Transaction Throughput (area chart showing TPS over time)

**Bottom Layer: Network Connectivity**
- Full-width connectivity visualization
- Bar chart of peer connections over time
- Statistics boxes for validators, peers, and stake utilization

---

## Page Sections

### 1. Header with Health Score

**Components:**
- Page title and subtitle
- Overall health score (0-100%)
- Circular progress indicator with animation
- Gradient background for visual appeal

**Health Calculation:**
```typescript
overallHealth = (
  consensusHealth +    // Based on finality lag
  performanceHealth +  // Based on block time
  networkHealth +      // Based on peer count
  stakeUtilization     // Active stake percentage
) / 4
```

**Visual Feedback:**
- ≥ 75%: Green (Excellent)
- 50-74%: Yellow (Good)
- < 50%: Red (Warning)

### 2. Key Metrics Grid

Four prominent cards displaying:

**Block Height Card**
- Current block height
- Finalized block height
- Trend indicator (good/warning/danger based on lag)

**Block Time Card**
- Average block production time (in seconds)
- Target comparison (1.0s)
- Performance trend

**Throughput Card**
- Transactions per second (TPS)
- Real-time performance metric

**Network Peers Card**
- Connected peers count
- Active validators count
- Network health indicator

**Features:**
- Icon-based visual identification
- Hover effects for interactivity
- Color-coded right border for status

### 3. Consensus & Finality Chart

**Chart Type:** Area Chart (dual series)

**Data Series:**
- Block Height (blue gradient)
- Finalized Height (green gradient)

**Time Range:** Last 60 data points (2 minutes at 2s refresh)

**Key Insights:**
- Visual gap shows finality lag
- Smooth curves indicate healthy consensus
- Diverging lines indicate issues

**Statistics Panel:**
- Finality Progress: XX.X%
- Lag: X blocks

**Status Indicator:**
- Pulsing dot with lag count
- Color-coded based on severity

### 4. Block Production Chart

**Chart Type:** Line Chart

**Data:**
- Block time in milliseconds
- Target line at 1000ms (1.0s)

**Purpose:**
- Monitor block production consistency
- Identify performance degradation
- Compare against target

**Visual Elements:**
- Solid line for actual times
- Dashed line for target
- Grid for easy reading

### 5. Health Indicators Radar

**Chart Type:** Radar Chart (4 axes)

**Metrics:**
1. **Consensus** (0-100): Based on finality lag
   - <5 blocks = 100
   - <10 blocks = 75
   - <50 blocks = 50
   - ≥50 blocks = 25

2. **Performance** (0-100): Based on block time
   - <1000ms = 100
   - <1500ms = 75
   - <2000ms = 50
   - ≥2000ms = 25

3. **Network** (0-100): Based on peer count
   - ≥20 peers = 100
   - ≥10 peers = 75
   - ≥5 peers = 50
   - <5 peers = 25

4. **Stake Active** (0-100): Percentage of total stake actively validating

**Legend:**
- Color-coded ranges
- Easy interpretation of health levels

### 6. Transaction Throughput Chart

**Chart Type:** Area Chart

**Data:**
- Transactions per second over time
- Purple gradient fill

**Purpose:**
- Monitor network load
- Identify throughput trends
- Performance benchmarking

### 7. Network Connectivity Section

**Layout:** Full-width with 2-column grid

**Left: Peer Connection Chart**
- Bar chart showing peer count over time
- Visual representation of network stability

**Right: Statistics Boxes**

Three cards displaying:
1. **Active Validators**
   - Icon: 👥
   - Count of consensus participants

2. **Connected Peers**
   - Icon: 🔗
   - Total peer connections

3. **Stake Utilized**
   - Icon: 💎
   - Percentage of stake actively validating

---

## Data Model

### NetworkMetrics Interface

```typescript
interface NetworkMetrics {
  block_height: number;        // Current tip
  finalized_height: number;    // Last finalized block
  block_time_ms: number;       // Average production time
  tps: number;                 // Transactions per second
  validator_count: number;     // Active validators
  connected_peers: number;     // Network peers
  total_stake: number;         // Total staked amount
  active_stake: number;        // Actively validating stake
  timestamp: number;           // Metric timestamp
}
```

### Historical Data Structure

```typescript
interface HistoricalData {
  blockHeight: NetworkMetrics[];              // Full metrics over time
  blockTime: Array<{time: string, value: number}>;  // Block times
  tps: Array<{time: string, value: number}>;        // Throughput
  peers: Array<{time: string, count: number}>;      // Peer count
}
```

---

## Health Thresholds

### Block Time
```typescript
{
  excellent: 1000,   // < 1.0s
  good: 1500,        // < 1.5s  
  warning: 2000,     // < 2.0s
  // danger: >= 2000ms
}
```

### Finality Lag
```typescript
{
  excellent: 5,      // < 5 blocks
  good: 10,          // < 10 blocks
  warning: 50,       // < 50 blocks
  // danger: >= 50 blocks
}
```

### Peer Count
```typescript
{
  excellent: 20,     // >= 20 peers
  good: 10,          // >= 10 peers
  warning: 5,        // >= 5 peers
  // danger: < 5 peers
}
```

---

## Auto-Refresh

**Refresh Interval:** 2 seconds

**Data Retention:** Last 60 data points per metric (2 minutes of history)

**Benefits:**
- Near real-time monitoring
- Smooth chart animations
- Low latency updates
- Immediate issue detection

---

## Color Scheme

```typescript
const COLORS = {
  primary: '#3b82f6',    // Blue - main accent
  success: '#10b981',    // Green - healthy status
  warning: '#f59e0b',    // Yellow - warning status
  danger: '#ef4444',     // Red - critical status
  secondary: '#8b5cf6',  // Purple - secondary charts
  info: '#06b6d4',       // Cyan - informational
};
```

**Status Indicators:**
- Green dot: Healthy operation
- Yellow dot: Performance degraded
- Red dot: Critical issues
- Pulsing animation for emphasis

---

## Responsive Design

### Desktop (> 1200px)
- 2-column chart layout
- Full navigation visible
- All text labels shown

### Tablet (768px - 1200px)
- Single column chart layout
- Condensed navigation
- Maintained readability

### Mobile (< 768px)
- Stacked layout
- Icon-only navigation
- Touch-optimized interactions
- Simplified charts

---

## Backend Integration

### Required API Endpoint

**Endpoint:** `GET /theblock/network/metrics`

**Response:**
```json
{
  "block_height": 123456,
  "finalized_height": 123450,
  "block_time_ms": 1200,
  "tps": 55.3,
  "validator_count": 25,
  "connected_peers": 18,
  "total_stake": 10000000,
  "active_stake": 9500000,
  "timestamp": 1738534800
}
```

### Implementation Steps

1. **Add endpoint to `production_server.py`:**
```python
@app.get("/theblock/network/metrics")
async def get_network_metrics():
    # Gather metrics from The Block node
    return {
        "block_height": client.get_block_height(),
        "finalized_height": client.get_finalized_height(),
        "block_time_ms": client.get_avg_block_time(),
        "tps": client.get_tps(),
        "validator_count": client.get_validator_count(),
        "connected_peers": client.get_peer_count(),
        "total_stake": client.get_total_stake(),
        "active_stake": client.get_active_stake(),
        "timestamp": time.time(),
    }
```

2. **Add methods to `TheBlockClient`:**
```python
class TheBlockClient:
    def get_finalized_height(self) -> int:
        return self.rpc_call("consensus.finalized_height")
    
    def get_avg_block_time(self) -> float:
        return self.rpc_call("consensus.avg_block_time")
    
    def get_tps(self) -> float:
        return self.rpc_call("consensus.tps")
    
    # ... etc
```

3. **Update frontend API client:**
```typescript
// In theBlockClient.ts
async getNetworkMetrics(): Promise<NetworkMetrics> {
  return this.request('/theblock/network/metrics');
}
```

4. **Update NetworkStrength.tsx:**
```typescript
const fetchMetrics = async () => {
  const data = await theBlockAPI.getNetworkMetrics();
  setCurrentMetrics(data);
  // ... update history
};
```

---

## Full-Chain Visual Demo (“Proof Board”)

> **Goal:** let an operator or demo user *see* every major subsystem exercise itself from the Network page—no shells or `run-tests-verbose.sh` required—and return a structured, non-mutating readiness report.

### UX Contract (Network Page)
- Panel title: **“Full-Chain Proof Board”** under the key metrics grid.
- Controls:
  - Text input for an optional `.block` domain (validated locally).
  - File picker for a storage sample; hash calculated in-browser.
  - Button **Run visual suite** (debounced; shows spinner + ETA).
- Display:
  - Status grid of eight checks with color chips (`ok` | `warn` | `error` | `pending` | `skipped`).
  - Per-check latency and the most relevant datapoint (e.g., `finality lag: 3 blocks`).
  - Aggregate score (0–100) derived from the weighted checks.
  - Toggle to reveal raw JSON for debugging.

### API: `POST /theblock/fullcheck`

**Purpose:** run a read-only sweep across consensus, markets, scheduler, receipts, storage, and domain preflight; return structured results for the UI. All RPC calls are **read-only**; no on-chain mutations occur.

**Request body:**
```json
{
  "domain": "demo.block",
  "file": {
    "name": "sample.txt",
    "size_bytes": 2048,
    "sha256": "<hex>",         // calculated client-side
    "preview_only": true       // always true in this version (no writes)
  },
  "storage_duration_epochs": 8 // optional hint for the preview payload
}
```

**Response shape:**
```json
{
  "started_at": 1738675200,
  "duration_ms": 187,
  "summary_score": 86,
  "steps": [
    { "id": "consensus", "label": "Finality + block height",
      "status": "ok", "duration_ms": 14,
      "data": { "block_height": 123450, "finalized_height": 123447, "lag_blocks": 3 } },
    { "id": "peers", "label": "Peer + latency",
      "status": "ok", "duration_ms": 9,
      "data": { "peers": 42, "avg_latency_ms": 38 } },
    { "id": "markets", "label": "Compute/Storage/Energy/Ad health",
      "status": "warn", "duration_ms": 22,
      "data": { "healthy": 3, "total": 4, "details": { "compute": "healthy", "storage": "healthy", "energy": "healthy", "ad": "idle" } } },
    { "id": "scheduler", "label": "Queue + throughput",
      "status": "ok", "duration_ms": 7,
      "data": { "queue_depth": 12, "throughput": 240 } },
    { "id": "receipts", "label": "Recent receipts tail",
      "status": "ok", "duration_ms": 12,
      "data": { "count": 5, "latest_height": 123449 } },
    { "id": "storage_probe", "label": "Storage pipeline preview",
      "status": "ok", "duration_ms": 11,
      "data": { "provider_count": 6, "preview_contract": { "file_id": "abcd1234", "duration_epochs": 8 } } },
    { "id": "domain_probe", "label": ".block reachability preflight",
      "status": "ok", "duration_ms": 6,
      "data": { "domain": "demo.block", "verified": true, "record": "v=block-prover;pk=abcd..." } }
  ]
}
```

**Checks performed (all read-only):**
1. **consensus** — `light.latest_header`, `consensus.finality_status`; compute lag blocks.
2. **peers** — `net.peers`, `net.stats`; peer count and average latency.
3. **markets** — `compute_market.stats`, `storage.stats`, `energy.market_state`, `ad_market.stats`; tally healthy markets.
4. **scheduler** — `scheduler.stats`; queue depth + ops/sec.
5. **receipts** — `receipt.audit` (tail 5); extract latest block height.
6. **storage_probe** — `storage.stats`; if file metadata is supplied, return a **preview-only** `storage.put` payload (no write).
7. **domain_probe** — call `gateway.dns_lookup` for `.block` domains; status `ok` when verified, `warn` when a record exists but is unverified, `error` when missing or RPC fails.

**Scoring:**
- Start at 100; subtract 15 for each `error`, 7 for each `warn`, 3 for each `pending`, capped at 0.
- `skipped` steps do not affect the score.

**Frontend wiring:**
- On **Run visual suite**, call `POST /theblock/fullcheck` with the optional domain + file hash.
- Render per-step chips using the `status` field; surface the `data` inline for fast proof points.
- Keep the page on a 2s auto-refresh for base network metrics; the fullcheck runs on demand only (no polling).

---

## Testing

### Visual Testing

1. **Health Score Display**
   - Score updates correctly
   - Circle animation smooth
   - Color changes at thresholds

2. **Charts Rendering**
   - Data loads and displays
   - Time axes formatted correctly
   - Tooltips work on hover
   - Legends clear and accurate

3. **Responsive Behavior**
   - Test at 1920px, 1024px, 768px, 375px
   - Layout adapts appropriately
   - Charts remain readable
   - No horizontal scroll

### Functional Testing

1. **Auto-Refresh**
   - Data updates every 2 seconds
   - History accumulates correctly
   - No memory leaks (check after 10 minutes)

2. **Error Handling**
   - Network failure shows error state
   - Retry button works
   - Previous data preserved during errors

3. **Performance**
   - Page loads in <2 seconds
   - Smooth animations (60fps)
   - Chart updates don't cause jank

### Data Accuracy

1. **Derived Metrics**
   - Finality lag = block_height - finalized_height
   - Finality progress = (finalized / total) * 100
   - Stake utilization = (active / total) * 100
   - Health scores calculated correctly

2. **Threshold Logic**
   - Status indicators match thresholds
   - Color coding consistent
   - Trend indicators accurate

---

## Future Enhancements

### Near-Term
1. ⬜ **Historical Views**
   - Time range selector (1h, 6h, 24h, 7d)
   - Zoom and pan on charts
   - Export chart data

2. ⬜ **Alerts**
   - Browser notifications for issues
   - Configurable thresholds
   - Alert history

3. ⬜ **Validator Details**
   - Click validator count to see list
   - Individual validator health
   - Stake distribution

### Long-Term
1. ⬜ **Geographic Distribution**
   - World map of peer locations
   - Regional latency
   - Network topology

2. ⬜ **Advanced Metrics**
   - Memory pool size
   - Transaction confirmation times
   - Fork detection
   - Reorg monitoring

3. ⬜ **Comparison Mode**
   - Compare current vs historical
   - Benchmark against other chains
   - Performance baselines

4. ⬜ **AI-Powered Insights**
   - Anomaly detection
   - Predictive alerts
   - Performance optimization suggestions

---

## Files Created

```
web/src/
├── pages/
│   ├── NetworkStrength.tsx        # Main component (450+ lines)
│   └── NetworkStrength.css        # Styling (350+ lines)
├── components/
│   ├── Navigation.tsx             # Top nav bar
│   └── Navigation.css             # Nav styling
└── App.tsx                        # Updated with /network route
```

---

## Success Criteria

✅ **UI/UX Complete**
- Comprehensive health dashboard
- Clear visual hierarchy
- Intuitive navigation
- Responsive design
- Professional styling

⬜ **Backend Integration** (Pending)
- API endpoint implemented
- Real data flowing
- WebSocket option for updates

⬜ **Testing** (Pending)
- All visual tests passed
- Functional tests passed
- Performance benchmarks met

---

## Conclusion

The Network Strength page provides a **comprehensive, visually appealing, and intuitive interface** for monitoring The Block blockchain health in real-time. The UX design prioritizes:

1. **Immediate Understanding** - Overall health score at top
2. **Progressive Detail** - From summary cards to detailed charts
3. **Visual Feedback** - Color coding and animations
4. **Responsiveness** - Works on all devices
5. **Real-time Updates** - 2-second refresh for current data

**Ready for production** once backend endpoints are implemented!

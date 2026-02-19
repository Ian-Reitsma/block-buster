# Block-Buster UX Transformation Specification

**Version:** 1.0  
**Date:** February 13, 2026  
**Target:** Full-stack blockchain dashboard with enterprise-grade UX  
**Philosophy:** 1% dev mentality - every interaction, every layout, every detail matters

---

## Executive Summary

The current block-buster frontend is a proof-of-concept with stacked metrics cards and minimal interactivity. This spec defines the complete UX transformation required to create a production-ready blockchain operations dashboard that surfaces **all** backend capabilities across consensus, markets (ad, energy, compute, storage), governance, treasury, scheduler, receipts, disputes, and network health.

**Current State:** Linear card stacks, basic polling, no advanced interactions  
**Target State:** Multi-panel workspaces, real-time streaming, context-aware navigation, data-dense visualizations

---

## Core UX Principles

### 1. Information Density Without Cognitive Overload
- Use visual hierarchy (size, color, position, whitespace) to guide attention
- Progressive disclosure: overview → detail → action
- Contextual density: sparse for monitoring, dense for analysis

### 2. Spatial Organization Over Temporal Scrolling
- Multi-column layouts that leverage screen width
- Fixed sidebars for persistent context
- Tabbed panels for related content (not separate pages)
- Minimize vertical scrolling - maximize information per viewport

### 3. Real-Time First, Historical Second
- Stream updates via WebSocket, not polling
- Inline sparklines and trend indicators
- Highlight changes with subtle animations (200-300ms)
- Cache historical data client-side for instant access

### 4. Context-Aware Navigation
- Drill-down: market → provider → transaction
- Breadcrumbs for navigation state
- Deep linking with URL state preservation
- Cross-referencing: click transaction ID → opens receipt modal

### 5. Action-Oriented Design
- Every data point should be actionable
- Hover for quick stats, click for detail modal, right-click for actions
- Bulk operations with multi-select
- Keyboard shortcuts for power users

---

## Architecture Overhaul

### Current Structure (Bad)
```
/theblock   → Everything stacked vertically
/network    → Separate page with duplicated logic
/trading    → Legacy, ignored
```

### Target Structure (Good)
```
/dashboard
  ├─ Overview (default)
  ├─ Markets
  │  ├─ Ad Market
  │  ├─ Energy Market
  │  ├─ Compute Market
  │  └─ Storage Market
  ├─ Consensus
  ├─ Governance
  ├─ Treasury
  ├─ Operations
  └─ Analytics

/workspace
  ├─ Customizable panels
  ├─ Saved layouts
  └─ Multi-monitor support

/explorer
  ├─ Blocks
  ├─ Transactions
  ├─ Accounts
  └─ Contracts
```

---

## Layout System

### Master-Detail Pattern

**All major sections should use this pattern:**

```
┌─────────────────────────────────────────────────┐
│  Header: Nav + Global Actions + User Menu       │
├────────────┬────────────────────────────────────┤
│            │                                    │
│  Sidebar   │  Main Content Area                 │
│  (Fixed)   │  (Scrollable)                      │
│            │                                    │
│  - Filters │  ┌──────────────────────────────┐ │
│  - Stats   │  │  Primary Panel               │ │
│  - Actions │  │  (Table, Chart, or Form)     │ │
│            │  └──────────────────────────────┘ │
│            │                                    │
│            │  ┌──────────────────────────────┐ │
│            │  │  Secondary Panel             │ │
│            │  └──────────────────────────────┘ │
│            │                                    │
└────────────┴────────────────────────────────────┘
```

### Grid System

**Use CSS Grid for all layouts:**

```css
/* Hero metrics: 4 columns on desktop, 2 on tablet, 1 on mobile */
.metrics-hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

/* Data-dense table layouts: 12-column system */
.layout-main {
  display: grid;
  grid-template-columns: 240px 1fr; /* sidebar + content */
  gap: 2rem;
}

/* Multi-panel workspace */
.workspace {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 1rem;
  height: calc(100vh - 60px);
}

.panel {
  grid-column: span 6;
  grid-row: span 3;
}

.panel-wide {
  grid-column: span 12;
}
```

---

## Component Library Expansion

### Missing Core Components

#### 1. Data Table with Advanced Features
```javascript
<DataTable
  columns={[
    { key: 'id', label: 'ID', sortable: true, width: '80px' },
    { key: 'provider', label: 'Provider', filterable: true },
    { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
    { key: 'status', label: 'Status', render: StatusPill },
  ]}
  data={receipts}
  selectable={true}
  onSelect={handleBulkSelect}
  pagination={{ pageSize: 50, total: 1000 }}
  stickyHeader={true}
  rowActions={[
    { icon: 'view', label: 'View Details', onClick: viewReceipt },
    { icon: 'flag', label: 'Flag for Review', onClick: flagReceipt },
  ]}
  bulkActions={[
    { label: 'Export Selected', onClick: exportReceipts },
    { label: 'Mark as Reviewed', onClick: markReviewed },
  ]}
/>
```

**Requirements:**
- Virtual scrolling for 10,000+ rows
- Column resizing and reordering
- Inline editing for specific fields
- Export to CSV/JSON
- Saved filter presets
- Row expansion for nested data

#### 2. Time-Series Chart Component
```javascript
<TimeSeriesChart
  data={blockTimes}
  xAxis={{ key: 'timestamp', format: 'HH:mm:ss' }}
  yAxis={[
    { key: 'blockTime', label: 'Block Time (ms)', color: '#3b82f6' },
    { key: 'tps', label: 'TPS', color: '#10b981', scale: 'right' },
  ]}
  annotations={[
    { type: 'line', value: 1000, label: 'Target', color: '#ef4444' },
  ]}
  zoom={true}
  brush={true}
  tooltip={(d) => `Block ${d.height}: ${d.blockTime}ms, ${d.tps} TPS`}
  timeWindow="24h"
  aggregation="1m"
/>
```

**Chart Types Needed:**
- Line (time series)
- Area (stacked market utilization)
- Bar (receipts per block)
- Scatter (latency distribution)
- Heatmap (activity by hour/day)
- Candlestick (price history)
- Network graph (peer connections)

#### 3. Modal Dialog System
```javascript
<Modal
  title="Receipt Details"
  size="large"
  onClose={closeModal}
  actions={[
    { label: 'Export', onClick: exportReceipt, variant: 'secondary' },
    { label: 'Flag Dispute', onClick: flagDispute, variant: 'danger' },
    { label: 'Close', onClick: closeModal },
  ]}
  tabs={[
    { id: 'details', label: 'Details', content: <ReceiptDetails /> },
    { id: 'subsidies', label: 'Subsidies', content: <SubsidyBreakdown /> },
    { id: 'disputes', label: 'Disputes', content: <DisputeTimeline /> },
  ]}
/>
```

#### 4. Filter Builder
```javascript
<FilterBuilder
  fields={[
    { key: 'market', label: 'Market', type: 'select', options: ['compute', 'energy', 'ad', 'storage'] },
    { key: 'provider', label: 'Provider ID', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1000000 },
    { key: 'timestamp', label: 'Date Range', type: 'daterange' },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['pending', 'complete', 'disputed'] },
  ]}
  onChange={handleFilterChange}
  presets={[
    { name: 'High Value', filters: { amount: { gte: 100000 } } },
    { name: 'Last 24h', filters: { timestamp: { gte: Date.now() - 86400000 } } },
  ]}
/>
```

#### 5. Status Timeline
```javascript
<Timeline
  events={[
    { timestamp: 1738534800, type: 'submitted', actor: 'provider-001', details: {...} },
    { timestamp: 1738534815, type: 'verified', actor: 'validator-042' },
    { timestamp: 1738534820, type: 'settled', actor: 'treasury', amount: 50000 },
    { timestamp: 1738534900, type: 'dispute_filed', actor: 'auditor-003', reason: 'Incorrect readings' },
  ]}
  groupBy="day"
  expandable={true}
/>
```

---

## Market-Specific UX Requirements

### Ad Market Dashboard

**Purpose:** Monitor ad bidding, campaign performance, cohort targeting, policy compliance

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Ad Market Overview                              │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Campaign Performance Grid         │
│            │  ┌────────┬────────┬────────┬─────┐│
│  Quick     │  │ Active │ Total  │ Avg    │ CTR ││
│  Stats     │  │ Camps  │ Spend  │ CPC    │     ││
│  ━━━━━━    │  └────────┴────────┴────────┴─────┘│
│  • Active  │                                    │
│    Cmpgns  │  ┌──────────────────────────────┐ │
│  • Total   │  │ Campaign List                │ │
│    Bids    │  │ ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓ │ │
│  • Budget  │  │ ┃ ID | Name | Spend | CTR ┃ │ │
│            │  │ ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛ │ │
│  Filters   │  └──────────────────────────────┘ │
│  ━━━━━━    │                                    │
│  ☐ Active  │  ┌────────────────┬──────────────┐│
│  ☐ Paused  │  │ Cohort         │ Policy       ││
│  ☐ Ended   │  │ Targeting      │ Compliance   ││
│            │  │ Breakdown      │ Status       ││
│  Actions   │  └────────────────┴──────────────┘│
│  ━━━━━━    │                                    │
│  + New     │                                    │
│    Campaign│                                    │
│  ↓ Export  │                                    │
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **Campaign Management**
   - Create/pause/resume campaigns
   - Budget allocation and spend tracking
   - Bid adjustment controls
   - Cohort targeting UI (age, geo, interests)

2. **Performance Metrics**
   - Impressions, clicks, conversions
   - Cost-per-click (CPC), cost-per-acquisition (CPA)
   - Click-through rate (CTR), conversion rate
   - Real-time spend vs budget gauge

3. **Cohort Analytics**
   - Audience segmentation tree
   - Demographic breakdown (charts)
   - Behavioral patterns
   - Lookalike audience suggestions

4. **Policy Compliance**
   - Content moderation status
   - Jurisdiction restrictions
   - Privacy compliance flags
   - Audit trail for policy changes

5. **Bidding Interface**
   - Auction participation list
   - Bid history timeline
   - Win rate analytics
   - Competitor analysis (anonymized)

**RPC Integration:**
- `ad_market.submit_bid` → form submission
- `ad_market.policy_snapshot` → compliance dashboard
- `ad_market.cohort_query` → audience builder
- `ad_market.list_campaigns` → table data (mock, needs backend)

### Energy Market Dashboard

**Purpose:** Monitor energy providers, meter readings, disputes, settlements, credit tracking

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Energy Market                                   │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Provider Map + Stats              │
│            │  ┌──────────────────────────────┐ │
│  Market    │  │ [ Geographic map with        │ │
│  Stats     │  │   provider markers ]         │ │
│  ━━━━━━    │  │                              │ │
│  • Total   │  └──────────────────────────────┘ │
│    Supply  │                                    │
│  • Demand  │  ┌────────┬────────┬────────────┐│
│  • Spot    │  │ Total  │ Active │ Avg Price  ││
│    Price   │  │ 1.2GWh │ 42     │ 0.05 B/kWh ││
│  • Credits │  └────────┴────────┴────────────┘│
│            │                                    │
│  Filters   │  ┌──────────────────────────────┐ │
│  ━━━━━━    │  │ Provider List                │ │
│  Juris.    │  │ Table: ID, Capacity, Price   │ │
│  [______]  │  │        Status, Last Reading  │ │
│            │  └──────────────────────────────┘ │
│  Status    │                                    │
│  ☐ Active  │  ┌────────────────┬──────────────┐│
│  ☐ Offline │  │ Meter Readings │ Disputes     ││
│            │  │ Timeline       │ Active: 3    ││
│  Actions   │  │                │ Resolved: 47 ││
│  ━━━━━━    │  └────────────────┴──────────────┘│
│  + Register│                                    │
│    Provider│                                    │
│  $ Settle  │                                    │
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **Provider Registry**
   - Registration form (capacity, jurisdiction, stake)
   - Provider profile pages
   - Trust root key management
   - Capacity utilization charts

2. **Meter Reading Submission**
   - Bulk upload interface (CSV)
   - Manual entry form with validation
   - Reading verification status
   - Reject reason display

3. **Credit Tracking**
   - Outstanding credits per provider
   - Credit mint history
   - Settlement timeline
   - Expiration alerts

4. **Dispute Management**
   - Dispute filing interface
   - Status tracking (pending, resolved, escalated)
   - Evidence upload
   - Resolution timeline
   - Slash history

5. **Settlement Interface**
   - Batch settlement dashboard
   - Manual settlement form
   - Settlement history table
   - Fee breakdown

6. **Market Analytics**
   - Supply vs demand chart (time series)
   - Spot price history
   - Provider reliability scores
   - Geographic distribution map

**RPC Integration:**
- `energy.register_provider` → registration form
- `energy.submit_reading` → meter reading form
- `energy.market_state` → provider list + stats
- `energy.settle` → settlement interface
- `energy.submit_dispute` → dispute form
- `energy.dispute_history` → disputes table

### Compute Market Dashboard

**Purpose:** Job submission, receipt auditing, provider SLAs, proof verification

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Compute Market                                  │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Job Queue + Active Jobs           │
│            │  ┌──────────────────────────────┐ │
│  Queue     │  │ Queue Depth: 127             │ │
│  Stats     │  │ Avg Wait: 4.2s               │ │
│  ━━━━━━    │  │ ┏━━━━━━━━━━━━━━━━━━━━━━━━┓ │ │
│  • Depth   │  │ ┃ Job ID | Provider | %   ┃ │ │
│  • Wait    │  │ ┗━━━━━━━━━━━━━━━━━━━━━━━━┛ │ │
│  • Thru.   │  └──────────────────────────────┘ │
│            │                                    │
│  Filters   │  ┌──────────────────────────────┐ │
│  ━━━━━━    │  │ Provider Performance         │ │
│  Status    │  │ SLA Compliance: 98.7%        │ │
│  [______]  │  │ Chart: Job completion times  │ │
│            │  └──────────────────────────────┘ │
│  Provider  │                                    │
│  [______]  │  ┌────────────────┬──────────────┐│
│            │  │ Recent Jobs    │ Proofs       ││
│  Actions   │  │ Table w/ drill │ Verification ││
│  ━━━━━━    │  │ down           │ Status       ││
│  + Submit  │  └────────────────┴──────────────┘│
│    Job     │                                    │
│  ↓ Export  │                                    │
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **Job Submission Form**
   - Code/binary upload
   - Resource specification (CPU, RAM, timeout)
   - Cost estimation
   - Provider selection (auto or manual)

2. **Job Queue Visualization**
   - Real-time queue depth chart
   - Wait time distribution
   - Priority levels
   - Throughput metrics

3. **Receipt Browser**
   - Filterable table (job ID, provider, status, amount)
   - Detail modal with full receipt payload
   - Subsidy breakdown
   - Dispute status

4. **Provider SLA Dashboard**
   - Completion rate
   - Average latency
   - Error rate
   - Proof verification success rate
   - Uptime chart

5. **Proof Verification**
   - Proof viewer (hex dump, parsed)
   - Verification status
   - Challenge mechanism UI
   - Dispute filing

**RPC Integration:**
- `compute_market.submit_job` → job submission form
- `compute_market.query_receipt` → receipt details
- `compute_market.list_providers` → provider selection
- `scheduler.stats` → queue metrics

### Storage Market Dashboard

**Purpose:** File uploads, rent tracking, retrieval verification, provider health

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Storage Market                                  │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Storage Overview                  │
│            │  ┌────────┬────────┬────────────┐│
│  Capacity  │  │ Total  │ Used   │ Available  ││
│  ━━━━━━    │  │ 10 PB  │ 3.2 PB │ 6.8 PB     ││
│  • Total   │  └────────┴────────┴────────────┘│
│  • Used    │                                    │
│  • Avail   │  ┌──────────────────────────────┐ │
│            │  │ File Manager                 │ │
│  Rent      │  │ ┏━━━━━━━━━━━━━━━━━━━━━━━━┓ │ │
│  Status    │  │ ┃ Name | Size | Expires  ┃ │ │
│  ━━━━━━    │  │ ┗━━━━━━━━━━━━━━━━━━━━━━━━┛ │ │
│  • Paid    │  │ [Upload] [Bulk Renew]     │ │
│  • Expiring│  └──────────────────────────────┘ │
│  • Overdue │                                    │
│            │  ┌────────────────┬──────────────┐│
│  Actions   │  │ Rent Escrow    │ Providers    ││
│  ━━━━━━    │  │ Balance: 5K B  │ Active: 28   ││
│  + Upload  │  │ Renewal Queue  │ Healthy: 26  ││
│  $ Renew   │  └────────────────┴──────────────┘│
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **File Upload Interface**
   - Drag-and-drop zone
   - Bulk upload support
   - Replication factor selector
   - Rent duration picker
   - Cost calculator

2. **File Manager**
   - Grid + list views
   - Search and filtering
   - Sorting (name, size, expiration)
   - File preview (images, text)
   - Batch operations (download, renew, delete)

3. **Rent Escrow Dashboard**
   - Current balance
   - Burn rate projection
   - Auto-renewal toggle
   - Top-up interface
   - Refund history

4. **Expiration Alerts**
   - Files expiring within 7 days
   - Auto-renewal status
   - Batch renewal interface

5. **Provider Health**
   - Availability percentage
   - Retrieval success rate
   - Average latency
   - Storage proof compliance

6. **Retrieval Verification**
   - Challenge-response interface
   - Proof verification status
   - Failure alerts

**RPC Integration:**
- `storage.put` → file upload
- `storage.get` → file download
- `storage.list` → file manager data
- `rent.escrow.balance` → escrow dashboard
- Storage receipts via `receipt.audit`

---

## Governance & Treasury UX

### Governance Dashboard

**Purpose:** Proposal creation, voting, parameter changes, history

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Governance                                      │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Active Proposals                  │
│            │  ┌──────────────────────────────┐ │
│  Stats     │  │ Proposal #42                 │ │
│  ━━━━━━    │  │ "Increase block size to 2MB" │ │
│  • Active  │  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│    Props   │  │ For: 67% | Against: 33%      │ │
│  • Voters  │  │ Ends in: 2d 4h               │ │
│  • Quorum  │  │ [Vote] [Details]             │ │
│            │  └──────────────────────────────┘ │
│  Status    │                                    │
│  ━━━━━━    │  ┌──────────────────────────────┐ │
│  ☐ Active  │  │ Proposal #41 [Passed]        │ │
│  ☐ Passed  │  │ "Adjust gas fees"            │ │
│  ☐ Rejected│  └──────────────────────────────┘ │
│            │                                    │
│  Actions   │  ┌──────────────────────────────┐ │
│  ━━━━━━    │  │ Governance Parameters        │ │
│  + Create  │  │ • Voting Period: 7 days      │ │
│    Proposal│  │ • Quorum: 40%                │ │
│  ⚖ My Votes│  │ • Proposal Bond: 1000 BLOCK  │ │
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **Proposal Browser**
   - Filterable list (active, passed, rejected, expired)
   - Proposal cards with vote breakdown
   - Time remaining countdown
   - Vote power indicator

2. **Proposal Detail View**
   - Full description (Markdown support)
   - Parameter changes diff
   - Vote tally (real-time)
   - Voter list with vote power
   - Discussion thread

3. **Voting Interface**
   - For/Against/Abstain buttons
   - Vote power calculator
   - Delegation support
   - Vote confirmation modal

4. **Proposal Creation Form**
   - Title and description
   - Parameter changes (key-value pairs with validation)
   - Bond requirement display
   - Preview mode

5. **History Timeline**
   - All proposals chronologically
   - Filter by outcome
   - Export to CSV

**RPC Integration:**
- `governance.proposals` → proposal list
- `governance.vote` → voting action
- `governance.create_proposal` → proposal submission

### Treasury Dashboard

**Purpose:** Balance monitoring, disbursement requests, approval workflow

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Treasury                                        │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Treasury Balance                  │
│            │  ┌──────────────────────────────┐ │
│  Balance   │  │ 5,234,567 BLOCK              │ │
│  ━━━━━━    │  │ Chart: Inflows vs Outflows   │ │
│  • Total   │  └──────────────────────────────┘ │
│  • Avail   │                                    │
│  • Locked  │  ┌──────────────────────────────┐ │
│            │  │ Pending Disbursements        │ │
│  Flows     │  │ ┏━━━━━━━━━━━━━━━━━━━━━━━━┓ │ │
│  ━━━━━━    │  │ ┃ ID | Recipient | Amount┃ │ │
│  • Inflows │  │ ┗━━━━━━━━━━━━━━━━━━━━━━━━┛ │ │
│  • Outflows│  └──────────────────────────────┘ │
│            │                                    │
│  Actions   │  ┌────────────────┬──────────────┐│
│  ━━━━━━    │  │ Disbursement   │ Approval     ││
│  + Request │  │ History        │ Workflow     ││
│    Disb.   │  └────────────────┴──────────────┘│
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **Balance Overview**
   - Current balance (large, prominent)
   - Historical balance chart
   - Inflow sources breakdown
   - Outflow categories

2. **Disbursement Request Form**
   - Recipient address
   - Amount with balance check
   - Purpose/description
   - Supporting documents upload

3. **Pending Disbursements**
   - Table with approval status
   - Detail modal with full request
   - Approve/Reject actions (if authorized)
   - Vote tally for governance-required requests

4. **History Explorer**
   - All disbursements with filters
   - Export functionality
   - Transaction links to block explorer

**RPC Integration:**
- `treasury.balance` → balance display
- `treasury.submit_disbursement` → request form
- `treasury.list_disbursements` → pending + history

---

## Operations & Monitoring

### Operations Dashboard

**Purpose:** Track all on-chain operations (jobs, receipts, settlements)

**Key Features:**
1. **Unified Operations Table**
   - All operation types in one view
   - Columns: ID, type, market, provider, amount, status, timestamp
   - Filters: market, status, date range, provider
   - Sort by any column
   - Infinite scroll or pagination

2. **Operation Detail Modal**
   - Full operation payload (JSON viewer)
   - Status timeline
   - Related operations (linked by transaction)
   - Actions: export, flag, retry

3. **Status Breakdown**
   - Pie chart: pending/complete/failed/disputed
   - Bar chart: operations per market
   - Line chart: operations over time

### Receipt Audit Trail

**Purpose:** Surface the `receipt.audit` RPC data with powerful filtering

**Key Features:**
1. **Advanced Filters**
   - Height range (slider)
   - Market (checkboxes)
   - Provider ID (text input with autocomplete)
   - Amount range (min/max)
   - Subsidy bucket (select)
   - Dispute status (select)

2. **Receipt Table**
   - Columns: block_height, receipt_type, amount, provider, digest, subsidies_total, dispute_count
   - Click row → detail modal
   - Export filtered results

3. **Detail Modal Tabs**
   - **Details:** Full receipt payload
   - **Subsidies:** Breakdown by bucket (storage, read, compute, ad, rebate)
   - **Disputes:** List with status, reason, timestamps
   - **Audit:** Query results, invariants, causality checks

4. **Subsidy Visualization**
   - Stacked area chart: subsidy totals over time
   - Breakdown by bucket
   - Market comparison

**RPC Integration:**
- `receipt.audit` → all receipt data

---

## Network Health & Diagnostics

### Comprehensive Network Dashboard

**Purpose:** Aggregate all network health metrics in one place

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Network Health                                  │
├────────────┬────────────────────────────────────┤
│  Sidebar   │  Overall Health Score: 94/100      │
│            │  ┌──────────────────────────────┐ │
│  Key       │  │ [Radial gauge chart]         │ │
│  Metrics   │  └──────────────────────────────┘ │
│  ━━━━━━    │                                    │
│  • Height  │  ┌────────┬────────┬────────────┐│
│  • TPS     │  │ Block  │ Final  │ Lag        ││
│  • Peers   │  │ 123456 │ 123450 │ 6 blocks   ││
│  • Latency │  └────────┴────────┴────────────┘│
│            │                                    │
│  Status    │  ┌──────────────────────────────┐ │
│  ━━━━━━    │  │ Consensus Performance        │ │
│  ● Synced  │  │ Chart: Block time, finality  │ │
│  ● Healthy │  └──────────────────────────────┘ │
│            │                                    │
│  Sections  │  ┌────────────────┬──────────────┐│
│  ━━━━━━    │  │ Peer Network   │ Validator    ││
│  • Peers   │  │ 42 connected   │ Set: 21      ││
│  • Valids  │  │ Map view       │ Stake: 98%   ││
│  • Markets │  └────────────────┴──────────────┘│
│  • Sched   │                                    │
└────────────┴────────────────────────────────────┘
```

**Key Features:**
1. **Health Score Calculation**
   - Weighted factors: consensus (30%), network (25%), markets (25%), scheduler (20%)
   - Color coding: 90-100 (green), 70-89 (yellow), <70 (red)
   - Drill-down to see factor breakdowns

2. **Consensus Metrics**
   - Block height vs finalized height
   - Finality lag chart
   - Block production rate (target vs actual)
   - Validator participation rate

3. **Peer Network**
   - Connected peers count
   - Geographic map (if IP geolocation available)
   - Peer list with latency, version, validator status
   - Connection timeline

4. **Market Health**
   - Utilization percentage per market
   - Provider count and health
   - Average margin (provider profitability)
   - 24h volume

5. **Scheduler Performance**
   - Queue depth (gauge)
   - Wait time distribution (histogram)
   - Throughput (ops/block)
   - Backlog alerts

**RPC Integration:**
- Aggregate from: consensus.*, ledger.*, scheduler.stats, peer.*, gateway.venue_status, analytics.*

---

## Advanced Features

### Multi-Panel Workspace

**Purpose:** Let users create custom layouts for their workflow

**Features:**
1. **Drag-and-Drop Panel Placement**
   - Click "Add Panel" → select widget type
   - Drag to resize and reposition
   - Snap to grid

2. **Widget Library**
   - Metrics card
   - Chart (select data source)
   - Table (select endpoint)
   - Log stream
   - Status indicator
   - Custom HTML/Markdown

3. **Layout Persistence**
   - Save layout with name
   - Load saved layouts
   - Export/import as JSON
   - Default layout for each role

4. **Multi-Monitor Support**
   - Detect screen count
   - Suggest optimal layouts
   - Full-screen mode per panel

### Real-Time Streaming

**Purpose:** Replace polling with WebSocket push

**Implementation:**
1. **WebSocket Client Refactor**
   - Single connection to `/ws`
   - Subscribe to specific channels: `metrics`, `receipts`, `operations`, `disputes`
   - Auto-reconnect with exponential backoff
   - Message queueing during disconnection

2. **Selective Subscriptions**
   ```javascript
   ws.subscribe('receipts', { market: 'energy', provider: 'energy-0x01' });
   ws.subscribe('operations', { status: 'pending' });
   ```

3. **Update Batching**
   - Collect updates for 100ms
   - Apply in single RAF callback
   - Diff DOM to minimize reflows

4. **Offline Handling**
   - Show banner when disconnected
   - Queue user actions
   - Replay on reconnect

### Keyboard Shortcuts

**Purpose:** Power user efficiency

**Shortcuts:**
- `/` → Focus search
- `g` then `d` → Go to dashboard
- `g` then `e` → Go to energy market
- `g` then `c` → Go to compute market
- `n` → New (context-aware: proposal, job, campaign)
- `?` → Show shortcuts help
- `Esc` → Close modal
- `Ctrl+K` → Command palette

### Command Palette

**Purpose:** Fuzzy search for all actions and navigation

**Features:**
- Open with `Ctrl+K`
- Type to filter: "energy settle", "create proposal", "export receipts"
- Keyboard navigation (up/down, enter)
- Recent actions history
- Keyboard shortcut hints

### Notifications & Alerts

**Purpose:** Proactive user awareness

**Features:**
1. **Toast Notifications**
   - Appear top-right
   - Auto-dismiss after 5s (error: 10s)
   - Click to expand details
   - Types: success, info, warning, error

2. **Alert Center**
   - Icon in header with unread count
   - Dropdown list of recent alerts
   - Filter by type
   - Mark all as read
   - Configurable rules (e.g., "Notify when receipt amount > 100K")

3. **Alert Types**
   - Dispute filed
   - Large transaction
   - Gate status change
   - Proposal voting ending soon
   - Low escrow balance
   - Provider offline

### Export & Reporting

**Purpose:** Data portability and compliance

**Features:**
1. **Export Formats**
   - CSV (for Excel)
   - JSON (for API consumers)
   - PDF (formatted report with charts)

2. **Export Options**
   - Current view (table filters applied)
   - Date range
   - Selected rows only
   - Include/exclude columns

3. **Scheduled Reports**
   - Daily/weekly/monthly
   - Email delivery
   - Configurable template

---

## Responsive Design Strategy

### Breakpoints
```css
/* Mobile first */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

### Mobile Adaptations
1. **Navigation:** Top bar → bottom bar with icons
2. **Sidebar:** Collapsible drawer (swipe from left)
3. **Tables:** Card view instead of table
4. **Charts:** Simplified, touch-friendly
5. **Modals:** Full-screen on mobile

### Tablet Optimizations
1. **Two-column layouts**
2. **Collapsible sidebar (always available)**
3. **Touch-friendly controls (larger hit targets)**

---

## Performance Optimizations

### Critical Rendering Path
1. **Inline critical CSS** (above-the-fold)
2. **Defer non-critical JS**
3. **Lazy-load images and charts**
4. **Code splitting by route**

### Data Management
1. **Client-side caching** (IndexedDB for large datasets)
2. **Paginate or virtualize lists >100 items**
3. **Debounce filters (300ms)**
4. **Memoize expensive calculations**

### Network Optimizations
1. **HTTP/2 multiplexing**
2. **Compression (gzip/brotli)**
3. **CDN for static assets** (if external hosting)
4. **Prefetch critical API calls**

### Rendering Optimizations
1. **requestAnimationFrame** for DOM updates
2. **Virtual scrolling** for tables (use library: `react-window` or vanilla IntersectionObserver)
3. **Canvas rendering** for complex charts (>1000 data points)
4. **Web Workers** for data processing (CSV parsing, calculations)

---

## Accessibility (A11y)

### WCAG 2.1 AA Compliance

1. **Keyboard Navigation**
   - All actions accessible via keyboard
   - Focus indicators visible
   - Tab order logical
   - Skip links ("Skip to main content")

2. **Screen Reader Support**
   - Semantic HTML (`<nav>`, `<main>`, `<article>`)
   - ARIA labels for icon buttons
   - ARIA live regions for dynamic updates
   - Alt text for all images

3. **Color Contrast**
   - Text: 4.5:1 minimum
   - UI components: 3:1 minimum
   - Don't rely on color alone (use icons + text)

4. **Motion & Animations**
   - Respect `prefers-reduced-motion`
   - Disable auto-play
   - Provide play/pause controls

5. **Forms**
   - Labels for all inputs
   - Error messages associated with fields
   - Validation on blur, not just submit

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. **Component Library**
   - DataTable
   - Modal
   - FilterBuilder
   - Chart wrapper (choose library: Chart.js, Recharts, or D3)

2. **Layout System**
   - Master-detail template
   - Responsive grid classes
   - Navigation refactor (with routing)

3. **RPC Client Enhancement**
   - Batch request support
   - Caching layer
   - Error handling improvements

### Phase 2: Markets (Week 3-5)
1. **Ad Market** (1 week)
   - Campaign list and detail
   - Bidding interface
   - Cohort builder
   - Policy dashboard

2. **Energy Market** (1 week)
   - Provider registry
   - Meter reading form
   - Dispute interface
   - Settlement dashboard

3. **Compute Market** (1 week)
   - Job submission
   - Queue visualization
   - Receipt browser
   - SLA dashboard

4. **Storage Market** (3 days)
   - File manager
   - Upload interface
   - Rent tracking

### Phase 3: Governance & Treasury (Week 6)
1. **Governance** (3 days)
   - Proposal browser
   - Voting interface
   - Creation form

2. **Treasury** (2 days)
   - Balance dashboard
   - Disbursement workflow

### Phase 4: Operations & Monitoring (Week 7)
1. **Operations Dashboard** (2 days)
2. **Receipt Audit Trail** (2 days)
3. **Network Health Refactor** (2 days)

### Phase 5: Advanced Features (Week 8-10)
1. **Multi-Panel Workspace** (1 week)
2. **Real-Time Streaming** (4 days)
3. **Keyboard Shortcuts & Command Palette** (3 days)
4. **Notifications** (3 days)
5. **Export & Reporting** (3 days)

### Phase 6: Polish (Week 11-12)
1. **Mobile responsive** (1 week)
2. **Accessibility audit** (3 days)
3. **Performance optimization** (4 days)

---

## Technical Specifications

### Recommended Libraries

**UI Components:**
- **Headless UI** (modals, dropdowns, tabs) – already styled
- **Radix UI** (primitives for complex components)
- **React Table** or **TanStack Table** (data tables)

**Charts:**
- **Recharts** (React-friendly, simple API)
- **Victory** (React Native compatible)
- **D3.js** (maximum flexibility, steeper learning curve)

**Forms:**
- **React Hook Form** (performance, easy validation)
- **Zod** (schema validation)

**State Management:**
- Keep existing `state.js` for global state
- Use **Zustand** if more structure needed
- React Context for scoped state

**Utilities:**
- **date-fns** (date manipulation, formatting)
- **lodash-es** (utilities, tree-shakeable)
- **clsx** (conditional class names)

**Build:**
- Keep Vite (fast, modern)
- Add **TypeScript** (optional but recommended for large codebase)

### File Structure

```
web/
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── DataTable.js
│   │   │   ├── Modal.js
│   │   │   ├── FilterBuilder.js
│   │   │   ├── Chart.js
│   │   │   ├── Timeline.js
│   │   │   └── StatusPill.js
│   │   ├── layout/
│   │   │   ├── Header.js
│   │   │   ├── Sidebar.js
│   │   │   ├── MasterDetail.js
│   │   │   └── WorkspaceGrid.js
│   │   ├── markets/
│   │   │   ├── AdMarket/
│   │   │   │   ├── CampaignList.js
│   │   │   │   ├── CampaignDetail.js
│   │   │   │   ├── BiddingInterface.js
│   │   │   │   └── CohortBuilder.js
│   │   │   ├── EnergyMarket/
│   │   │   │   ├── ProviderRegistry.js
│   │   │   │   ├── MeterReadingForm.js
│   │   │   │   ├── DisputeInterface.js
│   │   │   │   └── SettlementDashboard.js
│   │   │   ├── ComputeMarket/
│   │   │   │   ├── JobSubmission.js
│   │   │   │   ├── QueueVisualization.js
│   │   │   │   └── SLADashboard.js
│   │   │   └── StorageMarket/
│   │   │       ├── FileManager.js
│   │   │       ├── UploadInterface.js
│   │   │       └── RentTracking.js
│   │   ├── governance/
│   │   │   ├── ProposalBrowser.js
│   │   │   ├── ProposalDetail.js
│   │   │   ├── VotingInterface.js
│   │   │   └── ProposalCreationForm.js
│   │   ├── treasury/
│   │   │   ├── BalanceDashboard.js
│   │   │   └── DisbursementWorkflow.js
│   │   ├── operations/
│   │   │   ├── OperationsDashboard.js
│   │   │   ├── ReceiptAuditTrail.js
│   │   │   └── OperationDetailModal.js
│   │   └── network/
│   │       ├── NetworkHealth.js
│   │       ├── PeerList.js
│   │       └── ValidatorSet.js
│   ├── hooks/
│   │   ├── useRPC.js (existing rpc.js refactored)
│   │   ├── useWebSocket.js (existing ws.js refactored)
│   │   ├── useFilters.js
│   │   ├── usePagination.js
│   │   └── useKeyboardShortcuts.js
│   ├── utils/
│   │   ├── formatting.js (existing fmt)
│   │   ├── validation.js
│   │   ├── export.js (CSV, JSON, PDF generators)
│   │   └── calculations.js
│   ├── styles/
│   │   ├── base.css (reset, variables)
│   │   ├── layout.css (grid, flexbox utilities)
│   │   ├── components.css (component styles)
│   │   └── themes.css (light/dark mode)
│   ├── router.js (existing, extend with new routes)
│   ├── state.js (existing, extend as needed)
│   └── main.js (existing entry point)
└── docs/
    └── UX_TRANSFORMATION_SPEC.md (this file)
```

---

## Design System

### Color Palette

```css
:root {
  /* Neutrals */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f9fafb;
  --color-bg-tertiary: #f3f4f6;
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-border: #e5e7eb;

  /* Brand */
  --color-brand-primary: #3b82f6;
  --color-brand-secondary: #1d4ed8;
  --color-brand-light: #dbeafe;

  /* Semantic */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #3b82f6;

  /* Markets */
  --color-energy: #10b981;
  --color-compute: #3b82f6;
  --color-ad: #f59e0b;
  --color-storage: #8b5cf6;

  /* Charts */
  --color-chart-1: #3b82f6;
  --color-chart-2: #10b981;
  --color-chart-3: #f59e0b;
  --color-chart-4: #ef4444;
  --color-chart-5: #8b5cf6;
}

[data-theme="dark"] {
  --color-bg-primary: #111827;
  --color-bg-secondary: #1f2937;
  --color-bg-tertiary: #374151;
  --color-text-primary: #f9fafb;
  --color-text-secondary: #d1d5db;
  --color-text-tertiary: #9ca3af;
  --color-border: #374151;
}
```

### Typography

```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Fira Code', 'Consolas', monospace;

  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */

  --font-light: 300;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

### Spacing Scale

```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */
}
```

### Shadows

```css
:root {
  --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}
```

### Border Radius

```css
:root {
  --radius-sm: 0.25rem;  /* 4px */
  --radius-md: 0.375rem; /* 6px */
  --radius-lg: 0.5rem;   /* 8px */
  --radius-xl: 0.75rem;  /* 12px */
  --radius-full: 9999px;
}
```

---

## Testing Strategy

### Unit Tests
- All utility functions (`formatting.js`, `validation.js`)
- State management (`state.js`)
- RPC client (`rpc.js`)

### Component Tests
- Each reusable component
- Props validation
- Event handlers
- Accessibility (keyboard nav, screen reader)

### Integration Tests
- Full user flows (e.g., "Create campaign → submit bid → view receipt")
- RPC mocking with realistic responses
- WebSocket event handling

### E2E Tests
- Critical paths (using Playwright or Cypress)
- Multi-browser testing
- Mobile viewport testing

### Performance Tests
- Lighthouse CI (score >90 for performance, accessibility, best practices)
- Table rendering with 10,000 rows
- Chart rendering with 1,000+ data points

---

## Documentation Requirements

### Code Documentation
- JSDoc for all exported functions and components
- Inline comments for complex logic
- README for each major module

### User Documentation
- Help tooltips on hover
- Onboarding tour for new users
- Keyboard shortcuts reference
- Video tutorials for complex workflows

### API Documentation
- Keep `API_SPEC.md` updated
- Example requests/responses for all endpoints
- Error code reference

---

## Deployment Checklist

### Pre-Deploy
- [ ] All tests passing
- [ ] No console errors
- [ ] Accessibility audit (axe-core)
- [ ] Performance audit (Lighthouse)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile testing (iOS Safari, Chrome Android)
- [ ] Security audit (CSP headers, XSS protection)

### Deploy
- [ ] Build production bundle (`npm run build`)
- [ ] Minify and compress assets
- [ ] Set cache headers
- [ ] Configure CDN (if applicable)
- [ ] Update environment variables

### Post-Deploy
- [ ] Smoke test all critical flows
- [ ] Monitor error tracking (Sentry or equivalent)
- [ ] Check performance metrics
- [ ] Gather user feedback

---

## Success Metrics

### User Experience
- Time to complete common tasks (baseline vs after)
- Task success rate (can users find what they need?)
- User satisfaction score (survey)

### Performance
- Lighthouse score >90
- Time to Interactive <3s
- First Contentful Paint <1.5s
- No layout shifts (CLS <0.1)

### Engagement
- Daily active users
- Session duration
- Feature adoption rate (% users using advanced features)

### Technical
- Test coverage >80%
- Zero critical accessibility issues
- <5% error rate

---

## Conclusion

This specification transforms block-buster from a basic metrics dashboard into a comprehensive blockchain operations platform. The UX changes prioritize:

1. **Information density** – use screen space efficiently
2. **Real-time feedback** – WebSocket streaming, not polling
3. **Context preservation** – master-detail, breadcrumbs, deep linking
4. **Actionability** – every data point leads to an action
5. **Progressive disclosure** – overview → detail → action

**Implementation Priority:**
1. Component library (DataTable, Modal, Charts)
2. Market dashboards (Energy → Compute → Ad → Storage)
3. Governance & Treasury
4. Operations & Monitoring
5. Advanced features (workspace, shortcuts, notifications)

**Time Estimate:** 12 weeks for full implementation with one full-stack dev

**Dependencies Allowed:** Yes (unlike main blockchain repo), use best-in-class libraries for UX components

**1% Mentality Applied:** Every pixel, every interaction, every millisecond matters. No shortcuts, no "good enough" – only production-ready, enterprise-grade UX.

---

**End of Specification**

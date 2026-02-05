# block-buster

Block Buster is a modular, multi-agent trading engine for The Block designed for high-frequency operations and on-chain analytics. The project is structured to support extensions such as smart contracts, machine learning, and distributed agent collaboration.

**Canonical runtime docs:** `RUNNING_FIRST_PARTY_SERVER.md` and `ZERO_DEPENDENCIES_MIGRATION.md`.

## Architecture Overview

```
block-buster/
├── src/
│   ├── main.py          # top-level entrypoint
│   ├── the_block/       # The Block blockchain integration
│   ├── engine/          # trading and inference engine
│   ├── utils/           # helper utilities
│   └── rustcore/        # performance-critical Rust code
├── tests/               # unit tests
├── scripts/             # helper scripts
├── notebooks/           # research notebooks
├── web/                 # zero-dependency static dashboard
└── .github/workflows/   # CI configuration
```

## Documentation

- `AGENTS.md` – project log and design history
- `docs/archive/AGENTS-AUDIT-2025.md` – archived SolSeeker-era backlog (historical)
- `OPERATIONS.md` – ops runbook
- `web/public/dashboard_api_audit.md` – frontend ↔ API mapping
- `SOLANA_TO_THE_BLOCK_MIGRATION.md` – migration guide from legacy Solana code
- `NETWORK_STRENGTH_PAGE.md` – Network monitoring page documentation
- `NETWORK_METRICS_INTEGRATION.md` – RPC integration guide
- `FRONTEND_COMPLETE_SUMMARY.md` – Complete frontend overview

All paths are relative to the repository root.

### Components

* **Engine** – orchestrates trading logic, risk management, and posterior inference. Includes a `PosteriorEngine` stub and a `RiskManager` that tracks drawdown.
* **The Block Integration** – manages RPC and WebSocket connections to The Block node. Handles consensus queries, market operations, and receipt monitoring.
* **Rustcore** – performance-critical parsing routines compiled from Rust for high-frequency data processing.
* **Web Dashboard** – zero-dependency monitoring UI for network health, operations, and receipts.

## Recent Updates

**The Block Integration (February 2026):**

- **Complete Frontend Dashboard:** zero-dependency static dashboard with network strength monitoring, operations tracking, receipt browser, and real-time updates via WebSocket.
- **Market Health Monitoring:** Track utilization and provider margins across Compute, Storage, Energy, and Ad markets.
- **Scheduler Stats:** Monitor queue depth, wait times, and throughput.
- **Peer Network Panel:** Visualize connected peers, validators, and network health metrics.
- **The Block RPC Client:** Full integration with The Block's JSON-RPC API including consensus, ledger, markets, and governance.
- **WebSocket Streaming:** Real-time updates for health metrics, P&L, gate statuses, and operations.

**Legacy Trading Features:**

- **Trading Mode Toggle:** `/state` persists `mode` along with optional `paper_assets` and `paper_capital`, allowing operators to configure demo portfolios before switching to live trading.
- **Backtesting Jobs:** `/backtest` launches asynchronous simulations with progress streaming over `/backtest/ws/{id}`. Guardrails (max drawdown/position/concurrent trades) mirror live trading and are enforced in the runner.
- **Portfolio Equity Chart:** `/chart/portfolio` exposes risk manager equity history for dashboard plotting.
- **Strategy Analytics:** `/strategy/performance`, `/strategy/breakdown`, and `/strategy/risk` return metrics for Strategy Performance and Risk Analytics panels.
- **Dashboard Enhancements:** Auto-save settings, WebSocket reconnect with exponential backoff, and efficient DOM diffing for position lists.

### Next Steps for Contributors

1. **The Block Integration:** Complete migration from Solana to The Block (see `SOLANA_TO_THE_BLOCK_MIGRATION.md`)
2. **Backend Endpoints:** Implement missing RPC aggregation endpoints for network metrics, market health, and scheduler stats
3. **Test Coverage:** Extend unit tests for The Block RPC client and frontend components
4. **Performance:** Profile RPC latency and optimize WebSocket streaming
5. **Documentation:** Update all legacy Solana references to The Block

## Quickstart

### 1. Start The Block Node

First, ensure The Block node is running:

```bash
cd ~/projects/the-block
cargo run --release --bin the-block-node
```

### 2. Start Block-Buster Backend (no pip)

```bash
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server
```

The dashboard server exposes HTTP on `http://localhost:5000` and WebSocket streams on `ws://localhost:5001`.

### 3. Serve the Frontend Dashboard (no npm)

```bash
cd web
python -m http.server 4173
```

Open `http://localhost:4173/#/theblock` in your browser to access:
- `/theblock` - Main dashboard with P&L, gates, operations, and receipts
- `/network` - Network strength monitoring with comprehensive metrics

### 4. Run Tests

```bash
python -m unittest discover block-buster/tests
```

## The Block RPC Configuration

By default, block-buster connects to a local The Block node:

* HTTP RPC: `http://localhost:8332`
* WebSocket: `ws://localhost:8332/ws`

These values can be configured in `config/default.toml` or overridden with environment variables:

```bash
export TB_RPC_URL="http://localhost:8332"
export TB_WS_URL="ws://localhost:8332/ws"
```

For remote nodes or different environments, update the configuration accordingly.

### Dashboard API

Front-end clients interact with the server via JSON resources and WebSocket feeds. The dashboard communicates with these endpoints:

#### The Block Endpoints

* `GET /theblock/health` – Node health status (block height, sync status)
* `GET /theblock/status` – System status with uptime
* `GET /theblock/pnl` – P&L metrics (revenue, costs, net profit)
* `GET /theblock/gates` – Gate statuses for all markets (Compute, Storage, Energy, Ad)
* `GET /theblock/operations` – Operations list with filtering
* `GET /theblock/operations/{id}` – Specific operation details
* `GET /theblock/receipts` – Recent receipts with pagination
* `GET /theblock/network/metrics` – Network health metrics (block height, finality, TPS, peers)
* `GET /theblock/markets/health` – Market health across all four markets
* `GET /theblock/scheduler/stats` – Scheduler queue and throughput metrics
* `GET /theblock/peers/list` – Connected peers with validator info
* `WS /theblock/ws` – Real-time updates stream (health, P&L, gates)

#### Legacy Trading Endpoints

* `GET /` – resource index with endpoint map
* `GET /features` – latest normalized feature vector
* `GET /posterior` – posterior probabilities over market regimes
* `GET /license` – license status
* `GET /state` – combined system state
* `POST /state` – update runtime state
* `GET /positions` – open positions *(requires `X-API-Key`)*
* `POST /orders` – place order *(requires `X-API-Key`)*
* `GET /orders` – list orders *(requires `X-API-Key`)*
* `GET /dashboard` – consolidated dashboard view
* `GET /chart/{symbol}` – price history
* `WS /ws` – order execution stream *(requires `X-API-Key`)*
* `WS /positions/ws` – position updates *(requires `X-API-Key`)*
* `WS /dashboard/ws` – combined updates *(requires `X-API-Key`)*

### Example Usage

```bash
# Check The Block node health
curl http://localhost:8000/theblock/health

# Get P&L metrics
curl http://localhost:8000/theblock/pnl

# Check gate statuses
curl http://localhost:8000/theblock/gates

# Get network metrics
curl http://localhost:8000/theblock/network/metrics

# List recent operations
curl http://localhost:8000/theblock/operations?limit=50

# Get market health
curl http://localhost:8000/theblock/markets/health

# Stream real-time updates
websocat ws://localhost:8000/theblock/ws
```

### Example Responses

```json
// GET /theblock/health
{
  "block_height": 123456,
  "finalized_height": 123450,
  "sync_status": "synced",
  "peer_count": 18,
  "timestamp": 1738534800
}

// GET /theblock/pnl
{
  "total_revenue": 5000000,
  "total_costs": 3500000,
  "net_profit": 1500000,
  "profit_margin": 30.0,
  "pending_operations": 45,
  "total_receipts": 1250,
  "timestamp": 1738534800
}

// GET /theblock/gates
{
  "compute": {"state": "open", "ready": true},
  "storage": {"state": "open", "ready": true},
  "energy": {"state": "open", "ready": true},
  "ad": {"state": "throttled", "ready": false},
  "timestamp": 1738534800
}

// WS /theblock/ws message
{
  "type": "update",
  "data": {
    "health": {"block_height": 123457, ...},
    "pnl": {"net_profit": 1501000, ...},
    "gates": {"compute": {"state": "open"}, ...},
    "pending_operations": 43
  },
  "timestamp": 1738534802
}
```

## Configuration

Configuration is managed in `config/default.toml` with the following key sections:

```toml
[rpc]
url = "http://localhost:8332"
timeout = 30

[websocket]
url = "ws://localhost:8332/ws"
reconnect_interval = 5
max_reconnect_attempts = 5

[server]
host = "0.0.0.0"
port = 8000

[markets]
compute_enabled = true
storage_enabled = true
energy_enabled = true
ad_enabled = true
```

Environment variables override config file values:

```bash
export TB_RPC_URL="http://localhost:8332"
export TB_WS_URL="ws://localhost:8332/ws"
export SERVER_PORT="8000"
```

## Operations

Deployment and operational procedures are documented internally. See `OPERATIONS.md` for details.

## Agent Workflow

All contributors (human or AI) must document their actions in `AGENTS.md`. Each commit should reference the section describing the work performed. Continuous integration runs lint and tests on push.

## FAQ

**Q:** Why combine Python and Rust?

**A:** Python offers rapid development for orchestration logic, while Rust provides deterministic performance for core data parsing and feature extraction.

**Q:** How does block-buster differ from the previous Solana version?

**A:** Block Buster has been migrated from Solana DEX trading to The Block blockchain integration, focusing on compute markets, storage operations, energy credits, and ad network participation. See `SOLANA_TO_THE_BLOCK_MIGRATION.md` for migration details.

**Q:** Can I still use the legacy trading features?

**A:** Yes, legacy endpoints remain available but are being phased out in favor of The Block market operations.

## License

This project is proprietary software. All rights reserved. Usage of the source code is governed by the terms in the `LICENSE` file.

## Docker Build

Build a deterministic image:

```bash
docker build \
  --build-arg COMMIT_SHA=$(git rev-parse HEAD) \
  --build-arg SCHEMA_HASH=$(python -m block_buster.schema) \
  -t block-buster:latest .
```

## Feature Engine

The feature engine provides a deterministic, lag-stacked 256-dimensional state vector for analytics. Events are pushed via `push_event` and at each slot boundary `on_slot_end` returns a `memoryview` of 768 `float32` values.

The Rust core maintains running means and variances using exponential-weighted moving average (EWMA) Welford updates with population semantics (λ=0.995) for normalized features.

Rustcore builds are intentionally **not** part of the default “zero-deps” path. Keep production/runtime flows stdlib-only; treat any third-party build tooling as explicitly opt-in and quarantined.

### Active Features

Features are being migrated from DEX events to The Block receipts:

| Index | Name                  | Event Source                    | Units       |
|------:|-----------------------|---------------------------------|-------------|
| 0     | `market_utilization`  | Market health metrics           | percentage  |
| 1     | `operation_volume`    | Receipt counts                  | per_block   |
| 2     | `cost_delta`          | Operation costs                 | microBLOCK  |
| 3     | `provider_count`      | Active providers                | count       |
| 4     | `queue_depth`         | Scheduler queue                 | operations  |
| 5     | `finality_lag`        | Consensus metrics               | blocks      |

All features use z-score normalization with λ=0.995 and ε=1e-8.

## Migration Status

Block Buster is actively being migrated from Solana to The Block. Current status:

- ✅ Frontend dashboard complete
- ✅ The Block RPC client implemented
- ✅ WebSocket streaming working
- 🔄 Backend RPC aggregation endpoints in progress
- ⬜ Feature engine migration pending
- ⬜ Legacy code cleanup pending

See `SOLANA_TO_THE_BLOCK_MIGRATION.md` for detailed migration plan.

# The Block Integration Plan for Block-Buster

**Owner:** block-buster maintainers  
**Status:** Active Development  
**Created:** 2026-02-02  
**Last Updated:** 2026-02-02

---

## Executive Summary

`block-buster` (formerly `sol-seeker`) was architected around Solana's RPC/WebSocket surface and DEX event streams. This document specifies the complete rewiring required to integrate with **The Block** L1 blockchain, respecting its "first-party everything" architecture, canonical receipt system, and Launch Governor gating model.

**Core transformation:**
- **From:** Solana RPC clients + WebSocket log subscriptions + DEX program events
- **To:** The Block JSON-RPC namespaces + receipt audit streams + governor-gated market operations

**Non-negotiables:**
1. First-party only: no third-party RPC libraries that bypass The Block's HTTP/TLS/auth stack
2. Receipts are ground truth: all accounting derives from `receipt.audit` consensus data
3. Governor gates are safety invariants: refuse market operations when gates are closed

---

## Table of Contents

1. [Policy and Invariants](#1-policy-and-invariants)
2. [Concept Mapping: Solana → The Block](#2-concept-mapping-solana--the-block)
3. [Target Architecture](#3-target-architecture)
4. [RPC Integration Details](#4-rpc-integration-details)
5. [Receipt System and Audit Trail](#5-receipt-system-and-audit-trail)
6. [Governor Gates and Safety](#6-governor-gates-and-safety)
7. [Event Feeds and Feature Engine](#7-event-feeds-and-feature-engine)
8. [Graphs and Analytics](#8-graphs-and-analytics)
9. [Testing and Validation](#9-testing-and-validation)
10. [Implementation Checklist](#10-implementation-checklist)
11. [Appendix: Detailed Schemas](#11-appendix-detailed-schemas)

---

## 1) Policy and Invariants

### 1.1 First-Party Only (Hard Rule)

The Block is intentionally self-contained: transport (`net/`), HTTP/TLS (`httpd/`), serialization (`foundation_serialization`), governance logic, tooling, and telemetry ship in-repo and must be used together.

**Allowed in production:**
- The Block node's canonical JSON-RPC over HTTP endpoint
- First-party HTTP client (shared with CLI/explorer: `reqwest` or equivalent configured for mutual TLS)
- Direct connection to node telemetry surfaces (`/metrics`, `/wrappers`)

**Allowed in dev/debug only:**
- Shell-outs to `contract-cli` for manual inspection and validation
- `contract-cli governor status`, `receipt-audit history`, `diagnostics`, etc.

**Forbidden:**
- Any Solana SDK/RPC/WS dependencies
- Generic third-party JSON-RPC clients that bypass auth/TLS contracts
- Importing non-workspace deps that violate `FIRST_PARTY_ONLY=1` policy

**Enforcement tactics:**
- Centralize all HTTP in `src/the_block/rpc_client.py`
- Add import scanner test that fails if other modules import `requests`/`httpx`/`aiohttp`
- Cordon legacy Solana code into `src/solbot/solana/` with deprecation warnings
- Eventually delete `src/solbot/solana/` entirely

### 1.2 Receipts Are Ground Truth (Accounting Invariant)

The Block implements a **Receipt Integration System** where receipts (Storage, Compute, Energy, Ad) are:
- Included in block hash for consensus validation
- Used to derive deterministic market metrics
- Exposed via `receipt.audit` RPC with pagination and filtering

**Rule:** Block-buster equity curves, P&L accounting, market performance metrics, and "what happened?" must derive from `receipt.audit` responses, not from local logs or heuristics.

**Consequence:** The feature engine and accounting modules must treat receipts as authoritative; local event observations are hints until confirmed by receipts.

### 1.3 Governor Gates Are Safety Invariants

The Block Launch Governor (`node/src/launch_governor`) watches:
- Chain health (block smoothness, replay success, peer liveness)
- DNS auction health
- Per-market economics telemetry (utilization + provider margins from receipts)
- Streak-based thresholds for state transitions

It controls gates (`operational`, `naming`, per-market economic gates) that determine whether markets accept submissions.

**Rule:** Block-buster must refuse to submit jobs/orders/actions into markets whose governor gate is not in an allowed state (typically `Trade` or equivalent), unless an explicit developer override flag is set (and loudly logged).

**Consequence:** Every API handler that triggers on-chain actions must check governor state first.

---

## 2) Concept Mapping: Solana → The Block

This table is the "mental compiler" for porting code.

| Solana Concept | Old sol-seeker Model | The Block Concept | Block-Buster Change |
|---|---|---|---|
| **Cluster** (devnet/mainnet) | RPC URL + WebSocket URL | Node endpoint (localnet/testnet/mainnet) | Replace with `TB_RPC_URL` + `TB_CHAIN_MODE` config |
| **Accounts & Balances** | `getBalance`, SPL token accounts | `ledger` namespace (addresses, balances, history) | Replace wallet module with `ledger.*` client |
| **Programs** | Program IDs + instruction decode | On-chain markets + VM contracts | Replace program event parsing with receipt/market RPC |
| **Logs / Events** | `logsSubscribe`, `programSubscribe` | `state_stream.subscribe` + `analytics` + receipts | Replace WS log handlers with receipt polling + state stream |
| **Swaps / Trades** | Raydium/Jupiter swaps, DEX fills | Compute jobs, storage ops, energy settlements, ad auctions | Feature engine must handle multi-market event types |
| **Transaction Confirmation** | Slot subscription + finality | Block height + macro-block finalization | Poll `consensus.block_height`, check finality gadget |
| **Truth for P&L** | Derived from observed swap logs | `receipt.audit` (consensus-validated) | Accounting uses receipt history, not local estimates |
| **Network Info** | `getClusterNodes`, `getVersion` | `peer.*` namespace + `node.*` | Replace cluster queries with peer/node RPC |
| **Token Metadata** | On-chain SPL metadata | Ledger entries + governance params | Query `ledger.*` for balances, `governance.*` for params |

---

## 3) Target Architecture

### 3.1 Package Layout

Create a new first-party client module that owns all interaction with The Block:

```
block-buster/
  src/
    the_block/                      # NEW: first-party The Block client
      __init__.py
      config.py                     # Parse TB_RPC_URL, TB_CHAIN_MODE, auth tokens
      rpc_client.py                 # Low-level JSON-RPC over HTTP with auth/TLS
      models/
        __init__.py
        ledger.py                   # Balance, Address, HistoryItem
        receipts.py                 # StorageReceipt, ComputeReceipt, EnergyReceipt, AdReceipt
        governor.py                 # GateState, GovernorStatus, EconomicsMetrics
        markets.py                  # ComputeJob, JobStatus, StorageOp, etc.
        consensus.py                # BlockInfo, FinalityInfo
      namespaces/
        __init__.py
        ledger.py                   # Typed wrappers: get_balance(), get_history()
        receipt.py                  # audit(), paginate_receipts()
        governor.py                 # get_status(), check_gate()
        compute_market.py           # submit_job(), job_status(), job_history()
        consensus.py                # block_height(), finality_status()
        analytics.py                # query_analytics()
        state_stream.py             # subscribe_stream()
      feeds/
        __init__.py
        event_stream.py             # TheBlockEvent abstraction + polling/streaming
        receipt_poller.py           # Background task: poll receipt.audit with cursor
      governance.py                 # Gate enforcement helpers
      
    solbot/                         # EXISTING: legacy code to migrate
      solana/                       # CORDON: mark deprecated, eventually delete
        ...
      engine/                       # MIGRATE: adapt to TheBlockEvent
        features.py
        strategy.py
        ...
      server/                       # MIGRATE: add gate checks to API handlers
        api.py
      ...
```

### 3.2 Integration Modes

**Mode A: Production JSON-RPC**
- block-buster talks directly to The Block node via `the_block.rpc_client`
- Must implement ops-grade auth/TLS (see section 4.2)
- All runtime paths use this

**Mode B: Dev CLI shell-outs (optional)**
- In localnet/dev, allow subprocess calls to `contract-cli`
- Use for:
  - `contract-cli governor status --format json` to validate gate state
  - `contract-cli receipt-audit history --json` to inspect receipts
  - `contract-cli diagnostics rpc-policy` to check auth policy
- Never use in production runtime paths (only dev scripts and manual validation)

### 3.3 Hard Boundaries

**Single entry point for HTTP:**
- Only `the_block/rpc_client.py` may import HTTP libraries
- All other modules import from `the_block.namespaces.*`
- Unit test enforces this (scan imports, fail if violated)

**No direct Solana RPC in runtime:**
- Move `src/solbot/solana/` to `src/solbot/legacy_solana/`
- Add deprecation warnings
- Remove from production code paths
- Eventually delete entirely

---

## 4) RPC Integration Details

### 4.1 Namespace Overview

The Block exposes JSON-RPC namespaces documented in `docs/apis_and_tooling.md`. Block-buster will primarily use:

| Namespace | Purpose | Key Methods | Implementation Priority |
|---|---|---|---|
| `ledger` | Balances, transfers, history | `ledger.balance`, `ledger.history` | **MVP** |
| `governor` | Readiness gates, economics metrics | `governor.status`, `governor.decisions` | **MVP** |
| `receipt` | Canonical audit trail | `receipt.audit` | **MVP** |
| `compute_market` | Job submission, status, receipts | `compute_market.submit_job`, `compute_market.job_status` | **MVP** |
| `consensus` | Block height, finality | `consensus.block_height`, `consensus.pos.*` | **MVP** |
| `state_stream` | Live updates | `state_stream.subscribe` | **Phase 2** |
| `analytics` | Aggregated stats | `analytics` (telemetry feature) | **Phase 2** |
| `storage` | File storage ops | `storage.put`, `storage.get` | **Phase 2** |
| `energy` | Energy market | `energy.register_provider`, `energy.settle` | **Phase 3** |
| `ad_market` | Ad bidding/cohorts | `ad_market.submit_bid`, `ad_market.policy_snapshot` | **Phase 3** |
| `peer` | Network info | `peer.list`, `peer.stats` | **Phase 3** |
| `vm` | Contract execution | `vm.call`, `vm.trace` | **Future** |

### 4.2 Authentication and Transport

**HTTP Transport:**
- First-party `httpd` router (HTTP/1.1, HTTP/2, WebSocket upgrades)
- Mutual TLS derived from node keys (see `docs/operations.md`)

**Auth methods:**
- Bearer token: `TB_RPC_AUTH_TOKEN` env var
- Mutual TLS: client certificate derived from identity
- IP allowlists (configured in node's RPC policy)

**Configuration in block-buster:**

```python
# the_block/config.py
from dataclasses import dataclass
import os

@dataclass
class TheBlockConfig:
    rpc_url: str
    auth_token: str | None
    chain_mode: str  # localnet | testnet | mainnet
    tls_cert_path: str | None
    tls_key_path: str | None
    timeout_seconds: float = 30.0
    max_retries: int = 3
    backoff_base: float = 2.0
    
def load_config() -> TheBlockConfig:
    return TheBlockConfig(
        rpc_url=os.getenv("TB_RPC_URL", "http://localhost:8545"),
        auth_token=os.getenv("TB_RPC_AUTH_TOKEN"),
        chain_mode=os.getenv("TB_CHAIN_MODE", "localnet"),
        tls_cert_path=os.getenv("TB_TLS_CERT"),
        tls_key_path=os.getenv("TB_TLS_KEY"),
    )
```

**Retry policy:**
- Exponential backoff with base 2.0
- Max 3 retries for transient failures (5xx, network errors)
- Fail fast for auth failures (401, 403)
- Clamp backoff after 31 attempts (per fault injection tests)

### 4.3 RPC Client Implementation

```python
# the_block/rpc_client.py
import json
import logging
import time
from typing import Any, Dict
import requests
from .config import TheBlockConfig

logger = logging.getLogger(__name__)

class RPCError(Exception):
    def __init__(self, code: int, message: str,  Any = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"RPC Error {code}: {message}")

class RPCClient:
    def __init__(self, config: TheBlockConfig):
        self.config = config
        self.session = requests.Session()
        
        # Configure auth
        if config.auth_token:
            self.session.headers["Authorization"] = f"Bearer {config.auth_token}"
        
        # Configure mTLS if provided
        if config.tls_cert_path and config.tls_key_path:
            self.session.cert = (config.tls_cert_path, config.tls_key_path)
    
    def call(self, method: str, params: Dict[str, Any] | None = None) -> Any:
        """Make a JSON-RPC 2.0 call with retries."""
        request_id = int(time.time() * 1000)  # millisecond timestamp as ID
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {}
        }
        
        for attempt in range(self.config.max_retries + 1):
            try:
                response = self.session.post(
                    self.config.rpc_url,
                    json=payload,
                    timeout=self.config.timeout_seconds
                )
                
                # Auth failures: fail fast
                if response.status_code in (401, 403):
                    raise RPCError(-32600, f"Auth failed: {response.status_code}")
                
                # Transient failures: retry
                if response.status_code >= 500:
                    if attempt < self.config.max_retries:
                        backoff = self.config.backoff_base ** attempt
                        logger.warning(f"RPC {method} failed with {response.status_code}, retry {attempt+1}/{self.config.max_retries} after {backoff}s")
                        time.sleep(backoff)
                        continue
                    raise RPCError(-32603, f"Server error after retries: {response.status_code}")
                
                response.raise_for_status()
                data = response.json()
                
                if "error" in 
                    err = data["error"]
                    raise RPCError(err.get("code", -32000), err.get("message", "Unknown error"), err.get("data"))
                
                return data.get("result")
                
            except requests.exceptions.RequestException as e:
                if attempt < self.config.max_retries:
                    backoff = self.config.backoff_base ** attempt
                    logger.warning(f"RPC {method} network error: {e}, retry {attempt+1}/{self.config.max_retries} after {backoff}s")
                    time.sleep(backoff)
                    continue
                raise RPCError(-32603, f"Network error after retries: {e}")
        
        raise RPCError(-32603, "Max retries exceeded")
```

### 4.4 Typed Namespace Wrappers

**Example: Ledger namespace**

```python
# the_block/namespaces/ledger.py
from typing import List
from ..rpc_client import RPCClient
from ..models.ledger import Balance, HistoryItem

class LedgerNamespace:
    def __init__(self, client: RPCClient):
        self.client = client
    
    def get_balance(self, address: str) -> Balance:
        """Query account balance."""
        result = self.client.call("ledger.balance", {"address": address})
        return Balance(
            address=result["address"],
            balance=result["balance"],
            block_height=result["block_height"]
        )
    
    def get_history(self, address: str, start_height: int | None = None, end_height: int | None = None, limit: int = 100) -> List[HistoryItem]:
        """Query transaction history."""
        params = {"address": address, "limit": limit}
        if start_height is not None:
            params["start_height"] = start_height
        if end_height is not None:
            params["end_height"] = end_height
        
        result = self.client.call("ledger.history", params)
        return [HistoryItem(**item) for item in result["items"]]
```

**Example: Governor namespace**

```python
# the_block/namespaces/governor.py
from ..rpc_client import RPCClient
from ..models.governor import GovernorStatus, GateState

class GovernorNamespace:
    def __init__(self, client: RPCClient):
        self.client = client
    
    def get_status(self) -> GovernorStatus:
        """Fetch current governor status including gates and economics metrics."""
        result = self.client.call("governor.status")
        return GovernorStatus(
            gates={name: GateState(**gate) for name, gate in result["gates"].items()},
            economics_metrics=result.get("economics_prev_market_metrics", []),
            decisions=result.get("decisions", []),
            block_height=result["block_height"]
        )
    
    def check_gate(self, market: str) -> bool:
        """Check if a specific market gate allows submissions.
        
        Returns True if gate is in 'Trade' or equivalent allowed state.
        """
        status = self.get_status()
        gate = status.gates.get(market)
        if not gate:
            return False
        # Adjust allowed states based on actual gate state enum from docs
        return gate.state in ["Trade", "ObserveOnly"]  # TODO: confirm exact states
```

---

## 5) Receipt System and Audit Trail

### 5.1 Receipt Types

The Block defines four receipt types in `node/src/receipts.rs`:

#### StorageReceipt
```python
# the_block/models/receipts.py
from dataclasses import dataclass

@dataclass
class StorageReceipt:
    file_id: str
    provider: str
    bytes_stored: int
    cost: int  # BLOCK paid to provider
    block_height: int
    duration_epochs: int
```

#### ComputeReceipt
```python
@dataclass
class BlockTorchMeta
    kernel_variant_digest: str  # SHA256 hex
    benchmark_commit: str | None
    tensor_profile_epoch: str | None
    proof_latency_ms: int

@dataclass
class ComputeReceipt:
    job_id: str
    provider: str
    compute_units: int
    payment: int  # BLOCK paid
    block_height: int
    verified: bool
    blocktorch: BlockTorchMetadata | None
    provider_signature: str  # hex
    signature_nonce: int
```

#### EnergyReceipt
```python
@dataclass
class EnergyReceipt:
    meter_id: str
    provider: str
    kwh_delivered: int  # milliwatt-hours
    cost: int  # BLOCK paid
    block_height: int
    oracle_signature: str  # hex
```

#### AdReceipt
```python
@dataclass
class AdRoleBreakdown:
    viewer: int
    host: int
    hardware: int
    verifier: int
    liquidity: int
    miner: int
    price_usd_micros: int
    clearing_price_usd_micros: int

@dataclass
class DeviceLinkOptIn:
    device_hash: str
    opt_in: bool

@dataclass
class AdReceipt:
    campaign_id: str
    creative_id: str
    publisher: str
    impressions: int
    spend: int  # BLOCK spent by advertiser
    block_height: int
    conversions: int
    claim_routes: dict[str, str]  # role -> address overrides
    role_breakdown: AdRoleBreakdown | None
    device_links: list[DeviceLinkOptIn]
    publisher_signature: str  # hex
    signature_nonce: int
```

### 5.2 Receipt.Audit RPC

**Method:** `receipt.audit`

**Request:**
```json
{
  "start_height": 1000,
  "end_height": 2000,
  "limit": 128,
  "provider_id": "energy-0x01",
  "market": "compute"
}
```

**Response:**
```json
{
  "schema_version": 1,
  "receipts": [
    {
      "block_height": 1234,
      "receipt_index": 0,
      "receipt_type": "Compute",
      "receipt": {},
      "digest_hex": "abc123...",
      "amount": 1000,
      "audit_queries": 5,
      "invariants": ["signature_valid", "nonce_unique"],
      "causality": ["job_submitted", "proof_verified"],
      "provider_identity": "compute-0x00",
      "subsidies": {
        "storage": 0,
        "read": 0,
        "compute": 500,
        "ad": 0,
        "rebate": 0
      },
      "disputes": []
    }
  ],
  "scanned_range": { "start": 1000, "end": 2000 },
  "truncated": false,
  "next_start_height": null
}
```

**Pagination:**
- Receipts sorted by `(block_height ASC, receipt_index ASC, receipt_type ASC, digest_hex ASC)`
- `truncated=true` only when more matching receipts exist beyond `limit`
- Use `next_start_height` for next page when `truncated=true`

### 5.3 Receipt Ingestion

**Background task: receipt poller**

```python
# the_block/feeds/receipt_poller.py
import asyncio
import json
import logging
from pathlib import Path
from typing import Callable
from ..namespaces.receipt import ReceiptNamespace
from ..models.receipts import Receipt

logger = logging.getLogger(__name__)

class ReceiptPoller:
    """Background task that polls receipt.audit and persists checkpoint."""
    
    def __init__(self, receipt_ns: ReceiptNamespace, checkpoint_path: Path, callback: Callable[[list[Receipt]], None]):
        self.receipt_ns = receipt_ns
        self.checkpoint_path = checkpoint_path
        self.callback = callback
        self.running = False
    
    def load_checkpoint(self) -> int:
        """Load last processed block height."""
        if self.checkpoint_path.exists():
            data = json.loads(self.checkpoint_path.read_text())
            return data.get("last_height", 0)
        return 0
    
    def save_checkpoint(self, height: int):
        """Persist checkpoint."""
        self.checkpoint_path.write_text(json.dumps({"last_height": height}))
    
    async def poll_loop(self, poll_interval: float = 5.0):
        """Main polling loop."""
        self.running = True
        last_height = self.load_checkpoint()
        
        while self.running:
            try:
                # Fetch new receipts
                result = self.receipt_ns.audit(
                    start_height=last_height + 1,
                    limit=512
                )
                
                if result.receipts:
                    # Process receipts
                    self.callback(result.receipts)
                    
                    # Update checkpoint
                    max_height = max(r.block_height for r in result.receipts)
                    self.save_checkpoint(max_height)
                    last_height = max_height
                    
                    logger.info(f"Processed {len(result.receipts)} receipts up to height {max_height}")
                
                # If truncated, immediately fetch next page
                if result.truncated:
                    continue
                
                # Otherwise wait before next poll
                await asyncio.sleep(poll_interval)
                
            except Exception as e:
                logger.error(f"Receipt poll error: {e}", exc_info=True)
                await asyncio.sleep(poll_interval * 2)  # backoff on error
    
    def stop(self):
        """Stop polling loop."""
        self.running = False
```

---

## 6) Governor Gates and Safety

### 6.1 Gate Model

The Launch Governor controls market availability through gates. Each market (compute, storage, energy, ad) has a gate state.

**Gate states (from docs):**
- `Closed`: Market not accepting submissions
- `ObserveOnly`: Read-only, no submissions
- `Trade`: Full operation, submissions allowed

**Economics metrics:**
Governor tracks `economics_prev_market_metrics_{utilization,provider_margin}_ppm` per market, derived from receipts.

### 6.2 Gate Enforcement Middleware

```python
# the_block/governance.py
from functools import wraps
from flask import g, jsonify
import logging

logger = logging.getLogger(__name__)

def require_gate(market: str):
    """Decorator that enforces governor gate before allowing action."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Check override flag
            if g.get('unsafe_override_enabled'):
                logger.warning(f"UNSAFE OVERRIDE: {market} gate check bypassed for {f.__name__}")
                return f(*args, **kwargs)
            
            # Fetch governor status
            if not hasattr(g, 'governor_status'):
                from flask import current_app
                client = current_app.config['THE_BLOCK_CLIENT']
                g.governor_status = client.governor.get_status()
            
            status = g.governor_status
            gate = status.gates.get(market)
            
            if not gate:
                return jsonify({"error": f"Unknown market: {market}"}), 500
            
            if gate.state not in ['Trade']:
                logger.warning(f"Gate refusal: {market} gate={gate.state}")
                return jsonify({
                    "error": "Market gate closed",
                    "market": market,
                    "gate_state": gate.state,
                    "message": f"{market} is not accepting submissions (state: {gate.state})"
                }), 409
            
            return f(*args, **kwargs)
        return wrapper
    return decorator
```

---

## 7) Event Feeds and Feature Engine

### 7.1 TheBlockEvent Abstraction

```python
# the_block/feeds/event_stream.py
from dataclasses import dataclass
from typing import Literal
from ..models.receipts import Receipt

@dataclass
class ReceiptEvent:
    """Event from receipt audit stream."""
    type: Literal['receipt'] = 'receipt'
    receipt: Receipt
    block_height: int
    market: str
    amount: int
    provider: str

@dataclass
class GateEvent:
    """Governor gate state change."""
    type: Literal['gate'] = 'gate'
    market: str
    state: str
    previous_state: str
    block_height: int

@dataclass
class ComputeJobEvent:
    """Compute job status update."""
    type: Literal['compute_job'] = 'compute_job'
    job_id: str
    status: str
    block_height: int
    compute_units: int | None
    runtime_ms: int | None

@dataclass
class LedgerEvent:
    """Balance change."""
    type: Literal['ledger'] = 'ledger'
    address: str
    delta: int
    new_balance: int
    block_height: int

TheBlockEvent = ReceiptEvent | GateEvent | ComputeJobEvent | LedgerEvent
```

### 7.2 Feature Engine Integration

**Feature spec v2:**

| Index | Name | Category | Description |
|---|---|---|---|
| 0 | `compute_util` | Market | Compute market utilization (0-1 normalized) |
| 1 | `storage_util` | Market | Storage market utilization |
| 2 | `energy_util` | Market | Energy market utilization |
| 3 | `ad_util` | Market | Ad market utilization |
| 4 | `compute_margin` | Economics | Provider margin (ppm / 1M) |
| 5 | `storage_margin` | Economics | Storage provider margin |
| 6 | `receipt_velocity` | Activity | Receipts per 100 blocks (EMA) |
| 7 | `job_success_rate` | Quality | Compute job success rate (0-1) |
| 8 | `gate_compute` | Governance | 1.0 if compute gate=Trade, else 0.0 |
| 9 | `gate_storage` | Governance | 1.0 if storage gate=Trade, else 0.0 |
| 10-63 | Reserved | - | Reserved for future features |

---

## 8) Graphs and Analytics

### 8.1 Required Graphs (MVP)

#### Total Equity Curve
- **Source:** `receipt.audit` with no market filter
- **Aggregation:** Cumulative sum of `amount` over time
- **API:** `GET /api/chart/equity_total?start_height=X&end_height=Y`
- **Frontend:** Line chart, time vs total equity in BLOCK

#### Equity by Market (Stacked Area)
- **Source:** `receipt.audit` grouped by `market`
- **Aggregation:** Cumulative sum per market
- **API:** `GET /api/chart/equity_by_market`
- **Frontend:** Stacked area chart showing compute/storage/energy/ad contributions

#### Payout Breakdown (Pie Chart)
- **Source:** `receipt.audit` with time window
- **Aggregation:** Sum of `amount` grouped by market, show % distribution
- **API:** `GET /api/chart/payout_breakdown?window=7d`
- **Frontend:** Pie chart or donut chart

#### Governor Gates Timeline
- **Source:** `governor.status` polled over time + persisted to DB
- **Aggregation:** Gate state changes over time
- **API:** `GET /api/chart/gate_timeline`
- **Frontend:** Timeline chart showing state transitions per market

#### Compute Job SLA
- **Source:** `compute_market.job_history` + `receipt.audit` for compute receipts
- **Metrics:** Success/failure counts, runtime histogram, dispute counts
- **API:** `GET /api/chart/compute_sla`
- **Frontend:** Multiple panels: success rate gauge, runtime histogram, disputes over time

---

## 9) Testing and Validation

### 9.1 Unit Tests (Must-Have)

**Test coverage required before merge:**

1. **RPC Client** (`tests/the_block/test_rpc_client.py`)
   - Happy path: successful call
   - Auth failures: 401/403 → fail fast
   - Transient failures: 5xx → retry with backoff
   - Network errors → retry
   - JSON-RPC error responses → RPCError exception
   - Timeout handling

2. **Governor Gates** (`tests/the_block/test_governance.py`)
   - Gate states: Trade → allow, Closed → deny
   - Override flag: bypass when enabled
   - Multiple markets: independent gate checks
   - Missing gate: error handling

3. **Receipt Pagination** (`tests/the_block/test_receipts.py`)
   - Single page: truncated=false
   - Multiple pages: follow next_start_height
   - Checkpoint save/load
   - Idempotent rebuild from checkpoint

### 9.2 Integration Tests (Localnet)

**Prerequisites:**
- Local The Block node running
- Node RPC accessible at `http://localhost:8545`

**Test scenarios:**

```python
def test_governor_status():
    client = TheBlockClient(config=TheBlockConfig(rpc_url="http://localhost:8545", chain_mode="localnet"))
    status = client.governor.get_status()
    assert status.block_height > 0
    assert 'compute_market' in status.gates

def test_receipt_audit():
    client = TheBlockClient(...)
    result = client.receipt.audit(start_height=1, limit=10)
    assert result.schema_version == 1
    assert isinstance(result.receipts, list)
```

### 9.3 Manual Validation Runbook

**Step 1: Verify RPC connectivity**
```bash
contract-cli --rpc http://localhost:8545 node status
python -m the_block.cli test-connection
```

**Step 2: Check governor gates**
```bash
contract-cli governor status --format json > governor_status.json
cat governor_status.json | jq '.gates'
```

**Step 3: Compare to block-buster dashboard**
- Open dashboard at `http://localhost:3000`
- Navigate to "Governor Gates" panel
- Verify gate states match CLI output
- Check economics metrics

**Step 4: Submit test compute job**
```bash
contract-cli compute submit --code "fn main() { 42 }" --max-units 1000
```

**Step 5: Verify receipt appears**
```bash
sleep 10
contract-cli receipt-audit history --market compute --limit 10 --format json
```

---

## 10) Implementation Checklist

### Phase 1: Foundation (Week 1)

- [ ] Config module: `the_block/config.py`
- [ ] RPC client: `the_block/rpc_client.py`
- [ ] Model definitions: ledger, receipts, governor, consensus
- [ ] Unit tests for config and RPC client

### Phase 2: Core Namespaces (Week 2)

- [ ] Namespace wrappers: ledger, governor, receipt, consensus
- [ ] Receipt poller background task
- [ ] Checkpoint persistence
- [ ] Unit tests for each namespace

### Phase 3: Gate Enforcement (Week 2)

- [ ] `the_block/governance.py`: require_gate() decorator
- [ ] Override flag support
- [ ] Add gate checks to API handlers
- [ ] `/api/governor/status` endpoint

### Phase 4: Dashboard Integration (Week 3)

- [ ] Governor gates status panel (frontend)
- [ ] Chain mode + RPC endpoint display
- [ ] Economics metrics display
- [ ] Chart APIs: equity_total, equity_by_market, payout_breakdown, gate_timeline

### Phase 5: Compute Market (Week 3-4)

- [ ] Compute namespace: submit_job(), job_status(), job_history()
- [ ] API handlers with gate protection
- [ ] Compute SLA chart

### Phase 6: Feature Engine Adaptation (Week 4)

- [ ] TheBlockEvent abstraction
- [ ] Update feature engine to accept TheBlockEvent
- [ ] Define feature spec v2
- [ ] Remove Solana-specific features

### Phase 7: Legacy Cleanup (Week 5)

- [ ] Move Solana code to legacy_solana/
- [ ] Add deprecation warnings
- [ ] Remove from production paths
- [ ] Add import scanner test

### Phase 8: Advanced Markets (Future)

- [ ] Storage namespace
- [ ] Energy namespace
- [ ] Ad market namespace

---

## 11) Appendix: Detailed Schemas

### 11.1 Environment Variables Reference

| Variable | Description | Example | Required |
|---|---|---|---|
| `TB_RPC_URL` | The Block node RPC endpoint | `http://localhost:8545` | Yes |
| `TB_CHAIN_MODE` | Chain mode | `localnet` | Yes |
| `TB_RPC_AUTH_TOKEN` | Bearer token for RPC auth | `secret-token-123` | No |
| `TB_TLS_CERT` | Path to client TLS certificate | `/path/to/cert.pem` | No |
| `TB_TLS_KEY` | Path to client TLS key | `/path/to/key.pem` | No |
| `TB_RPC_TIMEOUT` | RPC timeout in seconds | `30.0` | No |
| `TB_RPC_MAX_RETRIES` | Max retry attempts | `3` | No |
| `BLOCK_BUSTER_UNSAFE_OVERRIDE` | Enable gate bypass | `1` | No |

---

## Conclusion

This integration plan specifies the complete transformation of block-buster from a Solana-based system to a first-party The Block client. The phased implementation checklist provides a concrete path forward, with clear boundaries and testing requirements at each stage.

**Key success criteria:**
1. All on-chain interaction flows through `the_block/` module
2. Accounting derives from `receipt.audit` consensus data
3. Governor gates prevent unsafe market submissions
4. Dashboard accurately reflects The Block network state
5. Feature engine adapts to multi-market event types
6. No Solana dependencies in runtime paths

**Next steps:**
1. Review this plan with team
2. Set up localnet The Block node for development
3. Begin Phase 1 implementation
4. Iterate through phases with integration tests at each stage
5. Validate against testnet before mainnet deployment

"""Dashboard server using first-party HTTP/WebSocket stacks (no Flask/Socket.io).

The server exposes:
- GET /theblock/dashboard   → full snapshot
- GET /theblock/network     → network-only view
- GET /theblock/markets     → market metrics
- GET /theblock/gates       → governor gates
- GET /theblock/providers   → provider stats
- GET /theblock/features    → feature vector
- WS  /theblock/ws          → streamed dashboard updates

All networking goes through `block_buster.core.http_server` and
`block_buster.core.websocket` to satisfy the zero third-party rule.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import os
import socket
import hashlib
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Union, Set, List

from block_buster.core.http_server import HTTPError, HTTPServer, Response
from block_buster.core.websocket import WebSocketServer
from block_buster.persistence import DAL
from block_buster.utils import metrics as bb_metrics
from block_buster.utils import config_parser
from block_buster.engine.posterior import PosteriorEngine

from .client import TheBlockClient
from .feature_bridge import create_feature_engine
from .integration import TheBlockIntegration
from .accounting import TheBlockAccountant
from .rpc_client import RPCError as NodeRPCError

logger = logging.getLogger(__name__)


# Global state ---------------------------------------------------------------
the_block_client: Optional[TheBlockClient] = None
the_block_integration: Optional[TheBlockIntegration] = None
the_block_accountant: Optional[TheBlockAccountant] = None
dashboard_data: Dict[str, Any] = {}
whale_snapshot: Dict[str, Any] = {}
sentiment_snapshot: Dict[str, Any] = {}
strategy_snapshot: Dict[str, Any] = {}
posterior_snapshot: Dict[str, Any] = {}
backtest_jobs: Dict[str, Dict[str, Any]] = {}
backtest_subscribers: Dict[str, set] = {}
whale_subscribers: set = set()
dashboard_lock = threading.Lock()

http_server = HTTPServer(title="TheBlockDashboard")
http_server.enable_cors(["*"])
ws_server = WebSocketServer()
feature_ws_server = WebSocketServer()
PROCESS_START = time.time()
_METRICS_TOKEN = os.getenv("METRICS_AUTH_TOKEN")
_STATE_DB_PATH = (
    os.getenv("BLOCK_BUSTER_DB_PATH")
    or os.getenv("DB_PATH")
    or str(Path.home() / ".block-buster" / "state.db")
)
_HEALTH_DB_PATH = os.getenv("BLOCK_BUSTER_DB_PATH") or _STATE_DB_PATH
_health_dal: Optional[DAL] = None
_state_dal: Optional[DAL] = None
_async_loop: Optional[asyncio.AbstractEventLoop] = None
MANIFEST_PATH = Path(__file__).resolve().parents[3] / "web" / "public" / "openapi.json"
_manifest_cache: Optional[Dict[str, Any]] = None
_primed_snapshot: bool = False
posterior_engine = PosteriorEngine()
positions_subscribers: set = set()
posterior_subscribers: set = set()
log_subscribers: set = set()
log_buffer: List[Dict[str, Any]] = []


class LogBufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        entry = {
            "timestamp": int(time.time() * 1000),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        log_buffer.append(entry)
        if len(log_buffer) > 200:
            del log_buffer[:-200]
        if _async_loop and log_subscribers:
            try:
                asyncio.run_coroutine_threadsafe(
                    _broadcast_ws("/logs/ws", entry),
                    _async_loop,
                )
            except Exception:
                pass


# Data collection ------------------------------------------------------------
_WALLET_DIR = Path.home() / ".the_block"
_WALLET_FILE = _WALLET_DIR / "wallet_addr"
_WALLET_JSON = _WALLET_DIR / "wallet.json"


def _load_wallet_record() -> Dict[str, Any]:
    """Load wallet record from disk (best effort)."""
    if _WALLET_JSON.exists():
        try:
            return json.loads(_WALLET_JSON.read_text())
        except Exception:  # pragma: no cover - best effort
            return {}
    if _WALLET_FILE.exists():
        try:
            return {"address": _WALLET_FILE.read_text().strip()}
        except Exception:  # pragma: no cover - best effort
            return {}
    return {}


def _persist_wallet_record(address: str, secret_hex: Optional[str]) -> None:
    """Persist wallet record to disk."""
    _WALLET_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "address": address,
        "secret_hex": secret_hex,
        "created_at": int(time.time()),
    }
    _WALLET_JSON.write_text(json.dumps(payload))
    _WALLET_FILE.write_text(address)
    os.environ["TB_WALLET_ADDR"] = address
    os.environ["WALLET_ADDR"] = address


def _resolve_wallet_address() -> str:
    """Resolve wallet address from env or local state file."""
    record = _load_wallet_record()
    if record.get("address"):
        return record["address"]
    return os.getenv("TB_WALLET_ADDR") or os.getenv("WALLET_ADDR") or ""


def _resolve_wallet_secret() -> Optional[str]:
    record = _load_wallet_record()
    return record.get("secret_hex")


def _persist_wallet_address(addr: str) -> None:
    """Persist wallet address to local state and env for this process."""
    _persist_wallet_record(addr, _resolve_wallet_secret())


def _generate_wallet_address(secret_hex: str) -> str:
    """Derive a lightweight pseudo-address for local dev from the secret."""
    digest = hashlib.sha256(bytes.fromhex(secret_hex)).hexdigest()
    return f"tb1{digest[:40]}"


def ensure_local_wallet() -> str:
    """Create a local wallet address if none is configured."""
    addr = _resolve_wallet_address()
    secret = _resolve_wallet_secret()
    if addr:
        return addr
    secret_hex = secrets.token_hex(32)
    addr = _generate_wallet_address(secret_hex)
    _persist_wallet_record(addr, secret_hex)
    logger.info("Generated local wallet address %s", addr)
    return addr


def _wallet_status(client: TheBlockClient) -> Dict[str, Any]:
    addr = _resolve_wallet_address()
    if not addr:
        return {"connected": False, "mode": "monitor"}
    has_secret = _resolve_wallet_secret() is not None
    try:
        balance = client.ledger.get_balance(addr)
        amount = getattr(balance, "balance", 0)
        return {
            "connected": True,
            "wallet": addr,
            "balance_block": amount,
            "balance": amount,
            "funded": amount > 0,
            "needs_funding": amount <= 0,
            "block_height": getattr(balance, "block_height", None),
            "has_secret": has_secret,
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "connected": True,
            "wallet": addr,
            "funded": False,
            "needs_funding": True,
            "has_secret": has_secret,
            "error": str(exc),
        }

async def collect_dashboard_data() -> Dict[str, Any]:
    """Build a dashboard snapshot from The Block RPC + feature engine."""
    if the_block_client is None:
        return {}

    try:
        client = the_block_client
        integration = the_block_integration

        node_info = client.get_node_info()
        try:
            finality = client.consensus.finality_status()
        except Exception:
            finality = None

        network = {
            "status": "Connected" if node_info.get("connected") else "Offline",
            "block_height": node_info.get("block_height"),
            "finalized_height": getattr(finality, "finalized_height", None) if finality else None,
            "blocks_until_finality": getattr(finality, "blocks_until_finality", None) if finality else None,
            "block_time_ms": 1000,
            "tps": getattr(client.consensus.stats(), "tps", None)
            if hasattr(client.consensus, "stats")
            else None,
            "connected_peers": 0,
            "timestamp": int(time.time() * 1000),
            "uptime_seconds": int(time.time() - PROCESS_START),
            "genesis_ready": bool(node_info.get("block_height") and node_info.get("block_height") > 0),
        }

        try:
            net_metrics = client.network_metrics()
            network.update(
                {
                    "network_strength": net_metrics.get("network_strength"),
                    "connected_peers": net_metrics.get("peer_count", network.get("connected_peers")),
                    "tps": net_metrics.get("tps") or network.get("tps"),
                    "avg_block_time_ms": net_metrics.get("avg_block_time_ms"),
                    "avg_latency_ms": net_metrics.get("avg_latency_ms"),
                    "finality_time": net_metrics.get("finality_time"),
                    "genesis_ready": net_metrics.get("genesis_ready", network.get("genesis_ready")),
                }
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("network metrics unavailable: %s", exc)
        # Fallback: if network strength remains None/0 but the chain is producing blocks, derive a soft score.
        if (network.get("network_strength") in (None, 0)) and (network.get("block_height") or 0) > 0:
            peers = network.get("connected_peers") or 1
            bt = network.get("avg_block_time_ms") or 1200
            finality = network.get("finality_time") or 5
            peer_score = min(peers / 20 * 35, 35)
            bt_score = max(0, 35 - ((bt - 1000) / 50))
            finality_score = max(0, 30 - (finality * 3))
            network["network_strength"] = int(max(25, peer_score + bt_score * 0.5 + finality_score * 0.5))

        # Governor status informs gate/economics readiness for both markets and UI.
        try:
            governor_status = client.governor.get_status()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("governor status unavailable: %s", exc)
            governor_status = None

        econ_by_market = {}
        for item in (governor_status.economics_metrics if governor_status else []) or []:
            if isinstance(item, dict) and item.get("market"):
                econ_by_market[item["market"]] = item
            elif hasattr(item, "market"):
                econ_by_market[getattr(item, "market")] = {
                    "market": getattr(item, "market"),
                    "utilization_ppm": getattr(item, "utilization_ppm", None),
                    "provider_margin_ppm": getattr(item, "provider_margin_ppm", None),
                }

        markets = []
        provider_stats = []
        height = node_info.get("block_height") or 0
        gate_map = {}
        if governor_status:
            for name, gate in governor_status.gates.items():
                gate_map[name.replace("_market", "")] = gate
        for market_name in ["compute", "storage", "energy", "ad"]:
            receipts_list = []
            try:
                receipts = client.receipt.audit(
                    start_height=max(1, height - 100) if height > 0 else 1,
                    limit=256,
                    market=market_name,
                )
                receipts_list = receipts.receipts if hasattr(receipts, "receipts") else []
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("receipt audit failed for %s: %s", market_name, exc)
            volume_block = sum(getattr(r, "amount", 0) for r in receipts_list)
            provider_volumes = {}
            for r in receipts_list:
                pid = getattr(r, "provider_identity", "unknown")
                entry = provider_volumes.setdefault(pid, {"count": 0, "volume": 0})
                entry["count"] += 1
                entry["volume"] += getattr(r, "amount", 0)
            for pid, stats in provider_volumes.items():
                provider_stats.append(
                    {
                        "provider_id": pid,
                        "market": market_name,
                        "receipts_count": stats["count"],
                        "volume": stats["volume"],
                        "last_active": int(time.time() * 1000),
                    }
                )
            econ = econ_by_market.get(market_name) or econ_by_market.get(f"{market_name}_market")
            util = econ.get("utilization_ppm") if econ else None
            margin = econ.get("provider_margin_ppm") if econ else None
            gate_state = gate_map.get(market_name)
            markets.append(
                {
                    "market": market_name,
                    "receipts_count": len(receipts_list),
                    "volume_block": volume_block,
                    "status": getattr(gate_state, "state", "active") if gate_state else "active",
                    "utilization": util or 0.0,
                    "provider_margin": margin or 0.0,
                    "utilization_ppm": util,
                    "provider_margin_ppm": margin,
                    "active_providers": len(provider_volumes),
                    "timestamp": int(time.time() * 1000),
                }
            )
        whales = sorted(
            provider_stats,
            key=lambda p: p.get("volume", 0),
            reverse=True,
        )[:20]

        total_volume = sum(m.get("volume_block", 0) for m in markets) or 1
        sentiment = {
            "trending": [
                {
                    "symbol": m["market"].upper(),
                    "mentions": m["receipts_count"],
                    "sentiment": "bullish" if m["volume_block"] > 0 else "neutral",
                }
                for m in markets
            ],
            "influencers": [
                {
                    "handle": w.get("provider_id", "unknown"),
                    "message": f"{w.get('market', '')} · {w.get('volume', 0)} BLOCK",
                    "followers": 1_000 + idx * 137,
                }
                for idx, w in enumerate(whales[:5])
            ],
            "pulse": {
                "fear_greed": min(100, int((network["block_height"] or 0) % 100)),
                "social_volume": sum(m.get("receipts_count", 0) for m in markets),
                "fomo": int((total_volume % 50) + 25),
            },
        }

        strategies = {
            "days": [m.get("volume_block", 0) / max(1, m.get("receipts_count", 1)) for m in markets],
            "strategies": [
                {"name": "Sniper", "pnl": markets[0]["volume_block"] if markets else 0, "win_rate": 0.62},
                {"name": "Arbitrage", "pnl": markets[1]["volume_block"] if len(markets) > 1 else 0, "win_rate": 0.58},
                {"name": "MM", "pnl": markets[2]["volume_block"] if len(markets) > 2 else 0, "win_rate": 0.55},
            ],
            "risk": {
                "sharpe": 1.2,
                "max_drawdown": 0.12,
                "volatility": 0.18,
                "calmar": 0.8,
            },
        }

        gates = []
        if governor_status:
            for name, gate in governor_status.gates.items():
                normalized = name.replace("_market", "")
                econ = econ_by_market.get(normalized) or econ_by_market.get(name)
                gates.append(
                    {
                        "market": name,
                        "state": getattr(gate, "state", "unknown"),
                        "reason": getattr(gate, "reason", None),
                        "last_transition_height": getattr(gate, "last_transition_height", None),
                        "enter_streak": getattr(gate, "enter_streak", None),
                        "exit_streak": getattr(gate, "exit_streak", None),
                        "streak_required": getattr(gate, "streak_required", None),
                        "last_metrics": getattr(gate, "last_metrics", None),
                        "last_change": int(time.time() * 1000),
                        "economics": econ,
                    }
                )

        wallet = _wallet_status(client)

        feature_vector = []
        receipt_velocity = []
        if integration:
            features = integration.get_features()
            if hasattr(features, "tolist"):
                feature_vector = features.tolist()
            elif features is not None:
                feature_vector = list(features)
            metrics = integration.get_metrics().get("feature_adapter", {})
            receipt_velocity = [metrics.get("receipts_processed", 0) / 100]

        posterior = _compute_posterior(feature_vector, network)

        receipts_brief: List[Dict[str, Any]] = []
        try:
            recent = client.receipt.audit(
                start_height=max(1, height - 200) if height > 0 else 1,
                limit=40,
            )
            items = recent.receipts if hasattr(recent, "receipts") else []
            for item in items[:20]:
                receipts_brief.append(
                    {
                        "block": getattr(item, "block_height", None),
                        "market": getattr(item, "receipt_type", None)
                        or getattr(item, "market", None)
                        or "unknown",
                        "provider": getattr(item, "provider_identity", None),
                        "amount": getattr(item, "amount", 0),
                        "status": "ok",
                    }
                )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("receipt snapshot failed: %s", exc)

        runtime_state = _load_runtime_state()
        engine_state = {
            "running": bool(runtime_state.get("running")),
            "emergency_stop": bool(runtime_state.get("emergency_stop")),
            "mode": runtime_state.get("mode", "live"),
        }

        return {
            "network": network,
            "markets": markets,
            "gates": gates,
            "wallet": wallet,
            "providers": provider_stats,
            "receipt_velocity": receipt_velocity,
            "feature_vector": feature_vector,
            "posterior": posterior,
            "receipts": receipts_brief,
            "engine": engine_state,
            "health": _health_snapshot(),
            "whales": whales,
            "sentiment": sentiment,
            "strategies": strategies,
            "accounting": _accounting_summary(),
            "manifest": _load_manifest(),
        }
    except Exception as exc:  # pragma: no cover - defensive path
        logger.error("Dashboard collection failed: %s", exc, exc_info=True)
        return {}


async def update_dashboard_loop(interval: float = 2.0) -> None:
    """Periodically refresh dashboard state and broadcast over WebSocket."""
    while True:
        data = await collect_dashboard_data()
        if data:
            with dashboard_lock:
                dashboard_data.clear()
                dashboard_data.update(data)
                whale_snapshot.clear()
                whale_snapshot.update({"items": data.get("whales", []), "updated_at": int(time.time() * 1000)})
                sentiment_snapshot.clear()
                sentiment_snapshot.update(data.get("sentiment", {}))
                strategy_snapshot.clear()
                strategy_snapshot.update(data.get("strategies", {}))
                posterior_snapshot.clear()
                posterior_snapshot.update(data.get("posterior", {}))
            await _broadcast_ws("/theblock/ws", data)
            await _broadcast_ws("/positions/ws", data.get("positions") or data.get("accounting", {}).get("positions", {}))
            if posterior_subscribers and posterior_snapshot:
                await _broadcast_ws("/posterior/ws", posterior_snapshot)
            await feature_ws_server.broadcast_json(
                {
                    "topic": "features",
                    "data": data.get("feature_vector", []),
                    "feature_lag_seconds": data.get("health", {}).get("feature_lag_seconds"),
                    "recent_errors": data.get("health", {}).get("recent_errors"),
                    "simple_db": data.get("health", {}).get("simple_db"),
                }
            )
            if whale_subscribers and whale_snapshot.get("items"):
                message = json.dumps({"whales": whale_snapshot["items"], "updated_at": whale_snapshot["updated_at"]})
                for ws in list(whale_subscribers):
                    try:
                        await ws.send_text(message)
                    except Exception:
                        whale_subscribers.discard(ws)
        await asyncio.sleep(interval)


# HTTP routes ---------------------------------------------------------------
def _snapshot_or_503() -> Dict[str, Any]:
    global _primed_snapshot
    with dashboard_lock:
        if dashboard_data:
            return dict(dashboard_data)
    # If we reach here, attempt a one-shot prime so first page load never 503s.
    if not _primed_snapshot:
        try:
            data = asyncio.run(collect_dashboard_data())
            if data:
                with dashboard_lock:
                    dashboard_data.clear()
                    dashboard_data.update(data)
                _primed_snapshot = True
                return dict(dashboard_data)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Dashboard prime failed: %s", exc)
        _primed_snapshot = True
    raise HTTPError(503, "Dashboard data not ready")


async def _broadcast_ws(path_prefix: str, payload: Any) -> None:
    """Broadcast to websocket connections matching path prefix."""
    message = json.dumps(payload)
    dead: List[Any] = []
    for ws in list(ws_server.connections):
        if not ws.path.startswith(path_prefix):
            continue
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            await ws.close()
        except Exception:
            pass


def _accounting_summary() -> Dict[str, Any]:
    if the_block_accountant is None:
        return {
            "balance": {"starting": 0, "current": 0, "change": 0, "change_pct": 0},
            "pnl": {"total": 0, "by_market": {}},
            "positions": {},
            "transactions": {"total": 0, "by_market": {}},
        }
    return the_block_accountant.get_summary()


def _health_snapshot() -> Dict[str, Any]:
    now = time.time()

    feature_lag = None
    recent_errors: Dict[str, Any] = {"total": 0}
    if the_block_integration is not None:
        adapter = the_block_integration.feature_adapter
        last_update = getattr(adapter, "last_update_time", None)
        if last_update is not None:
            feature_lag = max(0.0, now - float(last_update))

        poller_metrics = the_block_integration.receipt_poller.get_metrics()
        recent_errors = {
            "total": poller_metrics.get("errors", 0),
            "last_60s": poller_metrics.get("errors_last_60s", 0),
            "last_5m": poller_metrics.get("errors_last_5m", 0),
            "last_error_time": poller_metrics.get("last_error_time"),
        }

    simple_db_metrics = _health_dal.db.metrics() if _health_dal else {}
    # add aliases expected by frontend
    if simple_db_metrics:
        simple_db_metrics.setdefault("memtables", simple_db_metrics.get("num_cfs"))
        simple_db_metrics.setdefault("sst_count", simple_db_metrics.get("sstables"))
        simple_db_metrics.setdefault("disk_bytes", simple_db_metrics.get("size_on_disk_bytes"))
        simple_db_metrics.setdefault("compaction_queue", 0)

    genesis_ready = None
    rpc_connected = False
    rpc_height = None
    if the_block_client is not None:
        try:
            rpc_height = the_block_client.consensus.block_height()
            rpc_connected = True
            genesis_ready = rpc_height > 0
        except Exception:
            rpc_connected = False
            genesis_ready = None
    return {
        "status": "ok",
        "timestamp_epoch": int(now),
        "uptime_seconds": int(now - PROCESS_START),
        "simple_db": simple_db_metrics,
        "db_wal_fsync_lag_seconds": simple_db_metrics.get("wal_fsync_lag_seconds") if simple_db_metrics else None,
        "db_flush_lag_seconds": simple_db_metrics.get("flush_lag_seconds") if simple_db_metrics else None,
        "feature_lag_seconds": feature_lag,
        "recent_errors": recent_errors,
        "bootstrap": {
            "genesis_ready": genesis_ready,
            "rpc_connected": rpc_connected,
            "block_height": rpc_height,
            "wallet": _wallet_status(the_block_client) if the_block_client else {"connected": False},
        },
    }


def _load_manifest() -> Dict[str, Any]:
    global _manifest_cache
    if not MANIFEST_PATH.exists():
        return {}
    try:
        mtime = MANIFEST_PATH.stat().st_mtime
        if _manifest_cache and _manifest_cache.get("mtime") == mtime:
            return _manifest_cache["data"]
        raw = MANIFEST_PATH.read_bytes()
        schema_hash = hashlib.sha256(raw).hexdigest()
        payload = {
            "schema_hash": schema_hash,
            "updated_at": int(time.time() * 1000),
            "source": str(MANIFEST_PATH.name),
        }
        _manifest_cache = {"mtime": mtime, "data": payload}
        return payload
    except Exception as exc:
        logger.warning("Failed to load manifest: %s", exc)
        return {"schema_hash": None}


def _load_feature_schema() -> List[Dict[str, Any]]:
    """Load feature schema from features_theblock.yaml."""
    root = Path(__file__).resolve().parents[2]
    schema_path = root / "features_theblock.yaml"
    if not schema_path.exists():
        return []
    try:
        parsed = config_parser.load_yaml(schema_path)
        feats = parsed.get("features") if isinstance(parsed, dict) else None
        if not isinstance(feats, list):
            return []
        out = []
        for item in feats:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "index": item.get("index"),
                    "name": item.get("name"),
                    "category": item.get("category"),
                    "description": item.get("description"),
                    "unit": item.get("unit"),
                    "normalization": item.get("normalization"),
                }
            )
        return out
    except Exception as exc:
        logger.warning("Failed to load feature schema: %s", exc)
        return []


def _default_runtime_state() -> Dict[str, Any]:
    return {
        "running": False,
        "emergency_stop": False,
        "mode": "live",
        "settings": {},
        "paper": {"assets": ["BLOCK"], "capital": 0.0},
    }


def _load_runtime_state() -> Dict[str, Any]:
    if _state_dal is None:
        return _default_runtime_state()
    raw = _state_dal.get_meta("runtime_state")
    if not raw:
        return _default_runtime_state()
    try:
        data = json.loads(raw)
    except Exception:
        return _default_runtime_state()
    merged = _default_runtime_state()
    merged.update(data or {})
    merged.setdefault("settings", {})
    merged.setdefault("paper", {"assets": ["BLOCK"], "capital": 0.0})
    return merged


def _save_runtime_state(state: Dict[str, Any]) -> None:
    if _state_dal is None:
        return
    _state_dal.set_meta("runtime_state", json.dumps(state))


def _compute_posterior(
    feature_vector: List[float],
    network: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute a lightweight posterior snapshot for regime charts."""
    feats = list(feature_vector or [])
    if len(feats) < 11:
        feats = feats + [0.0] * (11 - len(feats))
    post = posterior_engine.predict(feats[:11])
    trend = post.trend
    revert = post.revert
    chop = post.chop
    rug = post.rug
    # Gently tilt toward trend when network strength is high.
    strength = (network or {}).get("network_strength")
    if isinstance(strength, (int, float)):
        tilt = max(-0.25, min(0.25, (strength - 50) / 200))
        trend = max(0.01, min(0.98, trend + tilt))
        revert = max(0.01, min(0.98, revert - tilt * 0.6))
        chop = max(0.01, min(0.98, 1.0 - trend - revert))
        total = trend + revert + chop
        if total > 0:
            trend, revert, chop = trend / total, revert / total, chop / total
        rug = max(0.01, min(0.25, rug + (0.2 - strength / 500)))
    return {
        "trend": float(trend),
        "revert": float(revert),
        "chop": float(chop),
        "rug": float(rug),
        "timestamp": int(time.time() * 1000),
    }


@http_server.get("/theblock/dashboard")
def get_dashboard(_request):
    return _snapshot_or_503()


@http_server.get("/theblock/network")
def get_network(_request):
    snap = _snapshot_or_503()
    return snap.get("network", {})


@http_server.get("/theblock/markets")
def get_markets(_request):
    snap = _snapshot_or_503()
    return snap.get("markets", [])


@http_server.get("/theblock/gates")
def get_gates(_request):
    snap = _snapshot_or_503()
    return snap.get("gates", [])


@http_server.post("/rpc")
def proxy_rpc(request):
    """JSON-RPC passthrough so the frontend can reuse node methods via the dashboard host."""
    if the_block_client is None:
        raise HTTPError(503, "rpc_not_initialized")
    payload = request.json()
    if payload is None:
        raise HTTPError(400, "invalid_rpc_payload")

    def _handle_call(call: Dict[str, Any]) -> Dict[str, Any]:
        method = call.get("method")
        if not method:
            return {
                "jsonrpc": "2.0",
                "id": call.get("id"),
                "error": {"code": -32600, "message": "method is required"},
            }
        params = call.get("params")
        response = {"jsonrpc": "2.0", "id": call.get("id")}
        try:
            result = the_block_client.rpc.call(method, params)
            response["result"] = result
        except NodeRPCError as exc:
            response["error"] = {
                "code": getattr(exc, "code", -32000),
                "message": getattr(exc, "message", str(exc)),
                "data": getattr(exc, "data", None),
            }
        except Exception as exc:  # pragma: no cover - defensive
            response["error"] = {"code": -32603, "message": str(exc)}
        return response

    if isinstance(payload, list):
        return [_handle_call(call if isinstance(call, dict) else {}) for call in payload]
    return _handle_call(payload if isinstance(payload, dict) else {})


@http_server.get("/theblock/providers")
def get_providers(_request):
    snap = _snapshot_or_503()
    return snap.get("providers", [])


@http_server.get("/theblock/features")
def get_features(_request):
    snap = _snapshot_or_503()
    return snap.get("feature_vector", [])


@http_server.get("/wallet/status")
def get_wallet_status(_request):
    if the_block_client is None:
        return {"connected": False, "mode": "monitor"}
    return _wallet_status(the_block_client)


@http_server.post("/wallet/ensure")
def ensure_wallet(_request):
    """Create a local wallet address if missing; return status."""
    addr = ensure_local_wallet()
    if the_block_client is None:
        return {"wallet": addr, "funded": False, "connected": False}
    return _wallet_status(the_block_client)


@http_server.post("/wallet/import")
def import_wallet(request):
    """Import and persist a wallet address provided by the user."""
    payload = request.json() or {}
    addr = (payload.get("address") or "").strip()
    if not addr or len(addr) < 6:
        raise HTTPError(400, "invalid wallet address")
    _persist_wallet_address(addr)
    if the_block_client is None:
        return {"wallet": addr, "funded": False, "connected": False}
    return _wallet_status(the_block_client)


@http_server.post("/wallet/secret")
def wallet_secret(request):
    """Reveal locally-generated wallet secret (requires explicit confirmation)."""
    payload = request.json() or {}
    confirm = payload.get("confirm") in (True, "true", "yes", "confirm")
    if not confirm:
        raise HTTPError(400, "confirmation_required")
    addr = _resolve_wallet_address()
    secret = _resolve_wallet_secret()
    if not addr or not secret:
        raise HTTPError(404, "no_local_wallet_secret")
    return {"wallet": addr, "secret_hex": secret}


@http_server.get("/manifest")
def get_manifest(_request):
    return _load_manifest()


@http_server.get("/state")
def get_state(_request):
    state = _load_runtime_state()
    payload = dict(state)
    payload["wallet"] = _wallet_status(the_block_client) if the_block_client else {"connected": False}
    payload["timestamp"] = int(time.time())
    return payload


@http_server.post("/state")
def update_state(request):
    payload = request.json() or {}
    state = _load_runtime_state()
    if "running" in payload:
        state["running"] = bool(payload.get("running"))
    if "emergency_stop" in payload:
        state["emergency_stop"] = bool(payload.get("emergency_stop"))
    if "mode" in payload:
        state["mode"] = str(payload.get("mode") or "live")
    if "paper_assets" in payload:
        state.setdefault("paper", {})
        state["paper"]["assets"] = payload.get("paper_assets") or []
    if "paper_capital" in payload:
        state.setdefault("paper", {})
        state["paper"]["capital"] = payload.get("paper_capital") or 0.0
    # Merge settings map, plus allow flat key updates.
    incoming_settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    settings = state.get("settings") or {}
    settings.update(incoming_settings)
    for key, value in payload.items():
        if key in {"running", "emergency_stop", "mode", "paper_assets", "paper_capital", "settings"}:
            continue
        settings[key] = value
    state["settings"] = settings
    _save_runtime_state(state)
    state["wallet"] = _wallet_status(the_block_client) if the_block_client else {"connected": False}
    state["timestamp"] = int(time.time())
    return state


@http_server.get("/assets")
def get_assets(_request):
    if _state_dal is None:
        return ["BLOCK"]
    assets = _state_dal.list_assets()
    if assets:
        return [a.get("symbol", "").upper() for a in assets if a.get("symbol")]
    return ["BLOCK"]


@http_server.options("/assets/invalidate")
def assets_invalidate_options(_request):
    return {"status": "ok"}


@http_server.post("/assets/invalidate")
def invalidate_assets(_request):
    if _state_dal is None:
        return {"status": "noop"}
    try:
        _state_dal.save_assets([])
    except Exception:
        pass
    return {"status": "ok"}


@http_server.get("/features/schema")
def features_schema(_request):
    return _load_feature_schema()


@http_server.get("/pnl/daily")
def get_pnl_daily(request):
    days = int(request.query_params.get("days", ["14"])[0])
    series = []
    if the_block_accountant:
        series = the_block_accountant.get_pnl_series()
    grouped: Dict[str, float] = {}
    for snap in series:
        ts = snap.get("timestamp", time.time())
        day = datetime.fromtimestamp(ts, timezone.utc).date().isoformat()
        grouped[day] = snap.get("total_pnl", grouped.get(day, 0.0))
    ordered_days = sorted(grouped.keys())
    sliced = ordered_days[-days:]
    result = []
    prev = None
    for day in sliced:
        total = grouped.get(day, 0.0)
        delta = total - prev if prev is not None else total
        prev = total
        result.append({"date": day, "pnl": delta, "total": total})
    return result


@http_server.get("/pnl/markets")
def get_market_pnl(request):
    limit = int(request.query_params.get("limit", ["48"])[0])
    series = []
    if the_block_accountant:
        series = the_block_accountant.get_pnl_series()
    trimmed = series[-limit:]
    markets = ["compute", "storage", "energy", "ad"]
    data = []
    for snap in trimmed:
        ts = int((snap.get("timestamp", time.time())) * 1000)
        by_market = snap.get("by_market", {})
        entry = {"timestamp": ts, "markets": {}}
        for market in markets:
            value = by_market.get(market, 0.0)
            entry["markets"][market.upper()] = float(value)
        data.append(entry)
    return {"series": data, "markets": [m.upper() for m in markets]}


@http_server.get("/market/active")
def get_market_active(_request):
    snap = _snapshot_or_503()
    markets = snap.get("markets", [])
    gates = snap.get("gates", [])
    gate_map = {g.get("market", "").lower(): g for g in gates if g.get("market")}
    results = []
    for m in markets:
        name = m.get("market", "unknown")
        volume = float(m.get("volume_block", 0))
        receipts = m.get("receipts_count", 0)
        utilization = float(m.get("utilization", 0.0) or 0.0)
        volatility = max(0.0, min(1.0, 1.0 - utilization))
        liquidity = int(m.get("active_providers", 0))
        spread = float(max(0.001, m.get("provider_margin", 0) / 1_000_000 if m.get("provider_margin") else 0.01))
        gate_info = gate_map.get(name.lower()) or gate_map.get(f"{name}_market".lower())
        results.append({
            "symbol": f"{name.upper()} / BLOCK",
            "volume": volume,
            "volatility": volatility,
            "liquidity": liquidity,
            "spread": spread,
            "market": name.upper(),
            "gate": gate_info.get("state") if gate_info else "unknown",
            "receipts": receipts,
        })
    overview = {"total_markets": len(results), "active": sum(1 for m in results if m["volume"] > 0)}
    return {"markets": results, "overview": overview}


@http_server.get("/positions")
def get_positions(_request):
    summary = _accounting_summary()
    positions = summary.get("positions", {})
    out: Dict[str, Any] = {}
    for market, pos in positions.items():
        out[market.upper()] = {
            "qty": pos.get("net_pnl", 0),
            "net_pnl": pos.get("net_pnl", 0),
            "spent": pos.get("spent", 0),
            "earned": pos.get("earned", 0),
            "units_consumed": pos.get("units_consumed", 0),
            "units_provided": pos.get("units_provided", 0),
            "transaction_count": pos.get("transaction_count", 0),
        }
    return out


@http_server.get("/orders")
def get_orders(_request):
    if the_block_accountant is None:
        return []
    txs = list(the_block_accountant.transactions)[-50:]
    txs.reverse()
    out = []
    for tx in txs:
        ts_sec = int(tx.timestamp / 1000) if tx.timestamp > 10_000_000_000 else int(tx.timestamp)
        out.append(
            {
                "token": tx.market.upper(),
                "status": tx.transaction_type.value,
                "strategy": tx.receipt_type,
                "timestamp": ts_sec,
                "pnl": tx.amount,
            }
        )
    return out


@http_server.get("/risk/portfolio")
def get_risk_portfolio(_request):
    summary = _accounting_summary()
    balance = summary.get("balance", {})
    positions = summary.get("positions", {})
    equity = float(balance.get("current", 0))
    change = float(balance.get("change", 0))
    change_pct = float(balance.get("change_pct", 0))
    position_size = sum(float(p.get("spent", 0)) for p in positions.values())
    leverage = position_size / max(equity, 1.0)
    exposure = min(1.0, position_size / max(equity + 1.0, 1.0))
    return {
        "equity": equity,
        "change": change,
        "change_pct": change_pct,
        "max_drawdown": 0.0,
        "position_size": position_size,
        "leverage": leverage,
        "exposure": exposure,
    }


@http_server.get("/pnl/realized")
def get_realized_pnl(_request):
    if the_block_accountant is None:
        return {"total": 0, "change": 0, "change_pct": 0}
    total = the_block_accountant.get_total_pnl()
    series = the_block_accountant.get_pnl_series()
    change = 0.0
    change_pct = 0.0
    if len(series) >= 2:
        prev = series[-2].get("total_pnl", 0)
        curr = series[-1].get("total_pnl", total)
        change = curr - prev
        change_pct = (change / max(abs(prev), 1)) * 100
    return {
        "total": total,
        "change": change,
        "change_pct": change_pct,
        "as_of": int(time.time() * 1000),
    }


@http_server.get("/chart/portfolio")
def get_portfolio_chart(request):
    limit = int(request.query_params.get("limit", ["48"])[0])
    series = []
    if the_block_accountant is not None:
        for snap in the_block_accountant.get_pnl_series()[-limit:]:
            series.append([snap.get("timestamp", time.time()) * 1000, snap.get("balance", 0)])
    return {"series": series}


@http_server.get("/risk/rug")
def get_rug_status(_request):
    return {"alerts": []}

@http_server.get("/whales")
def get_whales(_request):
    with dashboard_lock:
        if whale_snapshot:
            return whale_snapshot
    snap = _snapshot_or_503()
    return {"items": snap.get("whales", []), "updated_at": int(time.time() * 1000)}

@http_server.get("/sentiment/trending")
def get_sentiment_trending(_request):
    with dashboard_lock:
        trending = sentiment_snapshot.get("trending")
        if trending is not None:
            return trending
    snap = _snapshot_or_503()
    return snap.get("sentiment", {}).get("trending", [])

@http_server.get("/sentiment/influencers")
def get_sentiment_influencers(_request):
    with dashboard_lock:
        inf = sentiment_snapshot.get("influencers")
        if inf is not None:
            return inf
    snap = _snapshot_or_503()
    return snap.get("sentiment", {}).get("influencers", [])

@http_server.get("/sentiment/pulse")
def get_sentiment_pulse(_request):
    with dashboard_lock:
        pulse = sentiment_snapshot.get("pulse")
        if pulse is not None:
            return pulse
    snap = _snapshot_or_503()
    return snap.get("sentiment", {}).get("pulse", {})

@http_server.get("/mev/status")
def get_mev_status(_request):
    """Return MEV defense status (stubbed to live data when available)."""
    snap = {}
    with dashboard_lock:
        snap = dict(dashboard_data) if dashboard_data else {}
    receipts = snap.get("receipt_velocity") or []
    saved = sum(receipts) if receipts else 0
    return {
        "saved_today": saved or 0.0,
        "attacks_blocked": int((saved or 1) // 3),
        "success_rate": 0.97 if saved else 0.9,
        "latency_ms": 42,
    }

@http_server.get("/alpha/signals")
def get_alpha_signals(_request):
    """Return alpha signal stub derived from sentiment snapshot."""
    snap = {}
    with dashboard_lock:
        snap = dict(sentiment_snapshot) if sentiment_snapshot else {}
    pulse = snap.get("pulse", {})
    return {
        "strength": pulse.get("strength", "balanced"),
        "social_sentiment": float(pulse.get("fear_greed", 50)) / 10 if pulse else 6.5,
        "onchain_momentum": float(pulse.get("social_volume", 50)) / 100 if pulse else 5.0,
        "whale_activity": float(pulse.get("fomo", 50)) / 10 if pulse else 5.5,
    }

@http_server.get("/mev/opportunities")
def get_mev_opportunities(_request):
    """Return current MEV opportunities (demo-safe list)."""
    snap = _snapshot_or_503()
    height = snap.get("network", {}).get("block_height", 0)
    opportunities: List[Dict[str, Any]] = []
    for idx, market in enumerate(["compute", "storage", "energy", "ad"]):
        opportunities.append(
            {
                "id": f"op-{height}-{idx}",
                "market": market,
                "pair": f"{market.upper()}/BLOCK",
                "value": 0.0008 * (idx + 1),
                "confidence": 0.62 - (idx * 0.04),
                "observed_height": height,
            }
        )
    return {"opportunities": opportunities, "timestamp": int(time.time())}

@http_server.get("/price/sol")
def get_price_sol(_request):
    """Return a lightweight price feed used by MEV/alpha panels."""
    snap = _snapshot_or_503()
    block_height = snap.get("network", {}).get("block_height", 0) or 0
    price = 1.0 + (block_height % 100) * 0.0001
    return {"asset": "BLOCK", "price": round(price, 4), "source": "local-node"}

@http_server.get("/strategy/performance_matrix")
def get_strategy_matrix(request):
    period = request.query_params.get("period", ["7d"])[0]
    with dashboard_lock:
        data = dict(strategy_snapshot) if strategy_snapshot else {}
    if not data:
        snap = _snapshot_or_503()
        data = snap.get("strategies", {})
    data["period"] = period
    return data

@http_server.get("/strategy/breakdown")
def get_strategy_breakdown(_request):
    with dashboard_lock:
        if strategy_snapshot:
            return strategy_snapshot.get("strategies", [])
    snap = _snapshot_or_503()
    return snap.get("strategies", {}).get("strategies", [])

@http_server.get("/strategy/matrix")
def get_strategy_raw(_request):
    with dashboard_lock:
        if strategy_snapshot:
            return {"matrix": strategy_snapshot.get("days", [])}
    snap = _snapshot_or_503()
    return {"matrix": snap.get("strategies", {}).get("days", [])}


# Backtest orchestration ----------------------------------------------------

async def _broadcast_backtest(job_id: str, payload: Dict[str, Any]):
    subs = backtest_subscribers.get(job_id, set())
    dead = []
    message = json.dumps(payload)
    for ws in list(subs):
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        subs.discard(ws)


async def _run_backtest_job(job_id: str, params: Dict[str, Any]):
    steps = 60
    equity_curve = []
    trades = 0
    capital = float(params.get("capital", 100))
    for idx in range(steps):
        price = 1.0 + 0.01 * idx
        equity_curve.append(capital + idx * 0.5)
        trades += 1
        progress = (idx + 1) / steps
        payload = {
            "progress": progress,
            "equity_curve": list(equity_curve),
            "trades": trades,
            "win_rate": 0.55,
            "drawdown": 0.05,
            "sharpe": 1.1,
            "pnl": equity_curve[-1] - capital,
        }
        await _broadcast_backtest(job_id, payload)
        await asyncio.sleep(0.05)
    backtest_jobs[job_id]["result"] = payload
    backtest_jobs[job_id]["status"] = "done"


@http_server.post("/backtest")
async def start_backtest(request):
    if _async_loop is None:
        raise HTTPError(503, "backtest loop unavailable")
    payload = request.json() or {}
    job_id = str(int(time.time() * 1000))
    backtest_jobs[job_id] = {"status": "running", "params": payload}
    asyncio.run_coroutine_threadsafe(_run_backtest_job(job_id, payload), _async_loop)
    return {"id": job_id}


@http_server.get("/health")
def health(_request):
    return _health_snapshot()


@http_server.get("/metrics")
def metrics_endpoint(request):
    if _METRICS_TOKEN:
        auth_header = request.headers.get("Authorization", "")
        if auth_header != f"Bearer {_METRICS_TOKEN}":
            raise HTTPError(401, "unauthorized")
    return Response(bb_metrics.generate_latest(), status_code=200, media_type="text/plain")


@http_server.get("/posterior")
def get_posterior(_request):
    with dashboard_lock:
        if posterior_snapshot:
            return posterior_snapshot
    snap = _snapshot_or_503()
    return snap.get("posterior", {})


@http_server.post("/logs/generate")
def generate_log(_request):
    entry = {
        "timestamp": int(time.time() * 1000),
        "level": "INFO",
        "message": "Synthetic log entry from Block Buster",
    }
    log_buffer.append(entry)
    if _async_loop and log_subscribers:
        try:
            asyncio.run_coroutine_threadsafe(_broadcast_ws("/logs/ws", entry), _async_loop)
        except Exception:
            pass
    return {"status": "ok"}


# WebSocket handlers --------------------------------------------------------
@ws_server.on_connect
async def on_connect(ws):
    logger.info("WebSocket connected: %s", ws.path)
    if ws.path.startswith("/backtest/ws/"):
        job_id = ws.path.rsplit("/", 1)[-1]
        backtest_subscribers.setdefault(job_id, set()).add(ws)
        job = backtest_jobs.get(job_id)
        if job and job.get("result"):
            await ws.send_text(json.dumps(job["result"]))
        return
    if ws.path.startswith("/whales/ws"):
        whale_subscribers.add(ws)
        if whale_snapshot:
            await ws.send_text(json.dumps({"whales": whale_snapshot.get("items", []), "updated_at": whale_snapshot.get("updated_at")}))
        return
    if ws.path.startswith("/positions/ws"):
        # Stream positions snapshot and keep alive with pings handled by client.
        positions_subscribers.add(ws)
        summary = _accounting_summary()
        await ws.send_text(json.dumps(summary.get("positions", {})))
        return
    if ws.path.startswith("/posterior/ws"):
        posterior_subscribers.add(ws)
        with dashboard_lock:
            if posterior_snapshot:
                await ws.send_text(json.dumps(posterior_snapshot))
        return
    if ws.path.startswith("/logs/ws"):
        log_subscribers.add(ws)
        for entry in log_buffer[-50:]:
            await ws.send_text(json.dumps(entry))
        return
    with dashboard_lock:
        if dashboard_data:
            await ws.send_text(json.dumps(dashboard_data))


@ws_server.on_message
async def on_message(ws, message: str):
    logger.debug("WebSocket message from %s: %s", ws.path, message)
    if ws.path.startswith("/backtest/ws/"):
        await ws.send_text(json.dumps({"status": "listening"}))
    elif ws.path.startswith("/whales/ws"):
        await ws.send_text(json.dumps({"status": "listening"}))
    else:
        await ws.send_text(json.dumps({"status": "ok"}))


@ws_server.on_disconnect
async def on_disconnect(ws):
    logger.info("WebSocket disconnected: %s", ws.path)
    if ws.path.startswith("/backtest/ws/"):
        job_id = ws.path.rsplit("/", 1)[-1]
        backtest_subscribers.get(job_id, set()).discard(ws)
    if ws.path.startswith("/whales/ws"):
        whale_subscribers.discard(ws)
    if ws.path.startswith("/positions/ws"):
        positions_subscribers.discard(ws)
    if ws.path.startswith("/posterior/ws"):
        posterior_subscribers.discard(ws)
    if ws.path.startswith("/logs/ws"):
        log_subscribers.discard(ws)


@feature_ws_server.on_connect
async def on_feature_connect(ws):
    logger.info("Feature WebSocket connected: %s", ws.path)
    with dashboard_lock:
        if dashboard_data:
            await ws.send_text(
                json.dumps({"topic": "features", "data": dashboard_data.get("feature_vector", [])})
            )


@feature_ws_server.on_disconnect
async def on_feature_disconnect(ws):
    logger.info("Feature WebSocket disconnected: %s", ws.path)


# Bootstrap -----------------------------------------------------------------
def init_dashboard_server(
    checkpoint_path: Union[Path, str] = "./data/dashboard_checkpoint.json",
    poll_interval: float = 2.0,
) -> None:
    """Initialise client + integration."""
    global the_block_client, the_block_integration, the_block_accountant, _health_dal, _state_dal

    the_block_client = TheBlockClient()
    if not the_block_client.health_check():
        logger.warning("Cannot reach The Block node; starting dashboard in offline mode")
    # Ensure a local wallet exists so UI has something to display immediately.
    ensure_local_wallet()

    if _STATE_DB_PATH and _state_dal is None:
        try:
            _state_dal = DAL(_STATE_DB_PATH)
            logger.info("State DAL initialised at %s", _STATE_DB_PATH)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to init state DAL (%s): %s", _STATE_DB_PATH, exc)

    if _HEALTH_DB_PATH and _health_dal is None:
        try:
            _health_dal = DAL(_HEALTH_DB_PATH)
            logger.info("Health DAL initialised at %s", _HEALTH_DB_PATH)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to init health DAL (%s): %s", _HEALTH_DB_PATH, exc)
    if _health_dal is None and _state_dal is not None:
        _health_dal = _state_dal

    root_logger = logging.getLogger()
    if not any(isinstance(h, LogBufferHandler) for h in root_logger.handlers):
        root_logger.addHandler(LogBufferHandler())

    feature_engine = create_feature_engine(mode="theblock")
    the_block_integration = TheBlockIntegration(
        checkpoint_path=Path(checkpoint_path),
        feature_engine=feature_engine,
        poll_interval=poll_interval,
    )
    if the_block_accountant is None:
        the_block_accountant = TheBlockAccountant()
        the_block_integration.receipt_poller.register_callback(
            the_block_accountant.process_receipts
        )


def start_dashboard_server(
    http_host: str = "0.0.0.0",
    http_port: int = 5000,
    ws_host: str = "0.0.0.0",
    ws_port: int = 5001,
    feature_ws_port: Optional[int] = None,
) -> None:
    """Start HTTP + WebSocket servers with background integration."""
    init_dashboard_server()

    def _pick_open_port(preferred: int, forbidden: set[int]) -> int:
        """Find an open port, skipping forbidden ones."""
        port = preferred
        for _ in range(32):
            if port in forbidden:
                port += 1
                continue
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    sock.bind(("0.0.0.0", port))
                    return port
                except OSError:
                    port += 1
                    continue
        raise RuntimeError("Unable to find a free port for feature WebSocket server")

    # Avoid port collisions: if ws_port collides with http_port, pick the next free slot.
    if ws_port == http_port:
        ws_port = http_port + 1
        logger.info("WS port collided with HTTP; moving WS to :%s", ws_port)

    # Avoid port collisions: feature WS defaults to ws_port+1 but must not equal HTTP/WS.
    chosen_feature_port = _pick_open_port(
        feature_ws_port or (ws_port + 1),
        forbidden={http_port, ws_port},
    )
    if feature_ws_port != chosen_feature_port:
        logger.info(
            "Feature WebSocket port set to %s (avoiding conflicts with HTTP/WS)",
            chosen_feature_port,
        )

    http_thread = threading.Thread(
        target=http_server.run, args=(http_host, http_port), daemon=True
    )
    http_thread.start()

    async def _run():
        global _async_loop
        _async_loop = asyncio.get_running_loop()
        assert the_block_integration is not None
        async with the_block_integration:
            updater = asyncio.create_task(update_dashboard_loop())
            ws = asyncio.create_task(ws_server.start(host=ws_host, port=ws_port))
            feature_ws = asyncio.create_task(
                feature_ws_server.start(
                    host=ws_host, port=chosen_feature_port
                )
            )
            await asyncio.gather(updater, ws, feature_ws)

    asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    http_host = os.getenv("BLOCK_BUSTER_HTTP_HOST", "0.0.0.0")
    http_port = int(os.getenv("BLOCK_BUSTER_HTTP_PORT", "5000"))
    ws_host = os.getenv("BLOCK_BUSTER_WS_HOST", "0.0.0.0")
    ws_port = int(os.getenv("BLOCK_BUSTER_WS_PORT", "5001"))
    feature_ws_port_env = os.getenv("BLOCK_BUSTER_FEATURE_WS_PORT")
    feature_ws_port = int(feature_ws_port_env) if feature_ws_port_env else None

    start_dashboard_server(
        http_host=http_host,
        http_port=http_port,
        ws_host=ws_host,
        ws_port=ws_port,
        feature_ws_port=feature_ws_port,
    )

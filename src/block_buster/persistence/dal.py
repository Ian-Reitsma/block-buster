"""Data access layer backed by first-party SimpleDb (no third-party ORM)."""

from __future__ import annotations

import json
import os
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from block_buster.core.database import SimpleDb
from block_buster.schema import PositionState, SCHEMA_HASH

# Column family names (kept stable for compatibility)
CF_META = "meta"
CF_ORDERS = "orders"
CF_POSITIONS = "positions"
CF_ASSETS = "assets"
CF_PRICES = "prices"
CF_PNL = "pnl"


def _now() -> datetime:
    return datetime.utcnow()


@dataclass
class DBOrder:
    token: str
    quantity: float
    side: str
    price: float
    fee: float
    slippage: float
    id: Optional[int] = None
    ts: datetime = field(default_factory=_now)


@dataclass
class DBPosition:
    token: str
    data: bytes


@dataclass
class DBAsset:
    symbol: str
    mint: Optional[str] = None
    decimals: Optional[int] = None
    chain_id: Optional[int] = None


@dataclass
class DBPrice:
    token: str
    price: float
    ts: datetime
    expiry: datetime


class DAL:
    """Handle persistence via first-party SimpleDb."""

    def __init__(self, path: str) -> None:
        dir_path = os.path.dirname(path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)

        self.db = SimpleDb.open(path)
        # Ensure column families exist up front
        for cf in (CF_META, CF_ORDERS, CF_POSITIONS, CF_ASSETS, CF_PRICES, CF_PNL):
            self.db.ensure_cf(cf)

        # schema guard
        existing = self.get_meta("schema_hash")
        if existing and existing != SCHEMA_HASH:
            raise RuntimeError("schema hash mismatch")
        if not existing:
            self.set_meta("schema_hash", SCHEMA_HASH)

    # -------- Meta helpers --------
    def get_meta(self, key: str) -> Optional[str]:
        raw = self.db.get(CF_META, key.encode())
        return raw.decode() if raw else None

    def set_meta(self, key: str, value: str) -> None:
        self.db.put(CF_META, key.encode(), value.encode())
        self.db.flush_wal()

    # -------- Orders --------
    def _next_order_id(self) -> int:
        current = int(self.get_meta("order_seq") or "0")
        new_id = current + 1
        self.set_meta("order_seq", str(new_id))
        return new_id

    def _order_key(self, order_id: int) -> bytes:
        # zero-pad so lexicographic order == numeric order
        return f"{order_id:020d}".encode()

    def _encode_order(self, order: DBOrder) -> bytes:
        payload = {
            "id": order.id,
            "token": order.token,
            "quantity": order.quantity,
            "side": order.side,
            "price": order.price,
            "fee": order.fee,
            "slippage": order.slippage,
            "ts": order.ts.isoformat(),
        }
        return json.dumps(payload).encode("utf-8")

    def _decode_order(self, data: bytes) -> DBOrder:
        payload = json.loads(data.decode("utf-8"))
        return DBOrder(
            id=payload["id"],
            token=payload["token"],
            quantity=payload["quantity"],
            side=payload["side"],
            price=payload["price"],
            fee=payload["fee"],
            slippage=payload["slippage"],
            ts=datetime.fromisoformat(payload["ts"]),
        )

    def add_order(self, order: DBOrder) -> DBOrder:
        if order.id is None:
            order.id = self._next_order_id()
        if order.ts is None:
            order.ts = _now()
        key = self._order_key(order.id)
        existing = self.db.get(CF_ORDERS, key)
        if existing:
            return self._decode_order(existing)
        self.db.put(CF_ORDERS, key, self._encode_order(order))
        return order

    def list_orders(self) -> List[DBOrder]:
        items = self.db.prefix_iterator(CF_ORDERS, b"")
        orders = [self._decode_order(value) for _, value in items]
        # iterator already sorted by key; ensure deterministic
        return sorted(orders, key=lambda o: o.id or 0)

    # -------- Positions --------
    def upsert_position(self, pos: Optional[PositionState]) -> None:
        if not pos:
            return
        self.db.put(CF_POSITIONS, pos.token.encode(), pos.SerializeToString())

    def remove_position(self, token: str) -> None:
        self.db.delete(CF_POSITIONS, token.encode())

    def load_positions(self) -> Dict[str, PositionState]:
        out: Dict[str, PositionState] = {}
        for key, value in self.db.prefix_iterator(CF_POSITIONS, b""):
            state = PositionState()
            state.ParseFromString(value)
            out[key.decode()] = state
        return out

    # -------- Assets --------
    def save_assets(self, assets: List[dict]) -> None:
        # clear existing
        for key, _ in self.db.prefix_iterator(CF_ASSETS, b""):
            self.db.delete(CF_ASSETS, key)
        for a in assets:
            asset = DBAsset(
                symbol=a.get("symbol"),
                mint=a.get("address"),
                decimals=a.get("decimals"),
                chain_id=a.get("chainId"),
            )
            self.db.put(
                CF_ASSETS,
                asset.symbol.encode(),
                json.dumps(asset.__dict__).encode("utf-8"),
            )

    def list_assets(self) -> List[dict]:
        assets: List[dict] = []
        for _, value in self.db.prefix_iterator(CF_ASSETS, b""):
            assets.append(json.loads(value.decode("utf-8")))
        return assets

    # -------- Prices --------
    def cache_price(self, token: str, price: float, ttl: int = 30) -> None:
        exp = _now() + timedelta(seconds=ttl)
        record = {
            "price": price,
            "ts": _now().isoformat(),
            "expiry": exp.isoformat(),
        }
        self.db.put(CF_PRICES, token.encode(), json.dumps(record).encode("utf-8"))

    def last_price(self, token: str) -> Optional[float]:
        data = self.db.get(CF_PRICES, token.encode())
        if not data:
            return None
        record = json.loads(data.decode("utf-8"))
        expiry = datetime.fromisoformat(record["expiry"])
        if expiry < _now():
            self.db.delete(CF_PRICES, token.encode())
            return None
        return float(record["price"])

    # -------- PnL snapshots --------
    def save_pnl_snapshot(self, snapshot: Dict[str, float]) -> None:
        payload = json.dumps(snapshot, sort_keys=True).encode("utf-8")
        checksum = hashlib.sha256(payload).hexdigest()
        if self.get_meta("pnl_checksum") == checksum:
            return
        self.db.put(CF_PNL, b"snapshot", payload)
        self.set_meta("pnl_checksum", checksum)

    def load_pnl_snapshot(self) -> Dict[str, float]:
        data = self.db.get(CF_PNL, b"snapshot")
        return json.loads(data.decode("utf-8")) if data else {}

    # -------- Cache invalidation hooks --------
    def invalidate_assets_and_prices(self) -> None:
        """Clear asset/price caches to align with governor updates."""
        for key, _ in self.db.prefix_iterator(CF_ASSETS, b""):
            self.db.delete(CF_ASSETS, key)
        for key, _ in self.db.prefix_iterator(CF_PRICES, b""):
            self.db.delete(CF_PRICES, key)
        self.set_meta("asset_checksum", "")

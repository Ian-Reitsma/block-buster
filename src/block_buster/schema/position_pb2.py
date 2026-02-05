from __future__ import annotations

"""Lightweight stand-in for generated ``position_pb2`` module.

The upstream project used protobuf-generated message classes for positions and
P&L state. The zero-dependency contract forbids runtime reliance on
``google.protobuf``. This module provides minimal protobuf-style message
objects with deterministic (JSON) serialization.
"""

from dataclasses import dataclass
import json
from typing import Any, Dict


def _dumps(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _loads(data: bytes) -> Dict[str, Any]:
    return json.loads(data.decode("utf-8"))


@dataclass
class PositionState:
    token: str = ""
    qty: float = 0.0
    cost: float = 0.0
    unrealized: float = 0.0

    def SerializeToString(self) -> bytes:
        return _dumps(
            {
                "token": self.token,
                "qty": self.qty,
                "cost": self.cost,
                "unrealized": self.unrealized,
            }
        )

    def ParseFromString(self, data: bytes) -> None:
        payload = _loads(data)
        self.token = str(payload.get("token", ""))
        self.qty = float(payload.get("qty", 0.0))
        self.cost = float(payload.get("cost", 0.0))
        self.unrealized = float(payload.get("unrealized", 0.0))


@dataclass
class PnLState:
    realized: float = 0.0
    unrealized: float = 0.0

    def SerializeToString(self) -> bytes:
        return _dumps({"realized": self.realized, "unrealized": self.unrealized})

    def ParseFromString(self, data: bytes) -> None:
        payload = _loads(data)
        self.realized = float(payload.get("realized", 0.0))
        self.unrealized = float(payload.get("unrealized", 0.0))


"""Coingecko-based price oracle (first-party HTTP client)."""

from __future__ import annotations

import asyncio
from typing import Dict

from block_buster.core.http_client import HTTPClient, HTTPError
from ..persistence import DAL


class PriceOracle:
    async def price(self, token: str) -> float:  # pragma: no cover - interface
        raise NotImplementedError

    async def volume(self, token: str) -> float:  # pragma: no cover - interface
        raise NotImplementedError


class CoingeckoOracle(PriceOracle):
    def __init__(self, dal: DAL, http: HTTPClient | None = None) -> None:
        self.dal = dal
        self.http = http or HTTPClient(timeout=5)

    async def __aenter__(self) -> "CoingeckoOracle":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def aclose(self) -> None:
        return None

    async def _get(self, url: str, params: Dict) -> Dict:
        loop = asyncio.get_running_loop()
        resp = await loop.run_in_executor(
            None, lambda: self.http.get(url, params=params)
        )
        if not resp.ok:
            raise HTTPError(resp.status_code, resp.text, resp)
        return resp.json()

    async def price(self, token: str) -> float:
        cached = self.dal.last_price(token)
        if cached is not None:
            return cached
        try:
            data = await self._get(
                "https://api.coingecko.com/api/v3/simple/price",
                {"ids": token.lower(), "vs_currencies": "usd"},
            )
            price = data[token.lower()]["usd"]
            self.dal.cache_price(token, price)
            return price
        except Exception:
            if cached is not None:
                return cached
            raise

    async def volume(self, token: str) -> float:
        try:
            data = await self._get(
                "https://api.coingecko.com/api/v3/coins/markets",
                {"vs_currency": "usd", "ids": token.lower()},
            )
            if not data:
                raise ValueError("no volume data")
            return float(data[0].get("total_volume", 0.0))
        except Exception:
            return 0.0

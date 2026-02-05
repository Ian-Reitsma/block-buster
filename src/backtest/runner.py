"""Backtest runner to replay historical data and evaluate strategies."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Awaitable, Callable, Iterable, List, Optional, Sequence, Tuple

import asyncio

from block_buster.engine.trade import TradeEngine
from block_buster.types import Side
from block_buster.exchange import ExecutionResult

@dataclass
class TradeBar:
    """Minimal price/volume record."""

    timestamp: float
    price: float
    volume: float


@dataclass
class BacktestResult:
    """Aggregate metrics from a backtest run."""

    pnl: float
    drawdown: float
    sharpe: float
    equity_curve: List[float] = field(default_factory=list)
    cancelled: bool = False
    limit_breach: Optional[str] = None


@dataclass
class BacktestConfig:
    """Configuration options for running a backtest."""

    source: str
    fee_rate: float = 0.0
    slippage_rate: float = 0.0
    initial_cash: float = 0.0
    max_drawdown: Optional[float] = None
    max_position_notional: Optional[float] = None
    max_concurrent_trades: Optional[int] = None


@dataclass
class BacktestLimits:
    """Guardrails to mirror live trading constraints during simulation."""

    max_drawdown: Optional[float] = None
    max_position_notional: Optional[float] = None
    max_concurrent_trades: Optional[int] = None


class FeeModel:
    """Percentage-based trading fee."""

    def __init__(self, rate: float = 0.0) -> None:
        self.rate = rate

    def fee(self, price: float, qty: float) -> float:
        return abs(price * qty) * self.rate


class SlippageModel:
    """Simple proportional slippage model."""

    def __init__(self, rate: float = 0.0) -> None:
        self.rate = rate

    def apply(self, price: float, side: Side) -> float:
        return price * (1 + self.rate) if side is Side.BUY else price * (1 - self.rate)


class BacktestConnector:
    """Connector stub returning predefined execution results."""

    def __init__(self) -> None:
        self.execution: ExecutionResult = ExecutionResult(price=0.0, slippage=0.0, fee=0.0)

    async def place_order(
        self, token: str, qty: float, side: Side, limit: Optional[float] = None
    ) -> ExecutionResult:
        return self.execution


def load_csv(path: str) -> List[TradeBar]:
    """Load historical trade data from a CSV file."""

    import csv

    bars: List[TradeBar] = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            bars.append(
                TradeBar(
                    timestamp=float(row["timestamp"]),
                    price=float(row["price"]),
                    volume=float(row.get("volume", 0)),
                )
            )
    return bars


class BacktestRunner:
    """Replay price data and evaluate strategy performance."""

    def __init__(
        self,
        engine: TradeEngine,
        fee_model: Optional[FeeModel] = None,
        slippage_model: Optional[SlippageModel] = None,
        initial_cash: float = 0.0,
        limits: Optional[BacktestLimits] = None,
        progress_cb: Optional[Callable[[float], Awaitable[None]]] = None,
        equity_cb: Optional[Callable[[Sequence[float]], Awaitable[None]]] = None,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> None:
        self.engine = engine
        self.fee_model = fee_model or FeeModel()
        self.slippage_model = slippage_model or SlippageModel()
        self.initial_cash = initial_cash
        self.limits = limits or BacktestLimits()
        self.progress_cb = progress_cb
        self.equity_cb = equity_cb
        self.cancel_event = cancel_event or asyncio.Event()

    async def run(
        self,
        data: Sequence[TradeBar],
        strategy: Callable[[TradeBar], Optional[Tuple[Side, float]]],
        token: str = "SOL",
    ) -> BacktestResult:
        cash = self.initial_cash
        position = 0.0
        equity_curve: List[float] = [cash]
        open_trades = 0
        total = len(data)

        for idx, bar in enumerate(data):
            if self.cancel_event.is_set():
                return BacktestResult(
                    pnl=equity_curve[-1] - self.initial_cash,
                    drawdown=0.0,
                    sharpe=0.0,
                    equity_curve=list(equity_curve),
                    cancelled=True,
                )

            await asyncio.sleep(0)
            price = bar.price
            equity = cash + position * price
            action = strategy(bar)
            if action:
                side, qty = action

                if self.limits.max_concurrent_trades is not None and open_trades >= self.limits.max_concurrent_trades:
                    return BacktestResult(
                        pnl=equity_curve[-1] - self.initial_cash,
                        drawdown=0.0,
                        sharpe=0.0,
                        equity_curve=list(equity_curve),
                        limit_breach="max_concurrent_trades",
                    )

                fill = self.slippage_model.apply(price, side)
                slip = abs(fill - price)
                fee = self.fee_model.fee(fill, qty)
                self.engine.connector.execution = ExecutionResult(price=fill, slippage=slip, fee=fee)
                await self.engine.place_order(token, qty, side)
                open_trades += 1
                if side is Side.BUY:
                    cash -= fill * qty + fee
                    position += qty
                else:
                    cash += fill * qty - fee
                    position -= qty
                equity = cash + position * price

                if self.limits.max_position_notional is not None and abs(position * price) > self.limits.max_position_notional:
                    return BacktestResult(
                        pnl=equity - self.initial_cash,
                        drawdown=0.0,
                        sharpe=0.0,
                        equity_curve=list(equity_curve),
                        limit_breach="max_position_notional",
                    )

            equity_curve.append(equity)

            peak = max(equity_curve)
            dd = (peak - equity) / peak if peak else 0.0
            if self.limits.max_drawdown is not None and dd >= self.limits.max_drawdown:
                return BacktestResult(
                    pnl=equity - self.initial_cash,
                    drawdown=dd,
                    sharpe=0.0,
                    equity_curve=list(equity_curve),
                    limit_breach="max_drawdown",
                )

            if self.progress_cb:
                await self.progress_cb((idx + 1) / total if total else 1.0)
            if self.equity_cb and (idx % 10 == 0 or idx == total - 1):
                await self.equity_cb(list(equity_curve))

        final_equity = equity_curve[-1]
        pnl = final_equity - self.initial_cash

        peak = equity_curve[0]
        max_dd = 0.0
        for eq in equity_curve:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak if peak else 0.0
            if dd > max_dd:
                max_dd = dd

        returns: List[float] = []
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i - 1]
            curr = equity_curve[i]
            returns.append((curr - prev) / prev if prev else 0.0)

        if returns:
            mean = sum(returns) / len(returns)
            var = sum((r - mean) ** 2 for r in returns) / len(returns)
            sharpe = mean / (var ** 0.5) if var > 0 else 0.0
        else:
            sharpe = 0.0

        return BacktestResult(
            pnl=pnl,
            drawdown=max_dd,
            sharpe=sharpe,
            equity_curve=list(equity_curve),
        )


async def run_backtest(
    engine: TradeEngine,
    cfg: BacktestConfig,
    strategy: Optional[Callable[[TradeBar], Optional[Tuple[Side, float]]]] = None,
) -> BacktestResult:
    """Convenience helper that loads data and executes a backtest."""

    data = load_csv(cfg.source)
    runner = BacktestRunner(
        engine,
        fee_model=FeeModel(cfg.fee_rate),
        slippage_model=SlippageModel(cfg.slippage_rate),
        initial_cash=cfg.initial_cash,
        limits=BacktestLimits(
            max_drawdown=cfg.max_drawdown,
            max_position_notional=cfg.max_position_notional,
            max_concurrent_trades=cfg.max_concurrent_trades,
        ),
    )

    if strategy is None:
        prev_price: Optional[float] = None
        holding = False

        def momentum(bar: TradeBar) -> Optional[Tuple[Side, float]]:
            nonlocal prev_price, holding
            if prev_price is None:
                prev_price = bar.price
                return None
            action = None
            if bar.price > prev_price and not holding:
                holding = True
                action = (Side.BUY, 1.0)
            elif bar.price < prev_price and holding:
                holding = False
                action = (Side.SELL, 1.0)
            prev_price = bar.price
            return action

        strategy = momentum

    return await runner.run(data, strategy)

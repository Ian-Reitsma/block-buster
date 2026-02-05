import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from block_buster.engine.risk import RiskManager
from block_buster.engine.trade import TradeEngine
from block_buster.persistence.dal import DAL
from block_buster.types import Side
from backtest.runner import BacktestLimits, BacktestRunner, BacktestConnector, TradeBar


class TestBacktestRunner(unittest.IsolatedAsyncioTestCase):
    async def _make_engine(self):
        tmp = tempfile.TemporaryDirectory()
        dal = DAL(tmp.name + "/db")
        connector = BacktestConnector()
        risk = RiskManager()
        engine = TradeEngine(risk=risk, connector=connector, dal=dal)
        return engine, tmp

    async def test_streams_progress_and_equity(self):
        engine, tmp = await self._make_engine()
        progress_updates = []
        equity_snapshots = []

        async def progress(p):
            progress_updates.append(p)

        async def equity(curve):
            equity_snapshots.append(list(curve))

        runner = BacktestRunner(
            engine,
            limits=BacktestLimits(max_drawdown=0.9),
            progress_cb=progress,
            equity_cb=equity,
        )

        data = [TradeBar(timestamp=i, price=10 + i, volume=1) for i in range(20)]

        def strat(bar: TradeBar):
            return (Side.BUY, 1.0) if bar.timestamp < 2 else None

        result = await runner.run(data, strat)

        self.assertFalse(result.cancelled)
        self.assertGreater(result.pnl, -1)
        self.assertTrue(progress_updates)
        self.assertTrue(any(len(curve) > 1 for curve in equity_snapshots))

        tmp.cleanup()

    async def test_respects_limits_and_reports_breach(self):
        engine, tmp = await self._make_engine()

        runner = BacktestRunner(
            engine,
            limits=BacktestLimits(max_concurrent_trades=1),
        )

        data = [TradeBar(timestamp=i, price=10, volume=1) for i in range(5)]

        def strat(bar: TradeBar):
            return (Side.BUY, 1.0)

        result = await runner.run(data, strat)
        self.assertEqual(result.limit_breach, "max_concurrent_trades")
        tmp.cleanup()


if __name__ == "__main__":
    unittest.main()

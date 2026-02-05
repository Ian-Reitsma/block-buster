import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from the_block import dashboard_server


class _StubDB:
    def metrics(self):
        return {
            "backend": "inhouse_python",
            "wal_fsync_lag_seconds": 0.25,
            "flush_lag_seconds": 1.5,
        }


class _StubDAL:
    def __init__(self):
        self.db = _StubDB()


class _StubAdapter:
    def __init__(self):
        self.last_update_time = time.time() - 0.5


class _StubPoller:
    def get_metrics(self):
        return {
            "errors": 7,
            "errors_last_60s": 1,
            "errors_last_5m": 2,
            "last_error_time": "2026-02-04T00:00:00",
        }


class _StubIntegration:
    def __init__(self):
        self.feature_adapter = _StubAdapter()
        self.receipt_poller = _StubPoller()


class TestHealth(unittest.TestCase):
    def test_health_payload(self):
        old_integration = dashboard_server.the_block_integration
        old_dal = dashboard_server._health_dal
        try:
            dashboard_server.the_block_integration = _StubIntegration()
            dashboard_server._health_dal = _StubDAL()
            payload = dashboard_server.health(None)
        finally:
            dashboard_server.the_block_integration = old_integration
            dashboard_server._health_dal = old_dal

        self.assertEqual(payload["status"], "ok")
        self.assertIn("uptime_seconds", payload)
        self.assertIn("simple_db", payload)
        self.assertIn("db_wal_fsync_lag_seconds", payload)
        self.assertIn("feature_lag_seconds", payload)
        self.assertIsInstance(payload["recent_errors"], dict)


if __name__ == "__main__":
    unittest.main()

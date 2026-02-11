import asyncio
import json
import os
import unittest

from block_buster.core.http_server import Request
from the_block.server import TheBlockServer


class DummyConfig:
    rpc_url = "http://localhost:8545"
    auth_token = None
    chain_mode = "localnet"
    tls_cert_path = None
    tls_key_path = None
    cert_path = None
    key_path = None
    timeout_seconds = 5.0
    max_retries = 0
    backoff_base = 0.01


class FakeRPC:
    def __init__(self):
        self.calls = []

    def call(self, method, params=None):
        self.calls.append((method, params))
        if method == "light.latest_header":
            return {"number": 100, "finality_time": 5}
        if method == "consensus.finality_status":
            return {"finalized_height": 98, "finality_time": 5}
        if method == "net.peers":
            return {"peers": [{"id": f"p{i}"} for i in range(25)]}
        if method == "net.stats":
            return {"avg_latency_ms": 30}
        if method == "compute_market.stats":
            return {"active_jobs": 1}
        if method == "storage.stats":
            return {"providers": 2, "capacity_used": 1024}
        if method == "energy.market_state":
            return {"total_credits": 1}
        if method == "ad_market.stats":
            return {"active_campaigns": 0, "total_impressions": 10}
        if method == "scheduler.stats":
            return {"pending_operations": 12, "ops_per_second": 240}
        if method == "receipt.audit":
            return {"receipts": [{"block_height": 99}]}
        if method == "gateway.dns_lookup":
            return {"record": "v=block", "verified": True}
        if method == "storage.put":
            # Echo back the preview payload in a safe dry-run
            payload = params[0] if params else {}
            return {"accepted": True, "preview": payload}
        return {}


class FullcheckTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        os.environ["FULLCHECK_STORAGE_DRY_RUN"] = "0"
        self.server = TheBlockServer(DummyConfig())
        self.server.rpc_client = FakeRPC()

    async def _call_fullcheck(self, body: dict):
        route = next(
            r
            for r in self.server.server.routes
            if r.path == "/theblock/fullcheck" and r.method == "POST"
        )
        req = Request(
            method="POST",
            path="/theblock/fullcheck",
            headers={"Content-Type": "application/json"},
            body=json.dumps(body).encode("utf-8"),
            query_params={},
            path_params={},
        )
        return await route.handler(req)

    async def test_fullcheck_baseline(self):
        body = {
            "domain": "demo.block",
            "file": {"name": "sample.txt", "size_bytes": 10, "sha256": "abcd", "preview_only": True},
            "storage_duration_epochs": 4,
        }
        result = await self._call_fullcheck(body)
        self.assertEqual(result["summary_score"], 100)
        steps = {s["id"]: s for s in result["steps"]}
        self.assertIn("domain_probe", steps)
        self.assertEqual(steps["domain_probe"]["status"], "ok")
        self.assertIn("storage_probe", steps)
        self.assertFalse(steps["storage_probe"]["data"].get("dry_run"))

    async def test_fullcheck_storage_dry_run_flag(self):
        os.environ["FULLCHECK_STORAGE_DRY_RUN"] = "1"
        self.server = TheBlockServer(DummyConfig())
        self.server.rpc_client = FakeRPC()
        body = {
            "domain": "demo.block",
            "file": {"name": "sample.txt", "size_bytes": 10, "sha256": "abcd", "preview_only": True},
            "storage_duration_epochs": 4,
        }
        result = await self._call_fullcheck(body)
        steps = {s["id"]: s for s in result["steps"]}
        storage_data = steps["storage_probe"]["data"]
        self.assertTrue(storage_data.get("dry_run"))
        self.assertIn("storage_put_result", storage_data)
        self.assertTrue(storage_data["storage_put_result"].get("accepted"))


if __name__ == "__main__":
    unittest.main()

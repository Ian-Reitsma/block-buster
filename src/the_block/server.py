#!/usr/bin/env python3
"""The Block Server - 100% First-Party Code, Zero Third-Party Dependencies.

This server uses ONLY the custom HTTPServer from block_buster.core.
No FastAPI, no Flask, no uvicorn - pure Python standard library.
"""

import sys
import os
import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from block_buster.core.http_server import (
    HTTPServer, 
    Request, 
    Response,
    HTTPError,
    JSONResponse
)
from the_block.rpc_client import RPCClient
from the_block.config import TheBlockConfig

logger = logging.getLogger(__name__)


class TheBlockServer:
    """The Block HTTP server with all required endpoints."""
    
    def __init__(self, config: TheBlockConfig):
        self.config = config
        self.rpc_client = RPCClient(config)
        self.server = HTTPServer(title="The Block API")
        self.server.enable_cors(["*"])
        self.fullcheck_storage_dry_run_env = (
            os.getenv("FULLCHECK_STORAGE_DRY_RUN", "0") == "1"
        )
        self._register_routes()
    
    def _register_routes(self):
        """Register all HTTP routes."""
        
        # Health check
        @self.server.get("/health")
        async def health(request: Request) -> Dict:
            """Simple health check endpoint."""
            return {
                "status": "healthy",
                "timestamp": int(time.time()),
                "service": "the-block-api"
            }
        
        # Receipts endpoint
        @self.server.get("/theblock/receipts")
        async def get_receipts(request: Request) -> Dict:
            """Get audit trail of receipts from The Block node.
            
            Query parameters:
                limit: int - Max number of receipts (default 100)
                offset: int - Pagination offset (default 0)
                market: str - Filter by market (compute, storage, energy, ad)
            """
            try:
                # Parse query params
                limit = int(request.query_params.get('limit', ['100'])[0])
                offset = int(request.query_params.get('offset', ['0'])[0])
                market_filter = request.query_params.get('market', [None])[0]
                
                # Query node via RPC
                result = self.rpc_client.call("receipt.audit", {
                    "limit": limit,
                    "offset": offset
                })
                
                receipts = result.get("receipts", [])
                
                # Filter by market if requested
                if market_filter:
                    receipts = [
                        r for r in receipts 
                        if r.get("market") == market_filter
                    ]
                
                return {
                    "receipts": receipts,
                    "total": len(receipts),
                    "limit": limit,
                    "offset": offset,
                    "timestamp": int(time.time())
                }
            except Exception as e:
                logger.error(f"Error fetching receipts: {e}")
                raise HTTPError(500, f"Failed to fetch receipts: {str(e)}")
        
        # Operations endpoint
        @self.server.get("/theblock/operations")
        async def get_operations(request: Request) -> Dict:
            """Get recent operations across all markets.
            
            Returns formatted view of receipts as operations.
            """
            try:
                # Get recent receipts
                receipts_result = self.rpc_client.call("receipt.audit", {
                    "limit": 50
                })
                
                receipts = receipts_result.get("receipts", [])
                
                # Format as operations
                operations = []
                for receipt in receipts:
                    op = {
                        "id": receipt.get("id"),
                        "type": receipt.get("market", "unknown"),
                        "timestamp": receipt.get("timestamp"),
                        "block_height": receipt.get("block_height"),
                        "provider": receipt.get("provider"),
                        "consumer": receipt.get("consumer"),
                        "amount": receipt.get("amount"),
                        "status": receipt.get("status", "completed"),
                        "details": receipt.get("details", {})
                    }
                    operations.append(op)
                
                # Group by market
                by_market = {}
                for op in operations:
                    market = op["type"]
                    if market not in by_market:
                        by_market[market] = []
                    by_market[market].append(op)
                
                return {
                    "operations": operations,
                    "total": len(operations),
                    "by_market": by_market,
                    "timestamp": int(time.time())
                }
            except Exception as e:
                logger.error(f"Error fetching operations: {e}")
                raise HTTPError(500, f"Failed to fetch operations: {str(e)}")
        
        # Network metrics endpoint
        @self.server.get("/theblock/network/metrics")
        async def get_network_metrics(request: Request) -> Dict:
            """Aggregate network metrics from multiple RPC calls.
            
            Combines:
            - net.peers (peer count)
            - net.stats (network statistics)
            - light.latest_header (block height, finality)
            """
            try:
                # Get peers
                peers_result = self.rpc_client.call("net.peers", {})
                peers = peers_result.get("peers", [])
                
                # Get network stats
                stats_result = self.rpc_client.call("net.stats", {})
                
                # Get latest header
                header_result = self.rpc_client.call("light.latest_header", {})
                
                # Calculate network strength (0-100)
                # Based on: peer count, TPS, finality time
                peer_count = len(peers)
                tps = stats_result.get("tps", 0)
                finality_time = header_result.get("finality_time", 0)
                
                # Simple scoring algorithm
                peer_score = min(peer_count / 50 * 30, 30)  # Max 30 points for 50+ peers
                tps_score = min(tps / 1000 * 40, 40)  # Max 40 points for 1000+ TPS
                finality_score = max(30 - (finality_time / 10), 0)  # Max 30 points for <10s finality
                
                network_strength = int(peer_score + tps_score + finality_score)
                
                return {
                    "network_strength": network_strength,
                    "block_height": header_result.get("number", 0),
                    "finality_time": finality_time,
                    "peer_count": peer_count,
                    "tps": tps,
                    "bandwidth_in": stats_result.get("bandwidth_in", 0),
                    "bandwidth_out": stats_result.get("bandwidth_out", 0),
                    "active_connections": stats_result.get("active_connections", 0),
                    "timestamp": int(time.time())
                }
            except Exception as e:
                logger.error(f"Error fetching network metrics: {e}")
                # Return degraded metrics instead of failing
                return {
                    "network_strength": 0,
                    "block_height": 0,
                    "finality_time": 0,
                    "peer_count": 0,
                    "tps": 0,
                    "bandwidth_in": 0,
                    "bandwidth_out": 0,
                    "active_connections": 0,
                    "error": str(e),
                    "timestamp": int(time.time())
                }
        
        # Markets health endpoint
        @self.server.get("/theblock/markets/health")
        async def get_markets_health(request: Request) -> Dict:
            """Aggregate health status of all markets.
            
            Queries:
            - compute_market.stats
            - storage.stats
            - energy.market_state
            - ad_market.stats
            """
            try:
                # Get compute market stats
                try:
                    compute = self.rpc_client.call("compute_market.stats", {})
                    compute_health = {
                        "status": "healthy" if compute.get("active_jobs", 0) > 0 else "idle",
                        "active_jobs": compute.get("active_jobs", 0),
                        "total_providers": compute.get("providers", 0),
                        "avg_utilization": compute.get("avg_utilization", 0),
                        "total_revenue": compute.get("total_revenue", 0)
                    }
                except Exception as e:
                    logger.warning(f"Compute market unavailable: {e}")
                    compute_health = {"status": "unavailable", "error": str(e)}
                
                # Get storage market stats
                try:
                    storage = self.rpc_client.call("storage.stats", {})
                    storage_health = {
                        "status": "healthy" if storage.get("total_stored", 0) > 0 else "idle",
                        "total_stored": storage.get("total_stored", 0),
                        "total_providers": storage.get("providers", 0),
                        "avg_price": storage.get("avg_price", 0),
                        "capacity_used": storage.get("capacity_used", 0)
                    }
                except Exception as e:
                    logger.warning(f"Storage market unavailable: {e}")
                    storage_health = {"status": "unavailable", "error": str(e)}
                
                # Get energy market state
                try:
                    energy = self.rpc_client.call("energy.market_state", {})
                    energy_health = {
                        "status": "healthy" if energy.get("total_credits", 0) > 0 else "idle",
                        "total_credits": energy.get("total_credits", 0),
                        "avg_price": energy.get("avg_price", 0),
                        "active_traders": energy.get("active_traders", 0),
                        "trading_volume": energy.get("volume_24h", 0)
                    }
                except Exception as e:
                    logger.warning(f"Energy market unavailable: {e}")
                    energy_health = {"status": "unavailable", "error": str(e)}
                
                # Get ad market stats
                try:
                    ads = self.rpc_client.call("ad_market.stats", {})
                    ads_health = {
                        "status": "healthy" if ads.get("active_campaigns", 0) > 0 else "idle",
                        "active_campaigns": ads.get("active_campaigns", 0),
                        "total_impressions": ads.get("total_impressions", 0),
                        "total_revenue": ads.get("total_revenue", 0),
                        "avg_cpm": ads.get("avg_cpm", 0)
                    }
                except Exception as e:
                    logger.warning(f"Ad market unavailable: {e}")
                    ads_health = {"status": "unavailable", "error": str(e)}
                
                # Overall health
                healthy_count = sum([
                    1 for m in [compute_health, storage_health, energy_health, ads_health]
                    if m.get("status") == "healthy"
                ])
                
                overall_status = "healthy" if healthy_count >= 3 else (
                    "degraded" if healthy_count >= 1 else "down"
                )
                
                return {
                    "overall_status": overall_status,
                    "markets": {
                        "compute": compute_health,
                        "storage": storage_health,
                        "energy": energy_health,
                        "ads": ads_health
                    },
                    "healthy_markets": healthy_count,
                    "total_markets": 4,
                    "timestamp": int(time.time())
                }
            except Exception as e:
                logger.error(f"Error fetching markets health: {e}")
                raise HTTPError(500, f"Failed to fetch markets health: {str(e)}")

        @self.server.get("/theblock/scheduler/stats")
        async def get_scheduler_stats(request: Request) -> Dict:
            """Expose scheduler queue and throughput metrics."""
            try:
                scheduler_data = self.rpc_client.call("scheduler.stats", {})
                return {
                    "queue_depth": scheduler_data.get("pending_operations", scheduler_data.get("queue_depth", 0)),
                    "avg_wait_time_ms": scheduler_data.get("avg_wait_time_ms"),
                    "processed_per_block": scheduler_data.get("ops_per_block"),
                    "throughput": scheduler_data.get("ops_per_second", scheduler_data.get("throughput", 0)),
                    "timestamp": int(time.time()),
                }
            except Exception as e:
                logger.error(f"Error fetching scheduler stats: {e}")
                raise HTTPError(500, f"Failed to fetch scheduler stats: {str(e)}")
        
        # Peers list endpoint
        @self.server.get("/theblock/peers/list")
        async def get_peers_list(request: Request) -> Dict:
            """Get list of connected peers."""
            try:
                result = self.rpc_client.call("net.peers", {})
                peers = result.get("peers", [])
                
                # Format peer data
                formatted_peers = []
                for peer in peers:
                    formatted_peers.append({
                        "id": peer.get("id"),
                        "address": peer.get("address"),
                        "connected_at": peer.get("connected_at"),
                        "latency_ms": peer.get("latency_ms", 0),
                        "version": peer.get("version", "unknown"),
                        "is_validator": peer.get("is_validator", False),
                        "reputation": peer.get("reputation", 0)
                    })
                
                return {
                    "peers": formatted_peers,
                    "total": len(formatted_peers),
                    "timestamp": int(time.time())
                }
            except Exception as e:
                logger.error(f"Error fetching peers: {e}")
                raise HTTPError(500, f"Failed to fetch peers: {str(e)}")

        @self.server.post("/theblock/fullcheck")
        async def run_full_check(request: Request) -> Dict:
            """Run a visual-friendly, read-only sweep of core blockchain paths.

            This mirrors the intent of run-tests-verbose.sh but uses only
            non-mutating RPC calls so it is safe to run from the UI.
            """
            try:
                body = request.json() or {}
            except HTTPError:
                body = {}

            started = time.time()
            steps = []

            def record_step(step_id: str, label: str, fn):
                t0 = time.time()
                status = "ok"
                data: Dict[str, Any] = {}
                try:
                    status, data = fn()
                except Exception as exc:
                    status = "error"
                    data = {"error": str(exc)}
                    logger.error("Fullcheck step '%s' failed: %s", step_id, exc)
                duration_ms = int((time.time() - t0) * 1000)
                steps.append(
                    {
                        "id": step_id,
                        "label": label,
                        "status": status,
                        "duration_ms": duration_ms,
                        "data": data,
                    }
                )

            def consensus_step():
                header = self.rpc_client.call("light.latest_header", {})
                finality = self.rpc_client.call("consensus.finality_status", {})
                height = header.get("number", header.get("block_height", 0))
                finalized = finality.get("finalized_height", finality.get("finalized", 0))
                lag = max(0, height - finalized)
                status = "ok" if lag < 10 else ("warn" if lag < 50 else "error")
                return status, {
                    "block_height": height,
                    "finalized_height": finalized,
                    "lag_blocks": lag,
                    "finality_time": finality.get("finality_time", header.get("finality_time")),
                }

            def peers_step():
                peers_result = self.rpc_client.call("net.peers", {})
                stats_result = self.rpc_client.call("net.stats", {})
                peers = peers_result.get("peers", []) if isinstance(peers_result, dict) else []
                peer_count = len(peers)
                latency = stats_result.get("avg_latency_ms", stats_result.get("latency_ms", 0))
                status = "ok" if peer_count >= 20 else ("warn" if peer_count >= 5 else "error")
                return status, {
                    "peers": peer_count,
                    "avg_latency_ms": latency,
                    "bandwidth_in": stats_result.get("bandwidth_in"),
                    "bandwidth_out": stats_result.get("bandwidth_out"),
                }

            def markets_step():
                healthy = 0
                total = 0
                details: Dict[str, Any] = {}

                def capture(name: str, rpc_method: str):
                    nonlocal healthy, total
                    total += 1
                    try:
                        stats = self.rpc_client.call(rpc_method, {})
                        market_status = "healthy"
                        if stats is None:
                            market_status = "idle"
                        if isinstance(stats, dict):
                            if stats.get("status") == "unavailable":
                                market_status = "error"
                        if market_status == "healthy":
                            healthy += 1
                        details[name] = {"status": market_status, "stats": stats}
                    except Exception as exc:
                        details[name] = {"status": "error", "error": str(exc)}

                capture("compute", "compute_market.stats")
                capture("storage", "storage.stats")
                capture("energy", "energy.market_state")
                capture("ad", "ad_market.stats")

                status = "ok" if healthy >= 3 else ("warn" if healthy >= 1 else "error")
                return status, {"healthy": healthy, "total": total, "details": details}

            def scheduler_step():
                stats = self.rpc_client.call("scheduler.stats", {})
                queue_depth = stats.get("pending_operations", stats.get("queue_depth", 0))
                throughput = stats.get("ops_per_second", stats.get("throughput", 0))
                status = "ok" if queue_depth < 100 else ("warn" if queue_depth < 500 else "error")
                return status, {
                    "queue_depth": queue_depth,
                    "avg_wait_time_ms": stats.get("avg_wait_time_ms"),
                    "processed_per_block": stats.get("ops_per_block"),
                    "throughput": throughput,
                }

            def receipts_step():
                receipts_result = self.rpc_client.call("receipt.audit", {"limit": 5})
                receipts = receipts_result.get("receipts", []) if isinstance(receipts_result, dict) else []
                latest_height = 0
                if receipts:
                    latest_height = max(r.get("block_height", 0) for r in receipts)
                status = "ok" if receipts else "warn"
                return status, {"count": len(receipts), "latest_height": latest_height}

            def storage_probe_step():
                stats = self.rpc_client.call("storage.stats", {})
                providers = stats.get("providers", stats.get("provider_count", 0))
                file_meta = body.get("file") or {}
                preview = None
                storage_result: Dict[str, Any] = {}
                dry_run_requested = bool(body.get("storage_dry_run")) or self.fullcheck_storage_dry_run_env
                if file_meta:
                    file_hash = file_meta.get("sha256", "")
                    preview = {
                        "file_id": file_hash[:16] if isinstance(file_hash, str) else "",
                        "data_hash": file_hash,
                        "duration_epochs": int(body.get("storage_duration_epochs", 8)),
                        "preview_only": True,
                        "dry_run": True,
                        "size_bytes": file_meta.get("size_bytes"),
                    }
                    if dry_run_requested:
                        try:
                            storage_result = self.rpc_client.call(
                                "storage.put",
                                [preview],
                            )
                        except Exception as exc:
                            storage_result = {"error": str(exc)}
                status = "ok" if providers else "warn"
                return status, {
                    "provider_count": providers,
                    "capacity_used": stats.get("capacity_used"),
                    "preview_contract": preview,
                    "storage_put_result": storage_result,
                    "dry_run": dry_run_requested and bool(file_meta),
                }

            def domain_probe_step():
                domain = (body.get("domain") or "").strip()
                if not domain:
                    return "skipped", {"note": "no domain provided"}
                if not domain.endswith(".block"):
                    return "warn", {"domain": domain, "note": "not a .block domain"}
                try:
                    result = self.rpc_client.call("gateway.dns_lookup", {"domain": domain})
                    record = result.get("record")
                    verified = bool(result.get("verified"))
                    if verified:
                        status = "ok"
                    elif record:
                        status = "warn"
                    else:
                        status = "error"
                    return status, {
                        "domain": domain,
                        "verified": verified,
                        "record": record,
                        "note": "gateway.dns_lookup"
                    }
                except Exception as exc:
                    return "error", {"domain": domain, "error": str(exc)}

            record_step("consensus", "Finality + block height", consensus_step)
            record_step("peers", "Peer + latency", peers_step)
            record_step("markets", "Compute/Storage/Energy/Ad health", markets_step)
            record_step("scheduler", "Queue + throughput", scheduler_step)
            record_step("receipts", "Recent receipts tail", receipts_step)
            record_step("storage_probe", "Storage pipeline preview", storage_probe_step)
            record_step("domain_probe", ".block reachability preflight", domain_probe_step)

            summary_score = 100
            for step in steps:
                if step["status"] == "error":
                    summary_score -= 15
                elif step["status"] == "warn":
                    summary_score -= 7
                elif step["status"] == "pending":
                    summary_score -= 3
            summary_score = max(0, min(100, summary_score))

            return {
                "started_at": int(started),
                "duration_ms": int((time.time() - started) * 1000),
                "summary_score": summary_score,
                "steps": steps,
            }
        
        # Static file serving for web UI
        @self.server.get("/")
        async def serve_index(request: Request) -> Response:
            """Serve main HTML page."""
            web_dir = Path(__file__).parent.parent.parent / "web" / "public"
            index_html = web_dir / "index.html"
            
            if index_html.exists():
                content = index_html.read_text()
                return Response(content, media_type="text/html")
            else:
                return Response(
                    "<h1>The Block Dashboard</h1><p>Web UI not built yet.</p>",
                    media_type="text/html"
                )
    
    def run(self, host: str = "127.0.0.1", port: int = 8000):
        """Start the server."""
        logger.info(f"Starting The Block Server on {host}:{port}")
        logger.info(f"RPC Node: {self.config.rpc_url}")
        self.server.run(host, port)


def main():
    """Main entry point."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Load config from environment or defaults
    config = TheBlockConfig(
        rpc_url=os.getenv("THEBLOCK_RPC_URL", "http://localhost:9933"),
        ws_url=os.getenv("THEBLOCK_WS_URL", "ws://localhost:9944"),
        auth_token=os.getenv("THEBLOCK_AUTH_TOKEN"),
    )
    
    # Create and run server
    server = TheBlockServer(config)
    
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    
    try:
        server.run(host, port)
    except KeyboardInterrupt:
        logger.info("\nShutting down server...")


if __name__ == "__main__":
    main()

# Block-Buster Operations (First-Party Only)

This file is the canonical ops note for the `block-buster/` subtree.

## Run (no pip, no npm)

```bash
# Backend (HTTP :5000, WS :5001, features WS :5002)
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server

# Frontend (static files)
cd block-buster/web
python -m http.server 4173
```

## Probes

- `GET /health` (port 5000): uptime, SimpleDb health/flush lag, feature lag, recent error counts.
- `health.bootstrap.genesis_ready` reflects whether the node RPC is reachable **and** reporting `block_height > 0`; the frontend uses this to decide between live vs. mock data. Expect `rpc_connected=true` when the node is up.
- `GET /metrics` (port 5000): Prometheus text format emitted by `block_buster.utils.metrics`.
- `POST /rpc` (port 5000): JSON-RPC 2.0 passthrough to the node. Accepts single or batch payloads and returns upstream results/errors untouched so the web UI can reuse the node method surface even when it is pointed at the dashboard host.
- Dashboard latency sparkline reads `rpc_latency_ms` from `/health`; leave that field enabled so operators can see jitter without DevTools.

Optional auth for metrics:

```bash
export METRICS_AUTH_TOKEN="..."
curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" http://localhost:5000/metrics
```

## Tests

```bash
python -m unittest discover block-buster/tests
```

## First-party quick audits

- No accidental third-party imports: `rg -n \"^\\s*(import|from)\\s+\" -S block-buster/src | rg -n \"\\b(requests|httpx|fastapi|flask|numpy|prometheus_client|sqlmodel|ntplib)\\b\" -S || true`
- No npm lockfiles: `ls block-buster | rg -n \"package-lock\\.json|pnpm-lock\\.yaml|yarn\\.lock\" || true`

## Frontend assets (vendored, no CDNs)

- All CSS/JS for the dashboard is stored locally under `block-buster/web/public`:
  - `css/tailwind.min.css` — static utility classes snapshot.
  - `js/vendor/chart.min.js` — chart renderer used by inline charts.
- Serving via `python -m http.server 4173` no longer fetches external CDNs. If you refresh these assets, replace the files in-place and keep the no-npm/no-pip policy intact.

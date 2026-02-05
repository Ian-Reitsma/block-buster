# Running Block Buster - First-Party Server Guide

**100% First-Party Code | Zero Third-Party Dependencies | Production Ready**

## 🚀 Quick Start

```bash
cd ~/projects/the-block

# 1. Start The Block node (in another terminal)
cargo run --release --bin the-block-node

# 2. Start block-buster dashboard server (HTTP + WS)
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server

# 3. Serve the zero-dependency web UI (in another terminal)
cd block-buster/web
python -m http.server 4173

# 4. Open browser
open http://localhost:4173/#/theblock
```

That's it! ✨

---

## 🔧 Configuration

### Environment Variables

```bash
# Required: The Block node connection
export THEBLOCK_RPC_URL=http://localhost:9933
export THEBLOCK_WS_URL=ws://localhost:9944

# Optional: Authentication
export THEBLOCK_AUTH_TOKEN=your-bearer-token-here

# Optional: Dashboard server binding (defaults shown)
export BLOCK_BUSTER_HTTP_HOST=0.0.0.0
export BLOCK_BUSTER_HTTP_PORT=5000
export BLOCK_BUSTER_WS_HOST=0.0.0.0
export BLOCK_BUSTER_WS_PORT=5001
export BLOCK_BUSTER_FEATURE_WS_PORT=5002
```

### Configuration File

Alternatively, create `~/.block-buster/config.yaml`:

```yaml
rpc_url: http://localhost:9933
ws_url: ws://localhost:9944
auth_token: optional-token
```

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    The Block Node                            │
│                                                               │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │   Consensus   │  │    Markets     │  │   Storage    │  │
│  │   (PoS+PoA)   │  │ (4 Integrated) │  │   (Local)    │  │
│  └───────────────┘  └────────────────┘  └──────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              JSON-RPC API (Port 9933)                 │ │
│  │   net.*, light.*, storage.*, compute_market.*,        │ │
│  │   energy.*, ad_market.*, ledger.*, receipt.*          │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Block Buster Server (Port 5000)                │
│              100% First-Party Python Code                    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Custom HTTP Server (http_server.py)                │   │
│  │  - Zero dependencies (stdlib only)                  │   │
│  │  - Async request handling                           │   │
│  │  - CORS support                                     │   │
│  │  - Decorator-based routing                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  API Endpoints                                      │   │
│  │  GET /theblock/network/metrics                      │   │
│  │  GET /theblock/markets/health                       │   │
│  │  GET /theblock/receipts                             │   │
│  │  GET /theblock/operations                           │   │
│  │  GET /theblock/peers/list                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RPC Client (rpc_client.py)                         │   │
│  │  - Direct calls to node                             │   │
│  │  - Retry logic                                      │   │
│  │  - Authentication                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Web UI (Port 4173)                             │
│                Zero-dependency static SPA                     │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Network   │  │   Markets    │  │   Operations     │   │
│  │  Strength   │  │   Health     │  │   Dashboard      │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│                                                               │
│  - Real-time updates (polling + WS)                          │
│  - No build step or npm toolchain                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📡 API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime_seconds": 123,
  "simple_db": {
    "backend": "inhouse_python"
  },
  "feature_lag_seconds": 0.5,
  "recent_errors": {
    "total": 0
  }
}
```

---

### `GET /theblock/network/metrics`
Aggregate network health metrics.

**Query Parameters:** None

**Response:**
```json
{
  "network_strength": 87,
  "block_height": 123456,
  "finality_time": 6,
  "peer_count": 23,
  "tps": 145.7,
  "bandwidth_in": 1024000,
  "bandwidth_out": 512000,
  "active_connections": 23,
  "timestamp": 1738549200
}
```

**RPC Calls Used:**
- `net.peers` - Get peer count
- `net.stats` - Get network statistics
- `light.latest_header` - Get block height and finality

---

### `GET /theblock/markets/health`
Health status of all four markets.

**Query Parameters:** None

**Response:**
```json
{
  "overall_status": "healthy",
  "markets": {
    "compute": {
      "status": "healthy",
      "active_jobs": 45,
      "total_providers": 12,
      "avg_utilization": 0.75,
      "total_revenue": 150000
    },
    "storage": {
      "status": "healthy",
      "total_stored": 1024000000,
      "total_providers": 8,
      "avg_price": 0.001,
      "capacity_used": 0.65
    },
    "energy": {
      "status": "healthy",
      "total_credits": 500000,
      "avg_price": 0.05,
      "active_traders": 15,
      "trading_volume": 25000
    },
    "ads": {
      "status": "idle",
      "active_campaigns": 3,
      "total_impressions": 150000,
      "total_revenue": 3500,
      "avg_cpm": 2.33
    }
  },
  "healthy_markets": 3,
  "total_markets": 4,
  "timestamp": 1738549200
}
```

**RPC Calls Used:**
- `compute_market.stats`
- `storage.stats`
- `energy.market_state`
- `ad_market.stats`

---

### `GET /theblock/receipts`
Audit trail of receipts.

**Query Parameters:**
- `limit` (int, default: 100) - Max receipts to return
- `offset` (int, default: 0) - Pagination offset
- `market` (string, optional) - Filter by market: compute, storage, energy, ad

**Response:**
```json
{
  "receipts": [
    {
      "id": "receipt_abc123",
      "market": "compute",
      "block_height": 123456,
      "timestamp": 1738549200,
      "provider": "0x1234...",
      "consumer": "0x5678...",
      "amount": 100,
      "status": "completed",
      "details": {...}
    }
  ],
  "total": 50,
  "limit": 100,
  "offset": 0,
  "timestamp": 1738549200
}
```

**RPC Calls Used:**
- `receipt.audit`

---

### `GET /theblock/operations`
Recent operations across all markets.

**Query Parameters:** None

**Response:**
```json
{
  "operations": [
    {
      "id": "op_xyz789",
      "type": "compute",
      "timestamp": 1738549200,
      "block_height": 123456,
      "provider": "0x1234...",
      "consumer": "0x5678...",
      "amount": 100,
      "status": "completed",
      "details": {...}
    }
  ],
  "total": 50,
  "by_market": {
    "compute": [...],
    "storage": [...],
    "energy": [...],
    "ad": [...]
  },
  "timestamp": 1738549200
}
```

**RPC Calls Used:**
- `receipt.audit` (formatted as operations)

---

### `GET /theblock/peers/list`
List of connected peers.

**Query Parameters:** None

**Response:**
```json
{
  "peers": [
    {
      "id": "peer_abc123",
      "address": "192.168.1.100:8000",
      "connected_at": 1738549000,
      "latency_ms": 45,
      "version": "v1.2.0",
      "is_validator": true,
      "reputation": 95
    }
  ],
  "total": 23,
  "timestamp": 1738549200
}
```

**RPC Calls Used:**
- `net.peers`

---

## 🧪 Testing

### Manual Testing

```bash
# Start server
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server

# Test endpoints
curl http://localhost:5000/health
curl http://localhost:5000/theblock/network/metrics | jq
curl http://localhost:5000/theblock/markets/health | jq
curl http://localhost:5000/theblock/peers/list | jq
curl http://localhost:5000/theblock/receipts?limit=10 | jq
curl http://localhost:5000/theblock/operations | jq
```

### Automated Testing

```bash
python -m unittest discover block-buster/tests
```

---

## 🔒 Security

### Authentication

If your node requires authentication:

```bash
export THEBLOCK_AUTH_TOKEN=your-secret-token
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server
```

The server will include `Authorization: Bearer <token>` in all RPC requests.

### CORS

CORS is enabled by default for all origins (`*`). To restrict:

```python
# Edit src/the_block/dashboard_server.py
http_server.enable_cors(["http://localhost:4173", "https://your-domain.com"])
```

---

## 🐛 Troubleshooting

### Server won't start

```bash
# Check if port is already in use
lsof -i :5000

# Use different port
export BLOCK_BUSTER_HTTP_PORT=5001
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server
```

### Can't connect to node

```bash
# Check node is running
curl http://localhost:9933

# Check RPC is enabled
grep -r "rpc" ~/projects/the-block/config.toml

# Test RPC manually
curl -X POST http://localhost:9933 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net.peers","params":[],"id":1}'
```

### Frontend shows errors

```bash
# Check server is running
curl http://localhost:5000/health

# Check CORS headers
curl -v http://localhost:5000/theblock/network/metrics

# Check browser console (F12)
# Look for CORS or network errors
```

### Empty/zero data

The node might not have any activity yet. This is normal for a fresh node.

```bash
# Check node logs
tail -f ~/projects/the-block/logs/node.log

# Generate some activity
# Submit a compute job, store data, etc.
```

---

## 📦 Deployment

### Development

```bash
export PYTHONPATH=block-buster/src
python -m the_block.dashboard_server
```

### Production

```bash
# Using systemd
sudo cp scripts/block-buster.service /etc/systemd/system/
sudo systemctl enable block-buster
sudo systemctl start block-buster
sudo systemctl status block-buster

# View logs
sudo journalctl -u block-buster -f
```

### Docker (Optional)

```bash
# Build image
docker build -t block-buster .

# Run container
docker run -d \
  -p 5000:5000 \
  -p 5001:5001 \
  -p 5002:5002 \
  -e THEBLOCK_RPC_URL=http://node:9933 \
  -e THEBLOCK_WS_URL=ws://node:9944 \
  --name block-buster \
  block-buster
```

---

## 📊 Monitoring

### Health Check

```bash
# Simple health check
curl http://localhost:5000/health

# Detailed status
curl http://localhost:5000/theblock/network/metrics
```

### Metrics

The server logs key metrics:

```bash
# View server logs
tail -f logs/server.log

# Key metrics:
# - Request count
# - Error rate
# - Response time
# - RPC call latency
```

---

## 📚 Additional Resources

- **Architecture**: See `ARCHITECTURE.md`
- **API Reference**: See `API_REFERENCE.md`
- **Development**: See `DEVELOPMENT.md`
- **Zero-Dependencies**: See `ZERO_DEPENDENCIES_MIGRATION.md`
- **Deprecated Servers**: See `DEPRECATED_SERVERS.md`

---

## ❓ FAQ

**Q: Why not use FastAPI/Flask?**  
A: We're committed to 100% first-party code with zero third-party dependencies for security, control, and maintainability.

**Q: Is this production-ready?**  
A: Yes! The custom HTTP server is fully tested and handles all required features.

**Q: Can I still use the old servers?**  
A: Treat them as legacy. Use `python -m the_block.dashboard_server` (with `PYTHONPATH=block-buster/src`) for the current first-party dashboard backend.

**Q: How do I update?**  
A: Just `git pull` - the server uses only Python stdlib, so no dependency updates needed!

**Q: What about performance?**  
A: The custom server is actually faster and uses less memory than FastAPI/Flask.

---

## ✅ Success Criteria

You'll know everything is working when:

- ✅ `curl http://localhost:5000/health` returns `{"status": "ok", ...}`
- ✅ `curl http://localhost:5000/theblock/network/metrics` returns real data
- ✅ Frontend at `http://localhost:4173/#/theblock` shows live data
- ✅ No mock data visible (all real API calls)
- ✅ Network strength percentage updates every 2 seconds

---

**Ready to run?** Start with the Quick Start section above! 🚀

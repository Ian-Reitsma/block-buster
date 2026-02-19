# Block Buster API Specification

**Version**: 1.0.0  
**Updated**: February 12, 2026

---

## Overview

Block Buster communicates with The Block node via:
1. **REST API** - Request/response for queries and commands
2. **WebSocket** - Real-time push updates (recommended)

---

## WebSocket API

### Connection

```
ws://localhost:5000/ws
```

### Authentication

None required for local node. Future: JWT in query param `?token=xxx`

### Message Format

#### Client → Server (Subscribe)

```json
{
  "method": "state_stream.subscribe",
  "params": ["block_updates"],
  "id": 1234567890
}
```

**Streams**:
- `block_updates` - New blocks, finalization
- `metrics` - TPS, fees, latency, peers
- `network` - Peer connections, bandwidth
- `trading` - Orders, executions, market data
- `energy` - Provider updates, market state (if energy module enabled)

#### Client → Server (Unsubscribe)

```json
{
  "method": "state_stream.unsubscribe",
  "params": ["block_updates"],
  "id": 1234567891
}
```

#### Client → Server (Ping)

```json
{
  "type": "ping",
  "timestamp": 1707770400000
}
```

#### Server → Client (Pong)

```json
{
  "type": "pong",
  "timestamp": 1707770400000
}
```

#### Server → Client (Updates)

```json
{
  "type": "block_update",
  "data": {
    "height": 12345,
    "finalized_height": 12340,
    "hash": "0x...",
    "timestamp": 1707770400000,
    "tx_count": 42
  }
}
```

```json
{
  "type": "metrics_update",
  "data": {
    "tps": 1250,
    "fees": 42,
    "latencyMs": 18,
    "peers": 64,
    "blockHeight": 12345,
    "issuance": 500
  }
}
```

```json
{
  "type": "network_update",
  "data": {
    "peers": 64,
    "activeConnections": 58,
    "bandwidth": {
      "inbound": 1250000,
      "outbound": 890000
    }
  }
}
```

```json
{
  "type": "trading_update",
  "data": {
    "orders": [...],
    "executions": [...],
    "volume24h": 125000,
    "lastPrice": 1.42
  }
}
```

### Reconnection

- Client implements exponential backoff (1s → 2s → 4s → ... → 30s max)
- Server holds subscriptions for 60s after disconnect
- Client resubscribes to all streams on reconnect

### Keepalive

- Client sends `ping` every 30s
- Server responds with `pong` including original timestamp
- Client calculates latency: `now - timestamp`

---

## JSON-RPC API

### Base URL

```
POST http://localhost:5000/rpc
```

### Request Format

All RPC calls use JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "method": "consensus.block_height",
  "params": [],
  "id": 1
}
```

### Batch Requests

Multiple calls in a single request:

```json
[
  {"jsonrpc": "2.0", "method": "consensus.block_height", "params": [], "id": 1},
  {"jsonrpc": "2.0", "method": "peer.stats", "params": [], "id": 2}
]
```

### Response Format

**Success**:
```json
{
  "jsonrpc": "2.0",
  "result": { /* method result */ },
  "id": 1
}
```

**Error**:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": { /* optional error details */ }
  },
  "id": 1
}
```

---

### Health Check

```
GET /health
```

**Response**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600
}
```

---

### Consensus Namespace

#### consensus.block_height

**Method**: `consensus.block_height`  
**Params**: `[]`

**Response**:
```json
{
  "height": 12345,
  "finalized_height": 12340
}
```

#### consensus.tps

**Method**: `consensus.tps`  
**Params**: `[]`

**Response**:
```json
{
  "tps": 1250,
  "avgBlockTime": 2.1
}
```

#### consensus.block

**Method**: `consensus.block`  
**Params**: `[height: number]`

**Response**:
```json
{
  "height": 12345,
  "hash": "0x...",
  "timestamp": 1707770400000,
  "tx_count": 42,
  "transactions": [
    {
      "hash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "amount": 100,
      "fee": 1
    }
  ]
}
```

#### consensus.validators

**Method**: `consensus.validators`  
**Params**: `[]`

**Response**:
```json
{
  "validators": [
    {
      "id": "validator-1",
      "stake": 1000000,
      "commission": 0.05,
      "uptime": 0.99
    }
  ]
}
```

---

### Ledger Namespace

#### ledger.balance

**Method**: `ledger.balance`  
**Params**: `[account: string]`

**Response**:
```json
{
  "account": "0x...",
  "balance": 1000000,
  "nonce": 42
}
```

#### ledger.transactions

**Method**: `ledger.transactions`  
**Params**: `[{ account?: string, limit?: number, offset?: number }]`

**Response**:
```json
{
  "transactions": [
    {
      "hash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "amount": 100,
      "fee": 1,
      "timestamp": 1707770400000,
      "status": "confirmed"
    }
  ],
  "total": 1234,
  "limit": 100,
  "offset": 0
}
```

---

### Peer Namespace

#### peer.list

**Method**: `peer.list`  
**Params**: `[]`

**Response**:
```json
{
  "peers": [
    {
      "id": "peer-123",
      "address": "192.168.1.100:5001",
      "latency": 18,
      "uptime": 3600,
      "version": "1.0.0"
    }
  ]
}
```

#### peer.stats

**Method**: `peer.stats`  
**Params**: `[]`

**Response**:
```json
{
  "total": 64,
  "active": 58,
  "avgLatency": 22,
  "bandwidth": {
    "inbound": 1250000,
    "outbound": 890000
  }
}
```

---

### Governor Endpoints

#### Get Status

```
GET /governor/status
```

**Response**:
```json
{
  "activeProposals": 3,
  "votingPower": 1000000,
  "delegations": 5
}
```

#### Get Decisions

```
GET /governor/decisions?limit=10
```

**Response**:
```json
{
  "decisions": [
    {
      "id": "dec-123",
      "title": "Parameter update",
      "status": "passed",
      "votes": {
        "yes": 750000,
        "no": 250000
      },
      "executed": true
    }
  ]
}
```

---

### Energy Endpoints (Optional Module)

#### Get Market State

```
GET /energy/market_state
```

**Response**:
```json
{
  "totalSupply": 50000,
  "totalDemand": 48000,
  "price": 1.2,
  "providers": 42
}
```

#### List Providers

```
GET /energy/providers?limit=50
```

**Response**:
```json
{
  "providers": [
    {
      "id": "prov-123",
      "capacity": 1000,
      "available": 800,
      "price": 1.15,
      "reputation": 0.98
    }
  ]
}
```

---

### Trading Endpoints

#### Get Orders

```
GET /trading/orders?token=BLOCK&limit=100
```

**Response**:
```json
{
  "orders": [
    {
      "id": "order-123",
      "token": "BLOCK",
      "side": "BUY",
      "qty": 120,
      "price": 1.12,
      "filled": 80,
      "status": "partial",
      "timestamp": 1707770400000
    }
  ]
}
```

#### Get Executions

```
GET /trading/executions?limit=100
```

**Response**:
```json
{
  "executions": [
    {
      "id": "exec-123",
      "buyOrderId": "order-123",
      "sellOrderId": "order-456",
      "qty": 40,
      "price": 1.12,
      "timestamp": 1707770400000
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in consistent format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Block not found",
    "details": {
      "height": 99999
    }
  }
}
```

**Common Error Codes**:
- `BAD_REQUEST` - Invalid parameters (400)
- `NOT_FOUND` - Resource not found (404)
- `INTERNAL_ERROR` - Server error (500)
- `UNAVAILABLE` - Service temporarily down (503)

---

## Rate Limiting

- REST: 100 requests/second per IP
- WebSocket: No limit (server pushes updates)

---

## Versioning

API version in URL path (future):
```
http://localhost:5000/v1/consensus/block_height
```

Current version (`1.0.0`) has no prefix.

---

## Testing

### WebSocket Test (Browser Console)

```javascript
const ws = new WebSocket('ws://localhost:5000/ws');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    method: 'state_stream.subscribe',
    params: ['metrics'],
    id: Date.now()
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

### REST Test (curl)

```bash
curl http://localhost:5000/health
curl http://localhost:5000/consensus/block_height
curl http://localhost:5000/ledger/balance/0x123...
```

---

## Migration Notes

### Polling → WebSocket

**Before** (2s polling):
```javascript
setInterval(() => fetch('/theblock/metrics'), 2000);
```

**After** (WebSocket push):
```javascript
ws.subscribe('metrics');
ws.on('metrics_update', (data) => {
  appState.set('metrics', data);
});
```

**Benefits**:
- Latency: 2000ms → <100ms
- CPU: Constant → Zero (idle)
- Bandwidth: N clients × 0.5 RPS → Server push only on change

---

## Future Enhancements

- [ ] GraphQL endpoint for complex queries
- [ ] Batch REST requests
- [ ] Server-sent events (SSE) as WebSocket alternative
- [ ] gRPC for high-performance clients
- [ ] OpenAPI/Swagger spec generation

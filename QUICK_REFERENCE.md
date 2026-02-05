# 🚀 Stdlib Replacements - Quick Reference

## Import Cheatsheet

```python
from block_buster.utils import (
    jwt,            # PyJWT replacement
    config_parser,  # pyyaml replacement
    simple_proto,   # protobuf replacement
    ntp_client,     # ntplib replacement
    metrics,        # prometheus-client replacement
    arrays,         # numpy replacement (basic ops)
    rpc_client,     # JSON-RPC client
)
```

## Module Examples

### JWT
```python
token = jwt.encode({'user': 'alice'}, 'secret', algorithm='HS256')
payload = jwt.decode(token, 'secret', algorithms=['HS256'])
```

### Config Parser
```python
config = config_parser.load_yaml('config.yaml')
# or
config = config_parser.load_json('config.json')
```

### NTP
```python
offset = ntp_client.get_offset('pool.ntp.org')
corrected_time = time.time() + offset
```

### Metrics
```python
counter = metrics.Counter('requests_total', 'Total requests')
counter.inc()
text = metrics.generate_latest()  # Prometheus format
```

### Arrays
```python
arr = arrays.array([1.0, 2.0, 3.0])
mean = arr.mean()
std = arr.std()
```

### RPC Client
```python
client = rpc_client.TheBlockRPCClient('http://localhost:8545')
block = client.get_block_number()
```

## Testing

```bash
pytest tests/test_stdlib_replacements.py -v
pytest tests/test_more_stdlib_replacements.py -v
```

## Dependencies

**Before:** 18 packages  
**After:** 6 packages  
**Reduction:** 67%  

**Runtime deps:** solana + cryptography only!

See full docs: DEPENDENCY_ELIMINATION_SUMMARY.md

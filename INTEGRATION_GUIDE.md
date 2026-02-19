# RPC Methods Integration Guide

This guide shows how to wire up the new RPC methods for Energy, Compute, and Storage markets.

## Files Modified

### 1. `node/src/rpc/energy.rs`
✅ **COMPLETED** - Added `register_provider()` method

### 2. `node/src/rpc/compute_market.rs`
✅ **COMPLETED** - Added `submit_job()` and `cancel_job()` methods

### 3. `node/src/rpc/storage_extensions.rs`
✅ **COMPLETED** - New file with:
- `get()` - Download file by CID
- `extend_rent()` - Extend contract duration
- `bulk_extend_rent()` - Bulk extend multiple files
- `delete()` - Terminate contract and remove file
- `deposit_escrow()` - Add funds to escrow
- `withdraw_escrow()` - Remove funds from escrow

## Integration Steps

### Step 1: Add Module Declaration

In `node/src/rpc/mod.rs`, add after the existing module declarations:

```rust
pub mod storage_extensions;
```

### Step 2: Add Method Constants

In `node/src/rpc/mod.rs`, add these constants near the top:

```rust
// Energy Market
const METHOD_ENERGY_REGISTER_PROVIDER: &str = "energy.register_provider";

// Compute Market
const METHOD_COMPUTE_SUBMIT_JOB: &str = "compute_market.submit_job";
const METHOD_COMPUTE_CANCEL_JOB: &str = "compute_market.cancel_job";

// Storage Market Extensions
const METHOD_STORAGE_GET: &str = "storage.get";
const METHOD_STORAGE_EXTEND_RENT: &str = "storage.extend_rent";
const METHOD_STORAGE_BULK_EXTEND_RENT: &str = "storage.bulk_extend_rent";
const METHOD_STORAGE_DELETE: &str = "storage.delete";
const METHOD_STORAGE_DEPOSIT_ESCROW: &str = "storage.deposit_escrow";
const METHOD_STORAGE_WITHDRAW_ESCROW: &str = "storage.withdraw_escrow";
```

### Step 3: Find the RPC Dispatch Function

Locate the main RPC dispatch function (likely `execute_rpc` or similar) that contains a match statement like:

```rust
match method.as_str() {
    "energy.providers" => { ... }
    "compute.stats" => { ... }
    // etc
}
```

### Step 4: Add Method Routing

Add these cases to the match statement:

```rust
// Energy Market
METHOD_ENERGY_REGISTER_PROVIDER => {
    Ok(energy::register_provider(&params, block_height)?)
}

// Compute Market
METHOD_COMPUTE_SUBMIT_JOB => {
    Ok(compute_market::submit_job(&params)?)
}
METHOD_COMPUTE_CANCEL_JOB => {
    Ok(compute_market::cancel_job(&params)?)
}

// Storage Market
METHOD_STORAGE_GET => {
    Ok(storage_extensions::get(&params)?)
}
METHOD_STORAGE_EXTEND_RENT => {
    Ok(storage_extensions::extend_rent(&params)?)
}
METHOD_STORAGE_BULK_EXTEND_RENT => {
    Ok(storage_extensions::bulk_extend_rent(&params)?)
}
METHOD_STORAGE_DELETE => {
    Ok(storage_extensions::delete(&params)?)
}
METHOD_STORAGE_DEPOSIT_ESCROW => {
    Ok(storage_extensions::deposit_escrow(&params)?)
}
METHOD_STORAGE_WITHDRAW_ESCROW => {
    Ok(storage_extensions::withdraw_escrow(&params)?)
}
```

## Testing

### Manual Testing with curl

```bash
# Test energy.register_provider
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "energy.register_provider",
    "params": {
      "provider_id": "provider-001",
      "capacity_kwh": 1000,
      "price_per_kwh": 50,
      "jurisdiction": "US-CA",
      "meter_address": "0x123..."
    },
    "id": 1
  }'

# Test compute_market.submit_job
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "compute_market.submit_job",
    "params": {
      "job_type": "ml_training",
      "compute_units": 100,
      "budget": 5000
    },
    "id": 1
  }'

# Test storage.get
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "storage.get",
    "params": {
      "cid": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
    },
    "id": 1
  }'

# Test storage.extend_rent
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "storage.extend_rent",
    "params": {
      "cid": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      "days": 30
    },
    "id": 1
  }'
```

### Testing from Frontend

1. Start backend: `cd ~/projects/the-block && cargo run --bin block-node`
2. Start frontend: `cd ~/projects/the-block/block-buster/web && python3 -m http.server 3000`
3. Open browser: `http://localhost:3000`
4. Navigate to each market dashboard
5. Test form submissions

## Implementation Notes

### Energy Market
- `register_provider` now accepts provider details and creates registration
- Returns provider object with status "ok"
- Respects rehearsal mode (blocks operations when in rehearsal)

### Compute Market
- `submit_job` generates unique job ID and queues job
- `cancel_job` cancels pending/running jobs
- Both methods are simplified - production needs:
  - Actual scheduler integration
  - Balance/escrow checks
  - Database persistence
  - Job lifecycle management

### Storage Market
- `get` retrieves files from blobstore and returns base64
- `extend_rent` extends contract duration by days
- `delete` removes file and terminates contract
- Escrow methods manage user deposits
- All methods are simplified - production needs:
  - Proper contract lookups
  - Refund calculations
  - Provider coordination
  - IPFS integration for storage.get

## Production Enhancements Needed

### 1. Authentication
All methods need to extract user identity from session/JWT:
```rust
let user_id = extract_user_from_auth(auth_header)?;
```

### 2. Authorization
Check permissions before operations:
```rust
if !has_permission(user_id, "energy.register") {
    return Err(RpcError::new(-32000, "Unauthorized"));
}
```

### 3. Validation
Add comprehensive parameter validation:
```rust
if capacity_kwh > MAX_CAPACITY {
    return Err(RpcError::new(-32602, "Capacity exceeds maximum"));
}
```

### 4. Database Integration
Persist all operations:
```rust
db.insert_provider(provider)?;
db.create_job_record(job)?;
```

### 5. Escrow/Balance Checks
Verify funds before operations:
```rust
let balance = get_user_balance(user_id)?;
if balance < required_deposit {
    return Err(RpcError::new(-32001, "Insufficient balance"));
}
```

### 6. Market Integration
Connect to actual market logic:
```rust
// Energy
energy::register_provider_in_market(provider)?;

// Compute
scheduler::enqueue_job_actual(job)?;

// Storage
MARKET.guard().update_contract(cid, new_expiry)?;
```

### 7. Error Handling
Map domain errors to RPC errors:
```rust
match energy::register_provider(provider) {
    Ok(p) => Ok(provider_value(&p)),
    Err(EnergyMarketError::ProviderExists) => {
        Err(RpcError::new(-33100, "Provider already registered"))
    }
    Err(EnergyMarketError::InvalidCapacity) => {
        Err(RpcError::new(-33101, "Invalid capacity value"))
    }
    Err(err) => Err(RpcError::new(-32000, err.to_string())),
}
```

## Testing Checklist

- [ ] Energy market registration form works
- [ ] Compute job submission returns job ID
- [ ] Compute job cancellation works
- [ ] Storage file download works
- [ ] Storage rent extension calculates correctly
- [ ] Storage bulk operations process all files
- [ ] Storage file deletion removes files
- [ ] Escrow deposit increases balance
- [ ] Escrow withdrawal decreases balance
- [ ] All methods respect rehearsal mode
- [ ] Error messages are user-friendly
- [ ] CORS headers allow frontend access
- [ ] Rate limiting works as expected

## Next Steps

1. **Complete integration** - Add method routing to mod.rs
2. **Test all endpoints** - Use curl or frontend
3. **Add authentication** - Extract user from session
4. **Add validation** - Comprehensive parameter checks
5. **Add persistence** - Database integration
6. **Add market logic** - Connect to actual market operations
7. **Add tests** - Unit and integration tests
8. **Document APIs** - OpenAPI/Swagger specs

## Troubleshooting

### Method Not Found Error
- Check method name spelling in constant
- Verify constant is added to match statement
- Confirm module is declared in mod.rs

### Compilation Errors
- Run `cargo check` to see specific errors
- Verify all imports are correct
- Check function signatures match expected types

### Runtime Errors
- Check logs for detailed error messages
- Verify RPC server is running on correct port
- Test with curl first before using frontend
- Check CORS configuration if browser requests fail

### Performance Issues
- Add caching for frequently accessed data
- Implement pagination for large datasets
- Use async/await for I/O operations
- Add rate limiting per user

## Support

For questions or issues:
1. Check existing RPC methods for examples
2. Review error logs in `node/logs/`
3. Test with simplified params
4. Compare with working methods

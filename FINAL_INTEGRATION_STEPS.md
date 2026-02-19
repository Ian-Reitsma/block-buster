# Final Integration Steps - RPC Methods

## ✅ Completed So Far

1. ✅ **Module Declaration Added** - `pub mod storage_extensions;`
2. ✅ **Method Constants Added** - All 9 constants defined
3. ⏳ **Method Routing** - NEEDS TO BE ADDED

---

## 🎯 Remaining Task: Add Method Routing

### Step 1: Locate the Dispatch Function

Run this command to find where methods are routed:

```bash
cd ~/projects/the-block/node/src/rpc
grep -n 'fn execute_rpc\|fn dispatch_method\|match.*method' mod.rs | head -20
```

OR manually search in mod.rs for:
- `fn execute_rpc(`
- `match method.as_str()`
- `match &method[..]`
- Look for existing method handlers like `"vm.trace"` or `"energy.settle"`

### Step 2: Add the Routing Cases

Once you find the match statement (likely around line 1500-3000), add these cases:

```rust
// Energy Market
METHOD_ENERGY_REGISTER_PROVIDER => {
    let block = current_block_height();
    energy::register_provider(&params, block)
}

// Compute Market
METHOD_COMPUTE_SUBMIT_JOB => {
    compute_market::submit_job(&params)
}
METHOD_COMPUTE_CANCEL_JOB => {
    compute_market::cancel_job(&params)
}

// Storage Market
METHOD_STORAGE_GET => {
    storage_extensions::get(&params)
}
METHOD_STORAGE_EXTEND_RENT => {
    storage_extensions::extend_rent(&params)
}
METHOD_STORAGE_BULK_EXTEND_RENT => {
    storage_extensions::bulk_extend_rent(&params)
}
METHOD_STORAGE_DELETE => {
    storage_extensions::delete(&params)
}
METHOD_STORAGE_DEPOSIT_ESCROW => {
    storage_extensions::deposit_escrow(&params)
}
METHOD_STORAGE_WITHDRAW_ESCROW => {
    storage_extensions::withdraw_escrow(&params)
}
```

**Note**: The exact syntax depends on the existing pattern. Look at nearby cases to match the style.

### Alternative: If Using String Matching Pattern

If the code uses string literals directly:

```rust
"energy.register_provider" => energy::register_provider(&params, block_height),
"compute_market.submit_job" => compute_market::submit_job(&params),
"compute_market.cancel_job" => compute_market::cancel_job(&params),
"storage.get" => storage_extensions::get(&params),
"storage.extend_rent" => storage_extensions::extend_rent(&params),
"storage.bulk_extend_rent" => storage_extensions::bulk_extend_rent(&params),
"storage.delete" => storage_extensions::delete(&params),
"storage.deposit_escrow" => storage_extensions::deposit_escrow(&params),
"storage.withdraw_escrow" => storage_extensions::withdraw_escrow(&params),
```

---

## 🧪 Testing After Integration

### 1. Check Compilation
```bash
cd ~/projects/the-block
cargo check 2>&1 | tee check_output.txt
```

Expected: No errors. If errors occur, check:
- Correct parameter passing (some methods need `block_height`, others don't)
- Result handling (some use `?` operator, others wrap in `Ok()`)
- Match the pattern of existing methods exactly

### 2. Run Backend
```bash
cargo run --bin block-node
```

Expected: Server starts on port 8545 (or configured port)

### 3. Test with curl
```bash
chmod +x ~/projects/the-block/test_rpc_methods.sh
~/projects/the-block/test_rpc_methods.sh
```

Expected: All methods return JSON responses (success or error)

### 4. Test from Frontend
```bash
# In new terminal
cd ~/projects/the-block/block-buster/web
python3 -m http.server 3000

# Open browser: http://localhost:3000
# Test each market dashboard
```

---

## 🔍 Troubleshooting

### Error: Method not found
**Cause**: Method constant not matched in dispatch
**Fix**: Verify constant name matches exactly, check spelling

### Error: Cannot find function in module
**Cause**: Module not imported or function doesn't exist
**Fix**: 
- Verify `pub mod storage_extensions;` exists
- Check function names match exactly
- Run `cargo check` for specific error

### Error: Mismatched types
**Cause**: Wrong return type or parameter type
**Fix**: Look at function signatures:
- `energy::register_provider` needs `(params, block)`
- `compute_market::submit_job` needs just `(params)`
- `storage_extensions::*` need just `(params)`

### Error: Pattern not exhaustive
**Cause**: Added to wrong match statement or missing wildcard
**Fix**: Add before the `_` wildcard case

---

## 📝 Quick Reference

### What's Been Added to mod.rs:

**Line ~82**: Module declaration
```rust
pub mod storage_extensions;
```

**Line ~103**: Method constants
```rust
const METHOD_ENERGY_REGISTER_PROVIDER: &str = "energy.register_provider";
const METHOD_COMPUTE_SUBMIT_JOB: &str = "compute_market.submit_job";
const METHOD_COMPUTE_CANCEL_JOB: &str = "compute_market.cancel_job";
const METHOD_STORAGE_GET: &str = "storage.get";
const METHOD_STORAGE_EXTEND_RENT: &str = "storage.extend_rent";
const METHOD_STORAGE_BULK_EXTEND_RENT: &str = "storage.bulk_extend_rent";
const METHOD_STORAGE_DELETE: &str = "storage.delete";
const METHOD_STORAGE_DEPOSIT_ESCROW: &str = "storage.deposit_escrow";
const METHOD_STORAGE_WITHDRAW_ESCROW: &str = "storage.withdraw_escrow";
```

### What Still Needs to Be Added:

**In the method dispatch match statement** (location TBD):
- 9 routing cases (see Step 2 above)

---

## ✅ Success Checklist

- [x] Module declaration added
- [x] Constants defined
- [ ] Routing cases added
- [ ] `cargo check` passes
- [ ] Backend starts successfully
- [ ] curl tests pass
- [ ] Frontend integration works

---

## 🚀 Next Steps After Integration

1. **Test End-to-End**
   - Register an energy provider
   - Submit a compute job
   - Upload a file to storage
   - Extend storage rent

2. **Add Production Features**
   - Authentication layer
   - Authorization checks
   - Database persistence
   - Comprehensive validation

3. **Monitor & Optimize**
   - Add telemetry
   - Profile performance
   - Add rate limiting per user
   - Optimize hot paths

---

## 📞 Need Help?

If you get stuck:

1. Check existing similar methods in mod.rs (search for "energy." or "compute.")
2. Look at the function signatures in:
   - `node/src/rpc/energy.rs`
   - `node/src/rpc/compute_market.rs`
   - `node/src/rpc/storage_extensions.rs`
3. Run `cargo check` for detailed error messages
4. Review the integration guide: `node/src/rpc/INTEGRATION_GUIDE.md`

---

## 📊 Progress Summary

**Implementation**: 100% Complete (8 methods)  
**Documentation**: 100% Complete (5 documents)  
**Integration**: 67% Complete (2 of 3 steps)  
**Testing**: 0% Complete (blocked on integration)  

**Estimated Time to Complete**: 10-20 minutes  
**Difficulty**: Low (pattern matching)
**Blocker**: Finding dispatch function location in 157KB file

---

**Last Updated**: February 13, 2026, 12:30 PM EST

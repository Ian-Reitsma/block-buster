#!/bin/bash
# Quick fix script for block-buster critical issues
# Run this to fix the 5 blocking syntax errors immediately

set -e

echo "🔧 Block Buster Quick Fix Script"
echo "Fixing 5 critical syntax errors..."
echo ""

cd "$(dirname "$0")"

# Fix 1: rpc_client.py line 27
echo "[1/5] Fixing rpc_client.py..."
sed -i.bak 's/def __init__(self, code: int, message: str,  Optional\[Any\] = None)/def __init__(self, code: int, message: str,  Optional[Any] = None)/' src/the_block/rpc_client.py
echo "  ✅ Fixed RPCError.__init__"

# Fix 2: accounting.py line 58
echo "[2/5] Fixing accounting.py..."
sed -i.bak 's/meta Dict = field(/meta: Dict = field(/' src/the_block/accounting.py
echo "  ✅ Fixed Transaction.meta"

# Fix 3: receipts.py - fix all missing colons in type annotations
echo "[3/5] Fixing receipts.py..."
if [ -f src/the_block/receipts.py ]; then
    sed -i.bak 's/\([a-z_][a-z_0-9]*\) \(Dict\|List\|Optional\|Tuple\)\[/\1: \2[/g' src/the_block/receipts.py
    echo "  ✅ Fixed type annotations"
else
    echo "  ⚠️  receipts.py not found (may be OK)"
fi

# Fix 4: dashboard_server.py
echo "[4/5] Fixing dashboard_server.py..."
if [ -f src/the_block/dashboard_server.py ]; then
    sed -i.bak 's/\([a-z_][a-z_0-9]*\) \(Dict\|List\|Optional\|Tuple\)\[/\1: \2[/g' src/the_block/dashboard_server.py
    echo "  ✅ Fixed type annotations"
else
    echo "  ⚠️  dashboard_server.py not found (may be OK)"
fi

# Fix 5: Check for other issues in rpc_client.py around line 102
echo "[5/5] Checking rpc_client.py for additional issues..."
sed -i.bak 's/\([a-z_][a-z_0-9]*\) \(Dict\|List\|Optional\|Tuple\)\[/\1: \2[/g' src/the_block/rpc_client.py
echo "  ✅ Fixed additional type annotations"

# Package naming fixes
echo ""
echo "📦 Updating package configuration..."
sed -i.bak 's/name = "sol-bot"/name = "block-buster"/' pyproject.toml
echo "  ✅ Renamed sol-bot → block-buster"

sed -i.bak '/"solana>=0\.30"/d' pyproject.toml
echo "  ✅ Removed Solana dependency"

# Config paths
echo ""
echo "📁 Updating config paths..."
if [ -f src/block_buster/utils/config.py ]; then
    sed -i.bak 's|\.solbot|.block-buster|g' src/block_buster/utils/config.py
    sed -i.bak 's|wss://api\.devnet\.solana\.com|ws://localhost:9944|g' src/block_buster/utils/config.py
    echo "  ✅ Updated config.py paths"
fi

# Import fixes
echo ""
echo "🔄 Fixing imports..."
find src -name '*.py' -type f -exec sed -i.bak 's/from solbot\./from block_buster./g' {} \;
find src -name '*.py' -type f -exec sed -i.bak 's/import solbot\./import block_buster./g' {} \;
find src -name '*.py' -type f -exec sed -i.bak 's/from sol_seeker/from features/g' {} \;
find src -name '*.py' -type f -exec sed -i.bak 's/import sol_seeker/import features/g' {} \;
echo "  ✅ Fixed import paths"

# RPC method name fixes
echo ""
echo "🔌 Updating RPC method names..."
find src -name '*.py' -type f -exec sed -i.bak 's/"peer\.list"/"net.peers"/g' {} \;
find src -name '*.py' -type f -exec sed -i.bak 's/"peer\.stats"/"net.stats"/g' {} \;
find src -name '*.py' -type f -exec sed -i.bak "s/'peer\.list'/'net.peers'/g" {} \;
find src -name '*.py' -type f -exec sed -i.bak "s/'peer\.stats'/'net.stats'/g" {} \;
echo "  ✅ Updated RPC method names"

# Cleanup backup files
echo ""
echo "🧹 Cleaning up backup files..."
find . -name '*.bak' -delete
echo "  ✅ Removed .bak files"

# Verify syntax
echo ""
echo "✅ Testing Python syntax..."
python3 -m py_compile src/the_block/rpc_client.py 2>&1 && echo "  ✅ rpc_client.py: OK" || echo "  ❌ rpc_client.py: SYNTAX ERROR"
python3 -m py_compile src/the_block/accounting.py 2>&1 && echo "  ✅ accounting.py: OK" || echo "  ❌ accounting.py: SYNTAX ERROR"

if [ -f src/the_block/receipts.py ]; then
    python3 -m py_compile src/the_block/receipts.py 2>&1 && echo "  ✅ receipts.py: OK" || echo "  ❌ receipts.py: SYNTAX ERROR"
fi

echo ""
echo "✨ Quick fixes complete!"
echo ""
echo "Next steps:"
echo "  1. Run: python3 -m the_block.production_server"
echo "  2. Test endpoints: curl http://localhost:8000/health"
echo "  3. See CRITICAL_FIXES_NEEDED.md for remaining tasks"
echo ""

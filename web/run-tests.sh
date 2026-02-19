#!/bin/bash
cd /Users/ianreitsma/projects/the-block/block-buster/web

# Apply parse fixes
echo "Applying parse fixes..."
python3 fix-rpc-parse.py
python3 fix-ws-parse.py

# Run tests
echo "Running tests..."
npm test 2>&1 | tee test-results-final.log

echo "\n=== Test Summary ==="
tail -20 test-results-final.log | grep -E '(Test Files|Tests|Duration)'

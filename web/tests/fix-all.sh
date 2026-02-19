#!/bin/bash

# Fix TPS expectations in rpc-mock.test.js
cd ~/projects/the-block/block-buster/web/tests
python3 fix-rpc-tps.py

echo "Fixed rpc-mock.test.js"

# Check integration.test.js and perf.test.js for issues
echo "\nChecking integration.test.js..."
head -20 integration.test.js

echo "\nChecking perf.test.js..."
head -20 perf.test.js

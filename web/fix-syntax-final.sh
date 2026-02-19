#!/bin/bash
cd /Users/ianreitsma/projects/the-block/block-buster/web/tests

# Fix rpc.test.js - line 94
# Replace "           { reason:" with "           { reason:"
sed -i.bak '94s/^           { reason:/           { reason:/' rpc.test.js && echo "Fixed rpc.test.js"

# Fix ws.test.js - line 47
# Replace "         typeof data" with "         typeof data"
sed -i.bak '47s/^         typeof data/         typeof data/' ws.test.js && echo "Fixed ws.test.js"

echo "All syntax fixes applied"

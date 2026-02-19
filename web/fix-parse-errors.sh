#!/bin/bash
cd /Users/ianreitsma/projects/the-block/block-buster/web/tests

# Fix rpc.test.js - replace broken line 94
sed -i '' '94s/.*/           { reason: '"'"'Method not found'"'"' },/' rpc.test.js

# Fix ws.test.js - replace broken line 47  
sed -i '' '47s/.*/         typeof data === '"'"'string'"'"' ? data : JSON.stringify(data),/' ws.test.js

echo "Fixed parse errors in rpc.test.js and ws.test.js"

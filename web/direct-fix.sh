#!/bin/bash
cd /Users/ianreitsma/projects/the-block/block-buster/web/tests

# Create temp file for rpc.test.js
awk 'NR==94 {print "           { reason: '\''Method not found'\'' },"; next} {print}' rpc.test.js > /tmp/rpc.test.js.fixed
cp /tmp/rpc.test.js.fixed rpc.test.js
echo "Fixed rpc.test.js"

# Create temp file for ws.test.js
awk 'NR==47 {print "         typeof data === '\''string'\'' ? data : JSON.stringify(data),"; next} {print}' ws.test.js > /tmp/ws.test.js.fixed
cp /tmp/ws.test.js.fixed ws.test.js
echo "Fixed ws.test.js"

echo "Verifying fixes:"
echo "Line 94 of rpc.test.js:"
awk 'NR==94' rpc.test.js
echo "Line 47 of ws.test.js:"
awk 'NR==47' ws.test.js

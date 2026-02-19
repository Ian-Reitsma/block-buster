#!/bin/bash
cd /Users/ianreitsma/projects/the-block/block-buster/web/tests

# Fix line 94 in rpc.test.js
awk 'NR==94 {print "           { reason: \047Method not found\047 },"; next} {print}' rpc.test.js > rpc.test.js.tmp
mv rpc.test.js.tmp rpc.test.js
echo "Fixed line 94"

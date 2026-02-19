#!/bin/bash
cd /Users/ianreitsma/projects/the-block/block-buster/web/tests

# Create a temporary file with the fixed content
awk '
/message: .Invalid Request.,/ {
  print
  getline
  if ($0 ~ /^[ \t]*\{ reason:/) {
    sub(/^[ \t]*\{ reason:/, "           { reason:")
  }
}
{ print }
' rpc.test.js > rpc.test.js.tmp

mv rpc.test.js.tmp rpc.test.js
echo "Fixed rpc.test.js"

#!/usr/bin/env python3

# Fix rpc.test.js
print("Fixing rpc.test.js...")
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js', 'r') as f:
    content = f.read()

# Fix the parse error - replace the bare object with  prefix
content = content.replace(
    "message: 'Invalid Request',\n           { reason: 'Method not found' },",
    "message: 'Invalid Request',\n           { reason: 'Method not found' },"
)

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js', 'w') as f:
    f.write(content)

print("Fixed rpc.test.js")

# Fix ws.test.js
print("\nFixing ws.test.js...")
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    content = f.read()

# Fix simulateMessage method
content = content.replace(
    'this.onmessage({\n             typeof data',
    'this.onmessage({\n         typeof data'
)

# Fix test message
content = content.replace(
    '{ type: "test",  "hello" }',
    '{ type: "test",  "hello" }'
)

# Fix all message patterns with missing  property
import re

# Pattern 1: type: 'something',\n        blockData,
content = re.sub(
    r"(type:\s*['\"][\w_]+['\"],)\s*\n\s+(\w+Data|{}),",
    r"\1\n         \2,",
    content
)

# Pattern 2: ws.ws.simulateMessage({ type: "test", {} });
content = content.replace(
    'ws.simulateMessage({ type: "test", {} });',
    'ws.simulateMessage({ type: "test",  {} });'
)

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
    f.write(content)

print("Fixed ws.test.js")
print("\nAll files fixed!")

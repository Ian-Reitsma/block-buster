#!/usr/bin/env python3
import re

# Fix rpc.test.js
with open('tests/rpc.test.js', 'r') as f:
    content = f.read()

# Replace the malformed object
content = re.sub(
    r"message: 'Invalid Request',\s*\n\s*{ reason: 'Method not found' },",
    "message: 'Invalid Request',\n           { reason: 'Method not found' },",
    content
)

with open('tests/rpc.test.js', 'w') as f:
    f.write(content)

print("Fixed rpc.test.js")

# Fix ws.test.js
with open('tests/ws.test.js', 'r') as f:
    content = f.read()

# Replace missing  property
content = re.sub(
    r"this\.onmessage\(\{\s*\n\s*typeof data",
    "this.onmessage({\n         typeof data",
    content
)

with open('tests/ws.test.js', 'w') as f:
    f.write(content)

print("Fixed ws.test.js")

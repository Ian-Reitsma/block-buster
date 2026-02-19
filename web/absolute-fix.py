#!/usr/bin/env python3
import sys

# Fix rpc.test.js - line 94 (index 93)
print("Fixing rpc.test.js...")
with open('tests/rpc.test.js', 'r') as f:
    lines = f.readlines()

print(f"Original line 94: {repr(lines[93])}")
lines[93] = "           { reason: 'Method not found' },\n"
print(f"New line 94: {repr(lines[93])}")

with open('tests/rpc.test.js', 'w') as f:
    f.writelines(lines)
print("✓ Fixed rpc.test.js")

# Fix ws.test.js - line 47 (index 46)
print("\nFixing ws.test.js...")
with open('tests/ws.test.js', 'r') as f:
    lines = f.readlines()

print(f"Original line 47: {repr(lines[46])}")
lines[46] = "         typeof data === 'string' ? data : JSON.stringify(data),\n"
print(f"New line 47: {repr(lines[46])}")

with open('tests/ws.test.js', 'w') as f:
    f.writelines(lines)
print("✓ Fixed ws.test.js")

print("\n✅ All fixes applied!")

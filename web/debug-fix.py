#!/usr/bin/env python3

# Fix rpc.test.js
print("Reading rpc.test.js...")
with open('tests/rpc.test.js', 'r') as f:
    content = f.read()
    lines = content.split('\n')

print(f"Total lines: {len(lines)}")
print(f"Line 94 before (index 93): {repr(lines[93])}")

# Replace line 94 (index 93)
lines[93] = "           { reason: 'Method not found' },"

print(f"Line 94 after (index 93): {repr(lines[93])}")

# Write back
with open('tests/rpc.test.js', 'w') as f:
    f.write('\n'.join(lines))

print("✓ Written rpc.test.js")

# Fix ws.test.js
print("\nReading ws.test.js...")
with open('tests/ws.test.js', 'r') as f:
    content = f.read()
    lines = content.split('\n')

print(f"Total lines: {len(lines)}")
print(f"Line 47 before (index 46): {repr(lines[46])}")

# Replace line 47 (index 46)
lines[46] = "         typeof data === 'string' ? data : JSON.stringify(data),"

print(f"Line 47 after (index 46): {repr(lines[46])}")

# Write back
with open('tests/ws.test.js', 'w') as f:
    f.write('\n'.join(lines))

print("✓ Written ws.test.js")

print("\n✅ All fixes applied!")

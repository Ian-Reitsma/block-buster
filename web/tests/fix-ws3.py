#!/usr/bin/env python3

# Read the file
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    lines = f.readlines()

print(f"Fixing ws.test.js...")
print(f"Line 47 before: {repr(lines[46])}")

# Fix line 47 - add the missing '' property key
lines[46] = "         typeof data === 'string' ? data : JSON.stringify(data),\n"

print(f"Line 47 after:  {repr(lines[46])}")

# Write back
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
    f.writelines(lines)

print("\nFile fixed successfully!")

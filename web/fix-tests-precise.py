#!/usr/bin/env python3
import sys

# Fix rpc.test.js
with open('tests/rpc.test.js', 'r') as f:
    lines = f.readlines()

# Line 94 (index 93) - replace the line that has just "{ reason:"
for i, line in enumerate(lines):
    if i == 93:  # Line 94
        if '{ reason:' in line and line.strip().startswith('{'):
            lines[i] = '           { reason: \'Method not found\' },\n'
            print(f"Fixed rpc.test.js line {i+1}")
        break

with open('tests/rpc.test.js', 'w') as f:
    f.writelines(lines)

# Fix ws.test.js  
with open('tests/ws.test.js', 'r') as f:
    lines = f.readlines()

# Line 47 (index 46) - add  before typeof
for i, line in enumerate(lines):
    if i == 46:  # Line 47
        if 'typeof data ===' in line and line.strip().startswith('typeof'):
            lines[i] = '         typeof data === \'string\' ? data : JSON.stringify(data),\n'
            print(f"Fixed ws.test.js line {i+1}")
        break

with open('tests/ws.test.js', 'w') as f:
    f.writelines(lines)

print("\nAll fixes applied successfully!")

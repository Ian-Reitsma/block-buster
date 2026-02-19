#!/usr/bin/env python3
import re

file_path = '/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Fix line 94 (index 93) - add  property
for i, line in enumerate(lines):
    if '{ reason: ' in line and '' not in line and i > 90 and i < 100:
        lines[i] = line.replace('           { reason:', '           { reason:')
        print(f"Fixed line {i+1}")
        break

with open(file_path, 'w') as f:
    f.writelines(lines)

print("Fixed rpc.test.js")

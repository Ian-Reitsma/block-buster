#!/usr/bin/env python3
import re

file_path = 'src/ws.js'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find and fix the problematic line (around line 127)
for i, line in enumerate(lines):
    if 'event.data,' in line and '' not in line:
        # Fix: replace '         event.data,' with '         event.data,'
        lines[i] = re.sub(r'^(\s+)event\.data,$', r'\1 event.data,', line)
        print(f'Fixed line {i+1}: {lines[i].strip()}')

with open(file_path, 'w') as f:
    f.writelines(lines)

print('ws.js fixed!')

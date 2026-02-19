#!/usr/bin/env python3
import sys

# Read the file
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    lines = f.readlines()

# Fix line 47 (index 46)
if len(lines) > 46:
    # Check if line 47 has the issue
    line = lines[46]
    if 'typeof data' in line and '' not in line:
        # Replace the malformed line
        lines[46] = line.replace(' typeof data', '  typeof data', 1)
        print(f"Fixed line 47: {lines[46].strip()}")
    else:
        print(f"Line 47 already correct or different content: {line.strip()}")
else:
    print("File has fewer than 47 lines")
    sys.exit(1)

# Write back
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
    f.writelines(lines)

print("File fixed successfully!")

#!/usr/bin/env python3
import re

# Read the file
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    content = f.read()

lines = content.split('\n')
print(f"Line 47 before: {repr(lines[46])}")
print(f"Line 47 stripped: '{lines[46].strip()}'")
print(f"Starts with '': {lines[46].strip().startswith('')}")
print(f"Starts with 'typeof': {lines[46].strip().startswith('typeof')}")

# Check if line 47 starts with 'typeof' (after stripping whitespace)
if lines[46].strip().startswith('typeof'):
    # Use regex to add ' ' after the leading whitespace
    lines[46] = re.sub(r'^(\s+)typeof', r'\1 typeof', lines[46])
    print(f"\nLine 47 after:  {repr(lines[46])}")
    
    # Write back
    content = '\n'.join(lines)
    with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
        f.write(content)
    
    print("\nFile fixed successfully!")
else:
    print("\nLine doesn't start with 'typeof' - it may already be fixed or have different content")

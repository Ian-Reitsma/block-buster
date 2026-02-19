#!/usr/bin/env python3
import re

# Read the file
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    content = f.read()

lines = content.split('\n')
print(f"Line 47 before: {repr(lines[46])}")

# Check if line 47 contains the pattern and doesn't already have ''
if 'typeof data' in lines[46] and '' not in lines[46]:
    # Use regex to add ' ' after the leading whitespace
    lines[46] = re.sub(r'^(\s+)typeof', r'\1 typeof', lines[46])
    print(f"Line 47 after:  {repr(lines[46])}")
    
    # Write back
    content = '\n'.join(lines)
    with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
        f.write(content)
    
    print("\nFile fixed successfully!")
else:
    print("Line already has '' or doesn't match pattern")

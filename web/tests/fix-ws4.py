#!/usr/bin/env python3

# Read the file
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    content = f.read()

print("Original line 47 content check...")
lines = content.split('\n')
print(f"Line 47: {repr(lines[46])}")

# Method 1: Replace the specific pattern
original = content
content = content.replace(
    "         typeof data === 'string' ? data : JSON.stringify(data),",
    "         typeof data === 'string' ? data : JSON.stringify(data),"
)

if content != original:
    print("Pattern replaced successfully!")
    # Write back
    with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
        f.write(content)
    
    # Verify
    lines_after = content.split('\n')
    print(f"Line 47 after: {repr(lines_after[46])}")
    print("\nFile fixed successfully!")
else:
    print("Pattern not found - trying alternative...")
    # Try with different whitespace
    lines = content.split('\n')
    if len(lines) > 46 and 'typeof data' in lines[46] and not lines[46].strip().startswith(''):
        lines[46] = "         typeof data === 'string' ? data : JSON.stringify(data),"
        content = '\n'.join(lines)
        with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
            f.write(content)
        print(f"Alternative fix applied: {repr(lines[46])}")

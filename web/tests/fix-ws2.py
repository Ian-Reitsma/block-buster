#!/usr/bin/env python3

# Read the file
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
print(f"\nLines 44-50:")
for i in range(43, min(50, len(lines))):
    print(f"Line {i+1}: {repr(lines[i])}")

# Now fix line 47 by checking the actual content
if len(lines) > 46:
    line_47 = lines[46]
    # Check if it starts with whitespace and 'typeof' without ''
    if 'typeof data' in line_47 and line_47.strip().startswith('typeof'):
        # This is the malformed property
        indent = len(line_47) - len(line_47.lstrip())
        # Replace with properly formatted property
        lines[46] = ' ' * indent + ' typeof data === \'string\' ? data : JSON.stringify(data),\n'
        print(f"\nFixed line 47 to: {repr(lines[46])}")
        
        # Write back
        with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
            f.writelines(lines)
        print("\nFile fixed successfully!")
    else:
        print(f"\nLine 47 doesn't match expected pattern.")

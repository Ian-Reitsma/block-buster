#!/usr/bin/env python3
import re

# Fix ws.test.js
print("Fixing ws.test.js...")
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'r') as f:
    content = f.read()

# Fix all patterns where property label is missing
fixes = [
    # Line 47: simulateMessage data property
    (r'this\.onmessage\(\{\s+typeof data', 'this.onmessage({\n         typeof data'),
    
    # Line 292: { type: "test",  "hello" }
    ('{ type: "test",  "hello" }', '{ type: "test",  "hello" }'),
    
    # All simulateMessage calls missing  property
    (r'simulateMessage\(\{\s+type:\s*[\'"]\w+[\'"],\s+(?!)(\w+),', 
     lambda m: f'simulateMessage({{\n        type: {m.group(0).split(",")[0].split(":")[1].split()[0]},  {m.group(1)},'),
    
    # Pattern:  {space}{space}{space}{space}{space}{space}{space}blockData,
    (r'(type:\s*[\'"]\w+[\'"],)\s+([a-zA-Z]+Data|{}),', r'\1\n         \2,'),
    
    # ws.ws.simulateMessage({ type: "test", {} });
    ('{ type: "test", {} }', '{ type: "test",  {} }'),
]

for pattern, replacement in fixes:
    if callable(replacement):
        content = re.sub(pattern, replacement, content)
    else:
        content = content.replace(pattern, replacement)

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js', 'w') as f:
    f.write(content)

print("Fixed ws.test.js")

# Fix rpc.test.js
print("\nFixing rpc.test.js...")
with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js', 'r') as f:
    lines = f.readlines()

for i in range(len(lines)):
    # Find line with { reason: 'Method not found' } that's missing  property
    if "{ reason: 'Method not found' }" in lines[i] and '' not in lines[i]:
        lines[i] = lines[i].replace("{ reason: 'Method not found' }", " { reason: 'Method not found' }")
        print(f"Fixed line {i+1}")
        break

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js', 'w') as f:
    f.writelines(lines)

print("Fixed rpc.test.js")
print("\nAll parse errors fixed!")

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js', 'r') as f:
    lines = f.readlines()

for i in range(len(lines)):
    # Find line with { reason: 'Method not found' } that's missing  property
    if "{ reason: 'Method not found' }" in lines[i] and '' not in lines[i]:
        # Replace the entire object
        lines[i] = lines[i].replace("{ reason: 'Method not found' }", " { reason: 'Method not found' }")
        print(f"Fixed line {i+1}")
        break

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/rpc.test.js', 'w') as f:
    f.writelines(lines)
print("Fixed rpc.test.js")

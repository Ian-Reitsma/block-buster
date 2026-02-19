#!/usr/bin/env python3

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/integration.test.js', 'r') as f:
    lines = f.readlines()

# Find the line with "});" that closes the main describe block
# Then remove everything after that except blank lines
final_closing_idx = -1
for i in range(len(lines) - 1, -1, -1):
    if lines[i].strip() == '});' and i > 400:  # Looking for the final closing
        # Check if this looks like the end of the file structure
        # by checking if there's a describe/it before it
        found_describe_end = False
        for j in range(i-5, max(i-20, 0), -1):
            if '  });' in lines[j] or 'describe(' in lines[j-10:j]:
                found_describe_end = True
                break
        if found_describe_end:
            final_closing_idx = i
            break

if final_closing_idx > 0:
    # Keep everything up to and including this line
    lines = lines[:final_closing_idx + 1]
    print(f"Removed orphaned content after line {final_closing_idx + 1}")
else:
    print("Could not find final closing")

with open('/Users/ianreitsma/projects/the-block/block-buster/web/tests/integration.test.js', 'w') as f:
    f.writelines(lines)

print(f"Integration file now has {len(lines)} lines")

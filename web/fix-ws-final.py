#!/usr/bin/env python3

file_path = 'src/ws.js'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Line 127 (index 126) needs to be fixed
if len(lines) > 126:
    old_line = lines[126]
    if 'event.data,' in old_line and '' not in old_line:
        lines[126] = '         event.data,\n'
        print(f'Fixed line 127')
        print(f'  Old: {old_line.strip()}')
        print(f'  New: {lines[126].strip()}')
    else:
        print(f'Line 127 looks fine: {old_line.strip()}')
else:
    print(f'File has only {len(lines)} lines')

with open(file_path, 'w') as f:
    f.writelines(lines)

print('Done!')

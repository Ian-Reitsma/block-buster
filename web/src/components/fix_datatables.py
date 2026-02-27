import os
import re
import glob

components_dir = '/Users/ianreitsma/projects/the-block/block-buster/web/src/components'
files = glob.glob(os.path.join(components_dir, '*.js'))

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    words = ['jobs', 'receipts', 'files', 'providers', 'campaigns', 'bids', 'disbursements', 'transactions', 'proposals', 'disputes']
    
    new_content = content
    for word in words:
        pattern = re.compile(r'^(\s*)' + word + r',(\s*)$', re.MULTILINE)
        new_content = pattern.sub(r'\1 ' + word + r',\2', new_content)
        
    if content != new_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f'Fixed {os.path.basename(filepath)}')

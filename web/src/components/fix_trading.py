import os

filepath = '/Users/ianreitsma/projects/the-block/block-buster/web/src/components/Trading.js'
with open(filepath, 'r') as f:
    content = f.read()

# Add import
if 'import { Capabilities }' not in content:
    content = content.replace("import { Component } from '../lifecycle.js';", "import { Component } from '../lifecycle.js';\nimport { Capabilities } from '../capabilities.js';")

# Fix render() buttons
content = content.replace(
    "const buyBtn = panel.querySelector('[data-action=\"buy\"]');",
    "const buyBtn = panel.querySelector('[data-action=\"buy\"]');\n    Capabilities.bindButton(buyBtn, 'global', 'settlement');"
)

content = content.replace(
    "const sellBtn = panel.querySelector('[data-action=\"sell\"]');",
    "const sellBtn = panel.querySelector('[data-action=\"sell\"]');\n    Capabilities.bindButton(sellBtn, 'global', 'settlement');"
)

with open(filepath, 'w') as f:
    f.write(content)
print('Fixed Trading.js')

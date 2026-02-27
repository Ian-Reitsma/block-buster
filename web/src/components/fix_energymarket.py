import os

filepath = '/Users/ianreitsma/projects/the-block/block-buster/web/src/components/EnergyMarket.js'
with open(filepath, 'r') as f:
    content = f.read()

# Add import
if 'import { Capabilities }' not in content:
    content = content.replace("import perf from '../perf.js';", "import perf from '../perf.js';\nimport { Capabilities } from '../capabilities.js';")

# Fix render() buttons
content = content.replace(
    "const registerBtn = $('#register-provider-btn');\n    if (registerBtn) {\n      this.listen(registerBtn, 'click', () => this.showRegisterProviderModal());\n    }",
    "const registerBtn = $('#register-provider-btn');\n    if (registerBtn) {\n      Capabilities.bindButton(registerBtn, 'energy', 'mutation');\n      this.listen(registerBtn, 'click', () => this.showRegisterProviderModal());\n    }"
)

content = content.replace(
    "const readingBtn = $('#submit-reading-btn');\n    if (readingBtn) {\n      this.listen(readingBtn, 'click', () => this.showSubmitReadingModal());\n    }",
    "const readingBtn = $('#submit-reading-btn');\n    if (readingBtn) {\n      Capabilities.bindButton(readingBtn, 'energy', 'mutation');\n      this.listen(readingBtn, 'click', () => this.showSubmitReadingModal());\n    }"
)

# Fix modal submits
content = content.replace(
    "const submitBtn = $('#submit-register');\n      if (submitBtn) {\n        submitBtn.addEventListener('click', async () => {",
    "const submitBtn = $('#submit-register');\n      if (submitBtn) {\n        Capabilities.bindButton(submitBtn, 'energy', 'mutation');\n        submitBtn.addEventListener('click', async () => {"
)

content = content.replace(
    "const submitBtn = $('#submit-reading');\n      if (submitBtn) {\n        submitBtn.addEventListener('click', async () => {",
    "const submitBtn = $('#submit-reading');\n      if (submitBtn) {\n        Capabilities.bindButton(submitBtn, 'energy', 'mutation');\n        submitBtn.addEventListener('click', async () => {"
)

with open(filepath, 'w') as f:
    f.write(content)
print('Fixed EnergyMarket.js')

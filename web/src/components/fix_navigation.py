import os

filepath = '/Users/ianreitsma/projects/the-block/block-buster/web/src/components/Navigation.js'
with open(filepath, 'r') as f:
    content = f.read()

# Add capabilities import and appState import if not exists (appState is imported)
if 'import { Capabilities }' not in content:
    content = content.replace("import { Component } from '../lifecycle.js';", "import { Component } from '../lifecycle.js';\nimport { Capabilities } from '../capabilities.js';")

# Hook into rpcCompat state changes
if "this.subscribe(appState, 'rpcCompat'" not in content:
    content = content.replace("// Listen for hash changes directly (backup)", 
    "// Subscribe to RPC compat changes to re-render nav links\n    this.subscribe(appState, 'rpcCompat', () => {\n      requestAnimationFrame(() => this.render());\n    });\n\n    // Listen for hash changes directly (backup)")

# Modify render to check for RPC compat before rendering a nav item.
# We will just disable the link visually and add a tooltip if the market is missing.
render_old = """      const link = document.createElement('a');
      link.href = `#${route.path}`;
      link.textContent = route.label;
      link.dataset.route = route.path;

      // Add click handler for state update
      this.listen(link, 'click', (e) => {
        e.preventDefault();
        window.location.hash = route.path;
        appState.set('route', route.path);
      });"""

render_new = """      const link = document.createElement('a');
      link.href = `#${route.path}`;
      link.textContent = route.label;
      link.dataset.route = route.path;

      // Check if the route is a market that might be missing RPC methods
      let marketMap = {
        'energy': 'energy',
        'compute': 'compute',
        'storage': 'storage',
        'ads': 'ad'
      };
      
      let isMissing = false;
      let reason = '';
      if (marketMap[route.path]) {
        const check = Capabilities.canPerformAction(marketMap[route.path], 'mutation');
        if (check.reason && check.reason.includes('Node RPC missing required method')) {
           isMissing = true;
           reason = check.reason;
        }
      }

      if (isMissing) {
        link.classList.add('disabled-nav-link');
        link.title = reason;
        link.style.opacity = '0.4';
        link.style.cursor = 'not-allowed';
        link.style.pointerEvents = 'none'; // Prevent clicking natively
      }

      // Add click handler for state update
      this.listen(link, 'click', (e) => {
        e.preventDefault();
        if (isMissing) return; // double protection
        window.location.hash = route.path;
        appState.set('route', route.path);
      });"""

content = content.replace(render_old, render_new)

with open(filepath, 'w') as f:
    f.write(content)
print('Fixed Navigation.js')

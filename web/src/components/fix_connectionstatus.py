import os

filepath = '/Users/ianreitsma/projects/the-block/block-buster/web/src/components/ConnectionStatus.js'
with open(filepath, 'r') as f:
    content = f.read()

# Add subscribe to rpcCompat
if "this.subscribe(appState, 'rpcCompat'" not in content:
    content = content.replace("this.subscribe(appState, 'ws', () => this.updateFromState());", 
    "this.subscribe(appState, 'ws', () => this.updateFromState());\n    this.subscribe(appState, 'rpcCompat', () => this.updateFromState());")

# Modify updateFromState to add missing method info to the label if LIVE
old_live = """    if (mode === 'LIVE') {
      this.status = 'connected';
      this.label = wsState?.connected ? 'Live (node + WS)' : 'Live (node)';
      this.render();
      return;
    }"""

new_live = """    if (mode === 'LIVE') {
      this.status = 'connected';
      this.label = wsState?.connected ? 'Live (node + WS)' : 'Live (node)';
      
      const rpcCompat = appState.get('rpcCompat') || {};
      const probe = rpcCompat.probe || {};
      const missingCount = Object.values(probe).filter(r => r.ok === false).length;
      if (missingCount > 0) {
        this.label += ` (Missing ${missingCount} RPC methods)`;
        this.status = 'degraded'; // Add a CSS class for warning state if desired
      }
      
      this.render();
      return;
    }"""

content = content.replace(old_live, new_live)

with open(filepath, 'w') as f:
    f.write(content)
print('Fixed ConnectionStatus.js')

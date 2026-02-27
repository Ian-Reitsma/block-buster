import os

filepath = '/Users/ianreitsma/projects/the-block/block-buster/web/src/styles/styles.css'
with open(filepath, 'r') as f:
    content = f.read()

if '.connection-status.degraded' not in content:
    # Find .connection-status.disconnected to insert after
    old_css = """
.connection-status.disconnected .connection-status-dot {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}"""

    new_css = """
.connection-status.disconnected .connection-status-dot {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

.connection-status.degraded .connection-status-dot {
  background: var(--warn);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}"""
    
    content = content.replace(old_css, new_css)
    with open(filepath, 'w') as f:
        f.write(content)
    print('Fixed CSS')

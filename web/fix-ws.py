#!/usr/bin/env python3
import re

file_path = 'src/ws.js'

with open(file_path, 'r') as f:
    content = f.read()

# Fix the syntax error on line 127
content = content.replace(
    '''      errorBoundary.catch(error, {
        component: 'WebSocket',
        action: 'handleMessage',
         event.data,
      });''',
    '''      errorBoundary.catch(error, {
        component: 'WebSocket',
        action: 'handleMessage',
         event.data,
      });'''
)

with open(file_path, 'w') as f:
    f.write(content)

print('Fixed ws.js syntax error')

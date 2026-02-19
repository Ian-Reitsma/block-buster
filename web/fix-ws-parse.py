#!/usr/bin/env python3
import re

file_path = '/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js'

with open(file_path, 'r') as f:
    content = f.read()

# Fix line 47: add  before typeof
content = content.replace(
    '        typeof data === \'string\' ? data : JSON.stringify(data),',
    '         typeof data === \'string\' ? data : JSON.stringify(data),'
)

# Fix message objects - add  property before standalone identifiers
fixes = [
    ('       blockData,', '         blockData,'),
    ('       metricsData,', '         metricsData,'),
    ('       networkData,', '         networkData,'),
    ('       tradingData,', '         tradingData,'),
    ('       {},', '         {},'),
    ('        { test: \'data\' }', '         { test: \'data\' }'),
]

for old, new in fixes:
    content = content.replace(old, new)

# Fix malformed object
content = content.replace(
    '{ type: "test",  "hello" }',
    '{ type: "test",  "hello" }'
)

with open(file_path, 'w') as f:
    f.write(content)

print("Fixed ws.test.js parse errors")

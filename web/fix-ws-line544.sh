#!/bin/bash
sed -i '' "544s/{ test: 'data' } expect/{ test: 'data' }, expect/" /Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js
echo "Fixed line 544"

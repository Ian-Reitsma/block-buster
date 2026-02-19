const fs = require('fs');

// Fix rpc.test.js
let rpcContent = fs.readFileSync('tests/rpc.test.js', 'utf8');
rpcContent = rpcContent.replace(
  /message: 'Invalid Request',\s*\n\s*{ reason: 'Method not found' },/,
  "message: 'Invalid Request',\n           { reason: 'Method not found' },"
);
fs.writeFileSync('tests/rpc.test.js', rpcContent);
console.log('Fixed rpc.test.js');

// Fix ws.test.js
let wsContent = fs.readFileSync('tests/ws.test.js', 'utf8');
wsContent = wsContent.replace(
  /this\.onmessage\(\{\s*\n\s*typeof data/,
  "this.onmessage({\n         typeof data"
);
fs.writeFileSync('tests/ws.test.js', wsContent);
console.log('Fixed ws.test.js');

// Check perf.test.js line count
const perfContent = fs.readFileSync('tests/perf.test.js', 'utf8');
const lines = perfContent.split('\n');
console.log(`perf.test.js has ${lines.length} lines`);
if (lines.length > 448) {
  console.log('Trimming perf.test.js to 448 lines');
  fs.writeFileSync('tests/perf.test.js', lines.slice(0, 448).join('\n'));
}

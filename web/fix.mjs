import { readFileSync, writeFileSync } from 'fs';

// Fix rpc.test.js
let rpcContent = readFileSync('./tests/rpc.test.js', 'utf8');
const lines = rpcContent.split('\n');

// Find and fix line 94 (index 93)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("{ reason: 'Method not found' }") && lines[i].trim().startsWith('{')) {
    lines[i] = '           { reason: \'Method not found\' },';
    console.log(`Fixed rpc.test.js line ${i+1}`);
    break;
  }
}

writeFileSync('./tests/rpc.test.js', lines.join('\n'));

// Fix ws.test.js
let wsContent = readFileSync('./tests/ws.test.js', 'utf8');
const wsLines = wsContent.split('\n');

// Find and fix line 47 (index 46)
for (let i = 0; i < wsLines.length; i++) {
  if (wsLines[i].includes('typeof data === \'string\'') && wsLines[i].trim().startsWith('typeof')) {
    wsLines[i] = '         typeof data === \'string\' ? data : JSON.stringify(data),';
    console.log(`Fixed ws.test.js line ${i+1}`);
    break;
  }
}

writeFileSync('./tests/ws.test.js', wsLines.join('\n'));

console.log('All fixes applied!');

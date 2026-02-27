const fs = require('fs');
const path = require('path');

const rpcMockPath = path.join(__dirname, 'rpc-mock.js');
let s = fs.readFileSync(rpcMockPath, 'utf8');

const before = s;

// Fix malformed phase-gate batch error object:
//   message: err.message,  { capability_code: ... }
// ->message: err.message,  { capability_code: ... }
// Use regex to tolerate whitespace/newlines.
s = s.replace(
  /message:\s*err\.message\s*,\s*\{\s*capability_code\s*:/g,
  'message: err.message,  { capability_code:'
);

if (s === before) {
  console.error('patch_fix_batch_gate: no changes applied (pattern not found)');
  process.exit(1);
}

fs.writeFileSync(rpcMockPath, s);
console.log('patch_fix_batch_gate: updated rpc-mock.js');

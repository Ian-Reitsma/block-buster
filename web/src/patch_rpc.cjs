const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const rpcJsPath = path.join(srcDir, 'rpc.js');
const rpcMockJsPath = path.join(srcDir, 'rpc-mock.js');
const capRpcJsPath = path.join(srcDir, 'capabilities_rpc.js');

// 1. Update capabilities_rpc.js
let capRpcJs = fs.readFileSync(capRpcJsPath, 'utf8');
if (!capRpcJs.includes('getActionMetadata')) {
  capRpcJs += `

export const MUTATOR_METHODS = {
  // Compute Market
  'compute_market.submit_job': { market: 'compute', type: 'settlement' },
  'compute_market.cancel_job': { market: 'compute', type: 'mutation' },
  // Storage Market
  'storage.store_file': { market: 'storage', type: 'settlement' },
  'storage.remove_file': { market: 'storage', type: 'mutation' },
  // Ad Market
  'ad_market.place_bid': { market: 'ad', type: 'settlement' },
  'ad_market.cancel_bid': { market: 'ad', type: 'mutation' },
  // Energy Market
  'energy.submit_provider': { market: 'energy', type: 'mutation' },
  'energy.update_provider': { market: 'energy', type: 'mutation' },
  // Dex / Global
  'dex.place_order': { market: 'global', type: 'settlement' },
  'dex.cancel_order': { market: 'global', type: 'mutation' },
  // Governance / Treasury
  'governance.submit_proposal': { market: 'global', type: 'settlement' },
  'governance.vote': { market: 'global', type: 'settlement' },
  'treasury.disburse': { market: 'global', type: 'settlement' }
};

export function getActionMetadata(method) {
  return MUTATOR_METHODS[method] || null;
}
`;
  fs.writeFileSync(capRpcJsPath, capRpcJs);
  console.log('capabilities_rpc.js updated successfully');
} else {
  console.log('capabilities_rpc.js already has getActionMetadata');
}

// 2. Update rpc.js
let rpcJs = fs.readFileSync(rpcJsPath, 'utf8');

if (!rpcJs.includes('Capabilities.canPerformAction')) {
  rpcJs = rpcJs.replace(
    "import errorBoundary from './errors.js';",
    "import errorBoundary from './errors.js';\nimport { Capabilities } from './capabilities.js';\nimport { getActionMetadata } from './capabilities_rpc.js';"
  );

  rpcJs = rpcJs.replace(
    "  async call(method, params = []) {",
    "  async call(method, params = []) {\n    const meta = getActionMetadata(method);\n    if (meta) {\n      const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);\n      if (!allowed) {\n        const err = new Error(`Action blocked by network phase: ${reason}`);\n        err.code = code;\n        err.isPhaseGate = true;\n        throw err;\n      }\n    }"
  );

  const batchOrig = `  async batch(calls) {
    const payload = calls.map((call) => ({
      jsonrpc: '2.0',
      method: call.method,
      params: call.params || [],
      id: this.requestId++,
    }));

    try {
      const responses = await this.apiClient.post('/rpc', payload);

      // Check each response for errors
      return responses.map((response, index) => {
        if (response.error) {
          const error = new Error(response.error.message || 'RPC Error');
          error.code = response.error.code;
          error.data = response.error.data;
          error.method = calls[index].method;
          return { error };
        }
        return { result: response.result };
      });`;

  const batchNew = `  async batch(calls) {
    // Pre-validate each call.
    const preValidated = calls.map((call, index) => {
      const meta = getActionMetadata(call.method);
      if (meta) {
        const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);
        if (!allowed) {
          const err = new Error(\`Action blocked by network phase: \${reason}\`);
          err.code = code;
          err.isPhaseGate = true;
          err.method = call.method;
          return { originalIndex: index, call: null, error: err };
        }
      }
      return { originalIndex: index, call, error: null };
    });

    const validCalls = preValidated.filter(v => v.call !== null);
    const payload = validCalls.map((v) => ({
      jsonrpc: '2.0',
      method: v.call.method,
      params: v.call.params || [],
      id: this.requestId++,
    }));

    try {
      let responses = [];
      if (payload.length > 0) {
        responses = await this.apiClient.post('/rpc', payload);
      }

      // Reconstruct the array matching the original 'calls' index
      let responseIndex = 0;
      return preValidated.map((v) => {
        if (v.error) {
          return { error: v.error };
        }
        const response = responses[responseIndex++];
        if (response.error) {
          const error = new Error(response.error.message || 'RPC Error');
          error.code = response.error.code;
          error.data = response.error.data;
          error.method = v.call.method;
          return { error };
        }
        return { result: response.result };
      });`;

  if (rpcJs.includes("  async batch(calls) {\n    const payload = calls.map((call) => ({")) {
    rpcJs = rpcJs.replace(batchOrig, batchNew);
    console.log('rpc.js batch function patched successfully');
  } else {
    console.log('WARNING: Could not find original RpcClient.batch() in rpc.js');
  }

  fs.writeFileSync(rpcJsPath, rpcJs);
  console.log('rpc.js updated successfully');
} else {
  console.log('rpc.js already patched');
}

// 3. Update rpc-mock.js
let rpcMockJs = fs.readFileSync(rpcMockJsPath, 'utf8');

if (!rpcMockJs.includes('Capabilities.canPerformAction')) {
  rpcMockJs = rpcMockJs.replace(
    "import mockDataManager from './mock-data-manager.js';",
    "import mockDataManager from './mock-data-manager.js';\nimport { Capabilities } from './capabilities.js';\nimport { getActionMetadata } from './capabilities_rpc.js';"
  );

  rpcMockJs = rpcMockJs.replace(
    "  async call(method, params = []) {",
    "  async call(method, params = []) {\n    const meta = getActionMetadata(method);\n    if (meta) {\n      const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);\n      if (!allowed) {\n        const err = new Error(`Action blocked by network phase: ${reason}`);\n        err.code = code;\n        err.isPhaseGate = true;\n        throw err;\n      }\n    }"
  );

  const mockBatchOrig = `  async batch(calls) {
    await this.delay();
    
    return calls.map((call) => {
      try {
        const result = this.routeMethod(call.method, call.params || []);
        return { result };
      } catch (error) {
        return {
          error: {
            code: -32600,
            message: error.message,
          },
        };
      }
    });`;

  const mockBatchNew = `  async batch(calls) {
    await this.delay();
    
    return calls.map((call) => {
      const meta = getActionMetadata(call.method);
      if (meta) {
        const { allowed, reason, code } = Capabilities.canPerformAction(meta.market, meta.type);
        if (!allowed) {
          const err = new Error(\`Action blocked by network phase: \${reason}\`);
          err.code = code;
          err.isPhaseGate = true;
          return { error: { code: err.code, message: err.message, isPhaseGate: true, method: call.method } };
        }
      }
      try {
        const result = this.routeMethod(call.method, call.params || []);
        return { result };
      } catch (error) {
        return {
          error: {
            code: -32600,
            message: error.message,
          },
        };
      }
    });`;

  if (rpcMockJs.includes("  async batch(calls) {\n    await this.delay();\n    \n    return calls.map((call) => {")) {
    rpcMockJs = rpcMockJs.replace(mockBatchOrig, mockBatchNew);
    console.log('rpc-mock.js batch function patched successfully');
  } else {
    console.log('WARNING: Could not find original MockRpcClient.batch() in rpc-mock.js');
  }

  fs.writeFileSync(rpcMockJsPath, rpcMockJs);
  console.log('rpc-mock.js updated successfully');
} else {
  console.log('rpc-mock.js already patched');
}

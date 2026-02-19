#!/usr/bin/env node
// Architecture validation script - verifies all modules are correctly structured
// Run with: node validate-architecture.js

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

function log(emoji, message, type = 'info') {
  console.log(`${emoji} ${message}`);
  if (type === 'pass') checks.passed++;
  if (type === 'fail') checks.failed++;
  if (type === 'warn') checks.warnings++;
}

function checkFileExists(filepath, name) {
  const fullPath = join(srcDir, filepath);
  if (existsSync(fullPath)) {
    log('✅', `${name} exists`, 'pass');
    return true;
  } else {
    log('❌', `${name} missing at ${filepath}`, 'fail');
    return false;
  }
}

function checkExports(filepath, name, expectedExports) {
  const fullPath = join(srcDir, filepath);
  if (!existsSync(fullPath)) return;

  const content = readFileSync(fullPath, 'utf-8');

  expectedExports.forEach((exp) => {
    const patterns = [
      `export default ${exp}`,
      `export { ${exp} }`,
      `export const ${exp}`,
      `export function ${exp}`,
      `export class ${exp}`,
    ];

    const found = patterns.some((pattern) => content.includes(pattern));

    if (found) {
      log('✅', `  - exports ${exp}`, 'pass');
    } else {
      log('⚠️', `  - missing export: ${exp}`, 'warn');
    }
  });
}

function checkImports(filepath, name, expectedImports) {
  const fullPath = join(srcDir, filepath);
  if (!existsSync(fullPath)) return;

  const content = readFileSync(fullPath, 'utf-8');

  expectedImports.forEach(({ module, exports }) => {
    const importPattern = `from './${module}.js'`;
    const hasImport = content.includes(importPattern) || content.includes(`from './${module}'`);

    if (hasImport) {
      log('✅', `  - imports from ${module}`, 'pass');
    } else {
      log('⚠️', `  - missing import from ${module}`, 'warn');
    }
  });
}

function checkClass(filepath, name, className, methods) {
  const fullPath = join(srcDir, filepath);
  if (!existsSync(fullPath)) return;

  const content = readFileSync(fullPath, 'utf-8');

  if (content.includes(`class ${className}`)) {
    log('✅', `  - defines class ${className}`, 'pass');

    methods.forEach((method) => {
      if (content.includes(`${method}(`)) {
        log('✅', `    - has method ${method}()`, 'pass');
      } else {
        log('⚠️', `    - missing method: ${method}()`, 'warn');
      }
    });
  } else {
    log('❌', `  - missing class ${className}`, 'fail');
  }
}

console.log('\n🔍 Validating Block Buster Architecture\n');

// Core modules
console.log('\n📦 Core Modules');
checkFileExists('state.js', 'State management');
checkExports('state.js', 'state.js', ['appState']);
checkClass('state.js', 'state.js', 'AppState', ['set', 'get', 'subscribe', 'notify']);

checkFileExists('bind.js', 'Data binding');
checkExports('bind.js', 'bind.js', ['bind', 'bindTwoWay', 'format']);

checkFileExists('lifecycle.js', 'Lifecycle management');
checkExports('lifecycle.js', 'lifecycle.js', ['Component']);
checkClass('lifecycle.js', 'lifecycle.js', 'Component', [
  'mount',
  'unmount',
  'interval',
  'timeout',
  'listen',
  'subscribe',
]);

checkFileExists('errors.js', 'Error boundary');
checkExports('errors.js', 'errors.js', ['errorBoundary']);
checkClass('errors.js', 'errors.js', 'ErrorBoundary', [
  'catch',
  'onError',
  'getRecentErrors',
]);

checkFileExists('features.js', 'Feature flags');
checkExports('features.js', 'features.js', ['features']);
checkClass('features.js', 'features.js', 'FeatureFlags', [
  'isEnabled',
  'enable',
  'disable',
]);

checkFileExists('api.js', 'API client');
checkExports('api.js', 'api.js', ['ApiClient']);
checkClass('api.js', 'api.js', 'ApiClient', ['get', 'post', 'put', 'delete', 'request']);

checkFileExists('perf.js', 'Performance monitoring');
checkExports('perf.js', 'perf.js', ['perf']);
checkClass('perf.js', 'perf.js', 'PerformanceMonitor', [
  'mark',
  'measure',
  'getStats',
  'getWebVitals',
]);

checkFileExists('router.js', 'Router');
checkExports('router.js', 'router.js', ['Router']);
checkClass('router.js', 'router.js', 'Router', [
  'register',
  'navigate',
  'handleRoute',
]);

checkFileExists('utils.js', 'Utilities');
checkExports('utils.js', 'utils.js', ['$', '$$', 'debounce', 'throttle', 'fmt']);

// Components
console.log('\n🧩 Components');
checkFileExists('components/Navigation.js', 'Navigation component');
checkClass('components/Navigation.js', 'Navigation', 'Navigation', [
  'onMount',
  'render',
  'updateActiveState',
]);

checkFileExists('components/TheBlock.js', 'TheBlock component');
checkClass('components/TheBlock.js', 'TheBlock', 'TheBlock', [
  'onMount',
  'render',
  'fetchMetrics',
]);
checkImports('components/TheBlock.js', 'TheBlock', [
  { module: 'lifecycle', exports: ['Component'] },
  { module: 'state', exports: ['appState'] },
  { module: 'bind', exports: ['bind'] },
]);

checkFileExists('components/Trading.js', 'Trading component');
checkClass('components/Trading.js', 'Trading', 'Trading', [
  'onMount',
  'render',
  'handleAction',
]);

checkFileExists('components/Network.js', 'Network component');
checkClass('components/Network.js', 'Network', 'Network', [
  'onMount',
  'render',
  'fetchNetworkData',
  'runFullCheck',
]);

// Main entry point
console.log('\n🚀 Application Entry');
checkFileExists('main.js', 'Main entry point');
checkImports('main.js', 'main.js', [
  { module: 'state', exports: ['appState'] },
  { module: 'api', exports: ['ApiClient'] },
  { module: 'router', exports: ['Router'] },
  { module: 'components/Navigation', exports: ['Navigation'] },
  { module: 'components/TheBlock', exports: ['TheBlock'] },
  { module: 'components/Trading', exports: ['Trading'] },
  { module: 'components/Network', exports: ['Network'] },
]);

// HTML & CSS
console.log('\n🎨 Presentation Layer');
checkFileExists('../index.html', 'index.html');
checkFileExists('styles.css', 'styles.css');

const indexPath = join(__dirname, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf-8');

  if (html.includes('id="nav"')) {
    log('✅', '  - has #nav container', 'pass');
  } else {
    log('❌', '  - missing #nav container', 'fail');
  }

  if (html.includes('id="app"')) {
    log('✅', '  - has #app container', 'pass');
  } else {
    log('❌', '  - missing #app container', 'fail');
  }

  if (html.includes('type="module"')) {
    log('✅', '  - uses ES modules', 'pass');
  } else {
    log('❌', '  - not using ES modules', 'fail');
  }

  if (html.includes('src="./src/main.js"')) {
    log('✅', '  - loads main.js', 'pass');
  } else {
    log('⚠️', '  - main.js path may be incorrect', 'warn');
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Validation Summary\n');
console.log(`✅ Passed: ${checks.passed}`);
console.log(`⚠️  Warnings: ${checks.warnings}`);
console.log(`❌ Failed: ${checks.failed}`);

if (checks.failed > 0) {
  console.log('\n❌ Architecture validation FAILED');
  process.exit(1);
} else if (checks.warnings > 0) {
  console.log('\n⚠️  Architecture validation PASSED with warnings');
  process.exit(0);
} else {
  console.log('\n✅ Architecture validation PASSED');
  process.exit(0);
}

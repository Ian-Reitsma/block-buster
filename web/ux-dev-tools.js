#!/usr/bin/env node
/**
 * UX Development Tools
 * CLI utilities for working with the design system
 * 
 * Usage:
 *   node ux-dev-tools.js generate-component MyComponent
 *   node ux-dev-tools.js validate-patterns
 *   node ux-dev-tools.js check-colors
 *   node ux-dev-tools.js component-stats
 */

const fs = require('fs');
const path = require('path');

const COMMANDS = {
  'generate-component': generateComponent,
  'validate-patterns': validatePatterns,
  'check-colors': checkColorContrast,
  'component-stats': componentStats,
  'help': showHelp,
};

// Main entry point
function main() {
  const [,, command, ...args] = process.argv;
  
  if (!command || command === 'help') {
    showHelp();
    return;
  }
  
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`❌ Unknown command: ${command}`);
    console.log('Run "node ux-dev-tools.js help" for available commands.');
    process.exit(1);
  }
  
  handler(...args);
}

// Generate a new component with UX best practices
function generateComponent(name) {
  if (!name) {
    console.error('❌ Component name required');
    console.log('Usage: node ux-dev-tools.js generate-component MyComponent');
    process.exit(1);
  }
  
  const template = `// ${name} component
// Description: [Add component description]

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { fmt, $ } from '../utils.js';
import perf from '../perf.js';

class ${name} extends Component {
  constructor(rpc) {
    super('${name}');
    this.rpc = rpc;
    this.container = null;
  }

  onMount() {
    this.container = $('#app');
    this.render();

    // Subscribe to state updates
    this.subscribe(appState, 'dataKey', (data) => {
      requestAnimationFrame(() => this.updateView(data));
    });

    // Initial data fetch
    this.fetchData();
  }

  async fetchData() {
    try {
      const data = await perf.time(
        'fetch${name}Data',
        () => this.rpc.getData(),
        'fetch',
      );
      
      appState.set('dataKey', data);
    } catch (error) {
      console.error('[${name}] Failed to fetch ', error);
      appState.set('offline', true);
    }
  }

  render() {
    if (!this.container) return;

    perf.mark('render-${name.toLowerCase()}-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Hero section
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = \`
      <h2>${name}</h2>
      <p>Component description goes here</p>
    \`;
    content.appendChild(hero);

    // Hero metrics (4-column)
    const heroMetrics = document.createElement('section');
    heroMetrics.className = 'metrics-hero-grid';
    heroMetrics.id = 'hero-metrics';
    heroMetrics.innerHTML = \`
      <div class="card-metric-hero">
        <h3>Metric 1</h3>
        <div class="value" data-bind="metric1" data-format="number">—</div>
        <div class="label">Description</div>
      </div>
      <!-- Add more hero cards -->
    \`;
    content.appendChild(heroMetrics);

    // Primary metrics (3-column)
    const primaryMetrics = document.createElement('section');
    primaryMetrics.className = 'metrics-primary-grid';
    primaryMetrics.id = 'primary-metrics';
    // Add primary metric cards
    content.appendChild(primaryMetrics);

    this.container.innerHTML = '';
    this.container.appendChild(content);

    perf.measure('render-${name.toLowerCase()}', 'render-${name.toLowerCase()}-start', 'render');
  }

  updateView(data) {
    const heroMetrics = $('#hero-metrics');
    if (heroMetrics) {
      bind(heroMetrics, data);
    }
  }

  onUnmount() {
    console.log('[${name}] Cleanup complete');
  }
}

export default ${name};
`;

  const filePath = path.join(__dirname, 'src', 'components', `${name}.js`);
  
  if (fs.existsSync(filePath)) {
    console.error(`❌ Component already exists: ${filePath}`);
    process.exit(1);
  }
  
  fs.writeFileSync(filePath, template);
  console.log(`✅ Generated component: ${filePath}`);
  console.log('\nNext steps:');
  console.log('1. Update the component description and logic');
  console.log('2. Add the route in src/router.js');
  console.log('3. Create tests in tests/${name}.test.js');
}

// Validate that components follow UX patterns
function validatePatterns() {
  console.log('🔍 Validating UX patterns in components...\n');
  
  const componentsDir = path.join(__dirname, 'src', 'components');
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.js'));
  
  let issues = 0;
  
  files.forEach(file => {
    const filePath = path.join(componentsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const componentName = path.basename(file, '.js');
    
    console.log(`Checking ${componentName}...`);
    
    // Check for grid usage
    if (content.includes('className = "grid"') && !content.includes('grid-template-columns')) {
      console.log(`  ⚠️  Uses generic .grid class - consider using specific layout class`);
      issues++;
    }
    
    // Check for proper card tiers
    if (content.includes('.card') && !content.match(/card-metric-(hero|primary|compact)/)) {
      console.log(`  ⚠️  Uses generic .card - consider using card-metric-* classes`);
      issues++;
    }
    
    // Check for requestAnimationFrame usage
    if (content.includes('this.subscribe') && !content.includes('requestAnimationFrame')) {
      console.log(`  ⚠️  State subscription without requestAnimationFrame`);
      issues++;
    }
    
    // Check for data binding
    if (content.includes('data-bind') && !content.includes('bind(')) {
      console.log(`  ⚠️  Has data-bind attributes but doesn't call bind()`);
      issues++;
    }
    
    // Check for perf monitoring
    if (!content.includes('perf.mark') || !content.includes('perf.measure')) {
      console.log(`  ⚠️  Missing performance monitoring`);
      issues++;
    }
  });
  
  console.log(`\n${issues === 0 ? '✅' : '⚠️'}  Found ${issues} potential issues`);
  
  if (issues === 0) {
    console.log('All components follow UX patterns!');
  } else {
    console.log('\nReview the issues above and update components to follow design system patterns.');
  }
}

// Check color contrast ratios
function checkColorContrast() {
  console.log('🎨 Checking color contrast ratios...\n');
  
  const colors = {
    '--text': '#e9f1ff',
    '--muted': '#8aa2c2',
    '--accent': '#1ac6a2',
    '--bg': '#0b1220',
    '--panel': '#121b2e',
    '--border': '#1f2c44',
  };
  
  const combinations = [
    { fg: '--text', bg: '--bg', min: 4.5 },
    { fg: '--text', bg: '--panel', min: 4.5 },
    { fg: '--muted', bg: '--panel', min: 4.5 },
    { fg: '--accent', bg: '--panel', min: 3.0 }, // Large text
  ];
  
  combinations.forEach(({ fg, bg, min }) => {
    const fgColor = colors[fg];
    const bgColor = colors[bg];
    const ratio = calculateContrastRatio(fgColor, bgColor);
    const passes = ratio >= min;
    
    console.log(`${passes ? '✅' : '❌'} ${fg} on ${bg}: ${ratio.toFixed(2)}:1 (min: ${min}:1)`);
  });
}

function calculateContrastRatio(fg, bg) {
  const fgLuminance = getRelativeLuminance(fg);
  const bgLuminance = getRelativeLuminance(bg);
  
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  const [r, g, b] = rgb.map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ] : [0, 0, 0];
}

// Show component statistics
function componentStats() {
  console.log('📊 Component Statistics\n');
  
  const componentsDir = path.join(__dirname, 'src', 'components');
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.js'));
  
  const stats = {
    total: files.length,
    heroGrids: 0,
    primaryGrids: 0,
    compactGrids: 0,
    tradingLayouts: 0,
    sidebarLayouts: 0,
    splitLayouts: 0,
    withPerf: 0,
    withTests: 0,
    avgLines: 0,
  };
  
  let totalLines = 0;
  
  files.forEach(file => {
    const filePath = path.join(componentsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    totalLines += lines;
    
    if (content.includes('metrics-hero-grid')) stats.heroGrids++;
    if (content.includes('metrics-primary-grid')) stats.primaryGrids++;
    if (content.includes('metrics-compact-grid')) stats.compactGrids++;
    if (content.includes('layout-trading')) stats.tradingLayouts++;
    if (content.includes('layout-sidebar')) stats.sidebarLayouts++;
    if (content.includes('layout-split')) stats.splitLayouts++;
    if (content.includes('perf.')) stats.withPerf++;
    
    // Check for test file
    const testFile = path.join(__dirname, 'tests', file.replace('.js', '.test.js'));
    if (fs.existsSync(testFile)) stats.withTests++;
  });
  
  stats.avgLines = Math.round(totalLines / stats.total);
  
  console.log(`Total Components: ${stats.total}`);
  console.log(`Average Lines: ${stats.avgLines}`);
  console.log('');
  console.log('Layout Usage:');
  console.log(`  Hero Grids: ${stats.heroGrids}`);
  console.log(`  Primary Grids: ${stats.primaryGrids}`);
  console.log(`  Compact Grids: ${stats.compactGrids}`);
  console.log(`  Trading Layouts: ${stats.tradingLayouts}`);
  console.log(`  Sidebar Layouts: ${stats.sidebarLayouts}`);
  console.log(`  Split Layouts: ${stats.splitLayouts}`);
  console.log('');
  console.log('Quality Metrics:');
  console.log(`  With Performance Monitoring: ${stats.withPerf}/${stats.total} (${Math.round(stats.withPerf / stats.total * 100)}%)`);
  console.log(`  With Tests: ${stats.withTests}/${stats.total} (${Math.round(stats.withTests / stats.total * 100)}%)`);
}

function showHelp() {
  console.log(`
🎨 Block-Buster UX Development Tools

Usage: node ux-dev-tools.js <command> [args]

Commands:
  generate-component <name>  Generate a new component with UX best practices
  validate-patterns          Check components follow design system patterns
  check-colors               Validate color contrast ratios (WCAG)
  component-stats            Show statistics about component usage
  help                       Show this help message

Examples:
  node ux-dev-tools.js generate-component Analytics
  node ux-dev-tools.js validate-patterns
  node ux-dev-tools.js check-colors
  node ux-dev-tools.js component-stats

For more information, see UX_TRANSFORMATION_GUIDE.md
  `);
}

if (require.main === module) {
  main();
}

module.exports = {
  generateComponent,
  validatePatterns,
  checkColorContrast,
  componentStats,
};

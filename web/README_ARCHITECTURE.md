# Block Buster Architecture Guide

**A first-party, zero-dependency SPA built with 1% dev mentality**

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture Principles](#architecture-principles)
- [Module Reference](#module-reference)
- [Component Guide](#component-guide)
- [State Management](#state-management)
- [Performance](#performance)
- [Testing Strategy](#testing-strategy)
- [Development Workflow](#development-workflow)

---

## Overview

Block Buster is a real-time monitoring and trading dashboard for The Block L1 blockchain. The architecture is built on four core principles:

1. **Observable State** - Single source of truth with event-driven updates
2. **Lifecycle Management** - Automatic cleanup prevents memory leaks
3. **Declarative UI** - Data binding replaces imperative DOM manipulation
4. **Zero Dependencies** - First-party code, no framework bloat

### Tech Stack

- **Runtime**: Vanilla JavaScript (ES2022+)
- **Modules**: Native ES modules
- **Build**: Vite (dev server + production build)
- **Styling**: Pure CSS with CSS variables
- **Testing**: Vitest (planned)

### Bundle Size

- **Total JS**: ~15KB minified + gzipped
- **Total CSS**: ~8KB minified + gzipped
- **No third-party dependencies**

---

## Quick Start

```bash
# Install dependencies
npm install

# Validate architecture
npm run validate

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Project Structure

```
web/
├── src/
│   ├── components/         # Page components
│   │   ├── Navigation.js   # Navigation bar
│   │   ├── TheBlock.js     # Dashboard view
│   │   ├── Trading.js      # Trading sandbox
│   │   └── Network.js      # Network health
│   ├── state.js            # Observable state
│   ├── bind.js             # Data binding
│   ├── lifecycle.js        # Component lifecycle
│   ├── errors.js           # Error boundary
│   ├── features.js         # Feature flags
│   ├── api.js              # API client
│   ├── perf.js             # Performance monitoring
│   ├── router.js           # SPA router
│   ├── utils.js            # Utilities
│   ├── main.js             # Application entry
│   └── styles.css          # Global styles
├── index.html             # HTML shell
├── package.json
├── vite.config.js
└── validate-architecture.js
```

---

## Architecture Principles

### 1. Observable State

**Problem**: Multiple components fetching the same data, causing duplicate requests and desync.

**Solution**: Centralized state store with subscriptions.

```javascript
import appState from './state.js';

// Set state (notifies all subscribers)
appState.set('metrics', { tps: 1280, peers: 312 });

// Subscribe to changes
const unsubscribe = appState.subscribe('metrics', (newValue, oldValue) => {
  console.log('Metrics updated:', newValue);
  updateUI(newValue);
});

// Cleanup
unsubscribe();
```

### 2. Lifecycle Management

**Problem**: Event listeners, intervals, and timeouts not cleaned up on navigation.

**Solution**: Component base class with automatic cleanup.

```javascript
import { Component } from './lifecycle.js';

class MyComponent extends Component {
  constructor() {
    super('MyComponent');
  }

  onMount() {
    // Auto-cleanup interval
    this.interval(() => this.poll(), 2000);
    
    // Auto-cleanup listener
    this.listen(window, 'resize', () => this.handleResize());
    
    // Auto-cleanup subscription
    this.subscribe(appState, 'data', (data) => this.render(data));
  }

  onUnmount() {
    // All cleanup happens automatically
  }
}
```

### 3. Declarative UI

**Problem**: 50+ `getElementById` + `textContent` scattered across codebase.

**Solution**: Data binding with `data-bind` attributes.

```html
<!-- HTML -->
<div id="metrics">
  <div data-bind="tps" data-format="number"></div>
  <div data-bind="fees" data-format="currency"></div>
  <div data-bind="latencyMs" data-format="ms"></div>
</div>
```

```javascript
// JavaScript
import { bind } from './bind.js';

const metrics = { tps: 1280, fees: 0.15, latencyMs: 42 };
const container = document.getElementById('metrics');

bind(container, metrics); // Updates all [data-bind] elements
```

### 4. Zero Dependencies

**Why**: Every dependency is a liability (maintenance, security, bundle size).

**How**: First-party implementations of common patterns:

- State management (no Redux/MobX)
- Router (no React Router)
- HTTP client (no Axios)
- Utilities (no Lodash)

---

## Module Reference

### `state.js` - Observable State

```javascript
import appState from './state.js';

// API
appState.set(key, value)         // Set state and notify
appState.get(key)                // Get current state
appState.subscribe(key, callback) // Subscribe to changes
appState.getHistory(key)         // Get change history
appState.reset()                 // Reset all state
```

**Features**:
- Deep comparison (only notifies on actual changes)
- Change history (last 50 changes)
- Multiple subscribers per key

### `bind.js` - Data Binding

```javascript
import { bind, bindTwoWay, format } from './bind.js';

// One-way binding
bind(element, data);

// Two-way binding (for forms)
bindTwoWay(element, data, 'fieldName', (newValue) => {
  console.log('Field updated:', newValue);
});

// Manual formatting
const formatted = format(1234.56, 'currency'); // "$1,234.56"
```

**Supported formats**:
- `currency` - US dollars
- `percent` - Percentage
- `number` - Localized number
- `ms` - Milliseconds
- `size` - Bytes to KB/MB/GB
- `timestamp` - Time
- `date` - Date
- `datetime` - Date and time

### `lifecycle.js` - Component Lifecycle

```javascript
import { Component } from './lifecycle.js';

class MyComponent extends Component {
  constructor() {
    super('ComponentName');
  }

  onMount() {
    // Called when component mounts
  }

  onUnmount() {
    // Called when component unmounts
    // Cleanup is automatic
  }
}

const component = new MyComponent();
component.mount();   // Start lifecycle
component.unmount(); // Cleanup and stop
```

**Cleanup methods**:
- `this.interval(fn, ms)` - Auto-cleanup setInterval
- `this.timeout(fn, ms)` - Auto-cleanup setTimeout
- `this.listen(target, event, handler)` - Auto-cleanup addEventListener
- `this.subscribe(state, key, handler)` - Auto-cleanup state subscription
- `this.addCleanup(fn)` - Add custom cleanup function

### `errors.js` - Error Boundary

```javascript
import errorBoundary from './errors.js';

// Catch and report error
try {
  riskyOperation();
} catch (error) {
  errorBoundary.catch(error, { component: 'MyComponent', action: 'riskyOp' });
}

// Subscribe to errors
errorBoundary.onError((error) => {
  console.log('Error occurred:', error);
});

// Get recent errors
const recent = errorBoundary.getRecentErrors(10);

// Configure reporting
errorBoundary.setReportEndpoint('/api/errors');
```

**Auto-captured errors**:
- Uncaught exceptions (`window.onerror`)
- Unhandled promise rejections

### `features.js` - Feature Flags

```javascript
import features from './features.js';

// Check if feature is enabled
if (features.isEnabled('websockets')) {
  initWebSocket();
} else {
  initPolling();
}

// Toggle features (persisted to localStorage)
features.enable('websockets');
features.disable('serviceWorker');

// Get all flags
const allFlags = features.getAll();
```

**Built-in detections**:
- `websockets` - WebSocket support
- `serviceWorker` - Service Worker support
- `webp` - WebP image format
- `indexedDB` - IndexedDB support

### `api.js` - API Client

```javascript
import ApiClient from './api.js';

const api = new ApiClient('http://localhost:5000', {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
});

// Make requests
const data = await api.get('/endpoint');
const result = await api.post('/endpoint', { key: 'value' });
await api.put('/endpoint', { key: 'value' });
await api.delete('/endpoint');

// Configure headers
api.setHeader('Authorization', 'Bearer token');
api.removeHeader('Authorization');
```

**Features**:
- Automatic retry with exponential backoff
- Timeout handling with AbortController
- Error boundary integration
- Testable via dependency injection

### `perf.js` - Performance Monitoring

```javascript
import perf from './perf.js';

// Manual mark/measure
perf.mark('start');
// ... do work
perf.measure('my-operation', 'start', 'render');

// Auto-measure async function
const result = await perf.time('fetchData', async () => {
  return await fetch('/data').then(r => r.json());
}, 'fetch');

// Set budget (logs warning if exceeded)
perf.setBudget('render', 16.67); // 60fps
perf.setBudget('fetch', 300);

// Get statistics
const stats = perf.getStats('render');
// { count, avg, min, max, p50, p95, p99 }

// Get web vitals
const vitals = perf.getWebVitals();
// { dns, tcp, ttfb, domLoad, load, fcp, lcp }
```

### `router.js` - SPA Router

```javascript
import Router from './router.js';
import { Component } from './lifecycle.js';

const router = new Router();

// Register routes
router
  .register('home', homeComponent)
  .register('about', aboutComponent)
  .setDefault('home');

// Mount router
router.mount();

// Navigate programmatically
router.navigate('about');

// Get current route
const current = router.getActiveRoute();
```

### `utils.js` - Utilities

```javascript
import { $, $$, debounce, throttle, fmt, clamp, sleep } from './utils.js';

// DOM selectors
const el = $('.selector');
const els = $$('.selector');

// Function utilities
const debouncedFn = debounce(() => console.log('debounced'), 300);
const throttledFn = throttle(() => console.log('throttled'), 100);

// Formatters
fmt.num(1234);        // "1,234"
fmt.ms(42);           // "42 ms"
fmt.pct(0.456);       // "45.6%"
fmt.ts(Date.now());   // "5:30:15 PM"
fmt.size(1024000);    // "1000.0 KB"
fmt.currency(42.50);  // "$42.50"

// Math utilities
const clamped = clamp(value, 0, 100);

// Async utilities
await sleep(1000); // Sleep for 1 second
```

---

## Component Guide

### Creating a Component

```javascript
import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { bind } from '../bind.js';
import { $ } from '../utils.js';
import perf from '../perf.js';

class MyComponent extends Component {
  constructor(api) {
    super('MyComponent');
    this.api = api;
    this.container = null;
  }

  onMount() {
    this.container = $('#app');
    this.render();

    // Subscribe to state updates
    this.subscribe(appState, 'myData', (data) => {
      requestAnimationFrame(() => this.updateUI(data));
    });

    // Poll data every 2s
    this.interval(() => this.fetchData(), 2000);

    // Initial fetch
    this.fetchData();
  }

  async fetchData() {
    try {
      const data = await perf.time(
        'fetchData',
        () => this.api.get('/endpoint'),
        'fetch'
      );
      appState.set('myData', data);
    } catch (error) {
      console.error('[MyComponent] Fetch failed:', error);
    }
  }

  render() {
    if (!this.container) return;

    perf.mark('render-start');

    const content = document.createElement('div');
    content.className = 'content';
    content.innerHTML = `
      <h2>My Component</h2>
      <div id="data-container" data-bind="value" data-format="number"></div>
    `;

    this.container.innerHTML = '';
    this.container.appendChild(content);

    perf.measure('render-my-component', 'render-start', 'render');
  }

  updateUI(data) {
    const container = $('#data-container');
    if (container) {
      bind(container, data);
    }
  }

  onUnmount() {
    console.log('[MyComponent] Cleanup complete');
  }
}

export default MyComponent;
```

### Registering with Router

```javascript
// main.js
import MyComponent from './components/MyComponent.js';

const myComponent = new MyComponent(api);

router.register('myroute', myComponent);
```

---

## State Management

### State Flow

```
[API Response] → appState.set('key', data) → [Subscribers notified]
                                               ↓
                                     [Component updates UI]
```

### Best Practices

1. **Single source of truth**: Store data in `appState`, not component instance variables
2. **Batch updates**: Use `requestAnimationFrame` for UI updates
3. **Avoid deep nesting**: Flatten state structure when possible
4. **Subscribe in onMount**: Always subscribe in component lifecycle
5. **Cleanup is automatic**: Lifecycle handles unsubscribe

### Example: Shared Data

```javascript
// Component A fetches data
class ComponentA extends Component {
  async fetchMetrics() {
    const data = await api.get('/metrics');
    appState.set('metrics', data); // Updates all subscribers
  }
}

// Component B consumes same data (no duplicate fetch)
class ComponentB extends Component {
  onMount() {
    this.subscribe(appState, 'metrics', (data) => {
      this.renderChart(data);
    });
  }
}
```

---

## Performance

### Budget Enforcement

```javascript
import perf from './perf.js';

// Set budgets (ms)
perf.setBudget('render', 16.67);      // 60fps
perf.setBudget('fetch', 300);         // API calls
perf.setBudget('interaction', 100);   // User interactions
```

Violations are logged to console:
```
[Perf] Budget exceeded: render-dashboard took 24.3ms (budget: 16.67ms)
```

### Optimization Techniques

1. **RAF batching**: Use `requestAnimationFrame` for UI updates
2. **Deferred rendering**: Delay non-critical renders
3. **Debounce inputs**: Debounce search/filter inputs
4. **Lazy loading**: Load components on-demand
5. **Minimize reflows**: Batch DOM reads/writes

### Monitoring

```javascript
// Get performance stats
const stats = perf.getStats('render');
console.table(stats);
// { count: 42, avg: 8.3, min: 2.1, max: 15.7, p50: 7.9, p95: 14.2, p99: 15.4 }

// Get web vitals
const vitals = perf.getWebVitals();
console.table(vitals);
// { fcp: 842, lcp: 1230, ttfb: 156, ... }
```

---

## Testing Strategy

### Unit Tests (planned)

```javascript
// state.test.js
import { describe, it, expect } from 'vitest';
import AppState from '../src/state.js';

describe('AppState', () => {
  it('notifies subscribers on change', () => {
    const state = new AppState();
    let notified = false;

    state.subscribe('key', () => { notified = true; });
    state.set('key', 'value');

    expect(notified).toBe(true);
  });

  it('does not notify if value unchanged', () => {
    const state = new AppState();
    let count = 0;

    state.set('key', 'value');
    state.subscribe('key', () => { count++; });
    state.set('key', 'value'); // Same value

    expect(count).toBe(0);
  });
});
```

### Integration Tests

```javascript
// component.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import MyComponent from '../src/components/MyComponent.js';
import appState from '../src/state.js';

// Mock API
class MockAPI {
  async get() {
    return { value: 123 };
  }
}

describe('MyComponent', () => {
  beforeEach(() => {
    appState.reset();
  });

  it('fetches and updates state', async () => {
    const component = new MyComponent(new MockAPI());
    component.mount();

    await component.fetchData();

    expect(appState.get('myData')).toEqual({ value: 123 });

    component.unmount();
  });
});
```

---

## Development Workflow

### Dev Mode Helpers

When running on `localhost`, debugging helpers are exposed:

```javascript
// State inspection
window.appState.get('metrics')
window.getStateHistory('metrics')

// Feature flags
window.features.enable('websockets')
location.reload()

// Performance stats
window.perf.getStats()
window.perf.getWebVitals()

// Error history
window.getRecentErrors()

// API client
await window.api.get('/health')

// Router
window.router.navigate('network')
```

### Scripts

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build

# Quality
npm run validate     # Validate architecture
npm run lint         # Lint JavaScript
npm run format       # Format code
npm run check        # Run validate + lint

# Tailwind
npm run tailwind:watch  # Watch Tailwind changes
```

### Code Style

- **2 spaces** for indentation
- **Single quotes** for strings
- **Semicolons** required
- **No trailing commas** in function args
- **Arrow functions** preferred
- **const** over let, never var
- **Destructuring** when readable

### File Naming

- **PascalCase** for components: `TheBlock.js`
- **camelCase** for modules: `state.js`, `lifecycle.js`
- **kebab-case** for CSS files: `styles.css`
- **UPPERCASE** for docs: `README.md`

### Commit Messages

```
feat: add WebSocket support with feature flag
fix: prevent memory leak in Network component
perf: optimize render loop with RAF batching
refactor: extract data binding to bind.js
docs: add architecture guide
test: add unit tests for state management
```

---

## FAQ

### Why no React/Vue/Svelte?

**Bundle size**: React alone is ~40KB minified. Our entire app is ~15KB.
**Control**: We control every byte, every optimization.
**Learning**: Framework patterns are transferable, this teaches fundamentals.

### Why not use a state management library?

**Simple needs**: We don't need Redux's time-travel debugging or middleware.
**Performance**: Our implementation is 200 lines and does exactly what we need.
**Zero dependencies**: No security vulnerabilities, no breaking changes.

### How do I add a new page?

1. Create component in `src/components/MyPage.js`
2. Import in `main.js`
3. Register with router: `router.register('mypage', myPageComponent)`
4. Add to navigation config: `{ path: 'mypage', label: 'My Page', component: MyPage }`

### How do I share data between components?

```javascript
// Component A sets data
appState.set('sharedData', { value: 123 });

// Component B subscribes
this.subscribe(appState, 'sharedData', (data) => {
  console.log('Data updated:', data);
});
```

### How do I test components?

```javascript
// Use dependency injection
class MyComponent {
  constructor(api) {
    this.api = api; // Injected
  }
}

// In tests, inject mock
const mockApi = { get: () => Promise.resolve({}) };
const component = new MyComponent(mockApi);
```

---

## Resources

- [Specifications](./web/architecture_patterns.md)
- [Implementation Roadmap](./web/implementation_roadmap.md)
- [Optimization Matrix](./web/optimization_priority_matrix.md)
- [Micro Optimizations](./web/micro_optimizations.md)

---

**Built with 1% dev mentality** — every line of code is intentional, every optimization justified.

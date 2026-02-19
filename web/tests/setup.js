// Test setup file - runs before all tests
// Sets up global mocks and utilities

import { vi } from 'vitest';

// Mock window.location
delete window.location;
window.location = {
  href: 'http://localhost:3000',
  hash: '',
  host: 'localhost:3000',
  hostname: 'localhost',
  origin: 'http://localhost:3000',
  pathname: '/',
  port: '3000',
  protocol: 'http:',
  search: '',
  reload: vi.fn(),
  replace: vi.fn(),
};

// Mock fetch globally
global.fetch = vi.fn();

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => {
  cb();
  return 1;
});

global.cancelAnimationFrame = vi.fn();

// Mock performance API
if (!global.performance) {
  global.performance = {
    now: vi.fn(() => Date.now()),
    getEntriesByType: vi.fn(() => []),
    mark: vi.fn(),
    measure: vi.fn(),
  };
}

// Mock localStorage
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }
}

global.localStorage = new LocalStorageMock();

// Mock crypto.subtle for file hashing tests
if (!global.crypto) {
  global.crypto = {};
}

if (!global.crypto.subtle) {
  global.crypto.subtle = {
    digest: vi.fn(async (algorithm, data) => {
      // Return mock hash
      return new ArrayBuffer(32);
    }),
  };
}

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.location.hash = '';
  
  // Reset fetch mock
  fetch.mockReset();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => '',
    status: 200,
    statusText: 'OK',
  });
});

// Log unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
vi.spyOn(Intl, 'NumberFormat').mockImplementation(() => ({
  format: (n) => String(n),
}));

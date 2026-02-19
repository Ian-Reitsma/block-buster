import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment (happy-dom for DOM simulation)
    environment: 'happy-dom',

    // Globals (describe, it, expect, vi)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.js',
        '**/*.spec.js',
        '**/*.test.js',
        'src/main.js', // Entry point, tested via integration
        'validate-architecture.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Setup files
    setupFiles: ['./tests/setup.js'],

    // Include/exclude patterns
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'public'],

    // Test timeout
    testTimeout: 10000,

    // Reporters
    reporters: ['verbose'],

    // Mock reset between tests
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Use root directory (where the SPA index.html is)
  root: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Content-hash for cache busting (automatic fingerprinting)
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
      // Suppress source map warnings for vendor files
      onwarn(warning, warn) {
        if (warning.code === 'SOURCEMAP_ERROR' && warning.message.includes('vendor')) {
          return;
        }
        warn(warning);
      }
    }
  },
  server: {
    port: 4173,
    open: true, // Auto-open browser
    proxy: {
      '/rpc': 'http://localhost:5000',
      '/health': 'http://localhost:5000',
      '/theblock': 'http://localhost:5000',
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true
      }
    }
  }
  // Note: Chart.js is vendored in public/js/vendor/chart.min.js
  // No need to pre-bundle from node_modules
});

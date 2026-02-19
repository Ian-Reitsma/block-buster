/**
 * Block Buster Boot Script
 * Single entry point for all pages
 * Conditionally loads page-specific modules based on current page
 */

(function() {
  'use strict';
  
  if (typeof document === 'undefined') return;
  
  // Detect current page
  const path = window.location.pathname;
  const page = path.split('/').pop().replace('.html', '') || 'index';
  
  console.log(`[Boot] Initializing page: ${page}`);
  
  // Common modules loaded by all pages (already in <head>)
  // - runtime-config.js (blocking: config initialization)
  // - utils.js (blocking: utility functions)
  // - shell.js (blocking: app shell render)
  // - nav.js (blocking: navigation setup)
  // - walkthrough.js (deferred: tutorial system, non-critical)
  
  // Page-specific module map
  // Modules load in order (important for Chart.js dependency)
  const pageModules = {
    'dashboard': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js', critical: true },
      { src: 'js/charting.js', name: 'Charting utilities' },
      { src: 'js/portfolio.js', name: 'Portfolio module' },
      { src: 'js/analytics.js', name: 'Analytics module' },
      { src: 'js/dashboard.js', name: 'Dashboard controller', critical: true },
      { src: 'js/modal.js', name: 'Modal manager', critical: true },
      { src: 'js/debug.js', name: 'Debug utilities', optional: true }
    ],
    'network': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' },
      { src: 'js/network_health.js', name: 'Network Health module' }
    ],
    'economics': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' },
      { src: 'js/economics.js', name: 'Economics module' }
    ],
    'trading': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' },
      { src: 'js/charting.js', name: 'Charting utilities' },
      { src: 'js/portfolio.js', name: 'Portfolio module' }
    ],
    'strategies': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' },
      { src: 'js/analytics.js', name: 'Analytics module' }
    ],
    'whales': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' }
    ],
    'sentiment': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' },
      { src: 'js/sentiment.js', name: 'Sentiment module' }
    ],
    'mev': [
      { src: 'js/vendor/chart.min.js', name: 'Chart.js' }
    ],
    'settings': [
      { src: 'js/settings.js', name: 'Settings module' }
    ],
    'theblock': [],
    'index': [],
    'disclaimer': []
  };
  
  // Get modules for current page
  const modules = pageModules[page] || [];
  
  if (modules.length === 0) {
    console.log(`[Boot] No additional modules needed for ${page}`);
    firePageReady();
    return;
  }
  
  console.log(`[Boot] Loading ${modules.length} modules for ${page}`);
  
  // Load modules sequentially (important for dependencies like Chart.js)
  let loadedCount = 0;
  
  function loadNextModule(index) {
    if (index >= modules.length) {
      console.log(`[Boot] All modules loaded for ${page}`);
      firePageReady();
      return;
    }
    
    const module = modules[index];
    const script = document.createElement('script');
    script.src = module.src;
    script.async = false; // Maintain order
    
    script.onload = () => {
      loadedCount++;
      console.log(`[Boot] ✓ ${module.name} (${loadedCount}/${modules.length})`);
      loadNextModule(index + 1);
    };
    
    script.onerror = () => {
      if (module.optional) {
        console.warn(`[Boot] ⚠ ${module.name} failed (optional)`);
        loadNextModule(index + 1);
      } else {
        console.error(`[Boot] ✗ ${module.name} failed to load`);
        // Continue anyway to not block the page
        loadNextModule(index + 1);
      }
    };
    
    document.head.appendChild(script);
  }
  
  // Start loading
  loadNextModule(0);
  
  // Fire custom event when all modules are loaded
  function firePageReady() {
    const event = new CustomEvent('pageModulesReady', { 
      detail: { page, modulesLoaded: loadedCount } 
    });
    document.dispatchEvent(event);
    console.log(`[Boot] Page ready: ${page}`);
  }
  
  // Debug: expose boot info
  if (typeof window !== 'undefined') {
    window.__BOOT_INFO__ = {
      page,
      modules: modules.map(m => m.name),
      timestamp: Date.now()
    };
  }
})();

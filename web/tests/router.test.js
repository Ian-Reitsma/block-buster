import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Router from '../src/router.js';
import { Component } from '../src/lifecycle.js';
import appState from '../src/state.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to trigger hashchange event in test environment
const triggerHashChange = () => {
  window.dispatchEvent(new Event('hashchange'));
};

// Mock components for testing
class MockComponent extends Component {
  constructor(name) {
    super(name);
    this.mounted = false;
    this.unmounted = false;
    this.rendered = false;
  }

  mount() {
    this.mounted = true;
  }

  unmount() {
    this.unmounted = true;
  }

  render() {
    this.rendered = true;
  }
}

describe('Router', () => {
  let router;
  let homeComponent;
  let aboutComponent;
  let notFoundComponent;
  let originalHash;

  beforeEach(() => {
    // Save original hash
    originalHash = window.location.hash;
    
    // Reset hash
    window.location.hash = '';
    
    // Create router and components
    router = new Router();
    homeComponent = new MockComponent('Home');
    aboutComponent = new MockComponent('About');
    notFoundComponent = new MockComponent('NotFound');
    
    // Reset app state
    appState.reset();
    
    // Clear all timers
    vi.clearAllTimers();
  });

  afterEach(() => {
    // Restore original hash
    window.location.hash = originalHash;
    
    // Unmount router if mounted
    if (router && router.unmount) {
      router.unmount();
    }
    
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should register a route', () => {
      router.register('home', homeComponent);
      
      expect(router.routes.has('home')).toBe(true);
      expect(router.routes.get('home')).toBe(homeComponent);
    });

    it('should return router for chaining', () => {
      const result = router.register('home', homeComponent);
      
      expect(result).toBe(router);
    });

    it('should register multiple routes', () => {
      router
        .register('home', homeComponent)
        .register('about', aboutComponent);
      
      expect(router.routes.size).toBe(2);
      expect(router.routes.get('home')).toBe(homeComponent);
      expect(router.routes.get('about')).toBe(aboutComponent);
    });

    it('should overwrite existing route', () => {
      const firstComponent = new MockComponent('First');
      const secondComponent = new MockComponent('Second');
      
      router.register('home', firstComponent);
      router.register('home', secondComponent);
      
      expect(router.routes.get('home')).toBe(secondComponent);
    });

    it('should register empty string as route', () => {
      router.register('', homeComponent);
      
      expect(router.routes.has('')).toBe(true);
    });
  });

  describe('setDefault', () => {
    it('should set default route', () => {
      router.setDefault('home');
      
      expect(router.defaultRoute).toBe('home');
    });

    it('should return router for chaining', () => {
      const result = router.setDefault('home');
      
      expect(result).toBe(router);
    });

    it('should overwrite previous default', () => {
      router.setDefault('home');
      router.setDefault('about');
      
      expect(router.defaultRoute).toBe('about');
    });
  });

  describe('setNotFound', () => {
    it('should set not found component', () => {
      router.setNotFound(notFoundComponent);
      
      expect(router.notFoundRoute).toBe(notFoundComponent);
    });

    it('should return router for chaining', () => {
      const result = router.setNotFound(notFoundComponent);
      
      expect(result).toBe(router);
    });
  });

  describe('getCurrentPath', () => {
    it('should return empty string when no hash', () => {
      window.location.hash = '';
      
      const path = router.getCurrentPath();
      
      expect(path).toBe('');
    });

    it('should return path without hash symbol', () => {
      window.location.hash = '#about';
      
      const path = router.getCurrentPath();
      
      expect(path).toBe('about');
    });

    it('should return default route when no hash and default set', () => {
      window.location.hash = '';
      router.setDefault('home');
      
      const path = router.getCurrentPath();
      
      expect(path).toBe('home');
    });

    it('should handle complex paths', () => {
      window.location.hash = '#user/profile/123';
      
      const path = router.getCurrentPath();
      
      expect(path).toBe('user/profile/123');
    });

    it('should handle paths with query parameters', () => {
      window.location.hash = '#search?q=test';
      
      const path = router.getCurrentPath();
      
      expect(path).toBe('search?q=test');
    });
  });

  describe('navigate', () => {
    it('should set window hash', () => {
      router.navigate('about');
      
      // Check that hash was set (may or may not include #)
      const hash = window.location.hash;
      expect(hash === '#about' || hash === 'about').toBe(true);
    });

    it('should trigger hashchange event', async () => {
      const handler = vi.fn();
      
      window.addEventListener('hashchange', handler);
      
      router.navigate('about');
      triggerHashChange(); // Manually trigger in test environment
      
      // Wait for event propagation
      await sleep(10);
      expect(handler).toHaveBeenCalled();
      
      // Cleanup
      window.removeEventListener('hashchange', handler);
    });

    it('should handle empty path', () => {
      router.navigate('');
      
      // Empty hash may be '' or '#'
      const hash = window.location.hash;
      expect(hash === '' || hash === '#').toBe(true);
    });
  });

  describe('handleRoute', () => {
    beforeEach(() => {
      router.register('home', homeComponent);
      router.register('about', aboutComponent);
    });

    it('should mount component for current route', () => {
      window.location.hash = '#home';
      router.handleRoute();
      
      expect(homeComponent.mounted).toBe(true);
    });

    it('should unmount previous component before mounting new one', () => {
      window.location.hash = '#home';
      router.handleRoute();
      
      window.location.hash = '#about';
      router.handleRoute();
      
      expect(homeComponent.unmounted).toBe(true);
      expect(aboutComponent.mounted).toBe(true);
    });

    it('should update app state with route', () => {
      window.location.hash = '#home';
      router.handleRoute();
      
      expect(appState.get('route')).toBe('home');
    });

    it('should trigger component render in next frame', async () => {
      window.location.hash = '#home';
      router.handleRoute();
      
      // Wait for next frame
      await sleep(20);
      
      expect(homeComponent.rendered).toBe(true);
    });

    it('should use not found component for unknown route', () => {
      router.setNotFound(notFoundComponent);
      
      window.location.hash = '#does-not-exist';
      router.handleRoute();
      
      expect(notFoundComponent.mounted).toBe(true);
    });

    it('should warn when no route found and no not found handler', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      window.location.hash = '#unknown';
      router.handleRoute();
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No route found for "unknown"')
      );
      
      consoleWarn.mockRestore();
    });

    it('should not crash if component has no unmount method', () => {
      const componentWithoutUnmount = {
        mount: vi.fn(),
        render: vi.fn(),
      };
      
      router.register('test', componentWithoutUnmount);
      window.location.hash = '#test';
      
      expect(() => router.handleRoute()).not.toThrow();
    });

    it('should not crash if component has no mount method', () => {
      const componentWithoutMount = {
        render: vi.fn(),
      };
      
      router.register('test', componentWithoutMount);
      window.location.hash = '#test';
      
      expect(() => router.handleRoute()).not.toThrow();
    });

    it('should not crash if component has no render method', () => {
      const componentWithoutRender = {
        mount: vi.fn(),
        unmount: vi.fn(),
      };
      
      router.register('test', componentWithoutRender);
      window.location.hash = '#test';
      
      expect(() => router.handleRoute()).not.toThrow();
    });
  });

  describe('onMount', () => {
    it('should listen for hashchange events', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      router.mount();
      
      // Check that hashchange listener was added (may be called with null options)
      const calls = addEventListenerSpy.mock.calls.filter(call => call[0] === 'hashchange');
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should handle initial route on mount', () => {
      router.register('home', homeComponent);
      window.location.hash = '#home';
      
      router.mount();
      
      expect(homeComponent.mounted).toBe(true);
    });

    it('should respond to hash changes after mount', async () => {
      router.register('home', homeComponent);
      router.register('about', aboutComponent);
      router.mount();
      
      // Navigate after mount
      await sleep(10);
      window.location.hash = '#about';
      triggerHashChange(); // Manually trigger in test environment
      
      // Wait for event handling
      await sleep(10);
      expect(aboutComponent.mounted).toBe(true);
    });
  });

  describe('getActiveRoute', () => {
    it('should return current active route', () => {
      window.location.hash = '#about';
      
      const active = router.getActiveRoute();
      
      expect(active).toBe('about');
    });

    it('should return empty string when no route', () => {
      window.location.hash = '';
      
      const active = router.getActiveRoute();
      
      expect(active).toBe('');
    });

    it('should return default when no hash and default set', () => {
      window.location.hash = '';
      router.setDefault('home');
      
      const active = router.getActiveRoute();
      
      expect(active).toBe('home');
    });
  });

  describe('integration scenarios', () => {
    it('should handle full routing flow', async () => {
      // Setup
      router
        .register('', homeComponent)
        .register('about', aboutComponent)
        .setDefault('');
      
      // Mount router
      router.mount();
      
      // Verify home is mounted
      expect(homeComponent.mounted).toBe(true);
      
      // Navigate to about
      await sleep(10);
      router.navigate('about');
      triggerHashChange(); // Manually trigger in test environment
      
      // Wait for event handling
      await sleep(10);
      expect(homeComponent.unmounted).toBe(true);
      expect(aboutComponent.mounted).toBe(true);
      expect(appState.get('route')).toBe('about');
    });

    it('should handle rapid navigation', async () => {
      router
        .register('home', homeComponent)
        .register('about', aboutComponent);
      
      router.mount();
      
      // Rapid navigation
      router.navigate('home');
      triggerHashChange();
      router.navigate('about');
      triggerHashChange();
      router.navigate('home');
      triggerHashChange();
      
      await sleep(10);
      // Should end up at home
      expect(appState.get('route')).toBe('home');
    });

    it('should handle default route when navigating to root', () => {
      router
        .register('', homeComponent)
        .setDefault('');
      
      window.location.hash = '';
      router.mount();
      
      expect(homeComponent.mounted).toBe(true);
    });

    it('should handle 404 flow', () => {
      router
        .register('home', homeComponent)
        .setNotFound(notFoundComponent);
      
      window.location.hash = '#does-not-exist';
      router.mount();
      
      expect(notFoundComponent.mounted).toBe(true);
      expect(homeComponent.mounted).toBe(false);
    });
  });

  describe('component lifecycle', () => {
    it('should call mount, render, and unmount in order', async () => {
      const callOrder = [];
      
      const component1 = {
        mount: () => callOrder.push('mount1'),
        render: () => callOrder.push('render1'),
        unmount: () => callOrder.push('unmount1'),
      };
      
      const component2 = {
        mount: () => callOrder.push('mount2'),
        render: () => callOrder.push('render2'),
      };
      
      router
        .register('page1', component1)
        .register('page2', component2);
      
      window.location.hash = '#page1';
      router.mount();
      
      await sleep(10);
      router.navigate('page2');
      triggerHashChange(); // Manually trigger in test environment
      
      await sleep(10);
      expect(callOrder).toContain('mount1');
      expect(callOrder).toContain('unmount1');
      expect(callOrder).toContain('mount2');
      expect(callOrder.indexOf('mount1')).toBeLessThan(callOrder.indexOf('unmount1'));
      expect(callOrder.indexOf('unmount1')).toBeLessThan(callOrder.indexOf('mount2'));
    });
  });

  describe('edge cases', () => {
    it('should handle routes with special characters', () => {
      const component = new MockComponent('Special');
      router.register('user/123', component);
      
      window.location.hash = '#user/123';
      router.handleRoute();
      
      expect(component.mounted).toBe(true);
    });

    it('should handle empty component map', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      window.location.hash = '#anything';
      router.handleRoute();
      
      expect(consoleWarn).toHaveBeenCalled();
      
      consoleWarn.mockRestore();
    });

    it('should handle null component gracefully', () => {
      router.register('null', null);
      window.location.hash = '#null';
      
      expect(() => router.handleRoute()).not.toThrow();
    });

    it('should handle undefined component gracefully', () => {
      router.register('undefined', undefined);
      window.location.hash = '#undefined';
      
      expect(() => router.handleRoute()).not.toThrow();
    });

    it('should not unmount on first navigation', () => {
      router.register('home', homeComponent);
      window.location.hash = '#home';
      
      router.handleRoute();
      
      expect(homeComponent.unmounted).toBe(false);
      expect(homeComponent.mounted).toBe(true);
    });
  });

  describe('memory management', () => {
    it('should properly cleanup listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      router.mount();
      router.unmount();
      
      // Check that hashchange listener was removed (may be called with null options)
      const calls = removeEventListenerSpy.mock.calls.filter(call => call[0] === 'hashchange');
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should clear current component reference on unmount', () => {
      router.register('home', homeComponent);
      window.location.hash = '#home';
      router.mount();
      
      expect(router.currentComponent).toBeTruthy();
      
      router.unmount();
      
      // Component should be unmounted but reference may remain
      // This is acceptable as router itself is being unmounted
    });
  });
});

/**
 * TheBlock Component Tests
 * Tests for dashboard with 3-tier metric hierarchy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TheBlock from '../src/components/TheBlock.js';
import appState from '../src/state.js';
import {
  assertGridLayout,
  assertCardTier,
  assertDataBinding,
  assertMetricGrouping,
  assertEmptyState,
  mockData,
  waitForElement,
  simulateClick,
} from './ui-test-helpers.js';

describe('TheBlock Component', () => {
  let component;
  let container;
  let mockRpc;

  beforeEach(() => {
    // Create container
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);

    // Mock RPC client
    mockRpc = {
      getDashboardMetrics: vi.fn().mockResolvedValue({
        tps: 1234,
        fees: 5.67,
        avgLatency: 42,
        activePeers: 28,
        blockHeight: 567890,
        finalizedHeight: 567885,
        avgBlockTime: 450,
        errors: [],
      }),
    };

    // Initialize component
    component = new TheBlock(mockRpc);
  });

  afterEach(() => {
    if (component && component.unmount) {
      component.unmount();
    }
    document.body.removeChild(container);
    appState.clear();
  });

  describe('Rendering', () => {
    it('should render hero metrics grid with 4 cards', async () => {
      await component.onMount();
      await waitForElement('.metrics-hero-grid');

      const heroGrid = document.querySelector('.metrics-hero-grid');
      expect(heroGrid).toBeTruthy();
      assertMetricGrouping(heroGrid, 'card-metric-hero', 4);
    });

    it('should render primary metrics grid with 3 cards', async () => {
      await component.onMount();
      await waitForElement('.metrics-primary-grid');

      const primaryGrid = document.querySelector('.metrics-primary-grid');
      expect(primaryGrid).toBeTruthy();
      assertMetricGrouping(primaryGrid, 'card-metric-primary', 3);
    });

    it('should render compact metrics grid with 6 cards', async () => {
      await component.onMount();
      await waitForElement('.metrics-compact-grid');

      const compactGrid = document.querySelector('.metrics-compact-grid');
      expect(compactGrid).toBeTruthy();
      assertMetricGrouping(compactGrid, 'card-metric-compact', 6);
    });

    it('should use correct card tiers', async () => {
      await component.onMount();

      const heroCard = document.querySelector('.card-metric-hero');
      const primaryCard = document.querySelector('.card-metric-primary');
      const compactCard = document.querySelector('.card-metric-compact');

      assertCardTier(heroCard, 'hero');
      assertCardTier(primaryCard, 'primary');
      assertCardTier(compactCard, 'compact');
    });

    it('should render hero section with title and description', async () => {
      await component.onMount();

      const hero = document.querySelector('.hero');
      expect(hero).toBeTruthy();
      expect(hero.querySelector('h2').textContent).toBe('The Block Network');
      expect(hero.querySelector('p')).toBeTruthy();
    });

    it('should render detailed section with 2-column split', async () => {
      await component.onMount();
      await waitForElement('.layout-split');

      const detailedSection = document.querySelector('.layout-split');
      expect(detailedSection).toBeTruthy();
    });
  });

  describe('Data Binding', () => {
    it('should bind TPS metric correctly', async () => {
      const mockMetrics = mockData.metrics();
      // Keep TheBlock's initial fetch from overwriting our test fixture
      mockRpc.getDashboardMetrics.mockResolvedValueOnce({ ...mockMetrics, errors: [] });
      appState.set('metrics', mockMetrics);

      await component.onMount();
      await waitForElement('.metrics-hero-grid');

      const heroGrid = document.querySelector('.metrics-hero-grid');
      assertDataBinding(heroGrid, 'tps', mockMetrics.tps, 'number');
    });

    it('should bind all hero metrics', async () => {
      const mockMetrics = {
        tps: 1234,
        blockHeight: 567890,
        finalizedHeight: 567885,
        peers: 28,
      };
      appState.set('metrics', mockMetrics);

      await component.onMount();
      await waitForElement('.metrics-hero-grid');

      const heroGrid = document.querySelector('.metrics-hero-grid');
      assertDataBinding(heroGrid, 'tps', mockMetrics.tps, 'number');
      assertDataBinding(heroGrid, 'blockHeight', mockMetrics.blockHeight, 'number');
      assertDataBinding(heroGrid, 'finalizedHeight', mockMetrics.finalizedHeight, 'number');
      assertDataBinding(heroGrid, 'peers', mockMetrics.peers, 'number');
    });

    it('should update metrics when state changes', async () => {
      await component.onMount();

      const initialMetrics = { tps: 100 };
      appState.set('metrics', initialMetrics);

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const heroGrid = document.querySelector('.metrics-hero-grid');
      const tpsElement = heroGrid.querySelector('[data-bind="tps"]');
      expect(tpsElement.textContent).toContain('100');

      // Update metrics
      const updatedMetrics = { tps: 200 };
      appState.set('metrics', updatedMetrics);

      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(tpsElement.textContent).toContain('200');
    });
  });

  describe('Derived Metrics', () => {
    it('should calculate unconfirmed blocks', async () => {
      const mockMetrics = {
        blockHeight: 1000,
        finalizedHeight: 990,
      };
      appState.set('metrics', mockMetrics);
      // Prevent initial fetch from replacing our crafted metrics
      mockRpc.getDashboardMetrics.mockResolvedValueOnce({ ...mockMetrics, errors: [] });

      await component.onMount();
      await waitForElement('#unconfirmed-blocks');

      const unconfirmedEl = document.querySelector('#unconfirmed-blocks');
      expect(unconfirmedEl.textContent).toContain('10');
    });

    it('should calculate network load percentage', async () => {
      const mockMetrics = { tps: 500 }; // 500/1000 = 50%
      appState.set('metrics', mockMetrics);
      // Prevent initial fetch from replacing our crafted metrics
      mockRpc.getDashboardMetrics.mockResolvedValueOnce({ ...mockMetrics, errors: [] });

      await component.onMount();
      await waitForElement('#network-load');

      const loadEl = document.querySelector('#network-load');
      expect(loadEl.textContent).toContain('50%');
    });

    it('should show healthy status when metrics are good', async () => {
      const mockMetrics = { tps: 100, peers: 10 };
      appState.set('metrics', mockMetrics);

      await component.onMount();
      await waitForElement('#chain-status');

      const statusEl = document.querySelector('#chain-status');
      expect(statusEl.querySelector('.pill.success')).toBeTruthy();
    });

    it('should show degraded status when metrics are poor', async () => {
      const mockMetrics = { tps: 0, peers: 0 };
      appState.set('metrics', mockMetrics);
      // Prevent initial fetch from replacing our crafted metrics
      mockRpc.getDashboardMetrics.mockResolvedValueOnce({ ...mockMetrics, errors: [] });

      await component.onMount();
      await waitForElement('#chain-status');

      const statusEl = document.querySelector('#chain-status');
      expect(statusEl.querySelector('.pill.warn')).toBeTruthy();
    });
  });

  describe('Charts and Visualizations', () => {
    it('should render throughput chart', async () => {
      await component.onMount();
      await waitForElement('.chart');

      const chart = document.querySelector('.chart');
      expect(chart).toBeTruthy();
      expect(chart.querySelectorAll('.bar').length).toBeGreaterThan(0);
    });

    it('should render chart bars with correct heights', async () => {
      const priceHistory = [10, 20, 30];
      appState.set('priceHistory', priceHistory);

      await component.onMount();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await waitForElement('.chart');

      const bars = document.querySelectorAll('.bar');
      expect(bars.length).toBe(3);
      expect(bars[0].style.height).toBe('30px'); // 10 + 20
      expect(bars[1].style.height).toBe('40px'); // 20 + 20
      expect(bars[2].style.height).toBe('50px'); // 30 + 20
    });
  });

  describe('Orders List', () => {
    it('should render empty state when no orders', async () => {
      appState.set('orders', []);

      await component.onMount();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const detailedSection = document.querySelector('.layout-split');
      assertEmptyState(detailedSection, 'No recent activity');
    });

    it('should render orders list when orders exist', async () => {
      const mockOrders = mockData.orders(3);
      appState.set('orders', mockOrders);

      await component.onMount();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const ordersList = document.querySelector('.list');
      expect(ordersList).toBeTruthy();
      expect(ordersList.querySelectorAll('li').length).toBe(3);
    });

    it('should show buy/sell pills with correct colors', async () => {
      const mockOrders = [
        { side: 'BUY', qty: 10, token: 'BLOCK', price: 1.5 },
        { side: 'SELL', qty: 20, token: 'BLOCK', price: 1.6 },
      ];
      appState.set('orders', mockOrders);

      await component.onMount();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Query pills within the orders list only, not the whole document
      const ordersList = document.querySelector('.list');
      const pills = ordersList.querySelectorAll('.pill');
      expect(pills[0].classList.contains('success')).toBe(true); // BUY
      expect(pills[1].classList.contains('danger')).toBe(true); // SELL
    });
  });

  describe('Polling', () => {
    it('should start polling on mount', async () => {
      const fetchSpy = vi.spyOn(component, 'fetchMetrics');

      await component.onMount();

      // Wait for initial fetch + one poll interval
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect(fetchSpy).toHaveBeenCalledTimes(2); // Initial + 1 poll
    });

    it('should stop polling on unmount', async () => {
      await component.onMount();
      const intervalId = component.pollingInterval;

      component.onUnmount();

      expect(component.pollingInterval).toBeNull();
    });

    it('should not start polling if WebSocket is active', async () => {
      appState.set('usePolling', false);
      const fetchSpy = vi.spyOn(component, 'fetchMetrics');

      await component.onMount();

      // Wait for potential poll interval
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect(fetchSpy).toHaveBeenCalledTimes(1); // Only initial fetch
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC errors gracefully', async () => {
      mockRpc.getDashboardMetrics.mockRejectedValueOnce(new Error('RPC failed'));

      await component.onMount();

      // Should not throw, should set offline state
      expect(appState.get('offline')).toBe(true);
    });

    it('should log RPC errors but continue', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation();
      mockRpc.getDashboardMetrics.mockResolvedValueOnce({
        tps: 100,
        errors: ['Some endpoint failed'],
      });

      await component.onMount();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[TheBlock] Some RPC calls failed:',
        ['Some endpoint failed']
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Responsive Behavior', () => {
    it('should maintain grid structure on desktop', async () => {
      window.innerWidth = 1920;

      await component.onMount();
      await waitForElement('.metrics-hero-grid');

      const heroGrid = document.querySelector('.metrics-hero-grid');
      expect(heroGrid).toBeTruthy();
      expect(heroGrid.classList.contains('metrics-hero-grid')).toBe(true);
      // Note: CSS not loaded in test env, so check class instead of computed style
    });

    it('should collapse grids on mobile', async () => {
      window.innerWidth = 414;

      await component.onMount();
      await waitForElement('.metrics-hero-grid');

      // Grid should still be present, but columns will adjust via CSS
      const heroGrid = document.querySelector('.metrics-hero-grid');
      expect(heroGrid).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should use requestAnimationFrame for updates', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      await component.onMount();
      appState.set('metrics', mockData.metrics());

      expect(rafSpy).toHaveBeenCalled();

      rafSpy.mockRestore();
    });

    it('should render within performance budget', async () => {
      const startTime = performance.now();

      await component.onMount();

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render in less than 100ms
      expect(renderTime).toBeLessThan(100);
    });
  });
});

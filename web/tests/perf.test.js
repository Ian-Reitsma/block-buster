import { describe, it, expect, beforeEach, vi } from 'vitest';
import perf from '../src/perf.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    perf.clear();
  });

  describe('mark', () => {
    it('should create a performance mark', () => {
      perf.mark('test-mark');
      expect(perf.marks.has('test-mark')).toBe(true);
      expect(typeof perf.marks.get('test-mark')).toBe('number');
    });

    it('should store timestamp when mark is created', () => {
      const before = performance.now();
      perf.mark('test-mark');
      const after = performance.now();
      
      const markTime = perf.marks.get('test-mark');
      expect(markTime).toBeGreaterThanOrEqual(before);
      expect(markTime).toBeLessThanOrEqual(after + 1); // Allow 1ms variance
    });

    it('should overwrite existing mark with same name', async () => {
      perf.mark('test-mark');
      const firstMark = perf.marks.get('test-mark');
      
      // Wait a bit and create same mark again
      await sleep(10);
      perf.mark('test-mark');
      const secondMark = perf.marks.get('test-mark');
      
      expect(secondMark).toBeGreaterThan(firstMark);
    });
  });

  describe('measure', () => {
    it('should measure duration between mark and now', async () => {
      perf.mark('start');
      await sleep(50);
      
      const measure = perf.measure('test-measure', 'start');
      
      expect(measure).toBeDefined();
      expect(measure.name).toBe('test-measure');
      expect(measure.duration).toBeGreaterThan(40); // At least 40ms
      expect(measure.category).toBe('general');
      expect(measure.timestamp).toBeDefined();
    });

    it('should add measure to measures array', () => {
      perf.mark('start');
      perf.measure('test', 'start');
      
      expect(perf.measures).toHaveLength(1);
      expect(perf.measures[0].name).toBe('test');
    });

    it('should delete mark after measuring', () => {
      perf.mark('start');
      perf.measure('test', 'start');
      
      expect(perf.marks.has('start')).toBe(false);
    });

    it('should warn if start mark not found', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const measure = perf.measure('test', 'nonexistent');
      
      expect(measure).toBeNull();
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Start mark "nonexistent" not found')
      );
      
      consoleWarn.mockRestore();
    });

    it('should use specified category', () => {
      perf.mark('start');
      const measure = perf.measure('test', 'start', 'render');
      
      expect(measure.category).toBe('render');
    });

    it('should warn when duration exceeds budget', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      perf.mark('start');
      await sleep(50); // Exceed render budget of 16.67ms (using 50ms for reliability)
      
      perf.measure('slow-render', 'start', 'render');
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Budget exceeded')
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('16.67')
      );
      
      consoleWarn.mockRestore();
    });

    it('should not warn when duration is within budget', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      perf.mark('start');
      await sleep(5); // Within render budget of 16.67ms
      
      perf.measure('fast-render', 'start', 'render');
      
      expect(consoleWarn).not.toHaveBeenCalled();
      
      consoleWarn.mockRestore();
    });

    it('should limit measures array to maxMeasures', () => {
      perf.maxMeasures = 5;
      
      for (let i = 0; i < 10; i++) {
        perf.mark(`start-${i}`);
        perf.measure(`measure-${i}`, `start-${i}`);
      }
      
      expect(perf.measures).toHaveLength(5);
      expect(perf.measures[0].name).toBe('measure-5'); // Oldest removed
      expect(perf.measures[4].name).toBe('measure-9');
    });
  });

  describe('setBudget', () => {
    it('should set budget for category', () => {
      perf.setBudget('custom', 200);
      expect(perf.budgets.custom).toBe(200);
    });

    it('should override existing budget', () => {
      expect(perf.budgets.render).toBe(16.67);
      perf.setBudget('render', 33.33);
      expect(perf.budgets.render).toBe(33.33);
    });
  });

  describe('getMeasures', () => {
    beforeEach(() => {
      perf.mark('start1');
      perf.measure('render-1', 'start1', 'render');
      
      perf.mark('start2');
      perf.measure('fetch-1', 'start2', 'fetch');
      
      perf.mark('start3');
      perf.measure('render-2', 'start3', 'render');
    });

    it('should return all measures when no category specified', () => {
      const measures = perf.getMeasures();
      expect(measures).toHaveLength(3);
    });

    it('should filter measures by category', () => {
      const renderMeasures = perf.getMeasures('render');
      expect(renderMeasures).toHaveLength(2);
      expect(renderMeasures[0].name).toBe('render-1');
      expect(renderMeasures[1].name).toBe('render-2');
    });

    it('should return empty array for unknown category', () => {
      const measures = perf.getMeasures('nonexistent');
      expect(measures).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return null for no measures', () => {
      const stats = perf.getStats();
      expect(stats).toBeNull();
    });

    it('should calculate correct statistics', () => {
      // Add measures with known durations
      perf.measures = [
        { name: 'm1', duration: 10, category: 'test' },
        { name: 'm2', duration: 20, category: 'test' },
        { name: 'm3', duration: 30, category: 'test' },
        { name: 'm4', duration: 40, category: 'test' },
        { name: 'm5', duration: 50, category: 'test' },
      ];
      
      const stats = perf.getStats();
      
      expect(stats.count).toBe(5);
      expect(stats.avg).toBe(30); // (10+20+30+40+50)/5
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.p50).toBe(30);
      expect(stats.p95).toBe(50);
      expect(stats.p99).toBe(50);
    });

    it('should filter stats by category', () => {
      perf.measures = [
        { name: 'm1', duration: 10, category: 'render' },
        { name: 'm2', duration: 20, category: 'fetch' },
        { name: 'm3', duration: 30, category: 'render' },
      ];
      
      const stats = perf.getStats('render');
      
      expect(stats.count).toBe(2);
      expect(stats.avg).toBe(20); // (10+30)/2
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
    });

    it('should return null for category with no measures', () => {
      perf.measures = [
        { name: 'm1', duration: 10, category: 'render' },
      ];
      
      const stats = perf.getStats('fetch');
      expect(stats).toBeNull();
    });
  });

  describe('percentile', () => {
    it('should calculate 50th percentile (median)', () => {
      const arr = [10, 20, 30, 40, 50];
      const p50 = perf.percentile(arr, 0.5);
      expect(p50).toBe(30);
    });

    it('should calculate 95th percentile', () => {
      const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const p95 = perf.percentile(arr, 0.95);
      expect(p95).toBe(100); // 95th percentile of 10 items
    });

    it('should calculate 99th percentile', () => {
      const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const p99 = perf.percentile(arr, 0.99);
      expect(p99).toBe(100);
    });

    it('should handle unsorted arrays', () => {
      const arr = [50, 10, 30, 20, 40];
      const p50 = perf.percentile(arr, 0.5);
      expect(p50).toBe(30);
    });

    it('should handle single element array', () => {
      const arr = [42];
      const p50 = perf.percentile(arr, 0.5);
      expect(p50).toBe(42);
    });
  });

  describe('clear', () => {
    it('should clear all marks and measures', () => {
      perf.mark('test');
      perf.mark('start');
      perf.measure('measure', 'start');
      
      expect(perf.marks.size).toBeGreaterThan(0);
      expect(perf.measures.length).toBeGreaterThan(0);
      
      perf.clear();
      
      expect(perf.marks.size).toBe(0);
      expect(perf.measures.length).toBe(0);
    });
  });

  describe('time', () => {
    it('should measure async function execution', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      
      const result = await perf.time('async-test', fn);
      
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(perf.measures).toHaveLength(1);
      expect(perf.measures[0].name).toBe('async-test');
    });

    it('should use specified category', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      
      await perf.time('fetch-test', fn, 'fetch');
      
      expect(perf.measures[0].category).toBe('fetch');
    });

    it('should measure sync function execution', async () => {
      const fn = vi.fn().mockReturnValue('result');
      
      const result = await perf.time('sync-test', fn);
      
      expect(result).toBe('result');
      expect(perf.measures).toHaveLength(1);
    });

    it('should measure error case and rethrow', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      
      await expect(perf.time('error-test', fn)).rejects.toThrow('Test error');
      
      expect(perf.measures).toHaveLength(1);
      expect(perf.measures[0].name).toBe('error-test-error');
    });

    it('should return result even for slow functions', async () => {
      const fn = vi.fn(async () => {
        await sleep(20);
        return 'slow-result';
      });
      
      const result = await perf.time('slow-test', fn);
      
      expect(result).toBe('slow-result');
      expect(perf.measures[0].duration).toBeGreaterThan(15);
    });
  });

  describe('getWebVitals', () => {
    it('should return web vitals object', () => {
      const vitals = perf.getWebVitals();
      
      expect(vitals).toBeDefined();
      expect(vitals).toHaveProperty('dns');
      expect(vitals).toHaveProperty('tcp');
      expect(vitals).toHaveProperty('ttfb');
      expect(vitals).toHaveProperty('domLoad');
      expect(vitals).toHaveProperty('load');
      expect(vitals).toHaveProperty('fcp');
      expect(vitals).toHaveProperty('lcp');
    });

    it('should handle missing navigation timing', () => {
      // Mock performance.getEntriesByType to return empty array
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
      
      const vitals = perf.getWebVitals();
      
      expect(vitals.dns).toBeNaN();
      expect(vitals.fcp).toBeUndefined();
      
      vi.restoreAllMocks();
    });
  });

  describe('getLCP', () => {
    it('should return null when no LCP entries', () => {
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
      
      const lcp = perf.getLCP();
      
      expect(lcp).toBeNull();
      
      vi.restoreAllMocks();
    });

    it('should return last LCP entry startTime', () => {
      const mockEntries = [
        { startTime: 100 },
        { startTime: 200 },
        { startTime: 300 },
      ];
      
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue(mockEntries);
      
      const lcp = perf.getLCP();
      
      expect(lcp).toBe(300);
      
      vi.restoreAllMocks();
    });
  });

  describe('budgets', () => {
    it('should enforce fetch budget (300ms)', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      perf.mark('start');
      await sleep(310); // Exceed budget
      perf.measure('slow-fetch', 'start', 'fetch');
      
      expect(consoleWarn).toHaveBeenCalled();
      
      consoleWarn.mockRestore();
    });

    it('should enforce interaction budget (100ms)', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      perf.mark('start');
      await sleep(110); // Exceed budget
      perf.measure('slow-click', 'start', 'interaction');
      
      expect(consoleWarn).toHaveBeenCalled();
      
      consoleWarn.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle empty stats calculation', () => {
      const stats = perf.getStats('nonexistent');
      expect(stats).toBeNull();
    });

    it('should handle rapid consecutive marks', () => {
      for (let i = 0; i < 100; i++) {
        perf.mark(`mark-${i}`);
      }
      
      expect(perf.marks.size).toBe(100);
    });

    it('should handle rapid consecutive measures', () => {
      for (let i = 0; i < 200; i++) {
        perf.mark(`start-${i}`);
        perf.measure(`measure-${i}`, `start-${i}`);
      }
      
      // Should be limited to maxMeasures (100)
      expect(perf.measures.length).toBe(perf.maxMeasures);
    });

    it('should handle null/undefined budget', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      perf.mark('start');
      await sleep(10);
      perf.measure('test', 'start', 'unknown-category');
      
      // Should not warn because no budget set for unknown-category
      expect(consoleWarn).not.toHaveBeenCalled();
      
      consoleWarn.mockRestore();
    });
  });
});

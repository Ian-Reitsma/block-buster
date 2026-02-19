import { describe, it, expect, beforeEach, vi } from 'vitest';
import errorBoundary from '../src/errors.js';

describe('ErrorBoundary', () => {
  beforeEach(() => {
    errorBoundary.clear();
    errorBoundary.handlers = [];
  });

  describe('catch', () => {
    it('should catch errors', () => {
      const error = new Error('Test error');

      errorBoundary.catch(error, { component: 'Test' });

      const errors = errorBoundary.getRecentErrors(1);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('Test error');
      expect(errors[0].context.component).toBe('Test');
    });

    it('should store error timestamp', () => {
      const error = new Error('Test');
      const before = Date.now();

      errorBoundary.catch(error);

      const errors = errorBoundary.getRecentErrors(1);
      expect(errors[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(errors[0].timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should store error stack', () => {
      const error = new Error('Test');

      errorBoundary.catch(error);

      const errors = errorBoundary.getRecentErrors(1);
      expect(errors[0].stack).toBeDefined();
    });

    it('should handle non-Error objects', () => {
      errorBoundary.catch('String error');

      const errors = errorBoundary.getRecentErrors(1);
      expect(errors[0].message).toBe('String error');
    });
  });

  describe('onError', () => {
    it('should notify handlers', () => {
      let notified = false;
      let errorReceived = null;

      errorBoundary.onError((error) => {
        notified = true;
        errorReceived = error;
      });

      const error = new Error('Test');
      errorBoundary.catch(error);

      expect(notified).toBe(true);
      expect(errorReceived.message).toBe('Test');
    });

    it('should notify multiple handlers', () => {
      let count1 = 0;
      let count2 = 0;

      errorBoundary.onError(() => {
        count1++;
      });

      errorBoundary.onError(() => {
        count2++;
      });

      errorBoundary.catch(new Error('Test'));

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent errors', () => {
      errorBoundary.catch(new Error('Error 1'));
      errorBoundary.catch(new Error('Error 2'));
      errorBoundary.catch(new Error('Error 3'));

      const errors = errorBoundary.getRecentErrors();

      expect(errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should limit returned errors', () => {
      for (let i = 0; i < 20; i++) {
        errorBoundary.catch(new Error(`Error ${i}`));
      }

      const errors = errorBoundary.getRecentErrors(5);

      expect(errors.length).toBe(5);
    });

    it('should return most recent errors', () => {
      errorBoundary.catch(new Error('Old'));
      errorBoundary.catch(new Error('Recent'));

      const errors = errorBoundary.getRecentErrors(1);

      expect(errors[0].message).toBe('Recent');
    });
  });

  describe('clear', () => {
    it('should clear all errors', () => {
      errorBoundary.catch(new Error('Test 1'));
      errorBoundary.catch(new Error('Test 2'));

      errorBoundary.clear();

      const errors = errorBoundary.getRecentErrors();
      expect(errors.length).toBe(0);
    });
  });

  describe('error limit', () => {
    it('should limit stored errors to maxErrors', () => {
      // Default maxErrors is 100
      for (let i = 0; i < 150; i++) {
        errorBoundary.catch(new Error(`Error ${i}`));
      }

      const errors = errorBoundary.getRecentErrors(200);
      expect(errors.length).toBeLessThanOrEqual(100);
    });

    it('should keep most recent errors when limit exceeded', () => {
      for (let i = 0; i < 150; i++) {
        errorBoundary.catch(new Error(`Error ${i}`));
      }

      const errors = errorBoundary.getRecentErrors(1);
      expect(errors[0].message).toBe('Error 149');
    });
  });

  describe('reporting', () => {
    it('should send errors to endpoint if configured', () => {
      vi.useFakeTimers();

      errorBoundary.setReportEndpoint('/api/errors');

      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      errorBoundary.catch(new Error('Test'));

      vi.advanceTimersByTime(5000);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/errors',
        expect.objectContaining({
          method: 'POST',
        }),
      );

      mockFetch.mockRestore();
      vi.useRealTimers();
    });

    it('should debounce error reporting', () => {
      vi.useFakeTimers();

      errorBoundary.setReportEndpoint('/api/errors');

      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      errorBoundary.catch(new Error('Error 1'));
      errorBoundary.catch(new Error('Error 2'));
      errorBoundary.catch(new Error('Error 3'));

      vi.advanceTimersByTime(5000);

      // Should only report the last error due to debouncing
      expect(mockFetch).toHaveBeenCalledTimes(1);

      mockFetch.mockRestore();
      vi.useRealTimers();
    });
  });
});

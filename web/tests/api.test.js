import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ApiClient from '../src/api.js';

describe('ApiClient', () => {
  let api;
  let mockFetch;

  beforeEach(() => {
    api = new ApiClient('http://localhost:5000');
    mockFetch = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const client = new ApiClient('http://api.example.com');
      expect(client.baseUrl).toBe('http://api.example.com');
      expect(client.timeout).toBe(30000);
      expect(client.retries).toBe(3);
    });

    it('should accept custom options', () => {
      const client = new ApiClient('http://api.example.com', {
        timeout: 5000,
        retries: 5,
        retryDelay: 500,
      });

      expect(client.timeout).toBe(5000);
      expect(client.retries).toBe(5);
      expect(client.retryDelay).toBe(500);
    });
  });

  describe('GET requests', () => {
    it('should make GET requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ test: 'value' }),
      });

      const result = await api.get('/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/endpoint',
        expect.objectContaining({
          signal: expect.any(Object),
        }),
      );
      expect(result).toEqual({ test: 'value' });
    });

    it('should include custom headers', async () => {
      api.setHeader('Authorization', 'Bearer token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await api.get('/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
          }),
        }),
      );
    });
  });

  describe('POST requests', () => {
    it('should make POST requests with data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const data = { key: 'value' };
      const result = await api.post('/endpoint', data);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/endpoint',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('PUT requests', () => {
    it('should make PUT requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updated: true }),
      });

      const data = { key: 'updated' };
      await api.put('/endpoint', data);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      );
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: true }),
      });

      await api.delete('/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP errors', async () => {
      // Mock all retry attempts to fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(api.get('/nonexistent')).rejects.toThrow('HTTP 404');
    });

    it('should throw on network errors', async () => {
      // Mock all retry attempts to fail
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(api.get('/endpoint')).rejects.toThrow();
    });
  });

  describe('retry logic', () => {
    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const result = await api.get('/endpoint');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true });
    });

    it('should respect retry limit', async () => {
      mockFetch.mockRejectedValue(new Error('Always fail'));

      await expect(api.get('/endpoint')).rejects.toThrow();

      // Should try: attempt 1, 2, 3 (since retries=3 means try up to 3 times total)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff', async () => {
      vi.useFakeTimers();

      mockFetch.mockRejectedValue(new Error('Fail'));

      const promise = api.get('/endpoint');

      // Should fail after all retries
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow();

      vi.useRealTimers();
    });
  });

  describe('timeout', () => {
    it('should timeout after specified duration', async () => {
      vi.useFakeTimers();

      const client = new ApiClient('http://localhost:5000', { timeout: 1000, retries: 1 });

      // Mock fetch to simulate a hung request that respects abort signal
      mockFetch.mockImplementationOnce(
        (url, options) =>
          new Promise((resolve, reject) => {
            if (options.signal) {
              options.signal.addEventListener('abort', () => {
                reject(new DOMException('The user aborted a request.', 'AbortError'));
              });
            }
          }),
      );

      const promise = client.get('/slow');

      // Advance time to trigger timeout
      await vi.advanceTimersByTimeAsync(1100);

      await expect(promise).rejects.toThrow('timeout');

      vi.useRealTimers();
    });
  });

  describe('headers', () => {
    it('should set custom headers', () => {
      api.setHeader('X-Custom', 'value');
      expect(api.headers['X-Custom']).toBe('value');
    });

    it('should remove headers', () => {
      api.setHeader('X-Custom', 'value');
      api.removeHeader('X-Custom');
      expect(api.headers['X-Custom']).toBeUndefined();
    });

    it('should include default Content-Type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await api.get('/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
  });
});

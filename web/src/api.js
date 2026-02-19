// API client with dependency injection for testability
// Centralized request/response handling with retry logic

import errorBoundary from './errors.js';

class ApiClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.headers = options.headers || {};
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  async requestWithRetry(path, options = {}, attempt = 1) {
    try {
      return await this.request(path, options);
    } catch (error) {
      if (attempt >= this.retries) {
        errorBoundary.catch(error, {
          component: 'ApiClient',
          path,
          attempt,
        });
        throw error;
      }

      console.warn(
        `[ApiClient] Retry ${attempt}/${this.retries} for ${path}: ${error.message}`,
      );

      await new Promise((resolve) => setTimeout(resolve, this.retryDelay * attempt));
      return this.requestWithRetry(path, options, attempt + 1);
    }
  }

  async get(path, options = {}) {
    return this.requestWithRetry(path, { ...options, method: 'GET' });
  }

  async post(path, data, options = {}) {
    return this.requestWithRetry(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(path, data, options = {}) {
    return this.requestWithRetry(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(path, options = {}) {
    return this.requestWithRetry(path, { ...options, method: 'DELETE' });
  }

  setHeader(key, value) {
    this.headers[key] = value;
  }

  removeHeader(key) {
    delete this.headers[key];
  }
}

export default ApiClient;

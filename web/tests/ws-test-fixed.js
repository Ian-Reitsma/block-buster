import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BlockWebSocket from '../src/ws.js';
import appState from '../src/state.js';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.sentMessages = [];

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen({ type: 'open' });
    }, 10);
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose({ code, reason, type: 'close' });
    }, 10);
  }

  // Test helper: simulate receiving message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({
         typeof data === 'string' ? data : JSON.stringify(data),
        type: 'message',
      });
    }
  }

  // Test helper: simulate error
  simulateError(error) {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}

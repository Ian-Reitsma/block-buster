import { describe, it, expect, beforeEach } from 'vitest';
import appState from '../src/state.js';

describe('AppState', () => {
  beforeEach(() => {
    appState.reset();
  });

  describe('set and get', () => {
    it('should set and get values', () => {
      appState.set('key', 'value');
      expect(appState.get('key')).toBe('value');
    });

    it('should handle nested objects', () => {
      const obj = { nested: { deep: { value: 42 } } };
      appState.set('nested', obj);
      expect(appState.get('nested')).toEqual(obj);
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3, 4, 5];
      appState.set('array', arr);
      expect(appState.get('array')).toEqual(arr);
    });

    it('should return undefined for non-existent keys', () => {
      expect(appState.get('nonexistent')).toBeUndefined();
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on change', () => {
      let notified = false;
      let receivedValue = null;

      appState.subscribe('key', (value) => {
        notified = true;
        receivedValue = value;
      });

      appState.set('key', 'value');

      expect(notified).toBe(true);
      expect(receivedValue).toBe('value');
    });

    it('should provide old value to subscribers', () => {
      let oldValue = null;
      let newValue = null;

      appState.set('key', 'old');

      appState.subscribe('key', (value, prev) => {
        newValue = value;
        oldValue = prev;
      });

      appState.set('key', 'new');

      expect(oldValue).toBe('old');
      expect(newValue).toBe('new');
    });

    it('should not notify if value unchanged', () => {
      let count = 0;

      appState.set('key', 'value');

      appState.subscribe('key', () => {
        count++;
      });

      appState.set('key', 'value'); // Same value

      expect(count).toBe(0);
    });

    it('should handle multiple subscribers', () => {
      let count1 = 0;
      let count2 = 0;

      appState.subscribe('key', () => {
        count1++;
      });

      appState.subscribe('key', () => {
        count2++;
      });

      appState.set('key', 'value');

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('should return unsubscribe function', () => {
      let count = 0;

      const unsubscribe = appState.subscribe('key', () => {
        count++;
      });

      appState.set('key', 'value1');
      expect(count).toBe(1);

      unsubscribe();

      appState.set('key', 'value2');
      expect(count).toBe(1); // Should not increment
    });

    it('should detect deep object changes', () => {
      let notified = false;

      appState.set('obj', { nested: { value: 1 } });

      appState.subscribe('obj', () => {
        notified = true;
      });

      appState.set('obj', { nested: { value: 2 } });

      expect(notified).toBe(true);
    });
  });

  describe('history', () => {
    it('should record state changes', () => {
      appState.set('key', 'value1');
      appState.set('key', 'value2');
      appState.set('key', 'value3');

      const history = appState.getHistory('key');

      expect(history.length).toBeGreaterThanOrEqual(2); // At least 2 changes
      expect(history[history.length - 1].value).toBe('value3');
    });

    it('should limit history to maxHistory', () => {
      // Default maxHistory is 50
      for (let i = 0; i < 60; i++) {
        appState.set('key', `value${i}`);
      }

      const history = appState.getHistory('key');
      expect(history.length).toBeLessThanOrEqual(50);
    });

    it('should get history for specific key', () => {
      appState.set('key1', 'value1');
      appState.set('key2', 'value2');

      const history = appState.getHistory('key1');

      expect(history.every((h) => h.key === 'key1')).toBe(true);
    });

    it('should get all history if no key specified', () => {
      appState.set('key1', 'value1');
      appState.set('key2', 'value2');

      const history = appState.getHistory();

      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      appState.set('key1', 'value1');
      appState.set('key2', 'value2');

      appState.reset();

      expect(appState.get('key1')).toBeUndefined();
      expect(appState.get('key2')).toBeUndefined();
    });

    it('should notify subscribers on reset', () => {
      let notified = false;

      appState.set('key', 'value');

      appState.subscribe('key', () => {
        notified = true;
      });

      appState.reset();

      expect(notified).toBe(true);
    });
  });
});

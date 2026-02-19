import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  $,
  $$,
  debounce,
  throttle,
  fmt,
  clamp,
  randomInt,
  sleep,
  groupBy,
  uniq,
  sortBy,
} from '../src/utils.js';

describe('DOM Utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('$', () => {
    it('should select element by selector', () => {
      document.body.innerHTML = '<div id="test">Hello</div>';
      
      const el = $('#test');
      
      expect(el).toBeTruthy();
      expect(el.textContent).toBe('Hello');
    });

    it('should return null for non-existent element', () => {
      const el = $('#nonexistent');
      
      expect(el).toBeNull();
    });

    it('should select by class', () => {
      document.body.innerHTML = '<div class="test-class">Test</div>';
      
      const el = $('.test-class');
      
      expect(el).toBeTruthy();
      expect(el.textContent).toBe('Test');
    });

    it('should select by tag name', () => {
      document.body.innerHTML = '<p>Paragraph</p>';
      
      const el = $('p');
      
      expect(el).toBeTruthy();
      expect(el.textContent).toBe('Paragraph');
    });

    it('should return first match when multiple elements', () => {
      document.body.innerHTML = `
        <div class="item">First</div>
        <div class="item">Second</div>
      `;
      
      const el = $('.item');
      
      expect(el.textContent).toBe('First');
    });
  });

  describe('$$', () => {
    it('should select all elements by selector', () => {
      document.body.innerHTML = `
        <div class="item">1</div>
        <div class="item">2</div>
        <div class="item">3</div>
      `;
      
      const els = $$('.item');
      
      expect(els.length).toBe(3);
    });

    it('should return empty NodeList for non-existent elements', () => {
      const els = $$('.nonexistent');
      
      expect(els.length).toBe(0);
    });

    it('should select all elements of same tag', () => {
      document.body.innerHTML = `
        <p>Para 1</p>
        <p>Para 2</p>
        <div>Div</div>
      `;
      
      const els = $$('p');
      
      expect(els.length).toBe(2);
    });
  });
});

describe('Timing Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      
      debounced();
      expect(fn).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous call when invoked again', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      
      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      
      expect(fn).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      
      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);
      
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should use default delay of 80ms', () => {
      const fn = vi.fn();
      const debounced = debounce(fn);
      
      debounced();
      vi.advanceTimersByTime(79);
      expect(fn).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid consecutive calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      
      for (let i = 0; i < 10; i++) {
        debounced();
        vi.advanceTimersByTime(50);
      }
      
      // Should not have been called yet
      expect(fn).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should execute function immediately', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should ignore calls within delay period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      throttled();
      throttled();
      throttled();
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow execution after delay period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to throttled function', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      throttled('arg1', 'arg2');
      
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should use default delay of 100ms', () => {
      const fn = vi.fn();
      const throttled = throttle(fn);
      
      throttled();
      throttled();
      
      expect(fn).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(100);
      throttled();
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple throttle windows', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      
      throttled(); // Call 1
      vi.advanceTimersByTime(100);
      
      throttled(); // Call 2
      vi.advanceTimersByTime(100);
      
      throttled(); // Call 3
      
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('sleep', () => {
    it('should return a promise', () => {
      const result = sleep(100);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve after specified time', async () => {
      const promise = sleep(100);
      
      vi.advanceTimersByTime(99);
      await Promise.resolve(); // Flush microtask queue
      
      vi.advanceTimersByTime(1);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should work with await', async () => {
      const start = Date.now();
      const promise = sleep(100);
      
      vi.advanceTimersByTime(100);
      await promise;
      
      // Promise should be resolved
      expect(promise).resolves.toBeUndefined();
    });
  });
});

describe('Formatter Utilities', () => {
  describe('fmt.num', () => {
    it('should format numbers with locale', () => {
      expect(fmt.num(1000)).toBe('1,000');
      expect(fmt.num(1000000)).toBe('1,000,000');
    });

    it('should handle zero', () => {
      expect(fmt.num(0)).toBe('0');
    });

    it('should handle negative numbers', () => {
      expect(fmt.num(-1000)).toBe('-1,000');
    });

    it('should handle decimals', () => {
      expect(fmt.num(1234.56)).toBe('1,234.56');
    });

    it('should return em dash for null', () => {
      expect(fmt.num(null)).toBe('—');
    });

    it('should return em dash for undefined', () => {
      expect(fmt.num(undefined)).toBe('—');
    });

    it('should convert string numbers', () => {
      expect(fmt.num('1000')).toBe('1,000');
    });
  });

  describe('fmt.ms', () => {
    it('should format milliseconds', () => {
      expect(fmt.ms(100)).toBe('100 ms');
      expect(fmt.ms(1234)).toBe('1234 ms');
    });

    it('should round to nearest integer', () => {
      expect(fmt.ms(123.7)).toBe('124 ms');
      expect(fmt.ms(123.2)).toBe('123 ms');
    });

    it('should return em dash for null', () => {
      expect(fmt.ms(null)).toBe('—');
    });

    it('should return em dash for undefined', () => {
      expect(fmt.ms(undefined)).toBe('—');
    });

    it('should handle zero', () => {
      expect(fmt.ms(0)).toBe('0 ms');
    });
  });

  describe('fmt.pct', () => {
    it('should format percentages with one decimal', () => {
      expect(fmt.pct(50.5)).toBe('50.5%');
      expect(fmt.pct(99.9)).toBe('99.9%');
    });

    it('should round to one decimal place', () => {
      expect(fmt.pct(50.55)).toBe('50.6%');
      expect(fmt.pct(50.54)).toBe('50.5%');
    });

    it('should return em dash for null', () => {
      expect(fmt.pct(null)).toBe('—');
    });

    it('should return em dash for undefined', () => {
      expect(fmt.pct(undefined)).toBe('—');
    });

    it('should handle zero', () => {
      expect(fmt.pct(0)).toBe('0.0%');
    });

    it('should handle 100%', () => {
      expect(fmt.pct(100)).toBe('100.0%');
    });
  });

  describe('fmt.ts', () => {
    it('should format timestamp as time', () => {
      const date = new Date('2026-02-12T17:30:00');
      const result = fmt.ts(date.getTime());
      
      // Should include time components
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should use locale time format', () => {
      const date = new Date('2026-02-12T17:30:00');
      const result = fmt.ts(date.getTime());
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('fmt.date', () => {
    it('should format timestamp as date', () => {
      const date = new Date('2026-02-12');
      const result = fmt.date(date.getTime());
      
      // Should include date components
      expect(result).toMatch(/\d/);
      expect(typeof result).toBe('string');
    });
  });

  describe('fmt.datetime', () => {
    it('should format timestamp as date and time', () => {
      const date = new Date('2026-02-12T17:30:00');
      const result = fmt.datetime(date.getTime());
      
      // Should include both date and time
      expect(result).toMatch(/\d/);
      expect(result).toMatch(/:/); // Time separator
      expect(typeof result).toBe('string');
    });
  });

  describe('fmt.size', () => {
    it('should format bytes', () => {
      expect(fmt.size(500)).toBe('500.0 B');
    });

    it('should format kilobytes', () => {
      expect(fmt.size(1024)).toBe('1.0 KB');
      expect(fmt.size(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(fmt.size(1048576)).toBe('1.0 MB');
      expect(fmt.size(1572864)).toBe('1.5 MB');
    });

    it('should format gigabytes', () => {
      expect(fmt.size(1073741824)).toBe('1.0 GB');
      expect(fmt.size(1610612736)).toBe('1.5 GB');
    });

    it('should return em dash for null', () => {
      expect(fmt.size(null)).toBe('—');
    });

    it('should return em dash for undefined', () => {
      expect(fmt.size(undefined)).toBe('—');
    });

    it('should handle zero', () => {
      expect(fmt.size(0)).toBe('0.0 B');
    });

    it('should stop at GB', () => {
      const terabyte = 1099511627776;
      const result = fmt.size(terabyte);
      expect(result).toContain('GB');
    });
  });

  describe('fmt.currency', () => {
    it('should format as USD currency', () => {
      const result = fmt.currency(1234.56);
      expect(result).toContain('$');
      expect(result).toContain('1,234.56');
    });

    it('should handle zero', () => {
      const result = fmt.currency(0);
      expect(result).toContain('$');
      expect(result).toContain('0.00');
    });

    it('should handle negative amounts', () => {
      const result = fmt.currency(-100);
      expect(result).toContain('$');
      expect(result).toContain('100');
    });

    it('should round to 2 decimal places', () => {
      const result = fmt.currency(1.234);
      expect(result).toContain('1.23');
    });
  });
});

describe('Math Utilities', () => {
  describe('clamp', () => {
    it('should return value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('should return min when value below range', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(-100, 0, 100)).toBe(0);
    });

    it('should return max when value above range', () => {
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(200, 0, 100)).toBe(100);
    });

    it('should handle negative ranges', () => {
      expect(clamp(-5, -10, 0)).toBe(-5);
      expect(clamp(-15, -10, 0)).toBe(-10);
      expect(clamp(5, -10, 0)).toBe(0);
    });

    it('should handle edge values', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('should handle decimals', () => {
      expect(clamp(5.5, 0, 10)).toBe(5.5);
      expect(clamp(10.5, 0, 10)).toBe(10);
    });
  });

  describe('randomInt', () => {
    it('should return integer within range', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomInt(1, 10);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(10);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('should handle min equals max', () => {
      expect(randomInt(5, 5)).toBe(5);
    });

    it('should include both min and max', () => {
      const results = new Set();
      
      // Run many times to hit edge cases
      for (let i = 0; i < 1000; i++) {
        results.add(randomInt(1, 3));
      }
      
      // Should have generated 1, 2, and 3
      expect(results.has(1)).toBe(true);
      expect(results.has(3)).toBe(true);
    });

    it('should handle negative ranges', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomInt(-10, -1);
        expect(result).toBeGreaterThanOrEqual(-10);
        expect(result).toBeLessThanOrEqual(-1);
      }
    });

    it('should handle large ranges', () => {
      const result = randomInt(0, 1000000);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1000000);
    });
  });
});

describe('Array Utilities', () => {
  describe('groupBy', () => {
    it('should group array by key', () => {
      const arr = [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
        { type: 'vegetable', name: 'carrot' },
      ];
      
      const result = groupBy(arr, 'type');
      
      expect(result.fruit).toHaveLength(2);
      expect(result.vegetable).toHaveLength(1);
      expect(result.fruit[0].name).toBe('apple');
    });

    it('should handle empty array', () => {
      const result = groupBy([], 'type');
      expect(result).toEqual({});
    });

    it('should handle missing keys', () => {
      const arr = [
        { type: 'fruit', name: 'apple' },
        { name: 'unknown' },
      ];
      
      const result = groupBy(arr, 'type');
      
      expect(result.fruit).toHaveLength(1);
      expect(result.undefined).toHaveLength(1);
    });

    it('should handle numeric keys', () => {
      const arr = [
        { score: 1, name: 'a' },
        { score: 1, name: 'b' },
        { score: 2, name: 'c' },
      ];
      
      const result = groupBy(arr, 'score');
      
      expect(result['1']).toHaveLength(2);
      expect(result['2']).toHaveLength(1);
    });

    it('should preserve original objects', () => {
      const arr = [
        { type: 'fruit', name: 'apple', color: 'red' },
        { type: 'fruit', name: 'banana', color: 'yellow' },
      ];
      
      const result = groupBy(arr, 'type');
      
      expect(result.fruit[0]).toEqual(arr[0]);
      expect(result.fruit[1]).toEqual(arr[1]);
    });
  });

  describe('uniq', () => {
    it('should remove duplicates', () => {
      const arr = [1, 2, 2, 3, 3, 3, 4];
      const result = uniq(arr);
      
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should handle empty array', () => {
      expect(uniq([])).toEqual([]);
    });

    it('should handle array with no duplicates', () => {
      const arr = [1, 2, 3, 4];
      expect(uniq(arr)).toEqual([1, 2, 3, 4]);
    });

    it('should handle strings', () => {
      const arr = ['a', 'b', 'b', 'c', 'c'];
      expect(uniq(arr)).toEqual(['a', 'b', 'c']);
    });

    it('should preserve order', () => {
      const arr = [3, 1, 2, 1, 2, 3];
      const result = uniq(arr);
      
      expect(result[0]).toBe(3);
      expect(result[1]).toBe(1);
      expect(result[2]).toBe(2);
    });

    it('should handle mixed types', () => {
      const arr = [1, '1', 2, '2', 1];
      const result = uniq(arr);
      
      expect(result).toHaveLength(4);
    });

    it('should not mutate original array', () => {
      const arr = [1, 2, 2, 3];
      const original = [...arr];
      
      uniq(arr);
      
      expect(arr).toEqual(original);
    });
  });

  describe('sortBy', () => {
    it('should sort array by key ascending', () => {
      const arr = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];
      
      const result = sortBy(arr, 'age');
      
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Charlie');
      expect(result[2].name).toBe('Bob');
    });

    it('should sort array by key descending', () => {
      const arr = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];
      
      const result = sortBy(arr, 'age', true);
      
      expect(result[0].name).toBe('Bob');
      expect(result[1].name).toBe('Charlie');
      expect(result[2].name).toBe('Alice');
    });

    it('should sort strings alphabetically', () => {
      const arr = [
        { name: 'Charlie' },
        { name: 'Alice' },
        { name: 'Bob' },
      ];
      
      const result = sortBy(arr, 'name');
      
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
      expect(result[2].name).toBe('Charlie');
    });

    it('should handle empty array', () => {
      expect(sortBy([], 'key')).toEqual([]);
    });

    it('should handle single element', () => {
      const arr = [{ name: 'Alice' }];
      expect(sortBy(arr, 'name')).toEqual(arr);
    });

    it('should handle equal values', () => {
      const arr = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 25 },
      ];
      
      const result = sortBy(arr, 'age');
      
      // Order of equal values should be preserved
      expect(result).toHaveLength(3);
      result.forEach(item => expect(item.age).toBe(25));
    });

    it('should not mutate original array', () => {
      const arr = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
      ];
      const original = [...arr];
      
      sortBy(arr, 'age');
      
      expect(arr).toEqual(original);
    });

    it('should handle numeric sorting correctly', () => {
      const arr = [
        { value: 100 },
        { value: 20 },
        { value: 3 },
      ];
      
      const result = sortBy(arr, 'value');
      
      expect(result[0].value).toBe(3);
      expect(result[1].value).toBe(20);
      expect(result[2].value).toBe(100);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle null and undefined gracefully in formatters', () => {
    expect(fmt.num(null)).toBe('—');
    expect(fmt.num(undefined)).toBe('—');
    expect(fmt.ms(null)).toBe('—');
    expect(fmt.ms(undefined)).toBe('—');
    expect(fmt.pct(null)).toBe('—');
    expect(fmt.pct(undefined)).toBe('—');
    expect(fmt.size(null)).toBe('—');
    expect(fmt.size(undefined)).toBe('—');
  });

  it('should handle zero values in formatters', () => {
    expect(fmt.num(0)).toBe('0');
    expect(fmt.ms(0)).toBe('0 ms');
    expect(fmt.pct(0)).toBe('0.0%');
    expect(fmt.size(0)).toBe('0.0 B');
  });

  it('should handle large numbers in formatters', () => {
    expect(fmt.num(1e9)).toContain('1,000,000,000');
    expect(fmt.ms(1e6)).toContain('ms');
    expect(fmt.size(1e12)).toContain('GB');
  });

  it('should handle negative numbers where applicable', () => {
    expect(fmt.num(-1000)).toBe('-1,000');
    expect(clamp(-100, -50, 50)).toBe(-50);
  });
});

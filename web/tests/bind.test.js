import { describe, it, expect, beforeEach } from 'vitest';
import { bind, bindTwoWay, format } from '../src/bind.js';

describe('bind', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('should bind simple values', () => {
    container.innerHTML = '<span data-bind="name"></span>';

    bind(container, { name: 'John' });

    expect(container.querySelector('[data-bind="name"]').textContent).toBe('John');
  });

  it('should bind nested values', () => {
    container.innerHTML = '<span data-bind="user.name"></span>';

    bind(container, { user: { name: 'Jane' } });

    expect(container.querySelector('[data-bind="user.name"]').textContent).toBe('Jane');
  });

  it('should handle missing values', () => {
    container.innerHTML = '<span data-bind="missing">default</span>';

    bind(container, {});

    expect(container.querySelector('[data-bind="missing"]').textContent).toBe('default');
  });

  it('should bind to input values', () => {
    container.innerHTML = '<input data-bind="name" />';

    bind(container, { name: 'Alice' });

    expect(container.querySelector('[data-bind="name"]').value).toBe('Alice');
  });

  it('should bind to image src', () => {
    container.innerHTML = '<img data-bind="avatar" />';

    bind(container, { avatar: 'https://example.com/avatar.jpg' });

    expect(container.querySelector('[data-bind="avatar"]').src).toBe(
      'https://example.com/avatar.jpg',
    );
  });

  it('should bind multiple elements', () => {
    container.innerHTML = `
      <span data-bind="name"></span>
      <span data-bind="age"></span>
      <span data-bind="city"></span>
    `;

    bind(container, { name: 'Bob', age: 30, city: 'NYC' });

    expect(container.querySelectorAll('[data-bind]').length).toBe(3);
    expect(container.querySelector('[data-bind="name"]').textContent).toBe('Bob');
    expect(container.querySelector('[data-bind="age"]').textContent).toBe('30');
    expect(container.querySelector('[data-bind="city"]').textContent).toBe('NYC');
  });

  describe('with formatters', () => {
    it('should format currency', () => {
      container.innerHTML = '<span data-bind="price" data-format="currency"></span>';

      bind(container, { price: 1234.56 });

      expect(container.querySelector('[data-bind="price"]').textContent).toBe('$1,234.56');
    });

    it('should format numbers', () => {
      container.innerHTML = '<span data-bind="count" data-format="number"></span>';

      bind(container, { count: 1234567 });

      expect(container.querySelector('[data-bind="count"]').textContent).toBe('1,234,567');
    });

    it('should format percentages', () => {
      container.innerHTML = '<span data-bind="rate" data-format="percent"></span>';

      bind(container, { rate: 0.456 });

      expect(container.querySelector('[data-bind="rate"]').textContent).toBe('45.60%');
    });

    it('should format milliseconds', () => {
      container.innerHTML = '<span data-bind="latency" data-format="ms"></span>';

      bind(container, { latency: 42 });

      expect(container.querySelector('[data-bind="latency"]').textContent).toBe('42 ms');
    });

    it('should format bytes', () => {
      container.innerHTML = '<span data-bind="size" data-format="size"></span>';

      bind(container, { size: 1024000 });

      expect(container.querySelector('[data-bind="size"]').textContent).toContain('KB');
    });
  });
});

describe('format', () => {
  it('should format currency', () => {
    expect(format(1234.56, 'currency')).toBe('$1,234.56');
  });

  it('should format percent', () => {
    expect(format(0.456, 'percent')).toBe('45.60%');
  });

  it('should format number', () => {
    expect(format(1234567, 'number')).toBe('1,234,567');
  });

  it('should format ms', () => {
    expect(format(42.7, 'ms')).toBe('43 ms');
  });

  it('should format size (bytes)', () => {
    expect(format(1024, 'size')).toBe('1.0 KB');
    expect(format(1024 * 1024, 'size')).toBe('1.0 MB');
    expect(format(1024 * 1024 * 1024, 'size')).toBe('1.0 GB');
  });

  it('should format timestamp', () => {
    const timestamp = new Date('2026-02-12T17:30:00').getTime();
    const result = format(timestamp, 'timestamp');
    expect(result).toContain('PM'); // Contains time
  });

  it('should handle null/undefined', () => {
    expect(format(null, 'currency')).toBe('—');
    expect(format(undefined, 'number')).toBe('—');
  });

  it('should return value for unknown format', () => {
    expect(format(42, 'unknown')).toBe(42);
  });
});

describe('bindTwoWay', () => {
  let container;
  let data;

  beforeEach(() => {
    container = document.createElement('div');
    data = { name: '' };
  });

  it('should bind input value to data', () => {
    container.innerHTML = '<input data-bind="name" />';

    bindTwoWay(container, data, 'name');

    const input = container.querySelector('[data-bind="name"]');
    input.value = 'Alice';
    input.dispatchEvent(new Event('input'));

    expect(data.name).toBe('Alice');
  });

  it('should call callback on change', () => {
    let callbackValue = null;

    container.innerHTML = '<input data-bind="name" />';

    bindTwoWay(container, data, 'name', (value) => {
      callbackValue = value;
    });

    const input = container.querySelector('[data-bind="name"]');
    input.value = 'Bob';
    input.dispatchEvent(new Event('input'));

    expect(callbackValue).toBe('Bob');
  });

  it('should sync initial value', () => {
    data.name = 'Charlie';

    container.innerHTML = '<input data-bind="name" />';

    bindTwoWay(container, data, 'name');

    expect(container.querySelector('[data-bind="name"]').value).toBe('Charlie');
  });

  it('should handle missing input gracefully', () => {
    container.innerHTML = '<div></div>';

    expect(() => {
      bindTwoWay(container, data, 'name');
    }).not.toThrow();
  });
});

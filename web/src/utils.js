// Shared utilities used across the application
// Pure functions with no side effects

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export function debounce(fn, delay = 80) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, delay = 100) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn(...args);
    }
  };
}

export const fmt = {
  num: (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString()),
  ms: (v) => (v === undefined || v === null ? '—' : `${Math.round(v)} ms`),
  pct: (v) => (v === undefined || v === null ? '—' : `${(Math.round(v * 10) / 10).toFixed(1)}%`),
  ts: (ms) => new Date(ms).toLocaleTimeString(),
  date: (ms) => new Date(ms).toLocaleDateString(),
  datetime: (ms) => new Date(ms).toLocaleString(),
  size: (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let b = bytes;
    let u = 0;
    while (b >= 1024 && u < units.length - 1) {
      b /= 1024;
      u += 1;
    }
    return `${b.toFixed(1)} ${units[u]}`;
  },
  currency: (v) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(v),
};

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const group = item[key];
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

export function uniq(arr) {
  return [...new Set(arr)];
}

export function sortBy(arr, key, desc = false) {
  return [...arr].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return desc ? 1 : -1;
    if (aVal > bVal) return desc ? -1 : 1;
    return 0;
  });
}

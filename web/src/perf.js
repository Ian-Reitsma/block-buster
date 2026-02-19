// Performance monitoring and budget enforcement
// Tracks metrics without external dependencies

class PerformanceMonitor {
  constructor() {
    this.marks = new Map();
    this.measures = [];
    this.maxMeasures = 100;
    this.budgets = {
      render: 16.67, // 60fps
      fetch: 300,
      interaction: 100,
    };
  }

  mark(name) {
    this.marks.set(name, performance.now());
  }

  measure(name, startMark, category = 'general') {
    const start = this.marks.get(startMark);
    if (!start) {
      console.warn(`[Perf] Start mark "${startMark}" not found`);
      return null;
    }

    const end = performance.now();
    const duration = end - start;

    const measure = {
      name,
      duration,
      category,
      timestamp: Date.now(),
    };

    this.measures.push(measure);
    if (this.measures.length > this.maxMeasures) {
      this.measures.shift();
    }

    // Check against budget
    const budget = this.budgets[category];
    if (budget && duration > budget) {
      console.warn(
        `[Perf] Budget exceeded: ${name} took ${duration.toFixed(2)}ms (budget: ${budget}ms)`,
      );
    }

    // Cleanup mark
    this.marks.delete(startMark);

    return measure;
  }

  setBudget(category, ms) {
    this.budgets[category] = ms;
  }

  getMeasures(category = null) {
    return category
      ? this.measures.filter((m) => m.category === category)
      : this.measures;
  }

  getStats(category = null) {
    const measures = this.getMeasures(category);
    if (measures.length === 0) return null;

    const durations = measures.map((m) => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count: measures.length,
      avg: sum / measures.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
    };
  }

  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }

  clear() {
    this.marks.clear();
    this.measures = [];
  }

  // Convenience wrappers
  async time(name, fn, category = 'general') {
    const markName = `${name}-start`;
    this.mark(markName);

    try {
      const result = await fn();
      this.measure(name, markName, category);
      return result;
    } catch (error) {
      this.measure(`${name}-error`, markName, category);
      throw error;
    }
  }

  // Report key web vitals
  getWebVitals() {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');

    return {
      // Navigation timing
      dns: navigation?.domainLookupEnd - navigation?.domainLookupStart,
      tcp: navigation?.connectEnd - navigation?.connectStart,
      ttfb: navigation?.responseStart - navigation?.requestStart,
      domLoad: navigation?.domContentLoadedEventEnd - navigation?.fetchStart,
      load: navigation?.loadEventEnd - navigation?.fetchStart,

      // Paint timing
      fcp: paint.find((p) => p.name === 'first-contentful-paint')?.startTime,
      lcp: this.getLCP(),
    };
  }

  getLCP() {
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    return lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : null;
  }
}

const perf = new PerformanceMonitor();
export default perf;

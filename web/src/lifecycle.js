// Component lifecycle manager with automatic cleanup
// Prevents memory leaks from orphaned listeners and intervals

class Component {
  constructor(name) {
    this.name = name;
    this.cleanup = [];
    this.mounted = false;
  }

  mount() {
    if (this.mounted) return;
    console.log(`[${this.name}] Mounting`);
    this.onMount();
    this.mounted = true;
  }

  unmount() {
    if (!this.mounted) return;
    console.log(`[${this.name}] Unmounting`);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.onUnmount();
    this.mounted = false;
  }

  // Sugar for common operations with auto-cleanup
  interval(fn, ms) {
    const id = setInterval(fn, ms);
    this.cleanup.push(() => clearInterval(id));
    return id;
  }

  timeout(fn, ms) {
    const id = setTimeout(fn, ms);
    this.cleanup.push(() => clearTimeout(id));
    return id;
  }

  listen(target, event, handler, options = null) {
    target.addEventListener(event, handler, options);
    this.cleanup.push(() => target.removeEventListener(event, handler, options));
  }

  subscribe(observable, key, handler) {
    const unsub = observable.subscribe(key, handler);
    this.cleanup.push(unsub);
    return unsub;
  }

  addCleanup(fn) {
    this.cleanup.push(fn);
  }

  // Override in subclass
  onMount() {}
  onUnmount() {}
}

export { Component };

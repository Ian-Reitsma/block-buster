// Event-driven observable store with change detection
// Zero dependencies, pure vanilla JS

class AppState {
  constructor() {
    this.state = {};
    this.listeners = {};
    this.history = [];
    this.maxHistory = 50;
  }

  set(key, value) {
    const prev = this.state[key];
    this.state[key] = value;

    // Only notify if changed (deep comparison)
    if (JSON.stringify(prev) !== JSON.stringify(value)) {
      this.recordChange(key, prev, value);
      this.notify(key, value, prev);
    }
  }

  get(key) {
    return this.state[key];
  }

  subscribe(key, callback) {
    if (!this.listeners[key]) this.listeners[key] = [];
    this.listeners[key].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[key] = this.listeners[key].filter((cb) => cb !== callback);
    };
  }

  notify(key, value, prev) {
    if (this.listeners[key]) {
      this.listeners[key].forEach((callback) => callback(value, prev));
    }
  }

  recordChange(key, prev, value) {
    this.history.push({
      key,
      prev,
      value,
      timestamp: Date.now(),
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getHistory(key = null) {
    return key ? this.history.filter((h) => h.key === key) : this.history;
  }

  reset() {
    const keys = Object.keys(this.state);
    keys.forEach((key) => {
      this.state[key] = undefined;
      this.notify(key, undefined, this.state[key]);
    });
  }

  clear() {
    this.state = {};
    this.listeners = {};
    this.history = [];
  }
}

const appState = new AppState();
export default appState;

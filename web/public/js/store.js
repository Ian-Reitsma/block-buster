/**
 * Block-Buster State Management
 * Lightweight state manager with cross-page persistence and reactive subscriptions
 * Zero dependencies, first-party implementation
 */

/**
 * @typedef {Object} StoreConfig
 * @property {boolean} [persist=true] - Enable sessionStorage persistence
 * @property {string} [storageKey='block-buster-state'] - Storage key
 * @property {number} [ttl=3600000] - Time-to-live in ms (1 hour default)
 */

/**
 * State store with reactive subscriptions and persistence
 */
export class Store {
  /**
   * @param {StoreConfig} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      persist: config.persist ?? true,
      storageKey: config.storageKey ?? 'block-buster-state',
      ttl: config.ttl ?? 3600000, // 1 hour
    };

    this.state = this.loadFromStorage();
    this.listeners = new Map();
    this.computedCache = new Map();

    // Cleanup expired entries on init
    this.cleanup();
  }

  /**
   * Get value by key
   * @param {string} key - State key (supports dot notation: 'governor.status')
   * @param {any} [defaultValue] - Default value if key doesn't exist
   * @returns {any} Value or default
   */
  get(key, defaultValue = undefined) {
    const entry = this.getEntry(key);
    if (!entry) return defaultValue;

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return defaultValue;
    }

    return entry.value;
  }

  /**
   * Set value by key
   * @param {string} key - State key (supports dot notation)
   * @param {any} value - Value to store
   * @param {number} [ttl] - Optional TTL override in ms
   */
  set(key, value, ttl) {
    const expiresAt = ttl ? Date.now() + ttl : Date.now() + this.config.ttl;

    this.setEntry(key, {
      value,
      updatedAt: Date.now(),
      expiresAt,
    });

    this.persist();
    this.notify(key, value);
    this.invalidateComputed(key);
  }

  /**
   * Update nested value (for objects)
   * @param {string} key - State key
   * @param {Function} updater - Function that receives current value and returns new value
   */
  update(key, updater) {
    const current = this.get(key);
    const updated = updater(current);
    this.set(key, updated);
  }

  /**
   * Delete value by key
   * @param {string} key - State key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    const parts = key.split('.');
    let current = this.state;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) return false;
      current = current[parts[i]];
    }

    const lastKey = parts[parts.length - 1];
    if (lastKey in current) {
      delete current[lastKey];
      this.persist();
      this.notify(key, undefined);
      this.invalidateComputed(key);
      return true;
    }

    return false;
  }

  /**
   * Check if key exists
   * @param {string} key - State key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Clear all state
   */
  clear() {
    this.state = {};
    this.computedCache.clear();
    this.persist();
    this.notifyAll();
  }

  /**
   * Subscribe to state changes
   * @param {string|string[]} keys - Key(s) to watch
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(keys, callback) {
    const keyArray = Array.isArray(keys) ? keys : [keys];

    keyArray.forEach((key) => {
      if (!this.listeners.has(key)) {
        this.listeners.set(key, []);
      }
      this.listeners.get(key).push(callback);
    });

    // Return unsubscribe function
    return () => {
      keyArray.forEach((key) => {
        const callbacks = this.listeners.get(key);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index > -1) callbacks.splice(index, 1);
        }
      });
    };
  }

  /**
   * Computed value (cached until dependencies change)
   * @param {string} key - Cache key
   * @param {string[]} dependencies - Keys to watch
   * @param {Function} computer - Function that computes value
   * @returns {any} Computed value
   */
  computed(key, dependencies, computer) {
    // Check cache
    if (this.computedCache.has(key)) {
      const cached = this.computedCache.get(key);
      const depsChanged = dependencies.some(
        (dep) => this.get(dep) !== cached.deps[dep]
      );
      if (!depsChanged) return cached.value;
    }

    // Compute new value
    const depValues = dependencies.reduce((acc, dep) => {
      acc[dep] = this.get(dep);
      return acc;
    }, {});

    const value = computer(depValues);

    // Cache result
    this.computedCache.set(key, { value, deps: depValues });

    return value;
  }

  /**
   * Get all state (for debugging)
   * @returns {Object} Current state
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get state metadata (timestamps, etc.)
   * @param {string} key - State key
   * @returns {Object|null} Metadata
   */
  getMetadata(key) {
    const entry = this.getEntry(key);
    if (!entry) return null;

    return {
      updatedAt: entry.updatedAt,
      expiresAt: entry.expiresAt,
      age: Date.now() - entry.updatedAt,
      ttl: entry.expiresAt - Date.now(),
    };
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Get entry with metadata
   * @private
   */
  getEntry(key) {
    const parts = key.split('.');
    let current = this.state;

    for (const part of parts) {
      if (!current || !(part in current)) return null;
      current = current[part];
    }

    return current;
  }

  /**
   * Set entry with metadata
   * @private
   */
  setEntry(key, entry) {
    const parts = key.split('.');
    let current = this.state;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = entry;
  }

  /**
   * Notify listeners
   * @private
   */
  notify(key, value) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(value, key);
        } catch (error) {
          console.error(`Error in store listener for ${key}:`, error);
        }
      });
    }

    // Notify wildcard listeners (*)
    const wildcardCallbacks = this.listeners.get('*');
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach((callback) => {
        try {
          callback(value, key);
        } catch (error) {
          console.error('Error in wildcard store listener:', error);
        }
      });
    }
  }

  /**
   * Notify all listeners
   * @private
   */
  notifyAll() {
    this.listeners.forEach((callbacks, key) => {
      const value = this.get(key);
      callbacks.forEach((callback) => {
        try {
          callback(value, key);
        } catch (error) {
          console.error(`Error in store listener for ${key}:`, error);
        }
      });
    });
  }

  /**
   * Persist to sessionStorage
   * @private
   */
  persist() {
    if (!this.config.persist || typeof sessionStorage === 'undefined') return;

    try {
      sessionStorage.setItem(this.config.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to persist state:', error);
    }
  }

  /**
   * Load from sessionStorage
   * @private
   */
  loadFromStorage() {
    if (!this.config.persist || typeof sessionStorage === 'undefined') return {};

    try {
      const stored = sessionStorage.getItem(this.config.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn('Failed to load state from storage:', error);
      return {};
    }
  }

  /**
   * Cleanup expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    const traverse = (obj, path = []) => {
      Object.keys(obj).forEach((key) => {
        const fullPath = [...path, key].join('.');
        const value = obj[key];

        if (value && typeof value === 'object') {
          if (value.expiresAt && now > value.expiresAt) {
            delete obj[key];
          } else if (value.value !== undefined) {
            // This is an entry, skip
          } else {
            // Recurse
            traverse(value, [...path, key]);
          }
        }
      });
    };

    traverse(this.state);
    this.persist();
  }

  /**
   * Invalidate computed cache for key
   * @private
   */
  invalidateComputed(key) {
    // Invalidate all computed values that depend on this key
    const toDelete = [];
    this.computedCache.forEach((cached, cacheKey) => {
      if (key in cached.deps) {
        toDelete.push(cacheKey);
      }
    });
    toDelete.forEach((k) => this.computedCache.delete(k));
  }
}

/**
 * Create store with config
 * @param {StoreConfig} config - Configuration
 * @returns {Store}
 */
export function createStore(config) {
  return new Store(config);
}

/**
 * Default store instance
 */
export const store = new Store();

/**
 * Utility: Create namespaced store accessor
 * @param {string} namespace - Namespace prefix
 * @returns {Object} Namespaced store methods
 */
export function createNamespace(namespace) {
  return {
    get: (key, defaultValue) => store.get(`${namespace}.${key}`, defaultValue),
    set: (key, value, ttl) => store.set(`${namespace}.${key}`, value, ttl),
    delete: (key) => store.delete(`${namespace}.${key}`),
    has: (key) => store.has(`${namespace}.${key}`),
    subscribe: (key, callback) => store.subscribe(`${namespace}.${key}`, callback),
  };
}

// Expose to window for non-module usage
if (typeof window !== 'undefined') {
  window.Store = Store;
  window.store = store;
  window.createStore = createStore;
  window.createNamespace = createNamespace;
}

// Runtime feature flags for gradual rollouts and A/B testing
// Supports browser detection and localStorage overrides

class FeatureFlags {
  constructor() {
    this.flags = {
      websockets: this.checkWebSocketSupport(),
      serviceWorker: 'serviceWorker' in navigator,
      webp: this.checkWebPSupport(),
      indexedDB: 'indexedDB' in window,
      // Override from localStorage (for testing)
      ...this.getLocalOverrides(),
    };
  }

  checkWebSocketSupport() {
    return 'WebSocket' in window && !this.getLocalOverride('disableWebSockets');
  }

  checkWebPSupport() {
    const canvas = document.createElement('canvas');
    return canvas.toDataURL('image/webp').indexOf('image/webp') === 0;
  }

  getLocalOverrides() {
    try {
      const overrides = localStorage.getItem('featureFlags');
      return overrides ? JSON.parse(overrides) : {};
    } catch {
      return {};
    }
  }

  getLocalOverride(key) {
    try {
      const overrides = localStorage.getItem('featureFlags');
      return overrides ? JSON.parse(overrides)[key] : undefined;
    } catch {
      return undefined;
    }
  }

  isEnabled(flag) {
    return this.flags[flag] ?? false;
  }

  enable(flag) {
    this.flags[flag] = true;
    this.saveOverrides();
  }

  disable(flag) {
    this.flags[flag] = false;
    this.saveOverrides();
  }

  saveOverrides() {
    try {
      localStorage.setItem('featureFlags', JSON.stringify(this.flags));
    } catch {
      console.warn('[Features] Failed to save overrides to localStorage');
    }
  }

  getAll() {
    return { ...this.flags };
  }
}

const features = new FeatureFlags();
export default features;

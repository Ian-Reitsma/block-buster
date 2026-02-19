import { describe, it, expect, beforeEach } from 'vitest';
import features from '../src/features.js';

describe('FeatureFlags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('built-in feature detection', () => {
    it('should detect WebSocket support', () => {
      const hasWebSocket = features.isEnabled('websockets');
      expect(typeof hasWebSocket).toBe('boolean');
    });

    it('should detect ServiceWorker support', () => {
      const hasServiceWorker = features.isEnabled('serviceWorker');
      expect(typeof hasServiceWorker).toBe('boolean');
    });

    it('should detect IndexedDB support', () => {
      const hasIndexedDB = features.isEnabled('indexedDB');
      expect(typeof hasIndexedDB).toBe('boolean');
    });
  });

  describe('enable and disable', () => {
    it('should enable a feature', () => {
      features.enable('testFeature');
      expect(features.isEnabled('testFeature')).toBe(true);
    });

    it('should disable a feature', () => {
      features.enable('testFeature');
      features.disable('testFeature');
      expect(features.isEnabled('testFeature')).toBe(false);
    });

    it('should persist to localStorage', () => {
      features.enable('testFeature');

      const stored = JSON.parse(localStorage.getItem('featureFlags'));
      expect(stored.testFeature).toBe(true);
    });

    it('should restore from localStorage', async () => {
      localStorage.setItem('featureFlags', JSON.stringify({ testFeature: true }));

      // Create new instance to test restoration
      const { default: newFeatures } = await import('../src/features.js?t=' + Date.now());
      expect(newFeatures.isEnabled('testFeature')).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('should return false for unknown features', () => {
      expect(features.isEnabled('unknownFeature')).toBe(false);
    });

    it('should return boolean for known features', () => {
      features.enable('knownFeature');
      expect(typeof features.isEnabled('knownFeature')).toBe('boolean');
    });
  });

  describe('getAll', () => {
    it('should return all feature flags', () => {
      const allFlags = features.getAll();
      expect(typeof allFlags).toBe('object');
      expect(allFlags).toHaveProperty('websockets');
      expect(allFlags).toHaveProperty('serviceWorker');
    });

    it('should include custom flags', () => {
      features.enable('customFlag');
      const allFlags = features.getAll();
      expect(allFlags).toHaveProperty('customFlag');
      expect(allFlags.customFlag).toBe(true);
    });

    it('should return a copy', () => {
      const allFlags = features.getAll();
      allFlags.tamperedFlag = true;

      expect(features.isEnabled('tamperedFlag')).toBe(false);
    });
  });

  describe('localStorage errors', () => {
    it('should handle localStorage failures gracefully', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error('localStorage quota exceeded');
      };

      expect(() => {
        features.enable('testFeature');
      }).not.toThrow();

      localStorage.setItem = originalSetItem;
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('featureFlags', 'invalid-json{');

      expect(() => {
        features.getAll();
      }).not.toThrow();
    });
  });
});

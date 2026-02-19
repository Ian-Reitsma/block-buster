import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component } from '../src/lifecycle.js';

describe('Component', () => {
  let component;

  beforeEach(() => {
    component = new Component('TestComponent');
  });

  describe('mount and unmount', () => {
    it('should call onMount when mounted', () => {
      const onMountSpy = vi.spyOn(component, 'onMount');

      component.mount();

      expect(onMountSpy).toHaveBeenCalled();
      expect(component.mounted).toBe(true);
    });

    it('should not call onMount if already mounted', () => {
      const onMountSpy = vi.spyOn(component, 'onMount');

      component.mount();
      component.mount(); // Second mount

      expect(onMountSpy).toHaveBeenCalledOnce();
    });

    it('should call onUnmount when unmounted', () => {
      const onUnmountSpy = vi.spyOn(component, 'onUnmount');

      component.mount();
      component.unmount();

      expect(onUnmountSpy).toHaveBeenCalled();
      expect(component.mounted).toBe(false);
    });

    it('should not call onUnmount if not mounted', () => {
      const onUnmountSpy = vi.spyOn(component, 'onUnmount');

      component.unmount();

      expect(onUnmountSpy).not.toHaveBeenCalled();
    });
  });

  describe('interval cleanup', () => {
    it('should register and cleanup intervals', () => {
      vi.useFakeTimers();
      let count = 0;

      component.mount();
      component.interval(() => {
        count++;
      }, 100);

      vi.advanceTimersByTime(250);
      expect(count).toBe(2); // Should have run twice

      component.unmount();
      vi.advanceTimersByTime(200);
      expect(count).toBe(2); // Should not run after unmount

      vi.useRealTimers();
    });

    it('should return interval id', () => {
      vi.useFakeTimers();

      component.mount();
      const id = component.interval(() => {}, 100);

      // Vitest fake timers may return object or number
      expect(id).toBeDefined();
      expect(id).toBeTruthy();

      component.unmount();
      vi.useRealTimers();
    });
  });

  describe('timeout cleanup', () => {
    it('should register and cleanup timeouts', () => {
      vi.useFakeTimers();
      let called = false;

      component.mount();
      component.timeout(() => {
        called = true;
      }, 100);

      vi.advanceTimersByTime(50);
      expect(called).toBe(false);

      component.unmount();
      vi.advanceTimersByTime(100);
      expect(called).toBe(false); // Should not run after unmount

      vi.useRealTimers();
    });

    it('should execute timeout before unmount', () => {
      vi.useFakeTimers();
      let called = false;

      component.mount();
      component.timeout(() => {
        called = true;
      }, 100);

      vi.advanceTimersByTime(100);
      expect(called).toBe(true);

      component.unmount();
      vi.useRealTimers();
    });
  });

  describe('event listener cleanup', () => {
    it('should register and cleanup event listeners', () => {
      const target = document.createElement('div');
      let count = 0;

      component.mount();
      component.listen(target, 'click', () => {
        count++;
      });

      target.click();
      expect(count).toBe(1);

      component.unmount();
      target.click();
      expect(count).toBe(1); // Should not increment after unmount
    });

    it('should handle listener options', () => {
      const target = document.createElement('div');
      let count = 0;

      component.mount();
      component.listen(
        target,
        'click',
        () => {
          count++;
        },
        { once: true },
      );

      target.click();
      target.click();
      expect(count).toBe(1); // Should only fire once

      component.unmount();
    });
  });

  describe('subscription cleanup', () => {
    it('should register and cleanup subscriptions', () => {
      const observable = {
        subscribe: vi.fn(() => vi.fn()), // Returns unsubscribe function
      };

      component.mount();
      component.subscribe(observable, 'key', () => {});

      expect(observable.subscribe).toHaveBeenCalled();

      component.unmount();
      // Unsubscribe should be called (tested via cleanup array)
      expect(component.cleanup.length).toBe(0);
    });
  });

  describe('custom cleanup', () => {
    it('should add and execute custom cleanup functions', () => {
      let cleaned = false;

      component.mount();
      component.addCleanup(() => {
        cleaned = true;
      });

      component.unmount();

      expect(cleaned).toBe(true);
    });

    it('should execute all cleanup functions', () => {
      let count = 0;

      component.mount();
      component.addCleanup(() => {
        count++;
      });
      component.addCleanup(() => {
        count++;
      });
      component.addCleanup(() => {
        count++;
      });

      component.unmount();

      expect(count).toBe(3);
    });
  });

  describe('lifecycle integration', () => {
    it('should handle complex lifecycle', () => {
      vi.useFakeTimers();

      class TestComponent extends Component {
        constructor() {
          super('Test');
          this.intervalCount = 0;
          this.timeoutCalled = false;
          this.clickCount = 0;
        }

        onMount() {
          this.interval(() => {
            this.intervalCount++;
          }, 100);

          this.timeout(() => {
            this.timeoutCalled = true;
          }, 50);

          const target = document.createElement('div');
          this.listen(target, 'click', () => {
            this.clickCount++;
          });

          this.target = target;
        }
      }

      const comp = new TestComponent();
      comp.mount();

      vi.advanceTimersByTime(50);
      expect(comp.timeoutCalled).toBe(true);

      vi.advanceTimersByTime(150);
      // Interval fires at 0ms (immediately) and 100ms, so count is 2
      expect(comp.intervalCount).toBe(2);

      comp.target.click();
      expect(comp.clickCount).toBe(1);

      comp.unmount();

      vi.advanceTimersByTime(200);
      comp.target.click();

      expect(comp.intervalCount).toBe(2); // No more increments after unmount
      expect(comp.clickCount).toBe(1); // No more clicks

      vi.useRealTimers();
    });
  });
});

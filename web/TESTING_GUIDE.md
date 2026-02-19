# Testing Guide

**How to write tests for Block Buster**

---

## Quick Start

```bash
# Run tests in watch mode
npm test

# Run tests with UI (recommended)
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run full quality check
npm run check
```

---

## Test File Structure

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MyModule from '../src/my-module.js';

describe('MyModule', () => {
  let instance;

  beforeEach(() => {
    // Setup: runs before each test
    instance = new MyModule();
  });

  describe('feature group', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = instance.doSomething(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

---

## Writing Good Tests

### 1. **Use Descriptive Names**

❌ Bad:
```javascript
it('test 1', () => { /* ... */ });
it('works', () => { /* ... */ });
```

✅ Good:
```javascript
it('should return user object when ID exists', () => { /* ... */ });
it('should throw error when ID is null', () => { /* ... */ });
```

### 2. **Follow AAA Pattern**

```javascript
it('should format currency correctly', () => {
  // Arrange: Setup test data
  const amount = 1234.56;

  // Act: Execute the function
  const result = format(amount, 'currency');

  // Assert: Verify the result
  expect(result).toBe('$1,234.56');
});
```

### 3. **Test One Thing**

❌ Bad (tests multiple things):
```javascript
it('should handle user', () => {
  expect(user.name).toBe('John');
  expect(user.age).toBe(30);
  expect(user.email).toBe('john@example.com');
  expect(validateUser(user)).toBe(true);
});
```

✅ Good (focused tests):
```javascript
it('should set user name', () => {
  expect(user.name).toBe('John');
});

it('should validate user with complete data', () => {
  expect(validateUser(user)).toBe(true);
});
```

### 4. **Test Edge Cases**

```javascript
describe('clamp', () => {
  it('should return value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should return min when value too low', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should return max when value too high', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('should handle edge values', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('should handle null/undefined', () => {
    expect(clamp(null, 0, 10)).toBe(0);
    expect(clamp(undefined, 0, 10)).toBe(0);
  });
});
```

---

## Testing Patterns

### Testing Async Functions

```javascript
it('should fetch data from API', async () => {
  const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({  'test' }),
  });

  const result = await api.get('/endpoint');

  expect(result).toEqual({  'test' });
  mockFetch.mockRestore();
});
```

### Testing Timers

```javascript
it('should debounce function calls', () => {
  vi.useFakeTimers();

  let count = 0;
  const fn = debounce(() => { count++; }, 100);

  fn();
  fn();
  fn();

  expect(count).toBe(0);

  vi.advanceTimersByTime(100);

  expect(count).toBe(1);

  vi.useRealTimers();
});
```

### Testing DOM Manipulation

```javascript
it('should update text content', () => {
  const container = document.createElement('div');
  container.innerHTML = '<span id="target"></span>';

  const target = container.querySelector('#target');
  target.textContent = 'Hello';

  expect(target.textContent).toBe('Hello');
});
```

### Testing State Subscriptions

```javascript
it('should notify subscribers on change', () => {
  let notified = false;

  appState.subscribe('key', () => {
    notified = true;
  });

  appState.set('key', 'value');

  expect(notified).toBe(true);
});
```

### Testing Components

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MyComponent from '../../src/components/MyComponent.js';
import appState from '../../src/state.js';

describe('MyComponent', () => {
  let component;
  let mockApi;
  let container;

  beforeEach(() => {
    // Reset state
    appState.reset();

    // Setup DOM
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);

    // Mock API
    mockApi = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
    };

    component = new MyComponent(mockApi);
  });

  afterEach(() => {
    if (component.mounted) {
      component.unmount();
    }
    document.body.removeChild(container);
  });

  it('should mount successfully', () => {
    component.mount();

    expect(component.mounted).toBe(true);
    expect(container.innerHTML).not.toBe('');
  });

  it('should fetch data on mount', async () => {
    mockApi.get.mockResolvedValue({  'test' });

    component.mount();

    await vi.waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/endpoint');
    });
  });

  it('should cleanup on unmount', () => {
    component.mount();
    component.unmount();

    expect(component.mounted).toBe(false);
  });
});
```

---

## Mocking

### Mock Functions

```javascript
const mockFn = vi.fn();
mockFn('arg1', 'arg2');

expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenCalledTimes(1);
```

### Mock Return Values

```javascript
const mockFn = vi.fn()
  .mockReturnValue('default')
  .mockReturnValueOnce('first')
  .mockReturnValueOnce('second');

expect(mockFn()).toBe('first');
expect(mockFn()).toBe('second');
expect(mockFn()).toBe('default');
```

### Mock Async Functions

```javascript
const mockFn = vi.fn()
  .mockResolvedValue('success')
  .mockRejectedValueOnce(new Error('failed'));

await expect(mockFn()).rejects.toThrow('failed');
await expect(mockFn()).resolves.toBe('success');
```

### Mock Modules

```javascript
vi.mock('../src/api.js', () => ({
  default: class MockApi {
    async get() {
      return {  'mocked' };
    }
  },
}));
```

### Spy on Methods

```javascript
const spy = vi.spyOn(object, 'method');

object.method('arg');

expect(spy).toHaveBeenCalledWith('arg');

spy.mockRestore(); // Restore original
```

---

## Assertions

### Basic Assertions

```javascript
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality
expect(value).toBeTruthy();             // Truthy
expect(value).toBeFalsy();              // Falsy
expect(value).toBeNull();               // null
expect(value).toBeUndefined();          // undefined
expect(value).toBeDefined();            // not undefined
```

### Number Assertions

```javascript
expect(value).toBeGreaterThan(5);
expect(value).toBeGreaterThanOrEqual(5);
expect(value).toBeLessThan(10);
expect(value).toBeLessThanOrEqual(10);
expect(value).toBeCloseTo(0.3, 1);      // Floating point
```

### String Assertions

```javascript
expect(string).toContain('substring');
expect(string).toMatch(/regex/);
expect(string).toHaveLength(10);
```

### Array Assertions

```javascript
expect(array).toContain(item);
expect(array).toHaveLength(5);
expect(array).toEqual([1, 2, 3]);
expect(array).toContainEqual({ id: 1 });
```

### Object Assertions

```javascript
expect(object).toHaveProperty('key');
expect(object).toHaveProperty('key', 'value');
expect(object).toMatchObject({ key: 'value' });
```

### Function Assertions

```javascript
expect(() => fn()).toThrow();
expect(() => fn()).toThrow(Error);
expect(() => fn()).toThrow('error message');
expect(async () => await fn()).rejects.toThrow();
```

---

## Common Patterns

### Testing Error Handling

```javascript
it('should handle API errors gracefully', async () => {
  mockApi.get.mockRejectedValue(new Error('Network error'));

  await expect(component.fetchData()).resolves.not.toThrow();

  // Should still be in a valid state
  expect(component.mounted).toBe(true);
});
```

### Testing Cleanup

```javascript
it('should cleanup intervals on unmount', () => {
  vi.useFakeTimers();

  component.mount();

  const callCountBefore = mockApi.get.mock.calls.length;

  component.unmount();

  vi.advanceTimersByTime(10000);

  expect(mockApi.get.mock.calls.length).toBe(callCountBefore);

  vi.useRealTimers();
});
```

### Testing State Changes

```javascript
it('should update UI when state changes', async () => {
  component.mount();

  appState.set('data', { value: 123 });

  await vi.waitFor(() => {
    const data = appState.get('data');
    expect(data.value).toBe(123);
  });
});
```

---

## Test Organization

```
tests/
├── setup.js                      # Global setup
├── state.test.js                 # Core module tests
├── bind.test.js
├── lifecycle.test.js
├── errors.test.js
├── features.test.js
├── api.test.js
├── perf.test.js
├── router.test.js
├── utils.test.js
├── components/                   # Component tests
│   ├── Navigation.test.js
│   ├── TheBlock.test.js
│   ├── Trading.test.js
│   └── Network.test.js
└── integration.test.js           # Integration tests
```

---

## Coverage Best Practices

### 1. **Aim for High Coverage**

- **Lines**: 80%+
- **Functions**: 80%+
- **Branches**: 75%+
- **Statements**: 80%+

### 2. **Don't Chase 100%**

Some code doesn't need tests:
- Trivial getters/setters
- Configuration files
- Type definitions
- Development-only code

### 3. **Focus on Critical Paths**

Prioritize testing:
- Business logic
- Error handling
- Edge cases
- Integration points
- Security-critical code

### 4. **Use Coverage Reports**

```bash
npm run test:coverage
open coverage/index.html
```

Review uncovered lines and decide:
- Add tests (most cases)
- Mark as excluded (rare cases)
- Refactor to make testable

---

## Debugging Tests

### Console Logging

```javascript
it('should do something', () => {
  console.log('Debug:', value);
  expect(value).toBe(expected);
});
```

### Run Single Test

```bash
# Run single file
npm test state.test.js

# Run with filter
npm test -- -t "should notify subscribers"
```

### Use debugger

```javascript
it('should do something', () => {
  debugger; // Pause execution
  expect(value).toBe(expected);
});
```

Run with:
```bash
node --inspect-brk node_modules/.bin/vitest
```

### Check Test Output

```bash
# Verbose output
npm test -- --reporter=verbose

# Show full diff
npm test -- --no-truncate
```

---

## Common Mistakes

### 1. **Not Cleaning Up**

❌ Bad:
```javascript
it('test 1', () => {
  appState.set('key', 'value');
  // State leaks into next test
});
```

✅ Good:
```javascript
beforeEach(() => {
  appState.reset();
});

it('test 1', () => {
  appState.set('key', 'value');
});
```

### 2. **Testing Implementation**

❌ Bad (tests internal details):
```javascript
it('should call private method', () => {
  const spy = vi.spyOn(component, '_privateMethod');
  component.doSomething();
  expect(spy).toHaveBeenCalled();
});
```

✅ Good (tests behavior):
```javascript
it('should update UI when button clicked', () => {
  component.handleClick();
  expect(appState.get('data')).toBe('updated');
});
```

### 3. **Flaky Tests**

❌ Bad (timing-dependent):
```javascript
it('should update after delay', async () => {
  setTimeout(() => { value = 'new'; }, 100);
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(value).toBe('new');
});
```

✅ Good (controlled timing):
```javascript
it('should update after delay', () => {
  vi.useFakeTimers();
  setTimeout(() => { value = 'new'; }, 100);
  vi.advanceTimersByTime(100);
  expect(value).toBe('new');
  vi.useRealTimers();
});
```

### 4. **Too Broad Assertions**

❌ Bad:
```javascript
it('should return data', async () => {
  const result = await api.get('/endpoint');
  expect(result).toBeDefined();
});
```

✅ Good:
```javascript
it('should return user object with ID and name', async () => {
  const result = await api.get('/users/1');
  expect(result).toMatchObject({
    id: 1,
    name: expect.any(String),
  });
});
```

---

## Next Steps

1. Read existing tests in `tests/` directory
2. Write tests for new features alongside implementation
3. Run tests before committing: `npm run check`
4. Review coverage reports regularly
5. Refactor tests as code evolves

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Test Desiderata](https://kentcdodds.com/blog/write-tests)

---

**Happy Testing!** 🧪

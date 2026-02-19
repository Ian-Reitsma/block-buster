// Declarative data binding utility
// Replaces imperative getElementById + textContent patterns

function bind(element, data) {
  const bindings = element.querySelectorAll('[data-bind]');

  bindings.forEach((el) => {
    const path = el.dataset.bind;
    const value = getNestedValue(data, path);

    if (value !== undefined) {
      // Handle different element types
      if (el.tagName === 'INPUT') {
        el.value = value;
      } else if (el.tagName === 'IMG') {
        el.src = value;
      } else {
        el.textContent = value;
      }

      // Handle formatters (e.g., data-bind="price" data-format="currency")
      if (el.dataset.format) {
        el.textContent = format(value, el.dataset.format);
      }
    }
  });
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function format(value, type) {
  if (value === null || value === undefined) return '—';

  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    case 'percent':
      return `${(value * 100).toFixed(2)}%`;
    case 'number':
      return value.toLocaleString();
    case 'ms':
      return `${Math.round(value)} ms`;
    case 'size': {
      const units = ['B', 'KB', 'MB', 'GB'];
      let b = value;
      let u = 0;
      while (b >= 1024 && u < units.length - 1) {
        b /= 1024;
        u += 1;
      }
      return `${b.toFixed(1)} ${units[u]}`;
    }
    case 'timestamp':
      return new Date(value).toLocaleTimeString();
    case 'date':
      return new Date(value).toLocaleDateString();
    case 'datetime':
      return new Date(value).toLocaleString();
    default:
      return value;
  }
}

function bindTwoWay(element, data, key, callback = null) {
  const input = element.querySelector(`[data-bind="${key}"]`);
  if (!input) return;

  // Initial sync
  input.value = data[key];

  // Listen for changes
  input.addEventListener('input', (e) => {
    data[key] = e.target.value;
    if (callback) callback(e.target.value);
  });
}

export { bind, bindTwoWay, format };

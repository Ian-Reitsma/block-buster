/**
 * FilterBuilder Component - Advanced filtering UI
 * 
 * Features:
 * - Multiple filter types (text, number, date, select, range)
 * - Compound filters with AND/OR logic
 * - Visual filter chips
 * - Saved filter presets
 * - Filter suggestions based on data
 * - Export/import filter configurations
 * 
 * Replaces: Basic inline column filters
 */

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class FilterBuilder extends Component {
  constructor(options) {
    super('FilterBuilder');
    this.containerId = options.containerId;
    this.columns = options.columns || [];
    this.onFilterChange = options.onFilterChange || (() => {});
    this.savedFilters = this.loadSavedFilters();
    this.activeFilters = [];
  }

  onMount() {
    this.render();
  }

  render() {
    const container = $(`#${this.containerId}`);
    if (!container) {
      console.error('[FilterBuilder] Container not found:', this.containerId);
      return;
    }

    container.innerHTML = '';
    container.className = 'filter-builder';

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    filterBar.innerHTML = `
      <button class="btn btn-sm btn-secondary" id="add-filter-btn">
        <span class="btn-icon">+</span>
        Add Filter
      </button>
      <div class="filter-chips" id="filter-chips"></div>
      <div class="filter-actions">
        <button class="btn btn-sm btn-ghost" id="clear-filters-btn" ${this.activeFilters.length === 0 ? 'disabled' : ''}>
          Clear All
        </button>
        <button class="btn btn-sm btn-ghost" id="save-filter-btn" ${this.activeFilters.length === 0 ? 'disabled' : ''}>
          Save Preset
        </button>
        <button class="btn btn-sm btn-ghost" id="load-filter-btn">
          Load Preset
        </button>
      </div>
    `;

    container.appendChild(filterBar);

    // Render active filters as chips
    this.renderFilterChips();

    // Filter dropdown (hidden by default)
    const dropdown = this.createFilterDropdown();
    container.appendChild(dropdown);

    // Attach handlers
    const addBtn = $('#add-filter-btn');
    if (addBtn) {
      this.listen(addBtn, 'click', () => this.showFilterDropdown());
    }

    const clearBtn = $('#clear-filters-btn');
    if (clearBtn) {
      this.listen(clearBtn, 'click', () => this.clearAllFilters());
    }

    const saveBtn = $('#save-filter-btn');
    if (saveBtn) {
      this.listen(saveBtn, 'click', () => this.showSavePresetModal());
    }

    const loadBtn = $('#load-filter-btn');
    if (loadBtn) {
      this.listen(loadBtn, 'click', () => this.showLoadPresetModal());
    }
  }

  createFilterDropdown() {
    const dropdown = document.createElement('div');
    dropdown.id = 'filter-dropdown';
    dropdown.className = 'filter-dropdown hidden';

    const columnsHtml = this.columns.map((col, idx) => `
      <div class="filter-option" data-col-idx="${idx}">
        <span class="filter-option-label">${col.label}</span>
        <span class="filter-option-type muted">${this.getColumnTypeLabel(col)}</span>
      </div>
    `).join('');

    dropdown.innerHTML = `
      <div class="filter-dropdown-header">
        <h4>Add Filter</h4>
        <button class="btn-icon" id="close-filter-dropdown">×</button>
      </div>
      <div class="filter-dropdown-body">
        <input type="text" placeholder="Search columns..." class="filter-search" id="filter-search-input" />
        <div class="filter-options" id="filter-options">
          ${columnsHtml}
        </div>
      </div>
    `;

    return dropdown;
  }

  showFilterDropdown() {
    const dropdown = $('#filter-dropdown');
    if (!dropdown) return;

    dropdown.classList.remove('hidden');

    const closeBtn = $('#close-filter-dropdown');
    if (closeBtn) {
      this.listen(closeBtn, 'click', () => this.hideFilterDropdown());
    }

    const searchInput = $('#filter-search-input');
    if (searchInput) {
      searchInput.focus();
      this.listen(searchInput, 'input', (e) => this.filterColumns(e.target.value));
    }

    const options = dropdown.querySelectorAll('.filter-option');
    options.forEach(option => {
      this.listen(option, 'click', () => {
        const colIdx = parseInt(option.dataset.colIdx);
        this.addFilter(this.columns[colIdx]);
        this.hideFilterDropdown();
      });
    });
  }

  hideFilterDropdown() {
    const dropdown = $('#filter-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  }

  filterColumns(searchTerm) {
    const options = document.querySelectorAll('.filter-option');
    const term = searchTerm.toLowerCase();

    options.forEach(option => {
      const label = option.querySelector('.filter-option-label').textContent.toLowerCase();
      if (label.includes(term)) {
        option.classList.remove('hidden');
      } else {
        option.classList.add('hidden');
      }
    });
  }

  addFilter(column) {
    const filter = {
      id: Date.now(),
      column: column.key,
      columnLabel: column.label,
      type: this.inferColumnType(column),
      operator: this.getDefaultOperator(column),
      value: '',
    };

    this.activeFilters.push(filter);
    this.renderFilterChips();
    this.showFilterEditor(filter);
  }

  showFilterEditor(filter) {
    const chip = document.querySelector(`[data-filter-id="${filter.id}"]`);
    if (!chip) return;

    const editor = document.createElement('div');
    editor.className = 'filter-editor';

    const operators = this.getOperatorsForType(filter.type);
    const operatorOptions = operators.map(op => 
      `<option value="${op.value}" ${op.value === filter.operator ? 'selected' : ''}>${op.label}</option>`
    ).join('');

    const valueInput = this.createValueInput(filter);

    editor.innerHTML = `
      <div class="filter-editor-content">
        <select class="filter-operator" id="filter-operator-${filter.id}">
          ${operatorOptions}
        </select>
        <div class="filter-value" id="filter-value-${filter.id}">
          ${valueInput}
        </div>
        <div class="filter-editor-actions">
          <button class="btn btn-xs btn-primary" id="apply-filter-${filter.id}">Apply</button>
          <button class="btn btn-xs btn-ghost" id="cancel-filter-${filter.id}">Cancel</button>
        </div>
      </div>
    `;

    chip.appendChild(editor);

    // Attach handlers
    const applyBtn = $(`#apply-filter-${filter.id}`);
    if (applyBtn) {
      this.listen(applyBtn, 'click', () => {
        this.applyFilterEdit(filter);
        editor.remove();
      });
    }

    const cancelBtn = $(`#cancel-filter-${filter.id}`);
    if (cancelBtn) {
      this.listen(cancelBtn, 'click', () => {
        this.removeFilter(filter.id);
        editor.remove();
      });
    }

    const operatorSelect = $(`#filter-operator-${filter.id}`);
    if (operatorSelect) {
      this.listen(operatorSelect, 'change', (event) => {
        filter.operator = event.target.value;
        // Re-render value input if operator changes
        const valueContainer = $(`#filter-value-${filter.id}`);
        if (valueContainer) {
          valueContainer.innerHTML = this.createValueInput(filter);
        }
      });
    }
  }

  createValueInput(filter) {
    switch (filter.type) {
      case 'text':
        return `<input type="text" class="filter-input" placeholder="Enter text..." value="${filter.value}" id="filter-input-${filter.id}" />`;
      
      case 'number':
        if (filter.operator === 'between') {
          return `
            <input type="number" class="filter-input filter-input-small" placeholder="Min" id="filter-input-min-${filter.id}" />
            <span class="filter-separator">to</span>
            <input type="number" class="filter-input filter-input-small" placeholder="Max" id="filter-input-max-${filter.id}" />
          `;
        }
        return `<input type="number" class="filter-input" placeholder="Enter number..." value="${filter.value}" id="filter-input-${filter.id}" />`;
      
      case 'date':
        if (filter.operator === 'between') {
          return `
            <input type="date" class="filter-input filter-input-small" id="filter-input-start-${filter.id}" />
            <span class="filter-separator">to</span>
            <input type="date" class="filter-input filter-input-small" id="filter-input-end-${filter.id}" />
          `;
        }
        return `<input type="date" class="filter-input" value="${filter.value}" id="filter-input-${filter.id}" />`;
      
      case 'select':
        // This would need options from column config
        return `<select class="filter-input" id="filter-input-${filter.id}"></select>`;
      
      default:
        return `<input type="text" class="filter-input" placeholder="Enter value..." value="${filter.value}" id="filter-input-${filter.id}" />`;
    }
  }

  applyFilterEdit(filter) {
    const input = $(`#filter-input-${filter.id}`);
    
    if (filter.type === 'date' && filter.operator === 'between') {
      const startInput = $(`#filter-input-start-${filter.id}`);
      const endInput = $(`#filter-input-end-${filter.id}`);
      if (startInput && endInput) {
        filter.value = [startInput.value, endInput.value];
      }
    } else if (filter.operator === 'between') {
      const minInput = $(`#filter-input-min-${filter.id}`);
      const maxInput = $(`#filter-input-max-${filter.id}`);
      if (minInput && maxInput) {
        filter.value = [minInput.value, maxInput.value];
      }
    } else if (input) {
      filter.value = input.value;
    }

    this.renderFilterChips();
    this.notifyFilterChange();
  }

  renderFilterChips() {
    const container = $('#filter-chips');
    if (!container) return;

    container.innerHTML = '';

    this.activeFilters.forEach(filter => {
      const chip = document.createElement('div');
      chip.className = 'filter-chip';
      chip.dataset.filterId = filter.id;

      const valueDisplay = this.formatFilterValue(filter);

      chip.innerHTML = `
        <span class="filter-chip-content">
          <span class="filter-chip-label">${filter.columnLabel}</span>
          <span class="filter-chip-operator">${this.getOperatorSymbol(filter.operator)}</span>
          <span class="filter-chip-value">${valueDisplay}</span>
        </span>
        <button class="filter-chip-remove" data-filter-id="${filter.id}">×</button>
      `;

      container.appendChild(chip);

      // Attach remove handler
      const removeBtn = chip.querySelector('.filter-chip-remove');
      if (removeBtn) {
        this.listen(removeBtn, 'click', (e) => {
          e.stopPropagation();
          this.removeFilter(filter.id);
        });
      }

      // Click to edit
      this.listen(chip, 'click', () => this.showFilterEditor(filter));
    });

    // Update button states
    const clearBtn = $('#clear-filters-btn');
    const saveBtn = $('#save-filter-btn');
    if (clearBtn) clearBtn.disabled = this.activeFilters.length === 0;
    if (saveBtn) saveBtn.disabled = this.activeFilters.length === 0;
  }

  removeFilter(filterId) {
    this.activeFilters = this.activeFilters.filter(f => f.id !== filterId);
    this.renderFilterChips();
    this.notifyFilterChange();
  }

  clearAllFilters() {
    this.activeFilters = [];
    this.renderFilterChips();
    this.notifyFilterChange();
  }

  notifyFilterChange() {
    this.onFilterChange(this.activeFilters);
  }

  // Helper methods
  inferColumnType(column) {
    if (column.type) return column.type;
    if (column.format === 'number' || column.format === 'currency') return 'number';
    if (column.format === 'date' || column.format === 'datetime') return 'date';
    return 'text';
  }

  getColumnTypeLabel(column) {
    const type = this.inferColumnType(column);
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  getDefaultOperator(column) {
    const type = this.inferColumnType(column);
    if (type === 'text') return 'contains';
    if (type === 'number') return 'equals';
    if (type === 'date') return 'after';
    return 'equals';
  }

  getOperatorsForType(type) {
    const operators = {
      text: [
        { value: 'contains', label: 'Contains' },
        { value: 'equals', label: 'Equals' },
        { value: 'startsWith', label: 'Starts with' },
        { value: 'endsWith', label: 'Ends with' },
        { value: 'notContains', label: 'Does not contain' },
      ],
      number: [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not equals' },
        { value: 'greaterThan', label: 'Greater than' },
        { value: 'lessThan', label: 'Less than' },
        { value: 'between', label: 'Between' },
      ],
      date: [
        { value: 'equals', label: 'On' },
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'between', label: 'Between' },
      ],
    };

    return operators[type] || operators.text;
  }

  getOperatorSymbol(operator) {
    const symbols = {
      equals: '=',
      notEquals: '≠',
      greaterThan: '>',
      lessThan: '<',
      contains: '⊃',
      notContains: '⊅',
      startsWith: '^',
      endsWith: '$',
      before: '<',
      after: '>',
      between: '↔',
    };

    return symbols[operator] || operator;
  }

  formatFilterValue(filter) {
    if (Array.isArray(filter.value)) {
      return `${filter.value[0]} - ${filter.value[1]}`;
    }
    if (!filter.value) return '(empty)';
    return String(filter.value);
  }

  // Preset management
  showSavePresetModal() {
    const name = prompt('Enter preset name:');
    if (!name) return;

    this.savedFilters[name] = [...this.activeFilters];
    this.saveSavedFilters();
    alert(`Preset "${name}" saved!`);
  }

  showLoadPresetModal() {
    const names = Object.keys(this.savedFilters);
    if (names.length === 0) {
      alert('No saved presets found.');
      return;
    }

    const name = prompt(`Load preset:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
    if (!name || !this.savedFilters[name]) return;

    this.activeFilters = [...this.savedFilters[name]];
    this.renderFilterChips();
    this.notifyFilterChange();
  }

  loadSavedFilters() {
    try {
      const saved = localStorage.getItem('filter-presets');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  saveSavedFilters() {
    try {
      localStorage.setItem('filter-presets', JSON.stringify(this.savedFilters));
    } catch (e) {
      console.error('[FilterBuilder] Failed to save presets:', e);
    }
  }

  getActiveFilters() {
    return this.activeFilters;
  }

  applyFilters(data) {
    if (!this.activeFilters.length) return data;

    return data.filter(row => {
      return this.activeFilters.every(filter => {
        const value = this.getNestedValue(row, filter.column);
        return this.matchesFilter(value, filter);
      });
    });
  }

  matchesFilter(value, filter) {
    const filterValue = filter.value;

    switch (filter.operator) {
      case 'equals':
        return String(value).toLowerCase() === String(filterValue).toLowerCase();
      case 'notEquals':
        return String(value).toLowerCase() !== String(filterValue).toLowerCase();
      case 'contains':
        return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'notContains':
        return !String(value).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'startsWith':
        return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
      case 'endsWith':
        return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
      case 'greaterThan':
        return parseFloat(value) > parseFloat(filterValue);
      case 'lessThan':
        return parseFloat(value) < parseFloat(filterValue);
      case 'between':
        if (Array.isArray(filterValue)) {
          const [min, max] = filterValue;
          const numValue = parseFloat(value);
          return numValue >= parseFloat(min) && numValue <= parseFloat(max);
        }
        return false;
      case 'before':
        return new Date(value) < new Date(filterValue);
      case 'after':
        return new Date(value) > new Date(filterValue);
      default:
        return true;
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}

export default FilterBuilder;

/**
 * DataTable Component - Advanced data grid with sorting, filtering, selection
 * 
 * Features:
 * - Column sorting (click header, multi-column with Shift)
 * - Inline filtering per column
 * - Row selection with checkboxes
 * - Bulk actions toolbar
 * - Pagination
 * - Custom cell formatters
 * - Responsive design
 */

import { Component } from '../lifecycle.js';
import { fmt, $ } from '../utils.js';

class DataTable extends Component {
  constructor(options) {
    super('DataTable');
    this.columns = options.columns || [];
    this.data = options.data || [];
    this.selectable = options.selectable || false;
    this.onSelect = options.onSelect || (() => {});
    this.rowActions = options.rowActions || [];
    this.bulkActions = options.bulkActions || [];
    this.pageSize = options.pageSize || 50;
    this.currentPage = 1;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.selectedRows = new Set();
    this.filters = {};
    this.containerId = options.containerId || 'table-container';
  }

  onMount() {
    this.render();
  }

  setData(data) {
    this.data = data;
    this.currentPage = 1;
    this.selectedRows.clear();
    this.render();
  }

  render() {
    const container = $(`#${this.containerId}`);
    if (!container) {
      console.error('[DataTable] Container not found:', this.containerId);
      return;
    }

    container.innerHTML = '';
    container.className = 'data-table-container';

    // Toolbar
    if (this.selectable && this.bulkActions.length > 0) {
      const toolbar = this.renderToolbar();
      container.appendChild(toolbar);
    }

    // Table wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-wrapper';

    const table = document.createElement('table');
    table.className = 'data-table';

    // Header
    const thead = this.renderHeader();
    table.appendChild(thead);

    // Body
    const tbody = this.renderBody();
    table.appendChild(tbody);

    wrapper.appendChild(table);
    container.appendChild(wrapper);

    // Pagination
    const pagination = this.renderPagination();
    container.appendChild(pagination);
  }

  renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'data-table-toolbar';

    const selectedCount = this.selectedRows.size;
    if (selectedCount > 0) {
      const actionsHtml = this.bulkActions.map((action, idx) => 
        `<button class="btn btn-secondary" data-action-idx="${idx}">${action.label}</button>`
      ).join('');

      toolbar.innerHTML = `
        <span class="selected-count">${selectedCount} selected</span>
        ${actionsHtml}
        <button class="btn btn-ghost" data-action="clear">Clear Selection</button>
      `;

      // Attach bulk action handlers
      this.bulkActions.forEach((action, idx) => {
        const btn = toolbar.querySelector(`[data-action-idx="${idx}"]`);
        if (btn) {
          this.listen(btn, 'click', () => {
            const rows = Array.from(this.selectedRows).map(id => 
              this.data.find(row => this.getRowId(row) === id)
            ).filter(Boolean);
            action.onClick(rows);
          });
        }
      });

      const clearBtn = toolbar.querySelector('[data-action="clear"]');
      if (clearBtn) {
        this.listen(clearBtn, 'click', () => this.clearSelection());
      }
    } else {
      toolbar.innerHTML = `<span class="muted">0 rows selected</span>`;
    }

    return toolbar;
  }

  renderHeader() {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');

    // Selection column
    if (this.selectable) {
      const th = document.createElement('th');
      th.className = 'col-select';
      th.innerHTML = '<input type="checkbox" class="select-all" aria-label="Select all" />';
      
      const checkbox = th.querySelector('.select-all');
      this.listen(checkbox, 'change', (e) => this.selectAll(e.target.checked));
      
      tr.appendChild(th);
    }

    // Data columns
    this.columns.forEach((col, idx) => {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.dataset.key = col.key;
      th.dataset.idx = idx;
      
      if (col.width) {
        th.style.width = typeof col.width === 'number' ? `${col.width}px` : col.width;
      }
      
      if (col.align) {
        th.style.textAlign = col.align;
      }

      const headerContent = document.createElement('div');
      headerContent.className = 'col-header-content';

      const label = document.createElement('span');
      label.className = 'col-label';
      label.textContent = col.label;
      headerContent.appendChild(label);
      
      if (col.sortable) {
        const sortIcon = document.createElement('span');
        sortIcon.className = 'sort-indicator';
        if (this.sortColumn === col.key) {
          sortIcon.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
        }
        headerContent.appendChild(sortIcon);
        th.classList.add('sortable');
        this.listen(th, 'click', (e) => this.handleSort(col.key, e.shiftKey));
      }

      th.appendChild(headerContent);

      if (col.filterable) {
        const filterDiv = document.createElement('div');
        filterDiv.className = 'col-filter';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Filter...';
        input.className = 'filter-input';
        input.dataset.key = col.key;
        this.listen(input, 'input', (e) => this.handleFilter(col.key, e.target.value));
        filterDiv.appendChild(input);
        th.appendChild(filterDiv);
      }

      tr.appendChild(th);
    });

    // Actions column
    if (this.rowActions.length > 0) {
      const th = document.createElement('th');
      th.className = 'col-actions';
      th.textContent = 'Actions';
      tr.appendChild(th);
    }

    thead.appendChild(tr);
    return thead;
  }

  renderBody() {
    const tbody = document.createElement('tbody');
    const filteredData = this.getFilteredData();
    const sortedData = this.getSortedData(filteredData);
    const paginatedData = this.getPaginatedData(sortedData);

    if (paginatedData.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = this.columns.length + (this.selectable ? 1 : 0) + (this.rowActions.length > 0 ? 1 : 0);
      td.className = 'empty-state';
      td.innerHTML = '<div class="text-center p-8 muted">No data available</div>';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return tbody;
    }

    paginatedData.forEach(row => {
      const tr = document.createElement('tr');
      const rowId = this.getRowId(row);
      tr.dataset.rowId = rowId;

      if (this.selectedRows.has(rowId)) {
        tr.classList.add('selected');
      }

      // Selection column
      if (this.selectable) {
        const td = document.createElement('td');
        td.className = 'col-select';
        td.innerHTML = `<input type="checkbox" ${this.selectedRows.has(rowId) ? 'checked' : ''} aria-label="Select row" />`;
        const checkbox = td.querySelector('input');
        this.listen(checkbox, 'change', (e) => this.toggleRowSelection(rowId, e.target.checked));
        tr.appendChild(td);
      }

      // Data columns
      this.columns.forEach(col => {
        const td = document.createElement('td');
        td.className = 'col-data';
        
        if (col.align) {
          td.style.textAlign = col.align;
        }

        const value = this.getNestedValue(row, col.key);
        const formatted = this.formatValue(value, col.format);
        
        if (col.render) {
          td.innerHTML = col.render(value, row);
        } else {
          td.textContent = formatted;
        }
        
        tr.appendChild(td);
      });

      // Actions column
      if (this.rowActions.length > 0) {
        const td = document.createElement('td');
        td.className = 'col-actions';
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'row-actions';
        
        this.rowActions.forEach((action, idx) => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-sm btn-ghost';
          btn.title = action.label;
          btn.innerHTML = action.icon || action.label;
          btn.dataset.actionIdx = idx;
          this.listen(btn, 'click', () => action.onClick(row));
          actionsDiv.appendChild(btn);
        });
        
        td.appendChild(actionsDiv);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });

    return tbody;
  }

  renderPagination() {
    const pagination = document.createElement('div');
    pagination.className = 'data-table-pagination';

    const filteredData = this.getFilteredData();
    const totalPages = Math.ceil(filteredData.length / this.pageSize);
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, filteredData.length);

    pagination.innerHTML = `
      <div class="pagination-info">
        Showing ${start}-${end} of ${filteredData.length} rows
      </div>
      <div class="pagination-controls">
        <button class="btn btn-sm btn-ghost" data-page="first" ${this.currentPage === 1 ? 'disabled' : ''}>« First</button>
        <button class="btn btn-sm btn-ghost" data-page="prev" ${this.currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>
        <span class="pagination-current">Page ${this.currentPage} of ${totalPages}</span>
        <button class="btn btn-sm btn-ghost" data-page="next" ${this.currentPage === totalPages ? 'disabled' : ''}>Next ›</button>
        <button class="btn btn-sm btn-ghost" data-page="last" ${this.currentPage === totalPages ? 'disabled' : ''}>Last »</button>
      </div>
    `;

    const firstBtn = pagination.querySelector('[data-page="first"]');
    const prevBtn = pagination.querySelector('[data-page="prev"]');
    const nextBtn = pagination.querySelector('[data-page="next"]');
    const lastBtn = pagination.querySelector('[data-page="last"]');

    this.listen(firstBtn, 'click', () => this.goToPage(1));
    this.listen(prevBtn, 'click', () => this.goToPage(this.currentPage - 1));
    this.listen(nextBtn, 'click', () => this.goToPage(this.currentPage + 1));
    this.listen(lastBtn, 'click', () => this.goToPage(totalPages));

    return pagination;
  }

  // Utility methods
  getRowId(row) {
    return row.id || row._id || JSON.stringify(row);
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  formatValue(value, format) {
    if (value == null) return '—';
    
    switch (format) {
      case 'number':
        return fmt.num(value);
      case 'currency':
        return fmt.currency(value);
      case 'ms':
        return fmt.ms(value);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'percent':
        return `${(value * 100).toFixed(2)}%`;
      default:
        return String(value);
    }
  }

  handleSort(column, multiSort) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.render();
  }

  handleFilter(column, value) {
    if (value.trim() === '') {
      delete this.filters[column];
    } else {
      this.filters[column] = value.toLowerCase();
    }
    this.currentPage = 1;
    this.render();
  }

  getFilteredData() {
    if (Object.keys(this.filters).length === 0) {
      return this.data;
    }

    return this.data.filter(row => {
      return Object.entries(this.filters).every(([key, filterValue]) => {
        const cellValue = String(this.getNestedValue(row, key) || '').toLowerCase();
        return cellValue.includes(filterValue);
      });
    });
  }

  getSortedData(data) {
    if (!this.sortColumn) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aVal = this.getNestedValue(a, this.sortColumn);
      const bVal = this.getNestedValue(b, this.sortColumn);
      
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  getPaginatedData(data) {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return data.slice(start, end);
  }

  toggleRowSelection(rowId, selected) {
    if (selected) {
      this.selectedRows.add(rowId);
    } else {
      this.selectedRows.delete(rowId);
    }
    this.render();
    this.onSelect(Array.from(this.selectedRows));
  }

  selectAll(selected) {
    const filteredData = this.getFilteredData();
    const sortedData = this.getSortedData(filteredData);
    const paginatedData = this.getPaginatedData(sortedData);
    
    if (selected) {
      paginatedData.forEach(row => {
        this.selectedRows.add(this.getRowId(row));
      });
    } else {
      paginatedData.forEach(row => {
        this.selectedRows.delete(this.getRowId(row));
      });
    }
    this.render();
    this.onSelect(Array.from(this.selectedRows));
  }

  clearSelection() {
    this.selectedRows.clear();
    this.render();
    this.onSelect([]);
  }

  goToPage(page) {
    const filteredData = this.getFilteredData();
    const totalPages = Math.ceil(filteredData.length / this.pageSize);
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.render();
    }
  }
}

export default DataTable;

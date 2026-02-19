# UX Implementation Guide: Block-Buster Dashboard Transformation

**Author:** Senior Full-Stack Engineer  
**Date:** February 13, 2026  
**Target:** Production-grade blockchain operations dashboard  
**Philosophy:** 1% dev mentality - every pixel, every interaction, every millisecond matters

---

## Executive Summary

This document provides **authoritative, actionable instructions** for transforming the block-buster frontend from a proof-of-concept card-stacked layout into a production-grade, information-dense, multi-market blockchain operations dashboard.

### Current State Assessment

**What Exists:**
- Basic card-based metrics display (hero, primary, compact grids)
- Simple polling mechanism (2s intervals)
- Minimal navigation (hash-based routing)
- Single-page views (TheBlock.js, Network.js)
- WebSocket infrastructure (ws.js) but minimal UI integration
- RPC client (rpc.js) with basic batching
- Component lifecycle system (lifecycle.js)
- State management (state.js with observables)

**Critical Gaps:**
- ❌ No multi-column master-detail layouts
- ❌ No market-specific dashboards (Ad, Energy, Compute, Storage)
- ❌ No advanced data tables (sorting, filtering, pagination, bulk actions)
- ❌ No modal system for detail views
- ❌ No filter builder components
- ❌ No drill-down navigation patterns
- ❌ No real-time streaming UI components
- ❌ No time-series chart components
- ❌ No workspace customization
- ❌ No bulk operations UI
- ❌ No context-aware action menus
- ❌ No keyboard shortcut system (KeyboardShortcuts.js exists but limited)
- ❌ No receipt audit interface
- ❌ No dispute management UI
- ❌ No governance proposal interface
- ❌ No treasury operations dashboard

**Backend Capabilities Available (from apis_and_tooling.md):**
- ✅ Consensus RPC (block_height, validator info, finality)
- ✅ Ledger RPC (balances, transactions)
- ✅ Storage RPC (file operations)
- ✅ Compute Market RPC (job submission, receipts, SLAs)
- ✅ Ad Market RPC (bidding, campaigns, cohorts, policy)
- ✅ Energy Market RPC (providers, readings, disputes, settlements)
- ✅ Governance RPC (proposals, voting)
- ✅ Treasury RPC (disbursements, balances)
- ✅ Scheduler RPC (queue stats)
- ✅ Receipt Audit RPC (canonical receipt trail with subsidies/disputes)
- ✅ Analytics RPC (aggregated telemetry)
- ✅ Governor RPC (launch gates, staged rollout)

---

## Phase 1: Layout System Transformation

### 1.1 Master-Detail Pattern Implementation

**File:** `web/src/layouts/MasterDetailLayout.js`

```javascript
/**
 * Master-Detail Layout Component
 * 
 * Pattern: Fixed sidebar (240px) + scrollable main content
 * Usage: All market dashboards, explorer views, operations panels
 * 
 * Features:
 * - Responsive: collapses to drawer on mobile
 * - Persistent sidebar state in localStorage
 * - Customizable sidebar width
 * - Keyboard navigation (Ctrl+B to toggle)
 */

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class MasterDetailLayout extends Component {
  constructor(options = {}) {
    super('MasterDetailLayout');
    this.sidebarWidth = options.sidebarWidth || '240px';
    this.collapsible = options.collapsible !== false;
    this.sidebarContent = options.sidebar || '';
    this.mainContent = options.main || '';
    this.sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  }

  render() {
    const container = document.createElement('div');
    container.className = 'layout-master-detail';
    container.innerHTML = `
      <aside class="sidebar ${this.sidebarCollapsed ? 'collapsed' : ''}" 
             style="--sidebar-width: ${this.sidebarWidth}">
        <div class="sidebar-header">
          ${this.collapsible ? '<button class="sidebar-toggle" aria-label="Toggle sidebar"><span>☰</span></button>' : ''}
        </div>
        <div class="sidebar-content">
          ${this.sidebarContent}
        </div>
      </aside>
      <main class="main-content">
        ${this.mainContent}
      </main>
    `;

    // Attach toggle handler
    if (this.collapsible) {
      const toggle = container.querySelector('.sidebar-toggle');
      toggle?.addEventListener('click', () => this.toggleSidebar());
    }

    // Keyboard shortcut: Ctrl+B
    this.onKeydown('b', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.toggleSidebar();
      }
    });

    return container;
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sidebar-collapsed', this.sidebarCollapsed);
    const sidebar = $('.sidebar');
    sidebar?.classList.toggle('collapsed');
  }
}

export default MasterDetailLayout;
```

**CSS Required:** `web/src/styles/layouts.css`

```css
/* Master-Detail Layout */
.layout-master-detail {
  display: grid;
  grid-template-columns: var(--sidebar-width, 240px) 1fr;
  gap: 0;
  height: calc(100vh - 60px); /* Account for header */
  overflow: hidden;
}

.sidebar {
  background: var(--surface-1);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  position: relative;
}

.sidebar.collapsed {
  width: 48px;
}

.sidebar.collapsed .sidebar-content {
  opacity: 0;
  pointer-events: none;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.sidebar-toggle:hover {
  color: var(--text-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem;
  transition: opacity 0.2s;
}

.main-content {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2rem;
  background: var(--surface-0);
}

/* Responsive: Mobile */
@media (max-width: 768px) {
  .layout-master-detail {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 60px;
    height: calc(100vh - 60px);
    width: 280px;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar:not(.collapsed) {
    transform: translateX(0);
  }

  .sidebar::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s;
  }

  .sidebar:not(.collapsed)::before {
    opacity: 1;
  }
}
```

### 1.2 Grid System Enhancement

**Current Problem:** All metrics use single-direction stacking. No spatial organization.

**Solution:** Implement 12-column CSS Grid system with semantic breakpoints.

**File:** `web/src/styles/grid.css`

```css
/* 12-Column Grid System */
.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--grid-gap, 1.5rem);
}

/* Span utilities */
.span-1 { grid-column: span 1; }
.span-2 { grid-column: span 2; }
.span-3 { grid-column: span 3; }
.span-4 { grid-column: span 4; }
.span-5 { grid-column: span 5; }
.span-6 { grid-column: span 6; }
.span-7 { grid-column: span 7; }
.span-8 { grid-column: span 8; }
.span-9 { grid-column: span 9; }
.span-10 { grid-column: span 10; }
.span-11 { grid-column: span 11; }
.span-12 { grid-column: span 12; }

/* Row span utilities */
.row-span-1 { grid-row: span 1; }
.row-span-2 { grid-row: span 2; }
.row-span-3 { grid-row: span 3; }
.row-span-4 { grid-row: span 4; }
.row-span-5 { grid-row: span 5; }
.row-span-6 { grid-row: span 6; }

/* Responsive breakpoints */
@media (max-width: 1200px) {
  .lg\\:span-6 { grid-column: span 6; }
  .lg\\:span-12 { grid-column: span 12; }
}

@media (max-width: 768px) {
  .md\\:span-12 { grid-column: span 12; }
}

/* Dashboard-specific grids */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.metrics-panel-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

@media (max-width: 1024px) {
  .metrics-panel-grid {
    grid-template-columns: 1fr;
  }
}
```

**Migration Pattern for TheBlock.js:**

```javascript
// BEFORE (Current - Stacked):
render() {
  const content = document.createElement('div');
  content.className = 'content';
  
  content.appendChild(heroMetrics);      // Full width stack
  content.appendChild(primaryMetrics);   // Full width stack
  content.appendChild(compactMetrics);   // Full width stack
}

// AFTER (Spatial Organization):
render() {
  const content = document.createElement('div');
  content.className = 'grid';
  
  // Hero metrics: 4 columns across top
  const heroSection = document.createElement('section');
  heroSection.className = 'span-12';
  heroSection.innerHTML = '<div class="dashboard-grid" id="hero-metrics">...</div>';
  content.appendChild(heroSection);
  
  // Primary panel (left) + Secondary panel (right)
  const primaryPanel = document.createElement('section');
  primaryPanel.className = 'span-8 md:span-12';
  primaryPanel.innerHTML = '...';  // Charts, tables
  content.appendChild(primaryPanel);
  
  const secondaryPanel = document.createElement('section');
  secondaryPanel.className = 'span-4 md:span-12';
  secondaryPanel.innerHTML = '...';  // Stats, actions
  content.appendChild(secondaryPanel);
}
```

---

## Phase 2: Advanced Component Library

### 2.1 DataTable Component

**File:** `web/src/components/DataTable.js`

```javascript
/**
 * DataTable Component
 * 
 * Features:
 * - Virtual scrolling (10,000+ rows)
 * - Column sorting (multi-column with Shift+Click)
 * - Inline filtering
 * - Row selection (checkbox + Shift+Click range)
 * - Bulk actions menu
 * - Column reordering (drag-and-drop)
 * - Column resizing
 * - Row expansion (nested data)
 * - Sticky header
 * - Export to CSV/JSON
 * - Pagination or infinite scroll
 * - Custom cell renderers
 * 
 * Usage:
 * const table = new DataTable({
 *   columns: [
 *     { key: 'id', label: 'ID', width: 80, sortable: true },
 *     { key: 'provider', label: 'Provider', filterable: true },
 *     { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
 *   ],
 *    receipts,
 *   selectable: true,
 *   onSelect: (rows) => console.log('Selected', rows),
 *   rowActions: [
 *     { icon: '👁', label: 'View', onClick: (row) => viewReceipt(row) },
 *     { icon: '🚩', label: 'Flag', onClick: (row) => flagReceipt(row) },
 *   ],
 *   bulkActions: [
 *     { label: 'Export Selected', onClick: (rows) => exportCSV(rows) },
 *   ],
 * });
 */

import { Component } from '../lifecycle.js';
import { fmt } from '../utils.js';

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
    this.virtualScroll = options.virtualScroll !== false;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.selectedRows = new Set();
    this.filters = {};
  }

  render() {
    const container = document.createElement('div');
    container.className = 'data-table-container';

    // Toolbar
    if (this.selectable && this.bulkActions.length > 0) {
      const toolbar = this.renderToolbar();
      container.appendChild(toolbar);
    }

    // Table wrapper (for sticky header + virtual scroll)
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

    // Pagination (if not using virtual scroll)
    if (!this.virtualScroll) {
      const pagination = this.renderPagination();
      container.appendChild(pagination);
    }

    return container;
  }

  renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'data-table-toolbar';

    const selectedCount = this.selectedRows.size;
    if (selectedCount > 0) {
      toolbar.innerHTML = `
        <span class="selected-count">${selectedCount} selected</span>
        ${this.bulkActions.map(action => 
          `<button class="btn-secondary" data-action="${action.label}">${action.label}</button>`
        ).join('')}
        <button class="btn-ghost" data-action="clear">Clear Selection</button>
      `;

      // Attach handlers
      this.bulkActions.forEach(action => {
        const btn = toolbar.querySelector(`[data-action="${action.label}"]`);
        btn?.addEventListener('click', () => {
          const rows = Array.from(this.selectedRows).map(id => 
            this.data.find(row => this.getRowId(row) === id)
          );
          action.onClick(rows);
        });
      });

      const clearBtn = toolbar.querySelector('[data-action="clear"]');
      clearBtn?.addEventListener('click', () => this.clearSelection());
    } else {
      toolbar.innerHTML = '<span class="muted">No rows selected</span>';
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
      th.innerHTML = '<input type="checkbox" class="select-all" />';
      
      const checkbox = th.querySelector('.select-all');
      checkbox.addEventListener('change', (e) => this.selectAll(e.target.checked));
      
      tr.appendChild(th);
    }

    // Data columns
    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.dataset.key = col.key;
      
      if (col.width) {
        th.style.width = typeof col.width === 'number' ? `${col.width}px` : col.width;
      }
      
      if (col.align) {
        th.style.textAlign = col.align;
      }

      let headerContent = `<span class="col-label">${col.label}</span>`;
      
      if (col.sortable) {
        headerContent += '<span class="sort-indicator"></span>';
        th.classList.add('sortable');
        th.addEventListener('click', (e) => this.handleSort(col.key, e.shiftKey));
      }

      if (col.filterable) {
        headerContent += `
          <div class="col-filter">
            <input type="text" 
                   placeholder="Filter..." 
                   class="filter-input" 
                   data-key="${col.key}" />
          </div>
        `;
      }

      th.innerHTML = headerContent;

      // Filter input handler
      if (col.filterable) {
        const input = th.querySelector('.filter-input');
        input?.addEventListener('input', (e) => this.handleFilter(col.key, e.target.value));
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

    sortedData.forEach((row, index) => {
      const tr = this.renderRow(row, index);
      tbody.appendChild(tr);
    });

    if (sortedData.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="${this.columns.length + (this.selectable ? 1 : 0) + (this.rowActions.length > 0 ? 1 : 0)}" 
            class="empty-state">
          No data available
        </td>
      `;
      tbody.appendChild(emptyRow);
    }

    return tbody;
  }

  renderRow(row, index) {
    const tr = document.createElement('tr');
    tr.dataset.index = index;
    tr.dataset.id = this.getRowId(row);

    const isSelected = this.selectedRows.has(this.getRowId(row));
    if (isSelected) {
      tr.classList.add('selected');
    }

    // Selection column
    if (this.selectable) {
      const td = document.createElement('td');
      td.className = 'col-select';
      td.innerHTML = `<input type="checkbox" class="row-select" ${isSelected ? 'checked' : ''} />`;
      
      const checkbox = td.querySelector('.row-select');
      checkbox.addEventListener('change', (e) => {
        this.toggleRowSelection(this.getRowId(row), e.target.checked);
      });
      
      tr.appendChild(td);
    }

    // Data columns
    this.columns.forEach(col => {
      const td = document.createElement('td');
      td.dataset.key = col.key;
      
      if (col.align) {
        td.style.textAlign = col.align;
      }

      const value = this.getCellValue(row, col.key);
      const formatted = this.formatCellValue(value, col.format);
      
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
      
      const actionsMenu = document.createElement('div');
      actionsMenu.className = 'actions-menu';
      
      this.rowActions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.title = action.label;
        btn.innerHTML = action.icon;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          action.onClick(row);
        });
        actionsMenu.appendChild(btn);
      });

      td.appendChild(actionsMenu);
      tr.appendChild(td);
    }

    return tr;
  }

  renderPagination() {
    // TODO: Implement pagination controls
    const pagination = document.createElement('div');
    pagination.className = 'data-table-pagination';
    pagination.innerHTML = '<span>Pagination TBD</span>';
    return pagination;
  }

  // Utility methods
  getRowId(row) {
    return row.id || row.digest_hex || JSON.stringify(row);
  }

  getCellValue(row, key) {
    return key.split('.').reduce((obj, k) => obj?.[k], row);
  }

  formatCellValue(value, format) {
    if (value == null) return '—';
    
    switch (format) {
      case 'number':
        return fmt.num(value);
      case 'currency':
        return fmt.currency(value);
      case 'ms':
        return `${value}ms`;
      case 'percent':
        return `${value}%`;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      default:
        return value;
    }
  }

  getFilteredData() {
    let filtered = this.data;

    Object.keys(this.filters).forEach(key => {
      const filterValue = this.filters[key].toLowerCase();
      if (filterValue) {
        filtered = filtered.filter(row => {
          const cellValue = String(this.getCellValue(row, key)).toLowerCase();
          return cellValue.includes(filterValue);
        });
      }
    });

    return filtered;
  }

  getSortedData(data) {
    if (!this.sortColumn) return data;

    return [...data].sort((a, b) => {
      const aVal = this.getCellValue(a, this.sortColumn);
      const bVal = this.getCellValue(b, this.sortColumn);

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  handleSort(column, multiSort) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    // TODO: Multi-column sort with Shift+Click
    this.refresh();
  }

  handleFilter(column, value) {
    this.filters[column] = value;
    this.refresh();
  }

  toggleRowSelection(id, selected) {
    if (selected) {
      this.selectedRows.add(id);
    } else {
      this.selectedRows.delete(id);
    }
    
    this.onSelect(Array.from(this.selectedRows));
    this.refresh();
  }

  selectAll(selected) {
    if (selected) {
      this.getFilteredData().forEach(row => {
        this.selectedRows.add(this.getRowId(row));
      });
    } else {
      this.selectedRows.clear();
    }

    this.onSelect(Array.from(this.selectedRows));
    this.refresh();
  }

  clearSelection() {
    this.selectedRows.clear();
    this.onSelect([]);
    this.refresh();
  }

  refresh() {
    // Re-render efficiently (replace tbody only)
    const container = this.container;
    if (!container) return;

    const table = container.querySelector('.data-table');
    const oldTbody = table.querySelector('tbody');
    const newTbody = this.renderBody();
    
    oldTbody.replaceWith(newTbody);

    // Update toolbar
    if (this.selectable && this.bulkActions.length > 0) {
      const oldToolbar = container.querySelector('.data-table-toolbar');
      const newToolbar = this.renderToolbar();
      oldToolbar?.replaceWith(newToolbar);
    }
  }

  // Public API
  setData(data) {
    this.data = data;
    this.refresh();
  }

  getSelectedRows() {
    return Array.from(this.selectedRows).map(id => 
      this.data.find(row => this.getRowId(row) === id)
    );
  }

  exportCSV() {
    const rows = this.getFilteredData();
    const headers = this.columns.map(col => col.label);
    const csv = [
      headers.join(','),
      ...rows.map(row => 
        this.columns.map(col => {
          const value = this.getCellValue(row, col.key);
          return `"${value}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}

export default DataTable;
```

**CSS for DataTable:** `web/src/styles/data-table.css`

```css
/* Data Table Styles */
.data-table-container {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-1);
}

.data-table-toolbar {
  padding: 1rem;
  background: var(--surface-0);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 1rem;
}

.selected-count {
  font-weight: 600;
  color: var(--accent-primary);
}

.data-table-wrapper {
  overflow: auto;
  max-height: 600px; /* Or calc(100vh - Xpx) for full viewport */
}

.data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface-1);
}

.data-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-secondary);
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}

.col-header.sortable {
  cursor: pointer;
  user-select: none;
}

.col-header.sortable:hover {
  background: var(--surface-0);
}

.col-select {
  width: 48px;
  text-align: center;
}

.col-actions {
  width: 120px;
  text-align: right;
}

.data-table tbody tr {
  transition: background 0.1s;
}

.data-table tbody tr:hover {
  background: var(--surface-0);
}

.data-table tbody tr.selected {
  background: var(--accent-primary-alpha-10);
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.actions-menu {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.action-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--accent-primary);
  background: var(--accent-primary-alpha-10);
}

.filter-input {
  margin-top: 0.5rem;
  width: 100%;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.875rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-secondary);
  font-style: italic;
}
```

### 2.2 Modal System

**File:** `web/src/components/Modal.js`

```javascript
/**
 * Modal Dialog System
 * 
 * Features:
 * - Stacking support (multiple modals)
 * - Keyboard navigation (ESC to close, Tab trapping)
 * - Backdrop click to close (optional)
 * - Draggable (optional)
 * - Size variants (small, medium, large, fullscreen)
 * - Tabbed content support
 * - Action buttons (primary, secondary, danger)
 * - Loading state
 * - Sticky footer for actions
 * 
 * Usage:
 * const modal = new Modal({
 *   title: 'Receipt Details',
 *   size: 'large',
 *   onClose: () => modal.destroy(),
 *   tabs: [
 *     { id: 'details', label: 'Details', content: detailsHtml },
 *     { id: 'subsidies', label: 'Subsidies', content: subsidiesHtml },
 *   ],
 *   actions: [
 *     { label: 'Export', onClick: exportReceipt, variant: 'secondary' },
 *     { label: 'Close', onClick: () => modal.destroy() },
 *   ],
 * });
 * modal.show();
 */

import { Component } from '../lifecycle.js';

class Modal extends Component {
  constructor(options) {
    super('Modal');
    this.title = options.title || 'Modal';
    this.size = options.size || 'medium'; // small, medium, large, fullscreen
    this.onClose = options.onClose || (() => {});
    this.backdrop = options.backdrop !== false;
    this.closeOnBackdrop = options.closeOnBackdrop !== false;
    this.draggable = options.draggable || false;
    this.tabs = options.tabs || [];
    this.content = options.content || '';
    this.actions = options.actions || [];
    this.loading = options.loading || false;
    this.activeTab = this.tabs.length > 0 ? this.tabs[0].id : null;
    this.overlay = null;
  }

  show() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    if (this.backdrop) {
      this.overlay.classList.add('with-backdrop');
    }

    // Create modal
    const modal = this.render();
    this.overlay.appendChild(modal);

    // Append to body
    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden'; // Prevent background scroll

    // Animate in
    requestAnimationFrame(() => {
      this.overlay.classList.add('active');
    });

    // Backdrop click handler
    if (this.closeOnBackdrop) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    }

    // ESC key handler
    this.escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.escHandler);

    // Trap focus within modal
    this.trapFocus();
  }

  close() {
    if (!this.overlay) return;

    this.overlay.classList.remove('active');
    
    setTimeout(() => {
      this.overlay?.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', this.escHandler);
      this.onClose();
    }, 200); // Match CSS transition duration
  }

  render() {
    const modal = document.createElement('div');
    modal.className = `modal modal-${this.size}`;
    if (this.loading) {
      modal.classList.add('loading');
    }

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2 class="modal-title">${this.title}</h2>
      <button class="modal-close" aria-label="Close">&times;</button>
    `;
    
    const closeBtn = header.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => this.close());

    modal.appendChild(header);

    // Tabs (if provided)
    if (this.tabs.length > 0) {
      const tabsNav = this.renderTabsNav();
      modal.appendChild(tabsNav);
    }

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    
    if (this.tabs.length > 0) {
      const activeTabContent = this.tabs.find(t => t.id === this.activeTab)?.content || '';
      body.innerHTML = activeTabContent;
    } else {
      body.innerHTML = this.content;
    }

    modal.appendChild(body);

    // Footer with actions
    if (this.actions.length > 0) {
      const footer = this.renderFooter();
      modal.appendChild(footer);
    }

    // Loading overlay
    if (this.loading) {
      const loader = document.createElement('div');
      loader.className = 'modal-loader';
      loader.innerHTML = '<div class="loading-spinner"></div>';
      modal.appendChild(loader);
    }

    return modal;
  }

  renderTabsNav() {
    const nav = document.createElement('nav');
    nav.className = 'modal-tabs';
    
    this.tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'modal-tab';
      btn.textContent = tab.label;
      btn.dataset.id = tab.id;
      
      if (tab.id === this.activeTab) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => this.switchTab(tab.id));
      nav.appendChild(btn);
    });

    return nav;
  }

  renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    this.actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = `btn-${action.variant || 'primary'}`;
      btn.textContent = action.label;
      btn.addEventListener('click', action.onClick);
      footer.appendChild(btn);
    });

    return footer;
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    
    const modal = this.overlay?.querySelector('.modal');
    if (!modal) return;

    // Update active tab indicator
    const tabs = modal.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
      if (tab.dataset.id === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update body content
    const body = modal.querySelector('.modal-body');
    const tabContent = this.tabs.find(t => t.id === tabId)?.content || '';
    body.innerHTML = tabContent;
  }

  setLoading(loading) {
    this.loading = loading;
    const modal = this.overlay?.querySelector('.modal');
    if (modal) {
      if (loading) {
        modal.classList.add('loading');
      } else {
        modal.classList.remove('loading');
      }
    }
  }

  trapFocus() {
    // TODO: Implement focus trap for accessibility
  }

  destroy() {
    this.close();
  }
}

export default Modal;
```

**CSS for Modal:** `web/src/styles/modal.css`

```css
/* Modal System */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.modal-overlay.with-backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal-overlay.active {
  opacity: 1;
}

.modal {
  background: var(--surface-1);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  transform: scale(0.95) translateY(20px);
  transition: transform 0.2s ease;
  position: relative;
}

.modal-overlay.active .modal {
  transform: scale(1) translateY(0);
}

.modal-small { width: 400px; }
.modal-medium { width: 600px; }
.modal-large { width: 900px; }
.modal-fullscreen { 
  width: 95vw; 
  height: 95vh; 
  max-height: 95vh;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.2s;
  padding: 0;
  width: 32px;
  height: 32px;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  background: var(--surface-0);
}

.modal-tab {
  padding: 1rem 1.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.modal-tab:hover {
  color: var(--text-primary);
  background: var(--surface-1);
}

.modal-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  position: sticky;
  bottom: 0;
  background: var(--surface-1);
}

.modal.loading .modal-body {
  opacity: 0.4;
  pointer-events: none;
}

.modal-loader {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 10;
}

/* Responsive */
@media (max-width: 768px) {
  .modal {
    width: 95vw !important;
    height: 95vh;
    max-height: 95vh;
  }
}
```

---

## Phase 3: Market-Specific Dashboards

### 3.1 Energy Market Dashboard

**File:** `web/src/components/markets/EnergyMarket.js`

```javascript
/**
 * Energy Market Dashboard
 * 
 * Surfaces:
 * - Provider registry and status
 * - Meter reading submissions
 * - Credit tracking
 * - Dispute management
 * - Settlement interface
 * - Market analytics (supply/demand, pricing)
 * 
 * Layout: Master-detail with filterable provider list
 * 
 * RPC Integration:
 * - energy.register_provider
 * - energy.submit_reading
 * - energy.market_state
 * - energy.settle
 * - energy.submit_dispute
 * - energy.dispute_history
 */

import { Component } from '../../lifecycle.js';
import MasterDetailLayout from '../../layouts/MasterDetailLayout.js';
import DataTable from '../DataTable.js';
import Modal from '../Modal.js';
import { fmt, $ } from '../../utils.js';

class EnergyMarket extends Component {
  constructor(rpc) {
    super('EnergyMarket');
    this.rpc = rpc;
    this.providers = [];
    this.disputes = [];
    this.selectedProvider = null;
  }

  async onMount() {
    await this.fetchMarketData();
    
    // Poll every 5s
    this.interval(() => this.fetchMarketData(), 5000);
    
    this.render();
  }

  async fetchMarketData() {
    try {
      const [marketState, disputes] = await Promise.all([
        this.rpc.call('energy.market_state'),
        this.rpc.call('energy.dispute_history', { limit: 100 }),
      ]);

      this.providers = marketState.providers || [];
      this.disputes = disputes.disputes || [];
      
      this.updateUI();
    } catch (error) {
      console.error('[EnergyMarket] Fetch error:', error);
    }
  }

  render() {
    const container = $('#app');

    // Sidebar content: Filters + Quick stats
    const sidebarHtml = `
      <div class="panel-section">
        <h3>Market Stats</h3>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Total Supply</div>
            <div class="stat-value" id="total-supply">—</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Active Providers</div>
            <div class="stat-value" id="active-providers">—</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Spot Price</div>
            <div class="stat-value" id="spot-price">—</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Outstanding Credits</div>
            <div class="stat-value" id="outstanding-credits">—</div>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3>Filters</h3>
        <label>
          Jurisdiction
          <select id="filter-jurisdiction">
            <option value="">All</option>
            <option value="US_CA">US_CA</option>
            <option value="US_TX">US_TX</option>
            <option value="EU_DE">EU_DE</option>
          </select>
        </label>

        <label>
          Status
          <div class="checkbox-group">
            <label><input type="checkbox" checked value="active" /> Active</label>
            <label><input type="checkbox" value="offline" /> Offline</label>
          </div>
        </label>
      </div>

      <div class="panel-section">
        <h3>Actions</h3>
        <button class="btn-primary w-full" id="btn-register-provider">
          + Register Provider
        </button>
        <button class="btn-secondary w-full" id="btn-submit-reading">
          Submit Reading
        </button>
        <button class="btn-secondary w-full" id="btn-settle">
          Batch Settle
        </button>
      </div>
    `;

    // Main content: Provider table + Disputes panel
    const mainHtml = `
      <section class="panel-section">
        <h2>Energy Providers</h2>
        <div id="providers-table"></div>
      </section>

      <section class="panel-section mt-4">
        <h2>Active Disputes</h2>
        <div id="disputes-table"></div>
      </section>
    `;

    const layout = new MasterDetailLayout({
      sidebar: sidebarHtml,
      main: mainHtml,
    });

    container.innerHTML = '';
    container.appendChild(layout.render());

    // Attach action handlers
    $('#btn-register-provider')?.addEventListener('click', () => this.showRegisterModal());
    $('#btn-submit-reading')?.addEventListener('click', () => this.showReadingModal());
    $('#btn-settle')?.addEventListener('click', () => this.showSettleModal());

    // Render tables
    this.renderProvidersTable();
    this.renderDisputesTable();
  }

  renderProvidersTable() {
    const container = $('#providers-table');
    if (!container) return;

    const table = new DataTable({
      columns: [
        { key: 'id', label: 'Provider ID', width: 120, sortable: true },
        { key: 'capacity_kwh', label: 'Capacity (kWh)', align: 'right', format: 'number', sortable: true },
        { key: 'price_per_kwh', label: 'Price/kWh', align: 'right', format: 'currency', sortable: true },
        { key: 'jurisdiction', label: 'Jurisdiction', filterable: true },
        { key: 'status', label: 'Status', render: (val) => {
          const variant = val === 'active' ? 'success' : 'danger';
          return `<span class="pill ${variant}">${val}</span>`;
        }},
        { key: 'last_reading', label: 'Last Reading', format: 'datetime', sortable: true },
      ],
       this.providers,
      selectable: true,
      rowActions: [
        { icon: '👁', label: 'View Details', onClick: (row) => this.viewProviderDetails(row) },
        { icon: '📊', label: 'View Readings', onClick: (row) => this.viewReadings(row) },
        { icon: '🚩', label: 'File Dispute', onClick: (row) => this.fileDispute(row) },
      ],
      bulkActions: [
        { label: 'Export Selected', onClick: (rows) => this.exportProviders(rows) },
      ],
    });

    container.innerHTML = '';
    container.appendChild(table.render());
  }

  renderDisputesTable() {
    const container = $('#disputes-table');
    if (!container) return;

    const table = new DataTable({
      columns: [
        { key: 'id', label: 'Dispute ID', width: 120 },
        { key: 'provider_id', label: 'Provider', width: 120 },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status', render: (val) => {
          const colors = { pending: 'warn', resolved: 'success', escalated: 'danger' };
          return `<span class="pill ${colors[val]}">${val}</span>`;
        }},
        { key: 'filed_at', label: 'Filed', format: 'datetime', sortable: true },
      ],
       this.disputes,
      rowActions: [
        { icon: '👁', label: 'View Details', onClick: (row) => this.viewDisputeDetails(row) },
        { icon: '✅', label: 'Resolve', onClick: (row) => this.resolveDispute(row) },
      ],
    });

    container.innerHTML = '';
    container.appendChild(table.render());
  }

  updateUI() {
    // Update sidebar stats
    const totalSupply = this.providers.reduce((sum, p) => sum + (p.capacity_kwh || 0), 0);
    const activeCount = this.providers.filter(p => p.status === 'active').length;
    const avgPrice = this.providers.length > 0
      ? this.providers.reduce((sum, p) => sum + (p.price_per_kwh || 0), 0) / this.providers.length
      : 0;

    $('#total-supply').textContent = fmt.num(totalSupply) + ' kWh';
    $('#active-providers').textContent = activeCount;
    $('#spot-price').textContent = fmt.currency(avgPrice) + '/kWh';
    $('#outstanding-credits').textContent = '—'; // TODO: Get from RPC

    // Refresh tables (if already rendered)
    // table.setData(this.providers);
  }

  // Modal actions
  showRegisterModal() {
    const modal = new Modal({
      title: 'Register Energy Provider',
      size: 'medium',
      content: `
        <form id="register-provider-form">
          <label>
            Capacity (kWh)
            <input type="number" name="capacity_kwh" required />
          </label>
          <label>
            Price per kWh (BLOCK)
            <input type="number" step="0.01" name="price_per_kwh" required />
          </label>
          <label>
            Meter Address
            <input type="text" name="meter_address" required />
          </label>
          <label>
            Jurisdiction
            <select name="jurisdiction" required>
              <option value="US_CA">US_CA</option>
              <option value="US_TX">US_TX</option>
              <option value="EU_DE">EU_DE</option>
            </select>
          </label>
          <label>
            Stake (BLOCK)
            <input type="number" name="stake" required />
          </label>
          <label>
            Owner Account ID
            <input type="text" name="owner" required />
          </label>
        </form>
      `,
      actions: [
        { 
          label: 'Register', 
          variant: 'primary', 
          onClick: async () => {
            const form = document.getElementById('register-provider-form');
            const data = new FormData(form);
            modal.setLoading(true);
            
            try {
              await this.rpc.call('energy.register_provider', Object.fromEntries(data));
              modal.close();
              await this.fetchMarketData();
            } catch (error) {
              alert('Registration failed: ' + error.message);
            } finally {
              modal.setLoading(false);
            }
          }
        },
        { label: 'Cancel', onClick: () => modal.close() },
      ],
    });

    modal.show();
  }

  showReadingModal() {
    // TODO: Implement meter reading submission modal
    alert('Reading submission modal TBD');
  }

  showSettleModal() {
    // TODO: Implement batch settlement modal
    alert('Settlement modal TBD');
  }

  viewProviderDetails(provider) {
    const modal = new Modal({
      title: `Provider ${provider.id}`,
      size: 'large',
      tabs: [
        { id: 'details', label: 'Details', content: this.renderProviderDetails(provider) },
        { id: 'readings', label: 'Readings', content: '<p>Readings history TBD</p>' },
        { id: 'credits', label: 'Credits', content: '<p>Credit tracking TBD</p>' },
      ],
      actions: [
        { label: 'Close', onClick: () => modal.destroy() },
      ],
    });

    modal.show();
  }

  renderProviderDetails(provider) {
    return `
      <div class="details-grid">
        <div class="detail-row">
          <span class="detail-label">Provider ID</span>
          <span class="detail-value">${provider.id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Capacity</span>
          <span class="detail-value">${fmt.num(provider.capacity_kwh)} kWh</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Price</span>
          <span class="detail-value">${fmt.currency(provider.price_per_kwh)}/kWh</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Jurisdiction</span>
          <span class="detail-value">${provider.jurisdiction}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value"><span class="pill ${provider.status === 'active' ? 'success' : 'danger'}">${provider.status}</span></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Meter Address</span>
          <span class="detail-value">${provider.meter_address}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Stake</span>
          <span class="detail-value">${fmt.num(provider.stake)} BLOCK</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Owner</span>
          <span class="detail-value">${provider.owner}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Last Reading</span>
          <span class="detail-value">${provider.last_reading ? new Date(provider.last_reading).toLocaleString() : '—'}</span>
        </div>
      </div>
    `;
  }

  viewReadings(provider) {
    // TODO: Fetch and display provider's reading history
    alert(`View readings for ${provider.id}`);
  }

  fileDispute(provider) {
    // TODO: Open dispute filing modal
    alert(`File dispute against ${provider.id}`);
  }

  viewDisputeDetails(dispute) {
    // TODO: Open dispute detail modal with timeline
    alert(`View dispute ${dispute.id}`);
  }

  resolveDispute(dispute) {
    // TODO: Call energy.resolve_dispute RPC
    alert(`Resolve dispute ${dispute.id}`);
  }

  exportProviders(providers) {
    // TODO: Export selected providers to CSV
    console.log('Export', providers);
  }
}

export default EnergyMarket;
```

### 3.2 Compute Market Dashboard

**Placeholder - Follow same pattern as Energy Market**

**File:** `web/src/components/markets/ComputeMarket.js`

**Key Features:**
- Job submission form with code/binary upload
- Job queue visualization (depth, wait time, throughput)
- Provider performance dashboard (SLA compliance, latency)
- Receipt audit interface (uses `receipt.audit` RPC)
- Proof verification UI
- Resource allocation optimizer

**RPC Integration:**
- `compute_market.submit_job`
- `compute_market.job_status`
- `compute_market.list_providers`
- `scheduler.stats`
- `receipt.audit` (with `market=compute` filter)

### 3.3 Ad Market Dashboard

**Placeholder - Follow same pattern**

**File:** `web/src/components/markets/AdMarket.js`

**Key Features:**
- Campaign management (create, pause, resume)
- Bid submission interface
- Cohort audience builder (demographic targeting)
- Performance analytics (impressions, clicks, CTR, CPA)
- Policy compliance dashboard
- Budget allocation and spend tracking

**RPC Integration:**
- `ad_market.submit_bid`
- `ad_market.list_campaigns` (mock until backend implements)
- `ad_market.cohort_query`
- `ad_market.policy_snapshot`

### 3.4 Storage Market Dashboard

**Placeholder**

**File:** `web/src/components/markets/StorageMarket.js`

**Key Features:**
- File upload/download interface
- Storage provider list with capacity/pricing
- Rent escrow status tracking
- Storage receipt auditing

**RPC Integration:**
- `storage.put`
- `storage.get`
- `storage.list`
- `rent.escrow.balance`

---

## Phase 4: Receipt Audit Interface

### 4.1 Canonical Receipt Audit Dashboard

**File:** `web/src/components/ReceiptAudit.js`

**Purpose:** Surface `receipt.audit` RPC for comprehensive receipt inspection across all markets.

**Layout:** Master-detail with advanced filtering

```javascript
/**
 * Receipt Audit Dashboard
 * 
 * Features:
 * - Historical receipt replay with filters (block range, provider, market)
 * - Subsidy breakdown per receipt
 * - Dispute tracking per receipt
 * - Export to CSV/JSON
 * - Drill-down to provider/transaction details
 * 
 * RPC: receipt.audit
 * 
 * Request Filters:
 * - start_height / end_height (inclusive)
 * - limit (default 128, max 512)
 * - provider_id (exact match, trimmed)
 * - market (case-insensitive: storage, compute, energy, ad, relay)
 * 
 * Response Schema:
 * - schema_version (starts at 1)
 * - receipts (sorted by block_height, receipt_index, type, digest)
 * - scanned_range { start, end }
 * - truncated (boolean)
 * - next_start_height (pagination hint)
 */

import { Component } from '../lifecycle.js';
import DataTable from './DataTable.js';
import Modal from './Modal.js';
import MasterDetailLayout from '../layouts/MasterDetailLayout.js';
import { fmt, $ } from '../utils.js';

class ReceiptAudit extends Component {
  constructor(rpc) {
    super('ReceiptAudit');
    this.rpc = rpc;
    this.receipts = [];
    this.filters = {
      start_height: null,
      end_height: null,
      limit: 128,
      provider_id: '',
      market: '',
    };
    this.scannedRange = null;
    this.truncated = false;
    this.nextStartHeight = null;
  }

  async onMount() {
    this.render();
    await this.fetchReceipts();
  }

  async fetchReceipts(append = false) {
    try {
      const params = {};
      
      if (this.filters.start_height) params.start_height = this.filters.start_height;
      if (this.filters.end_height) params.end_height = this.filters.end_height;
      if (this.filters.limit) params.limit = this.filters.limit;
      if (this.filters.provider_id) params.provider_id = this.filters.provider_id.trim();
      if (this.filters.market) params.market = this.filters.market;

      const response = await this.rpc.call('receipt.audit', params);

      if (append) {
        this.receipts.push(...response.receipts);
      } else {
        this.receipts = response.receipts;
      }

      this.scannedRange = response.scanned_range;
      this.truncated = response.truncated;
      this.nextStartHeight = response.next_start_height;

      this.updateUI();
    } catch (error) {
      console.error('[ReceiptAudit] Fetch error:', error);
    }
  }

  render() {
    const container = $('#app');

    // Sidebar: Filters + Stats
    const sidebarHtml = `
      <div class="panel-section">
        <h3>Filters</h3>
        <form id="receipt-filters">
          <label>
            Start Block Height
            <input type="number" name="start_height" placeholder="e.g., 1000" />
          </label>
          <label>
            End Block Height
            <input type="number" name="end_height" placeholder="e.g., 2000" />
          </label>
          <label>
            Provider ID
            <input type="text" name="provider_id" placeholder="e.g., energy-0x01" />
          </label>
          <label>
            Market
            <select name="market">
              <option value="">All Markets</option>
              <option value="storage">Storage</option>
              <option value="compute">Compute</option>
              <option value="energy">Energy</option>
              <option value="ad">Ad</option>
              <option value="relay">Relay</option>
            </select>
          </label>
          <label>
            Limit
            <input type="number" name="limit" value="128" min="1" max="512" />
          </label>
          <button type="submit" class="btn-primary w-full">Apply Filters</button>
          <button type="button" class="btn-ghost w-full" id="btn-reset-filters">Reset</button>
        </form>
      </div>

      <div class="panel-section">
        <h3>Scan Results</h3>
        <div class="stat-item">
          <div class="stat-label">Receipts Found</div>
          <div class="stat-value" id="receipts-count">—</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Scanned Range</div>
          <div class="stat-value" id="scanned-range">—</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Truncated</div>
          <div class="stat-value" id="truncated-status">—</div>
        </div>
      </div>

      <div class="panel-section" id="load-more-section" style="display: none;">
        <button class="btn-secondary w-full" id="btn-load-more">Load More</button>
      </div>
    `;

    // Main content: Receipt table
    const mainHtml = `
      <section class="panel-section">
        <div class="section-header">
          <h2>Canonical Receipt Audit Trail</h2>
          <button class="btn-secondary" id="btn-export-csv">Export CSV</button>
        </div>
        <div id="receipts-table"></div>
      </section>
    `;

    const layout = new MasterDetailLayout({
      sidebar: sidebarHtml,
      main: mainHtml,
    });

    container.innerHTML = '';
    container.appendChild(layout.render());

    // Attach handlers
    const form = $('#receipt-filters');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      this.filters = {
        start_height: data.get('start_height') ? parseInt(data.get('start_height')) : null,
        end_height: data.get('end_height') ? parseInt(data.get('end_height')) : null,
        limit: parseInt(data.get('limit')) || 128,
        provider_id: data.get('provider_id') || '',
        market: data.get('market') || '',
      };
      this.fetchReceipts();
    });

    $('#btn-reset-filters')?.addEventListener('click', () => {
      form.reset();
      this.filters = { start_height: null, end_height: null, limit: 128, provider_id: '', market: '' };
      this.fetchReceipts();
    });

    $('#btn-load-more')?.addEventListener('click', () => {
      if (this.nextStartHeight) {
        this.filters.start_height = this.nextStartHeight;
        this.fetchReceipts(true);
      }
    });

    $('#btn-export-csv')?.addEventListener('click', () => this.exportCSV());

    this.renderReceiptsTable();
  }

  renderReceiptsTable() {
    const container = $('#receipts-table');
    if (!container) return;

    const table = new DataTable({
      columns: [
        { key: 'block_height', label: 'Block', width: 80, sortable: true },
        { key: 'receipt_type', label: 'Type', width: 100 },
        { key: 'receipt_index', label: 'Index', width: 60, align: 'right' },
        { key: 'provider_id', label: 'Provider/Publisher', width: 150, filterable: true },
        { key: 'amount', label: 'Amount', align: 'right', format: 'number', sortable: true },
        { key: 'digest_hex', label: 'Digest', width: 140, render: (val) => 
          `<code class="mono-text">${val.slice(0, 12)}...</code>`
        },
        { key: 'subsidy_total', label: 'Subsidies', align: 'right', render: (val, row) => {
          const total = (row.subsidies?.storage || 0) + 
                        (row.subsidies?.read || 0) + 
                        (row.subsidies?.compute || 0) + 
                        (row.subsidies?.ad || 0) + 
                        (row.subsidies?.rebate || 0);
          return fmt.num(total);
        }},
        { key: 'disputes_count', label: 'Disputes', align: 'center', render: (val, row) => {
          const count = (row.disputes?.energy?.length || 0) + (row.disputes?.compute?.length || 0);
          return count > 0 ? `<span class="pill warn">${count}</span>` : '—';
        }},
      ],
       this.receipts.map(r => ({
        ...r,
        provider_id: r.audit?.provider_identity || '—',
        subsidy_total: 0, // Computed in render
        disputes_count: 0, // Computed in render
      })),
      rowActions: [
        { icon: '👁', label: 'View Details', onClick: (row) => this.viewReceiptDetails(row) },
        { icon: '📊', label: 'View Subsidies', onClick: (row) => this.viewSubsidies(row) },
      ],
    });

    container.innerHTML = '';
    container.appendChild(table.render());
  }

  updateUI() {
    $('#receipts-count').textContent = this.receipts.length;
    $('#scanned-range').textContent = this.scannedRange 
      ? `${this.scannedRange.start} - ${this.scannedRange.end}`
      : '—';
    $('#truncated-status').textContent = this.truncated ? 'Yes (more available)' : 'No';

    // Show load more button if truncated
    const loadMoreSection = $('#load-more-section');
    if (this.truncated) {
      loadMoreSection.style.display = 'block';
    } else {
      loadMoreSection.style.display = 'none';
    }

    // Refresh table
    this.renderReceiptsTable();
  }

  viewReceiptDetails(receipt) {
    const modal = new Modal({
      title: `Receipt ${receipt.receipt_type} @ Block ${receipt.block_height}`,
      size: 'large',
      tabs: [
        { id: 'details', label: 'Details', content: this.renderReceiptDetailsTab(receipt) },
        { id: 'subsidies', label: 'Subsidies', content: this.renderSubsidiesTab(receipt) },
        { id: 'disputes', label: 'Disputes', content: this.renderDisputesTab(receipt) },
        { id: 'audit', label: 'Audit Trail', content: this.renderAuditTab(receipt) },
      ],
      actions: [
        { label: 'Export JSON', onClick: () => this.exportReceiptJSON(receipt), variant: 'secondary' },
        { label: 'Close', onClick: () => modal.destroy() },
      ],
    });

    modal.show();
  }

  renderReceiptDetailsTab(receipt) {
    return `
      <div class="details-grid">
        <div class="detail-row"><span class="detail-label">Block Height</span><span class="detail-value">${receipt.block_height}</span></div>
        <div class="detail-row"><span class="detail-label">Receipt Index</span><span class="detail-value">${receipt.receipt_index}</span></div>
        <div class="detail-row"><span class="detail-label">Receipt Type</span><span class="detail-value">${receipt.receipt_type}</span></div>
        <div class="detail-row"><span class="detail-label">Digest</span><span class="detail-value"><code class="mono-text">${receipt.digest_hex}</code></span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">${fmt.num(receipt.amount)}</span></div>
        <div class="detail-row"><span class="detail-label">Provider/Publisher</span><span class="detail-value">${receipt.audit?.provider_identity || '—'}</span></div>
      </div>

      <h3 class="mt-4">Receipt Payload</h3>
      <pre class="code-block">${JSON.stringify(receipt.receipt, null, 2)}</pre>
    `;
  }

  renderSubsidiesTab(receipt) {
    const subsidies = receipt.subsidies || {};
    const total = (subsidies.storage || 0) + 
                  (subsidies.read || 0) + 
                  (subsidies.compute || 0) + 
                  (subsidies.ad || 0) + 
                  (subsidies.rebate || 0);

    return `
      <div class="subsidy-breakdown">
        <div class="subsidy-item">
          <span class="subsidy-label">Storage</span>
          <span class="subsidy-value">${fmt.num(subsidies.storage || 0)}</span>
        </div>
        <div class="subsidy-item">
          <span class="subsidy-label">Read</span>
          <span class="subsidy-value">${fmt.num(subsidies.read || 0)}</span>
        </div>
        <div class="subsidy-item">
          <span class="subsidy-label">Compute</span>
          <span class="subsidy-value">${fmt.num(subsidies.compute || 0)}</span>
        </div>
        <div class="subsidy-item">
          <span class="subsidy-label">Ad</span>
          <span class="subsidy-value">${fmt.num(subsidies.ad || 0)}</span>
        </div>
        <div class="subsidy-item">
          <span class="subsidy-label">Rebate</span>
          <span class="subsidy-value">${fmt.num(subsidies.rebate || 0)}</span>
        </div>
        <div class="subsidy-item subsidy-total">
          <span class="subsidy-label">Total</span>
          <span class="subsidy-value">${fmt.num(total)}</span>
        </div>
      </div>
    `;
  }

  renderDisputesTab(receipt) {
    const energyDisputes = receipt.disputes?.energy || [];
    const computeDisputes = receipt.disputes?.compute || [];
    const allDisputes = [...energyDisputes, ...computeDisputes];

    if (allDisputes.length === 0) {
      return '<p class="muted text-center p-8">No disputes for this receipt</p>';
    }

    return `
      <div class="disputes-list">
        ${allDisputes.map(d => `
          <div class="dispute-item">
            <div class="dispute-header">
              <span class="dispute-id">${d.id || d.identifier}</span>
              <span class="pill ${d.status === 'resolved' ? 'success' : 'warn'}">${d.status}</span>
            </div>
            <div class="dispute-details">
              <div><strong>Reason:</strong> ${d.reason}</div>
              <div><strong>Filed:</strong> ${d.filed_at ? new Date(d.filed_at).toLocaleString() : '—'}</div>
              ${d.resolved_at ? `<div><strong>Resolved:</strong> ${new Date(d.resolved_at).toLocaleString()}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderAuditTab(receipt) {
    const audit = receipt.audit || {};

    return `
      <div class="details-grid">
        <div class="detail-row"><span class="detail-label">Audit Queries</span><span class="detail-value">${audit.audit_queries || 0}</span></div>
        <div class="detail-row"><span class="detail-label">Invariants</span><span class="detail-value">${audit.invariants || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Causality</span><span class="detail-value">${audit.causality || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Provider Identity</span><span class="detail-value">${audit.provider_identity || '—'}</span></div>
      </div>

      <h3 class="mt-4">Full Audit Record</h3>
      <pre class="code-block">${JSON.stringify(audit, null, 2)}</pre>
    `;
  }

  viewSubsidies(receipt) {
    // Quick modal for subsidy breakdown
    const modal = new Modal({
      title: 'Subsidy Breakdown',
      size: 'small',
      content: this.renderSubsidiesTab(receipt),
      actions: [{ label: 'Close', onClick: () => modal.destroy() }],
    });
    modal.show();
  }

  exportCSV() {
    const headers = ['Block Height', 'Type', 'Index', 'Provider', 'Amount', 'Digest', 'Subsidy Total', 'Disputes'];
    const rows = this.receipts.map(r => {
      const subsidyTotal = (r.subsidies?.storage || 0) + 
                           (r.subsidies?.read || 0) + 
                           (r.subsidies?.compute || 0) + 
                           (r.subsidies?.ad || 0) + 
                           (r.subsidies?.rebate || 0);
      const disputeCount = (r.disputes?.energy?.length || 0) + (r.disputes?.compute?.length || 0);

      return [
        r.block_height,
        r.receipt_type,
        r.receipt_index,
        r.audit?.provider_identity || '—',
        r.amount,
        r.digest_hex,
        subsidyTotal,
        disputeCount,
      ];
    });

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipt_audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  exportReceiptJSON(receipt) {
    const json = JSON.stringify(receipt, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${receipt.block_height}_${receipt.receipt_index}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export default ReceiptAudit;
```

---

## Phase 5: Real-Time Streaming UI

### 5.1 WebSocket UI Integration Patterns

**Current State:** WebSocket infrastructure exists (`ws.js`) but minimal UI integration.

**Required Patterns:**

1. **Real-Time Metric Updates** (no polling)
2. **Event Stream Visualization** (block production, transactions)
3. **Live Activity Feed** (recent actions across markets)
4. **Notification System** (disputes filed, settlements complete)
5. **Collaborative Cursors** (optional: multi-user operations dashboard)

**Implementation Example:** Live Block Stream

**File:** `web/src/components/LiveBlockStream.js`

```javascript
/**
 * Live Block Stream Component
 * 
 * Displays real-time block production with animations
 * Uses WebSocket 'block.new' event
 * 
 * Features:
 * - Animated block entrance (slide in from top)
 * - Sparkline of recent block times
 * - Click to view block details
 * - Auto-scroll to latest (with pause button)
 */

import { Component } from '../lifecycle.js';
import { fmt } from '../utils.js';

class LiveBlockStream extends Component {
  constructor(ws) {
    super('LiveBlockStream');
    this.ws = ws;
    this.blocks = [];
    this.maxBlocks = 20;
    this.autoscroll = true;
  }

  onMount() {
    // Subscribe to WebSocket block events
    this.ws.on('block.new', (block) => this.handleNewBlock(block));

    this.render();
  }

  handleNewBlock(block) {
    this.blocks.unshift(block);
    
    if (this.blocks.length > this.maxBlocks) {
      this.blocks.pop();
    }

    this.updateStream();
  }

  render() {
    const container = document.createElement('div');
    container.className = 'live-block-stream';

    container.innerHTML = `
      <div class="stream-header">
        <h3>Live Block Stream</h3>
        <button class="btn-ghost btn-sm" id="toggle-autoscroll">
          ${this.autoscroll ? 'Pause' : 'Resume'}
        </button>
      </div>
      <div class="stream-container" id="block-stream-list"></div>
    `;

    const toggleBtn = container.querySelector('#toggle-autoscroll');
    toggleBtn.addEventListener('click', () => {
      this.autoscroll = !this.autoscroll;
      toggleBtn.textContent = this.autoscroll ? 'Pause' : 'Resume';
    });

    return container;
  }

  updateStream() {
    const list = document.getElementById('block-stream-list');
    if (!list) return;

    // Clear and re-render (or use incremental DOM updates)
    list.innerHTML = this.blocks.map(block => `
      <div class="block-item animate-slide-in" data-height="${block.height}">
        <div class="block-header">
          <span class="block-height">#${block.height}</span>
          <span class="block-time">${new Date(block.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="block-details">
          <span class="block-txs">${block.tx_count || 0} txs</span>
          <span class="block-producer">${block.producer || '—'}</span>
          <span class="block-time-ms">${block.block_time_ms}ms</span>
        </div>
      </div>
    `).join('');

    // Auto-scroll to top if enabled
    if (this.autoscroll) {
      list.scrollTop = 0;
    }
  }
}

export default LiveBlockStream;
```

**CSS for Live Stream:** `web/src/styles/live-stream.css`

```css
.live-block-stream {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-1);
  overflow: hidden;
}

.stream-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stream-container {
  max-height: 400px;
  overflow-y: auto;
  padding: 1rem;
}

.block-item {
  background: var(--surface-0);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.block-item:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.block-item.animate-slide-in {
  animation: slideInFromTop 0.3s ease-out;
}

@keyframes slideInFromTop {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.block-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.block-height {
  font-weight: 600;
  color: var(--accent-primary);
}

.block-time {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.block-details {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
```

---

## Phase 6: Router and Navigation Enhancements

### 6.1 Updated Router with Market Routes

**File:** `web/src/router.js` (Update)

```javascript
/**
 * Enhanced Router with Market Routes
 * 
 * New Routes:
 * - /dashboard (default, overview)
 * - /markets/energy
 * - /markets/compute
 * - /markets/ad
 * - /markets/storage
 * - /receipts (audit interface)
 * - /governance
 * - /treasury
 * - /operations
 * - /analytics
 * - /explorer (blocks, txs, accounts)
 */

import TheBlock from './components/TheBlock.js';
import Network from './components/Network.js';
import Trading from './components/Trading.js';
import EnergyMarket from './components/markets/EnergyMarket.js';
import ComputeMarket from './components/markets/ComputeMarket.js';
import AdMarket from './components/markets/AdMarket.js';
import StorageMarket from './components/markets/StorageMarket.js';
import ReceiptAudit from './components/ReceiptAudit.js';

const routes = {
  '/dashboard': { component: TheBlock, label: 'Dashboard', icon: '📊' },
  '/network': { component: Network, label: 'Network', icon: '🌐' },
  '/markets/energy': { component: EnergyMarket, label: 'Energy Market', icon: '⚡' },
  '/markets/compute': { component: ComputeMarket, label: 'Compute Market', icon: '🖥️' },
  '/markets/ad': { component: AdMarket, label: 'Ad Market', icon: '📢' },
  '/markets/storage': { component: StorageMarket, label: 'Storage Market', icon: '💾' },
  '/receipts': { component: ReceiptAudit, label: 'Receipt Audit', icon: '🧾' },
  '/trading': { component: Trading, label: 'Trading (Legacy)', icon: '📈' }, // Keep for now
  // TODO: Add /governance, /treasury, /operations, /analytics, /explorer
};

class Router {
  constructor(rpc, ws) {
    this.rpc = rpc;
    this.ws = ws;
    this.currentComponent = null;
    this.currentRoute = null;
  }

  init() {
    // Handle hash change
    window.addEventListener('hashchange', () => this.handleRoute());
    
    // Initial route
    this.handleRoute();
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const route = routes[hash];

    if (!route) {
      console.warn('[Router] Unknown route:', hash);
      window.location.hash = '#/dashboard';
      return;
    }

    // Unmount previous component
    if (this.currentComponent) {
      this.currentComponent.unmount();
    }

    // Mount new component
    const ComponentClass = route.component;
    this.currentComponent = new ComponentClass(this.rpc, this.ws);
    this.currentComponent.mount();

    this.currentRoute = hash;

    // Update navigation active state
    this.updateNavigation(hash);

    // Update page title
    document.title = `${route.label} · Block Buster`;
  }

  updateNavigation(activeRoute) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === `#${activeRoute}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  getRoutes() {
    return routes;
  }
}

export default Router;
```

### 6.2 Enhanced Navigation Component

**File:** `web/src/components/Navigation.js` (Update)

```javascript
/**
 * Enhanced Navigation with Market Submenus
 */

import { Component } from '../lifecycle.js';

class Navigation extends Component {
  constructor(routes) {
    super('Navigation');
    this.routes = routes;
  }

  render() {
    const nav = document.createElement('nav');
    nav.className = 'app-nav';

    // Group routes by category
    const mainRoutes = ['/dashboard', '/network'];
    const marketRoutes = ['/markets/energy', '/markets/compute', '/markets/ad', '/markets/storage'];
    const toolRoutes = ['/receipts', '/trading'];

    nav.innerHTML = `
      <div class="nav-brand">
        <a href="#/dashboard" class="brand-link">
          <span class="brand-icon">🚀</span>
          <span class="brand-text">Block Buster</span>
        </a>
      </div>

      <div class="nav-links">
        ${this.renderNavSection('Main', mainRoutes)}
        ${this.renderNavSection('Markets', marketRoutes)}
        ${this.renderNavSection('Tools', toolRoutes)}
      </div>

      <div class="nav-footer">
        <button class="nav-link" id="nav-settings">⚙️ Settings</button>
      </div>
    `;

    return nav;
  }

  renderNavSection(title, routePaths) {
    const routes = routePaths.map(path => ({
      path,
      ...this.routes[path],
    })).filter(r => r.component);

    return `
      <div class="nav-section">
        <div class="nav-section-title">${title}</div>
        ${routes.map(route => `
          <a href="#${route.path}" class="nav-link" data-route="${route.path}">
            <span class="nav-icon">${route.icon}</span>
            <span class="nav-label">${route.label}</span>
          </a>
        `).join('')}
      </div>
    `;
  }
}

export default Navigation;
```

**CSS for Enhanced Navigation:** `web/src/styles/navigation.css`

```css
.app-nav {
  background: var(--surface-1);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  width: 240px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
}

.nav-brand {
  padding: 1.5rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 1.125rem;
}

.brand-icon {
  font-size: 1.5rem;
}

.nav-links {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
}

.nav-section {
  margin-bottom: 1.5rem;
}

.nav-section-title {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.nav-link:hover {
  background: var(--surface-0);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--accent-primary-alpha-10);
  color: var(--accent-primary);
  border-left-color: var(--accent-primary);
  font-weight: 600;
}

.nav-icon {
  font-size: 1.25rem;
}

.nav-label {
  font-size: 0.875rem;
}

.nav-footer {
  border-top: 1px solid var(--border-color);
  padding: 1rem;
}
```

---

## Phase 7: Performance Optimization

### 7.1 Virtual Scrolling for Large Tables

**Pattern:** Use Intersection Observer API to render only visible rows.

**Implementation:** Extend DataTable component with virtual scrolling option.

```javascript
// In DataTable.js constructor:
this.virtualScroll = options.virtualScroll !== false;
this.rowHeight = options.rowHeight || 48; // Fixed row height required for virtual scroll

// Modify renderBody():
renderBody() {
  if (this.virtualScroll) {
    return this.renderVirtualBody();
  }
  return this.renderStaticBody();
}

renderVirtualBody() {
  const tbody = document.createElement('tbody');
  tbody.style.height = `${this.data.length * this.rowHeight}px`;
  tbody.style.position = 'relative';

  // Render only visible rows (use Intersection Observer or scroll position)
  const visibleStart = Math.floor(this.scrollTop / this.rowHeight);
  const visibleEnd = Math.ceil((this.scrollTop + this.viewportHeight) / this.rowHeight);

  const visibleRows = this.data.slice(visibleStart, visibleEnd);

  visibleRows.forEach((row, index) => {
    const tr = this.renderRow(row, visibleStart + index);
    tr.style.position = 'absolute';
    tr.style.top = `${(visibleStart + index) * this.rowHeight}px`;
    tbody.appendChild(tr);
  });

  return tbody;
}
```

### 7.2 Debounced Render Updates

**Pattern:** Use requestAnimationFrame for batch DOM updates.

```javascript
// In state.js or component lifecycle:
class Component {
  scheduleRender() {
    if (this.renderPending) return;
    
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.refresh();
      this.renderPending = false;
    });
  }
}
```

### 7.3 Code Splitting and Lazy Loading

**Pattern:** Load market components only when navigated to.

```javascript
// In router.js:
const routes = {
  '/markets/energy': { 
    component: () => import('./components/markets/EnergyMarket.js'),
    label: 'Energy Market',
  },
};

async handleRoute() {
  const hash = window.location.hash.slice(1) || '/dashboard';
  const route = routes[hash];

  // Lazy load component
  const ComponentClass = typeof route.component === 'function'
    ? await route.component()
    : route.component;

  this.currentComponent = new ComponentClass.default(this.rpc, this.ws);
  this.currentComponent.mount();
}
```

---

## Phase 8: Testing and Validation

### 8.1 Component Testing Checklist

**For Each Component:**

- [ ] Renders without errors
- [ ] Handles null/undefined data gracefully
- [ ] Updates on state changes
- [ ] Cleans up on unmount (timers, subscriptions, event listeners)
- [ ] Keyboard navigation works
- [ ] Mobile responsive
- [ ] Accessibility (ARIA labels, focus management)

### 8.2 Integration Testing

**Test Scenarios:**

1. **Market Dashboard Flow:**
   - Navigate to Energy Market
   - Apply filters (jurisdiction, status)
   - Select provider from table
   - View provider details modal
   - Submit meter reading
   - File dispute
   - Export providers to CSV

2. **Receipt Audit Flow:**
   - Navigate to Receipt Audit
   - Set block range filter
   - Set market filter (energy)
   - View receipt details
   - Inspect subsidies breakdown
   - Export to CSV

3. **Real-Time Stream:**
   - Monitor live block stream
   - Pause/resume auto-scroll
   - Click block to view details

### 8.3 Performance Benchmarks

**Target Metrics:**

- **Initial Load:** < 2s (time to first contentful paint)
- **Route Transition:** < 100ms (component mount)
- **Table Render:** < 50ms for 1000 rows (with virtual scroll)
- **WebSocket Message Handling:** < 10ms (event to UI update)
- **Modal Open:** < 50ms (animation complete)

**Tools:**

- `perf.js` (already exists) for custom timing
- Chrome DevTools Performance tab
- Lighthouse CI for automated audits

---

## Phase 9: Documentation and Handoff

### 9.1 Component API Documentation

**For Each Component, Document:**

```javascript
/**
 * ComponentName
 * 
 * Purpose: [Brief description]
 * 
 * Props/Options:
 * - option1: [type] - [description]
 * - option2: [type] - [description]
 * 
 * Public Methods:
 * - method1(arg): [description]
 * 
 * Events:
 * - event1: [when fired, payload]
 * 
 * Usage Example:
 * ```js
 * const component = new ComponentName({ ... });
 * component.mount();
 * ```
 * 
 * Dependencies:
 * - RPC methods: [list]
 * - State keys: [list]
 * - Other components: [list]
 */
```

### 9.2 User Guide (for Operators)

**Create:** `web/docs/USER_GUIDE.md`

**Sections:**

1. Dashboard Overview
2. Navigating Markets
3. Filtering and Searching
4. Viewing Details (modals, drill-downs)
5. Exporting Data
6. Keyboard Shortcuts
7. Troubleshooting

### 9.3 Developer Onboarding

**Create:** `web/docs/DEVELOPER_ONBOARDING.md`

**Sections:**

1. Architecture Overview
2. Component Lifecycle
3. State Management
4. RPC Integration Patterns
5. Adding a New Market Dashboard
6. Styling Conventions
7. Testing Guidelines
8. Deployment Checklist

---

## Summary: What to Build Next (Priority Order)

### Immediate (Week 1-2):
1. ✅ Implement MasterDetailLayout component
2. ✅ Implement DataTable component (core features: sorting, filtering, pagination)
3. ✅ Implement Modal system
4. ✅ Build Energy Market dashboard (priority market)
5. ✅ Build Receipt Audit interface
6. ✅ Update Router with market routes
7. ✅ Enhance Navigation component with submenus

### Short-Term (Week 3-4):
8. Build Compute Market dashboard
9. Build Ad Market dashboard
10. Build Storage Market dashboard
11. Implement Live Block Stream component
12. Add real-time WebSocket UI updates (replace polling)
13. Implement FilterBuilder component
14. Add bulk actions to tables

### Medium-Term (Week 5-6):
15. Build Governance dashboard (proposals, voting)
16. Build Treasury dashboard (disbursements, balances)
17. Build Operations dashboard (scheduler, network health)
18. Build Analytics dashboard (aggregated metrics)
19. Implement time-series chart components
20. Add workspace customization (drag-and-drop panels)

### Long-Term (Month 2+):
21. Build Explorer (blocks, transactions, accounts)
22. Add advanced visualizations (network graph, heatmaps)
23. Implement collaborative features (if multi-user)
24. Add export/import for dashboard configurations
25. Mobile app (progressive web app)
26. Performance profiling and optimization pass

---

## Code Organization Best Practices

### File Structure:
```
web/
├── src/
│   ├── components/
│   │   ├── common/           # Reusable UI components
│   │   │   ├── DataTable.js
│   │   │   ├── Modal.js
│   │   │   ├── FilterBuilder.js
│   │   │   └── Timeline.js
│   │   ├── markets/          # Market-specific dashboards
│   │   │   ├── EnergyMarket.js
│   │   │   ├── ComputeMarket.js
│   │   │   ├── AdMarket.js
│   │   │   └── StorageMarket.js
│   │   ├── TheBlock.js       # Main dashboard
│   │   ├── Network.js
│   │   ├── ReceiptAudit.js
│   │   ├── Governance.js
│   │   ├── Treasury.js
│   │   └── Navigation.js
│   ├── layouts/              # Layout components
│   │   ├── MasterDetailLayout.js
│   │   └── WorkspaceLayout.js
│   ├── styles/               # CSS modules
│   │   ├── variables.css     # Design tokens
│   │   ├── layouts.css
│   │   ├── data-table.css
│   │   ├── modal.css
│   │   ├── navigation.css
│   │   └── live-stream.css
│   ├── utils/                # Utilities
│   │   ├── formatters.js
│   │   ├── validators.js
│   │   └── exporters.js
│   ├── api.js                # Legacy API wrapper
│   ├── rpc.js                # RPC client
│   ├── ws.js                 # WebSocket client
│   ├── router.js             # Router
│   ├── state.js              # State management
│   ├── lifecycle.js          # Component lifecycle
│   ├── perf.js               # Performance monitoring
│   └── main.js               # Entry point
├── docs/                     # Documentation
│   ├── UX_TRANSFORMATION_SPEC.md
│   ├── UX_IMPLEMENTATION_GUIDE.md  # This file
│   ├── COMPONENT_API.md
│   ├── USER_GUIDE.md
│   └── DEVELOPER_ONBOARDING.md
└── tests/                    # Test files
    ├── components/
    └── integration/
```

### Naming Conventions:
- **Components:** PascalCase (e.g., `DataTable`, `EnergyMarket`)
- **Files:** match component name (e.g., `DataTable.js`)
- **CSS classes:** kebab-case with BEM (e.g., `data-table__row--selected`)
- **Functions:** camelCase (e.g., `fetchMarketData`, `renderTable`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `MAX_ROWS`, `API_ENDPOINT`)

### Import Order:
1. Lifecycle/framework imports
2. Utility imports
3. Component imports
4. Style imports (if using CSS modules)

---

## Final Notes

This guide provides the **complete blueprint** for transforming block-buster from a basic card-stacked proof-of-concept into a production-grade, information-dense, multi-market blockchain operations dashboard.

**Key Principles:**
- **1% Mentality:** Every component must be polished, performant, and production-ready
- **Information Density:** Use spatial organization (multi-column, master-detail) over temporal scrolling
- **Real-Time First:** WebSocket streaming for live updates, not polling
- **Actionable UI:** Every data point should be clickable, filterable, or exportable
- **Accessibility:** Keyboard navigation, ARIA labels, focus management
- **Performance:** Virtual scrolling, debounced renders, lazy loading

**Dependencies Allowed:** 
Third-party npm packages are allowed in block-buster (charting libraries, UI frameworks, etc.) but keep the philosophy of minimal bloat.

**Backend Integration:**
All RPC methods from `~/projects/the-block/docs/apis_and_tooling.md` are available. Use them liberally. The blockchain backend is feature-complete across consensus, markets, governance, treasury, and analytics.

**Testing:**
Write integration tests for each market dashboard flow. Use `vitest` (already configured).

**Deployment:**
The frontend runs with `npm run dev` (Vite). Production build with `npm run build`. Serve with `python -m http.server` or any static server.

---

**Next Actions:**
1. Start with Phase 1 (Layout System)
2. Build DataTable and Modal components (Phase 2)
3. Implement Energy Market dashboard (Phase 3)
4. Build Receipt Audit interface (Phase 3)
5. Iterate and expand to other markets

**Questions or Blockers:**
- Document in `web/BLOCKERS.md`
- Tag with priority (P0, P1, P2)
- Assign to appropriate engineer

**Progress Tracking:**
- Update `web/UX_IMPLEMENTATION_STATUS.md` after completing each component
- Maintain changelog in `web/CHANGELOG_UX_TRANSFORMATION.md`

---

**End of UX Implementation Guide**

This document is the **authoritative source of truth** for block-buster UX transformation. Refer to it during implementation, code review, and testing.

/**
 * SelectionPanel Component - Modern row selection without checkboxes
 * 
 * Features:
 * - Click to select (Cmd/Ctrl+Click for multi-select)
 * - Drag to select multiple rows
 * - Visual selection state with left border accent
 * - Floating action bar for bulk operations
 * - Keyboard navigation (Arrow keys, Shift+Arrow for range)
 * 
 * Replaces: Checkbox-based selection (deprecated pattern)
 */

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class SelectionPanel extends Component {
  constructor(options) {
    super('SelectionPanel');
    this.containerId = options.containerId;
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.bulkActions = options.bulkActions || [];
    this.selectedItems = new Set();
    this.lastSelectedIndex = null;
    this.isDragging = false;
  }

  onMount() {
    this.render();
  }

  attachToRows(rows, data) {
    rows.forEach((row, index) => {
      const rowId = this.getRowId(data[index]);
      row.dataset.rowId = rowId;
      row.dataset.index = index;
      
      // Click selection
      this.listen(row, 'click', (e) => this.handleRowClick(e, rowId, index));
      
      // Hover effect
      this.listen(row, 'mouseenter', () => {
        if (!this.selectedItems.has(rowId)) {
          row.classList.add('row-hover');
        }
      });
      
      this.listen(row, 'mouseleave', () => {
        row.classList.remove('row-hover');
      });
      
      // Drag selection
      this.listen(row, 'mousedown', () => {
        this.isDragging = true;
      });
      
      this.listen(row, 'mouseup', () => {
        this.isDragging = false;
      });
      
      this.listen(row, 'mouseenter', () => {
        if (this.isDragging) {
          this.toggleSelection(rowId, index);
        }
      });
    });
    
    // Keyboard navigation
    this.attachKeyboardHandlers(rows, data);
  }

  attachKeyboardHandlers(rows, data) {
    document.addEventListener('keydown', (e) => {
      if (!rows.length) return;
      
      const focusedRow = document.activeElement?.closest('tr');
      if (!focusedRow) return;
      
      const currentIndex = parseInt(focusedRow.dataset.index);
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, rows.length - 1);
        rows[nextIndex]?.focus();
        if (e.shiftKey) {
          this.selectRange(currentIndex, nextIndex, data);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        rows[prevIndex]?.focus();
        if (e.shiftKey) {
          this.selectRange(currentIndex, prevIndex, data);
        }
      } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.selectAll(data);
      } else if (e.key === 'Escape') {
        this.clearSelection();
      }
    });
  }

  handleRowClick(e, rowId, index) {
    const row = e.currentTarget;
    
    if (e.metaKey || e.ctrlKey) {
      // Multi-select
      this.toggleSelection(rowId, index);
    } else if (e.shiftKey && this.lastSelectedIndex !== null) {
      // Range select
      const container = $(this.containerId);
      const rows = Array.from(container.querySelectorAll('tr[data-row-id]'));
      const data = rows.map(r => ({ _id: r.dataset.rowId }));
      this.selectRange(this.lastSelectedIndex, index, data);
    } else {
      // Single select (clear others)
      this.clearSelection();
      this.toggleSelection(rowId, index);
    }
    
    row.focus();
  }

  toggleSelection(rowId, index) {
    if (this.selectedItems.has(rowId)) {
      this.selectedItems.delete(rowId);
      this.updateRowState(rowId, false);
    } else {
      this.selectedItems.add(rowId);
      this.updateRowState(rowId, true);
      this.lastSelectedIndex = index;
    }
    
    this.updateActionBar();
    this.onSelectionChange(Array.from(this.selectedItems));
  }

  selectRange(startIndex, endIndex, data) {
    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    
    for (let i = min; i <= max; i++) {
      const rowId = this.getRowId(data[i]);
      if (!this.selectedItems.has(rowId)) {
        this.selectedItems.add(rowId);
        this.updateRowState(rowId, true);
      }
    }
    
    this.updateActionBar();
    this.onSelectionChange(Array.from(this.selectedItems));
  }

  selectAll(data) {
    data.forEach((item, _index) => {
      const rowId = this.getRowId(item);
      this.selectedItems.add(rowId);
      this.updateRowState(rowId, true);
    });
    
    this.updateActionBar();
    this.onSelectionChange(Array.from(this.selectedItems));
  }

  clearSelection() {
    this.selectedItems.forEach(rowId => {
      this.updateRowState(rowId, false);
    });
    this.selectedItems.clear();
    this.lastSelectedIndex = null;
    
    this.updateActionBar();
    this.onSelectionChange([]);
  }

  updateRowState(rowId, selected) {
    const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!row) return;
    
    if (selected) {
      row.classList.add('row-selected');
      row.setAttribute('aria-selected', 'true');
    } else {
      row.classList.remove('row-selected');
      row.setAttribute('aria-selected', 'false');
    }
  }

  updateActionBar() {
    const count = this.selectedItems.size;
    const actionBar = $('#selection-action-bar');
    
    if (!actionBar) {
      if (count > 0) {
        this.renderActionBar();
      }
      return;
    }
    
    if (count === 0) {
      actionBar.remove();
      return;
    }
    
    const countEl = actionBar.querySelector('.selection-count');
    if (countEl) {
      countEl.textContent = `${count} selected`;
    }
  }

  renderActionBar() {
    const container = $(this.containerId);
    if (!container || this.selectedItems.size === 0) return;
    
    const existing = $('#selection-action-bar');
    if (existing) existing.remove();
    
    const actionBar = document.createElement('div');
    actionBar.id = 'selection-action-bar';
    actionBar.className = 'selection-action-bar';
    
    const actionsHtml = this.bulkActions.map((action, idx) => 
      `<button class="btn btn-sm ${action.variant || 'btn-secondary'}" data-action-idx="${idx}">
        ${action.icon ? `<span class="btn-icon">${action.icon}</span>` : ''}
        ${action.label}
      </button>`
    ).join('');
    
    actionBar.innerHTML = `
      <div class="selection-info">
        <span class="selection-count">${this.selectedItems.size} selected</span>
      </div>
      <div class="selection-actions">
        ${actionsHtml}
        <button class="btn btn-sm btn-ghost" data-action="clear">
          Clear Selection
        </button>
      </div>
    `;
    
    // Attach handlers
    this.bulkActions.forEach((action, idx) => {
      const btn = actionBar.querySelector(`[data-action-idx="${idx}"]`);
      if (btn) {
        this.listen(btn, 'click', () => {
          const selectedData = this.getSelectedData();
          action.onClick(selectedData);
        });
      }
    });
    
    const clearBtn = actionBar.querySelector('[data-action="clear"]');
    if (clearBtn) {
      this.listen(clearBtn, 'click', () => this.clearSelection());
    }
    
    container.insertBefore(actionBar, container.firstChild);
  }

  render() {
    // Action bar renders dynamically on selection
  }

  getRowId(item) {
    return item?.id || item?._id || item?.rowId || JSON.stringify(item);
  }

  getSelectedData() {
    const container = $(this.containerId);
    if (!container) return [];
    
    const rows = Array.from(container.querySelectorAll('tr[data-row-id]'));
    return rows
      .filter(row => this.selectedItems.has(row.dataset.rowId))
      .map(row => {
        // Extract data from row
        return { _id: row.dataset.rowId };
      });
  }
}

export default SelectionPanel;

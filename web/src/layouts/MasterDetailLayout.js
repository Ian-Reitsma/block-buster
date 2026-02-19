/**
 * Master-Detail Layout Component
 * 
 * Responsive sidebar + main content pattern for dashboard views
 * Features: collapsible sidebar, keyboard shortcuts, persistent state
 */

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';

class MasterDetailLayout extends Component {
  constructor(options = {}) {
    super('MasterDetailLayout');
    this.sidebarWidth = options.sidebarWidth || '280px';
    this.collapsible = options.collapsible !== false;
    this.sidebarContent = null;
    this.mainContent = null;
    this.sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    this.containerId = options.containerId || 'layout-container';
  }

  setSidebarContent(content) {
    this.sidebarContent = content;
    this.updateSidebar();
  }

  setMainContent(content) {
    this.mainContent = content;
    this.updateMain();
  }

  onMount() {
    const container = $(`#${this.containerId}`);
    if (!container) {
      console.error('[MasterDetailLayout] Container not found:', this.containerId);
      return;
    }

    container.innerHTML = '';
    container.className = 'layout-master-detail';
    
    // Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = `sidebar ${this.sidebarCollapsed ? 'collapsed' : ''}`;
    sidebar.style.setProperty('--sidebar-width', this.sidebarWidth);
    sidebar.id = 'layout-sidebar';
    
    const sidebarHeader = document.createElement('div');
    sidebarHeader.className = 'sidebar-header';
    if (this.collapsible) {
      sidebarHeader.innerHTML = '<button class="sidebar-toggle" aria-label="Toggle sidebar"><span>☰</span></button>';
    }
    sidebar.appendChild(sidebarHeader);
    
    const sidebarContent = document.createElement('div');
    sidebarContent.className = 'sidebar-content';
    sidebarContent.id = 'sidebar-content-slot';
    sidebar.appendChild(sidebarContent);
    
    container.appendChild(sidebar);
    
    // Create main content
    const main = document.createElement('main');
    main.className = 'main-content';
    main.id = 'main-content-slot';
    container.appendChild(main);
    
    // Attach toggle handler
    if (this.collapsible) {
      const toggle = sidebar.querySelector('.sidebar-toggle');
      this.listen(toggle, 'click', () => this.toggleSidebar());
    }
    
    // Keyboard shortcut: Ctrl+B / Cmd+B
    this.listen(document, 'keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      }
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sidebar-collapsed', String(this.sidebarCollapsed));
    const sidebar = $('#layout-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  }

  updateSidebar() {
    const slot = $('#sidebar-content-slot');
    if (!slot || !this.sidebarContent) return;
    
    slot.innerHTML = '';
    if (typeof this.sidebarContent === 'string') {
      slot.innerHTML = this.sidebarContent;
    } else {
      slot.appendChild(this.sidebarContent);
    }
  }

  updateMain() {
    const slot = $('#main-content-slot');
    if (!slot || !this.mainContent) return;
    
    slot.innerHTML = '';
    if (typeof this.mainContent === 'string') {
      slot.innerHTML = this.mainContent;
    } else {
      slot.appendChild(this.mainContent);
    }
  }
}

export default MasterDetailLayout;

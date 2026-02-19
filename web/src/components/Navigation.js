// Navigation component with active state tracking
// Automatically updates on route changes

import { Component } from '../lifecycle.js';
import appState from '../state.js';
import { $ } from '../utils.js';

class Navigation extends Component {
  constructor(routes) {
    super('Navigation');
    this.routes = routes;
    this.container = null;
  }

  onMount() {
    this.container = $('#nav');
    if (!this.container) {
      console.warn('[Navigation] No #nav element found');
      return;
    }

    this.render();

    // Subscribe to route changes
    this.subscribe(appState, 'route', () => {
      requestAnimationFrame(() => this.updateActiveState());
    });

    // Listen for hash changes directly (backup)
    this.listen(window, 'hashchange', () => {
      this.updateActiveState();
    });
  }

  render() {
    if (!this.container) return;

    const nav = document.createElement('nav');
    nav.className = 'nav';

    this.routes.forEach((route) => {
      const link = document.createElement('a');
      link.href = `#${route.path}`;
      link.textContent = route.label;
      link.dataset.route = route.path;

      // Add click handler for state update
      this.listen(link, 'click', (e) => {
        e.preventDefault();
        window.location.hash = route.path;
        appState.set('route', route.path);
      });

      nav.appendChild(link);
    });

    this.container.innerHTML = '';
    this.container.appendChild(nav);

    // Set initial active state
    this.updateActiveState();
  }

  updateActiveState() {
    if (!this.container) return;

    const currentRoute = window.location.hash.replace('#', '') || this.routes[0]?.path || '';
    const links = this.container.querySelectorAll('a');

    links.forEach((link) => {
      const routePath = link.dataset.route;
      if (routePath === currentRoute) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  onUnmount() {
    console.log('[Navigation] Cleanup complete');
  }
}

export default Navigation;

// Hash-based SPA router with lifecycle hooks
// Zero dependencies, works with history API

import { Component } from './lifecycle.js';
import appState from './state.js';

class Router extends Component {
  constructor() {
    super('Router');
    this.routes = new Map();
    this.currentComponent = null;
    this.defaultRoute = null;
    this.notFoundRoute = null;
  }

  register(path, component) {
    this.routes.set(path, component);
    return this;
  }

  setDefault(path) {
    this.defaultRoute = path;
    return this;
  }

  setNotFound(component) {
    this.notFoundRoute = component;
    return this;
  }

  getCurrentPath() {
    return window.location.hash.replace('#', '') || this.defaultRoute || '';
  }

  navigate(path) {
    window.location.hash = path;
  }

  onMount() {
    // Listen for hash changes
    this.listen(window, 'hashchange', () => this.handleRoute());

    // Handle initial route
    this.handleRoute();
  }

  handleRoute() {
    const path = this.getCurrentPath();
    const component = this.routes.get(path) || this.notFoundRoute;

    if (!component) {
      console.warn(`[Router] No route found for "${path}"`);
      return;
    }

    // Unmount previous component
    if (this.currentComponent && this.currentComponent.unmount) {
      this.currentComponent.unmount();
    }

    // Mount new component
    this.currentComponent = component;
    if (component.mount) {
      component.mount();
    }

    // Update state
    appState.set('route', path);

    // Trigger render
    if (component.render) {
      requestAnimationFrame(() => component.render());
    }
  }

  getActiveRoute() {
    return this.getCurrentPath();
  }
}

export default Router;

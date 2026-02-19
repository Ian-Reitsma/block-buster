// UX Enhancements Integration
// Wires together all Phase 5 polish components

import { addCompactMetricTooltips } from './tooltip.js';
import whatsNew from './whats-new.js';
import keyboard from './keyboard.js';
import * as toast from './toast.js';
import { emptyStates, checkEmpty } from './empty-states.js';
import { ProgressiveLoader, showLoadingBar } from './loading.js';

/**
 * Initialize all UX enhancements
 */
export function initUXEnhancements() {
  console.log('[UX] Initializing enhancements...');
  
  // Show "What's New" modal if user hasn't seen it
  whatsNew.showIfNeeded();
  
  // Add tooltips to all compact metrics
  // Run after initial render and on route changes
  setTimeout(() => {
    addCompactMetricTooltips();
    console.log('[UX] Tooltips initialized');
  }, 1000);
  
  // Initialize keyboard shortcuts (already auto-initialized)
  console.log('[UX] Keyboard shortcuts active');
  
  // Welcome toast on first load
  const hasSeenWelcome = sessionStorage.getItem('block-buster-welcome');
  if (!hasSeenWelcome) {
    setTimeout(() => {
      toast.info('Welcome to Block Buster! Press ? for keyboard shortcuts', 5000);
      sessionStorage.setItem('block-buster-welcome', '1');
    }, 2000);
  }
  
  console.log('[UX] All enhancements initialized');
}

/**
 * Re-initialize tooltips (call after dynamic content updates)
 */
export function refreshTooltips() {
  addCompactMetricTooltips();
}

/**
 * Show connection status toast
 */
export function showConnectionStatus(connected) {
  if (connected) {
    toast.success('Connected to blockchain node', 3000);
  } else {
    toast.error('Disconnected from blockchain node', 0); // Don't auto-dismiss
  }
}

/**
 * Handle API errors with user-friendly toasts
 */
export function handleAPIError(error, context = 'API') {
  console.error(`[${context}] Error:`, error);
  
  let message = 'An error occurred';
  
  if (error.message) {
    if (error.message.includes('fetch')) {
      message = 'Unable to connect to the blockchain node';
    } else if (error.message.includes('timeout')) {
      message = 'Request timed out. Please try again.';
    } else {
      message = error.message;
    }
  }
  
  toast.error(message, 6000);
}

/**
 * Progressive page load with loading bar
 */
export async function loadPageWithProgress(stages) {
  const loader = new ProgressiveLoader(stages);
  
  try {
    await loader.load();
    return true;
  } catch (error) {
    handleAPIError(error, 'PageLoad');
    return false;
  }
}

/**
 * Check if element is empty and show appropriate empty state
 */
export function checkAndShowEmpty(container, selector, stateKey, ...args) {
  return checkEmpty(container, selector, stateKey, ...args);
}

/**
 * Export public API
 */
export default {
  init: initUXEnhancements,
  refreshTooltips,
  showConnectionStatus,
  handleAPIError,
  loadPageWithProgress,
  checkAndShowEmpty,
  toast,
  emptyStates,
  whatsNew,
  keyboard
};

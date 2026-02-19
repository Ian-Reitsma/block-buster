// Loading skeletons and states
// Zero-dependency shimmer animations for metric cards, tables, charts

/**
 * Create skeleton for hero metric card
 * @returns {HTMLElement}
 */
export function createHeroSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'card-metric-hero skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-line" style="width: 60%; height: 16px; margin-bottom: 16px;"></div>
    <div class="skeleton-line" style="width: 80%; height: 48px; margin-bottom: 12px;"></div>
    <div class="skeleton-line" style="width: 70%; height: 14px;"></div>
  `;
  return skeleton;
}

/**
 * Create skeleton for primary metric card
 * @returns {HTMLElement}
 */
export function createPrimarySkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'card-metric-primary skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-line" style="width: 60%; height: 16px; margin-bottom: 12px;"></div>
    <div class="skeleton-line" style="width: 70%; height: 32px;"></div>
  `;
  return skeleton;
}

/**
 * Create skeleton for compact metric card
 * @returns {HTMLElement}
 */
export function createCompactSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'card-metric-compact skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-line" style="width: 50%; height: 14px; margin-bottom: 8px;"></div>
    <div class="skeleton-line" style="width: 60%; height: 20px;"></div>
  `;
  return skeleton;
}

/**
 * Create skeleton for table row
 * @param {number} columns - Number of columns
 * @returns {HTMLElement}
 */
export function createTableRowSkeleton(columns = 4) {
  const row = document.createElement('tr');
  row.className = 'skeleton';
  
  for (let i = 0; i < columns; i++) {
    const cell = document.createElement('td');
    const width = i === 0 ? '40%' : i === 1 ? '25%' : '30%';
    cell.innerHTML = `<div class="skeleton-line" style="width: ${width}; height: 16px;"></div>`;
    row.appendChild(cell);
  }
  
  return row;
}

/**
 * Create skeleton for chart
 * @returns {HTMLElement}
 */
export function createChartSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'chart-skeleton skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-chart-area"></div>
    <div class="skeleton-chart-axis"></div>
  `;
  return skeleton;
}

/**
 * Create skeleton for list item
 * @returns {HTMLElement}
 */
export function createListItemSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'list-item skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-line" style="width: 70%; height: 16px; margin-bottom: 8px;"></div>
    <div class="skeleton-line" style="width: 40%; height: 14px;"></div>
  `;
  return skeleton;
}

/**
 * Show loading overlay on element
 * @param {HTMLElement} element
 * @param {string} message
 */
export function showLoadingOverlay(element, message = 'Loading...') {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-message">${message}</div>
  `;
  
  element.style.position = 'relative';
  element.appendChild(overlay);
}

/**
 * Hide loading overlay
 * @param {HTMLElement} element
 */
export function hideLoadingOverlay(element) {
  const overlay = element.querySelector('.loading-overlay');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Show loading bar at top of page
 * @param {number} progress - 0 to 100
 */
export function showLoadingBar(progress = 0) {
  let bar = document.getElementById('loading-bar');
  
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'loading-bar';
    bar.className = 'loading-bar';
    document.body.appendChild(bar);
  }
  
  bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  
  if (progress >= 100) {
    setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => bar.remove(), 300);
    }, 500);
  } else {
    bar.style.opacity = '1';
  }
}

/**
 * Progressive loading helper
 * Loads data in stages with visual feedback
 */
export class ProgressiveLoader {
  constructor(stages) {
    this.stages = stages; // Array of {name: string, weight: number, load: () => Promise}
    this.currentStage = 0;
    this.totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);
    this.completedWeight = 0;
  }
  
  async load() {
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      this.currentStage = i;
      
      const progress = (this.completedWeight / this.totalWeight) * 100;
      showLoadingBar(progress);
      
      try {
        await stage.load();
        this.completedWeight += stage.weight;
      } catch (error) {
        console.error(`[ProgressiveLoader] Stage ${stage.name} failed:`, error);
        throw error;
      }
    }
    
    showLoadingBar(100);
  }
  
  getProgress() {
    return (this.completedWeight / this.totalWeight) * 100;
  }
  
  getCurrentStage() {
    return this.stages[this.currentStage]?.name || 'Unknown';
  }
}

/**
 * Skeleton generator for metrics grids
 * @param {string} gridClass - CSS class for grid type
 * @param {number} count - Number of skeleton cards
 * @returns {HTMLElement}
 */
export function createMetricsGridSkeleton(gridClass, count) {
  const grid = document.createElement('div');
  grid.className = gridClass;
  
  let createFn;
  if (gridClass.includes('hero')) {
    createFn = createHeroSkeleton;
  } else if (gridClass.includes('primary')) {
    createFn = createPrimarySkeleton;
  } else {
    createFn = createCompactSkeleton;
  }
  
  for (let i = 0; i < count; i++) {
    grid.appendChild(createFn());
  }
  
  return grid;
}

/**
 * Replace element with skeleton, return restore function
 * @param {HTMLElement} element
 * @param {HTMLElement} skeleton
 * @returns {Function} Restore function
 */
export function replaceWithSkeleton(element, skeleton) {
  const parent = element.parentNode;
  const next = element.nextSibling;
  
  parent.replaceChild(skeleton, element);
  
  return () => {
    parent.replaceChild(element, skeleton);
  };
}

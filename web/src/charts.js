// Chart interactions and enhancements
// Zero-dependency chart utilities with hover, zoom, and export

/**
 * Chart interaction manager
 */
export class ChartInteractions {
  constructor(canvas, data, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.options = {
      padding: 40,
      crosshair: true,
      zoom: true,
      export: true,
      tooltip: true,
      ...options
    };
    
    this.hoverPoint = null;
    this.isDragging = false;
    this.dragStart = null;
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    
    this.init();
  }
  
  init() {
    // Mouse events
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    
    // Wheel for zoom
    if (this.options.zoom) {
      this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }
    
    // Touch events for mobile
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }
  
  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (this.isDragging) {
      const dx = x - this.dragStart.x;
      const dy = y - this.dragStart.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.dragStart = { x, y };
      this.render();
      return;
    }
    
    // Find nearest data point
    this.hoverPoint = this.findNearestPoint(x, y);
    
    if (this.options.crosshair || this.options.tooltip) {
      this.render();
    }
  }
  
  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.isDragging = true;
    this.dragStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    this.canvas.style.cursor = 'grabbing';
  }
  
  handleMouseUp() {
    this.isDragging = false;
    this.dragStart = null;
    this.canvas.style.cursor = 'default';
  }
  
  handleMouseLeave() {
    this.hoverPoint = null;
    this.isDragging = false;
    this.render();
  }
  
  handleWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = this.zoomLevel * delta;
    
    // Clamp zoom
    if (newZoom < 0.5 || newZoom > 5) return;
    
    this.zoomLevel = newZoom;
    this.render();
  }
  
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.isDragging = true;
      this.dragStart = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    }
  }
  
  handleTouchMove(e) {
    e.preventDefault();
    
    if (e.touches.length === 1 && this.isDragging) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      const dx = x - this.dragStart.x;
      const dy = y - this.dragStart.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.dragStart = { x, y };
      this.render();
    }
  }
  
  handleTouchEnd() {
    this.isDragging = false;
    this.dragStart = null;
  }
  
  findNearestPoint(x, y) {
    if (!this.data || this.data.length === 0) return null;
    
    const { padding } = this.options;
    const width = this.canvas.width - padding * 2;
    const height = this.canvas.height - padding * 2;
    
    // Convert mouse position to data coordinates
    const dataX = ((x - padding - this.panOffset.x) / width / this.zoomLevel) * (this.data.length - 1);
    const index = Math.round(dataX);
    
    if (index < 0 || index >= this.data.length) return null;
    
    return {
      index,
       this.data[index],
      x: padding + (index / (this.data.length - 1)) * width * this.zoomLevel + this.panOffset.x,
      y: this.dataToY(this.data[index])
    };
  }
  
  dataToY(value) {
    const { padding } = this.options;
    const height = this.canvas.height - padding * 2;
    
    const min = Math.min(...this.data.map(d => d.value || d));
    const max = Math.max(...this.data.map(d => d.value || d));
    const range = max - min || 1;
    
    const normalized = ((value.value || value) - min) / range;
    return padding + height - (normalized * height);
  }
  
  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw crosshair
    if (this.options.crosshair && this.hoverPoint) {
      this.drawCrosshair(this.hoverPoint);
    }
    
    // Draw tooltip
    if (this.options.tooltip && this.hoverPoint) {
      this.drawTooltip(this.hoverPoint);
    }
  }
  
  drawCrosshair(point) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);
    
    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(point.x, this.options.padding);
    this.ctx.lineTo(point.x, this.canvas.height - this.options.padding);
    this.ctx.stroke();
    
    // Horizontal line
    this.ctx.beginPath();
    this.ctx.moveTo(this.options.padding, point.y);
    this.ctx.lineTo(this.canvas.width - this.options.padding, point.y);
    this.ctx.stroke();
    
    // Circle at intersection
    this.ctx.fillStyle = 'var(--accent)';
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  drawTooltip(point) {
    const data = point.data;
    const label = data.label || data.x || point.index;
    const value = data.value || data;
    
    const text = `${label}: ${typeof value === 'number' ? value.toFixed(2) : value}`;
    
    this.ctx.save();
    this.ctx.font = '12px Inter, system-ui, sans-serif';
    const metrics = this.ctx.measureText(text);
    const width = metrics.width + 16;
    const height = 24;
    
    // Position tooltip
    let x = point.x + 10;
    let y = point.y - 10;
    
    // Keep tooltip in bounds
    if (x + width > this.canvas.width - this.options.padding) {
      x = point.x - width - 10;
    }
    if (y < this.options.padding) {
      y = point.y + 10;
    }
    
    // Background
    this.ctx.fillStyle = 'rgba(20, 20, 20, 0.95)';
    this.ctx.fillRect(x, y, width, height);
    
    // Border
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.strokeRect(x, y, width, height);
    
    // Text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x + 8, y + height / 2);
    
    this.ctx.restore();
  }
  
  resetZoom() {
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.render();
  }
  
  exportPNG() {
    const url = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = url;
    link.click();
  }
  
  exportSVG() {
    // Convert canvas to SVG (simplified)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${this.canvas.width}" height="${this.canvas.height}">
        <image href="${this.canvas.toDataURL()}" width="${this.canvas.width}" height="${this.canvas.height}"/>
      </svg>
    `;
    
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Create chart controls
 */
export function createChartControls(chartInteractions) {
  const controls = document.createElement('div');
  controls.className = 'chart-controls';
  
  // Time range selector
  const timeRanges = ['1H', '4H', '1D', '1W', '1M', 'ALL'];
  const timeButtons = timeRanges.map(range => `
    <button class="btn small" data-range="${range}">${range}</button>
  `).join('');
  
  controls.innerHTML = `
    <div class="chart-controls-left">
      <div class="btn-group">
        ${timeButtons}
      </div>
    </div>
    <div class="chart-controls-right">
      <button class="btn small" data-action="zoom-reset" title="Reset zoom">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      <button class="btn small" data-action="export-png" title="Export as PNG">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
  
  // Bind events
  controls.querySelectorAll('[data-range]').forEach(btn => {
    btn.onclick = () => {
      controls.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Emit event for parent to handle
      controls.dispatchEvent(new CustomEvent('rangechange', { detail: btn.dataset.range }));
    };
  });
  
  controls.querySelector('[data-action="zoom-reset"]').onclick = () => {
    chartInteractions.resetZoom();
  };
  
  controls.querySelector('[data-action="export-png"]').onclick = () => {
    chartInteractions.exportPNG();
  };
  
  // Set default active
  controls.querySelector('[data-range="1D"]')?.classList.add('active');
  
  return controls;
}

/**
 * Simple line chart renderer
 */
export function renderLineChart(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  const { padding = 40, lineColor = 'var(--accent)', fillGradient = true } = options;
  
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding * 2;
  
  if (!data || data.length === 0) return;
  
  const values = data.map(d => d.value || d);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  
  // Draw line
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  
  ctx.beginPath();
  data.forEach((point, i) => {
    const value = point.value || point;
    const x = padding + (i / (data.length - 1)) * width;
    const y = padding + height - ((value - min) / range) * height;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  
  // Fill gradient
  if (fillGradient) {
    const gradient = ctx.createLinearGradient(0, padding, 0, padding + height);
    gradient.addColorStop(0, 'rgba(26, 198, 162, 0.2)');
    gradient.addColorStop(1, 'rgba(26, 198, 162, 0)');
    
    ctx.lineTo(padding + width, padding + height);
    ctx.lineTo(padding, padding + height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }
  
  ctx.restore();
}

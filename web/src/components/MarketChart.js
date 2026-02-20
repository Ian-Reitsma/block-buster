/**
 * MarketChart Component - Real-time market data visualization
 * 
 * Features:
 * - Time-series line charts for metrics
 * - Bar charts for volume/utilization
 * - Real-time updates with smooth animations
 * - Zoom and pan interactions
 * - Crosshair with tooltip
 * - Multiple series support
 * - Responsive canvas rendering
 * 
 * Usage:
 *   const chart = new MarketChart({
 *     containerId: 'chart-container',
 *     type: 'line', // 'line', 'bar', 'area'
 *     series: [{ name: 'TPS',  [[timestamp, value], ...], color: '#1ac6a2' }],
 *     xAxis: { type: 'time', label: 'Time' },
 *     yAxis: { label: 'Transactions/sec' },
 *   });
 */

import { Component } from '../lifecycle.js';
import { fmt, $ } from '../utils.js';

class MarketChart extends Component {
  constructor(options) {
    super('MarketChart');
    this.containerId = options.containerId;
    this.type = options.type || 'line';
    this.series = options.series || [];
    this.xAxis = options.xAxis || { type: 'linear' };
    this.yAxis = options.yAxis || {};
    this.width = options.width || 800;
    this.height = options.height || 400;
    this.padding = options.padding || { top: 20, right: 40, bottom: 40, left: 60 };
    this.animate = options.animate !== false;
    this.interactive = options.interactive !== false;
    
    this.canvas = null;
    this.ctx = null;
    this.hoverPoint = null;
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.animationProgress = 0;
    this.animationId = null;
  }

  async onMount() {
    this.render();
    if (this.animate) {
      this.startAnimation();
    }
  }

  render() {
    const container = $(`#${this.containerId}`);
    if (!container) {
      console.error('[MarketChart] Container not found:', this.containerId);
      return;
    }

    container.innerHTML = '';
    container.className = 'chart-container';

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    container.appendChild(this.canvas);

    // Attach interactions
    if (this.interactive) {
      this.attachInteractions();
    }

    // Initial draw
    this.draw();
  }

  attachInteractions() {
    // Mouse move for crosshair/tooltip
    this.listen(this.canvas, 'mousemove', (e) => this.handleMouseMove(e));
    this.listen(this.canvas, 'mouseleave', () => this.handleMouseLeave());
    
    // Wheel for zoom
    this.listen(this.canvas, 'wheel', (e) => this.handleWheel(e));
    
    // Drag for pan
    let isDragging = false;
    let dragStart = null;
    
    this.listen(this.canvas, 'mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.offsetX, y: e.offsetY };
      this.canvas.style.cursor = 'grabbing';
    });
    
    this.listen(this.canvas, 'mousemove', (e) => {
      if (isDragging && dragStart) {
        const dx = e.offsetX - dragStart.x;
        const dy = e.offsetY - dragStart.y;
        this.panOffset.x += dx;
        this.panOffset.y += dy;
        dragStart = { x: e.offsetX, y: e.offsetY };
        this.draw();
      }
    });
    
    this.listen(this.canvas, 'mouseup', () => {
      isDragging = false;
      dragStart = null;
      this.canvas.style.cursor = 'default';
    });
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    this.hoverPoint = this.findNearestPoint(x, y);
    this.draw();
  }

  handleMouseLeave() {
    this.hoverPoint = null;
    this.draw();
  }

  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5, this.zoomLevel * delta));
    this.zoomLevel = newZoom;
    this.draw();
  }

  findNearestPoint(mouseX, mouseY) {
    if (!this.series.length) return null;
    
    const chartArea = this.getChartArea();
    if (mouseX < chartArea.left || mouseX > chartArea.right ||
        mouseY < chartArea.top || mouseY > chartArea.bottom) {
      return null;
    }
    
    let nearest = null;
    let minDist = Infinity;
    
    this.series.forEach(s => {
      s.data.forEach((point) => {
        const [dataX, dataY] = point;
        const screenX = this.dataToScreenX(dataX, chartArea);
        const screenY = this.dataToScreenY(dataY, chartArea);
        const dist = Math.hypot(screenX - mouseX, screenY - mouseY);
        
        if (dist < minDist && dist < 20) {
          minDist = dist;
          nearest = { x: dataX, y: dataY, screenX, screenY, series: s.name };
        }
      });
    });
    
    return nearest;
  }

  startAnimation() {
    this.animationProgress = 0;
    const duration = 800; // ms
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      this.animationProgress = Math.min(1, elapsed / duration);
      
      this.draw();
      
      if (this.animationProgress < 1) {
        this.animationId = requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  draw() {
    if (!this.ctx) return;
    
    const ctx = this.ctx;
    
    // Clear
    ctx.clearRect(0, 0, this.width, this.height);
    
    // Background
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface-0').trim() || '#0a0e1a';
    ctx.fillRect(0, 0, this.width, this.height);
    
    const chartArea = this.getChartArea();
    
    // Draw grid
    this.drawGrid(ctx, chartArea);
    
    // Draw axes
    this.drawAxes(ctx, chartArea);
    
    // Draw data
    this.series.forEach(s => {
      if (this.type === 'line' || this.type === 'area') {
        this.drawLineSeries(ctx, s, chartArea);
      } else if (this.type === 'bar') {
        this.drawBarSeries(ctx, s, chartArea);
      }
    });
    
    // Draw hover elements
    if (this.hoverPoint) {
      this.drawCrosshair(ctx, chartArea);
      this.drawTooltip(ctx);
    }
  }

  getChartArea() {
    return {
      left: this.padding.left,
      top: this.padding.top,
      right: this.width - this.padding.right,
      bottom: this.height - this.padding.bottom,
      width: this.width - this.padding.left - this.padding.right,
      height: this.height - this.padding.top - this.padding.bottom,
    };
  }

  getDataBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    this.series.forEach(s => {
      s.data.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
    });
    
    // Add padding
    const yRange = maxY - minY;
    minY -= yRange * 0.1;
    maxY += yRange * 0.1;
    
    return { minX, maxX, minY, maxY };
  }

  dataToScreenX(dataX, chartArea) {
    const bounds = this.getDataBounds();
    const normalized = (dataX - bounds.minX) / (bounds.maxX - bounds.minX);
    return chartArea.left + normalized * chartArea.width * this.zoomLevel + this.panOffset.x;
  }

  dataToScreenY(dataY, chartArea) {
    const bounds = this.getDataBounds();
    const normalized = (dataY - bounds.minY) / (bounds.maxY - bounds.minY);
    return chartArea.bottom - normalized * chartArea.height * this.zoomLevel + this.panOffset.y;
  }

  drawGrid(ctx, chartArea) {
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--border-color').trim() || '#1a2332';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    
    // Horizontal grid lines
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = chartArea.bottom - (chartArea.height / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
    }
    
    // Vertical grid lines
    const xSteps = 6;
    for (let i = 0; i <= xSteps; i++) {
      const x = chartArea.left + (chartArea.width / xSteps) * i;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    }
    
    ctx.setLineDash([]);
  }

  drawAxes(ctx, chartArea) {
    const textColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-secondary').trim() || '#6b7280';
    
    ctx.strokeStyle = textColor;
    ctx.fillStyle = textColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    // Y-axis labels
    const bounds = this.getDataBounds();
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = chartArea.bottom - (chartArea.height / ySteps) * i;
      const value = bounds.minY + (bounds.maxY - bounds.minY) * (i / ySteps);
      ctx.fillText(fmt.num(Math.round(value)), chartArea.left - 10, y);
    }
    
    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xSteps = 6;
    for (let i = 0; i <= xSteps; i++) {
      const x = chartArea.left + (chartArea.width / xSteps) * i;
      const value = bounds.minX + (bounds.maxX - bounds.minX) * (i / xSteps);
      
      let label;
      if (this.xAxis.type === 'time') {
        const date = new Date(value);
        label = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      } else {
        label = fmt.num(Math.round(value));
      }
      
      ctx.fillText(label, x, chartArea.bottom + 10);
    }
    
    // Axis labels
    if (this.yAxis.label) {
      ctx.save();
      ctx.translate(15, chartArea.top + chartArea.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(this.yAxis.label, 0, 0);
      ctx.restore();
    }
    
    if (this.xAxis.label) {
      ctx.textAlign = 'center';
      ctx.fillText(this.xAxis.label, chartArea.left + chartArea.width / 2, this.height - 10);
    }
  }

  drawLineSeries(ctx, series, chartArea) {
    if (!series.data.length) return;
    
    const progress = this.animate ? this.animationProgress : 1;
    const visiblePoints = Math.floor(series.data.length * progress);
    
    ctx.strokeStyle = series.color || '#1ac6a2';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw line
    ctx.beginPath();
    series.data.slice(0, visiblePoints).forEach((point, i) => {
      const [x, y] = point;
      const screenX = this.dataToScreenX(x, chartArea);
      const screenY = this.dataToScreenY(y, chartArea);
      
      if (i === 0) {
        ctx.moveTo(screenX, screenY);
      } else {
        ctx.lineTo(screenX, screenY);
      }
    });
    ctx.stroke();
    
    // Draw area fill if type is 'area'
    if (this.type === 'area') {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = series.color || '#1ac6a2';
      
      const lastPoint = series.data[visiblePoints - 1];
      if (lastPoint) {
        const [lastX] = lastPoint;
        const lastScreenX = this.dataToScreenX(lastX, chartArea);
        ctx.lineTo(lastScreenX, chartArea.bottom);
        
        const [firstX] = series.data[0];
        const firstScreenX = this.dataToScreenX(firstX, chartArea);
        ctx.lineTo(firstScreenX, chartArea.bottom);
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
    }
    
    // Draw points
    ctx.fillStyle = series.color || '#1ac6a2';
    series.data.slice(0, visiblePoints).forEach(point => {
      const [x, y] = point;
      const screenX = this.dataToScreenX(x, chartArea);
      const screenY = this.dataToScreenY(y, chartArea);
      
      ctx.beginPath();
      ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawBarSeries(ctx, series, chartArea) {
    if (!series.data.length) return;
    
    const progress = this.animate ? this.animationProgress : 1;
    const barWidth = chartArea.width / series.data.length * 0.8;
    
    ctx.fillStyle = series.color || '#1ac6a2';
    
    series.data.forEach((point, _i) => {
      const [x, y] = point;
      const screenX = this.dataToScreenX(x, chartArea) - barWidth / 2;
      const zeroY = this.dataToScreenY(0, chartArea);
      const screenY = this.dataToScreenY(y, chartArea);
      const barHeight = (zeroY - screenY) * progress;
      
      ctx.fillRect(screenX, zeroY - barHeight, barWidth, barHeight);
    });
  }

  drawCrosshair(ctx, chartArea) {
    if (!this.hoverPoint) return;
    
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-tertiary').trim() || '#4b5563';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(this.hoverPoint.screenX, chartArea.top);
    ctx.lineTo(this.hoverPoint.screenX, chartArea.bottom);
    ctx.stroke();
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(chartArea.left, this.hoverPoint.screenY);
    ctx.lineTo(chartArea.right, this.hoverPoint.screenY);
    ctx.stroke();
    
    ctx.setLineDash([]);
  }

  drawTooltip(ctx) {
    if (!this.hoverPoint) return;
    
    const padding = 8;
    const lineHeight = 16;
    
    let label;
    if (this.xAxis.type === 'time') {
      const date = new Date(this.hoverPoint.x);
      label = date.toLocaleString();
    } else {
      label = `${fmt.num(this.hoverPoint.x)}`;
    }
    
    const lines = [
      label,
      `${this.hoverPoint.series}: ${fmt.num(this.hoverPoint.y)}`,
    ];
    
    ctx.font = '12px sans-serif';
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    
    // Position tooltip
    let tooltipX = this.hoverPoint.screenX + 10;
    let tooltipY = this.hoverPoint.screenY - tooltipHeight - 10;
    
    // Keep tooltip in bounds
    if (tooltipX + tooltipWidth > this.width - this.padding.right) {
      tooltipX = this.hoverPoint.screenX - tooltipWidth - 10;
    }
    if (tooltipY < this.padding.top) {
      tooltipY = this.hoverPoint.screenY + 10;
    }
    
    // Draw tooltip background
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface-1').trim() || '#131825';
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--border-color').trim() || '#1a2332';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    ctx.fill();
    ctx.stroke();
    
    // Draw tooltip text
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-primary').trim() || '#f9fafb';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    lines.forEach((line, i) => {
      ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
    });
  }

  updateData(series) {
    this.series = series;
    if (this.animate) {
      this.startAnimation();
    } else {
      this.draw();
    }
  }

  onUnmount() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

export default MarketChart;

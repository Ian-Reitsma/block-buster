/**
 * Order Book Depth Chart
 * 
 * Volume-weighted depth visualization with cumulative bid/ask areas.
 * Standard DEX pattern: green bids, red asks, spread marker.
 * 
 * Features:
 * - Interactive hover with price/volume tooltip
 * - Click to auto-fill order entry
 * - Smooth canvas rendering
 * - Responsive to container size
 */

import { Component } from '../lifecycle.js';
import { fmt } from '../utils.js';

class OrderBookDepthChart extends Component {
  constructor(orderBookData, options = {}) {
    super('OrderBookDepthChart');
    this.data = orderBookData;
    this.options = {
      height: options.height || 400,
      onPriceClick: options.onPriceClick || null,
      ...options,
    };
    this.canvas = null;
    this.ctx = null;
    this.hoveredPoint = null;
    this.chartBounds = null;
  }

  render() {
    const container = document.createElement('div');
    container.className = 'order-book-depth-chart';
    container.style.cssText = `position: relative; height: ${this.options.height}px;`;

    const canvas = document.createElement('canvas');
    canvas.width = 1600; // 2x for retina
    canvas.height = this.options.height * 2;
    canvas.style.cssText = 'width: 100%; height: 100%; cursor: crosshair;';
    container.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Event listeners
    this.listen(canvas, 'mousemove', (e) => this.handleMouseMove(e));
    this.listen(canvas, 'click', (e) => this.handleClick(e));
    this.listen(canvas, 'mouseleave', () => this.handleMouseLeave());

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.updateCanvasSize();
      this.draw();
    });
    resizeObserver.observe(container);

    this.updateCanvasSize();
    this.draw();

    return container;
  }

  updateCanvasSize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * 2; // 2x for retina
    this.canvas.height = rect.height * 2;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(2, 2); // Scale context for retina
  }

  draw() {
    const { ctx, canvas } = this;
    if (!ctx || !this.data) return;

    const width = canvas.width / 2; // Account for 2x scale
    const height = canvas.height / 2;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Calculate cumulative depths
    const bidDepth = this.calculateDepth(this.data.bids, 'bid');
    const askDepth = this.calculateDepth(this.data.asks, 'ask');

    if (bidDepth.length === 0 || askDepth.length === 0) {
      this.drawEmptyState();
      return;
    }

    // Get ranges
    const minPrice = Math.min(
      bidDepth[bidDepth.length - 1]?.price || 0,
      askDepth[0]?.price || 0
    );
    const maxPrice = Math.max(
      bidDepth[0]?.price || 0,
      askDepth[askDepth.length - 1]?.price || 0
    );

    const maxVolume = Math.max(
      bidDepth[bidDepth.length - 1]?.cumulative || 0,
      askDepth[askDepth.length - 1]?.cumulative || 0
    );

    // Padding
    const padding = { top: 30, right: 80, bottom: 50, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Store bounds for interaction
    this.chartBounds = {
      left: padding.left,
      top: padding.top,
      width: chartWidth,
      height: chartHeight,
      minPrice,
      maxPrice,
      maxVolume,
    };

    // Scale functions
    const scalePrice = (price) => {
      return (
        padding.top +
        chartHeight -
        ((price - minPrice) / (maxPrice - minPrice)) * chartHeight
      );
    };

    const scaleVolume = (volume) => {
      return padding.left + (volume / maxVolume) * chartWidth;
    };

    // Draw axes and grid
    this.drawAxes(padding, chartWidth, chartHeight, minPrice, maxPrice, maxVolume);

    // Draw depth areas
    this.drawDepthArea(bidDepth, scalePrice, scaleVolume, '#22c55e', 0.15, 'bid');
    this.drawDepthArea(askDepth, scalePrice, scaleVolume, '#ef4444', 0.15, 'ask');

    // Draw spread line
    const spreadPrice = (bidDepth[0]?.price + askDepth[0]?.price) / 2;
    const spreadY = scalePrice(spreadPrice);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, spreadY);
    ctx.lineTo(width - padding.right, spreadY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw spread label
    const spreadBps = this.data.spread_bps || 0;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Spread: ${(spreadBps / 100).toFixed(2)}%`,
      width - padding.right - 10,
      spreadY - 8
    );

    // Draw hover tooltip
    if (this.hoveredPoint) {
      this.drawTooltip(this.hoveredPoint, padding, width, height);
      
      // Draw crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      
      // Vertical line
      const hoverX = scaleVolume(this.hoveredPoint.cumulative);
      ctx.beginPath();
      ctx.moveTo(hoverX, padding.top);
      ctx.lineTo(hoverX, height - padding.bottom);
      ctx.stroke();
      
      // Horizontal line
      const hoverY = scalePrice(this.hoveredPoint.price);
      ctx.beginPath();
      ctx.moveTo(padding.left, hoverY);
      ctx.lineTo(width - padding.right, hoverY);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }
  }

  calculateDepth(orders, side) {
    const depth = [];
    let cumulative = 0;

    // Sort by price
    const sorted =
      side === 'bid'
        ? orders.slice().sort((a, b) => b.price - a.price)
        : orders.slice().sort((a, b) => a.price - b.price);

    sorted.forEach((level) => {
      const totalAtLevel = level.orders.reduce((sum, order) => sum + order.amount, 0);
      cumulative += totalAtLevel;
      depth.push({
        price: level.price,
        volume: totalAtLevel,
        cumulative,
        orders: level.orders.length,
        side,
      });
    });

    return depth;
  }

  drawDepthArea(depth, scalePrice, scaleVolume, color, alpha, side) {
    if (depth.length === 0) return;

    const { ctx } = this;

    // Fill area
    ctx.fillStyle = this.hexToRgba(color, alpha);
    ctx.beginPath();
    
    if (side === 'bid') {
      // Start from bottom-left, go up to first price
      ctx.moveTo(scaleVolume(0), scalePrice(depth[0].price));
      
      // Draw cumulative line
      depth.forEach((point) => {
        ctx.lineTo(scaleVolume(point.cumulative), scalePrice(point.price));
      });
      
      // Close path to bottom-right
      const lastPoint = depth[depth.length - 1];
      ctx.lineTo(scaleVolume(lastPoint.cumulative), scalePrice(lastPoint.price));
      ctx.lineTo(scaleVolume(0), scalePrice(lastPoint.price));
    } else {
      // Start from bottom-left at first ask price
      ctx.moveTo(scaleVolume(0), scalePrice(depth[0].price));
      
      // Draw cumulative line
      depth.forEach((point) => {
        ctx.lineTo(scaleVolume(point.cumulative), scalePrice(point.price));
      });
      
      // Close path
      const lastPoint = depth[depth.length - 1];
      ctx.lineTo(scaleVolume(lastPoint.cumulative), scalePrice(lastPoint.price));
      ctx.lineTo(scaleVolume(0), scalePrice(lastPoint.price));
    }
    
    ctx.closePath();
    ctx.fill();

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    if (side === 'bid') {
      ctx.moveTo(scaleVolume(0), scalePrice(depth[0].price));
      depth.forEach((point) => {
        ctx.lineTo(scaleVolume(point.cumulative), scalePrice(point.price));
      });
    } else {
      ctx.moveTo(scaleVolume(0), scalePrice(depth[0].price));
      depth.forEach((point) => {
        ctx.lineTo(scaleVolume(point.cumulative), scalePrice(point.price));
      });
    }
    
    ctx.stroke();
  }

  drawAxes(padding, chartWidth, chartHeight, minPrice, maxPrice, maxVolume) {
    const { ctx, canvas } = this;
    const width = canvas.width / 2;
    const height = canvas.height / 2;

    // Axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;

    // Y-axis (price)
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();

    // X-axis (volume)
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Grid and labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';

    // Y-axis labels (price)
    const priceSteps = 6;
    for (let i = 0; i <= priceSteps; i++) {
      const price = minPrice + ((maxPrice - minPrice) / priceSteps) * i;
      const y = padding.top + chartHeight - (i / priceSteps) * chartHeight;

      // Label
      ctx.fillText(
        `$${(price / 100000).toFixed(3)}`,
        padding.left - 10,
        y + 4
      );

      // Grid line
      ctx.strokeStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // X-axis labels (volume)
    ctx.textAlign = 'center';
    const volumeSteps = 5;
    for (let i = 0; i <= volumeSteps; i++) {
      const volume = (maxVolume / volumeSteps) * i;
      const x = padding.left + (i / volumeSteps) * chartWidth;

      ctx.fillText(
        this.formatVolume(volume),
        x,
        height - padding.bottom + 20
      );

      // Grid line
      if (i > 0) {
        ctx.strokeStyle = '#1f2937';
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();
      }
    }

    // Axis titles
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Price (USD)', 0, 0);
    ctx.restore();

    ctx.fillText(
      'Cumulative Volume (BLOCK)',
      width / 2,
      height - 15
    );
  }

  drawTooltip(point, padding, width, height) {
    const { ctx } = this;
    
    const x = 20;
    const y = 20;
    const pad = 12;
    
    const text = [
      `${point.side === 'bid' ? 'BID' : 'ASK'}`,
      `Price: $${(point.price / 100000).toFixed(4)}`,
      `Volume: ${fmt.num(point.volume)} BLOCK`,
      `Cumulative: ${fmt.num(point.cumulative)} BLOCK`,
      `Orders: ${point.orders}`,
    ];

    // Measure text
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    const maxWidth = Math.max(...text.map((t) => ctx.measureText(t).width));
    const boxWidth = maxWidth + pad * 2;
    const boxHeight = text.length * 18 + pad * 2;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(x, y, boxWidth, boxHeight);

    // Border
    ctx.strokeStyle = point.side === 'bid' ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    // Text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    text.forEach((line, i) => {
      if (i === 0) {
        // First line (BID/ASK) in color
        ctx.fillStyle = point.side === 'bid' ? '#22c55e' : '#ef4444';
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      } else {
        ctx.fillStyle = '#fff';
        ctx.font = '12px system-ui, -apple-system, sans-serif';
      }
      ctx.fillText(line, x + pad, y + pad + 14 + i * 18);
    });
  }

  drawEmptyState() {
    const { ctx, canvas } = this;
    const width = canvas.width / 2;
    const height = canvas.height / 2;

    ctx.fillStyle = '#6b7280';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No order book data available', width / 2, height / 2);
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.hoveredPoint = this.findNearestPoint(x, y);
    this.draw();
  }

  findNearestPoint(x, y) {
    if (!this.chartBounds) return null;

    const { left, top, width, height, minPrice, maxPrice, maxVolume } = this.chartBounds;

    // Check if inside chart area
    if (x < left || x > left + width || y < top || y > top + height) {
      return null;
    }

    // Calculate price and volume at mouse position
    const priceAtMouse = maxPrice - ((y - top) / height) * (maxPrice - minPrice);
    const volumeAtMouse = ((x - left) / width) * maxVolume;

    // Find nearest point in bid or ask depth
    const bidDepth = this.calculateDepth(this.data.bids, 'bid');
    const askDepth = this.calculateDepth(this.data.asks, 'ask');

    let nearest = null;
    let minDistance = Infinity;

    [...bidDepth, ...askDepth].forEach((point) => {
      // Calculate distance in normalized space
      const priceNorm = (point.price - minPrice) / (maxPrice - minPrice);
      const volumeNorm = point.cumulative / maxVolume;
      const mouseXNorm = (x - left) / width;
      const mouseYNorm = 1 - (y - top) / height;

      const distance = Math.sqrt(
        Math.pow(volumeNorm - mouseXNorm, 2) +
        Math.pow(priceNorm - mouseYNorm, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = point;
      }
    });

    // Only return if close enough (within 10% of chart)
    return minDistance < 0.1 ? nearest : null;
  }

  handleClick(e) {
    if (this.hoveredPoint && this.options.onPriceClick) {
      this.options.onPriceClick(this.hoveredPoint.price / 100000); // Convert to USD
    }
  }

  handleMouseLeave() {
    this.hoveredPoint = null;
    this.draw();
  }

  formatVolume(volume) {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  updateData(newData) {
    this.data = newData;
    this.draw();
  }
}

export default OrderBookDepthChart;

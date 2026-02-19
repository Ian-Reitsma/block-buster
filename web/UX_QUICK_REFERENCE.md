# UX Quick Reference Card

## Common Patterns

### Metric Card Hierarchy

```javascript
// HERO (48px) - Critical metrics
<div class="card-metric-hero">
  <h3>Label</h3>
  <div class="value" data-bind="key">1,234</div>
  <div class="label">Description</div>
</div>

// PRIMARY (32px) - Important metrics
<div class="card-metric-primary">
  <h3>Label</h3>
  <div class="value" data-bind="key">567</div>
</div>

// COMPACT (20px) - Detailed stats
<div class="card-metric-compact">
  <h3>Label</h3>
  <div class="value" data-bind="key">89</div>
</div>
```

### Grid Layouts

```javascript
// 4-column hero metrics
<section class="metrics-hero-grid">
  <div class="card-metric-hero">...</div>
  <div class="card-metric-hero">...</div>
  <div class="card-metric-hero">...</div>
  <div class="card-metric-hero">...</div>
</section>

// 3-column primary metrics
<section class="metrics-primary-grid">
  <div class="card-metric-primary">...</div>
  <div class="card-metric-primary">...</div>
  <div class="card-metric-primary">...</div>
</section>

// 6-column compact metrics
<section class="metrics-compact-grid">
  <div class="card-metric-compact">...</div>
  <!-- 5 more cards -->
</section>
```

### Trading Layout

```javascript
// 3-column: 25% | 50% | 25%
<div class="layout-trading">
  <div class="card">Left sidebar</div>
  <div class="card">Main content (2x width)</div>
  <div class="card">Right sidebar</div>
</div>
```

### Sidebar Layout

```javascript
// Fixed sidebar + flexible main
<div class="layout-sidebar">
  <div class="card">Sidebar (320px)</div>
  <div class="card">Main content</div>
</div>
```

### Equal Split

```javascript
// 50% | 50%
<div class="layout-split">
  <div class="card">Left</div>
  <div class="card">Right</div>
</div>
```

## Component Templates

### Basic Card

```javascript
const card = document.createElement('div');
card.className = 'card';
card.innerHTML = `
  <h3>Card Title</h3>
  <p class="muted small mb-4">Description text</p>
  <div id="card-content">Content here</div>
`;
```

### Button Group

```javascript
<div class="row" style="gap: var(--space-3);">
  <button class="btn primary">Primary</button>
  <button class="btn">Secondary</button>
  <button class="btn danger">Danger</button>
</div>
```

### Form Control

```javascript
<div class="control">
  <label>Field Label</label>
  <input type="text" placeholder="Placeholder" />
</div>
```

### Table

```javascript
<table>
  <thead>
    <tr>
      <th>Column 1</th>
      <th>Column 2</th>
      <th>Column 3</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Data 1</td>
      <td>Data 2</td>
      <td>Data 3</td>
    </tr>
  </tbody>
</table>
```

### List with Pills

```javascript
<ul class="list">
  <li>
    <span>Item text</span>
    <span class="pill success">Status</span>
  </li>
</ul>
```

### Empty State

```javascript
<div class="muted small text-center p-8">
  No data available. Try adding some items.
</div>
```

## Utility Classes

### Spacing

```css
.mt-4  /* margin-top: 16px */
.mb-6  /* margin-bottom: 24px */
.p-8   /* padding: 32px */
```

### Flex

```css
.row             /* display: flex; flex-direction: row */
.column          /* display: flex; flex-direction: column */
.space-between   /* justify-content: space-between */
.align-center    /* align-items: center */
```

### Text

```css
.muted          /* color: var(--muted) */
.small          /* font-size: 13px */
.xs             /* font-size: 11px */
.text-center    /* text-align: center */
```

### Visibility

```css
.hidden    /* display: none */
.visible   /* display: block */
```

## Color Reference

```css
var(--accent)        /* #1ac6a2 - Primary, links */
var(--success)       /* #4ade80 - Positive, BUY */
var(--danger)        /* #f45b69 - Negative, SELL */
var(--warn)          /* #f0b429 - Warnings */
var(--muted)         /* #8aa2c2 - Secondary text */
var(--text)          /* #e9f1ff - Primary text */
var(--panel)         /* #121b2e - Card background */
var(--bg)            /* #0b1220 - Page background */
```

## Pill Variants

```javascript
<span class="pill">Default (accent)</span>
<span class="pill success">Success (green)</span>
<span class="pill danger">Danger (red)</span>
<span class="pill warn">Warning (yellow)</span>
```

## Responsive Breakpoints

```css
1400px  /* Hero grid adjusts */
1200px  /* .col-lg-* classes apply */
1024px  /* Sidebar/trading layouts collapse */
768px   /* .col-md-* classes apply */
480px   /* .col-sm-* classes apply */
```

## Data Binding

```javascript
// In HTML
<div class="value" data-bind="metricKey" data-format="number">—</div>

// In JS
import { bind } from '../bind.js';

const data = { metricKey: 1234 };
const element = document.getElementById('container');
bind(element, data);

// Formats: number, currency, ms, percent
```

## Performance Tips

```javascript
// Use requestAnimationFrame for DOM updates
this.subscribe(appState, 'key', (data) => {
  requestAnimationFrame(() => this.update(data));
});

// Batch DOM reads/writes
const height = element.offsetHeight;  // Read
element.style.height = '100px';       // Write

// Use contain for isolated components
.card { contain: layout style paint; }
```

## Common Mistakes

### ❌ DON'T

```javascript
// Using generic .grid without grid-template-columns
<div class="grid">  <!-- Falls back to auto-fit minmax -->

// Mixing card tiers in same grid
<div class="metrics-hero-grid">
  <div class="card-metric-primary">...</div>  <!-- Wrong! -->
</div>

// Forgetting responsive classes
<div class="col-4">...</div>  <!-- Stays 4 cols on mobile! -->

// Using margin for animations
.card:hover { margin-top: -2px; }  /* Triggers reflow -->
```

### ✅ DO

```javascript
// Use specific grid classes
<div class="metrics-hero-grid">

// Match card type to grid
<div class="metrics-hero-grid">
  <div class="card-metric-hero">...</div>  <!-- Correct! -->
</div>

// Add responsive classes
<div class="col-4 col-lg-6 col-md-12">...</div>

// Use transform for animations
.card:hover { transform: translateY(-2px); }  /* GPU accelerated -->
```

## Testing Checklist

- [ ] Test at 1920px, 1024px, 768px, 414px viewports
- [ ] Verify data binding updates correctly
- [ ] Check hover states on all interactive elements
- [ ] Validate color contrast (WCAG AA)
- [ ] Test with reduced motion preference
- [ ] Verify responsive grid breakpoints
- [ ] Check empty states render properly
- [ ] Test loading states for async data

## File Locations

```
web/src/
├── styles.css                 # Complete design system
├── components/
│   ├── TheBlock.js           # Dashboard with 3-tier hierarchy
│   ├── Trading.js            # 3-column trading layout
│   ├── Network.js            # Enhanced network monitoring
│   └── Navigation.js         # Navigation (no changes needed)
├── bind.js                    # Data binding utility
├── utils.js                   # Formatting utilities (fmt)
└── lifecycle.js               # Component base class
```

## Need Help?

1. Check `UX_TRANSFORMATION_GUIDE.md` for detailed documentation
2. Inspect existing components for patterns
3. Use browser DevTools to view computed grid layouts
4. Test responsive behavior by resizing viewport

---

**Remember**: The design system is built to scale. Use the existing patterns and your dashboards will maintain consistency automatically.

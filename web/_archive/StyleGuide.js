// StyleGuide component - Visual showcase of all UI patterns
// Use for development and documentation purposes

import { Component } from '../lifecycle.js';
import { $ } from '../utils.js';
import perf from '../perf.js';

class StyleGuide extends Component {
  constructor() {
    super('StyleGuide');
    this.container = null;
  }

  onMount() {
    this.container = $('#app');
    this.render();
  }

  render() {
    if (!this.container) return;

    perf.mark('render-styleguide-start');

    const content = document.createElement('div');
    content.className = 'content';

    // Hero section
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
      <h2>Block-Buster Style Guide</h2>
      <p>Complete visual reference for all UI components, patterns, and utilities. Use this guide when building new features.</p>
    `;
    content.appendChild(hero);

    // Table of contents
    content.appendChild(this.createTableOfContents());

    // Design tokens section
    content.appendChild(this.createDesignTokensSection());

    // Metric cards section
    content.appendChild(this.createMetricCardsSection());

    // Grid layouts section
    content.appendChild(this.createGridLayoutsSection());

    // Buttons section
    content.appendChild(this.createButtonsSection());

    // Forms section
    content.appendChild(this.createFormsSection());

    // Tables section
    content.appendChild(this.createTablesSection());

    // Lists section
    content.appendChild(this.createListsSection());

    // Pills and badges section
    content.appendChild(this.createPillsSection());

    // Charts section
    content.appendChild(this.createChartsSection());

    // Utility classes section
    content.appendChild(this.createUtilitiesSection());

    this.container.innerHTML = '';
    this.container.appendChild(content);

    perf.measure('render-styleguide', 'render-styleguide-start', 'render');
  }

  createTableOfContents() {
    const section = document.createElement('section');
    section.id = 'toc';
    section.className = 'card mb-8';
    section.innerHTML = `
      <h3>Table of Contents</h3>
      <div class="row" style="gap: var(--space-2); flex-wrap: wrap;">
        <a href="#design-tokens" class="btn">Design Tokens</a>
        <a href="#metric-cards" class="btn">Metric Cards</a>
        <a href="#grid-layouts" class="btn">Grid Layouts</a>
        <a href="#buttons" class="btn">Buttons</a>
        <a href="#forms" class="btn">Forms</a>
        <a href="#tables" class="btn">Tables</a>
        <a href="#lists" class="btn">Lists</a>
        <a href="#pills" class="btn">Pills & Badges</a>
        <a href="#charts" class="btn">Charts</a>
        <a href="#utilities" class="btn">Utilities</a>
      </div>
    `;
    return section;
  }

  createDesignTokensSection() {
    const section = document.createElement('section');
    section.id = 'design-tokens';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Design Tokens</h2>
      <p class="muted mb-6">Foundation of the design system</p>
      
      <div class="layout-split mb-6">
        <div class="card">
          <h3>Spacing Scale (4px rhythm)</h3>
          <div class="column" style="gap: var(--space-2);">
            <div class="row align-center">
              <div style="width: 4px; height: 20px; background: var(--accent);"></div>
              <span class="small">--space-1: 4px</span>
            </div>
            <div class="row align-center">
              <div style="width: 8px; height: 20px; background: var(--accent);"></div>
              <span class="small">--space-2: 8px</span>
            </div>
            <div class="row align-center">
              <div style="width: 16px; height: 20px; background: var(--accent);"></div>
              <span class="small">--space-4: 16px</span>
            </div>
            <div class="row align-center">
              <div style="width: 24px; height: 20px; background: var(--accent);"></div>
              <span class="small">--space-6: 24px</span>
            </div>
            <div class="row align-center">
              <div style="width: 32px; height: 20px; background: var(--accent);"></div>
              <span class="small">--space-8: 32px</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h3>Typography Scale (1.25 ratio)</h3>
          <div class="column" style="gap: var(--space-2);">
            <div style="font-size: var(--text-xs);">--text-xs: 11px</div>
            <div style="font-size: var(--text-sm);">--text-sm: 13px</div>
            <div style="font-size: var(--text-base);">--text-base: 15px</div>
            <div style="font-size: var(--text-lg);">--text-lg: 18px</div>
            <div style="font-size: var(--text-xl);">--text-xl: 22px</div>
            <div style="font-size: var(--text-2xl);">--text-2xl: 28px</div>
            <div style="font-size: var(--text-3xl);">--text-3xl: 36px</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h3>Color System</h3>
        <div class="row" style="gap: var(--space-4); flex-wrap: wrap;">
          <div class="column" style="align-items: center; gap: var(--space-2);">
            <div style="width: 80px; height: 80px; background: var(--accent); border-radius: var(--radius-md);"></div>
            <span class="small">Accent</span>
          </div>
          <div class="column" style="align-items: center; gap: var(--space-2);">
            <div style="width: 80px; height: 80px; background: var(--success); border-radius: var(--radius-md);"></div>
            <span class="small">Success</span>
          </div>
          <div class="column" style="align-items: center; gap: var(--space-2);">
            <div style="width: 80px; height: 80px; background: var(--danger); border-radius: var(--radius-md);"></div>
            <span class="small">Danger</span>
          </div>
          <div class="column" style="align-items: center; gap: var(--space-2);">
            <div style="width: 80px; height: 80px; background: var(--warn); border-radius: var(--radius-md);"></div>
            <span class="small">Warning</span>
          </div>
          <div class="column" style="align-items: center; gap: var(--space-2);">
            <div style="width: 80px; height: 80px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-md);"></div>
            <span class="small">Panel</span>
          </div>
        </div>
      </div>
    `;
    return section;
  }

  createMetricCardsSection() {
    const section = document.createElement('section');
    section.id = 'metric-cards';
    section.className = 'mb-8';

    const header = document.createElement('div');
    header.innerHTML = `
      <h2>Metric Cards (3-Tier Hierarchy)</h2>
      <p class="muted mb-6">Hero (48px) → Primary (32px) → Compact (20px)</p>
    `;
    section.appendChild(header);

    // Hero cards
    const heroSection = document.createElement('div');
    heroSection.innerHTML = '<h3 class="mb-4">Hero Cards (Maximum Prominence)</h3>';
    const heroGrid = document.createElement('div');
    heroGrid.className = 'metrics-hero-grid mb-6';
    heroGrid.innerHTML = `
      <div class="card-metric-hero">
        <h3>TPS</h3>
        <div class="value">1,234</div>
        <div class="label">Transactions per second</div>
      </div>
      <div class="card-metric-hero">
        <h3>Block Height</h3>
        <div class="value">567,890</div>
        <div class="label">Current height</div>
      </div>
    `;
    heroSection.appendChild(heroGrid);
    section.appendChild(heroSection);

    // Primary cards
    const primarySection = document.createElement('div');
    primarySection.innerHTML = '<h3 class="mb-4">Primary Cards (Medium Prominence)</h3>';
    const primaryGrid = document.createElement('div');
    primaryGrid.className = 'metrics-primary-grid mb-6';
    primaryGrid.innerHTML = `
      <div class="card-metric-primary">
        <h3>Network Fees</h3>
        <div class="value">5.67 BLOCK</div>
      </div>
      <div class="card-metric-primary">
        <h3>P2P Latency</h3>
        <div class="value">42 ms</div>
      </div>
      <div class="card-metric-primary">
        <h3>Hourly Issuance</h3>
        <div class="value">4,440 BLOCK</div>
      </div>
    `;
    primarySection.appendChild(primaryGrid);
    section.appendChild(primarySection);

    // Compact cards
    const compactSection = document.createElement('div');
    compactSection.innerHTML = '<h3 class="mb-4">Compact Cards (Dense Information)</h3>';
    const compactGrid = document.createElement('div');
    compactGrid.className = 'metrics-compact-grid';
    compactGrid.innerHTML = `
      <div class="card-metric-compact">
        <h3>Avg Block Time</h3>
        <div class="value">450 ms</div>
      </div>
      <div class="card-metric-compact">
        <h3>Unconfirmed</h3>
        <div class="value">5</div>
      </div>
      <div class="card-metric-compact">
        <h3>Network Load</h3>
        <div class="value">45%</div>
      </div>
      <div class="card-metric-compact">
        <h3>Validators</h3>
        <div class="value">21</div>
      </div>
      <div class="card-metric-compact">
        <h3>Supply</h3>
        <div class="value">1.2M</div>
      </div>
      <div class="card-metric-compact">
        <h3>Status</h3>
        <div class="value"><span class="pill success">Healthy</span></div>
      </div>
    `;
    compactSection.appendChild(compactGrid);
    section.appendChild(compactSection);

    return section;
  }

  createGridLayoutsSection() {
    const section = document.createElement('section');
    section.id = 'grid-layouts';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Grid Layouts</h2>
      <p class="muted mb-6">Purpose-built layouts for common patterns</p>
      
      <div class="mb-6">
        <h3 class="mb-4">Trading Layout (25% | 50% | 25%)</h3>
        <div class="layout-trading">
          <div class="card"><div class="p-8 text-center">Left Sidebar<br/>(Price Ticker)</div></div>
          <div class="card"><div class="p-8 text-center">Main Content<br/>(Order Book)</div></div>
          <div class="card"><div class="p-8 text-center">Right Sidebar<br/>(Order Entry)</div></div>
        </div>
      </div>
      
      <div class="mb-6">
        <h3 class="mb-4">Sidebar Layout (320px + flexible)</h3>
        <div class="layout-sidebar">
          <div class="card"><div class="p-8 text-center">Fixed Sidebar<br/>(320px)</div></div>
          <div class="card"><div class="p-8 text-center">Main Content<br/>(Flexible)</div></div>
        </div>
      </div>
      
      <div>
        <h3 class="mb-4">Split Layout (50% | 50%)</h3>
        <div class="layout-split">
          <div class="card"><div class="p-8 text-center">Left Column</div></div>
          <div class="card"><div class="p-8 text-center">Right Column</div></div>
        </div>
      </div>
    `;
    return section;
  }

  createButtonsSection() {
    const section = document.createElement('section');
    section.id = 'buttons';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Buttons</h2>
      <p class="muted mb-6">Interactive actions with states</p>
      
      <div class="card">
        <h3 class="mb-4">Button Variants</h3>
        <div class="row mb-4" style="gap: var(--space-3); flex-wrap: wrap;">
          <button class="btn">Default</button>
          <button class="btn primary">Primary</button>
          <button class="btn danger">Danger</button>
          <button class="btn" disabled>Disabled</button>
        </div>
        
        <h3 class="mb-4">Button Group</h3>
        <div class="row" style="gap: var(--space-2);">
          <button class="btn">Cancel</button>
          <button class="btn primary">Confirm</button>
        </div>
      </div>
    `;
    return section;
  }

  createFormsSection() {
    const section = document.createElement('section');
    section.id = 'forms';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Forms</h2>
      <p class="muted mb-6">Input controls and validation</p>
      
      <div class="layout-split">
        <div class="card">
          <h3 class="mb-4">Text Inputs</h3>
          <div class="control">
            <label>Text Field</label>
            <input type="text" placeholder="Enter text..." />
          </div>
          <div class="control">
            <label>Number Field</label>
            <input type="number" placeholder="0" />
          </div>
          <div class="control">
            <label>With Value</label>
            <input type="text" value="Pre-filled value" />
          </div>
        </div>
        
        <div class="card">
          <h3 class="mb-4">Other Controls</h3>
          <div class="control">
            <label>
              <input type="checkbox" />
              Checkbox option
            </label>
          </div>
          <div class="control">
            <label>Select</label>
            <select>
              <option>Option 1</option>
              <option>Option 2</option>
              <option>Option 3</option>
            </select>
          </div>
          <div class="control">
            <label>File Upload</label>
            <input type="file" />
          </div>
        </div>
      </div>
    `;
    return section;
  }

  createTablesSection() {
    const section = document.createElement('section');
    section.id = 'tables';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Tables</h2>
      <p class="muted mb-6">Structured data display</p>
      
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Side</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>14:32:15</td>
              <td><span class="pill success">BUY</span></td>
              <td>100</td>
              <td>$1.15</td>
              <td>$115.00</td>
            </tr>
            <tr>
              <td>14:31:42</td>
              <td><span class="pill danger">SELL</span></td>
              <td>50</td>
              <td>$1.16</td>
              <td>$58.00</td>
            </tr>
            <tr>
              <td>14:30:18</td>
              <td><span class="pill success">BUY</span></td>
              <td>200</td>
              <td>$1.14</td>
              <td>$228.00</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    return section;
  }

  createListsSection() {
    const section = document.createElement('section');
    section.id = 'lists';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Lists</h2>
      <p class="muted mb-6">Ordered and unordered content</p>
      
      <div class="layout-split">
        <div class="card">
          <h3 class="mb-4">Simple List</h3>
          <ul class="list">
            <li>List item one</li>
            <li>List item two</li>
            <li>List item three</li>
          </ul>
        </div>
        
        <div class="card">
          <h3 class="mb-4">List with Pills</h3>
          <ul class="list">
            <li>
              <span>Peer #1 (8a3d...)</span>
              <span class="pill">45ms</span>
            </li>
            <li>
              <span>Peer #2 (f2b9...)</span>
              <span class="pill success">32ms</span>
            </li>
            <li>
              <span>Peer #3 (c7e1...)</span>
              <span class="pill warn">128ms</span>
            </li>
          </ul>
        </div>
      </div>
    `;
    return section;
  }

  createPillsSection() {
    const section = document.createElement('section');
    section.id = 'pills';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Pills & Badges</h2>
      <p class="muted mb-6">Status indicators and labels</p>
      
      <div class="card">
        <h3 class="mb-4">Pill Variants</h3>
        <div class="row" style="gap: var(--space-3); flex-wrap: wrap;">
          <span class="pill">Default</span>
          <span class="pill success">Success</span>
          <span class="pill danger">Danger</span>
          <span class="pill warn">Warning</span>
        </div>
        
        <h3 class="mt-6 mb-4">Use Cases</h3>
        <div class="row" style="gap: var(--space-3); flex-wrap: wrap;">
          <span class="pill success">BUY</span>
          <span class="pill danger">SELL</span>
          <span class="pill success">Healthy</span>
          <span class="pill warn">Degraded</span>
          <span class="pill danger">Down</span>
          <span class="pill">45ms</span>
        </div>
      </div>
    `;
    return section;
  }

  createChartsSection() {
    const section = document.createElement('section');
    section.id = 'charts';
    section.className = 'mb-8';

    const header = document.createElement('div');
    header.innerHTML = `
      <h2>Charts & Visualizations</h2>
      <p class="muted mb-6">Simple data visualization</p>
    `;
    section.appendChild(header);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h3 class="mb-4">Bar Chart</h3>';
    
    const chart = document.createElement('div');
    chart.className = 'chart';
    const values = [10, 25, 15, 30, 20, 35, 25, 40, 30, 45];
    values.forEach((v) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = `${v + 20}px`;
      bar.title = `${v} TPS`;
      chart.appendChild(bar);
    });
    
    card.appendChild(chart);
    section.appendChild(card);

    return section;
  }

  createUtilitiesSection() {
    const section = document.createElement('section');
    section.id = 'utilities';
    section.className = 'mb-8';
    section.innerHTML = `
      <h2>Utility Classes</h2>
      <p class="muted mb-6">Common patterns and helpers</p>
      
      <div class="layout-split">
        <div class="card">
          <h3 class="mb-4">Flexbox Utilities</h3>
          <div class="column" style="gap: var(--space-4);">
            <div class="row" style="background: var(--panel-elevated); padding: var(--space-4); border-radius: var(--radius-md);">
              <span>.row</span>
              <span>→</span>
              <span>Horizontal</span>
            </div>
            <div class="column" style="background: var(--panel-elevated); padding: var(--space-4); border-radius: var(--radius-md);">
              <span>.column</span>
              <span>↓</span>
              <span>Vertical</span>
            </div>
            <div class="row space-between" style="background: var(--panel-elevated); padding: var(--space-4); border-radius: var(--radius-md);">
              <span>Left</span>
              <span>.space-between</span>
              <span>Right</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h3 class="mb-4">Text Utilities</h3>
          <div class="column" style="gap: var(--space-3);">
            <div class="text-left">.text-left</div>
            <div class="text-center">.text-center</div>
            <div class="text-right">.text-right</div>
            <div class="muted">.muted (secondary text)</div>
            <div class="small">.small (13px)</div>
            <div class="xs">.xs (11px)</div>
          </div>
        </div>
      </div>
      
      <div class="card mt-6">
        <h3 class="mb-4">Spacing Utilities</h3>
        <div class="row" style="gap: var(--space-6); flex-wrap: wrap;">
          <div>
            <div class="mb-2 small muted">Margin</div>
            <code>.mt-4 .mb-6 .ml-2 .mr-8</code>
          </div>
          <div>
            <div class="mb-2 small muted">Padding</div>
            <code>.p-4 .p-6 .p-8</code>
          </div>
        </div>
      </div>
    `;
    return section;
  }

  onUnmount() {
    console.log('[StyleGuide] Cleanup complete');
  }
}

export default StyleGuide;

/**
 * Economics Dashboard
 * 
 * Unified view of economic foundations:
 * - Network Issuance Formula
 * - Economic Control Laws (4 layers)
 * - Receipt Audit Trail
 * 
 * Phase 1 of Comprehensive Features Plan
 */

import { Component } from '../lifecycle.js';
import NetworkIssuanceChart from './NetworkIssuanceChart.js';
import EconomicControlLaws from './EconomicControlLaws.js';
import ReceiptAuditInterface from './ReceiptAuditInterface.js';
import EconomicsSimulator from './EconomicsSimulator.js';

class Economics extends Component {
  constructor(rpc) {
    super('Economics');
    this.rpc = rpc;
    this.activeTab = 'issuance'; // issuance, control-laws, receipts
    this.components = {
      issuance: null,
      controlLaws: null,
      receipts: null,
      simulator: null,
    };
    this.container = null;
  }

  buildLayout() {
    const container = document.createElement('div');
    container.className = 'content economics-dashboard';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
      <div class="hero">
        <h2>Economics Dashboard</h2>
        <p>Network issuance, control laws, and receipt audit trail</p>
      </div>
    `;
    container.appendChild(header);

    // Navigation tabs
    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    // Wrap (no horizontal scrollbar)
    tabs.style.display = 'flex';
    tabs.style.flexWrap = 'wrap';
    tabs.style.overflowX = 'hidden';
    tabs.style.overflowY = 'visible';
    tabs.style.gap = '8px';
    tabs.innerHTML = `
      <button class="tab ${this.activeTab === 'issuance' ? 'active' : ''}" data-tab="issuance" style="white-space:normal; flex: 1 1 180px;">
        💰 Network Issuance
      </button>
      <button class="tab ${this.activeTab === 'control-laws' ? 'active' : ''}" data-tab="control-laws" style="white-space:normal; flex: 1 1 180px;">
        ⚙️ Control Laws
      </button>
      <button class="tab ${this.activeTab === 'receipts' ? 'active' : ''}" data-tab="receipts" style="white-space:normal; flex: 1 1 180px;">
        📄 Receipt Audit
      </button>
      <button class="tab ${this.activeTab === 'simulator' ? 'active' : ''}" data-tab="simulator" style="white-space:normal; flex: 1 1 180px;">
        🧪 Economics Lab
      </button>
    `;
    container.appendChild(tabs);

    // Content area
    const content = document.createElement('div');
    content.className = 'economics-content';
    content.id = 'economics-content';
    container.appendChild(content);

    return container;
  }

  render() {
    return this.buildLayout();
  }

  async onMount() {
    this.container = document.querySelector('#app');
    if (!this.container) {
      console.warn('[Economics] #app container not found');
      return;
    }

    // Render shell into the main app container
    this.container.innerHTML = '';
    this.container.appendChild(this.buildLayout());

    // Attach tab listeners scoped to this component
    const tabs = this.container.querySelectorAll('.tabs .tab');
    tabs.forEach(tab => {
      this.listen(tab, 'click', (e) => {
        this.switchTab(e.currentTarget.dataset.tab);
      });
    });

    // Initialize first tab
    await this.switchTab(this.activeTab);
  }

  async switchTab(tab) {
    // Unmount previous component
    if (this.components[this.activeTab]) {
      this.components[this.activeTab].unmount();
    }

    // Update active tab
    this.activeTab = tab;

    // Update tab buttons
    document.querySelectorAll('.tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Get content container
    const content = this.container?.querySelector('#economics-content');
    if (!content) return;

    // Create and mount new component
    let component;
    switch (tab) {
      case 'issuance':
        if (!this.components.issuance) {
          this.components.issuance = new NetworkIssuanceChart(this.rpc, {
            height: 500,
            showHistory: true,
          });
        }
        component = this.components.issuance;
        break;

      case 'control-laws':
        if (!this.components.controlLaws) {
          this.components.controlLaws = new EconomicControlLaws(this.rpc);
        }
        component = this.components.controlLaws;
        break;

      case 'receipts':
        if (!this.components.receipts) {
          this.components.receipts = new ReceiptAuditInterface(this.rpc);
        }
        component = this.components.receipts;
        break;

      case 'simulator':
        if (!this.components.simulator) {
          this.components.simulator = new EconomicsSimulator(this.rpc);
        }
        component = this.components.simulator;
        break;
    }

    if (component) {
      content.innerHTML = '';
      content.appendChild(component.render());
      await component.mount();
    }
  }

  onUnmount() {
    // Clean up all components
    Object.values(this.components).forEach(component => {
      if (component) {
        component.unmount();
      }
    });
    console.log('[Economics] Cleanup complete');
  }
}

export default Economics;

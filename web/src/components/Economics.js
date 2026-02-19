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
import { $ } from '../utils.js';
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
  }

  render() {
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
    tabs.innerHTML = `
      <button class="tab ${this.activeTab === 'issuance' ? 'active' : ''}" data-tab="issuance">
        💰 Network Issuance
      </button>
      <button class="tab ${this.activeTab === 'control-laws' ? 'active' : ''}" data-tab="control-laws">
        ⚙️ Control Laws
      </button>
      <button class="tab ${this.activeTab === 'receipts' ? 'active' : ''}" data-tab="receipts">
        📄 Receipt Audit
      </button>
      <button class="tab ${this.activeTab === 'simulator' ? 'active' : ''}" data-tab="simulator">
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

  async onMount() {
    // Attach tab listeners
    const tabs = document.querySelectorAll('.tabs .tab');
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
    const content = $('#economics-content');
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

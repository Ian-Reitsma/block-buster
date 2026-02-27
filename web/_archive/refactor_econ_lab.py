import os

path = os.path.expanduser('~/projects/the-block/block-buster/web/src/components/EconomicsSimulator.js')

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace refreshSliders() with refreshControls() globally
content = content.replace('refreshSliders()', 'refreshControls()')
content = content.replace('this.refreshSliders()', 'this.refreshControls()')

# 1. Replace refreshSliders definition
old_refresh = """  refreshControls() {
    Object.entries(this.inputs).forEach(([key, value]) => {
      const input = document.querySelector(`.lab-control[data-key="${key}"] input`);
      const label = document.getElementById(`${key}-value`);
      if (input) input.value = value;
      if (label) label.textContent = this.displayValue(key, value);
    });
  }"""

new_refresh = """  refreshControls() {
    document.querySelectorAll('.stepper-input').forEach((inp) => {
      const key = inp.dataset.key;
      if (!(key in this.inputs)) return;
      inp.value = String(this.inputs[key]);
      const label = document.getElementById(`${key}-value`);
      if (label) label.textContent = this.displayValue(key, this.inputs[key]);
    });
  }"""

content = content.replace(old_refresh, new_refresh)

# 2. Replace renderSlider with renderNumericInput
old_render_slider = """  renderSlider(key, label, min, max, step, helper) {
    const value = this.inputs[key];
    return `
      <label class="lab-control" data-key="${key}">
        <div class="lab-control__meta">
          <span>${label}</span>
          <span class="value" id="${key}-value">${this.displayValue(key, value)}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
        <p class="muted tiny">${helper || ''}</p>
      </label>
    `;
  }"""

new_render_numeric = """  renderNumericInput(key, label, min, max, step, helper) {
    const value = this.inputs[key];

    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `
      <div class="lab-input-group" data-key="${key}" data-min="${min}" data-max="${max}" data-step="${step}">
        <div class="lab-input-header">
          <label class="lab-input-label">
            ${esc(label)}
            ${helper ? \`<span class="tooltip-icon" title="${esc(helper)}">ⓘ</span>\` : ''}
          </label>
          <span class="value-display" id="${key}-value">${esc(this.displayValue(key, value))}</span>
        </div>

        <div class="numeric-stepper">
          <button type="button" class="stepper-btn" data-key="${key}" data-dir="-1">−</button>
          <input
            class="stepper-input"
            type="number"
            inputmode="decimal"
            data-key="${key}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}"
          />
          <button type="button" class="stepper-btn" data-key="${key}" data-dir="1">+</button>
        </div>
      </div>
    `;
  }"""

content = content.replace(old_render_slider, new_render_numeric)

# Replace bindControls
old_bind_controls = """  bindControls() {
    // Sliders
    document.querySelectorAll('.lab-control input[type="range"]').forEach((input) => {
      this.listen(input, 'input', (e) => {
        const key = e.target.closest('.lab-control').dataset.key;
        const raw = parseFloat(e.target.value);
        this.inputs[key] = raw;
        const label = document.getElementById(`${key}-value`);
        if (label) label.textContent = this.displayValue(key, raw);
        // P5: debounce chart re-renders at 150ms — metric cards update instantly
        // because we still call updateOutputs() sync for the text/bar DOM writes,
        // but we guard the expensive canvas path (_renderCharts) inside updateOutputs()
        // with the debounce flag so dragging sliders fast doesn't thrash 4 canvases.
        this._debouncedUpdate();
      });
    });

    // Scenario chips
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      this.listen(btn, 'click', () => {
        this.applyScenario(btn.dataset.scenario);
      });
    });

    // Sync buttons — #sync-live and #sync-governor are now unified: both call syncFromChain().
    // syncFromChain() uses governor.status + consensus.block_height + receipt.audit (best-effort).
    // The old syncFromGovernor() only pulled gate/margin; syncFromChain() is a strict superset.
    const syncLive     = $('#sync-live');
    const syncMock     = $('#sync-mock');
    const syncGovernor = $('#sync-governor');
    if (syncLive)     this.listen(syncLive,     'click', () => this.syncFromChain());
    if (syncMock)     this.listen(syncMock,     'click', () => this.syncFromMock());
    if (syncGovernor) this.listen(syncGovernor, 'click', () => this.syncFromChain());

    // P8: Pin / Clear — snapshot current inputs for delta comparison.
    // _pin() captures this.inputs at click-time; _unpin() sets this._pinned = null.
    // Both call updateOutputs() to immediately refresh delta rows + overlay lines.
    const pinBtn   = $('#econlab-pin');
    const unpinBtn = $('#econlab-unpin');
    if (pinBtn)   this.listen(pinBtn,   'click', () => this._pin());
    if (unpinBtn) this.listen(unpinBtn, 'click', () => this._unpin());
  }"""

new_bind_controls = """  bindControls() {
    const clampNum = (x, min, max) => Math.min(max, Math.max(min, x));

    const roundToStep = (val, step) => {
      const s = Number(step);
      if (!isFinite(s) || s <= 0) return val;
      const inv = 1 / s;
      // Avoid float drift: snap on step grid.
      return Math.round(val * inv) / inv;
    };

    const commit = (key, raw) => {
      const group = document.querySelector(`.lab-input-group[data-key="${key}"]`);
      const min = Number(group?.dataset?.min ?? -Infinity);
      const max = Number(group?.dataset?.max ?? Infinity);
      const step = Number(group?.dataset?.step ?? 0);

      let v = Number(raw);
      if (!isFinite(v)) v = Number(this.inputs[key]) || 0;
      v = clampNum(v, min, max);
      v = roundToStep(v, step);

      this.inputs[key] = v;

      const inp = document.querySelector(`.stepper-input[data-key="${key}"]`);
      if (inp) inp.value = String(v);

      const label = document.getElementById(`${key}-value`);
      if (label) label.textContent = this.displayValue(key, v);

      this._debouncedUpdate();
    };

    // Numeric inputs
    document.querySelectorAll('.stepper-input').forEach((input) => {
      this.listen(input, 'input', (e) => {
        const key = e.target.dataset.key;
        commit(key, e.target.value);
      });
    });

    // +/- buttons
    document.querySelectorAll('.stepper-btn').forEach((btn) => {
      this.listen(btn, 'click', (e) => {
        const key = e.currentTarget.dataset.key;
        const dir = Number(e.currentTarget.dataset.dir);
        const group = document.querySelector(`.lab-input-group[data-key="${key}"]`);
        const step = Number(group?.dataset?.step ?? 1);

        const cur = Number(this.inputs[key]) || 0;
        commit(key, cur + dir * step);
      });
    });

    // Scenario chips
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      this.listen(btn, 'click', () => {
        this.applyScenario(btn.dataset.scenario);
      });
    });

    // Sync buttons
    const syncLive     = $('#sync-live');
    const syncMock     = $('#sync-mock');
    const syncGovernor = $('#sync-governor');
    if (syncLive)     this.listen(syncLive,     'click', () => this.syncFromChain());
    if (syncMock)     this.listen(syncMock,     'click', () => this.syncFromMock());
    if (syncGovernor) this.listen(syncGovernor, 'click', () => this.syncFromChain());

    // P8: Pin / Clear
    const pinBtn   = $('#econlab-pin');
    const unpinBtn = $('#econlab-unpin');
    if (pinBtn)   this.listen(pinBtn,   'click', () => this._pin());
    if (unpinBtn) this.listen(unpinBtn, 'click', () => this._unpin());
  }"""

content = content.replace(old_bind_controls, new_bind_controls)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Modified: refreshControls, renderNumericInput, bindControls")

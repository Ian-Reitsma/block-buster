(function () {
  if (typeof document === 'undefined') return;

  const chapters = [
    {
      id: 'health',
      title: 'Read Health',
      target: '#hero-strip',
      pages: ['dashboard'],
      seeing: 'The control strip tracks uptime, block height, and core telemetry.',
      meaning: 'Healthy status shows stable latency and zero recent reconnects.',
      next: 'Click a KPI to jump into its detail panel and compare trend lines.'
    },
    {
      id: 'markets',
      title: 'Interpret Markets',
      target: '#market-section',
      pages: ['dashboard', 'whales', 'sentiment'],
      seeing: 'Market panel compares per-market volume, status, and drift.',
      meaning: 'Use the provenance chips to confirm source, latency, and schema.',
      next: 'Filter by time range, then pin any market that shows lag or spikes.'
    },
    {
      id: 'receipts',
      title: 'Trace a Receipt',
      target: '#receipts-section',
      pages: ['dashboard', 'whales'],
      seeing: 'Receipt feed lists recent events with endpoint, latency, and errors.',
      meaning: 'Each row expands to a detail drawer with copy buttons for IDs.',
      next: 'Open a receipt, copy the hash, and verify it against explorer logs.'
    },
    {
      id: 'backtest',
      title: 'Run a Backtest',
      target: '#strategy-panel',
      pages: ['strategies'],
      seeing: 'Backtest Lab validates allocations, date ranges, and capital caps.',
      meaning: 'Inputs must sum to 100% and respect the selected window.',
      next: 'Run a quick mix, inspect equity + drawdown curves, and export the run.'
    },
    {
      id: 'api',
      title: 'Set API + Verify',
      target: '#connection-card',
      pages: ['settings'],
      seeing: 'Connection card stores API base, key, and last schema hash.',
      meaning: 'Use “Test link” to verify latency; cached values are labeled.',
      next: 'Copy the API base for teammates and reset onboarding if needed.'
    }
  ];

  const storagePrefix = 'block_buster_guide_chapter_';
  const collapseKey = 'block_buster_guide_collapsed';

  let overlay, spotlight, card, rail;

  function storageKey(id) { return `${storagePrefix}${id}_done`; }

  function isDone(id) { return localStorage.getItem(storageKey(id)) === 'true'; }

  function markDone(id, value = true) {
    localStorage.setItem(storageKey(id), value ? 'true' : 'false');
    renderRail();
  }

  function resetProgress() {
    chapters.forEach(ch => localStorage.removeItem(storageKey(ch.id)));
    renderRail();
  }

  function ensureOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'walkthroughOverlay';
      overlay.className = 'tour-overlay';
      overlay.innerHTML = `
        <div class="tour-spotlight" id="tourSpotlight"></div>
        <div class="tour-card" role="dialog" aria-live="polite">
          <div class="tour-title" id="walkthroughTitle"></div>
          <div class="tour-text" id="walkthroughSeeing"></div>
          <div class="tour-text" id="walkthroughMeaning"></div>
          <div class="tour-text" id="walkthroughNext"></div>
          <div class="tour-actions">
            <button class="btn ghost" id="walkthroughDismiss">Dismiss</button>
            <button class="btn primary" id="walkthroughDone">Mark Done</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      spotlight = overlay.querySelector('#tourSpotlight');
      card = overlay.querySelector('.tour-card');
      overlay.addEventListener('click', (e) => { if (e.target === overlay) hideOverlay(); });
      overlay.querySelector('#walkthroughDismiss').addEventListener('click', hideOverlay);
      overlay.querySelector('#walkthroughDone').addEventListener('click', () => {
        const id = card?.dataset?.chapter;
        if (id) markDone(id, true);
        hideOverlay();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideOverlay(); });
    }
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.remove('visible');
    if (spotlight) spotlight.style.cssText = '';
    if (card) card.dataset.chapter = '';
  }

  function positionSpotlight(target) {
    if (!spotlight || !target) return;
    const rect = target.getBoundingClientRect();
    spotlight.style.left = `${rect.left - 8}px`;
    spotlight.style.top = `${rect.top - 8}px`;
    spotlight.style.width = `${rect.width + 16}px`;
    spotlight.style.height = `${rect.height + 16}px`;
  }

  function focusChapter(id) {
    const chapter = chapters.find(c => c.id === id);
    if (!chapter) return;
    ensureOverlay();
    const target = document.querySelector(chapter.target);
    if (target) {
      target.classList.add('tour-highlight');
      positionSpotlight(target);
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const title = overlay.querySelector('#walkthroughTitle');
    const seeing = overlay.querySelector('#walkthroughSeeing');
    const meaning = overlay.querySelector('#walkthroughMeaning');
    const next = overlay.querySelector('#walkthroughNext');
    if (title) title.textContent = chapter.title;
    if (seeing) seeing.textContent = `What you are seeing: ${chapter.seeing}`;
    if (meaning) meaning.textContent = `What it means: ${chapter.meaning}`;
    if (next) next.textContent = `What to do next: ${chapter.next}`;
    if (card) card.dataset.chapter = chapter.id;
    overlay.classList.add('visible');
  }

  function renderRail() {
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'guide-rail';
      rail.className = 'guide-rail';
      rail.innerHTML = `
        <div class="guide-header">
          <div>
            <div class="text-sm font-display">Guide</div>
            <div class="text-xs text-gray-400">Workflows, not just tips</div>
          </div>
          <button id="guide-toggle" class="guide-toggle" aria-expanded="true">Hide</button>
        </div>
        <div class="guide-body" id="guide-body"></div>`;
      document.body.appendChild(rail);
      const toggle = rail.querySelector('#guide-toggle');
      toggle.addEventListener('click', () => {
        const collapsed = rail.classList.toggle('collapsed');
        const body = document.getElementById('guide-body');
        if (body) body.style.display = collapsed ? 'none' : 'flex';
        toggle.textContent = collapsed ? 'Show' : 'Hide';
        toggle.setAttribute('aria-expanded', String(!collapsed));
        localStorage.setItem(collapseKey, collapsed ? 'true' : 'false');
      });
      if (localStorage.getItem(collapseKey) === 'true') {
        rail.querySelector('#guide-toggle').click();
      }
    }
    const body = rail.querySelector('#guide-body');
    if (!body) return;
    const page = (window.location.pathname.split('/').pop() || 'dashboard.html').replace('.html', '');
    body.innerHTML = chapters
      .filter(ch => !ch.pages || ch.pages.some(p => page.includes(p)))
      .map(ch => {
        const done = isDone(ch.id);
        const stateClass = done ? 'done' : 'pending';
        return `
          <div class="guide-chapter" data-chapter="${ch.id}">
            <div>
              <div class="chapter-meta"><span class="chapter-status ${stateClass}"></span><span>${ch.title}</span></div>
              <div class="text-xs text-gray-400">${ch.seeing}</div>
            </div>
            <div class="chapter-actions">
              <button class="micro-badge" data-action="focus" data-id="${ch.id}">Focus</button>
              <button class="micro-badge" data-action="done" data-id="${ch.id}">${done ? 'Reset' : 'Done'}</button>
            </div>
          </div>`;
      }).join('');
    body.querySelectorAll('button[data-action="focus"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        focusChapter(id);
      });
    });
    body.querySelectorAll('button[data-action="done"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const done = isDone(id);
        markDone(id, !done);
      });
    });
  }

  function toggleRail() {
    if (!rail) return;
    const toggle = rail.querySelector('#guide-toggle');
    if (toggle) toggle.click();
  }

  function init() {
    renderRail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.blockBusterGuide = {
    focusChapter,
    toggleRail,
    markDone,
    resetProgress
  };
})();

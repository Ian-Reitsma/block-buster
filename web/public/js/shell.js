(function () {
  if (typeof document === 'undefined') return;

  const navGroups = [
    { label: 'Operate', items: [
      { href: 'dashboard.html', text: 'Dashboard' },
      { href: 'network.html', text: 'Network Health' },
      { href: 'economics.html', text: 'Economics & Gating' },
      { href: 'theblock.html', text: 'Ledger & Gates' }
    ]},
    { label: 'Trade', items: [
      { href: 'trading.html', text: 'Trading Console' },
      { href: 'strategies.html', text: 'Strategies' }
    ]},
    { label: 'Analyze', items: [
      { href: 'whales.html', text: 'Whale Watch' },
      { href: 'sentiment.html', text: 'Sentiment' },
      { href: 'mev.html', text: 'MEV Shield' }
    ]},
    { label: 'Configure', items: [
      { href: 'settings.html', text: 'Settings' }
    ]}
  ];

  function normalize(path) {
    return (path || '').replace(/index\.html$/, '').replace(/^\//, '') || 'dashboard.html';
  }

  function buildNavLinks() {
    return navGroups.map(group => `
      <div>
        <div class="nav-group-label">${group.label}</div>
        ${group.items.map(item => `<a class="nav-link" href="${item.href}" data-nav="${item.href}">${item.text}</a>`).join('')}
      </div>
    `).join('');
  }

  function renderShell() {
    if (document.getElementById('app-shell')) return;
    const shell = document.createElement('div');
    shell.id = 'app-shell';
    shell.className = 'app-shell';
    shell.innerHTML = `
      <div class="atmospheric-glow"></div>
      <div id="offline-banner" class="banner banner-offline hidden" role="status">Offline — retrying…</div>
      <header class="app-header">
        <div class="bar">
          <div class="header-left">
            <button id="nav-toggle" class="icon-button" aria-expanded="false" aria-controls="side-menu" aria-label="Open menu">☰</button>
            <div>
              <div class="brand-title">BLOCK BUSTER</div>
              <div class="env-badge" id="env-badge">THE BLOCK</div>
            </div>
          </div>
          <div class="command-area">
            <input id="command-palette" class="command-input" type="text" placeholder="Jump to command or type ? (⌘K)" aria-label="Command palette" />
            <select id="global-range" class="range-chip" aria-label="Global time range">
              <option value="5m">Last 5m</option>
              <option value="15m">Last 15m</option>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
            </select>
          </div>
          <div class="header-right">
            <div class="flex items-center gap-2" aria-live="polite">
              <div id="network-indicator" class="w-2 h-2 rounded-full bg-block-green animate-pulse" aria-hidden="true"></div>
              <span class="text-xs text-gray-300" id="network-label">Waiting…</span>
              <canvas id="latencySparkline" class="latency-sparkline" width="120" height="34"></canvas>
              <span class="micro-badge" id="net-errors">0 errs/60s</span>
              <span class="micro-badge" id="net-lag">lag —</span>
            </div>
            <span id="cluster-chip" class="chip">Cluster —</span>
            <span id="connection-pill" class="connection-pill warn">Link Down</span>
            <button id="tutorial-btn" class="btn ghost" type="button">Guide</button>
            <button id="settings-shortcut" class="icon-button" type="button" aria-label="Open settings">⚙️</button>
          </div>
        </div>
      </header>
      <nav id="side-menu" class="app-nav" aria-label="Primary">
        <div class="nav-inner">${buildNavLinks()}</div>
      </nav>
      <div id="menuOverlay" class="drawer-overlay"></div>
    `;
    document.body.prepend(shell);
  }

  function attachNav() {
    const navToggle = document.getElementById('nav-toggle');
    const sideMenu = document.getElementById('side-menu');
    const overlay = document.getElementById('menuOverlay');
    if (!navToggle || !sideMenu || !overlay) return;
    function openMenu() {
      navToggle.setAttribute('aria-expanded', 'true');
      sideMenu.classList.add('open');
      overlay.classList.add('visible');
    }
    function closeMenu() {
      navToggle.setAttribute('aria-expanded', 'false');
      sideMenu.classList.remove('open');
      overlay.classList.remove('visible');
    }
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      expanded ? closeMenu() : openMenu();
    });
    overlay.addEventListener('click', closeMenu);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  function highlightNav() {
    const path = normalize(window.location.pathname.split('/').pop());
    document.querySelectorAll('[data-nav]').forEach(link => {
      const target = normalize(link.dataset.nav);
      if (path === target) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }

  function wireShortcuts() {
    const settingsBtn = document.getElementById('settings-shortcut');
    if (settingsBtn) settingsBtn.addEventListener('click', () => { window.location.href = 'settings.html'; });

    const cmd = document.getElementById('command-palette');
    if (cmd) {
      cmd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const value = cmd.value.trim().toLowerCase();
          const jump = {
            'dashboard': 'dashboard.html', 'overview': 'dashboard.html',
            'economics': 'economics.html', 'gates': 'economics.html', 'issuance': 'economics.html',
            'ledger': 'theblock.html', 'block': 'theblock.html',
            'trade': 'trading.html', 'strategies': 'strategies.html',
            'whales': 'whales.html', 'sentiment': 'sentiment.html',
            'mev': 'mev.html', 'settings': 'settings.html'
          };
          if (jump[value]) window.location.href = jump[value];
        }
      });
      window.addEventListener('keydown', (e) => {
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          cmd.focus();
        }
      });
    }

    const guideBtn = document.getElementById('tutorial-btn');
    if (guideBtn) guideBtn.addEventListener('click', () => {
      if (window.blockBusterGuide?.toggleRail) window.blockBusterGuide.toggleRail();
    });
  }

  function initConnectionChip() {
    const pill = document.getElementById('connection-pill');
    if (!pill) return;
    pill.textContent = 'Link Down';
    pill.classList.remove('ok', 'warn', 'bad');
    pill.classList.add('warn');
  }

  // health + offline monitor (HEAD fallback) + latency labels
  function startHealthMonitor() {
    const offline = document.getElementById('offline-banner');
    const indicator = document.getElementById('network-indicator');
    const label = document.getElementById('network-label');
    const lagChip = document.getElementById('net-lag');
    const errChip = document.getElementById('net-errors');
    const conn = document.getElementById('connection-pill');
    const api = currentApiBase();

    async function probe() {
      try {
        const { res, latencyMs } = await fetchWithTiming(`${api}/health`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`health ${res.status}`);
        const data = await res.json();
        indicator?.classList.remove('bg-red-500');
        indicator?.classList.add('bg-block-green');
        label.textContent = 'Live';
        lagChip.textContent = `lag ${Math.round(data.feature_lag_ms ?? latencyMs)}ms`;
        errChip.textContent = `${data.recent_errors ?? 0} errs/60s`;
        conn.textContent = 'Healthy';
        conn.classList.remove('warn','bad'); conn.classList.add('ok');
        offline?.classList.add('hidden');
      } catch (err) {
        // fallback HEAD
        try {
          await fetch(api, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' });
        } catch (_) {}
        indicator?.classList.remove('bg-block-green');
        indicator?.classList.add('bg-red-500');
        label.textContent = 'Offline';
        lagChip.textContent = 'lag —';
        errChip.textContent = 'errs —';
        conn.textContent = 'Link Down';
        conn.classList.remove('ok'); conn.classList.add('warn');
        offline?.classList.remove('hidden');
      }
    }
    probe();
    setInterval(probe, 10000);
  }

  function init() {
    renderShell();
    attachNav();
    highlightNav();
    wireShortcuts();
    initConnectionChip();
    startHealthMonitor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.blockShell = {
    highlightNav,
    setEnv(label = 'THE BLOCK') { const el = document.getElementById('env-badge'); if (el) el.textContent = label; },
    setCluster(label) { const el = document.getElementById('cluster-chip'); if (el) el.textContent = label || 'Cluster —'; },
    setConnection(status, tone = 'ok') {
      const pill = document.getElementById('connection-pill');
      if (!pill) return;
      pill.textContent = status;
      pill.classList.remove('ok', 'warn', 'bad');
      pill.classList.add(tone);
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  const hasPositionsMap = !!document.getElementById('positionsMap');
  const hasPositionsList = !!document.getElementById('positionsList');
  const hasHistoryList = !!document.getElementById('historyList');
  const hasRealized = !!document.getElementById('realizedPnL');
  const hasRisk =
    ['portfolioValue','portfolioChange','riskMaxDrawdown','positionSize','leverageRatio','exposure']
      .some(id => document.getElementById(id));
  const hasRug = !!document.getElementById('rugPullIndicator') || !!document.getElementById('rugPullDetail') || !!document.getElementById('rugPull');
  const hasStrategy = typeof updateStrategyMatrix === 'function' || !!document.getElementById('strategyMatrix');

  // Hard stop: if the page doesn't host any of these widgets, do nothing (prevents 404 spam on dashboard).
  if (!(hasPositionsMap || hasPositionsList || hasHistoryList || hasRisk || hasRug || hasStrategy)) {
    return;
  }

  function renderPositionsMap() {
    const canvas = document.getElementById('positionsMap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let positions = [];

    function draw() {
      const barWidth = 20;
      const height = canvas.height;
      canvas.width = positions.length * (barWidth + 4);
      ctx.clearRect(0, 0, canvas.width, height);
      positions.forEach((p, idx) => {
        const x = idx * (barWidth + 4);
        ctx.fillStyle = p.qty >= 0 ? '#00e5ff' : '#ff6b35';
        ctx.fillRect(x, 0, barWidth, height);
      });
      if (canvas.parentElement) {
        canvas.parentElement.scrollLeft = canvas.width;
      }
    }

    async function loadPositionsSnapshot() {
      try {
        const data = await fetch(`${API_BASE}/positions`).then(r => r.json());
        positions = Array.isArray(data) ? data : Object.values(data || {});
        draw();
      } catch (err) {
        console.warn('positions snapshot failed', err);
      }
    }

    try {
      const ws = new WebSocket(apiClient.getWebSocketURL('/positions/ws'));
      ws.addEventListener('open', () => {
        setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 5000);
      });
      ws.onmessage = evt => {
        try {
          const data = JSON.parse(evt.data);
          positions = Array.isArray(data) ? data : Object.values(data);
          draw();
        } catch (err) {
          console.error('positions ws parse failed', err);
        }
      };
    } catch (err) {
      console.error('positions ws failed', err);
    }

    loadPositionsSnapshot();
    setInterval(loadPositionsSnapshot, 10000);
  }

  async function loadPositions() {
    try {
      const list = document.getElementById('positionsList');
      if (!list) return;
      const data = await fetch(`${API_BASE}/positions`).then(r => r.json());
      list.innerHTML = '';
      Object.entries(data).forEach(([token, p]) => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between hologram-text text-sm';
        const qty = p.qty || 0;
        div.innerHTML = `<span>${token}</span><span>${formatBlock(qty)}</span>`;
        list.appendChild(div);
      });
    } catch (e) {
      console.error('positions load failed', e);
    }
  }

  function renderHistoryEntry(order) {
    const pnl = order.pnl ?? 0;
    const entry = document.createElement('div');
    entry.className = 'bg-void-black/50 p-4 rounded border';
    entry.classList.add(pnl >= 0 ? 'border-blade-cyan/30' : 'border-blade-orange/30');
    const color = pnl >= 0 ? 'text-cyan-glow' : 'text-blade-orange';
    const time = order.timestamp ? new Date(order.timestamp * 1000).toLocaleTimeString() : '';
    entry.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <div>
                <div class="hologram-text text-white font-bold">${order.token || ''} ${order.status ? order.status.toUpperCase() : ''}</div>
                <div class="hologram-text text-xs text-blade-amber/60">${time} • ${order.strategy || ''}</div>
            </div>
            <div class="text-right">
                <div class="hologram-text ${color} font-bold">${formatBlockChange(pnl)}</div>
            </div>
        </div>`;
    return entry;
  }

  function appendHistoryEntry(order) {
    const list = document.getElementById('historyList');
    if (!list) return;
    const entry = renderHistoryEntry(order);
    list.insertBefore(entry, list.firstChild);
  }

  async function loadHistory() {
    try {
      const orders = await fetch(`${API_BASE}/orders?limit=50`).then(r => r.json());
      const list = document.getElementById('historyList');
      if (!Array.isArray(orders) || !list) return;
      list.innerHTML = '';
      orders.forEach(o => appendHistoryEntry(o));
    } catch (err) {
      console.error('history load failed', err);
    }
  }

  async function pollRisk() {
    try {
      const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/risk/portfolio`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`risk ${res.status}`);
      const data = await res.json();
      const equity = typeof data.equity === 'number' ? data.equity : 10;
      const change = data.change || 0;
      const changePct = data.change_pct || 0;
      const pv = document.getElementById('portfolioValue');
      if (pv) pv.textContent = formatBlock(equity);
      const pc = document.getElementById('portfolioChange');
      if (pc) pc.textContent = `${formatBlockChange(change)} (${formatPercent(changePct)})`;
      const dd = document.getElementById('riskMaxDrawdown');
      if (dd) dd.textContent = formatPercent(-data.max_drawdown * 100);
      const ps = document.getElementById('positionSize');
      if (ps) ps.textContent = formatBlock(data.position_size || 0);
      const lev = document.getElementById('leverageRatio');
      if (lev) lev.textContent = `${data.leverage.toFixed(2)}x`;
      const ex = document.getElementById('exposure');
      if (ex) ex.textContent = formatPercent(data.exposure * 100);
      const stamp = document.getElementById('portfolio-updated');
      if (stamp) stamp.textContent = `Updated ${new Date().toLocaleTimeString()}`;
      setProvenanceChip('portfolio-source', '/risk/portfolio', latencyMs);
    } catch (e) {
      console.warn('risk poll failed', e);
      const pv = document.getElementById('portfolioValue');
      if (pv) pv.textContent = formatBlock(0);
      const pc = document.getElementById('portfolioChange');
      if (pc) pc.textContent = `${formatBlockChange(0)} (${formatPercent(0)})`;
    }
  }

  async function pollRealizedPnl() {
    try {
      const data = await fetch(`${API_BASE}/pnl/realized`).then(r => r.json());
      const total = data.total ?? 0;
      const change = data.change ?? 0;
      const changePct = data.change_pct ?? 0;
      const el = document.getElementById('realizedPnL');
      if (el) el.textContent = formatBlock(total);
      const changeEl = document.getElementById('realizedPnLChange');
      if (changeEl) {
        const arrow = change >= 0 ? '↗' : '↘';
        changeEl.textContent = `${arrow} ${formatBlockChange(change)} (${formatPercent(changePct)})`;
      }
    } catch (e) {
      console.warn('realized pnl poll failed', e);
    }
  }

  async function pollRug() {
    try {
      const res = await fetch(`${API_BASE}/risk/rug`).then(r => r.json());
      const indicator = document.getElementById('rugPullIndicator');
      const detail = document.getElementById('rugPullDetail');
      const status = document.getElementById('rugPull');
      if (res.alerts && res.alerts.length) {
        indicator?.classList.remove('status-online');
        indicator?.classList.add('bg-blade-orange');
        status.textContent = 'ALERT';
        detail.textContent = res.alerts[0].reason;
      } else {
        indicator?.classList.add('status-online');
        indicator?.classList.remove('bg-blade-orange');
        status.textContent = 'SAFE';
        detail.textContent = 'No threats detected';
      }
    } catch (e) {
      console.warn('rug poll failed', e);
    }
  }

  async function loadStrategyMatrix() {
    try {
      const data = await fetch(`${API_BASE}/strategy/matrix`).then(r => r.json());
      if (typeof updateStrategyMatrix === 'function') {
        updateStrategyMatrix(data);
      }
    } catch (e) {
      if (typeof updateStrategyMatrix === 'function') {
        updateStrategyMatrix(null);
      }
    }
  }

  window.loadPositions = loadPositions;
  window.loadHistory = loadHistory;
  window.appendHistoryEntry = appendHistoryEntry;

  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  if (tabButtons.length) {
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-tab');
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => content.classList.add('hidden'));
        const panel = document.getElementById(`${target}Tab`);
        if (panel) panel.classList.remove('hidden');
        if (target === 'history') {
          loadHistory();
        } else {
          loadPositions();
        }
      });
    });
  }

  if (hasPositionsList) {
    loadPositions().then(() => {
      if (hasRisk) pollRisk();
    });
  }
  if (hasStrategy) {
    loadStrategyMatrix();
    setInterval(loadStrategyMatrix, 10000);
  }
  if (hasPositionsMap) {
    renderPositionsMap();
  }
  if (hasRisk) {
    pollRisk();
    setInterval(pollRisk, 5000);
  }
  if (hasRealized) {
    pollRealizedPnl();
    setInterval(pollRealizedPnl, 8000);
  }
  if (hasRug) {
    pollRug();
    setInterval(pollRug, 10000);
  }
});

(function () {
  if (typeof document === 'undefined') return;
  const api = currentApiBase();
  const gatedBanner = document.getElementById('gated-banner');
  const gatedParam = new URLSearchParams(window.location.search).get('gated');
  if (gatedBanner && gatedParam === '1') gatedBanner.classList.remove('hidden');
  let latencyChart = null;
  let errorChart = null;
  const latencyPoints = [];
  const walPoints = [];
  const errorPoints = [];
  const memtablePoints = [];
  const sstPoints = [];
  const compPoints = [];
  const diskPoints = [];
  const headHeights = [];
  const finalizedHeights = [];
  const gapPoints = [];
  const tpsPoints = [];
  const blockTimePoints = [];
  const peerPoints = [];
  const strengthPoints = [];
  const p50Points = [];
  const p95Points = [];
  const uptimePoints = [];
  const rpcFailPoints = [];
  const labels = [];
  const MAX_POINTS = 50;
  let paused = false;
  let smooth = false;
  let lastNetwork = null;
  let lastGates = [];
  let lastRpcFailures = null;
  let lastRpcTs = null;
  const GATE_REQUIREMENTS = {
    compute: 25,
    storage: 18,
    energy: 12,
    ad: 8,
  };
  const DEFAULT_GATE_REQUIREMENT = 14;

  function normalizeGateName(value) {
    if (!value) return '';
    return value.replace(/_market$/i, '').toLowerCase();
  }

  function getGateRequirement(name) {
    return GATE_REQUIREMENTS[normalizeGateName(name)] ?? DEFAULT_GATE_REQUIREMENT;
  }

  function isGateOpen(gate) {
    return (gate?.state || '').toLowerCase() === 'trade';
  }

  function computeGateCoverage(gate, peersOnline) {
    const streakRequired = gate?.streak_required;
    const enterStreak = gate?.enter_streak;
    if (typeof streakRequired === 'number' && streakRequired > 0 && typeof enterStreak === 'number') {
      return Math.min(100, Math.round((enterStreak / streakRequired) * 100));
    }
    const required = getGateRequirement(gate?.market);
    if (required <= 0) return 100;
    if (!peersOnline) return 0;
    return Math.min(100, Math.round((peersOnline / required) * 100));
  }

  function nodesShortfall(gate, peersOnline) {
    if (isGateOpen(gate)) return 0;
    const streakRequired = gate?.streak_required;
    const enterStreak = gate?.enter_streak;
    if (typeof streakRequired === 'number' && streakRequired > 0 && typeof enterStreak === 'number') {
      return Math.max(0, streakRequired - enterStreak);
    }
    const required = getGateRequirement(gate?.market);
    return Math.max(0, required - (peersOnline ?? 0));
  }

  function updateGateReadinessSummary(gates = []) {
    if (!Array.isArray(gates)) gates = [];
    const peersOnline = lastNetwork?.connected_peers ?? lastNetwork?.peer_count ?? 0;
    const total = gates.length;
    const closed = gates.filter(g => !isGateOpen(g)).length;
    const open = total - closed;
    const avgCoverage = total
      ? Math.round(gates.reduce((sum, g) => sum + computeGateCoverage(g, peersOnline), 0) / total)
      : 0;
    const nodesNeeded = gates.reduce((sum, g) => sum + nodesShortfall(g, peersOnline), 0);

    const openCountEl = document.getElementById('nh-gate-open-count');
    const coverageEl = document.getElementById('nh-gate-coverage');
    const coverageNote = document.getElementById('nh-gate-coverage-note');
    const nodesEl = document.getElementById('nh-gate-nodes-needed');
    const nodesNote = document.getElementById('nh-gate-nodes-note');
    const summaryText = document.getElementById('nh-gate-summary-text');
    if (openCountEl) openCountEl.textContent = total ? `${open} / ${total}` : '—';
    if (coverageEl) coverageEl.textContent = total ? `${avgCoverage}%` : '—';
    if (coverageNote) coverageNote.textContent = total
      ? `Peers ${peersOnline} vs gates`
      : 'Awaiting governor data';
    if (nodesEl) nodesEl.textContent = nodesNeeded ? `${nodesNeeded}` : 'None';
    if (nodesNote) {
      nodesNote.textContent = nodesNeeded
        ? 'Gap remaining (streaks or nodes)'
        : 'Gate requirements met';
    }
    if (summaryText) {
      summaryText.textContent = total
          ? closed === 0
            ? 'All markets reporting live'
            : `${closed} gate${closed === 1 ? '' : 's'} awaiting ${nodesNeeded} threshold`
        : 'Governor data pending';
    }
  }

  function stamp(text) {
    const el = document.getElementById('nh-updated');
    if (el) el.textContent = `Updated ${new Date().toLocaleTimeString()} ${text ? `• ${text}` : ''}`;
  }

  function setKpi(id, value, metaId, meta) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
    if (metaId) {
      const m = document.getElementById(metaId);
      if (m) m.textContent = meta;
    }
  }

  function setStatusPill(pillId, state, label) {
    const pill = document.getElementById(pillId);
    if (!pill) return;
    pill.textContent = label;
    pill.classList.remove('status-good','status-warn','status-bad','status-info');
    const map = { good: 'status-good', warn: 'status-warn', bad: 'status-bad', info: 'status-info' };
    if (map[state]) pill.classList.add(map[state]);
  }

  function renderOverview(network, latencyMs) {
    lastNetwork = network || lastNetwork;
    const net = lastNetwork || {};
    const strength = net.network_strength ?? null;
    const peers = net.connected_peers ?? net.peer_count ?? net.peers ?? null;
    const latency = net.avg_latency_ms ?? latencyMs ?? net.rpc_latency_ms ?? null;
    if (strength !== null) setKpi('nh-strength', `${strength}`, 'nh-strength-meta', 'composite health');
    if (peers !== null) setKpi('nh-peers', `${peers}`, 'nh-peers-meta', 'connected peers');
    if (latency !== null) setKpi('nh-latency', `${latency}ms`, 'nh-latency-meta', 'rpc latency');
    const source = document.getElementById('nh-overview-source');
    if (source && typeof latencyMs === 'number') source.textContent = `/theblock/network • ${latencyMs}ms`;
  }

  function renderGateSummaryChip(gates) {
    const chip = document.getElementById('nh-gate-summary');
    if (!chip) return;
    if (!Array.isArray(gates) || gates.length === 0) {
      chip.textContent = 'gates —';
      chip.classList.remove('good','warn');
      return;
    }
    const closed = gates.filter(g => (g.state || '').toLowerCase() !== 'trade');
    chip.textContent = closed.length === 0 ? 'gates open' : `${closed.length} gated`;
    chip.classList.toggle('good', closed.length === 0);
    chip.classList.toggle('warn', closed.length > 0);
    if (gatedBanner) gatedBanner.classList.toggle('hidden', closed.length === 0 && gatedParam !== '1');
    if (closed.length === 0 && gatedParam === '1' && gatedBanner) {
      gatedBanner.innerHTML = 'Gates open — returning to dashboard. <a class="underline" href="dashboard.html">Open now</a>';
      if (!window.__gateRedirect) {
        window.__gateRedirect = setTimeout(() => { window.location.href = 'dashboard.html'; }, 2500);
      }
    }
    const latch = document.getElementById('nh-gate-latch');
    if (latch) {
      const live = closed.length === 0 && gates.length > 0;
      latch.textContent = live ? 'Markets live' : `${closed.length} gate${closed.length === 1 ? '' : 's'} waiting`;
      latch.classList.toggle('live', live);
      latch.classList.toggle('alert', !live);
    }
  }

  function renderGates(gates) {
    lastGates = gates || [];
    const grid = document.getElementById('nh-gates-grid');
    if (!grid) return;
    if (!Array.isArray(gates) || gates.length === 0) {
      grid.innerHTML = '<div class="gate-card"><div class="panel-subtitle">No gate data returned.</div></div>';
      return;
    }
    const peersOnline = lastNetwork?.connected_peers ?? lastNetwork?.peer_count ?? 0;
    const cards = gates.map(g => {
      const name = (g.market || '').replace('_market','') || 'market';
      const state = (g.state || 'unknown').toLowerCase();
      const reason = g.reason || '—';
      const required = getGateRequirement(g.market);
      const coverage = computeGateCoverage(g, peersOnline);
      const missingNodes = nodesShortfall(g, peersOnline);
      const cls = state === 'trade' ? 'trade' : (state.includes('observe') ? 'observe' : 'closed');
      const lastChange = g.last_transition_height
        ? `height ${g.last_transition_height}`
        : (g.last_change ? new Date(g.last_change).toLocaleTimeString() : 'recent');
      const econ = g.economics || {};
      const utilPpm = econ.utilization_ppm ?? econ.utilization ?? null;
      const marginPpm = econ.provider_margin_ppm ?? econ.provider_margin ?? null;
      const streakReq = g.streak_required;
      const streakNow = g.enter_streak;
      const fmtPpm = (v) => typeof v === 'number' ? `${(v / 10000).toFixed(1)}%` : '—';
      return `
        <div class="gate-card hologram-panel">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-semibold text-gray-200 uppercase">${name}</div>
            <span class="gate-chip ${cls}">${(g.state || 'unknown').toUpperCase()}</span>
          </div>
          <div class="gate-meta mb-1">Reason: ${reason}</div>
          <div class="gate-meta mb-1">Peers ${peersOnline} / ${required} · est. ${coverage}% coverage</div>
          <div class="gate-meta mb-1">Streak ${streakNow ?? '—'} / ${streakReq ?? '—'} · Nodes/steps missing ${missingNodes}</div>
          <div class="gate-meta gate-readiness-meta mb-1">Util ${fmtPpm(utilPpm)} · Margin ${fmtPpm(marginPpm)}</div>
          <div class="gate-progress" aria-hidden="true">
            <span class="gate-progress-bar" style="width:${coverage}%;"></span>
          </div>
          <div class="gate-meta">Last change ${lastChange}</div>
        </div>`;
    }).join('');
    grid.innerHTML = cards;
  }

  function ensureMiniChart(id, data, label, color) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{ label, data, backgroundColor: color, borderColor: color }]
      },
      options: {
        animation: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { ticks: { color: '#9fb1c8' } } }
      }
    });
  }

  function renderMiniCharts() {
    if (!window.uptimeChart) window.uptimeChart = ensureMiniChart('nh-uptime-mini', uptimePoints, 'uptime', '#7cc6ff');
    if (!window.rpcFailChart) window.rpcFailChart = ensureMiniChart('nh-rpcfail-mini', rpcFailPoints, 'rpcfail', '#ef4444');
    if (window.uptimeChart) {
      window.uptimeChart.data.labels = uptimePoints.map((_, i) => i);
      window.uptimeChart.data.datasets[0].data = [...uptimePoints];
      window.uptimeChart.update('none');
    }
    if (window.rpcFailChart) {
      window.rpcFailChart.data.labels = rpcFailPoints.map((_, i) => i);
      window.rpcFailChart.data.datasets[0].data = [...rpcFailPoints];
      window.rpcFailChart.update('none');
    }
  }

  function setLegend(valueRpc, valueWal) {
    const rpc = document.getElementById('nh-legend-rpc');
    const wal = document.getElementById('nh-legend-wal');
    if (rpc) rpc.textContent = `RPC ${valueRpc}ms`;
    if (wal) wal.textContent = `WAL ${valueWal}ms`;
  }

  function ensureLatencyChart() {
    const ctx = document.getElementById('nh-latency-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    latencyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'RPC', data: latencyPoints, borderColor: '#22c55e', fill: false, tension: 0.25 },
          { label: 'WAL', data: walPoints, borderColor: '#f59e0b', fill: false, tension: 0.25 }
        ]
      },
      options: {
        animation: false,
        plugins: { legend: { display: true, labels: { color: '#e2e8f0', boxWidth: 10, boxHeight: 8, font: { size: 10 } } } },
        scales: { x: { display: false }, y: { display: true, ticks: { color: '#9fb1c8' } } }
      }
    });
    return latencyChart;
  }

  function ensureErrorChart() {
    const ctx = document.getElementById('nh-error-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    errorChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Errors total', data: errorPoints, backgroundColor: '#ef5b6b' }
        ]
      },
      options: {
        animation: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { ticks: { color: '#9fb1c8' } } }
      }
    });
    return errorChart;
  }

  function ensureStorageChart() {
    const ctx = document.getElementById('nh-storage-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Memtables', data: memtablePoints, backgroundColor: 'rgba(124,198,255,0.25)', borderColor: '#7cc6ff', fill: true, tension: 0.25, stack: 'storage' },
          { label: 'SST files', data: sstPoints, backgroundColor: 'rgba(63,216,173,0.25)', borderColor: '#3fd8ad', fill: true, tension: 0.25, stack: 'storage' }
        ]
      },
      options: {
        animation: false,
        plugins: { legend: { display: true, labels: { color: '#e2e8f0', font: { size: 10 } } } },
        scales: { x: { display: false }, y: { ticks: { color: '#9fb1c8' } } }
      }
    });
  }

  function ensureCompactionChart() {
    const ctx = document.getElementById('nh-compaction-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    return new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Compaction queue', data: compPoints, backgroundColor: '#f59e0b' }] },
      options: {
        animation: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { ticks: { color: '#9fb1c8' } } }
      }
    });
  }

  function ensureFinalityChart() {
    const ctx = document.getElementById('nh-finality-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Head', data: headHeights, borderColor: '#7cc6ff', backgroundColor: 'rgba(124,198,255,0.12)', tension: 0.25, fill: true },
          { label: 'Finalized', data: finalizedHeights, borderColor: '#3fd8ad', backgroundColor: 'rgba(63,216,173,0.12)', tension: 0.25, fill: true },
          { label: 'Gap', data: gapPoints, borderColor: '#f59e0b', borderDash: [6,4], fill: false, yAxisID: 'y1' }
        ]
      },
      options: {
        animation: false,
        plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 10 } } } },
        scales: {
          x: { display: false },
          y: { ticks: { color: '#9fb1c8' } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: '#fbbf24' } }
        }
      }
    });
  }

  function ensureThroughputChart() {
    const ctx = document.getElementById('nh-throughput-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'TPS', data: tpsPoints, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.18)', tension: 0.25, fill: true },
          { label: 'Block time p50', data: p50Points, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.10)', tension: 0.25, fill: true, yAxisID: 'y1' },
          { label: 'Block time p95', data: p95Points, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', tension: 0.25, fill: true, yAxisID: 'y1' },
          { label: 'Target 1000ms', data: [], borderColor: '#3fd8ad', borderDash: [6,4], fill: false, yAxisID: 'y1' },
          { label: 'Warn 1500ms', data: [], borderColor: '#f59e0b', borderDash: [6,4], fill: false, yAxisID: 'y1' },
          { label: 'Crit 2200ms', data: [], borderColor: '#ef4444', borderDash: [6,4], fill: false, yAxisID: 'y1' }
        ]
      },
      options: {
        animation: false,
        plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 10 } } } },
        scales: {
          x: { display: false },
          y: { ticks: { color: '#9fb1c8' } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: '#22c55e' } }
        }
      }
    });
  }

  function ensurePeerChart() {
    const ctx = document.getElementById('nh-peer-chart')?.getContext('2d');
    if (!ctx || !window.Chart) return null;
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Peers', data: peerPoints, backgroundColor: 'rgba(124,198,255,0.4)', borderColor: '#7cc6ff' },
          { label: 'Strength', data: strengthPoints, backgroundColor: 'rgba(63,216,173,0.4)', borderColor: '#3fd8ad', yAxisID: 'y1' },
          { label: 'Warn 10', data: [], borderColor: '#f59e0b', type: 'line', borderDash: [6,4], fill: false },
          { label: 'Crit 5', data: [], borderColor: '#ef4444', type: 'line', borderDash: [6,4], fill: false }
        ]
      },
      options: {
        animation: false,
        plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 10 } } } },
        scales: {
          x: { display: false },
          y: { ticks: { color: '#9fb1c8' } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: '#3fd8ad' } }
        }
      }
    });
  }

  function updateCharts(latency, walMs, errors) {
    if (paused) return;
    const ts = new Date().toLocaleTimeString();
    labels.push(ts);
    const lp = smooth && latencyPoints.length >= 2
      ? Math.round((latencyPoints.at(-1) + latencyPoints.at(-2) + latency) / 3)
      : latency;
    const wp = smooth && walPoints.length >= 2
      ? Math.round((walPoints.at(-1) + walPoints.at(-2) + walMs) / 3)
      : walMs;
    const ep = smooth && errorPoints.length >= 2
      ? Math.round((errorPoints.at(-1) + errorPoints.at(-2) + errors) / 3)
      : errors;
    latencyPoints.push(lp);
    walPoints.push(wp);
    errorPoints.push(ep);
    if (labels.length > MAX_POINTS) { labels.shift(); latencyPoints.shift(); walPoints.shift(); errorPoints.shift(); memtablePoints.shift(); sstPoints.shift(); compPoints.shift(); diskPoints.shift(); }

    if (!latencyChart) ensureLatencyChart();
    if (!errorChart) ensureErrorChart();
    if (!window.storageChart) window.storageChart = ensureStorageChart();
    if (!window.compChart) window.compChart = ensureCompactionChart();
    if (!window.finalityChart) window.finalityChart = ensureFinalityChart();
    if (!window.throughputChart) window.throughputChart = ensureThroughputChart();
    if (!window.peerChart) window.peerChart = ensurePeerChart();
  const ensureConst = (chart, datasetIndex, value) => {
    if (!chart || !chart.data || !chart.data.datasets[datasetIndex]) return;
    const len = labels.length;
    chart.data.datasets[datasetIndex].data = Array(len).fill(value);
  };
    if (latencyChart) {
      latencyChart.data.labels = [...labels];
      latencyChart.data.datasets[0].data = [...latencyPoints];
      latencyChart.data.datasets[1].data = [...walPoints];
      latencyChart.update('none');
    }
    if (errorChart) {
      errorChart.data.labels = [...labels];
      errorChart.data.datasets[0].data = [...errorPoints];
      errorChart.update('none');
    }
    if (window.storageChart) {
      window.storageChart.data.labels = [...labels];
      window.storageChart.data.datasets[0].data = [...memtablePoints];
      window.storageChart.data.datasets[1].data = [...sstPoints];
      window.storageChart.update('none');
    }
    if (window.compChart) {
      window.compChart.data.labels = [...labels];
      window.compChart.data.datasets[0].data = [...compPoints];
      window.compChart.update('none');
    }
    if (window.finalityChart) {
      window.finalityChart.data.labels = [...labels];
      window.finalityChart.data.datasets[0].data = [...headHeights];
      window.finalityChart.data.datasets[1].data = [...finalizedHeights];
      window.finalityChart.data.datasets[2].data = [...gapPoints];
      ensureConst(window.finalityChart, 3, 10); // warn
      ensureConst(window.finalityChart, 4, 50); // critical
      window.finalityChart.update('none');
    }
    if (window.throughputChart) {
      window.throughputChart.data.labels = [...labels];
      window.throughputChart.data.datasets[0].data = [...tpsPoints];
      window.throughputChart.data.datasets[1].data = [...p50Points];
      window.throughputChart.data.datasets[2].data = [...p95Points];
      ensureConst(window.throughputChart, 3, 1000);
      ensureConst(window.throughputChart, 4, 1500);
      ensureConst(window.throughputChart, 5, 2200);
      window.throughputChart.update('none');
    }
    if (window.peerChart) {
      window.peerChart.data.labels = [...labels];
      window.peerChart.data.datasets[0].data = [...peerPoints];
      window.peerChart.data.datasets[1].data = [...strengthPoints];
      ensureConst(window.peerChart, 2, 10);
      ensureConst(window.peerChart, 3, 5);
      window.peerChart.update('none');
    }
    setLegend(latency, walMs);
  }

  async function loadNetworkSnapshot() {
    try {
      const { res, latencyMs } = await fetchWithTiming(`${api}/theblock/network`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`network ${res.status}`);
      const data = await res.json();
      const head = data.block_height ?? null;
      const finalized = data.finalized_height ?? null;
      const gap = head !== null && finalized !== null ? Math.max(0, head - finalized) : null;
      const tps = data.tps ?? null;
      const bt = data.avg_block_time_ms ?? data.block_time_ms ?? null;
      const peers = data.connected_peers ?? data.peer_count ?? null;
      const strength = data.network_strength ?? null;
      const genesisReady = data.genesis_ready ?? true;
      if (head !== null) headHeights.push(head);
      if (finalized !== null) finalizedHeights.push(finalized);
      if (gap !== null) gapPoints.push(gap);
      if (tps !== null) tpsPoints.push(tps);
      if (bt !== null) blockTimePoints.push(bt);
      if (peers !== null) peerPoints.push(peers);
      if (strength !== null) strengthPoints.push(strength);
      // derive p50/p95: prefer histogram if provided
      if (data.block_time_histogram && typeof data.block_time_histogram === 'object') {
        const p50 = data.block_time_histogram.p50_ms ?? data.block_time_histogram.p50 ?? null;
        const p95 = data.block_time_histogram.p95_ms ?? data.block_time_histogram.p95 ?? null;
        if (p50 !== null) p50Points.push(p50);
        if (p95 !== null) p95Points.push(p95);
      } else {
        // 1% dev move: approximate from rolling samples
        const sorted = [...blockTimePoints].filter(v => typeof v === 'number').sort((a,b)=>a-b);
        const pct = (arr, p) => arr.length ? arr[Math.min(arr.length-1, Math.round((p/100)*arr.length))] : null;
        const p50 = pct(sorted, 50);
        const p95 = pct(sorted, 95);
        if (p50 !== null) p50Points.push(p50);
        if (p95 !== null) p95Points.push(p95);
      }
      const cap = (arr) => { if (arr.length > MAX_POINTS) arr.shift(); };
      [headHeights, finalizedHeights, gapPoints, tpsPoints, blockTimePoints, peerPoints, strengthPoints, p50Points, p95Points].forEach(cap);
    if (!genesisReady) {
      setStatusPill('nh-status', 'warn', 'BOOTSTRAP');
      const gapChip = document.getElementById('nh-gap-chip');
      if (gapChip) gapChip.textContent = 'genesis pending';
    }
    if (gap !== null) {
      setKpi('nh-finality-gap', `${gap}`, 'nh-finality-gap-meta', 'blocks between head and finalized');
      setStatusPill('nh-status', gap > 50 ? 'warn' : (gap > 10 ? 'warn' : 'good'), gap > 50 ? 'DEGRADED' : (gap > 10 ? 'WATCH' : 'LIVE'));
      const gapChip = document.getElementById('nh-gap-chip');
      if (gapChip) gapChip.textContent = `gap ${gap} blocks`;
    }
      if (head !== null && finalized !== null) {
        const meta = `${head.toLocaleString()} / ${finalized.toLocaleString()}`;
        setKpi('nh-block-height', `${head.toLocaleString()}`, 'nh-block-height-meta', meta);
      }
      if (data.finality_time !== undefined) {
        setKpi('nh-finality-time', `${data.finality_time} blocks`, 'nh-finality-time-meta', 'blocks until final');
      }
      if (tps !== null) {
        const chip = document.getElementById('nh-throughput-chip');
        if (chip) chip.textContent = `tps ${Math.round(tps)}`;
      }
      if (bt !== null) {
        const chip = document.getElementById('nh-blocktime-chip');
        if (chip) chip.textContent = `block ${Math.round(bt)}ms`;
      }
      if (peers !== null) {
        const chip = document.getElementById('nh-peers-chip');
        if (chip) chip.textContent = `${peers} peers`;
      }
      renderOverview(data, latencyMs);
      stamp('via /theblock/network');
      updateGateReadinessSummary(lastGates);
    } catch (e) {
      pushToast(`/theblock/network failed: ${e.message}`, 'warn');
    }
  }

  async function loadGates() {
    try {
      const res = await fetch(`${api}/theblock/gates`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`gates ${res.status}`);
      const gates = await res.json();
      renderGateSummaryChip(gates);
      renderGates(gates);
      updateGateReadinessSummary(gates);
    } catch (e) {
      pushToast(`/theblock/gates failed: ${e.message}`, 'warn');
    }
  }

  async function loadHealth() {
    try {
      const { res, latencyMs } = await fetchWithTiming(`${api}/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`health ${res.status}`);
      const data = await res.json();
      const featureLagMs = data.feature_lag_seconds ? Math.round(data.feature_lag_seconds * 1000) : data.feature_lag_ms ?? null;
      const walMs = data.db_wal_fsync_lag_seconds ? Math.round(data.db_wal_fsync_lag_seconds * 1000) : (data.simple_db?.wal_fsync_lag_seconds ? Math.round(data.simple_db.wal_fsync_lag_seconds * 1000) : null);
      const errors = typeof data.recent_errors === 'object' ? (data.recent_errors.last_60s ?? data.recent_errors.total ?? 0) : (data.recent_errors ?? data.recent_error_count ?? 0);
      const memtables = data.simple_db?.memtables ?? data.simple_db?.memtable_count ?? null;
      const sst = data.simple_db?.sst_count ?? data.simple_db?.sstables ?? null;
      const compQueue = data.simple_db?.compaction_queue ?? data.simple_db?.compaction_pending ?? null;
      const diskBytes = data.simple_db?.disk_bytes ?? data.simple_db?.disk_used_bytes ?? null;
    renderOverview(lastNetwork, latencyMs);
    setKpi('nh-rpc-latency', `${latencyMs}ms`, 'nh-rpc-latency-meta', 'rpc latency');
      setKpi('nh-feature-lag', featureLagMs !== null ? `${featureLagMs}ms` : '—', 'nh-feature-meta', 'feature adapter');
      setKpi('nh-wal-lag', walMs !== null ? `${walMs}ms` : '—', 'nh-wal-meta', 'simpledb fsync');
      setKpi('nh-errors', errors, 'nh-errors-meta', 'errors last 60s');
      if (memtables !== null) setKpi('nh-memtables', memtables, 'nh-memtables-meta', 'live memtables');
      if (sst !== null) setKpi('nh-sst', sst, 'nh-sst-meta', 'sst files');
      if (diskBytes !== null) setKpi('nh-disk', formatBytes(diskBytes), 'nh-disk-meta', 'disk used');
      if (memtables !== null) memtablePoints.push(memtables); else memtablePoints.push(null);
      if (sst !== null) sstPoints.push(sst); else sstPoints.push(null);
      if (compQueue !== null) compPoints.push(compQueue); else compPoints.push(null);
      if (diskBytes !== null) diskPoints.push(diskBytes); else diskPoints.push(null);
      renderDbTable(data.simple_db || {});
      const bootstrap = lastNetwork && lastNetwork.genesis_ready === false;
      setStatusPill('nh-status', bootstrap ? 'warn' : 'good', bootstrap ? 'BOOTSTRAP' : 'LIVE');
      updateCharts(latencyMs, walMs ?? latencyMs, errors);
      setProvenanceChip('nh-health-chip', '/health', latencyMs);
      stamp();
    } catch (e) {
      setStatusPill('nh-status', 'warn', 'STALE');
      pushToast(`/health failed: ${e.message}`, 'warn');
    }
  }

  async function testMetrics() {
    try {
      const { res, latencyMs } = await fetchWithTiming(`${api}/metrics`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`metrics ${res.status}`);
      setProvenanceChip('nh-metrics-chip', '/metrics', latencyMs);
      const stampEl = document.getElementById('nh-metrics-stamp');
      if (stampEl) stampEl.textContent = `Scrape OK • ${latencyMs}ms`;
      const text = await res.text();
      parseMetrics(text);
    } catch (e) {
      const stampEl = document.getElementById('nh-metrics-stamp');
      if (stampEl) stampEl.textContent = `Scrape failed: ${e.message}`;
      pushToast('/metrics failed', 'warn', { context: e.message });
    }
  }

  function parseMetrics(text) {
    if (typeof text !== 'string') return;
    const lines = text.split('\n');
    const firstVal = (line) => {
      const parts = line.trim().split(/\s+/);
      return Number(parts.at(-1));
    };
    const findSample = (names) => {
      for (const n of names) {
        const line = lines.find(l => l.startsWith(n));
        if (line) return firstVal(line);
      }
      // wildcard match *_failures_total style
      if (names.includes('__RPC_FAILURE_WILDCARD__')) {
        const line = lines.find(l => /failures_total/.test(l) || /failed_requests_total/.test(l));
        if (line) return firstVal(line);
      }
      return null;
    };
    const uptime = findSample(['process_uptime_seconds', 'uptime_seconds', 'process_uptime']);
    if (!Number.isNaN(uptime) && uptime !== null) {
      uptimePoints.push(Math.round(uptime / 3600)); // hours
      if (uptimePoints.length > MAX_POINTS) uptimePoints.shift();
    }
    const rpcFail = findSample([
      'rpc_failures_total',
      'rpc_request_failures_total',
      'rpc_failed_requests_total',
      'rpc_errors_total',
      '__RPC_FAILURE_WILDCARD__'
    ]);
    const now = Date.now();
    if (rpcFail !== null && !Number.isNaN(rpcFail)) {
      if (lastRpcFailures !== null && lastRpcTs !== null) {
        const delta = rpcFail - lastRpcFailures;
        const minutes = (now - lastRpcTs) / 60000;
        const rate = minutes > 0 ? delta / minutes : 0;
        rpcFailPoints.push(Number(rate.toFixed(2)));
        if (rpcFailPoints.length > MAX_POINTS) rpcFailPoints.shift();
      }
      lastRpcFailures = rpcFail;
      lastRpcTs = now;
    }
    // optional p50/p95 from metrics if exported
    const p50m = findSample(['block_time_ms_p50', 'block_time_p50_ms', 'block_time_p50']);
    const p95m = findSample(['block_time_ms_p95', 'block_time_p95_ms', 'block_time_p95']);
    if (p50m !== null && !Number.isNaN(p50m)) {
      p50Points.push(p50m); if (p50Points.length > MAX_POINTS) p50Points.shift();
    }
    if (p95m !== null && !Number.isNaN(p95m)) {
      p95Points.push(p95m); if (p95Points.length > MAX_POINTS) p95Points.shift();
    }
    renderMiniCharts();
  }

  function connectFeature() {
    if (!window.connectFeatureStream) return;
    window.connectFeatureStream('/features/stream', {
      onData: (msg) => {
        if (!msg) return;
        const lagMs = msg.feature_lag_ms ?? (msg.feature_lag_seconds ? Math.round(msg.feature_lag_seconds * 1000) : null);
        const walMs = msg.simple_db?.wal_fsync_lag_seconds ? Math.round(msg.simple_db.wal_fsync_lag_seconds * 1000) : null;
        const errors = typeof msg.recent_errors === 'object' ? (msg.recent_errors.last_60s ?? msg.recent_errors.total ?? 0) : null;
        const memtables = msg.simple_db?.memtables ?? msg.simple_db?.memtable_count;
        const sst = msg.simple_db?.sst_count ?? msg.simple_db?.sstables;
        const compQueue = msg.simple_db?.compaction_queue ?? msg.simple_db?.compaction_pending;
        const diskBytes = msg.simple_db?.disk_bytes ?? msg.simple_db?.disk_used_bytes;
        if (memtables !== undefined) memtablePoints.push(memtables);
        if (sst !== undefined) sstPoints.push(sst);
        if (compQueue !== undefined) compPoints.push(compQueue);
        if (diskBytes !== undefined) diskPoints.push(diskBytes);
        if (lagMs !== null || walMs !== null || errors !== null) {
          updateCharts(latencyPoints.at(-1) ?? 0, walMs ?? walPoints.at(-1) ?? 0, errors ?? errorPoints.at(-1) ?? 0);
          if (lagMs !== null) setKpi('nh-feature-lag', `${lagMs}ms`, 'nh-feature-meta', 'feature adapter');
          if (walMs !== null) setKpi('nh-wal-lag', `${walMs}ms`, 'nh-wal-meta', 'simpledb fsync');
          if (errors !== null) setKpi('nh-errors', errors, 'nh-errors-meta', 'errors last 60s');
          if (memtables !== undefined) setKpi('nh-memtables', memtables, 'nh-memtables-meta', 'live memtables');
          if (sst !== undefined) setKpi('nh-sst', sst, 'nh-sst-meta', 'sst files');
          if (diskBytes !== undefined) setKpi('nh-disk', formatBytes(diskBytes), 'nh-disk-meta', 'disk used');
          renderDbTable(msg.simple_db || {});
        }
      }
    });
  }

  function renderDbTable(db) {
    const tbody = document.getElementById('nh-db-table');
    if (!tbody) return;
    if (!db || Object.keys(db).length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center text-gray-500 py-2">No SimpleDb metrics present.</td></tr>';
      return;
    }
    const rows = Object.entries(db).map(([k, v]) => {
      const val = typeof v === 'number' ? v : JSON.stringify(v);
      return `<tr><td class="py-2 pr-3 text-gray-300 text-sm">${k}</td><td class="py-2 text-sm text-gray-100">${val}</td></tr>`;
    }).join('');
    tbody.innerHTML = rows;
  }

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes)) return '—';
    const units = ['B','KB','MB','GB','TB'];
    let v = bytes; let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nh-retry')?.addEventListener('click', loadHealth);
    document.getElementById('nh-gates-retry')?.addEventListener('click', () => { loadGates(); loadNetworkSnapshot(); });
    document.getElementById('nh-metrics-retry')?.addEventListener('click', testMetrics);
    document.getElementById('nh-metrics-refresh')?.addEventListener('click', testMetrics);
    document.getElementById('nh-pause')?.addEventListener('click', () => { paused = true; });
    document.getElementById('nh-resume')?.addEventListener('click', () => { paused = false; });
    document.getElementById('nh-smooth')?.addEventListener('change', (e) => { smooth = e.target.checked; });
    loadNetworkSnapshot();
    loadGates();
    loadHealth();
    testMetrics();
    connectFeature();
    setInterval(loadHealth, 5000);
    setInterval(loadNetworkSnapshot, 8000);
    setInterval(loadGates, 12000);
    setInterval(testMetrics, 15000);
  });
})();

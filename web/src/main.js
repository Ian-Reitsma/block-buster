// First-party, dependency-free SPA with hash routing and lightweight rendering.

const API_BASE = window.BLOCK_BUSTER_API || "http://localhost:5000";
const HEALTH_URL = window.BLOCK_BUSTER_HEALTH || `${API_BASE}/health`;

const state = {
  route: window.location.hash.replace("#", "") || "theblock",
  offline: false,
  _pendingRender: false,
  metrics: {
    tps: 1280,
    fees: 0.15,
    latencyMs: 42,
    peers: 312,
    blockHeight: 982345,
    issuance: 12.3,
  },
  priceHistory: [12, 18, 14, 20, 25, 21, 26, 24, 28, 27],
  orders: [
    { token: "BLOCK", side: "BUY", qty: 120, price: 1.12 },
    { token: "BLOCK", side: "SELL", qty: 80, price: 1.15 },
    { token: "GPU", side: "BUY", qty: 5, price: 220.0 },
  ],
  network: {
    metrics: null,
    markets: null,
    scheduler: null,
    peers: null,
    lastUpdated: null,
    error: null,
  },
  fullcheck: {
    status: "idle",
    running: false,
    steps: [],
    summary_score: null,
    duration_ms: null,
    started_at: null,
    error: null,
  },
  fullcheckInput: {
    domain: "demo.block",
    fileMeta: null,
    hashing: false,
    storageDryRun: false,
  },
};

const $ = (sel) => document.querySelector(sel);

function debounce(fn, delay = 80) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function scheduleRender() {
  if (state._pendingRender) return;
  state._pendingRender = true;
  requestAnimationFrame(() => {
    state._pendingRender = false;
    renderNow();
  });
}

function navLink(id, label) {
  const a = document.createElement("a");
  a.href = `#${id}`;
  a.textContent = label;
  if (state.route === id) a.classList.add("active");
  a.onclick = () => {
    state.route = id;
    scheduleRender();
  };
  return a;
}

function card(title, value, extra) {
  const c = document.createElement("div");
  c.className = "card";
  const h = document.createElement("h3");
  h.textContent = title;
  const v = document.createElement("div");
  v.className = "value";
  v.textContent = value;
  c.append(h, v);
  if (extra) c.append(extra);
  return c;
}

function miniBars(values) {
  const wrap = document.createElement("div");
  wrap.className = "chart";
  values.forEach((v) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${v + 20}px`;
    wrap.append(bar);
  });
  return wrap;
}

function ordersList() {
  const ul = document.createElement("ul");
  ul.className = "list";
  state.orders.forEach((o) => {
    const li = document.createElement("li");
    li.textContent = `${o.side} ${o.qty} ${o.token} @ ${o.price.toFixed(2)}`;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = o.side;
    li.append(pill);
    ul.append(li);
  });
  return ul;
}

// Helpers -------------------------------------------------------------------

const fmt = {
  num: (v) => (v === undefined || v === null ? "—" : Number(v).toLocaleString()),
  ms: (v) => (v === undefined || v === null ? "—" : `${Math.round(v)} ms`),
  pct: (v) => (v === undefined || v === null ? "—" : `${v.toFixed(1)}%`),
  ts: (ms) => new Date(ms).toLocaleTimeString(),
  size: (bytes) => {
    if (!bytes && bytes !== 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let b = bytes;
    let u = 0;
    while (b >= 1024 && u < units.length - 1) {
      b /= 1024;
      u += 1;
    }
    return `${b.toFixed(1)} ${units[u]}`;
  },
};

function statusChip(status) {
  const chip = document.createElement("span");
  chip.className = `status status-${status}`;
  chip.textContent = status;
  return chip;
}

function stepHighlight(step) {
  const d = step.data || {};
  if (typeof d.verified === "boolean") return d.verified ? "verified" : "unverified";
  if (d.lag_blocks !== undefined) return `lag ${d.lag_blocks} blocks`;
  if (d.peers !== undefined) return `${d.peers} peers`;
  if (d.queue_depth !== undefined) return `${d.queue_depth} queued`;
  if (d.count !== undefined) return `${d.count} receipts`;
  if (d.provider_count !== undefined) return `${d.provider_count} providers`;
  if (d.domain) return d.domain;
  return "";
}

function stepCard(step) {
  const wrap = document.createElement("div");
  wrap.className = "card step-card";
  const top = document.createElement("div");
  top.className = "row step-head";
  const title = document.createElement("div");
  title.textContent = step.label;
  top.append(title, statusChip(step.status));

  const sub = document.createElement("div");
  sub.className = "muted small";
  const highlight = stepHighlight(step);
  sub.textContent = `${highlight ? highlight + " · " : ""}${fmt.ms(step.duration_ms || 0)}`;

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Details";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(step.data || {}, null, 2);
  details.append(summary, pre);

  wrap.append(top, sub, details);
  return wrap;
}

// Rendering -----------------------------------------------------------------

function renderTheBlock() {
  const content = document.createElement("div");
  content.className = "content";

  const hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = `<h2>The Block Network</h2><p>First-party dashboard with zero third-party JS. Live metrics refreshed via native fetch.</p>`;
  content.append(hero);

  const grid = document.createElement("div");
  grid.className = "grid";
  const { tps, fees, latencyMs, peers, blockHeight, issuance } = state.metrics;
  grid.append(
    card("TPS", tps.toLocaleString()),
    card("Fee (BLOCK)", fees.toFixed(3)),
    card("P2P Latency (ms)", latencyMs),
    card("Peers", peers),
    card("Block Height", blockHeight.toLocaleString()),
    card("Issuance / hr", `${issuance.toFixed(2)} BLOCK`),
  );
  content.append(grid);

  const deferred = document.createElement("div");
  requestAnimationFrame(() => {
    const perf = document.createElement("div");
    perf.className = "card";
    perf.innerHTML = `<h3>Throughput (10 blocks)</h3>`;
    perf.append(miniBars(state.priceHistory));
    const book = document.createElement("div");
    book.className = "card";
    book.innerHTML = `<h3>Recent Orders</h3>`;
    book.append(ordersList());
    deferred.append(perf, book);
  });
  content.append(deferred);

  return content;
}

function renderTrading() {
  const content = document.createElement("div");
  content.className = "content";
  const hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = `<h2>Trading Sandbox</h2><p>Paper trades with locally simulated prices. Modify this page in src/main.js.</p>`;
  content.append(hero);

  const controls = document.createElement("div");
  controls.className = "card";
  controls.innerHTML = `
    <h3>Quick Actions</h3>
    <div class="row" style="gap:10px; flex-wrap:wrap;">
      <button class="btn" data-action="buy">Buy 10 BLOCK</button>
      <button class="btn" data-action="sell">Sell 10 BLOCK</button>
      <button class="btn" data-action="reset">Reset Orders</button>
    </div>
  `;
  controls.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "reset") state.orders = [];
      else {
        const side = action === "buy" ? "BUY" : "SELL";
        state.orders.unshift({
          token: "BLOCK",
          side,
          qty: 10,
          price: 1.1 + Math.random() * 0.1,
        });
      }
      renderNow();
    }),
  );
  content.append(controls);

  const orders = document.createElement("div");
  orders.className = "card";
  orders.innerHTML = `<h3>Order Log</h3>`;
  requestAnimationFrame(() => orders.append(ordersList()));
  content.append(orders);

  return content;
}

function renderNetwork() {
  const content = document.createElement("div");
  content.className = "content";

  const hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = `<h2>Network Health + Proof Board</h2><p>Visual, read-only sweep of consensus, markets, scheduler, receipts, and storage. Runs without third-party code.</p>`;
  content.append(hero);

  if (state.network.error) {
    const warn = document.createElement("div");
    warn.className = "offline";
    warn.textContent = `Network refresh failed: ${state.network.error}`;
    content.append(warn);
  }

  const metrics = state.network.metrics || {};
  const metricsGrid = document.createElement("div");
  metricsGrid.className = "grid";
  metricsGrid.append(
    card("Block Height", fmt.num(metrics.block_height ?? metrics.blockHeight ?? null)),
    card("Finalized", fmt.num(metrics.finalized_height ?? metrics.finalizedHeight ?? null)),
    card("TPS", fmt.num(metrics.tps ?? null)),
    card("Peers", fmt.num(metrics.peer_count ?? metrics.connected_peers ?? null)),
    card("Avg Block Time", fmt.ms(metrics.block_time_ms ?? metrics.avg_block_time_ms)),
    card("Network Strength", metrics.network_strength !== undefined ? `${metrics.network_strength}` : "—"),
  );
  content.append(metricsGrid);

  // Proof board --------------------------------------------------------------
  const proof = document.createElement("div");
  proof.className = "card proof";
  const header = document.createElement("div");
  header.className = "row space-between";
  const title = document.createElement("div");
  title.innerHTML = `<h3 style="margin:0;">Full-Chain Proof Board</h3><div class="muted small">Runs the visual equivalent of run-tests-verbose.sh using read-only RPC sweeps.</div>`;
  const score = document.createElement("div");
  score.className = "score";
  const scoreVal = state.fullcheck.summary_score;
  score.innerHTML = `<div class="score-value">${scoreVal === null ? "—" : scoreVal}</div><div class="muted small">score</div>`;
  header.append(title, score);
  proof.append(header);

  const controls = document.createElement("div");
  controls.className = "control-grid";

  const domainInput = document.createElement("div");
  domainInput.className = "control";
  domainInput.innerHTML = `<label class="muted small">.block domain (optional)</label>`;
  const domainField = document.createElement("input");
  domainField.type = "text";
  domainField.value = state.fullcheckInput.domain;
  domainField.placeholder = "demo.block";
  domainField.oninput = (e) => {
    state.fullcheckInput.domain = e.target.value;
  };
  domainInput.append(domainField);

  const fileInputWrap = document.createElement("div");
  fileInputWrap.className = "control";
  fileInputWrap.innerHTML = `<label class="muted small">Storage sample file (optional)</label>`;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.onchange = (e) => handleFileSelect(e.target.files && e.target.files[0]);
  fileInputWrap.append(fileInput);
  if (state.fullcheckInput.fileMeta) {
    const fm = state.fullcheckInput.fileMeta;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${fm.name} · ${fmt.size(fm.size_bytes)} · ${fm.sha256.slice(0, 10)}…`;
    fileInputWrap.append(meta);
  } else if (state.fullcheckInput.hashing) {
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = "Hashing file…";
    fileInputWrap.append(meta);
  }

  const dryRunControl = document.createElement("div");
  dryRunControl.className = "control";
  dryRunControl.innerHTML = `<label class="muted small">Storage put dry-run</label>`;
  const dryRunToggle = document.createElement("input");
  dryRunToggle.type = "checkbox";
  dryRunToggle.checked = state.fullcheckInput.storageDryRun;
  dryRunToggle.onchange = (e) => {
    state.fullcheckInput.storageDryRun = e.target.checked;
  };
  dryRunControl.append(dryRunToggle, document.createTextNode(" Use storage.put (dry-run, no persistence)"));

  const runBtn = document.createElement("button");
  runBtn.className = "btn primary";
  runBtn.textContent = state.fullcheck.running ? "Running…" : "Run visual suite";
  runBtn.disabled = state.fullcheck.running || state.fullcheckInput.hashing || state.offline;
  runBtn.onclick = runFullCheck;

  controls.append(domainInput, fileInputWrap, dryRunControl, runBtn);
  proof.append(controls);

  if (state.fullcheck.error) {
    const err = document.createElement("div");
    err.className = "offline";
    err.textContent = `Full check failed: ${state.fullcheck.error}`;
    proof.append(err);
  }

  const stepsGrid = document.createElement("div");
  stepsGrid.className = "grid steps-grid";
  const steps = state.fullcheck.steps || [];
  if (state.fullcheck.running) {
    const loading = document.createElement("div");
    loading.className = "muted";
    loading.textContent = "Running full-chain sweep…";
    proof.append(loading);
  }
  if (steps.length === 0 && !state.fullcheck.running) {
    const placeholder = document.createElement("div");
    placeholder.className = "muted small";
    placeholder.textContent = "No run yet. Configure options and hit “Run visual suite”.";
    proof.append(placeholder);
  } else {
    steps.forEach((s) => stepsGrid.append(stepCard(s)));
    proof.append(stepsGrid);
  }

  if (steps.length > 0) {
    const raw = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Raw response";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(
      {
        summary_score: state.fullcheck.summary_score,
        duration_ms: state.fullcheck.duration_ms,
        steps,
      },
      null,
      2,
    );
    raw.append(summary, pre);
    proof.append(raw);
  }

  content.append(proof);

  // Network artefacts
  const artifacts = document.createElement("div");
  artifacts.className = "card";
  artifacts.innerHTML = `<h3>Live inputs</h3><div class="muted small">Auto-refreshed every 2s from /theblock/* endpoints.</div>`;
  const mini = document.createElement("div");
  mini.className = "grid";
  mini.append(
    card("Markets healthy", state.network.markets ? `${state.network.markets.healthy_markets}/${state.network.markets.total_markets}` : "—"),
    card("Scheduler queue", state.network.scheduler ? fmt.num(state.network.scheduler.queue_depth) : "—"),
    card("Peers listed", state.network.peers ? fmt.num(state.network.peers.total) : "—"),
  );
  artifacts.append(mini);
  if (state.network.lastUpdated) {
    const stamp = document.createElement("div");
    stamp.className = "muted small";
    stamp.textContent = `Last updated ${fmt.ts(state.network.lastUpdated)}`;
    artifacts.append(stamp);
  }
  content.append(artifacts);

  return content;
}

function offlineBanner() {
  if (!state.offline) return null;
  const banner = document.createElement("div");
  banner.className = "offline";
  banner.textContent = "Offline: retrying backend heartbeat...";
  return banner;
}

function renderNow() {
  const app = $("#app");
  app.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const side = document.createElement("aside");
  side.className = "sidebar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.textContent = "Block Buster · First-Party";
  const nav = document.createElement("div");
  nav.className = "nav";
  nav.append(
    navLink("theblock", "The Block"),
    navLink("network", "Network"),
    navLink("trading", "Trading"),
  );
  side.append(brand, nav);

  const main = document.createElement("main");
  main.className = "main";
  const banner = offlineBanner();
  if (banner) main.append(banner);

  const page = state.route === "network" ? renderNetwork() : state.route === "trading" ? renderTrading() : renderTheBlock();
  main.append(page);

  shell.append(side, main);
  app.append(shell);
}

// Data fetching -------------------------------------------------------------

async function api(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = data && data.detail ? data.detail : resp.statusText;
    throw new Error(detail);
  }
  return data;
}

async function refreshNetwork() {
  try {
    const metrics = await api("/theblock/network/metrics");
    const markets = await api("/theblock/markets/health").catch(() => null);
    const scheduler = await api("/theblock/scheduler/stats").catch(() => null);
    const peers = await api("/theblock/peers/list").catch(() => null);

    state.network.metrics = metrics;
    state.network.markets = markets;
    state.network.scheduler = scheduler;
    state.network.peers = peers;
    state.network.lastUpdated = Date.now();
    state.network.error = null;
  } catch (err) {
    state.network.error = err.message;
  }
  scheduleRender();
}

async function runFullCheck() {
  if (state.fullcheck.running) return;
  state.fullcheck.running = true;
  state.fullcheck.status = "running";
  state.fullcheck.error = null;
  scheduleRender();
  try {
    const payload = {
      storage_duration_epochs: 8,
    };
    if (state.fullcheckInput.domain && state.fullcheckInput.domain.trim()) {
      payload.domain = state.fullcheckInput.domain.trim();
    }
    if (state.fullcheckInput.fileMeta) {
      payload.file = state.fullcheckInput.fileMeta;
    }
    if (state.fullcheckInput.storageDryRun) {
      payload.storage_dry_run = true;
    }
    const data = await api("/theblock/fullcheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.fullcheck = {
      ...data,
      status: "done",
      running: false,
      error: null,
    };
  } catch (err) {
    state.fullcheck.running = false;
    state.fullcheck.status = "error";
    state.fullcheck.error = err.message;
  }
  scheduleRender();
}

async function handleFileSelect(file) {
  if (!file) {
    state.fullcheckInput.fileMeta = null;
    scheduleRender();
    return;
  }
  state.fullcheckInput.hashing = true;
  scheduleRender();
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const hashHex = hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
    state.fullcheckInput.fileMeta = {
      name: file.name,
      size_bytes: file.size,
      sha256: hashHex,
      preview_only: true,
    };
  } catch (err) {
    state.fullcheck.error = `File hash failed: ${err.message}`;
  } finally {
    state.fullcheckInput.hashing = false;
    scheduleRender();
  }
}

async function pingBackend() {
  try {
    const resp = await fetch(HEALTH_URL, { method: "GET", cache: "no-store" });
    state.offline = !resp.ok;
  } catch (e) {
    state.offline = true;
  }
  scheduleRender();
}

// Event wiring --------------------------------------------------------------

const onHashChange = debounce(() => {
  state.route = window.location.hash.replace("#", "") || "theblock";
  scheduleRender();
});

window.addEventListener("hashchange", onHashChange);

// Initial render + polling
scheduleRender();
refreshNetwork();
setInterval(refreshNetwork, 2000);
setInterval(pingBackend, 10000);
pingBackend();

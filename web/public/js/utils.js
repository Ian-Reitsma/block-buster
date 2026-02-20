const utilsRoot = typeof window !== 'undefined' ? window : globalThis;

(function () {
    if (typeof localStorage === 'undefined') return;
    const theme = localStorage.getItem('setting_theme') || 'seeker';
    setTheme(theme);
})();

const drawerEntries = new Map();

function setTheme(theme) {
    const html = document.documentElement;
    html.classList.remove('theme-seeker', 'theme-dark', 'theme-light');
    html.classList.add(`theme-${theme}`);
    const disable = localStorage.getItem('setting_disableAnimation') === 'true';
    if (theme === 'seeker' && !disable) {
        html.classList.remove('no-anim');
    } else {
        html.classList.add('no-anim');
    }
    localStorage.setItem('setting_theme', theme);
}

utilsRoot.setTheme = setTheme;

// --- Connection helpers ----------------------------------------------------
function validateApiBase(value) {
    if (!value) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function resolveApiConfig() {
    const { protocol, hostname, port } = typeof window !== 'undefined' ? window.location : { protocol: 'http:', hostname: 'localhost', port: '5000' };
    const injected = typeof window !== 'undefined' ? (window.BLOCK_BUSTER_API || null) : null;
    const injectedWs = typeof window !== 'undefined' ? (window.BLOCK_BUSTER_WS || null) : null;
    const storedBase = typeof localStorage !== 'undefined' ? localStorage.getItem('block_buster_api_base') : null;
    const devHost = `${protocol}//${hostname || 'localhost'}:${port || '5000'}`;
    const isStaticPort = port === '5173' || port === '4173' || port === '8000';
    const ignoreStored = storedBase && storedBase === devHost && isStaticPort;
    const fallback =
        port === '5173' || port === '4173'
            ? `${protocol}//${hostname || 'localhost'}:5000`
            : port === '8000'
                ? `${protocol}//${hostname || 'localhost'}:5000`
                : devHost;
    const safeFallback = validateApiBase(fallback) ? fallback : 'http://localhost:5000';
    const candidateBase = ignoreStored ? null : storedBase;
    const apiBase = validateApiBase(injected || candidateBase) ? (injected || candidateBase) : safeFallback;
    const apiKey = typeof localStorage !== 'undefined' ? localStorage.getItem('block_buster_api_key') || utilsRoot.BLOCK_BUSTER_API_KEY || '' : '';
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('block_buster_api_base', apiBase);
        localStorage.setItem('block_buster_api_key', apiKey);
    }
    utilsRoot.API_BASE = apiBase;
    utilsRoot.API_KEY = apiKey;
    return { apiBase, apiKey };
}

function currentApiBase() {
    return utilsRoot.API_BASE || resolveApiConfig().apiBase;
}

function buildApiClient() {
    const base = () => currentApiBase();
    const headers = () => (utilsRoot.API_KEY ? { 'X-API-Key': utilsRoot.API_KEY } : {});
    return {
        getWebSocketURL: (path) => {
            if (injectedWs && validateApiBase(injectedWs.replace(/^ws/i, 'http'))) {
                return injectedWs + path;
            }
            return base().replace(/^http/i, 'ws') + path;
        },
        runBacktest: async (params) => {
            const res = await fetch(`${base()}/backtest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers() },
                body: JSON.stringify(params),
            });
            if (!res.ok) throw new Error('backtest failed');
            return res.json();
        },
    };
}

if (!utilsRoot.apiClient) {
    utilsRoot.apiClient = buildApiClient();
}

function setApiConfig({ apiBase, apiKey }) {
    if (typeof localStorage !== 'undefined') {
        if (apiBase) localStorage.setItem('block_buster_api_base', apiBase);
        if (apiKey !== undefined) localStorage.setItem('block_buster_api_key', apiKey);
    }
    if (apiBase) utilsRoot.API_BASE = apiBase;
    if (apiKey !== undefined) utilsRoot.API_KEY = apiKey;
}

// --- UX helpers ------------------------------------------------------------
function ensureToastContainer() {
    let node = document.getElementById('toastContainer');
    if (!node) {
        node = document.createElement('div');
        node.id = 'toastContainer';
        node.style.position = 'fixed';
        node.style.top = '16px';
        node.style.right = '16px';
        node.style.display = 'flex';
        node.style.flexDirection = 'column';
        node.style.gap = '8px';
        node.style.zIndex = '999';
        document.body.appendChild(node);
    }
    return node;
}

const toastDedupe = new Map();

function pushToast(message, tone = 'info', opts = {}) {
    if (typeof document === 'undefined') return;
    const key = opts.key || `${tone}:${message}`;
    const now = Date.now();
    const ttl = opts.ttl || 3500;
    // dedupe short bursts of identical toasts
    if (toastDedupe.has(key) && now - toastDedupe.get(key) < ttl) return;
    toastDedupe.set(key, now);

    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    if (opts.context) {
        const ctx = document.createElement('div');
        ctx.className = 'toast-context';
        ctx.textContent = opts.context;
        toast.appendChild(ctx);
    }
    container.appendChild(toast);
    setTimeout(() => toast.remove(), ttl);
    setTimeout(() => toastDedupe.delete(key), ttl * 2);
}

// Shared error drawer logger (keeps last 3 entries per page)
function createErrorLogger({ drawerId = 'error-drawer', listId = 'error-list', clearId = 'error-clear', retryId, onRetry } = {}) {
    const key = drawerId;
    drawerEntries.set(key, []);
    const drawer = () => document.getElementById(drawerId);
    const list = () => document.getElementById(listId);
    const render = () => {
        const entries = drawerEntries.get(key) || [];
        const node = list();
        const wrap = drawer();
        if (!node || !wrap) return;
        node.innerHTML = entries
            .map(e => `<li>${new Date(e.ts).toLocaleTimeString()} · ${e.endpoint} · ${e.status}</li>`)
            .join('');
        wrap.classList.toggle('hidden', entries.length === 0);
    };
    if (clearId) {
        const clearBtn = document.getElementById(clearId);
        clearBtn?.addEventListener('click', () => {
            drawerEntries.set(key, []);
            render();
        });
    }
    if (retryId && onRetry) {
        const r = document.getElementById(retryId);
        r?.addEventListener('click', onRetry);
    }
    return (endpoint, status) => {
        const entries = drawerEntries.get(key) || [];
        entries.unshift({ endpoint, status, ts: Date.now() });
        drawerEntries.set(key, entries.slice(0, 3));
        render();
        pushToast(`${endpoint} failed (${status})`, 'warn', { context: endpoint });
    };
}

// Common provenance chip setter
function setProvenanceChip(id, endpoint, latency) {
    const el = document.getElementById(id);
    if (!el) return;
    const latencyLabel = typeof latency === 'number' ? `${latency} ms` : '—';
    el.textContent = `${endpoint} • ${latencyLabel}`;
}

function markLagged(selector, on) {
    document.querySelectorAll(selector).forEach(el => el.classList.toggle('is-lagged', !!on));
}

// Wrap fetch with timing + provenance for UI chips
async function fetchWithTiming(url, options = {}) {
    const started = performance.now();
    const res = await fetch(url, options);
    const latencyMs = Math.round(performance.now() - started);
    return { res, latencyMs };
}

// Lightweight observability hook (no-op unless enabled)
function emitClientFlip(event, detail) {
    try {
        const enabled = localStorage.getItem('block_buster_observe') === 'true';
        if (!enabled || !utilsRoot.API_BASE) return;
        // fire-and-forget GET to metrics wrapper; server ignores unknown params safely
        const url = `${utilsRoot.API_BASE}/metrics?client_log=${encodeURIComponent(event)}&detail=${encodeURIComponent(detail || '')}`;
        fetch(url, { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => {});
    } catch {}
}

// Subtle entrance animations for panels
function applyReveals(selector = '.panel-blade, .receipt-card, .accordion-card') {
    if (typeof document === 'undefined') return;
    const items = Array.from(document.querySelectorAll(selector));
    items.forEach((el, idx) => {
        el.classList.add('reveal');
        const delay = Math.min(idx * 40, 320);
        el.style.animationDelay = `${delay}ms`;
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyReveals());
    } else {
        applyReveals();
    }
}

function formatPercent(value) {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function formatBlock(amount) {
    const sign = amount < 0 ? '-' : '';
    return `${sign}${Math.abs(amount).toFixed(2)} BLOCK`;
}

function formatBlockChange(amount) {
    const sign = amount >= 0 ? '+' : '-';
    return `${sign}${Math.abs(amount).toFixed(2)} BLOCK`;
}

/**
 * Gate Routing Policy (Centralized)
 * Enforces consistent gate checking across all pages
 * 
 * @param {Object} options
 * @param {string} options.page - Current page name (e.g., 'dashboard', 'network', 'trading')
 * @param {boolean} options.allowOverrideParams - Allow ?force=1 or ?nogate=1 to bypass
 * @param {Function} options.onGated - Callback when gates are closed (optional)
 * @param {Function} options.onOpen - Callback when gates are open (optional)
 * @returns {Promise<Object>} { gated: boolean, gates: Array, reason: string }
 */
async function enforceGatePolicy({ page, allowOverrideParams = true, onGated, onOpen } = {}) {
    try {
        // Check override params
        if (allowOverrideParams && typeof URLSearchParams !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('force') === '1' || params.get('nogate') === '1') {
                console.log(`[GatePolicy] Override detected for ${page}, bypassing gate check`);
                return { gated: false, gates: [], reason: 'override' };
            }
        }
        
        // Fetch gate status
        const apiBase = currentApiBase();
        const res = await fetch(`${apiBase}/theblock/gates`, { cache: 'no-store' });
        
        if (!res.ok) {
            console.warn(`[GatePolicy] Gate endpoint returned ${res.status}`);
            // Fail open: if we can't check gates, allow access but log warning
            return { gated: false, gates: [], reason: 'endpoint_error' };
        }
        
        const gates = await res.json();
        
        if (!Array.isArray(gates)) {
            console.warn('[GatePolicy] Gate response is not an array:', gates);
            return { gated: false, gates: [], reason: 'invalid_response' };
        }
        
        // Determine if any gates are NOT in TRADE mode
        const closedGates = gates.filter(g => (g.state || '').toLowerCase() !== 'trade');
        const isGated = closedGates.length > 0;
        
        const result = {
            gated: isGated,
            gates: gates,
            closedGates: closedGates,
            openGates: gates.filter(g => (g.state || '').toLowerCase() === 'trade'),
            reason: isGated ? `${closedGates.length}/${gates.length} markets gated` : 'all_open'
        };
        
        // Execute callbacks
        if (isGated && onGated) {
            onGated(result);
        } else if (!isGated && onOpen) {
            onOpen(result);
        }
        
        return result;
    } catch (error) {
        console.error('[GatePolicy] Error checking gates:', error);
        // Fail open on error
        return { gated: false, gates: [], reason: 'exception', error };
    }
}

/**
 * Show Gate Banner (non-blocking notification)
 * Displays a persistent banner instead of redirecting
 * 
 * @param {Object} gateStatus - Result from enforceGatePolicy
 * @param {string} containerId - ID of container to append banner to (default: 'main-content')
 */
function showGateBanner(gateStatus, containerId = 'main-content') {
    if (!gateStatus.gated) return;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Check if banner already exists
    if (document.getElementById('gate-policy-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'gate-policy-banner';
    banner.className = 'panel panel--glass p-4 mb-4 border-warn/30';
    banner.innerHTML = `
        <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-warn flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            <div class="flex-1">
                <p class="text-sm font-semibold text-white">Markets Gated: Trading Disabled</p>
                <p class="text-xs text-gray-400 mt-1">${gateStatus.reason}. <a href="network.html" class="text-warn underline hover:text-amber-300">View Network Health</a> for details.</p>
                <div class="flex gap-2 mt-2">
                    ${gateStatus.closedGates.slice(0, 3).map(g => 
                        `<span class="badge">${g.market || 'unknown'}: ${g.state || 'closed'}</span>`
                    ).join('')}
                    ${gateStatus.closedGates.length > 3 ? `<span class="badge">+${gateStatus.closedGates.length - 3} more</span>` : ''}
                </div>
            </div>
            <button id="gate-banner-dismiss" class="text-gray-400 hover:text-white" aria-label="Dismiss banner">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>
        </div>
    `;
    
    container.prepend(banner);
    
    // Dismiss handler
    const dismissBtn = document.getElementById('gate-banner-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            banner.remove();
            sessionStorage.setItem('gateBannerDismissed', 'true');
        });
    }
}

/**
 * Redirect to Network Health (for critical pages only)
 * Use this ONLY for pages that are truly unsafe when gated
 * 
 * @param {Object} gateStatus - Result from enforceGatePolicy
 * @param {string} fromPage - Current page name for tracking
 */
function redirectToNetworkHealth(gateStatus, fromPage) {
    if (!gateStatus.gated) return;
    
    console.log(`[GatePolicy] Redirecting from ${fromPage} to network.html due to gating`);
    window.location.replace(`network.html?gated=1&from=${encodeURIComponent(fromPage)}`);
}

// Export helpers
utilsRoot.enforceGatePolicy = enforceGatePolicy;
utilsRoot.showGateBanner = showGateBanner;
utilsRoot.redirectToNetworkHealth = redirectToNetworkHealth;
utilsRoot.formatPercent = formatPercent;
utilsRoot.formatBlock = formatBlock;
utilsRoot.formatBlockChange = formatBlockChange;
utilsRoot.validateApiBase = validateApiBase;
utilsRoot.resolveApiConfig = resolveApiConfig;
utilsRoot.currentApiBase = currentApiBase;
utilsRoot.setApiConfig = setApiConfig;
utilsRoot.pushToast = pushToast;
utilsRoot.buildApiClient = buildApiClient;
utilsRoot.fetchWithTiming = fetchWithTiming;
utilsRoot.emitClientFlip = emitClientFlip;
utilsRoot.createErrorLogger = createErrorLogger;
utilsRoot.setProvenanceChip = setProvenanceChip;
utilsRoot.markLagged = markLagged;

// Feature snapshot WebSocket helper (in-house WS, no polling)
function connectFeatureStream(path = '/features/stream', { onData, onError, onOpen } = {}) {
    try {
        const api = new URL(currentApiBase());
        const proto = api.protocol === 'https:' ? 'wss:' : 'ws:';
        const basePort = Number(api.port || (api.protocol === 'https:' ? 443 : 80));
        // Feature WS runs on ws_port+1; default mapping: HTTP 5000 -> WS 5002
        const featurePort = basePort ? basePort + 2 : basePort;
        const wsUrl = `${proto}//${api.hostname}${featurePort ? ':' + featurePort : ''}${path}`;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => { onOpen && onOpen(); };
        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                onData && onData(msg);
            } catch (err) {
                onError && onError(err);
            }
        };
        ws.onerror = (err) => onError && onError(err);
        return ws;
    } catch (err) {
        onError && onError(err);
        return null;
    }
}
utilsRoot.connectFeatureStream = connectFeatureStream;

if (typeof module !== 'undefined') {
    module.exports = { formatPercent, formatBlock, formatBlockChange, validateApiBase, resolveApiConfig, currentApiBase, setApiConfig, pushToast, buildApiClient, fetchWithTiming, emitClientFlip, createErrorLogger, setProvenanceChip, markLagged, connectFeatureStream };
}

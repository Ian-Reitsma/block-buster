const { apiBase, apiKey: initialKey } = resolveApiConfig();
let API_BASE = apiBase;
let apiKey = initialKey;

const fields = {
    theme: document.getElementById('theme'),
    timeZone: document.getElementById('timeZone'),
    tradingMode: document.getElementById('tradingMode'),
    startingCapital: document.getElementById('startingCapital'),
    rpcEndpoint: document.getElementById('rpcEndpoint'),
    apiKey: document.getElementById('apiKey'),
    advancedToggle: document.getElementById('advancedToggle'),
    forceTour: document.getElementById('forceTour'),
    enableSniper: document.getElementById('enableSniper'),
    enableArbitrage: document.getElementById('enableArbitrage'),
    enableMarketMaking: document.getElementById('enableMarketMaking'),
    disableAnimation: document.getElementById('disableAnimation'),
    primaryAsset: document.getElementById('primaryAsset'),
    metricsCard: document.getElementById('metrics-card'),
    metricsChip: document.getElementById('metrics-chip'),
    metricsStamp: document.getElementById('metrics-stamp'),
    cacheCard: document.getElementById('cache-card'),
    cacheChip: document.getElementById('cache-chip'),
    cacheStamp: document.getElementById('cache-stamp'),
    cacheRefresh: document.getElementById('cache-refresh'),
    walletAddress: document.getElementById('wallet-address'),
    walletBalance: document.getElementById('wallet-balance'),
    walletImport: document.getElementById('wallet-import'),
    walletImportCount: document.getElementById('walletImportCount'),
    walletCreate: document.getElementById('wallet-create'),
    walletRefresh: document.getElementById('wallet-refresh'),
    walletImportBtn: document.getElementById('wallet-import-btn'),
    walletCopy: document.getElementById('wallet-copy'),
    walletFund: document.getElementById('wallet-fund'),
    walletReveal: document.getElementById('wallet-reveal'),
    walletSecret: document.getElementById('wallet-secret'),
};

const statusPills = {
    connection: document.getElementById('connection-pill'),
    preferences: document.getElementById('preferences-pill'),
    trading: document.getElementById('trading-pill'),
    settings: document.getElementById('settings-stale'),
    wallet: document.getElementById('wallet-pill'),
};

const state = { assets: [], assetCacheTs: 0 };
const logError = createErrorLogger({ drawerId: 'error-drawer', listId: 'error-list', clearId: 'error-clear', retryId: 'settings-error-retry', onRetry: () => { loadMetrics(); loadAssets(); warmFeatureSchemaCache(); } });

function setStatus(pill, tone, label) {
    if (!pill) return;
    pill.classList.remove('status-good', 'status-warn', 'status-bad', 'status-info');
    pill.classList.add(`status-${tone}`);
    pill.textContent = label;
}

function updateCountDisplay(input, counterId, maxLen) {
    const counter = document.getElementById(counterId);
    if (!input || !counter) return;
    const val = input.value || '';
    counter.textContent = `${val.length}/${maxLen}`;
}

function fillTimeZones() {
    if (!fields.timeZone) return;
    try {
        Intl.supportedValuesOf('timeZone').forEach(tz => {
            const opt = document.createElement('option');
            opt.value = tz;
            opt.textContent = tz;
            fields.timeZone.appendChild(opt);
        });
    } catch {}
}

function updateAdvancedVisibility() {
    const show = fields.advancedToggle.checked;
    document.querySelectorAll('.advanced').forEach(el => el.classList.toggle('hidden', !show));
}

function updateImportCounter() {
    if (!fields.walletImport || !fields.walletImportCount) return;
    const val = fields.walletImport.value || '';
    fields.walletImportCount.textContent = `${val.length}/${fields.walletImport.maxLength || 80}`;
}

function persist(key, value) {
    localStorage.setItem(`setting_${key}`, typeof value === 'boolean' ? String(value) : value);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    fetch(`${API_BASE}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ [key]: value })
    }).then(() => setProvenanceChip('preferences-chip', '/state', 0)).catch(() => {});
}

function stampSettings() {
    const stamp = document.getElementById('settings-updated');
    if (stamp) stamp.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function updateCurrentTime() {
    const tz = fields.timeZone.value || 'UTC';
    const now = new Date().toLocaleTimeString('en-US', { timeZone: tz });
    const el = document.getElementById('currentTime');
    if (el) el.textContent = now;
}

function fillAssets(list) {
    const dl = document.getElementById('assetOptions');
    if (!dl) return;
    dl.innerHTML = '';
    list.forEach(sym => {
        const opt = document.createElement('option');
        opt.value = sym;
        dl.appendChild(opt);
    });
    state.assets = list;
    state.assetCacheTs = Date.now();
    try {
        localStorage.setItem('block_buster_assets_cache', JSON.stringify({ ts: state.assetCacheTs, items: list }));
    } catch {}
}

async function loadAssets() {
    const cached = localStorage.getItem('block_buster_assets_cache');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed.items && Array.isArray(parsed.items)) {
                state.assets = parsed.items;
                state.assetCacheTs = parsed.ts || 0;
                fillAssets(parsed.items);
            }
        } catch {}
    }
    try {
        const res = await fetch(`${API_BASE}/assets`).then(r => r.json());
        if (Array.isArray(res) && res.length) {
            fillAssets(res.map(v => v.toString().toUpperCase()));
            setProvenanceChip('trading-chip', '/assets', 0);
        }
    } catch (e) {
        logError('/assets', e.message || 'error');
        if (!state.assets.length) fillAssets(['BLOCK', 'BONK', 'WIF', 'ORCA', 'JUP']);
    }
}

async function warmFeatureSchemaCache() {
    try {
        const res = await fetch(`${API_BASE}/features/schema`);
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('block_buster_feature_schema', JSON.stringify({ ts: Date.now(), data }));
        }
    } catch {}
}

async function loadWalletStatus() {
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/wallet/status`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setProvenanceChip('wallet-chip', '/wallet/status', latencyMs);
        const addr = data.wallet || '—';
        if (fields.walletAddress) fields.walletAddress.textContent = addr;
        if (fields.walletBalance) fields.walletBalance.textContent = `Balance ${data.balance ?? data.balance_block ?? 0} BLOCK`;
        if (fields.walletSecret) {
            fields.walletSecret.textContent = data.has_secret
                ? 'Private key stored locally (reveal to view).'
                : 'Private key not stored (imported wallet).';
        }
        const funded = !!data.funded;
        setStatus(statusPills.wallet, funded ? 'good' : 'warn', funded ? 'FUNDED' : 'UNFUNDED');
    } catch (e) {
        logError('/wallet/status', e.message || 'error');
        setStatus(statusPills.wallet, 'warn', 'ERROR');
    }
}

async function ensureWallet() {
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/wallet/ensure`, { method: 'POST', cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setProvenanceChip('wallet-chip', '/wallet/ensure', latencyMs);
        await loadWalletStatus();
        pushToast('Local wallet ready', 'success');
    } catch (e) {
        logError('/wallet/ensure', e.message || 'error');
    }
}

async function importWallet(address) {
    try {
        const body = { address: address.trim() };
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/wallet/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setProvenanceChip('wallet-chip', '/wallet/import', latencyMs);
        await loadWalletStatus();
        pushToast('Wallet saved', 'success');
    } catch (e) {
        logError('/wallet/import', e.message || 'error');
    }
}

async function revealWalletSecret() {
    if (!fields.walletSecret) return;
    const ok = window.confirm('Reveal private key? Anyone with this key can control funds.');
    if (!ok) return;
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/wallet/secret`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setProvenanceChip('wallet-chip', '/wallet/secret', latencyMs);
        const data = await res.json();
        fields.walletSecret.textContent = `Private key: ${data.secret_hex}`;
        pushToast('Private key revealed', 'warn');
    } catch (e) {
        logError('/wallet/secret', e.message || 'error');
        pushToast('Unable to reveal private key', 'warn');
    }
}

async function fetchManifest() {
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/manifest`, { cache: 'no-store' });
        if (!res.ok) return;
        const manifest = await res.json();
        const hash = manifest?.schema_hash;
        if (hash) {
            setProvenanceChip('settings-schema', '/manifest', latencyMs);
            localStorage.setItem('block_buster_schema_hash', hash);
            const chip = document.getElementById('settings-schema');
            if (chip) chip.textContent = `schema ${hash.slice(0,8)}`;
        }
    } catch (e) {
        logError('/manifest', e.message || 'error');
    }
}

async function testMetricsScrape() {
    if (!fields.metricsCard) return;
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/metrics`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setProvenanceChip('metrics-chip', '/metrics', latencyMs);
        fields.metricsStamp.textContent = `Scrape OK • ${latencyMs}ms`;
    } catch (e) {
        fields.metricsStamp.textContent = `Scrape failed: ${e.message}`;
        logError('/metrics', e.message || 'error');
    }
}

async function detectCacheHook() {
    if (!fields.cacheCard || !fields.cacheRefresh) return;
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/assets/invalidate`, { method: 'OPTIONS', cache: 'no-store' });
        if (res.ok) {
            fields.cacheCard.classList.remove('hidden');
            fields.cacheRefresh.disabled = false;
            setProvenanceChip('cache-chip', '/assets/invalidate', latencyMs);
            fields.cacheStamp.textContent = 'Hook available';
            return true;
        }
    } catch (_) {}
    fields.cacheCard.classList.add('hidden');
    fields.cacheStamp.textContent = 'Endpoint not present';
    return false;
}

async function refreshCache() {
    if (!fields.cacheRefresh) return;
    fields.cacheRefresh.disabled = true;
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/assets/invalidate`, { method: 'POST', cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setProvenanceChip('cache-chip', '/assets/invalidate', latencyMs);
        fields.cacheStamp.textContent = `Cache refreshed • ${new Date().toLocaleTimeString()}`;
        setStatus(statusPills.settings, 'good', 'FRESH');
    } catch (e) {
        fields.cacheStamp.textContent = `Refresh failed: ${e.message}`;
        logError('/assets/invalidate', e.message || 'error');
    } finally {
        fields.cacheRefresh.disabled = false;
    }
}

function wireWalletControls() {
    updateImportCounter();
    fields.walletCreate?.addEventListener('click', ensureWallet);
    fields.walletRefresh?.addEventListener('click', loadWalletStatus);
    fields.walletImportBtn?.addEventListener('click', () => {
        const addr = fields.walletImport?.value || '';
        if (!addr) { pushToast('Enter a wallet address to import', 'warn'); return; }
        importWallet(addr);
    });
    fields.walletCopy?.addEventListener('click', () => {
        const addr = fields.walletAddress?.textContent || '';
        if (!addr || addr === '—') return;
        navigator.clipboard?.writeText(addr).then(() => pushToast('Wallet copied', 'success')).catch(() => {});
    });
    fields.walletReveal?.addEventListener('click', revealWalletSecret);
    fields.walletFund?.addEventListener('click', () => {
        window.open('docs/operations.html#bootstrap-and-configuration', '_blank');
    });
    fields.walletImport?.addEventListener('input', updateImportCounter);
}

function loadSettings() {
    for (const [key, el] of Object.entries(fields)) {
        const stored = localStorage.getItem(`setting_${key}`);
        if (stored !== null) {
            if (el.type === 'checkbox') {
                el.checked = stored === 'true';
            } else {
                el.value = stored;
            }
        } else if (key === 'timeZone') {
            el.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } else if (key === 'primaryAsset') {
            el.value = 'BLOCK';
        } else if (key === 'theme') {
            el.value = 'seeker';
        } else if (key === 'forceTour') {
            el.checked = localStorage.getItem('block_buster_tour_force') === 'true';
        }
    }
    fields.rpcEndpoint.value = API_BASE;
    fields.apiKey.value = apiKey || '';
    updateAdvancedVisibility();
    updateCurrentTime();
    if (fields.disableAnimation && fields.disableAnimation.checked) {
        document.documentElement.classList.add('no-anim');
    }
    if (fields.theme) setTheme(fields.theme.value);
    updateCountDisplay(fields.rpcEndpoint, 'rpcCount', fields.rpcEndpoint.maxLength || 200);
    updateCountDisplay(fields.apiKey, 'apiKeyCount', fields.apiKey.maxLength || 128);
    updateCountDisplay(fields.primaryAsset, 'assetCount', fields.primaryAsset.maxLength || 12);
    setProvenanceChip('preferences-chip', '/state', 0);
    setProvenanceChip('trading-chip', '/assets', 0);
}

function isAssetValid(asset) {
    if (!asset) return false;
    const list = state.assets.length ? state.assets : Array.from(document.querySelectorAll('#assetOptions option')).map(o => o.value.toUpperCase());
    return list.includes(asset.toUpperCase());
}

function validateForm() {
    const base = fields.rpcEndpoint.value.trim();
    const key = fields.apiKey.value.trim();
    const mode = fields.tradingMode.value;
    const asset = fields.primaryAsset.value.trim();
    const baseValid = validateApiBase(base);
    const assetValid = isAssetValid(asset);
    const keyValid = true;

    const allGood = baseValid && assetValid && keyValid;
    const saveBtn = document.getElementById('saveConnection');
    if (saveBtn) {
        saveBtn.disabled = !allGood;
        saveBtn.classList.toggle('is-stale', !allGood);
    }
    setStatus(statusPills.connection, allGood ? 'good' : 'warn', allGood ? 'READY' : 'FIX FIELDS');
    setStatus(statusPills.trading, assetValid ? 'info' : 'warn', assetValid ? 'PENDING' : 'ASSET?');
    setStatus(statusPills.settings, allGood ? 'good' : 'warn', allGood ? 'FRESH' : 'STALE');
    if (allGood) emitClientFlip('settings_fresh', API_BASE);
    return allGood;
}

function attachFieldHandlers() {
    for (const [key, el] of Object.entries(fields)) {
        if (!el || typeof el.addEventListener !== 'function') continue;
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) continue;
        el.addEventListener('change', () => {
            const value = el.type === 'checkbox' ? el.checked : el.value;
            if (key === 'apiKey') {
                apiKey = value;
            }
            if (key === 'rpcEndpoint') {
                API_BASE = value;
            }
            updateCountDisplay(fields.rpcEndpoint, 'rpcCount', fields.rpcEndpoint.maxLength || 200);
            updateCountDisplay(fields.apiKey, 'apiKeyCount', fields.apiKey.maxLength || 128);
            updateCountDisplay(fields.primaryAsset, 'assetCount', fields.primaryAsset.maxLength || 12);
            persist(key, value);
            if (key === 'advancedToggle') updateAdvancedVisibility();
            if (key === 'forceTour') {
                localStorage.setItem('block_buster_tour_force', el.checked ? 'true' : 'false');
                if (el.checked) localStorage.setItem('block_buster_tour_done', 'false');
                emitClientFlip('tour_force_toggle', el.checked ? 'on' : 'off');
            }
            if (key === 'theme') setTheme(value);
            if (key === 'disableAnimation') document.documentElement.classList.toggle('no-anim', el.checked || fields.theme.value !== 'seeker');
            if (key === 'timeZone') updateCurrentTime();
            validateForm();
        });
        el.addEventListener('input', () => {
            updateCountDisplay(fields.rpcEndpoint, 'rpcCount', fields.rpcEndpoint.maxLength || 200);
            updateCountDisplay(fields.apiKey, 'apiKeyCount', fields.apiKey.maxLength || 128);
            updateCountDisplay(fields.primaryAsset, 'assetCount', fields.primaryAsset.maxLength || 12);
            if (key === 'walletImport') updateImportCounter();
        });
    }
}

async function saveConnection() {
    const valid = validateForm();
    if (!valid) {
        pushToast('Fix connection fields before saving', 'warn');
        return;
    }
    setApiConfig({ apiBase: fields.rpcEndpoint.value.trim(), apiKey: fields.apiKey.value.trim() });
    API_BASE = fields.rpcEndpoint.value.trim();
    apiKey = fields.apiKey.value.trim();
    pushToast('Connection saved', 'success');
    setStatus(statusPills.connection, 'good', 'SAVED');
    stampSettings();
}

async function loadMetrics() {
    try {
        const { res, latencyMs } = await fetchWithTiming(`${API_BASE}/health`);
        if (!res.ok) throw new Error(`health ${res.status}`);
        const h = await res.json();
        if (h && typeof h.rpc_latency_ms !== 'undefined') {
            document.getElementById('metricRpc')?.textContent = `${h.rpc_latency_ms}ms`;
            setProvenanceChip('connection-chip', '/health', latencyMs);
        }
        const lagVal = h.feature_lag_ms ?? h.feature_lag ?? latencyMs;
        document.getElementById('settings-lag').textContent = `lag ${lagVal}ms`;
        document.getElementById('settings-errors').textContent = `errs ${h.recent_errors ?? h.recent_error_count ?? 0}`;
        const lagged = lagVal > 8000;
        markLagged('#connection-card', lagged);
        markLagged('#preferences-card', lagged);
        markLagged('#trading-card', lagged);
    } catch (e) {
        logError('/health', e.message || 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    fillTimeZones();
    loadSettings();
    attachFieldHandlers();
    await loadAssets();
    warmFeatureSchemaCache();
    fetchManifest();
    validateForm();
    loadMetrics();
    testMetricsScrape();
    detectCacheHook().then((available) => {
        if (available && fields.cacheRefresh) {
            fields.cacheRefresh.addEventListener('click', refreshCache);
        }
    });
    wireWalletControls();
    ensureWallet().then(loadWalletStatus);
    setInterval(updateCurrentTime, 1000);
    setInterval(loadMetrics, 5000);
    document.getElementById('saveConnection')?.addEventListener('click', saveConnection);
    document.getElementById('preferences-retry')?.addEventListener('click', validateForm);
    document.getElementById('trading-retry')?.addEventListener('click', () => { loadAssets(); validateForm(); });
    document.getElementById('metrics-retry')?.addEventListener('click', testMetricsScrape);
});

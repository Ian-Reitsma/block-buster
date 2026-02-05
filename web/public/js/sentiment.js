(function () {
  if (typeof document === 'undefined') return;
  const { apiBase } = resolveApiConfig();
  const logError = createErrorLogger({
    drawerId: 'error-drawer',
    listId: 'error-list',
    clearId: 'error-clear',
    retryId: 'sent-error-retry',
    onRetry: () => { loadTrending(); loadInfluencers(); }
  });

  const state = { lastLag: null };

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function updateLag(seconds) {
    state.lastLag = seconds;
    setText('sent-lag', `lag ${seconds != null ? `${Math.round(seconds)}s` : '—'}`);
  }

  function updateErrors(total) {
    setText('sent-errors', `errs ${total ?? '—'}`);
  }

  function stamp(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  async function loadPulse() {
    try {
      const data = await fetch(`${apiBase}/sentiment/pulse`, { cache: 'no-store' }).then(r => r.json());
      setText('sent-fg', data.fear_greed ?? '—');
      setText('sent-volume', data.social_volume ?? '—');
      setText('sent-fomo', data.fomo ?? '—');
      stamp('sent-updated');
    } catch (e) {
      logError('/sentiment/pulse', e.message || 'error');
    }
  }

  async function loadTrending() {
    try {
      const list = await fetch(`${apiBase}/sentiment/trending`, { cache: 'no-store' }).then(r => r.json());
      const ul = document.getElementById('sentTrending');
      if (ul) {
        ul.innerHTML = (list || []).map(item => `<li class="flex items-center justify-between text-gray-200 text-sm">
          <span>${item.symbol || item.topic || '—'}</span>
          <span class="text-gray-400">${item.mentions ?? 0}</span>
        </li>`).join('') || '<li class="text-gray-500 text-sm">No sentiment yet.</li>';
      }
      stamp('sent-trending-stamp');
    } catch (e) {
      logError('/sentiment/trending', e.message || 'error');
    }
  }

  async function loadInfluencers() {
    try {
      const list = await fetch(`${apiBase}/sentiment/influencers`, { cache: 'no-store' }).then(r => r.json());
      const ul = document.getElementById('sentInfluencers');
      if (ul) {
        ul.innerHTML = (list || []).map(item => `<li class="flex items-center justify-between text-gray-200 text-sm">
          <span>@${item.handle || 'anon'}</span>
          <span class="text-gray-400">${item.message || ''}</span>
        </li>`).join('') || '<li class="text-gray-500 text-sm">No influencers yet.</li>';
      }
      stamp('sent-influencers-stamp');
    } catch (e) {
      logError('/sentiment/influencers', e.message || 'error');
    }
  }

  async function loadSchema() {
    try {
      const { res, latencyMs } = await fetchWithTiming(`${apiBase}/manifest`, { cache: 'no-store' });
      if (!res.ok) return;
      const manifest = await res.json();
      if (manifest?.schema_hash) {
        setText('sent-schema', `schema ${manifest.schema_hash.slice(0, 8)}`);
        const chip = document.getElementById('sent-schema-chip');
        if (chip) chip.textContent = `manifest • ${latencyMs}ms`;
      }
    } catch (_) {}
  }

  async function loadHealthMeta() {
    try {
      const data = await fetch(`${apiBase}/health`, { cache: 'no-store' }).then(r => r.json());
      updateLag(data.feature_lag_seconds);
      updateErrors(data.recent_errors?.total);
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPulse();
    loadTrending();
    loadInfluencers();
    loadSchema();
    loadHealthMeta();
    setInterval(loadPulse, 12000);
    setInterval(loadTrending, 15000);
    setInterval(loadInfluencers, 20000);
  });
})();

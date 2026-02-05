(function () {
  if (typeof document === 'undefined') return;

  const shortcutMap = {
    n: 'dashboard.html',
    w: 'whales.html',
    s: 'sentiment.html',
    c: 'settings.html'
  };

  function highlight() {
    if (window.blockShell?.highlightNav) {
      window.blockShell.highlightNav();
      return;
    }
    const path = (window.location.pathname.split('/').pop() || '').replace(/^\//, '') || 'dashboard.html';
    document.querySelectorAll('[data-nav]').forEach(link => {
      const target = (link.dataset.nav || '').replace(/^\//, '');
      if (target === path) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }

  function wireShortcuts() {
    let awaitingGo = false;
    let timeoutId;
    window.addEventListener('keydown', (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (!awaitingGo && e.key.toLowerCase() === 'g') {
        awaitingGo = true;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => awaitingGo = false, 900);
        return;
      }
      if (!awaitingGo) return;
      const key = e.key.toLowerCase();
      if (shortcutMap[key]) {
        e.preventDefault();
        awaitingGo = false;
        clearTimeout(timeoutId);
        window.location.href = shortcutMap[key];
      }
    });
  }

  function init() {
    highlight();
    wireShortcuts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

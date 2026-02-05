(function () {
  if (typeof document === 'undefined') return;
  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <span>© IJR Enterprises Inc.</span>
    <span class="flex items-center gap-2">
      <a href="https://github.com/Ian-Reitsma/the-block" target="_blank" rel="noreferrer">GitHub</a>
      <span aria-hidden="true">•</span>
      <a href="disclaimer.html">Disclaimer</a>
      <span aria-hidden="true">•</span>
      <button class="micro-badge" id="reset-onboarding">Reset Guide</button>
    </span>`;
  document.body.appendChild(footer);
  footer.querySelector('#reset-onboarding')?.addEventListener('click', () => {
    if (window.blockBusterGuide?.resetProgress) window.blockBusterGuide.resetProgress();
    localStorage.removeItem('block_buster_tour_force');
  });
})();

// Try Hub JS — cards + deeplink + accessibility
(() => {
  /* ==================== Config ====================
     Map agent keys to their demo routes
  ================================================== */
  const AGENT_ROUTES = {
    reader: '/try/reader.html',
    trader: '/try/trader.html',
    stream: '/try/stream.html',
    core:   '/try/core.html',
  };

  /* ==================== Deep-link ====================
     Optional redirect: /try.html?agent=reader
     If query param matches a known agent, redirect and stop init.
  ===================================================== */
  const qp = new URLSearchParams(location.search);
  const agent = qp.get('agent');
  if (agent && AGENT_ROUTES[agent]) {
    location.replace(AGENT_ROUTES[agent]);
    return; // halt the rest if we redirected
  }

  /* ==================== Reveal on view ====================
     Observe cards and add .revealed once they enter viewport.
     Fallback: reveal all if IntersectionObserver is unavailable.
  ========================================================== */
  const cards = document.querySelectorAll('.card');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('revealed');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.06 }
    );

    cards.forEach((c) => io.observe(c));
  } else {
    // Fallback without IO
    cards.forEach((c) => c.classList.add('revealed'));
  }

  /* ==================== Keyboard a11y ====================
     Rule: pressing Enter/Space on a .card triggers the first
     .btn.primary (unless focus is on a link/button).
     Ctrl/Cmd + Enter opens in a new tab (if href is present).
  ========================================================= */
  function activatePrimary(card) {
    const primary = card.querySelector('.btn.primary:not(.disabled)');
    if (primary) primary.click();
  }

  cards.forEach((card) => {
    // Ensure card is focusable for keyboard users
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');

    card.addEventListener('keydown', (ev) => {
      const k = ev.key;
      const isEnter = k === 'Enter';
      const isSpace = k === ' ';

      // Only handle if not on native actionable elements
      if ((isEnter || isSpace) && !ev.target.closest('a,button')) {
        ev.preventDefault();
        const primary = card.querySelector('.btn.primary:not(.disabled)');
        if (!primary) return;

        // Ctrl/Cmd + Enter → open in new tab if link-like
        if (isEnter && (ev.ctrlKey || ev.metaKey)) {
          const href = primary.getAttribute('href');
          if (href) window.open(href, '_blank', 'noopener,noreferrer');
          return;
        }

        // Default: trigger primary action
        activatePrimary(card);
      }
    });
  });

  /* ==================== Click tracking ====================
     Log clicks on any .btn inside a .card via `track(...)`.
     (Assumes a global track() is available.)
  ========================================================= */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    const card   = btn.closest('.card');
    const title  = card?.querySelector('h2')?.textContent?.trim() || 'unknown';
    const isPrimary = btn.classList.contains('primary');
    const label  = btn.textContent.trim();

    track('try_card_click', { card: title, primary: isPrimary, label });
  });

  /* ==================== Global shortcut ====================
     Ctrl/Cmd + Enter anywhere → trigger first "ready" card with
     an enabled .btn.primary.
  ========================================================= */
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const readyCard = [...cards].find((c) =>
        c.querySelector('.status.ready') &&
        c.querySelector('.btn.primary:not(.disabled)')
      );

      if (readyCard) {
        ev.preventDefault();
        readyCard.querySelector('.btn.primary').click();
      }
    }
  });
})();

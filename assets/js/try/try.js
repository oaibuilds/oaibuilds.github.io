// Try Hub JS — tarjetas + deeplink + accesibilidad
(() => {
  // -------- Config (mapea agentes a sus demos)
  const AGENT_ROUTES = {
    reader: '/try/reader.html',
    trader: '/try/trader.html',
    stream: '/try/stream.html',
    core:   '/try/core.html',
  };

  // -------- Deep-link opcional: /try.html?agent=reader
  const qp = new URLSearchParams(location.search);
  const agent = qp.get('agent');
  if (agent && AGENT_ROUTES[agent]) {
    location.replace(AGENT_ROUTES[agent]);
    return; // detenemos el resto si redirigimos
  }

  // -------- Revelar tarjetas al entrar en viewport
  const cards = document.querySelectorAll('.card');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
    cards.forEach((c) => io.observe(c));
  } else {
    // fallback sin IO
    cards.forEach((c) => c.classList.add('revealed'));
  }

  // -------- Accesibilidad: habilita activar con teclado la acción primaria
  // Regla: si pulsas Enter/Espacio sobre .card, click al primer .btn.primary
  function activatePrimary(card) {
    const primary = card.querySelector('.btn.primary:not(.disabled)');
    if (primary) primary.click();
  }

  cards.forEach((card) => {
    // Asegura que la tarjeta sea focusable
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');

    card.addEventListener('keydown', (ev) => {
      const k = ev.key;
      const isEnter = k === 'Enter';
      const isSpace = k === ' ';
      // Ctrl/Cmd + Enter abre en nueva pestaña
      if ((isEnter || isSpace) && !ev.target.closest('a,button')) {
        ev.preventDefault();
        const primary = card.querySelector('.btn.primary:not(.disabled)');
        if (!primary) return;

        if (isEnter && (ev.ctrlKey || ev.metaKey)) {
          const href = primary.getAttribute('href');
          if (href) window.open(href, '_blank', 'noopener,noreferrer');
          return;
        }
        activatePrimary(card);
      }
    });
  });

  // -------- Delegación: tracking opcional de clics en CTA
  function track(eventName, data = {}) {
    // Hook opcional para tu analítica (GA, Plausible, etc.)
    // console.log('[track]', eventName, data);
    // Ejemplo Plausible: window.plausible?.(eventName, { props: data });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    const card = btn.closest('.card');
    const title = card?.querySelector('h2')?.textContent?.trim() || 'unknown';
    const isPrimary = btn.classList.contains('primary');
    const label = btn.textContent.trim();

    track('try_card_click', { card: title, primary: isPrimary, label });
  });

  // -------- Mejora UX: Ctrl/Cmd+Enter en todo el documento => abre primera tarjeta lista
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const readyCard = [...cards].find((c) =>
        c.querySelector('.status.ready') && c.querySelector('.btn.primary:not(.disabled)')
      );
      if (readyCard) {
        ev.preventDefault();
        readyCard.querySelector('.btn.primary').click();
      }
    }
  });
})();

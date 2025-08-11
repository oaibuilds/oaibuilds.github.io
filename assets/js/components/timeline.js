// components/timeline.js
import { RevealOnScroll } from '../utils/reveal-on-scroll.js';

export class Timeline {
  constructor(sel) {
    const d = (s) => document.querySelector(s);
    this.list = typeof sel.list === 'string' ? d(sel.list) : sel.list;
    if (!this.list) return;
    this.yearEl = typeof sel.year === 'string' ? d(sel.year) : sel.year;
    this.fill = typeof sel.fill === 'string' ? d(sel.fill) : sel.fill;
    this.chips = [...document.querySelectorAll(sel.chip || '.chip')];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // datos (idénticos a los del HTML actual)
    this.TIMELINE = [
      { id:'t-2022', year:'2022–2024', sortYear:2022, cat:'education',
        title:'DAM (Honours) + Inetum internship',
        detail:'Backend, APIs, microservices; clean architecture, CI & testing habits.',
        badges:['Java','Spring','APIs'] },
      { id:'t-2024', year:'2024', sortYear:2024, cat:'education',
        title:'Started AI Engineering at UPC',
        detail:'Foundations in reasoning, modeling & systems automation.',
        badges:['Python','C++','Algorithms'] },
      { id:'t-2025-hust', year:'2025', sortYear:2025, cat:'award',
        title:'CSC + HUST MSE Scholarship (Wuhan)',
        detail:'AI-enabled robotic design & motion control; AV perception, localization, prediction & planning. Hands-on with humanoid & industrial robots; multimodal generation for recommendation.',
        badges:['Robotics','Autonomy'] },
      { id:'t-2025-oproject', year:'2025', sortYear:2025, cat:'project',
        title:'Launched “The O Project”',
        detail:'Vertical AI agents + orchestration layer. First modules: O-Scanner (docs) and O-Trader (signals/backtests).',
        badges:['Agents','Orchestration'] },
      { id:'t-2026', year:'2026', sortYear:2026, cat:'project',
        title:'Scale agent stack',
        detail:'O-Core (logic) · O-Stream (pipelines) · O-Vault (memory). Tighten eval loops, reliability & latency for production.',
        badges:['Pipelines','RAG','Eval'] }
    ].sort((a,b)=>a.sortYear-b.sortYear);

    this.currentFilter = 'all';
    this._cardsObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && en.intersectionRatio > 0.6) {
          const y = en.target.getAttribute('data-year');
          if (y && this.yearEl) this.yearEl.textContent = y;
        }
      });
    }, { threshold: [0.6] });

    // binders
    this._onClick = this._onClick.bind(this);
    this._onKey = this._onKey.bind(this);
    this._updateProgress = this._updateProgress.bind(this);
    this._deepLink = this._deepLink.bind(this);

    // boot
    this.render();
    this._observeCards();
    this._deepLink();
    this._updateProgress();
    addEventListener('scroll', this._updateProgress, { passive: true });
    addEventListener('resize', this._updateProgress);

    // events
    this.list.addEventListener('click', this._onClick);
    this.list.addEventListener('keydown', this._onKey);
    this.chips.forEach((c) => c.addEventListener('click', () => {
      this.currentFilter = c.dataset.filter;
      this.chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
      this.render();
      this._observeCards();
      this._updateProgress();
    }));
    addEventListener('hashchange', this._deepLink);
  }

  _badgeHTML(arr) { return (arr || []).map((b) => `<span class="badge">${b}</span>`).join(''); }

  render() {
    // limpiar lista
    this.list.innerHTML = '';

    // filtrar por categoría activa
    const data = this.TIMELINE.filter((it) =>
        this.currentFilter === 'all' ? true : it.cat === this.currentFilter
    );

    // agrupar por año
    const groups = data.reduce((acc, it) => {
        (acc[it.sortYear] ||= []).push(it);
        return acc;
    }, {});
    const orderedYears = Object.keys(groups).map(Number).sort((a, b) => a - b);

    // pintar secciones por año
    orderedYears.forEach((y) => {
        const section = document.createElement('li');
        section.className = 'year-section';
        const label = groups[y][0].year;

        // header de año (con atributos accesibles para acordeón en mobile)
        section.innerHTML = `
        <h3 id="year-${y}" class="year-header" role="button" tabindex="0" aria-controls="year-${y}-panel">
            <span class="y">${label}</span><small>Milestones</small>
        </h3>
        <div id="year-${y}-panel" class="year-panel"></div>
        `;

        const panel = section.querySelector('.year-panel');

        // tarjetas del año
        groups[y].forEach((it) => {
        const art = document.createElement('article');
        art.id = it.id;
        art.className = 'card tcard reveal';
        art.setAttribute('tabindex', '0');
        art.setAttribute('aria-expanded', 'false');
        art.setAttribute('data-year', it.year);
        art.setAttribute('data-cat', it.cat);
        art.innerHTML = `
            <div class="meta">
            <time datetime="${it.sortYear}-01-01">${it.year}</time>
            <span class="cat">${it.cat[0].toUpperCase() + it.cat.slice(1)}</span>
            </div>
            <h3>${it.title}</h3>
            <p class="detail">${it.detail}</p>
            <div class="badges" style="justify-content:flex-start">${this._badgeHTML(it.badges)}</div>
            <button class="btn toggle" aria-label="Expand details" title="Expand">＋</button>
            <div class="connector" aria-hidden="true"></div>
            <div data-collapsible></div>
        `;
        panel.appendChild(art);
        });

        this.list.appendChild(section);
    });

    // valor inicial del indicador de año (rail)
    const first = this.list.querySelector('.tcard');
    if (this.yearEl) this.yearEl.textContent = first?.getAttribute('data-year') || '—';

    // ===== Acordeón por año solo en móvil =====
    const isMobile = matchMedia('(max-width:920px)').matches;
    const sections = [...this.list.querySelectorAll('.year-section')];

    // En móvil: solo el último año abierto por defecto; en desktop: todos "abiertos" (no colapsamos nada)
    sections.forEach((sec, i) => {
        sec.setAttribute('aria-expanded', isMobile ? (i === sections.length - 1 ? 'true' : 'false') : 'true');
    });

    if (isMobile) {
        // Toggle por click/tecla en el header del año (delegado a elementos recién creados)
        this.list.querySelectorAll('.year-header').forEach((h) => {
        const onToggle = () => {
            const sec = h.closest('.year-section');
            const open = sec.getAttribute('aria-expanded') === 'true';
            // cerrar todos y abrir solo el tocado
            sections.forEach((s) => s.setAttribute('aria-expanded', 'false'));
            sec.setAttribute('aria-expanded', open ? 'false' : 'true');
        };
        h.addEventListener('click', onToggle);
        h.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
        });
        });
    }

    // re-apply reveal
    new RevealOnScroll('.reveal, .card');

    // observar tarjetas para actualizar el año en la rail al hacer scroll
    this._observeCards();
    }


  

  _observeCards() {
    this.list.querySelectorAll('.tcard').forEach((c) => this._cardsObserver.observe(c));
  }

  _updateProgress() {
    if (!this.fill) return;
    const stream = this.list.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const start = stream.top - (vh * 0.15);
    const end = stream.bottom - (vh * 0.85);
    const total = Math.max(1, end - start);
    const scrolled = Math.min(Math.max(0, (0 - start)), total);
    const pct = Math.min(100, Math.max(0, (scrolled / total) * 100));
    this.fill.style.height = pct + '%';
  }

  _onClick(e) {
    const card = e.target.closest('.tcard');
    const toggle = e.target.closest('.toggle');
    if (card && toggle) {
      const expanded = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', String(!expanded));
      toggle.textContent = expanded ? '＋' : '—';
        if (!this.reduced && window.innerWidth > 920) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
  }

  _onKey(e) {
    const card = e.target.closest('.tcard');
    if (!card) return;
    const cards = [...this.list.querySelectorAll('.tcard')];
    const idx = cards.indexOf(card);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.querySelector('.toggle')?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); const next = cards[idx + 1]; next?.focus({ preventScroll: false }); next?.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); const prev = cards[idx - 1]; prev?.focus({ preventScroll: false }); prev?.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' }); }
  }

  _deepLink() {
    const id = location.hash.slice(1);
    if (!id) return;
    const el = this.list.querySelector('#' + CSS.escape(id));
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' }); }
  }
}

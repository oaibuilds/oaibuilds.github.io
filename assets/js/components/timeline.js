// components/timeline.js
import { RevealOnScroll } from '../utils/reveal-on-scroll.js';

export class Timeline {
  constructor(sel) {
    // ----- Element handles -----
    const d = (s) => document.querySelector(s);
    this.list  = typeof sel.list  === 'string' ? d(sel.list)  : sel.list;
    if (!this.list) return;

    this.yearEl = typeof sel.year === 'string' ? d(sel.year) : sel.year;
    this.fill   = typeof sel.fill === 'string' ? d(sel.fill) : sel.fill;
    this.chips  = [...document.querySelectorAll(sel.chip || '.chip')];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- Data (kept identical to current HTML) -----
    this.TIMELINE = [
    {
      id: 't-2022',
      year: '2022–2024',
      sortYear: 2022,
      cat: 'education',
      title: 'Associate Degree in Software Engineering + Internship at Inetum',
      detail:
        'Completed an <strong>Associate Degree</strong> at <strong>Institut TIC Barcelona (ITIC)</strong> focused on cross-platform software development, software architecture and testing practices.<br><br>' +
        'During my <strong>11-month</strong> internship at <strong>Inetum</strong> (hybrid), I contributed to enterprise applications using ASP.NET Core, Spring Boot and PL/SQL. ' +
        'Gained practical experience in microservices, Agile workflows and collaborative development with cross-functional teams.',
      badges: ['.NET Core', 'Spring Boot', 'Angular', 'Microservices', 'API REST', 'PL/SQL', 'Agile', 'CRM'],
      logos: [
        { src: '/assets/img/logos/itic.png', alt: 'Institut TIC de Barcelona' },
        { src: '/assets/img/logos/inetum.png', alt: 'Inetum' }
      ]
    },

    {
      id: 't-2024',
      year: '2024',
      sortYear: 2024,
      cat: 'education',
      title: 'Started AI Engineering at UPC (FIB)',
      detail:
        'Prepared and passed the Spanish university entrance exam (<strong>selectividad</strong>) independently, ' +
        'achieving a <strong>12.1 / 14</strong> and securing admission to the <strong>Bachelor\'s Degree in Artificial Intelligence</strong> ' +
        'at the <strong>Polytechnic University of Catalonia (UPC · Barcelona School of Informatics, FIB)</strong>.<br><br>' +
        'First year foundations covered reasoning, modeling, and systems automation, as well as programming and computer fundamentals.',
      badges: ['Python', 'C++', 'Algorithms', 'Reasoning', 'Systems Automation', 'Computer Fundamentals'],
      logos: [
        { src: '/assets/img/logos/upc.png', alt: 'Universitat Politècnica de Catalunya (UPC)' }
      ]
    },

    {
      id: 't-2025-hust',
      year: '2025',
      sortYear: 2025,
      cat: 'award',
      title: 'CSC + HUST MSE Scholarship (Wuhan)',
      detail:
        'Awarded a <strong>CSC + HUST MSE Scholarship</strong> to complete a summer program at ' +
        '<strong>Huazhong University of Science and Technology (HUST)</strong> focused on:<br><ul>' +
        '<li>AI-enabled robotic design and motion control</li>' +
        '<li>Robot simulation, programming, and inspection</li>' +
        '<li>Perception, localization, prediction, and path planning for autonomous vehicles</li>' +
        '<li>Control and perception of humanoid and industrial robots</li>' +
        '<li>Multimodal generation for recommendation systems</li>' +
        '</ul><br>The curriculum combined lectures on agents, swarm intelligence, and autonomous systems ' +
        'with hands-on labs and enterprise visits (<strong>Huawei</strong>, <strong>United Imaging Healthcare</strong>), ' +
        'offering direct exposure to real-world AI and robotics applications.',
      badges: [
        'Robotics', 'Autonomy', 'AI Agents', 'Simulation', 'Motion Control',
        'Path Planning', 'Computer Vision', 'Industrial Robots', 'Humanoid Robots',
        'Multimodal AI', 'Swarm Intelligence'
      ],
      logos: [
          { src: '/assets/img/logos/hust.png', alt: 'Huazhong University of Science and Technology (HUST)' }
        ]
      },

      {
        id: 't-2025-oproject',
        year: '2025',
        sortYear: 2025,
        cat: 'project',
        title: 'Launched “The O-Project”',
        detail:
          'Kickoff of a long-term ecosystem of vertical AI agents + orchestration layer (vision in progress). First modules: O-Reader (docs, basic GPT triage) and O-Trader (signals/backtests with initial automation).',
        badges: ['Agents', 'GPT-basic', 'Orchestration']
      },


      {
        id: 't-2026',
        year: '2026',
        sortYear: 2026,
        cat: 'project',
        title: 'Expand core agents',
        detail:
          'Advance development of O-Core (shared logic & orchestration) and O-Stream (content & publishing pipelines). Early multi-agent coordination and verifiable prompt chains begin to take shape.',
        badges: ['Pipelines', 'Orchestration', 'Multi-agent']
      },


    ].sort((a, b) => a.sortYear - b.sortYear);

    // ----- State & observers -----
    this.currentFilter = 'all';

    this._cardsObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting && en.intersectionRatio > 0.6) {
            const y = en.target.getAttribute('data-year');
            if (y && this.yearEl) this.yearEl.textContent = y;
          }
        });
      },
      { threshold: [0.6] }
    );

    // ----- Binders -----
    this._onClick = this._onClick.bind(this);
    this._onKey = this._onKey.bind(this);
    this._updateProgress = this._updateProgress.bind(this);
    this._deepLink = this._deepLink.bind(this);

    // ----- Bootstrap -----
    this.render();
    this._observeCards();
    this._deepLink();
    this._updateProgress();
    addEventListener('scroll', this._updateProgress, { passive: true });
    addEventListener('resize', this._updateProgress);

    // ----- Events -----
    this.list.addEventListener('click', this._onClick);
    this.list.addEventListener('keydown', this._onKey);

    this.chips.forEach((c) =>
      c.addEventListener('click', () => {
        this.currentFilter = c.dataset.filter;
        this.chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
        this.render();
        this._observeCards();
        this._updateProgress();
      })
    );

    addEventListener('hashchange', this._deepLink);
  }

  /* ==================== Render helpers ==================== */
  _badgeHTML(arr) {
    return (arr || []).map((b) => `<span class="badge">${b}</span>`).join('');
  }

  _logosHTML(arr) {
    if (!Array.isArray(arr) || !arr.length) return '';
    return `
      <div class="tl-logos">
        ${arr.map(l => `
          <img src="${l.src}" alt="${l.alt || 'logo'}"
                class="logo-timeline" loading="lazy" decoding="async">
        `).join('')}
      </div>
    `;
    }

  _catLogoHTML(arr) {
      if (!Array.isArray(arr) || !arr.length) return '';
      return arr.map(l => `
        <span class="cat-logo ${l.class || ''}">
          <img src="${l.src}" alt="${l.alt || 'logo'}" loading="lazy" decoding="async">
        </span>
      `).join('');
    }




  /* ==================== Render ==================== */
  render() {
    // Clear list
    this.list.innerHTML = '';

    // Filter by active category
    const data = this.TIMELINE.filter((it) =>
      this.currentFilter === 'all' ? true : it.cat === this.currentFilter
    );

    // Group by year
    const groups = data.reduce((acc, it) => {
      (acc[it.sortYear] ||= []).push(it);
      return acc;
    }, {});

    const orderedYears = Object.keys(groups).map(Number).sort((a, b) => a - b);

    // Paint sections by year
    orderedYears.forEach((y) => {
      const section = document.createElement('li');
      section.className = 'year-section';
      const label = groups[y][0].year;

      // Year header (with a11y attrs for mobile accordion)
      section.innerHTML = `
        <h3 id="year-${y}" class="year-header" role="button" tabindex="0" aria-controls="year-${y}-panel">
          <span class="y">${label}</span><small>Milestones</small>
        </h3>
        <div id="year-${y}-panel" class="year-panel"></div>
      `;

      const panel = section.querySelector('.year-panel');

      // Cards for this year
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
          <div class="meta-left">
            <time datetime="${it.sortYear}-01-01">${it.year}</time>
            <span class="cat">${it.cat[0].toUpperCase() + it.cat.slice(1)}</span>
            ${this._logosHTML(it.logos)}
          </div>
          <button class="btn btn-primary toggle">＋</button>
        </div>
        <h3>${it.title}</h3>
        <p class="detail">${it.detail}</p>
        <div class="badges" style="justify-content:flex-start">${this._badgeHTML(it.badges)}</div>
        <div class="connector" aria-hidden="true"></div>
        <div data-collapsible></div>
      `;


        panel.appendChild(art);
      });

      this.list.appendChild(section);
    });

    // Initial year indicator (rail)
    const first = this.list.querySelector('.tcard');
    if (this.yearEl) this.yearEl.textContent = first?.getAttribute('data-year') || '—';

    // ----- Mobile-only year accordion -----
    const isMobile = matchMedia('(max-width:920px)').matches;
    const sections = [...this.list.querySelectorAll('.year-section')];

    // On mobile: only the last year open by default; on desktop: all "open" (no collapse)
    sections.forEach((sec, i) => {
      sec.setAttribute('aria-expanded', isMobile ? (i === sections.length - 1 ? 'true' : 'false') : 'true');
    });

    if (isMobile) {
      // Toggle by click/key on year header (delegated to newly created elements)
      this.list.querySelectorAll('.year-header').forEach((h) => {
        const onToggle = () => {
          const sec = h.closest('.year-section');
          const open = sec.getAttribute('aria-expanded') === 'true';
          // Close all and open the clicked one
          sections.forEach((s) => s.setAttribute('aria-expanded', 'false'));
          sec.setAttribute('aria-expanded', open ? 'false' : 'true');
        };
        h.addEventListener('click', onToggle);
        h.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
        });
      });
    }

    // Re-apply reveal animation
    new RevealOnScroll('.reveal, .card');

    // Observe cards to update rail year on scroll
    this._observeCards();
  }

  /* ==================== Observers & progress ==================== */
  _observeCards() {
    this.list.querySelectorAll('.tcard').forEach((c) => this._cardsObserver.observe(c));
  }

  _updateProgress() {
    if (!this.fill) return;

    const stream = this.list.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;

    // Compute progress line fill based on list scroll position
    const start = stream.top - (vh * 0.15);
    const end = stream.bottom - (vh * 0.85);
    const total = Math.max(1, end - start);
    const scrolled = Math.min(Math.max(0, (0 - start)), total);
    const pct = Math.min(100, Math.max(0, (scrolled / total) * 100));

    this.fill.style.height = pct + '%';
  }

  /* ==================== Events ==================== */
  _onClick(e) {
    const toggle = e.target.closest('.toggle');
    if (!toggle) return;

    const card = toggle.closest('.tcard');
    if (!card) return;

    const expanded = card.getAttribute('aria-expanded') === 'true';
    const next = !expanded;

    // 1) Lock current height before state change (for smooth animation)
    const startH = card.scrollHeight;
    card.style.maxHeight = startH + 'px';

    // 2) Update state + button a11y
    card.setAttribute('aria-expanded', String(next));
    toggle.textContent = next ? '—' : '＋';
    toggle.title = next ? 'Collapse' : 'Expand';
    toggle.setAttribute('aria-label', next ? 'Collapse details' : 'Expand details');

    // 3) Next frame: measure target and animate
    requestAnimationFrame(() => {
      const endH = card.scrollHeight;
      card.style.transition = 'max-height .35s ease';
      card.style.maxHeight = endH + 'px';
    });

    // 4) Cleanup inline styles after transition
    const onEnd = (ev) => {
      if (ev.propertyName === 'max-height') {
        card.style.transition = '';
        card.style.maxHeight = '';
        card.removeEventListener('transitionend', onEnd);
      }
    };
    card.addEventListener('transitionend', onEnd);
  }

  _onKey(e) {
    const card = e.target.closest('.tcard');
    if (!card) return;

    const cards = [...this.list.querySelectorAll('.tcard')];
    const idx = cards.indexOf(card);

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.querySelector('.toggle')?.click();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cards[idx + 1];
      next?.focus({ preventScroll: false });
      next?.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = cards[idx - 1];
      prev?.focus({ preventScroll: false });
      prev?.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }

  _deepLink() {
    const id = location.hash.slice(1);
    if (!id) return;

    const el = this.list.querySelector('#' + CSS.escape(id));
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }
}

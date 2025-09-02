// components/orb.js — Orb v3.6 (alive: hue, depth, trails, sweep, comet, reactive pulses)
export class Orb {
  constructor(el, options = {}) {
    this.canvas = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.rm = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const defaults = {
      maxDPR: 1.8,
      fpsCap: 60,
      particles: 14,
      ringWidth: 12,
      ringAlpha: 0.85,
      baseScale: 0.44,
      parallax: 14,
      inertia: 0.085,
      ctaSelector: '.btn.primary',
      noiseStrength: 0.035,

      // "Aliveness" toggles
      hueShift: true,        // subtle HSL cycle on arc/glow
      hueSpeed: 0.04,        // hue shift speed
      particleLayers: 3,     // particle depth (1–4 recommended)
      trailStrength: 0.06,   // 0 disables; 0.04–0.08 subtle trails
      lightSweepEvery: 7.5,  // seconds between light sweeps (0 = off)
      cometChance: 0.003,    // per-frame spawn probability (keep low!)
      cometMax: 1,           // max simultaneous comets
      chromaArc: 0.12,       // chromatic aberration on arc (px)
      reactiveScroll: true,  // pulsing via scroll
      reactiveCursor: true,  // pulsing via cursor velocity
      lensDirt: 0.18         // "lens dirt" mix (0–0.3)
    };

    this.OPT = { ...defaults, ...options };

    // ----- State -----
    this.dpr = 1;
    this.t0 = performance.now();
    this.pulseBoost = 0;
    this.running = false;

    this.mx = 0; this.my = 0;
    this.parx = 0; this.pary = 0;
    this.lastFrame = 0;
    this.ioVisible = true;
    this._rng = 1.234;

    // Velocity trackers
    this._vx = 0; this._vy = 0; this._lastMX = 0; this._lastMY = 0;
    this._sv = 0; this.lastScrollY = window.scrollY;

    // Trail FBO + comets
    this._trail = null;
    this._comets = [];

    // Binders
    this._loop = this._loop.bind(this);
    this._toggleLoop = this._toggleLoop.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onScroll = this._onScroll.bind(this);

    // Pre-render noise (once)
    this._noise = this._makeNoise(256); // slightly larger

    this._setup();
  }

  /* ==================== Utils ==================== */
  _clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  _lerp(a, b, t) { return a + (b - a) * t; }

  _hash() {
    this._rng = (this._rng * 16807) % 2147483647;
    return this._rng / 2147483647;
  }

  _hsla(h, s, l, a = 1) {
    // Normalize hue and return hsla string
    return `hsla(${(h % 360 + 360) % 360},${s}%,${l}%,${a})`;
  }

  _sizeCanvas() {
    this.dpr = this._clamp(window.devicePixelRatio || 1, 1, this.OPT.maxDPR);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width * this.dpr));
    const h = Math.max(1, Math.floor(r.height * this.dpr));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Re-create trail FBO
      this._trail = document.createElement('canvas');
      this._trail.width = w;
      this._trail.height = h;
      this._tctx = this._trail.getContext('2d');
      this._tctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  _setup() {
    this._sizeCanvas();

    // Resize observer / fallback
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(this._onResize);
      this.ro.observe(this.canvas);
    } else {
      addEventListener('resize', this._onResize);
    }

    // Mouse / Scroll parallax
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    addEventListener('scroll', this._onScroll, { passive: true });

    // CTA pulse + click
    this.cta = document.querySelector(this.OPT.ctaSelector);
    if (this.cta) {
      this.cta.addEventListener('mouseenter', () => {
        this.pulseBoost = Math.max(this.pulseBoost, 1);
      });
    }
    this.canvas.addEventListener('click', () => {
      this.pulseBoost = Math.max(this.pulseBoost, 1.2);
    });

    // Pause when offscreen/tab hidden
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(([entry]) => {
        this.ioVisible = entry?.isIntersecting ?? true;
        this._toggleLoop();
      }, { threshold: 0.05 });
      this.io.observe(this.canvas);
    }

    document.addEventListener('visibilitychange', this._toggleLoop);

    // First frame + start
    this._draw(performance.now(), 0);
    if (!this.rm) this.start();
  }

  /* ==================== Lifecycle ==================== */
  start() {
    if (this.running || this.rm) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() { this.running = false; }

  destroy() {
    this.stop();
    this.ro?.disconnect?.();
    this.io?.disconnect?.();
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    removeEventListener('scroll', this._onScroll);
    document.removeEventListener('visibilitychange', this._toggleLoop);
  }

  /* ==================== Events ==================== */
  _onResize() { this._sizeCanvas(); }

  _onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;

    // Cursor velocity
    const dt = Math.max(1 / 240, (performance.now() - this.lastFrame) / 1000);
    this._vx = (nx - this._lastMX) / dt;
    this._vy = (ny - this._lastMY) / dt;
    this._lastMX = nx;
    this._lastMY = ny;

    this.mx = nx;
    this.my = ny;

    if (this.OPT.reactiveCursor) {
      const speed = Math.hypot(this._vx, this._vy);
      if (speed > 2.0) {
        this.pulseBoost = Math.min(1.8, this.pulseBoost + speed * 0.02);
      }
    }
  }

  _onMouseLeave() {
    this.mx = 0;
    this.my = 0;
  }

  _onScroll() {
    const dy = window.scrollY - this.lastScrollY;
    this.lastScrollY = window.scrollY;

    // Parallax Y via scroll
    this.my = this._clamp(this.my + dy * -0.0006, -0.6, 0.6);

    // Reactive scroll pulse
    if (this.OPT.reactiveScroll) {
      const av = Math.abs(dy);
      if (av > 4) this.pulseBoost = Math.min(1.5, this.pulseBoost + av * 0.004);
      this._sv = av;
    }
  }

  _toggleLoop() {
    const shouldRun = !this.rm && this.ioVisible && document.visibilityState === 'visible';
    if (shouldRun && !this.running) this.start();
    else if (!shouldRun) this.stop();
  }

  /* ==================== Noise prerender ==================== */
  _makeNoise(size) {
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const c = off.getContext('2d');
    const img = c.createImageData(size, size);

    for (let i = 0; i < img.data.length; i += 4) {
      const v = (200 + Math.random() * 55) | 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 40;
    }

    c.putImageData(img, 0, 0);
    return off;
  }

  /* ==================== Comets ==================== */
  _spawnComet(cx, cy, r, ang, t) {
    if (this._comets.length >= this.OPT.cometMax) return;
    const speed = r * (0.9 + Math.random() * 0.3);

    this._comets.push({
      x: cx + Math.cos(ang) * r,
      y: cy + Math.sin(ang) * r,
      vx: -Math.sin(ang) * speed * 0.002,
      vy:  Math.cos(ang) * speed * 0.002,
      life: 1.0,
      born: t
    });
  }

  _updateComets(dt) {
    const c = this._comets;
    for (let i = c.length - 1; i >= 0; i--) {
      const k = c[i];
      k.x += k.vx * (dt * 60);
      k.y += k.vy * (dt * 60);
      k.life -= 0.02 * (dt * 60);
      if (k.life <= 0) c.splice(i, 1);
    }
  }

  _drawComets(ctx, baseR, brandHue) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const k of this._comets) {
      const a = Math.max(0, Math.min(1, k.life));
      const r = 2 + 3 * (1 - a);
      const grad = ctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, r * 8);

      grad.addColorStop(0, this._hsla(brandHue, 80, 85, 0.8 * a));
      grad.addColorStop(1, this._hsla(brandHue, 70, 60, 0.5 * a));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(k.x, k.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Comet trail
      ctx.globalAlpha = 0.25 * a;
      ctx.beginPath();
      ctx.moveTo(k.x, k.y);
      ctx.lineTo(k.x - k.vx * 18, k.y - k.vy * 18);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = this._hsla(brandHue, 80, 70, 0.6 * a);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* ==================== Render Loop ==================== */
  _loop(now) {
    if (!this.running) return;

    const targetDelta = 1000 / this.OPT.fpsCap;
    const dt = now - this.lastFrame;

    if (dt >= targetDelta) {
      this.lastFrame = now;
      this._draw(now, dt / 1000);
    }

    requestAnimationFrame(this._loop);
  }

  _draw(now, dt) {
    const r = this.canvas.getBoundingClientRect();
    const cw = r.width;
    const ch = r.height;
    const ctx = this.ctx;

    // Trail: mild multiplicative blur-like effect
    if (this.OPT.trailStrength > 0) {
      this._tctx.globalCompositeOperation = 'source-over';
      this._tctx.globalAlpha = 1;
      this._tctx.drawImage(this.canvas, 0, 0, this._trail.width, this._trail.height);

      ctx.clearRect(0, 0, cw, ch);
      ctx.globalAlpha = 1 - this.OPT.trailStrength; // "fade"
      ctx.drawImage(this._trail, 0, 0, cw * this.dpr, ch * this.dpr, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    } else {
      ctx.clearRect(0, 0, cw, ch);
    }

    const t = (now - this.t0) / 1000;
    const base = Math.sin(t * 0.5);
    const wobble = Math.sin(t * 0.9 + 1.3) * 0.35 + Math.sin(t * 1.3 + 0.7) * 0.2;
    const breath = 0.055 * base + 0.02 * wobble;

    const targetX = this.mx * this.OPT.parallax;
    const targetY = this.my * this.OPT.parallax;
    this.parx = this._lerp(this.parx, targetX, this.OPT.inertia);
    this.pary = this._lerp(this.pary, targetY, this.OPT.inertia);

    const minSide = Math.min(cw, ch);
    const baseR = minSide * this.OPT.baseScale * (1 + breath * 0.55 + this.pulseBoost * 0.12);

    // Brand hues (fallbacks) + dynamic hue if enabled
    const brand1 = getComputedStyle(document.documentElement).getPropertyValue('--brand-1').trim() || '#7c3aed';
    const brand2 = getComputedStyle(document.documentElement).getPropertyValue('--brand-2').trim() || '#0d7a8d';
    const hue = this.OPT.hueShift
      ? (220 + Math.sin(t * this.OPT.hueSpeed * 2 * Math.PI) * 35)
      : 220;

    /* ----- Background halos (dynamic hue) ----- */
    const glowAmp = 0.18 + 0.22 * this.pulseBoost + Math.max(0, breath * 0.9);

    const bg1 = ctx.createRadialGradient(
      cw * 0.5 + this.parx, ch * 0.5 + this.pary, 10,
      cw * 0.5,             ch * 0.5,             Math.max(cw, ch) * 0.56
    );
    bg1.addColorStop(0, this._hsla(hue + 15, 80, 60, glowAmp));
    bg1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg1;
    ctx.beginPath(); ctx.arc(cw * 0.5, ch * 0.5, minSide * 0.5, 0, Math.PI * 2); ctx.fill();

    const bg2 = ctx.createRadialGradient(
      cw * 0.5 - this.parx * 0.45, ch * 0.5 - this.pary * 0.45, 18,
      cw * 0.5,                    ch * 0.5,                     Math.max(cw, ch) * 0.88
    );
    bg2.addColorStop(0, this._hsla(hue - 45, 70, 45, 0.11 + 0.05 * Math.max(0, breath)));
    bg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg2;
    ctx.beginPath(); ctx.arc(cw * 0.5, ch * 0.5, minSide * 0.64, 0, Math.PI * 2); ctx.fill();

    /* ----- Main disc ----- */
    const disc = ctx.createRadialGradient(
      cw * 0.5 + this.parx * 0.55, ch * 0.5 + this.pary * 0.55, 8,
      cw * 0.5,                    ch * 0.5,                     baseR * 0.96
    );
    disc.addColorStop(0, '#0f1117');
    disc.addColorStop(1, '#0b0c12');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(cw * 0.5, ch * 0.5, baseR, 0, Math.PI * 2); ctx.fill();

    // Inner ring
    ctx.lineWidth = 10;
    ctx.strokeStyle = `rgba(18,24,38,${this.OPT.ringAlpha})`;
    ctx.beginPath(); ctx.arc(cw * 0.5, ch * 0.5, baseR * 0.68, 0, Math.PI * 2); ctx.stroke();

    /* ----- Brand arc with subtle chromatic aberration ----- */
    const ang = this.rm ? 0 : t * 0.7;
    ctx.save();
    ctx.translate(cw * 0.5, ch * 0.5);
    ctx.rotate(ang + breath * 0.5);

    const grad = ctx.createLinearGradient(-baseR * 0.78, 0, baseR * 0.78, 0);
    grad.addColorStop(0, this.OPT.hueShift ? this._hsla(hue + 10, 85, 63) : brand1);
    grad.addColorStop(1, this.OPT.hueShift ? this._hsla(hue - 40, 70, 55) : brand2);

    // Slight "R channel" offset for chromatic aberration
    if (this.OPT.chromaArc > 0) {
      ctx.save();
      ctx.translate(this.OPT.chromaArc, 0);
      ctx.strokeStyle = this._hsla(hue + 20, 85, 70, 0.35);
      ctx.lineWidth = this.OPT.ringWidth + 2 * this.pulseBoost;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, baseR * 0.7, -Math.PI * 0.28, Math.PI * 0.36);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = grad;
    ctx.lineWidth = this.OPT.ringWidth + 2 * this.pulseBoost;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 0.7, -Math.PI * 0.28, Math.PI * 0.36);
    ctx.stroke();

    // Double stroke
    ctx.globalAlpha = 0.25 + 0.25 * this.pulseBoost;
    ctx.lineWidth = (this.OPT.ringWidth - 6);
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 0.7 + 1.3, -Math.PI * 0.28, Math.PI * 0.36);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    /* ----- Orbital specular highlight ----- */
    ctx.save();
    ctx.translate(cw * 0.5, ch * 0.5);
    ctx.rotate(ang * 0.6);
    const hx = Math.cos(t * 0.9) * baseR * 0.36;
    const hy = Math.sin(t * 0.9) * baseR * 0.36;
    const shine = ctx.createRadialGradient(hx, hy, 0, hx, hy, baseR * 0.56);
    shine.addColorStop(0, `rgba(255,255,255,${0.065 + 0.05 * Math.max(0, breath) + 0.12 * this.pulseBoost})`);
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.beginPath(); ctx.arc(0, 0, baseR * 0.96, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* ----- Light sweep (scanner) ----- */
    if (this.OPT.lightSweepEvery > 0 && !this.rm) {
      const phase = (t % this.OPT.lightSweepEvery) / this.OPT.lightSweepEvery;
      const sweepAng = phase * Math.PI * 2;

      ctx.save();
      ctx.translate(cw * 0.5, ch * 0.5);
      ctx.rotate(sweepAng);

      const grd = ctx.createLinearGradient(-baseR, 0, baseR, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.strokeStyle = grd;
      ctx.lineWidth = baseR * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, baseR * 0.72, -0.08, 0.08);
      ctx.stroke();
      ctx.restore();
    }

    /* ----- Particles with depth ----- */
    if (!this.rm) {
      const layers = Math.max(1, this.OPT.particleLayers | 0);
      const perLayer = Math.ceil(this.OPT.particles / layers);

      for (let L = 0; L < layers; L++) {
        const z = 0.6 + (L / (layers - 1 || 1)) * 0.6; // [0.6..1.2]
        const N = perLayer;

        for (let i = 0; i < N; i++) {
          const a = ang + (i + L * 0.37) * (Math.PI * 2 / N);
          const rr = baseR * (0.58 + 0.18 * Math.sin(t * 0.7 + i + L * 0.43));

          const jx = (Math.sin(t * 1.7 + i * 2.3 + L)) * 1.1 + (this._hash() - 0.5) * 0.3;
          const jy = (Math.cos(t * 1.9 + i * 1.7 + L)) * 1.1 + (this._hash() - 0.5) * 0.3;

          const x = cw * 0.5 + Math.cos(a) * rr + this.parx * 0.12 * z + jx * z;
          const y = ch * 0.5 + Math.sin(a) * rr + this.pary * 0.12 * z + jy * z;

          const size = 1.6 * z;
          const twinkle = (Math.sin(t * 2.2 + i * 1.3 + L * 0.7) > 0.965) ? 0.25 : 0;
          const alpha = 0.06 + 0.05 * Math.sin(t * 0.9 + i + L * 0.5) + twinkle + 0.16 * this.pulseBoost;

          this.ctx.fillStyle = this._hsla(hue + 10, 80, 60, Math.min(0.6, Math.max(0, alpha)));
          this.ctx.beginPath(); this.ctx.arc(x, y, size, 0, Math.PI * 2); this.ctx.fill();
        }
      }
    }

    /* ----- Comets (occasional) ----- */
    if (!this.rm && Math.random() < this.OPT.cometChance) {
      this._spawnComet(cw * 0.5, ch * 0.5, baseR * 0.7, ang + Math.random() * Math.PI * 2, t);
    }
    this._updateComets(dt);
    this._drawComets(ctx, baseR, hue);

    /* ----- Subtle texture + lens dirt ----- */
    if (this.OPT.noiseStrength > 0) {
      const nx = (cw * 0.5 - baseR) + (Math.sin(t * 0.07) * 8 + this.parx * 0.2);
      const ny = (ch * 0.5 - baseR) + (Math.cos(t * 0.06) * 8 + this.pary * 0.2);
      ctx.globalAlpha = this.OPT.noiseStrength * (0.9 + 0.2 * this.pulseBoost);
      ctx.drawImage(this._noise, nx, ny, baseR * 2, baseR * 2);
      ctx.globalAlpha = 1;
    }

    if (this.OPT.lensDirt > 0) {
      ctx.globalAlpha = this.OPT.lensDirt * (0.8 + 0.2 * Math.max(0, breath));
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this._noise, 0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Decay pulse boost
    if (this.pulseBoost > 0) {
      this.pulseBoost = Math.max(0, this.pulseBoost - (0.018 + 0.012 * dt * 60));
    }
  }
}

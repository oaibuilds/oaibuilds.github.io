// /assets/js/try/trader_demo.js
// Dynamic simulation: run a backtest and ANIMATE the equity with requestAnimationFrame.

const $ = (s) => document.querySelector(s);

/* ==================== DOM ==================== */
const btnRun   = $('#run') || $('#runbacktest') || document.querySelector('button[data-action="runbacktest"]');
const btnReset = $('#reset') || document.querySelector('button[data-action="reset"]');
const elStats  = $('#stats');
const canvas   = $('#equityCanvas');
const ctx      = canvas?.getContext?.('2d');

console.info('🚀 trader_demo.js (dynamic)');

/* ==================== Utils ==================== */
const money = (x) => Number(x ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct   = (x) => (isFinite(x) ? Number(x).toFixed(2) : '∞') + '%';

/** Ensure canvas pixel size follows CSS size and DPR. */
function ensureCanvasSize() {
  if (!canvas || !ctx) return { W: 0, H: 0 };
  if (!canvas.style.width) canvas.style.width = '100%';
  const DPR = window.devicePixelRatio || 1;
  const W = Math.max(1, canvas.clientWidth || canvas.width || 600) * DPR;
  const H = Math.max(1, (canvas.clientHeight || 280)) * DPR;
  canvas.width = W;
  canvas.height = H;
  return { W, H, DPR };
}

/** Draw an equity slice of `count` samples (with optional fixed scale). */
function drawEquitySlice(series, count, scale) {
  if (!canvas || !ctx) return;
  const { W, H } = ensureCanvasSize();

  ctx.clearRect(0, 0, W, H);
  if (!series?.length || count < 2) return;

  const n   = Math.min(series.length, Math.max(2, count));
  const min = scale?.min ?? Math.min(...series);
  const max = scale?.max ?? Math.max(...series);

  const L = 32, R = 10, T = 14, B = 22;
  const x = (i) => L + (i / (n - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);

  // grid
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 0; g < 5; g++) {
    const yy = T + (g / 4) * (H - T - B);
    ctx.moveTo(L, yy);
    ctx.lineTo(W - R, yy);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.globalAlpha = 1;

  // line
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x(0), y(series[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(series[i]));
  ctx.strokeStyle = '#7dd3fc';
  ctx.stroke();

  // area
  ctx.lineTo(W - R, H - B);
  ctx.lineTo(L, H - B);
  ctx.closePath();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#22d3ee';
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Toggle run button UI. */
function setRunningUI(running) {
  if (!btnRun) return;
  btnRun.disabled = running;
  btnRun.textContent = running ? 'Running…' : 'Run backtest';
}

/** Read UI inputs. */
function getInputs() {
  const preset = $('#preset')?.value ?? 'ema-rsi';
  const risk   = Math.max(0.25, parseFloat($('#risk')?.value || '1'));
  const trades = Math.max(10, parseInt($('#trades')?.value || '300', 10));
  const seed   = parseInt($('#seed')?.value || '42', 10);
  // optional speed if you add <input id="speed" type="number" value="1">
  const speed  = Math.max(0.1, parseFloat($('#speed')?.value || '1')); // default 1x
  return { preset, riskPct: risk, numTrades: trades, seed, speed };
}

/** One-line status renderer. */
function status(text) {
  if (!elStats) return;
  elStats.innerHTML = `<li><strong>${text}</strong></li>`;
}

/** Render live (during animation) stats. */
function renderLiveStats({ balance0, balanceNow, i, n }) {
  if (!elStats) return;
  const pnl = balanceNow - balance0;
  const ret = (balanceNow / balance0 - 1) * 100;
  elStats.innerHTML = `
    <li>Initial balance: <strong>$${money(balance0)}</strong></li>
    <li>Current balance: <strong>$${money(balanceNow)}</strong></li>
    <li>Live PnL:        <strong>$${money(pnl)}</strong></li>
    <li>Live Return:     <strong>${pct(ret)}</strong></li>
    <li>Progress:        <strong>${i}/${n}</strong></li>`;
}

/** Render final stats (after animation completes). */
function renderFinalStats(s) {
  if (!elStats) return;
  elStats.innerHTML = `
    <li>Initial balance: <strong>$${money(s.balance0)}</strong></li>
    <li>Final balance:   <strong>$${money(s.balanceF)}</strong></li>
    <li>Profit / Loss:   <strong>$${money(s.totalPnL)}</strong></li>
    <li>Return:          <strong>${pct(s.retPct)}</strong></li>
    <li>Trades:          <strong>${s.trades}</strong></li>
    <li>Wins / Losses:   <strong>${s.wins}</strong> / <strong>${s.losses}</strong></li>
    <li>Win rate:        <strong>${s.winRate}%</strong></li>
    <li>Profit Factor:   <strong>${isFinite(s.pf) ? s.pf : '∞'}</strong></li>
    <li>Avg Win / Avg Loss: <strong>$${money(s.avgWin)}</strong> / <strong>$${money(s.avgLoss)}</strong></li>
    <li>Expectancy (R/trade): <strong>${isFinite(s.expectancyR) ? s.expectancyR : '∞'}</strong></li>
    <li>Best / Worst trade:   <strong>$${money(s.bestTrade)}</strong> / <strong>$${money(s.worstTrade)}</strong></li>
    <li>CAGR:              <strong>${pct(s.cagr)}</strong></li>`;
}

/* ==================== Fallback backtest (when core is unavailable) ==================== */
/** Lightweight pseudo-backtest if the real engine isn't present. */
function fakeBacktest({ riskPct = 1, numTrades = 300, seed = 42 } = {}) {
  const balance0 = 10000;
  let eq = balance0, rnd = seed;
  const rand = () => (Math.sin(rnd++ * 12.9898) * 43758.5453) % 1;

  const equity = [];
  let wins = 0, losses = 0, gw = 0, gl = 0, best = -Infinity, worst = Infinity;

  for (let i = 0; i < numTrades; i++) {
    const r = (rand() - 0.48) * 0.01 * (riskPct / 1);
    const prev = eq;
    eq *= (1 + r);
    equity.push(eq);
    const pnl = eq - prev;
    if (pnl >= 0) { wins++; gw += pnl; if (pnl > best) best = pnl; }
    else          { losses++; gl += -pnl; if (pnl < worst) worst = pnl; }
  }

  const balanceF = equity.at(-1) ?? balance0;
  const retPct   = (balanceF / balance0 - 1) * 100;
  const trades   = wins + losses;
  const winRate  = trades ? Math.round(100 * wins / trades) : 0;
  const pf       = gl ? +(gw / gl).toFixed(2) : (wins ? Infinity : 0);
  const avgWin   = wins ? gw / wins : 0;
  const avgLoss  = losses ? gl / losses : 0;
  const expectancyR = avgLoss > 0
    ? ((winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss) / avgLoss
    : 0;

  return {
    equity,
    stats: {
      balance0,
      balanceF: +balanceF.toFixed(2),
      totalPnL: +(balanceF - balance0).toFixed(2),
      retPct:   +retPct.toFixed(2),
      trades, wins, losses, winRate,
      pf,
      maxDD: 0, sharpe: 0, sortino: 0,
      avgWin: +avgWin.toFixed(2),
      avgLoss:+avgLoss.toFixed(2),
      expectancyR:+expectancyR.toFixed(2),
      bestTrade:+best.toFixed(2),
      worstTrade:+worst.toFixed(2),
      cagr:+retPct.toFixed(2),
    },
  };
}

/* ==================== Animator ==================== */
let animState = {
  rafId: null,
  running: false,
  stop: false,
  pauseStart: null,
  pauseMs: 0,
  lastTarget: 0,
};

/** Stop any in-flight animation and reset state. */
function stopAnimation() {
  animState.stop = true;
  if (animState.rafId) cancelAnimationFrame(animState.rafId);
  animState.rafId = null;
  animState.running = false;
  animState.pauseStart = null;
  animState.pauseMs = 0;
  animState.lastTarget = 0;
}

/** Animate equity curve with pause/resume support and live stats. */
function animateEquity({ equity, statsFinal, speed = 1 }) {
  // Kill previous animation if any
  stopAnimation();

  const n = equity.length;
  if (n < 2) {
    drawEquitySlice(equity, n);
    renderFinalStats(statsFinal);
    return;
  }

  const scale = { min: Math.min(...equity), max: Math.max(...equity) };
  const balance0 = statsFinal?.balance0 ?? equity[0];

  // Base bars per second (adjust as desired)
  const BPS = 120;

  const start = performance.now();
  animState.stop = false;
  animState.running = true;
  animState.pauseMs = 0;
  animState.pauseStart = null;
  animState.lastTarget = 2;

  const tick = (ts) => {
    if (animState.stop) return;

    // Paused: hold position, accumulate paused time
    if (isPaused) {
      if (animState.pauseStart === null) animState.pauseStart = ts;
      drawEquitySlice(equity, animState.lastTarget, scale);
      const balanceNowFrozen = equity[animState.lastTarget - 1];
      renderLiveStats({ balance0, balanceNow: balanceNowFrozen, i: animState.lastTarget, n });
      animState.rafId = requestAnimationFrame(tick);
      return;
    }

    // Resumed: discount paused time from elapsed
    if (animState.pauseStart !== null) {
      animState.pauseMs += (ts - animState.pauseStart);
      animState.pauseStart = null;
    }

    const elapsed = (ts - start - animState.pauseMs) / 1000; // effective seconds
    const target  = Math.min(n, Math.max(2, Math.floor(elapsed * BPS * speed)));

    // Avoid going backwards due to rounding
    const nextIdx = Math.max(animState.lastTarget, target);

    drawEquitySlice(equity, nextIdx, scale);
    const balanceNow = equity[nextIdx - 1];
    renderLiveStats({ balance0, balanceNow, i: nextIdx, n });
    animState.lastTarget = nextIdx;

    if (nextIdx < n) {
      animState.rafId = requestAnimationFrame(tick);
    } else {
      animState.running = false;
      renderFinalStats(statsFinal); // full metrics at the end
    }
  };

  animState.rafId = requestAnimationFrame(tick);
}

/* ==================== Main RUN ==================== */
async function run() {
  try {
    setRunningUI(true);
    status('Running…');

    // Path to trader.js wrapper (priority: window -> data-attr -> relative)
    const scriptEl = document.currentScript;
    const attrPath = scriptEl?.dataset?.traderPath;
    const path = window.TRADER_PATH || attrPath || '../../../trader/trader.js';

    // Dynamic import with cache-busting
    const Trader = await import(`${path}?v=${Date.now()}`);
    const runBacktest = Trader.runBacktest ?? Trader.default?.runBacktest;

    const opts = getInputs();
    console.log('▶️ runBacktest', { path, ...opts });

    let equity, stats;
    if (typeof runBacktest === 'function') {
      ({ equity, stats } = await runBacktest(opts));
    } else {
      console.warn('⚠️ runBacktest not found → fallback');
      ({ equity, stats } = fakeBacktest(opts));
    }

    // Kick off dynamic animation
    currentMode = 'batch';
    isPaused = false;
    updatePauseUI();
    animateEquity({ equity, statsFinal: stats, speed: opts.speed });
  } catch (err) {
    console.error('❌ Error', err);
    status('Error: ' + (err?.message || err));

    // Final fallback
    const opts = getInputs();
    const { equity, stats } = fakeBacktest(opts);
    currentMode = 'batch';
    isPaused = false;
    updatePauseUI();
    animateEquity({ equity, statsFinal: stats, speed: opts.speed });
  } finally {
    setRunningUI(false);
  }
}

/* ==================== Events ==================== */
// Run
btnRun?.addEventListener('click', () => {
  console.log('🖱️ click RUN');
  run();
});

// Reset
btnReset?.addEventListener('click', () => {
  console.log('🔁 reset');
  stopAnimation();
  isPaused = false;
  currentMode = 'idle';
  updatePauseUI();
  elStats && (elStats.innerHTML = '');
  ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
});

/* ==================== Pause / Resume ==================== */
// DOM:
const btnPause = document.querySelector('#pause');

// State:
let isPaused = false;
let currentMode = 'idle'; // 'stream' | 'batch' | 'idle'
let lastSpeedBeforePause = 1;

// Pre-existing speed ref (kept here if you use streaming mode elsewhere)
const speedRef = { value: 1 };
const speedEl  = document.querySelector('#speed'); // optional; ignored if missing

function updatePauseUI() {
  if (!btnPause) return;
  btnPause.textContent = isPaused ? 'Resume' : 'Pause';
}

// Toggle pause/resume
btnPause?.addEventListener('click', () => {
  if (currentMode === 'idle') return; // nothing to pause
  isPaused = !isPaused;
  updatePauseUI();
});

/* ==================== Autorun (optional) ==================== */
run();

/* ==================== Debug hook ==================== */
window.OTraderDemo = { run, stop: stopAnimation };

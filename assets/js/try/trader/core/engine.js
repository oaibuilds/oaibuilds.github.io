// /trader/core/engine.js
// Engine: batch backtest runner + streaming variant (bar-by-bar snapshots).

/**
 * runEngine({
 *   series   : { o,h,l,c,v,t }            // needs at least c[]
 *   strategy : fn({c}, params) -> { signals: ('flat'|'long'|null)[], name }
 *   wallet   : Wallet instance             // tracks cash/qty/equity/trades
 *   qtyFn    : fn(price, slDistance) -> qty
 *   maxTrades= 300
 *   seed     = 42
 *   params   = {}
 * })
 */
export async function runEngine({
  series,
  strategy,
  wallet,
  qtyFn,
  maxTrades = 300,
  seed = 42,
  params = {},
} = {}) {
  // --- 1) Ensure we have a close series; if not, synthesize one (±1% RW) ---
  let c = series?.c;
  if (!c?.length) {
    const bars = Math.max(400, maxTrades + 50);
    let rnd = seed;
    let p = 100;
    const rand = () => (Math.sin(rnd++ * 12.9898) * 43758.5453) % 1;
    c = Array.from({ length: bars }, () => {
      p = +(p * (1 + (rand() - 0.5) * 0.02)).toFixed(2); // ~±1%
      return p;
    });
  }

  // --- 2) Strategy signals (fallback to empty array) ---
  const { signals = [] } = strategy({ c }, params) || { signals: [] };

  // --- 3) Simulation state ---
  let inPos = false;
  let entryIdx = -1;
  let entryPx = 0;
  let qty = 0;
  let closed = 0;
  const trades = [];

  // Mark initial equity
  wallet.markToMarket(c[0]);

  // Helper: mark-to-market equity at price
  const equityNow = (px) => wallet.cash + wallet.qty * px; // (kept for clarity)

  // --- 4) Iterate bars, execute long-only state machine ---
  for (let i = 1; i < c.length; i++) {
    const px = c[i];
    const sigPrev = signals[i - 1];
    const sigNow = signals[i] ?? sigPrev;

    // Enter long: transition to 'long' and we are flat
    if (!inPos && sigPrev !== 'long' && sigNow === 'long' && closed < maxTrades) {
      const slDistance = px * 0.01; // demo: assume 1% stop distance
      // Normalize qty to 6 decimals to avoid FP noise
      qty = Math.max(0, Math.floor((qtyFn(px, slDistance) || 0) * 1e6) / 1e6);
      if (qty > 0) {
        wallet.buy(px, qty, i);
        inPos = !!wallet.position;
        if (inPos) {
          entryIdx = i;
          entryPx = px;
        }
      }
    }

    // Exit long: leave 'long' or last bar
    const mustExit = inPos && ((sigPrev === 'long' && sigNow !== 'long') || i === c.length - 1);
    if (mustExit) {
      const closeQty = wallet.qty;
      if (closeQty > 0) {
        wallet.sell(px, closeQty, i);
        const last = wallet.trades[wallet.trades.length - 1];
        // Ensure we capture the last trade (if wallet already pushed, this is a harmless check)
        if (last && last.iOut === i) trades.push(last);
      }
      inPos = false;
      entryIdx = -1;
      entryPx = 0;
      qty = 0;
      closed++;
    }

    // Mark-to-market at every bar
    wallet.markToMarket(px);
  }

  // --- 5) Derived metrics from wallet ---
  const stats = wallet.getStats(); // equity0, equityFinal, totalPnL, retPct, trades, wins, losses, winRate, pf, maxDD

  // Best/Worst and averages
  const winsArr = wallet.trades.filter((t) => t.pnl > 0);
  const lossArr = wallet.trades.filter((t) => t.pnl <= 0);
  const grossWin = winsArr.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(lossArr.reduce((s, t) => s + t.pnl, 0));
  const avgWin = winsArr.length ? +(grossWin / winsArr.length).toFixed(2) : 0;
  const avgLoss = lossArr.length ? +(grossLoss / lossArr.length).toFixed(2) : 0;
  const best = wallet.trades.reduce((m, t) => Math.max(m, t.pnl), -Infinity);
  const worst = wallet.trades.reduce((m, t) => Math.min(m, t.pnl), +Infinity);

  // Sharpe / Sortino from equity series
  const e = wallet.equitySeries;
  const rets = [];
  for (let i = 1; i < e.length; i++) rets.push(e[i] / e[i - 1] - 1);
  const mean = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length));
  const downs = rets.filter((x) => x < 0);
  const ddv = Math.sqrt(downs.reduce((s, x) => s + x * x, 0) / Math.max(1, downs.length));
  const sharpe = sd ? +((mean / sd) * Math.sqrt(252)).toFixed(2) : 0;
  const sortino = ddv ? +((mean / ddv) * Math.sqrt(252)).toFixed(2) : 0;

  // --- 6) Output ---
  return {
    equity: e.slice(),
    trades: wallet.trades.slice(),
    metrics: {
      balance0: +stats.equity0.toFixed(2),
      balanceF: +stats.equityFinal.toFixed(2),
      totalPnL: +stats.totalPnL.toFixed(2),
      retPct: +stats.retPct.toFixed(2),
      trades: stats.trades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      pf: stats.pf,
      maxDD: +stats.maxDD.toFixed?.(1) ?? stats.maxDD,
      avgWin,
      avgLoss,
      bestTrade: +(isFinite(best) ? best : 0).toFixed(2),
      worstTrade: +(isFinite(worst) ? worst : 0).toFixed(2),
      sharpe,
      sortino,
      // Approximate CAGR from retPct (assumes daily bars ~252/yr if needed)
      cagr: +stats.retPct.toFixed(2),
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Streaming engine: same logic as runEngine but yields a snapshot per bar.
 * Supports dynamic speed via an external { value } ref (speedRef).
 *
 * @param {object} opts
 * @param {number} opts.bps      Base bars per second (e.g., 60)
 * @param {number} opts.speed    Initial speed multiplier (1x)
 * @param {{value:number}} [opts.speedRef]  Mutable ref to adjust speed live
 */
export async function* runEngineStream({
  series,
  strategy,
  wallet,
  qtyFn,
  maxTrades = 300,
  seed = 42,
  params = {},
  bps = 60,
  speed = 1,
  speedRef = null,
} = {}) {
  // --- 1) Ensure series (or synthesize) ---
  let c = series?.c;
  if (!c?.length) {
    const bars = Math.max(400, maxTrades + 50);
    let rnd = seed;
    let p = 100;
    const rand = () => (Math.sin(rnd++ * 12.9898) * 43758.5453) % 1;
    c = Array.from({ length: bars }, () => {
      p = +(p * (1 + (rand() - 0.5) * 0.02)).toFixed(2);
      return p;
    });
  }

  // --- 2) Signals ---
  const { signals = [] } = strategy({ c }, params) || { signals: [] };

  // --- 3) Sim state ---
  let inPos = false;
  let qty = 0;
  let closed = 0;

  // Initial equity + initial snapshot
  wallet.markToMarket(c[0]);
  yield {
    i: 0,
    price: c[0],
    equityNow: wallet.equitySeries[0],
    equitySeries: wallet.equitySeries.slice(),
    trades: wallet.trades.slice(),
    stats: wallet.getStats(),
    progress: 0,
  };

  // --- 4) Iterate bars and emit snapshots ---
  for (let i = 1; i < c.length; i++) {
    const px = c[i];
    const sigPrev = signals[i - 1];
    const sigNow = signals[i] ?? sigPrev;

    // Enter long
    if (!inPos && sigPrev !== 'long' && sigNow === 'long' && closed < maxTrades) {
      const slDistance = px * 0.01;
      qty = Math.max(0, Math.floor((qtyFn(px, slDistance) || 0) * 1e6) / 1e6);
      if (qty > 0) {
        wallet.buy(px, qty, i);
        inPos = !!wallet.position;
      }
    }

    // Exit long
    const mustExit = inPos && ((sigPrev === 'long' && sigNow !== 'long') || i === c.length - 1);
    if (mustExit) {
      const closeQty = wallet.qty;
      if (closeQty > 0) wallet.sell(px, closeQty, i);
      inPos = false;
      qty = 0;
      closed++;
    }

    // MTM + snapshot
    wallet.markToMarket(px);
    yield {
      i,
      price: px,
      equityNow: wallet.equitySeries.at(-1),
      equitySeries: wallet.equitySeries.slice(), // For bandwidth, you could emit only equityNow
      trades: wallet.trades.slice(),
      stats: wallet.getStats(),
      progress: i / (c.length - 1),
    };

    // --- 5) Speed control (supports live changes) ---
    const spd = Math.max(0.1, Number(speedRef?.value ?? speed) || 1);
    const dtMs = 1000 / (bps * spd);
    // Turbo mode: set bps=Infinity from the UI to skip delays
    if (isFinite(dtMs) && dtMs > 0) await sleep(dtMs);
  }
}

// Default export for convenience
export default { runEngine };

// /trader/trader.js
import { runEngine }     from './core/engine.js';
import { selectConfig }  from './logic/config_selector.js';
import { fetchSeries }   from './data/data_fetcher.js';
import { qtyFromRisk }   from './core/qty_logic.js';
import { Wallet }        from './core/wallet.js';

import { emaRsi as emaRsiStrategy } from './strategies/ema_rsi.js';

/* Note: `runEngineStream` is referenced below but not imported here.
   Assuming it is provided elsewhere in your build or intentionally omitted. */

const PRESETS = {
  'ema-rsi': emaRsiStrategy,
  // 'donchian': donchianStrategy,
  // 'mean-rev': meanRevStrategy,
};

/* =========================================================
   Batch backtest (single run)
   - Picks series/config via preset
   - Sizes positions from risk %
   - Runs engine and returns normalized stats + equity curve
   ========================================================= */
export async function runBacktest({
  preset    = 'ema-rsi',
  riskPct   = 1,
  numTrades = 300,
  seed      = 42,
  fee       = 0, // commission (0 = none)
} = {}) {
  const strategy = PRESETS[preset] ?? emaRsiStrategy;

  // 1) Data
  const cfg    = selectConfig({ preset, seed });
  const series = await fetchSeries(cfg); // {o,h,l,c,v,t}

  // 2) Wallet & sizing
  const initialBalance = 10000;
  const wallet = new Wallet({ equity0: initialBalance, fee });

  // qtyFn uses live equity (cash + marked-to-market position)
  const qtyFn = (price, slDistance) => {
    const equityNow = wallet.cash + wallet.qty * price;
    return qtyFromRisk({ balance: equityNow, riskPct, slDistance, price });
  };

  // 3) Run engine
  const res = await runEngine({
    series,
    strategy,
    wallet,
    qtyFn,
    maxTrades: numTrades,
    seed,
    params: {}, // strategy params can be passed here
  });

  // 4) Normalize for the frontend
  const e = res?.equity ?? [];
  const m = res?.metrics ?? {};

  // Guard against NaN/Infinity
  const safe = (v, d = 0) => (Number.isFinite(v) ? v : d);

  return {
    equity: e,
    stats: {
      balance0:   safe(m.balance0, initialBalance),
      balanceF:   safe(m.balanceF, initialBalance),
      totalPnL:   safe(m.totalPnL, 0),
      retPct:     safe(m.retPct, 0),
      trades:     safe(m.trades, 0),
      wins:       safe(m.wins, 0),
      losses:     safe(m.losses, 0),
      winRate:    safe(m.winRate, 0),
      pf:         (m.pf === Infinity) ? Infinity : safe(m.pf, 0),
      maxDD:      safe(m.maxDD, 0),
      sharpe:     safe(m.sharpe, 0),
      sortino:    safe(m.sortino, 0),
      avgWin:     safe(m.avgWin, 0),
      avgLoss:    safe(m.avgLoss, 0),
      expectancyR: (m.avgLoss > 0)
        ? +(((m.winRate / 100) * m.avgWin - (1 - m.winRate / 100) * m.avgLoss) / m.avgLoss).toFixed(2)
        : 0,
      bestTrade:  safe(m.bestTrade, 0),
      worstTrade: safe(m.worstTrade, 0),
      cagr:       safe(m.cagr, m.retPct),
    },
  };
}

/**
 * =========================================================
 * Streaming backtest (tick-by-tick)
 * - Emits snapshots from the engine at controlled pace
 * - Speed is live-tunable via `speedRef.value`
 *
 * @param {object} opts
 * @param {string} opts.preset
 * @param {number} opts.riskPct
 * @param {number} opts.numTrades
 * @param {number} opts.seed
 * @param {number} opts.fee
 * @param {number} opts.bps      Bars per second baseline (e.g., 60)
 * @param {number} opts.speed    Initial speed multiplier (1x)
 * @param {{value:number}} [opts.speedRef] Mutable ref to adjust speed live
 * =========================================================
 */
export async function* runBacktestStream({
  preset    = 'ema-rsi',
  riskPct   = 1,
  numTrades = 300,
  seed      = 42,
  fee       = 0,
  bps       = 60,
  speed     = 1,
  speedRef  = null,
} = {}) {
  const strategy = PRESETS[preset] ?? emaRsiStrategy;

  // 1) Data
  const cfg    = selectConfig({ preset, seed });
  const series = await fetchSeries(cfg);

  // 2) Wallet & sizing
  const initialBalance = 10000;
  const wallet = new Wallet({ equity0: initialBalance, fee });

  const qtyFn = (price, slDistance) => {
    const equityNow = wallet.cash + wallet.qty * price;
    return qtyFromRisk({ balance: equityNow, riskPct, slDistance, price });
  };

  // 3) Delegate to engine stream
  const stream = runEngineStream({
    series,
    strategy,
    wallet,
    qtyFn,
    maxTrades: numTrades,
    seed,
    params: {},
    bps,
    speed,
    speedRef,
  });

  for await (const snap of stream) {
    // Optionally enrich snapshots; by default re-emit engine snapshots
    yield snap;
  }
}

export default { runBacktest, runBacktestStream };

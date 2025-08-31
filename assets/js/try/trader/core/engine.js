// /trader/core/engine.js
/**
 * runEngine({
 *   series: { o,h,l,c,v,t },        // al menos c[]
 *   strategy,                       // fn({c}, params) -> { signals:('flat'|'long'|null)[], name }
 *   wallet,                         // tu Wallet
 *   qtyFn,                          // fn(price, slDistance) -> qty
 *   maxTrades = 300,
 *   seed = 42,
 *   params = {}
 * })
 */
export async function runEngine({
  series,
  strategy,
  wallet,
  qtyFn,
  maxTrades = 300,
  seed = 42,
  params = {}
} = {}) {
  // Serie mínima (si no llega, generamos sintética)
  let c = series?.c;
  if (!c?.length) {
    const bars = Math.max(400, maxTrades + 50);
    let rnd = seed, p = 100;
    const rand = () => (Math.sin(rnd++ * 12.9898) * 43758.5453) % 1;
    c = Array.from({ length: bars }, () => {
      p = +(p * (1 + (rand() - 0.5) * 0.02)).toFixed(2); // ±1% aprox
      return p;
    });
  }

  const { signals = [] } = strategy({ c }, params) || { signals: [] };

  // Estado de simulación
  let inPos = false;
  let entryIdx = -1, entryPx = 0, qty = 0;
  let closed = 0;
  const trades = [];

  // Marca el equity inicial
  wallet.markToMarket(c[0]);

  // Helpers
  const equityNow = (px) => wallet.cash + wallet.qty * px;

  for (let i = 1; i < c.length; i++) {
    const px = c[i];
    const sigPrev = signals[i - 1];
    const sigNow  = signals[i] ?? sigPrev;

    // Entrada (cambio a long y no estamos dentro)
    if (!inPos && sigPrev !== 'long' && sigNow === 'long' && closed < maxTrades) {
      const slDistance = px * 0.01; // 1% por defecto (demo)
      qty = Math.max(0, Math.floor((qtyFn(px, slDistance) || 0) * 1e6) / 1e6); // normaliza
      if (qty > 0) {
        wallet.buy(px, qty, i);
        inPos = !!wallet.position;
        if (inPos) { entryIdx = i; entryPx = px; }
      }
    }

    // Salida (dejamos de estar long o último punto)
    const mustExit = inPos && ((sigPrev === 'long' && sigNow !== 'long') || i === c.length - 1);
    if (mustExit) {
      // Cierra TODO lo que haya
      const closeQty = wallet.qty;
      if (closeQty > 0) {
        wallet.sell(px, closeQty, i);
        const last = wallet.trades[wallet.trades.length - 1];
        // Asegura push (por si el wallet ya hizo el push, ignorará duplicados)
        if (last && last.iOut === i) trades.push(last);
      }
      inPos = false;
      entryIdx = -1; entryPx = 0; qty = 0;
      closed++;
    }

    // Marcar MTM en cada barra
    wallet.markToMarket(px);
  }

  // ===== Métricas derivadas =====
  const stats = wallet.getStats(); // equity0, equityFinal, totalPnL, retPct, trades, wins, losses, winRate, pf, maxDD

  // Best/Worst, promedios
  const winsArr  = wallet.trades.filter(t => t.pnl > 0);
  const lossArr  = wallet.trades.filter(t => t.pnl <= 0);
  const grossWin = winsArr.reduce((s,t)=>s+t.pnl, 0);
  const grossLoss= Math.abs(lossArr.reduce((s,t)=>s+t.pnl, 0));
  const avgWin   = winsArr.length  ? +(grossWin / winsArr.length).toFixed(2) : 0;
  const avgLoss  = lossArr.length  ? +(grossLoss / lossArr.length).toFixed(2) : 0;
  const best     = wallet.trades.reduce((m,t)=>Math.max(m, t.pnl), -Infinity);
  const worst    = wallet.trades.reduce((m,t)=>Math.min(m, t.pnl), +Infinity);

  // Sharpe / Sortino sobre equitySeries
  const e = wallet.equitySeries;
  const rets = [];
  for (let i = 1; i < e.length; i++) rets.push(e[i] / e[i - 1] - 1);
  const mean = rets.reduce((s,x)=>s+x,0) / Math.max(1, rets.length);
  const sd   = Math.sqrt(rets.reduce((s,x)=>s+(x-mean)**2,0) / Math.max(1, rets.length));
  const downs= rets.filter(x=>x<0);
  const ddv  = Math.sqrt(downs.reduce((s,x)=>s+x*x,0) / Math.max(1, downs.length));
  const sharpe  = sd  ? +((mean/sd)*Math.sqrt(252)).toFixed(2) : 0;
  const sortino = ddv ? +((mean/ddv)*Math.sqrt(252)).toFixed(2) : 0;

  return {
    equity: e.slice(),        // serie completa
    trades: wallet.trades.slice(),
    metrics: {
      balance0:  +stats.equity0.toFixed(2),
      balanceF:  +stats.equityFinal.toFixed(2),
      totalPnL:  +stats.totalPnL.toFixed(2),
      retPct:    +stats.retPct.toFixed(2),
      trades:    stats.trades,
      wins:      stats.wins,
      losses:    stats.losses,
      winRate:   stats.winRate,
      pf:        stats.pf,
      maxDD:     +stats.maxDD.toFixed?.(1) ?? stats.maxDD,
      avgWin,
      avgLoss,
      bestTrade: +(isFinite(best)  ? best  : 0).toFixed(2),
      worstTrade:+(isFinite(worst) ? worst : 0).toFixed(2),
      sharpe,
      sortino,
      // cagr aproximado a partir de retPct y longitud (asumimos ~252 barras/año si son diarias)
      cagr: +stats.retPct.toFixed(2)
    }
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * runEngineStream: igual que runEngine pero emite snapshot por barra.
 * Soporta velocidad dinámica mediante speedRef.value (opcional).
 */
export async function* runEngineStream({
  series,
  strategy,
  wallet,
  qtyFn,
  maxTrades = 300,
  seed = 42,
  params = {},
  bps = 60,                 // barras por segundo base
  speed = 1,                // multiplicador inicial (si no usas speedRef)
  speedRef = null           // { value: number } para control en vivo
} = {}) {

  // Serie mínima (si no llega, generamos sintética)
  let c = series?.c;
  if (!c?.length) {
    const bars = Math.max(400, maxTrades + 50);
    let rnd = seed, p = 100;
    const rand = () => (Math.sin(rnd++ * 12.9898) * 43758.5453) % 1;
    c = Array.from({ length: bars }, () => {
      p = +(p * (1 + (rand() - 0.5) * 0.02)).toFixed(2);
      return p;
    });
  }

  const { signals = [] } = strategy({ c }, params) || { signals: [] };

  // Estado de simulación
  let inPos = false;
  let qty = 0;
  let closed = 0;

  // Marca equity inicial y emite primer snapshot
  wallet.markToMarket(c[0]);
  yield {
    i: 0,
    price: c[0],
    equityNow: wallet.equitySeries[0],
    equitySeries: wallet.equitySeries.slice(),
    trades: wallet.trades.slice(),
    stats: wallet.getStats(),
    progress: 0
  };

  for (let i = 1; i < c.length; i++) {
    const px = c[i];
    const sigPrev = signals[i - 1];
    const sigNow  = signals[i] ?? sigPrev;

    // Entrada
    if (!inPos && sigPrev !== 'long' && sigNow === 'long' && closed < maxTrades) {
      const slDistance = px * 0.01;
      qty = Math.max(0, Math.floor((qtyFn(px, slDistance) || 0) * 1e6) / 1e6);
      if (qty > 0) {
        wallet.buy(px, qty, i);
        inPos = !!wallet.position;
      }
    }

    // Salida
    const mustExit = inPos && ((sigPrev === 'long' && sigNow !== 'long') || i === c.length - 1);
    if (mustExit) {
      const closeQty = wallet.qty;
      if (closeQty > 0) {
        wallet.sell(px, closeQty, i);
      }
      inPos = false;
      qty = 0;
      closed++;
    }

    // MTM + snapshot
    wallet.markToMarket(px);

    const snap = {
      i,
      price: px,
      equityNow: wallet.equitySeries.at(-1),
      equitySeries: wallet.equitySeries.slice(), // si quieres optimizar, envía solo equityNow y pinta incremental
      trades: wallet.trades.slice(),
      stats: wallet.getStats(),
      progress: i / (c.length - 1)
    };

    yield snap;

    // Control de velocidad (dinámico si speedRef)
    const spd = Math.max(0.1, Number(speedRef?.value ?? speed) || 1);
    const dtMs = 1000 / (bps * spd);
    // Nota: si quieres “sin delay” (modo turbo), pon bps=Infinity desde el front.
    if (isFinite(dtMs) && dtMs > 0) await sleep(dtMs);
  }
}

// Control de velocidad (pausa real si speedRef.value <= 0)
const getSpd = () => Number(speedRef?.value ?? speed);
let spd = getSpd();
if (!isFinite(spd)) spd = 1;

if (spd <= 0) {
  // PAUSA: espera hasta que speedRef.value > 0
  while ((Number(speedRef?.value ?? 0)) <= 0) {
    await sleep(50);
  }
} else {
  const dtMs = 1000 / (bps * spd);
  if (isFinite(dtMs) && dtMs > 0) await sleep(dtMs);
}


export default { runEngine };

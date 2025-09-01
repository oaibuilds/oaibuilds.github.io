// /trader/data/data_fetcher.js
// Genera una serie sintética OHLCV; tu estrategia solo necesita candles.c
export async function fetchSeries({ symbol = 'BTCUSDT', bars = 500, seed = 42, startPrice = 100 } = {}) {
  let rnd = seed;
  const rand = () => (Math.sin(rnd++ * 12.9898) * 43758.5453) % 1;

  const c = [];
  let p = startPrice;
  for (let i = 0; i < bars; i++) {
    const r = (rand() - 0.5) * 0.02;       // ~±1% paso
    p = +(p * (1 + r)).toFixed(2);
    c.push(p);
  }

  // Derivamos OHLC y volumen “plausible”
  const o = [], h = [], l = [], v = [], t = [];
  for (let i = 0; i < bars; i++) {
    const oc = i ? c[i - 1] : c[i];
    const cc = c[i];
    const hi = +(Math.max(oc, cc) * (1 + 0.001 + 0.001 * rand())).toFixed(2);
    const lo = +(Math.min(oc, cc) * (1 - 0.001 - 0.001 * rand())).toFixed(2);
    o.push(oc); h.push(hi); l.push(lo);
    v.push(100 + Math.floor(50 * rand()));
    t.push(i); // timestamp sintético
  }

  return { o, h, l, c, v, t, meta: { symbol, interval: '1h' } };
}

export default { fetchSeries };

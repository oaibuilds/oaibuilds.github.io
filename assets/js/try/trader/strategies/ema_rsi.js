// /trader/strategies/ema_rsi.js
import { ema, rsi } from '../utils/indicators.js';

/**
 * EMA Cross + RSI Filter
 * @param {{c:number[]}} candles - objeto con cierre en candles.c
 * @param {{fast?:number, slow?:number, rsiP?:number, rsiMin?:number, rsiMax?:number}} params
 * @returns {{signals:('flat'|'long'|null)[], name:string}}
 */
export function emaRsiStrategy(candles, params = {}) {
  const { c } = candles;
  const { fast = 12, slow = 26, rsiP = 14, rsiMin = 45, rsiMax = 70 } = params;

  const eFast = ema(c, fast);
  const eSlow = ema(c, slow);
  const r     = rsi(c, rsiP);

  const signals = Array(c.length).fill(null);
  let state = 'flat';

  for (let i = 1; i < c.length; i++) {
    const crossUp   = eFast[i - 1] <= eSlow[i - 1] && eFast[i] > eSlow[i];
    const crossDown = eFast[i - 1] >= eSlow[i - 1] && eFast[i] < eSlow[i];
    const okRsiLong = (r[i] == null) || (r[i] >= rsiMin && r[i] <= rsiMax);

    if (crossUp && okRsiLong) state = 'long';
    if (crossDown)            state = 'flat';

    signals[i] = state;
  }

  return { signals, name: 'EMA+RSI' };
}

/* 👇 Compat exports (no toques nada más en tu código):
   - named: emaRsi (lo que te está pidiendo trader.js)
   - named: strategy (por si tu engine busca 'strategy')
   - default: para imports por defecto
*/
export { emaRsiStrategy as emaRsi, emaRsiStrategy as strategy };
export default emaRsiStrategy;

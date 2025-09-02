// /trader/utils/indicators.js

/**
 * Exponential Moving Average (EMA).
 * 
 * @param {number[]} arr - Input price series (e.g. closes).
 * @param {number} p - Period length.
 * @returns {number[]} EMA values, same length as arr.
 */
export function ema(arr, p) {
  const k = 2 / (p + 1);
  const out = [];
  let prev;

  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    prev = (prev === undefined) ? v : (v * k + prev * (1 - k));
    out.push(prev);
  }
  return out;
}

/**
 * Relative Strength Index (RSI).
 *
 * @param {number[]} closes - Array of close prices.
 * @param {number} [p=14] - Lookback period (default 14).
 * @returns {(number|null)[]} RSI values. Elements before index p are null.
 */
export function rsi(closes, p = 14) {
  let gains = 0, losses = 0;
  const rsis = Array(closes.length).fill(null);

  // Seed initial average gains/losses
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / p, avgLoss = losses / p;

  // Wilder's smoothing
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (p - 1) + (d > 0 ? d : 0)) / p;
    avgLoss = (avgLoss * (p - 1) + (d < 0 ? -d : 0)) / p;

    const rs = avgLoss === 0 ? Infinity : (avgGain / avgLoss);
    rsis[i] = 100 - (100 / (1 + rs));
  }
  return rsis;
}

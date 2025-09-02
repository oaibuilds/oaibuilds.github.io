// /trader/core/qty_logic.js

/**
 * Calculates position size based on account balance, % risk per trade,
 * and stop-loss distance.
 *
 * @param {object} opts
 * @param {number} opts.balance   - current account balance
 * @param {number} opts.riskPct   - risk % per trade (e.g. 1 = 1%)
 * @param {number} opts.slDistance- stop-loss distance in price units
 * @param {number} opts.price     - entry price (fallback for slDistance if not provided)
 * @param {number} opts.minStep   - minimum step to avoid division by zero (default: 1e-6)
 * @returns {number} qty          - normalized quantity, non-negative, rounded to 6 decimals
 */
export function qtyFromRisk({ balance, riskPct, slDistance, price, minStep = 1e-6 } = {}) {
  const bal  = Number(balance || 0);
  const rp   = Number(riskPct || 0) / 100;         // convert % risk to decimal
  const px   = Number(price || 0);
  const dist = Number(slDistance || (px * 0.01))   // fallback: 1% of price
             || minStep;

  const riskAmt = Math.max(0, bal * rp);           // $ at risk
  const qty     = riskAmt / Math.max(minStep, dist);

  // Normalize to 6 decimals and ensure non-negative
  return Math.max(0, Number(qty.toFixed(6)));
}

// Compatibility export (both named and default)
export default { qtyFromRisk };

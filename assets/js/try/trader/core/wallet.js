// /trader/core/wallet.js

/**
 * Wallet class to simulate account equity, positions, and trade history.
 * Handles basic buy/sell operations, trade tracking, and equity updates.
 */
export class Wallet {
  /**
   * @param {object} opts
   * @param {number} opts.equity0 - initial equity (default: 10000)
   * @param {number} opts.fee     - commission per trade as decimal (e.g. 0.001 = 0.1%)
   */
  constructor({ equity0 = 10000, fee = 0 } = {}) {
    this.equity0 = equity0;         // starting equity
    this.cash = equity0;            // available cash
    this.qty = 0;                   // current position size
    this.position = null;           // active position { pxIn, iIn }
    this.fee = fee;                 // trading fee
    this.trades = [];               // completed trades { entry, exit, qty, pnl, iIn, iOut }
    this.equitySeries = [];         // equity tracked bar by bar
  }

  /**
   * Execute a buy order (enter long).
   * @param {number} px - entry price
   * @param {number} qty - quantity to buy
   * @param {number} i - index of the bar
   */
  buy(px, qty, i) {
    const cost = px * qty * (1 + this.fee);
    if (cost > this.cash) return;   // insufficient cash
    this.cash -= cost;
    this.qty += qty;
    this.position = { pxIn: px, iIn: i };
  }

  /**
   * Execute a sell order (close or reduce position).
   * @param {number} px - exit price
   * @param {number} qty - quantity to sell
   * @param {number} i - index of the bar
   */
  sell(px, qty, i) {
    const ret = px * qty * (1 - this.fee);
    this.cash += ret;
    this.qty -= qty;

    const pnl = (px - this.position.pxIn) * qty;
    this.trades.push({
      entry: this.position.pxIn,
      exit: px,
      qty,
      iIn: this.position.iIn,
      iOut: i,
      pnl
    });

    // reset if fully closed
    if (this.qty <= 0) {
      this.qty = 0;
      this.position = null;
    }
  }

  /**
   * Mark equity at current market price (for equity curve tracking).
   * @param {number} px - current price
   */
  markToMarket(px) {
    this.equitySeries.push(this.cash + this.qty * px);
  }

  /**
   * Calculate wallet statistics from equity curve and trades.
   * @returns {object} stats summary
   */
  getStats() {
    const equityFinal = this.equitySeries[this.equitySeries.length - 1] ?? this.equity0;
    const totalPnL = +(equityFinal - this.equity0).toFixed(2);
    const retPct   = +((equityFinal / this.equity0 - 1) * 100).toFixed(2);

    // trade breakdown
    const winsArr  = this.trades.filter(t => t.pnl > 0);
    const lossArr  = this.trades.filter(t => t.pnl < 0);
    const wins     = winsArr.length;
    const losses   = lossArr.length;
    const trades   = this.trades.length;
    const winRate  = trades ? Math.round(100 * wins / trades) : 0;

    // profit factor
    const grossWin  = winsArr.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(lossArr.reduce((s, t) => s + t.pnl, 0));
    const pf        = grossLoss ? +(grossWin / grossLoss).toFixed(2) : (wins ? Infinity : 0);

    // simple max drawdown
    let peak = -Infinity, dd = 0;
    for (const e of this.equitySeries) {
      peak = Math.max(peak, e);
      dd   = Math.max(dd, (peak - e) / peak || 0);
    }
    const maxDD = +(dd * 100).toFixed(1);

    return {
      equity0: this.equity0,
      equityFinal: +equityFinal.toFixed(2),
      totalPnL,
      retPct,
      trades,
      wins,
      losses,
      winRate,
      pf,
      maxDD
    };
  }
}

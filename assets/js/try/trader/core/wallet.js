export class Wallet {
  constructor({ equity0 = 10000, fee = 0 } = {}) {
    this.equity0 = equity0;
    this.cash = equity0;
    this.qty = 0;
    this.position = null;
    this.fee = fee;
    this.trades = [];        // {entry, exit, qty, pnl}
    this.equitySeries = [];
  }
  buy(px, qty, i){
    const cost = px * qty * (1 + this.fee);
    if (cost > this.cash) return;
    this.cash -= cost; this.qty += qty; this.position = { pxIn:px, iIn:i };
  }
  sell(px, qty, i){
    const ret = px * qty * (1 - this.fee);
    this.cash += ret; this.qty -= qty;
    const pnl = (px - this.position.pxIn) * qty;
    this.trades.push({ entry:this.position.pxIn, exit:px, qty, iIn:this.position.iIn, iOut:i, pnl });
    if (this.qty <= 0){ this.qty = 0; this.position = null; }
  }
  markToMarket(px){
    this.equitySeries.push(this.cash + this.qty * px);
  }
  getStats(){
    const equityFinal = this.equitySeries[this.equitySeries.length - 1] ?? this.equity0;
    const totalPnL = +(equityFinal - this.equity0).toFixed(2);
    const retPct = +((equityFinal / this.equity0 - 1) * 100).toFixed(2);

    const winsArr = this.trades.filter(t => t.pnl > 0);
    const lossArr = this.trades.filter(t => t.pnl < 0);
    const wins = winsArr.length;
    const losses = lossArr.length;
    const trades = this.trades.length;
    const winRate = trades ? Math.round(100 * wins / trades) : 0;

    const grossWin = winsArr.reduce((s,t)=>s+t.pnl,0);
    const grossLoss = Math.abs(lossArr.reduce((s,t)=>s+t.pnl,0));
    const pf = grossLoss ? +(grossWin / grossLoss).toFixed(2) : (wins ? Infinity : 0);

    // Max Drawdown simple
    let peak = -Infinity, dd = 0;
    for (const e of this.equitySeries){ peak = Math.max(peak, e); dd = Math.max(dd, (peak - e) / peak || 0); }
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

// /trader/core/qty_logic.js

/**
 * Calcula la cantidad en base al % de riesgo y la distancia al stop.
 * balance: saldo actual
 * riskPct: % de riesgo por trade (ej: 1 = 1%)
 * slDistance: distancia al stop en precio
 * price: precio de entrada (fallback para slDistance si no se pasa)
 */
export function qtyFromRisk({ balance, riskPct, slDistance, price, minStep = 1e-6 } = {}) {
  const bal = Number(balance || 0);
  const rp  = Number(riskPct || 0) / 100;
  const px  = Number(price || 0);
  const dist = Number(slDistance || (px * 0.01)) || minStep; // fallback: 1% del precio

  const riskAmt = Math.max(0, bal * rp);
  const qty = riskAmt / Math.max(minStep, dist);
  // normaliza a 6 decimales
  return Math.max(0, Number(qty.toFixed(6)));
}

// (opcionales) Exports de compatibilidad:
export default { qtyFromRisk };

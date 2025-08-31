// /trader/logic/config_selector.js
// Devuelve una config simple para la demo (ajústala si quieres otro símbolo/intervalo)
export function selectConfig({ preset = 'ema-rsi', seed = 42 } = {}) {
  return {
    preset,
    symbol: 'BTCUSDT',
    interval: '1h',
    bars: 500,
    seed
  };
}

// (opcional) compat
export default { selectConfig };

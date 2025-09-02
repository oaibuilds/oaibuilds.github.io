// /trader/logic/config_selector.js
// Returns a simple config for the demo (adjust if you want another symbol/interval)
export function selectConfig({ preset = 'ema-rsi', seed = 42 } = {}) {
  return {
    preset,
    symbol: 'BTCUSDT',
    interval: '1h',
    bars: 500,
    seed
  };
}

// (optional) compatibility export
export default { selectConfig };

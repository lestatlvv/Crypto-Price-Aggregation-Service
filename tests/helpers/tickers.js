'use strict';

function ticker({
  base,
  target = 'USDT',
  last,
  exchange,
  coinId,
  targetCoinId,
  volume = 1_000_000,
  isStale = false,
  isAnomaly = false
}) {
  return {
    base,
    target,
    last,
    volume,
    market: exchange
      ? {
        name: exchange,
        identifier: exchange,
        has_trading_incentive: false
      }
      : undefined,
    converted_last: { usd: last },
    trust_score: isAnomaly ? 'red' : 'green',
    is_anomaly: isAnomaly,
    is_stale: isStale,
    coin_id: coinId,
    target_coin_id: targetCoinId ?? (target === 'USDT' ? 'tether' : undefined)
  };
}

module.exports = {
  ticker
};

'use strict';

const MARKETS = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1, current_price: 84645.53 },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', market_cap_rank: 2, current_price: 2683.83 },
  { id: 'tether', symbol: 'usdt', name: 'Tether', market_cap_rank: 3, current_price: 1 },
  { id: 'binancecoin', symbol: 'bnb', name: 'BNB', market_cap_rank: 4, current_price: 765.52 },
  { id: 'ripple', symbol: 'xrp', name: 'XRP', market_cap_rank: 5, current_price: 1.48413 },
  { id: 'usd-coin', symbol: 'usdc', name: 'USDC', market_cap_rank: 6, current_price: 1.00015 },
  { id: 'solana', symbol: 'sol', name: 'Solana', market_cap_rank: 7, current_price: 188.42 }
];

const EXCHANGES = [
  { id: 'binance', name: 'Binance', trust_score_rank: 1 },
  { id: 'gdax', name: 'Coinbase Exchange', trust_score_rank: 2 },
  { id: 'kraken', name: 'Kraken', trust_score_rank: 3 },
  { id: 'okex', name: 'OKX', trust_score_rank: 4 },
  { id: 'gate', name: 'Gate.io', trust_score_rank: 5 },
  { id: 'bitget', name: 'Bitget', trust_score_rank: 6 },
  { id: 'bybit_spot', name: 'Bybit', trust_score_rank: 10 },
  { id: 'binance_futures', name: 'Binance Futures', trust_score_rank: 21 }
];

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
  const now = new Date().toISOString();

  return {
    base,
    target,
    last,
    volume,
    market: {
      name: exchange,
      identifier: exchange,
      has_trading_incentive: false
    },
    converted_last: { usd: last },
    trust_score: isAnomaly ? 'red' : 'green',
    timestamp: now,
    last_traded_at: now,
    last_fetch_at: now,
    is_anomaly: isAnomaly,
    is_stale: isStale,
    coin_id: coinId,
    target_coin_id: targetCoinId ?? (target === 'USDT' ? 'tether' : undefined)
  };
}

const TICKERS_BY_COIN = {
  bitcoin: [
    ticker({ base: 'BTC', last: 84596.34, exchange: 'binance', coinId: 'bitcoin', volume: 9_000_000 }),
    ticker({ base: 'BTC', last: 84614.5, exchange: 'okex', coinId: 'bitcoin', volume: 4_000_000 }),
    ticker({ base: 'BTC', last: 84605.7, exchange: 'gate', coinId: 'bitcoin', volume: 2_000_000 }),
    ticker({ base: 'BTC', last: 84610.2, exchange: 'bybit_spot', coinId: 'bitcoin', volume: 1_800_000 }),
    ticker({ base: 'BTC', target: 'USD', last: 84620, exchange: 'gdax', coinId: 'bitcoin', volume: 5_000_000 }),
    ticker({ base: 'BTC', last: 1, exchange: 'binance_futures', coinId: 'bitcoin', volume: 12_000_000 }),
    ticker({ base: 'BTC', last: 84000, exchange: 'kraken', coinId: 'bitcoin', isStale: true }),
    ticker({ base: 'WBTC', last: 84500, exchange: 'binance', coinId: 'wrapped-bitcoin' })
  ],
  ethereum: [
    ticker({ base: 'ETH', last: 2682.04, exchange: 'binance', coinId: 'ethereum', volume: 6_000_000 }),
    ticker({ base: 'ETH', last: 2682.27, exchange: 'okex', coinId: 'ethereum', volume: 3_000_000 }),
    ticker({ base: 'ETH', last: 2681.99, exchange: 'gate', coinId: 'ethereum', volume: 1_500_000 }),
    ticker({ base: 'ETH', target: 'USD', last: 2683, exchange: 'gdax', coinId: 'ethereum' })
  ],
  binancecoin: [
    ticker({ base: 'BNB', last: 765.49, exchange: 'binance', coinId: 'bnb', volume: 3_000_000 }),
    ticker({ base: 'BNB', last: 765.5, exchange: 'okex', coinId: 'bnb', volume: 1_200_000 }),
    ticker({ base: 'BNB', last: 765.4, exchange: 'gate', coinId: 'bnb', volume: 900_000 }),
    ticker({ base: 'BNB', last: 700, exchange: 'bitget', coinId: 'bnb', isAnomaly: true })
  ],
  ripple: [
    ticker({ base: 'XRP', last: 1.4828, exchange: 'binance', coinId: 'xrp', volume: 2_000_000 }),
    ticker({ base: 'XRP', last: 1.4825, exchange: 'okex', coinId: 'xrp', volume: 800_000 }),
    ticker({ base: 'XRP', last: 1.4827, exchange: 'gate', coinId: 'xrp', volume: 600_000 })
  ],
  'usd-coin': [
    ticker({ base: 'USDC', last: 1.00015, exchange: 'binance', coinId: 'usdc', volume: 4_000_000 }),
    ticker({ base: 'USDC', last: 1.00017, exchange: 'okex', coinId: 'usdc', volume: 1_100_000 }),
    ticker({ base: 'USDC', last: 1.00015, exchange: 'bitget', coinId: 'usdc', volume: 700_000 }),
    ticker({ base: 'BTC', target: 'USDC', last: 84600, exchange: 'binance', coinId: 'bitcoin', targetCoinId: 'usd-coin' })
  ]
};

module.exports = {
  MARKETS,
  EXCHANGES,
  TICKERS_BY_COIN
};

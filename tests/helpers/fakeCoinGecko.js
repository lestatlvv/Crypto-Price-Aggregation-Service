'use strict';

const { ticker } = require('./tickers');

const DEFAULT_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 }
];

const DEFAULT_EXCHANGES = [
  { id: 'binance', name: 'Binance', trustScoreRank: 1 },
  { id: 'okex', name: 'OKX', trustScoreRank: 2 },
  { id: 'bybit_spot', name: 'Bybit', trustScoreRank: 3 }
];

function createFakeCoinGeckoClient(overrides = {}) {
  return {
    async getTopCoinsByMarketCap() {
      if (overrides.getTopCoinsByMarketCap) {
        return overrides.getTopCoinsByMarketCap();
      }

      return overrides.coins || DEFAULT_COINS;
    },

    async getTopExchanges() {
      if (overrides.getTopExchanges) {
        return overrides.getTopExchanges();
      }

      return overrides.exchanges || DEFAULT_EXCHANGES;
    },

    async getCoinTickers(coinId) {
      if (overrides.getCoinTickers) {
        return overrides.getCoinTickers(coinId);
      }

      if (overrides.tickersByCoin) {
        return overrides.tickersByCoin[coinId] || [];
      }

      return [
        ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' }),
        ticker({ base: 'BTC', last: 101, exchange: 'okex', coinId: 'bitcoin' }),
        ticker({ base: 'BTC', last: 99, exchange: 'bybit_spot', coinId: 'bitcoin' })
      ];
    }
  };
}

module.exports = {
  createFakeCoinGeckoClient,
  DEFAULT_COINS,
  DEFAULT_EXCHANGES
};

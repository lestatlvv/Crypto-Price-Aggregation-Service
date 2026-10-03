'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { selectTopExchangePrices } = require('../../src/domain/price/selectExchangeTickers');
const { ticker } = require('../helpers/tickers');
const { EXCHANGES, TICKERS_BY_COIN } = require('../../src/mock/fixtures');

const bitcoin = { id: 'bitcoin', symbol: 'BTC' };
const rankedExchanges = EXCHANGES.map((exchange) => ({
  id: exchange.id,
  name: exchange.name,
  trustScoreRank: exchange.trust_score_rank
}));

describe('selectTopExchangePrices', () => {
  it('selects the top 3 valid CoinGecko-ranked USDT exchanges', () => {
    const selected = selectTopExchangePrices(TICKERS_BY_COIN.bitcoin, bitcoin, rankedExchanges);

    assert.deepEqual(selected.map((item) => item.id), ['binance', 'okex', 'gate']);
    assert.equal(selected[0].price, 84596.34);
  });

  it('persists a partial set when only 2 valid exchanges exist', () => {
    const selected = selectTopExchangePrices([
      ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: 101, exchange: 'okex', coinId: 'bitcoin' })
    ], bitcoin, rankedExchanges);

    assert.equal(selected.length, 2);
  });

  it('deduplicates by exchange and keeps the first eligible ticker', () => {
    const selected = selectTopExchangePrices([
      ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: 200, exchange: 'binance', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: 101, exchange: 'okex', coinId: 'bitcoin' })
    ], bitcoin, rankedExchanges);

    assert.deepEqual(selected, [
      { id: 'binance', price: 100 },
      { id: 'okex', price: 101 }
    ]);
  });

  it('rejects stale, anomalous, invalid, and non-USDT tickers', () => {
    const selected = selectTopExchangePrices([
      ticker({ base: 'BTC', last: 84000, exchange: 'kraken', coinId: 'bitcoin', isStale: true }),
      ticker({ base: 'BTC', last: 700, exchange: 'bitget', coinId: 'bitcoin', isAnomaly: true }),
      ticker({ base: 'BTC', last: 0, exchange: 'binance', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: -1, exchange: 'okex', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: 'abc', exchange: 'gate', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', target: 'USD', last: 84620, exchange: 'gdax', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: 1, exchange: 'binance_futures', coinId: 'bitcoin' }),
      ticker({ base: 'BTC', last: 100, exchange: undefined, coinId: 'bitcoin' })
    ], bitcoin, rankedExchanges);

    assert.deepEqual(selected, []);
  });

  it('returns no exchanges when the coin has no USDT market', () => {
    const selected = selectTopExchangePrices([
      ticker({ base: 'BTC', target: 'USD', last: 84620, exchange: 'gdax', coinId: 'bitcoin' })
    ], bitcoin, rankedExchanges);

    assert.deepEqual(selected, []);
  });
});

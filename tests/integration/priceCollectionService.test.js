'use strict';

const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { startTestMongo, stopTestMongo, clearSamples } = require('../helpers/mongo');
const { createFakeCoinGeckoClient } = require('../helpers/fakeCoinGecko');
const { ticker } = require('../helpers/tickers');
const { createPriceRepository } = require('../../src/infrastructure/mongodb/priceRepository');
const { createPriceCollectionService } = require('../../src/services/priceCollectionService');
const { PriceSample } = require('../../src/models/priceSample');

describe('priceCollectionService', () => {
  const priceRepository = createPriceRepository();

  before(async () => {
    await startTestMongo();
  });

  after(async () => {
    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearSamples();
  });

  it('persists an average from 3 valid exchanges', async () => {
    const service = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient()
    });

    const summary = await service.collect();
    const stored = await PriceSample.findOne({ pair: 'BTC/USDT' }).lean();

    assert.equal(summary.status, 'completed');
    assert.equal(summary.collected, 1);
    assert.equal(stored.price, 100);
    assert.equal(stored.quality.actualSources, 3);
    assert.deepEqual(stored.exchanges.map((item) => item.id), ['binance', 'okx', 'bybit_spot']);
  });

  it('persists a partial sample when only 2 exchanges are valid', async () => {
    const service = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient({
        tickersByCoin: {
          bitcoin: [
            ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' }),
            ticker({ base: 'BTC', last: 110, exchange: 'okex', coinId: 'bitcoin' }),
            ticker({ base: 'BTC', last: 1, exchange: 'bybit_spot', coinId: 'bitcoin', isStale: true })
          ]
        }
      })
    });

    const summary = await service.collect();
    const stored = await PriceSample.findOne({ pair: 'BTC/USDT' }).lean();

    assert.equal(summary.status, 'completed');
    assert.equal(stored.price, 105);
    assert.equal(stored.quality.actualSources, 2);
  });

  it('does not persist a coin with no usable exchanges and continues the run', async () => {
    const service = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient({
        coins: [
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 },
          { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', marketCapRank: 2 }
        ],
        tickersByCoin: {
          bitcoin: [
            ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' })
          ],
          ethereum: [
            ticker({ base: 'ETH', target: 'USD', last: 2600, exchange: 'gdax', coinId: 'ethereum' })
          ]
        }
      })
    });

    const summary = await service.collect();
    const count = await PriceSample.countDocuments();

    assert.equal(summary.status, 'partial');
    assert.equal(summary.collected, 1);
    assert.deepEqual(summary.failed, [{ coinId: 'ethereum', reason: 'NO_USABLE_EXCHANGES' }]);
    assert.equal(count, 1);
  });

  it('classifies a timeout as a per-coin failure without aborting other coins', async () => {
    const service = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient({
        coins: [
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 },
          { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', marketCapRank: 2 }
        ],
        async getCoinTickers(coinId) {
          if (coinId === 'ethereum') {
            throw new Error('CoinGecko request timed out after 5000ms: /coins/ethereum/tickers');
          }

          return [
            ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' })
          ];
        }
      })
    });

    const summary = await service.collect();
    assert.equal(summary.status, 'partial');
    assert.equal(summary.collected, 1);
    assert.deepEqual(summary.failed, [{ coinId: 'ethereum', reason: 'UPSTREAM_TIMEOUT' }]);
  });

  it('rejects overlapping collection runs', async () => {
    let release;
    const started = new Promise((resolve) => {
      release = resolve;
    });

    const service = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient({
        async getTopCoinsByMarketCap() {
          release();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 }];
        }
      })
    });

    const first = service.collect();
    await started;
    await assert.rejects(() => service.collect(), { code: 'COLLECTION_ALREADY_RUNNING' });
    const summary = await first;
    assert.equal(summary.status, 'completed');
  });

  it('uses one timestamp for every sample in a run', async () => {
    let nowCalls = 0;
    const service = createPriceCollectionService({
      priceRepository,
      now: () => new Date(1_760_000_000_000 + (++nowCalls) * 1000),
      coinGeckoClient: createFakeCoinGeckoClient({
        coins: [
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 },
          { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', marketCapRank: 2 }
        ],
        tickersByCoin: {
          bitcoin: [
            ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' })
          ],
          ethereum: [
            ticker({ base: 'ETH', last: 200, exchange: 'binance', coinId: 'ethereum' })
          ]
        }
      })
    });

    await service.collect();
    const samples = await PriceSample.find().sort({ pair: 1 }).lean();

    assert.equal(samples.length, 2);
    assert.equal(samples[0].timestamp.getTime(), samples[1].timestamp.getTime());
  });

  it('caches top coins and exchange ranking between runs', async () => {
    let marketCalls = 0;
    let exchangeCalls = 0;
    const service = createPriceCollectionService({
      priceRepository,
      metadataCacheTtlMs: 60_000,
      coinGeckoClient: createFakeCoinGeckoClient({
        async getTopCoinsByMarketCap() {
          marketCalls += 1;
          return [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 }];
        },
        async getTopExchanges() {
          exchangeCalls += 1;
          return [{ id: 'binance', name: 'Binance', trustScoreRank: 1 }];
        }
      })
    });

    await service.collect();
    await service.collect();

    assert.equal(marketCalls, 1);
    assert.equal(exchangeCalls, 1);
    assert.equal(await PriceSample.countDocuments(), 2);
  });

  it('fails a rate-limited coin immediately and continues the run', async () => {
    const started = Date.now();
    const service = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient({
        coins: [
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 },
          { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', marketCapRank: 2 },
          { id: 'ripple', symbol: 'XRP', name: 'XRP', marketCapRank: 3 }
        ],
        async getCoinTickers(coinId) {
          if (coinId === 'ethereum') {
            throw new Error('CoinGecko 429: rate limited');
          }

          const symbol = coinId === 'ripple' ? 'XRP' : 'BTC';
          return [
            ticker({ base: symbol, last: 100, exchange: 'binance', coinId })
          ];
        }
      })
    });

    const summary = await service.collect();

    assert.ok(Date.now() - started < 200);
    assert.equal(summary.status, 'partial');
    assert.equal(summary.collected, 2);
    assert.deepEqual(summary.failed, [{ coinId: 'ethereum', reason: 'UPSTREAM_RATE_LIMITED' }]);
  });
});


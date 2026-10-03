'use strict';

const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startTestMongo, stopTestMongo, clearSamples } = require('../helpers/mongo');
const { insertSample } = require('../helpers/samples');
const { createFakeCoinGeckoClient } = require('../helpers/fakeCoinGecko');
const { ticker } = require('../helpers/tickers');
const { createApplication } = require('../../src/index');
const { createPriceRepository } = require('../../src/infrastructure/mongodb/priceRepository');
const { createPriceCollectionService } = require('../../src/services/priceCollectionService');
const { startMockServer } = require('../../src/mock/coingeckoServer');
const config = require('../../src/config');
const coinGeckoClient = require('../../src/infrastructure/coingecko/client');

describe('HTTP e2e', () => {
  let app;
  let mockServer;
  let previousBaseUrl;
  let previousRetryCount;
  let previousRetryDelayMs;

  before(async () => {
    await startTestMongo();
    mockServer = await startMockServer(0);
    previousBaseUrl = config.coingecko.baseUrl;
    previousRetryCount = config.coingecko.retryCount;
    previousRetryDelayMs = config.coingecko.retryDelayMs;
    config.coingecko.baseUrl = mockServer.url;
    config.coingecko.retryCount = 1;
    config.coingecko.retryDelayMs = 10;
  });

  after(async () => {
    config.coingecko.baseUrl = previousBaseUrl;
    config.coingecko.retryCount = previousRetryCount;
    config.coingecko.retryDelayMs = previousRetryDelayMs;

    if (mockServer) {
      await mockServer.close();
    }

    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearSamples();
    const application = await createApplication({
      priceRepository: createPriceRepository(),
      coinGeckoClient
    });
    app = application.app;
  });

  it('returns health status', async () => {
    const response = await request(app).get('/health').expect(200);
    assert.equal(response.body.status, 'ok');
  });

  it('returns the latest stored price for requested pairs', async () => {
    await insertSample({
      pair: 'BTC/USDT',
      price: 67231.42,
      timestamp: new Date('2026-10-03T08:00:00.000Z'),
      exchanges: [{ id: 'binance', price: 67230.1 }]
    });
    await insertSample({
      pair: 'ETH/USDT',
      coinId: 'ethereum',
      price: 2683.83,
      timestamp: new Date('2026-10-03T08:05:00.000Z'),
      exchanges: [{ id: 'okx', price: 2683.83 }]
    });

    const response = await request(app)
      .get('/prices/latest')
      .query({ pairs: 'BTC/USDT,ETH/USDT' })
      .expect(200);

    assert.deepEqual(response.body, {
      data: [
        {
          pair: 'BTC/USDT',
          price: 67231.42,
          timestamp: '2026-10-03T08:00:00.000Z',
          sources: [{ exchange: 'binance', price: 67230.1 }]
        },
        {
          pair: 'ETH/USDT',
          price: 2683.83,
          timestamp: '2026-10-03T08:05:00.000Z',
          sources: [{ exchange: 'okx', price: 2683.83 }]
        }
      ]
    });
  });

  it('returns historical prices ordered by timestamp', async () => {
    await insertSample({
      price: 10,
      timestamp: new Date('2026-10-03T08:00:00.000Z')
    });
    await insertSample({
      price: 20,
      timestamp: new Date('2026-10-03T09:00:00.000Z')
    });

    const response = await request(app)
      .get('/prices/history')
      .query({
        pairs: 'BTC/USDT',
        from: Date.parse('2026-10-03T08:00:00.000Z'),
        to: Date.parse('2026-10-03T09:00:00.000Z')
      })
      .expect(200);

    assert.deepEqual(response.body.data.map((item) => item.price), [10, 20]);
    assert.equal(response.body.data[0].timestamp, '2026-10-03T08:00:00.000Z');
  });

  it('returns an empty result for a valid pair with no stored data', async () => {
    const response = await request(app)
      .get('/prices/latest')
      .query({ pairs: 'SOL/USDT' })
      .expect(200);

    assert.deepEqual(response.body, { data: [] });
  });

  it('rejects invalid pairs', async () => {
    const response = await request(app)
      .get('/prices/latest')
      .query({ pairs: 'BTCUSD' })
      .expect(400);

    assert.deepEqual(response.body, {
      error: {
        code: 'INVALID_PAIR',
        message: 'Invalid pair: BTCUSD'
      }
    });
  });

  it('rejects an invalid historical time range', async () => {
    const inverted = await request(app)
      .get('/prices/history')
      .query({
        pairs: 'BTC/USDT',
        from: 200,
        to: 100
      })
      .expect(400);

    assert.equal(inverted.body.error.code, 'INVALID_TIME_RANGE');

    const nonNumeric = await request(app)
      .get('/prices/history')
      .query({
        pairs: 'BTC/USDT',
        from: 'yesterday',
        to: '100'
      })
      .expect(400);

    assert.equal(nonNumeric.body.error.code, 'INVALID_TIME_RANGE');
  });

  it('triggers collection against the CoinGecko mock and stores prices', async () => {
    const response = await request(app)
      .post('/collection/run')
      .expect(200);

    assert.equal(response.body.status, 'completed');
    assert.equal(response.body.collected, 5);
    assert.deepEqual(response.body.failed, []);

    const latest = await request(app)
      .get('/prices/latest')
      .query({ pairs: 'BTC/USDT' })
      .expect(200);

    assert.equal(latest.body.data[0].pair, 'BTC/USDT');
    assert.equal(typeof latest.body.data[0].price, 'number');
    assert.ok(latest.body.data[0].sources.length > 0);
  });

  it('maps application errors to structured HTTP responses', async () => {
    const priceRepository = createPriceRepository();
    let release;
    const started = new Promise((resolve) => {
      release = resolve;
    });

    const priceCollectionService = createPriceCollectionService({
      priceRepository,
      coinGeckoClient: createFakeCoinGeckoClient({
        async getTopCoinsByMarketCap() {
          release();
          await new Promise((resolve) => setTimeout(resolve, 150));
          return [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 }];
        },
        tickersByCoin: {
          bitcoin: [
            ticker({ base: 'BTC', last: 100, exchange: 'binance', coinId: 'bitcoin' })
          ]
        }
      })
    });

    const application = await createApplication({
      priceRepository,
      priceCollectionService
    });

    const first = request(application.app).post('/collection/run');
    const firstResult = first.then((response) => response);
    await started;

    const conflict = await request(application.app)
      .post('/collection/run')
      .expect(409);

    assert.deepEqual(conflict.body, {
      error: {
        code: 'COLLECTION_ALREADY_RUNNING',
        message: 'A collection run is already in progress'
      }
    });

    const completed = await firstResult;
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'completed');
  });
});

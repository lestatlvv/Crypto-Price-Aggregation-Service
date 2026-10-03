'use strict';

const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { startTestMongo, stopTestMongo, clearSamples } = require('../helpers/mongo');
const { insertSample } = require('../helpers/samples');
const { createPriceRepository } = require('../../src/infrastructure/mongodb/priceRepository');

describe('priceRepository', () => {
  const repository = createPriceRepository();

  before(async () => {
    await startTestMongo();
  });

  after(async () => {
    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearSamples();
  });

  it('returns the latest sample for each requested pair', async () => {
    await insertSample({
      pair: 'BTC/USDT',
      price: 10,
      timestamp: new Date('2026-10-03T08:00:00.000Z')
    });
    await insertSample({
      pair: 'BTC/USDT',
      price: 20,
      timestamp: new Date('2026-10-03T09:00:00.000Z')
    });
    await insertSample({
      pair: 'ETH/USDT',
      coinId: 'ethereum',
      price: 30,
      timestamp: new Date('2026-10-03T09:30:00.000Z')
    });

    const latest = await repository.findLatestByPairs(['ETH/USDT', 'BTC/USDT']);
    assert.equal(latest.length, 2);
    assert.equal(latest.find((item) => item.pair === 'BTC/USDT').price, 20);
    assert.equal(latest.find((item) => item.pair === 'ETH/USDT').price, 30);
  });

  it('returns historical samples ordered by timestamp ascending', async () => {
    await insertSample({
      price: 10,
      timestamp: new Date('2026-10-03T08:00:00.000Z')
    });
    await insertSample({
      price: 20,
      timestamp: new Date('2026-10-03T09:00:00.000Z')
    });
    await insertSample({
      pair: 'ETH/USDT',
      coinId: 'ethereum',
      price: 30,
      timestamp: new Date('2026-10-03T08:30:00.000Z')
    });

    const history = await repository.findHistoricalByPairs(
      ['BTC/USDT'],
      Date.parse('2026-10-03T08:00:00.000Z'),
      Date.parse('2026-10-03T09:00:00.000Z')
    );

    assert.deepEqual(history.map((item) => item.price), [10, 20]);
  });
});

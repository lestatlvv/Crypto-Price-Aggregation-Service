'use strict';

const { createPriceSample } = require('../../src/models/priceSample');
const { PriceSample } = require('../../src/models/priceSample');

function sample(overrides = {}) {
  return createPriceSample({
    pair: 'BTC/USDT',
    coinId: 'bitcoin',
    price: 67231.42,
    timestamp: new Date('2026-10-03T08:00:00.000Z'),
    exchanges: [
      { id: 'binance', price: 67230.1 },
      { id: 'okx', price: 67233.12 }
    ],
    expectedSources: 3,
    ...overrides
  });
}

async function insertSample(overrides = {}) {
  const document = sample(overrides);
  await PriceSample.create(document);
  return document;
}

module.exports = {
  sample,
  insertSample
};

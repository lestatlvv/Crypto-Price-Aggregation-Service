'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRpcHandlers } = require('../../src/rpc/handlers');
const { encode, decode } = require('../../src/rpc/codec');

function createFakeQueryService() {
  return {
    async getLatestPrices(pairs) {
      return pairs.map((pair) => ({
        pair,
        price: 100,
        timestamp: new Date('2026-10-03T08:00:00.000Z'),
        sources: [{ exchange: 'binance', price: 100 }]
      }));
    },
    async getHistoricalPrices(pairs, from, to) {
      return [{
        pair: pairs[0],
        price: 101,
        timestamp: new Date(from),
        sources: [{ exchange: 'okx', price: 101 }],
        from,
        to
      }];
    }
  };
}

describe('RPC handlers', () => {
  it('encodes getLatestPrices responses', async () => {
    const handlers = createRpcHandlers(createFakeQueryService());
    const response = decode(await handlers.getLatestPrices(encode({
      pairs: ['BTC/USDT']
    })));

    assert.equal(response.data[0].pair, 'BTC/USDT');
    assert.equal(response.data[0].timestamp, Date.parse('2026-10-03T08:00:00.000Z'));
  });

  it('encodes getHistoricalPrices responses', async () => {
    const handlers = createRpcHandlers(createFakeQueryService());
    const response = decode(await handlers.getHistoricalPrices(encode({
      pairs: ['ETH/USDT'],
      from: 1,
      to: 2
    })));

    assert.equal(response.data[0].pair, 'ETH/USDT');
    assert.equal(response.data[0].price, 101);
  });
});

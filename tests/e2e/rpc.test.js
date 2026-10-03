'use strict';

const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { startTestMongo, stopTestMongo, clearSamples } = require('../helpers/mongo');
const { insertSample } = require('../helpers/samples');
const { createInProcessRpc } = require('../helpers/inProcessRpc');
const { createPriceRepository } = require('../../src/infrastructure/mongodb/priceRepository');
const { createPriceQueryService } = require('../../src/services/priceQueryService');
const { startRpcServer } = require('../../src/rpc/server');
const { createRpcClient } = require('../../src/rpc/client');

describe('RPC e2e', () => {
  let rpc;
  let rpcServer;
  let client;

  before(async () => {
    await startTestMongo();
    rpc = createInProcessRpc();
    rpcServer = await startRpcServer({
      priceQueryService: createPriceQueryService({
        priceRepository: createPriceRepository()
      }),
      rpc
    });
    client = createRpcClient({
      publicKey: rpcServer.publicKey,
      rpc
    });
  });

  after(async () => {
    if (client) {
      await client.close();
    }

    if (rpcServer) {
      await rpcServer.close();
    }

    if (rpc) {
      await rpc.destroy();
    }

    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearSamples();
  });

  it('returns the latest prices', async () => {
    await insertSample({
      pair: 'BTC/USDT',
      price: 67231.42,
      timestamp: new Date('2026-10-03T08:00:00.000Z'),
      exchanges: [
        { id: 'binance', price: 67230.1 },
        { id: 'okx', price: 67233.12 }
      ]
    });

    const response = await client.getLatestPrices(['BTC/USDT']);

    assert.deepEqual(response, {
      data: [
        {
          pair: 'BTC/USDT',
          price: 67231.42,
          timestamp: Date.parse('2026-10-03T08:00:00.000Z'),
          sources: [
            { exchange: 'binance', price: 67230.1 },
            { exchange: 'okx', price: 67233.12 }
          ]
        }
      ]
    });
  });

  it('returns historical prices', async () => {
    await insertSample({
      price: 10,
      timestamp: new Date('2026-10-03T08:00:00.000Z')
    });
    await insertSample({
      price: 20,
      timestamp: new Date('2026-10-03T09:00:00.000Z')
    });

    const response = await client.getHistoricalPrices(
      ['BTC/USDT'],
      Date.parse('2026-10-03T08:00:00.000Z'),
      Date.parse('2026-10-03T09:00:00.000Z')
    );

    assert.deepEqual(response.data.map((item) => item.price), [10, 20]);
    assert.equal(response.data[0].timestamp, Date.parse('2026-10-03T08:00:00.000Z'));
  });

  it('returns an empty result when no samples exist', async () => {
    const response = await client.getLatestPrices(['SOL/USDT']);
    assert.deepEqual(response, { data: [] });
  });

  it('returns a structured error for an invalid pair', async () => {
    const response = await client.getLatestPrices(['BTCUSD']);
    assert.equal(response.error.code, 'INVALID_PAIR');
    assert.match(response.error.message, /BTCUSD/);
  });

  it('returns a structured error for an invalid time range', async () => {
    const response = await client.getHistoricalPrices(['BTC/USDT'], 200, 100);
    assert.equal(response.error.code, 'INVALID_TIME_RANGE');
  });
});

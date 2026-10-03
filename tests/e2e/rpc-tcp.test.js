'use strict';

const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { startTestMongo, stopTestMongo, clearSamples } = require('../helpers/mongo');
const { insertSample } = require('../helpers/samples');
const { createPriceRepository } = require('../../src/infrastructure/mongodb/priceRepository');
const { createPriceQueryService } = require('../../src/services/priceQueryService');
const { createRpcHandlers } = require('../../src/rpc/handlers');
const { startTcpRpcServer, createTcpRpcClient } = require('../../src/rpc/tcp');

describe('RPC TCP e2e', () => {
  let tcpServer;
  let client;

  before(async () => {
    await startTestMongo();
    tcpServer = await startTcpRpcServer({
      handlers: createRpcHandlers(createPriceQueryService({
        priceRepository: createPriceRepository()
      })),
      host: '127.0.0.1',
      port: 0
    });
    client = createTcpRpcClient({
      host: '127.0.0.1',
      port: tcpServer.port
    });
  });

  after(async () => {
    if (client) {
      await client.close();
    }

    if (tcpServer) {
      await tcpServer.close();
    }

    await stopTestMongo();
  });

  beforeEach(async () => {
    await clearSamples();
  });

  it('returns latest prices over local TCP', async () => {
    await insertSample({
      pair: 'BTC/USDT',
      price: 67231.42,
      timestamp: new Date('2026-10-03T08:00:00.000Z')
    });

    const response = await client.getLatestPrices(['BTC/USDT']);
    assert.equal(response.data[0].pair, 'BTC/USDT');
    assert.equal(response.data[0].price, 67231.42);
  });

  it('returns a structured error for an invalid pair', async () => {
    const response = await client.getLatestPrices(['BTCUSD']);
    assert.equal(response.error.code, 'INVALID_PAIR');
  });
});

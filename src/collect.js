'use strict';

const config = require('./config');
const logger = require('./logger');
const { collectPrices } = require('./priceCollector');
const { ensureMockServer } = require('./mock/coingeckoServer');

async function main() {
  let mockServer;

  logger.log(`[collector] CoinGecko API mode=${config.coingecko.mode} baseUrl=${config.coingecko.baseUrl}`);

  if (config.coingecko.mode === 'mock') {
    mockServer = await ensureMockServer(config.coingecko.mockPort);
  }

  try {
    await collectPrices();
  } finally {
    if (mockServer) {
      await mockServer.close();
    }
  }
}

main().catch((error) => {
  logger.error(`[collector] failed: ${error.message}`);
  process.exitCode = 1;
});

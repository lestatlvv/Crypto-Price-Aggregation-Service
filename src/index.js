'use strict';

const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./http/app');
const { connectMongo, disconnectMongo } = require('./infrastructure/mongodb/client');
const { createPriceRepository } = require('./infrastructure/mongodb/priceRepository');
const { createPriceCollectionService } = require('./services/priceCollectionService');
const { createPriceQueryService } = require('./services/priceQueryService');
const { startScheduler } = require('./jobs/scheduler');
const { startRpcServer } = require('./rpc/server');
const { ensureMockServer } = require('./mock/coingeckoServer');
const coinGeckoClient = require('./infrastructure/coingecko/client');

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => resolve(server));
    server.once('error', reject);
  });
}

function closeHttp(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function createApplication(overrides = {}) {
  const priceRepository = overrides.priceRepository || createPriceRepository();
  const client = overrides.coinGeckoClient || coinGeckoClient;
  const priceCollectionService = overrides.priceCollectionService
    || createPriceCollectionService({
      coinGeckoClient: client,
      priceRepository
    });
  const priceQueryService = overrides.priceQueryService
    || createPriceQueryService({ priceRepository });
  const app = createApp({ priceQueryService, priceCollectionService });

  return {
    app,
    priceRepository,
    priceCollectionService,
    priceQueryService
  };
}

async function start(overrides = {}) {
  const cfg = overrides.config || config;

  await connectMongo(cfg.mongodb.uri, cfg.mongodb.dbName);

  let mockServer;
  if (cfg.coingecko.mode === 'mock') {
    mockServer = await ensureMockServer(cfg.coingecko.mockPort);
    if (mockServer.url) {
      cfg.coingecko.baseUrl = mockServer.url;
    }
  }

  const application = await createApplication(overrides);
  const server = await listen(application.app, cfg.port);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : cfg.port;

  let rpcServer;
  if (cfg.rpc.enabled) {
    rpcServer = await startRpcServer({
      priceQueryService: application.priceQueryService,
      publicKeyFile: cfg.rpc.publicKeyFile,
      bootstrap: cfg.rpc.bootstrap.length > 0 ? cfg.rpc.bootstrap : undefined,
      tcpHost: cfg.rpc.tcpHost,
      tcpPort: cfg.rpc.tcpPort,
      tcpEndpointFile: cfg.rpc.tcpEndpointFile
    });
  }

  const scheduler = startScheduler(
    () => application.priceCollectionService.collect(),
    cfg.collection.intervalMs,
    {
      getDelayMs: () => Math.max(
        cfg.collection.intervalMs,
        coinGeckoClient.getCooldownRemainingMs ? coinGeckoClient.getCooldownRemainingMs() : 0
      )
    }
  );

  logger.event('service_started', {
    port,
    rpc: Boolean(rpcServer),
    coingeckoMode: cfg.coingecko.mode,
    collectionIntervalMs: cfg.collection.intervalMs,
    callsPerMinute: cfg.coingecko.callsPerMinute
  });

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    scheduler.stop();
    await closeHttp(server);

    if (rpcServer) {
      await rpcServer.close();
    }

    if (mockServer) {
      await mockServer.close();
    }

    await disconnectMongo();
  }

  return {
    ...application,
    server,
    port,
    rpcServer,
    shutdown
  };
}

async function main() {
  const runtime = await start();

  const onSignal = async (signal) => {
    logger.event('service_stopping', { signal });
    await runtime.shutdown();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    onSignal('SIGINT').catch((error) => {
      logger.error(error.message);
      process.exit(1);
    });
  });
  process.once('SIGTERM', () => {
    onSignal('SIGTERM').catch((error) => {
      logger.error(error.message);
      process.exit(1);
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(`[service] failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createApplication,
  start
};

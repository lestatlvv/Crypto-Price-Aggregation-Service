'use strict';

const fs = require('fs/promises');
const path = require('path');
const RPC = require('@hyperswarm/rpc');
const logger = require('../logger');
const { createRpcHandlers } = require('./handlers');
const { startLocalBootstrap } = require('./dht');
const { startTcpRpcServer } = require('./tcp');

async function writePublicKey(publicKeyFile, publicKey, bootstrap) {
  if (!publicKeyFile) {
    return;
  }

  await fs.writeFile(publicKeyFile, publicKey, 'utf8');

  if (bootstrap && bootstrap.length > 0) {
    await fs.writeFile(`${publicKeyFile}.bootstrap`, bootstrap.join(','), 'utf8');
  }
}

async function startRpcServer({
  priceQueryService,
  publicKeyFile,
  bootstrap,
  dht,
  rpc: existingRpc,
  tcpHost,
  tcpPort,
  tcpEndpointFile
} = {}) {
  let localBootstrap;

  if (!existingRpc && !dht && Array.isArray(bootstrap) && bootstrap[0] === 'local') {
    localBootstrap = await startLocalBootstrap();
    bootstrap = localBootstrap.bootstrap;
    logger.event('rpc_local_bootstrap', { bootstrap });
  }

  const rpc = existingRpc || new RPC({ bootstrap, dht });
  const ownsRpc = !existingRpc;
  const server = rpc.createServer();
  const handlers = createRpcHandlers(priceQueryService);

  server.respond('getLatestPrices', (payload) => handlers.getLatestPrices(payload));
  server.respond('getHistoricalPrices', (payload) => handlers.getHistoricalPrices(payload));

  await server.listen();

  const publicKey = server.publicKey.toString('hex');
  await writePublicKey(publicKeyFile, publicKey, bootstrap);

  let tcpServer;

  if (tcpHost) {
    tcpServer = await startTcpRpcServer({
      handlers,
      host: tcpHost,
      port: tcpPort,
      endpointFile: tcpEndpointFile || path.join(process.cwd(), '.rpc-tcp')
    });
  }

  logger.event('rpc_started', {
    publicKey,
    tcp: tcpServer ? tcpServer.endpoint : null,
    methods: ['getLatestPrices', 'getHistoricalPrices']
  });

  return {
    publicKey,
    bootstrap,
    tcp: tcpServer,
    async close() {
      if (tcpServer) {
        await tcpServer.close();
      }

      await server.close();

      if (ownsRpc) {
        await rpc.destroy();
      }

      if (localBootstrap) {
        await localBootstrap.close();
      }
    }
  };
}

module.exports = {
  startRpcServer
};

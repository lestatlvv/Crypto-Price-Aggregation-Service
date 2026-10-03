'use strict';

const fs = require('fs/promises');
const path = require('path');
const RPC = require('@hyperswarm/rpc');
const logger = require('../logger');
const { encode, decode } = require('./codec');
const { parseBootstrap } = require('./dht');
const { createTcpRpcClient, parseEndpoint } = require('./tcp');

function toPublicKeyBuffer(publicKey) {
  if (Buffer.isBuffer(publicKey)) {
    return publicKey;
  }

  return Buffer.from(String(publicKey).trim(), 'hex');
}

async function readPublicKey() {
  if (process.env.RPC_PUBLIC_KEY) {
    return process.env.RPC_PUBLIC_KEY.trim();
  }

  const keyFile = process.env.RPC_PUBLIC_KEY_FILE || path.join(process.cwd(), '.rpc-key');
  return (await fs.readFile(keyFile, 'utf8')).trim();
}

async function readBootstrap(explicitBootstrap) {
  if (explicitBootstrap) {
    return parseBootstrap(explicitBootstrap);
  }

  if (process.env.RPC_BOOTSTRAP && process.env.RPC_BOOTSTRAP !== 'local') {
    return parseBootstrap(process.env.RPC_BOOTSTRAP);
  }

  const keyFile = process.env.RPC_PUBLIC_KEY_FILE || path.join(process.cwd(), '.rpc-key');

  try {
    return parseBootstrap(await fs.readFile(`${keyFile}.bootstrap`, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return undefined;
}

async function readTcpEndpoint() {
  if (process.env.RPC_TCP_ENDPOINT) {
    return process.env.RPC_TCP_ENDPOINT.trim();
  }

  const endpointFile = process.env.RPC_TCP_FILE || path.join(process.cwd(), '.rpc-tcp');

  try {
    return (await fs.readFile(endpointFile, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return null;
}

function createRpcClient({ publicKey, bootstrap, dht, rpc } = {}) {
  const ownsRpc = !rpc;
  const instance = rpc || new RPC({ bootstrap, dht });
  const client = instance.connect(toPublicKeyBuffer(publicKey));

  async function request(method, payload) {
    return decode(await client.request(method, encode(payload || {})));
  }

  async function close() {
    try {
      await client.end();
    } finally {
      if (ownsRpc) {
        await instance.destroy();
      }
    }
  }

  return {
    request,
    getLatestPrices(pairs) {
      return request('getLatestPrices', { pairs });
    },
    getHistoricalPrices(pairs, from, to) {
      return request('getHistoricalPrices', { pairs, from, to });
    },
    close
  };
}

function parsePairsEnv() {
  return String(process.env.RPC_PAIRS || 'BTC/USDT,ETH/USDT')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function createDemoClient() {
  const tcpEndpoint = await readTcpEndpoint();

  if (tcpEndpoint) {
    const { host, port } = parseEndpoint(tcpEndpoint);
    logger.log(`[rpc-client] using local TCP ${tcpEndpoint}`);
    return createTcpRpcClient({ host, port });
  }

  const publicKey = await readPublicKey();
  const bootstrap = await readBootstrap();
  logger.log(`[rpc-client] using Hyperswarm publicKey=${publicKey}`);
  return createRpcClient({ publicKey, bootstrap });
}

async function main() {
  const pairs = parsePairsEnv();
  const client = await createDemoClient();

  try {
    logger.log(`[rpc-client] getLatestPrices pairs=${pairs.join(',')}`);
    const latest = await client.getLatestPrices(pairs);
    logger.log(JSON.stringify(latest, null, 2));

    const to = Date.now();
    const from = to - 60 * 60 * 1000;
    logger.log(`[rpc-client] getHistoricalPrices pairs=${pairs[0]} from=${from} to=${to}`);
    const historical = await client.getHistoricalPrices([pairs[0]], from, to);
    logger.log(JSON.stringify(historical, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(`[rpc-client] failed: ${error.message}`);
    if (/CHANNEL_CLOSED/i.test(error.message)) {
      logger.error('[rpc-client] Hyperswarm DHT could not reach the server. Restart with npm run start:rpc so the local TCP endpoint (.rpc-tcp) is written, then retry.');
    }
    process.exitCode = 1;
  });
}

module.exports = {
  createRpcClient,
  createDemoClient,
  main,
  readPublicKey,
  readBootstrap,
  readTcpEndpoint
};

'use strict';

const net = require('net');
const fs = require('fs/promises');
const logger = require('../logger');
const { encode, decode } = require('./codec');

function encodeFrame(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

function createFrameReader(onMessage) {
  let buffer = Buffer.alloc(0);

  return function onData(chunk) {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (buffer.length < 4 + length) {
        return;
      }

      const body = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);
      onMessage(JSON.parse(body.toString('utf8')));
    }
  };
}

function startTcpRpcServer({ handlers, host = '127.0.0.1', port = 5001, endpointFile } = {}) {
  const server = net.createServer((socket) => {
    const onMessage = createFrameReader(async (message) => {
      try {
        const handler = handlers[message.method];
        if (!handler) {
          socket.write(encodeFrame({
            id: message.id,
            error: { code: 'UNKNOWN_METHOD', message: `Unknown RPC method: ${message.method}` }
          }));
          return;
        }

        const result = decode(await handler(encode(message.payload || {})));
        socket.write(encodeFrame({ id: message.id, result }));
      } catch (error) {
        socket.write(encodeFrame({
          id: message.id,
          error: { code: 'INTERNAL_ERROR', message: error.message }
        }));
      }
    });

    socket.on('data', onMessage);
    socket.on('error', (error) => {
      logger.log(`[rpc-tcp] connection error: ${error.message}`);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, async () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const endpoint = `${host}:${actualPort}`;

      if (endpointFile) {
        await fs.writeFile(endpointFile, endpoint, 'utf8');
      }

      logger.event('rpc_tcp_started', { endpoint });

      resolve({
        endpoint,
        host,
        port: actualPort,
        async close() {
          await new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          });
        }
      });
    });
  });
}

function createTcpRpcClient({ host, port } = {}) {
  let socket;
  let nextId = 1;
  const pending = new Map();

  function connect() {
    if (socket) {
      return socket;
    }

    socket = net.connect({ host, port });
    socket.on('data', createFrameReader((message) => {
      const waiter = pending.get(message.id);
      if (!waiter) {
        return;
      }

      pending.delete(message.id);
      waiter.resolve(message.error || message.result);
    }));
    socket.on('error', (error) => {
      for (const waiter of pending.values()) {
        waiter.reject(error);
      }
      pending.clear();
    });
    socket.on('close', () => {
      for (const waiter of pending.values()) {
        waiter.reject(new Error('TCP RPC connection closed'));
      }
      pending.clear();
      socket = null;
    });

    return socket;
  }

  async function request(method, payload) {
    const connection = connect();
    if (!connection.readyState || connection.readyState === 'opening') {
      await new Promise((resolve, reject) => {
        connection.once('connect', resolve);
        connection.once('error', reject);
      });
    }

    const id = nextId;
    nextId += 1;

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      connection.write(encodeFrame({ id, method, payload }));
    });
  }

  async function close() {
    if (!socket) {
      return;
    }

    const current = socket;
    socket = null;
    await new Promise((resolve) => {
      current.end(resolve);
    });
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

function parseEndpoint(endpoint) {
  const [host, port] = String(endpoint).trim().split(':');
  return { host, port: Number(port) };
}

module.exports = {
  startTcpRpcServer,
  createTcpRpcClient,
  parseEndpoint
};

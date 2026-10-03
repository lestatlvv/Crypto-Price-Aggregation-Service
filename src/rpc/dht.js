'use strict';

const DHT = require('@hyperswarm/dht');

function parseBootstrap(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const items = Array.isArray(value)
    ? value
    : String(value).split(',').map((item) => item.trim()).filter(Boolean);

  if (items.length === 0 || items[0] === 'public') {
    return undefined;
  }

  return items;
}

async function startLocalBootstrap() {
  const node = new DHT({
    ephemeral: true,
    bootstrap: []
  });

  await node.ready();

  const address = node.address();
  const bootstrap = [`127.0.0.1:${address.port}`];

  return {
    bootstrap,
    node,
    async close() {
      await node.destroy();
    }
  };
}

module.exports = {
  parseBootstrap,
  startLocalBootstrap
};

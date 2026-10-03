'use strict';

function encode(value) {
  return Buffer.from(JSON.stringify(value));
}

function decode(payload) {
  if (!payload || payload.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.from(payload).toString('utf8'));
}

function toRpcPrice(item) {
  return {
    pair: item.pair,
    price: item.price,
    timestamp: item.timestamp.getTime(),
    sources: item.sources
  };
}

module.exports = {
  encode,
  decode,
  toRpcPrice
};

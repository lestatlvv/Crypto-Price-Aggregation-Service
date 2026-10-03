'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { averagePrice } = require('../../src/domain/price/average');

describe('averagePrice', () => {
  it('calculates an arithmetic mean and rounds to 8 decimals', () => {
    assert.equal(averagePrice([
      { id: 'binance', price: 100 },
      { id: 'okx', price: 101 },
      { id: 'bybit_spot', price: 99 }
    ]), 100);
  });

  it('returns null when there are no exchanges', () => {
    assert.equal(averagePrice([]), null);
    assert.equal(averagePrice(undefined), null);
  });

  it('supports a single valid exchange', () => {
    assert.equal(averagePrice([{ id: 'binance', price: 67230.1 }]), 67230.1);
  });
});

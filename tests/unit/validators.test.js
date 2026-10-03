'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parsePairs, validateTimeRange } = require('../../src/domain/price/validators');

describe('parsePairs', () => {
  it('accepts comma-separated BASE/USDT pairs', () => {
    assert.deepEqual(parsePairs('BTC/USDT, ETH/USDT'), ['BTC/USDT', 'ETH/USDT']);
  });

  it('accepts an array of valid pairs', () => {
    assert.deepEqual(parsePairs(['SOL/USDT']), ['SOL/USDT']);
  });

  it('rejects lowercase, missing quote, and malformed pairs', () => {
    assert.throws(() => parsePairs('btc/usdt'), { code: 'INVALID_PAIR' });
    assert.throws(() => parsePairs('BTCUSD'), { code: 'INVALID_PAIR' });
    assert.throws(() => parsePairs('BTC/'), { code: 'INVALID_PAIR' });
    assert.throws(() => parsePairs(null), { code: 'INVALID_PAIR' });
    assert.throws(() => parsePairs('123'), { code: 'INVALID_PAIR' });
  });
});

describe('validateTimeRange', () => {
  it('accepts numeric millisecond timestamps', () => {
    assert.deepEqual(validateTimeRange('1760000000000', '1760003600000'), {
      from: 1760000000000,
      to: 1760003600000
    });
  });

  it('rejects from greater than to', () => {
    assert.throws(() => validateTimeRange(200, 100), { code: 'INVALID_TIME_RANGE' });
  });

  it('rejects non-numeric timestamps', () => {
    assert.throws(() => validateTimeRange('yesterday', '100'), { code: 'INVALID_TIME_RANGE' });
    assert.throws(() => validateTimeRange('', '100'), { code: 'INVALID_TIME_RANGE' });
  });
});

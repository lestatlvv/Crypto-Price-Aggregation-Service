'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseBootstrap } = require('../../src/rpc/dht');

describe('parseBootstrap', () => {
  it('returns undefined for public or empty values', () => {
    assert.equal(parseBootstrap(undefined), undefined);
    assert.equal(parseBootstrap(''), undefined);
    assert.equal(parseBootstrap('public'), undefined);
  });

  it('parses comma-separated bootstrap nodes', () => {
    assert.deepEqual(parseBootstrap('127.0.0.1:30001,127.0.0.1:30002'), [
      '127.0.0.1:30001',
      '127.0.0.1:30002'
    ]);
  });
});

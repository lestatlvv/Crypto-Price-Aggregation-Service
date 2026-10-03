'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../../src/logger');
const { startScheduler } = require('../../src/jobs/scheduler');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('scheduler', () => {
  let scheduler;
  const originalEvent = logger.event;

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
      scheduler = null;
    }

    logger.event = originalEvent;
  });

  it('starts the next run after the previous run finishes plus the interval', async () => {
    const startedAt = [];
    let resolveSecond;
    const secondStarted = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    scheduler = startScheduler(async () => {
      startedAt.push(Date.now());
      if (startedAt.length === 1) {
        await sleep(40);
      }

      if (startedAt.length === 2) {
        resolveSecond();
      }
    }, 20);

    await secondStarted;
    scheduler.stop();

    assert.ok(startedAt[1] - startedAt[0] >= 50);
  });

  it('logs overlap as collection_skipped instead of collection_failed', async () => {
    const events = [];
    logger.event = (name, fields) => events.push({ name, ...fields });

    scheduler = startScheduler(async () => {
      const error = new Error('A collection run is already in progress');
      error.code = 'COLLECTION_ALREADY_RUNNING';
      throw error;
    }, 10);

    await sleep(25);
    scheduler.stop();

    assert.ok(events.some((event) => event.name === 'collection_skipped'));
    assert.equal(events.some((event) => event.name === 'collection_failed'), false);
  });
});

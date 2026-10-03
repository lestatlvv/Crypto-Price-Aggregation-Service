'use strict';

const logger = require('../logger');

function startScheduler(collect, intervalMs, options = {}) {
  let stopped = false;
  let timer;

  function nextDelay() {
    if (typeof options.getDelayMs === 'function') {
      return Math.max(intervalMs, Number(options.getDelayMs()) || 0);
    }

    return intervalMs;
  }

  async function tick() {
    if (stopped) {
      return;
    }

    try {
      await collect();
    } catch (error) {
      if (error.code === 'COLLECTION_ALREADY_RUNNING') {
        logger.event('collection_skipped', {
          code: error.code,
          message: error.message
        });
      } else {
        logger.event('collection_failed', {
          code: error.code || 'COLLECTION_FAILED',
          message: error.message
        });
      }
    }

    if (!stopped) {
      timer = setTimeout(tick, nextDelay());
    }
  }

  timer = setTimeout(tick, nextDelay());

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    }
  };
}

module.exports = {
  startScheduler
};

'use strict';

const logger = require('./logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRateLimiter({ maxCalls, windowMs }) {
  const callTimes = [];

  function prune(now) {
    while (callTimes.length > 0 && callTimes[0] <= now - windowMs) {
      callTimes.shift();
    }
  }

  async function schedule(label) {
    const now = Date.now();
    prune(now);

    if (callTimes.length >= maxCalls) {
      const waitMs = callTimes[0] + windowMs - now;
      logger.log(`[rate-limit] ${maxCalls} calls/min reached; waiting ${Math.ceil(waitMs / 1000)}s (${label})`);
      await sleep(waitMs);
      return schedule(label);
    }

    callTimes.push(Date.now());
    logger.log(`[rate-limit] CoinGecko ${callTimes.length}/${maxCalls} calls/min (${label})`);
  }

  return { schedule };
}

module.exports = {
  createRateLimiter,
  sleep
};

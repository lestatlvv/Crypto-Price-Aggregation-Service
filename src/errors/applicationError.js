'use strict';

const STATUS_BY_CODE = {
  INVALID_PAIR: 400,
  INVALID_TIME_RANGE: 400,
  RESULT_TOO_LARGE: 400,
  COLLECTION_ALREADY_RUNNING: 409,
  UPSTREAM_TIMEOUT: 502,
  UPSTREAM_RATE_LIMITED: 502,
  UPSTREAM_FAILURE: 502,
  DATABASE_ERROR: 500
};

class ApplicationError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.status = options.status || STATUS_BY_CODE[code] || 500;
    this.details = options.details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message
      }
    };
  }
}

function classifyUpstreamError(error) {
  if (error instanceof ApplicationError) {
    return error;
  }

  const message = error && error.message ? error.message : 'Upstream request failed';

  if (error && error.name === 'AbortError' || /timed out/i.test(message)) {
    return new ApplicationError('UPSTREAM_TIMEOUT', message);
  }

  if (/CoinGecko 429/.test(message) || /rate limit/i.test(message)) {
    return new ApplicationError('UPSTREAM_RATE_LIMITED', message);
  }

  return new ApplicationError('UPSTREAM_FAILURE', message);
}

module.exports = {
  ApplicationError,
  classifyUpstreamError,
  STATUS_BY_CODE
};

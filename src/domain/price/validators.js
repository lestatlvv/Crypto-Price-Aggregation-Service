'use strict';

const { ValidationError } = require('../../errors/validationError');

const PAIR_PATTERN = /^[A-Z0-9]+\/USDT$/;

function parsePairs(input) {
  let values;

  if (typeof input === 'string') {
    values = input.split(',').map((value) => value.trim()).filter(Boolean);
  } else if (Array.isArray(input)) {
    values = input.map((value) => String(value ?? '').trim()).filter(Boolean);
  } else {
    throw new ValidationError('INVALID_PAIR', 'pairs is required');
  }

  if (values.length === 0) {
    throw new ValidationError('INVALID_PAIR', 'pairs is required');
  }

  for (const pair of values) {
    if (!PAIR_PATTERN.test(pair)) {
      throw new ValidationError('INVALID_PAIR', `Invalid pair: ${pair}`);
    }
  }

  return values;
}

function parseUnixMs(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError('INVALID_TIME_RANGE', `${fieldName} is required`);
  }

  if (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value.trim())) {
    throw new ValidationError('INVALID_TIME_RANGE', `${fieldName} must be a Unix timestamp in milliseconds`);
  }

  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) {
    throw new ValidationError('INVALID_TIME_RANGE', `${fieldName} must be a Unix timestamp in milliseconds`);
  }

  return timestamp;
}

function validateTimeRange(from, to) {
  const fromMs = parseUnixMs(from, 'from');
  const toMs = parseUnixMs(to, 'to');

  if (fromMs > toMs) {
    throw new ValidationError('INVALID_TIME_RANGE', 'from must be less than or equal to to');
  }

  return { from: fromMs, to: toMs };
}

module.exports = {
  PAIR_PATTERN,
  parsePairs,
  parseUnixMs,
  validateTimeRange
};

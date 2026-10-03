'use strict';

const { ApplicationError } = require('./applicationError');

class ValidationError extends ApplicationError {
  constructor(code, message, options = {}) {
    super(code, message, options);
    this.name = 'ValidationError';
  }
}

module.exports = {
  ValidationError
};

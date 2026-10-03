'use strict';

const { ApplicationError } = require('../errors/applicationError');
const { encode, decode, toRpcPrice } = require('./codec');

function toRpcError(error) {
  return encode({
    error: {
      code: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
      message: error.message
    }
  });
}

function createRpcHandlers(priceQueryService) {
  return {
    async getLatestPrices(payload) {
      try {
        const request = decode(payload);
        const data = await priceQueryService.getLatestPrices(request.pairs);
        return encode({ data: data.map(toRpcPrice) });
      } catch (error) {
        return toRpcError(error);
      }
    },

    async getHistoricalPrices(payload) {
      try {
        const request = decode(payload);
        const data = await priceQueryService.getHistoricalPrices(
          request.pairs,
          request.from,
          request.to
        );
        return encode({ data: data.map(toRpcPrice) });
      } catch (error) {
        return toRpcError(error);
      }
    }
  };
}

module.exports = {
  createRpcHandlers
};

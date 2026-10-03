'use strict';

const { asyncHandler } = require('../asyncHandler');

function serializePrice(item) {
  return {
    pair: item.pair,
    price: item.price,
    timestamp: item.timestamp.toISOString(),
    sources: item.sources
  };
}

function registerPriceRoutes(router, { priceQueryService }) {
  router.get('/prices/latest', asyncHandler(async (request, response) => {
    const data = await priceQueryService.getLatestPrices(request.query.pairs);
    response.json({ data: data.map(serializePrice) });
  }));

  router.get('/prices/history', asyncHandler(async (request, response) => {
    const data = await priceQueryService.getHistoricalPrices(
      request.query.pairs,
      request.query.from,
      request.query.to
    );
    response.json({ data: data.map(serializePrice) });
  }));
}

module.exports = {
  registerPriceRoutes
};

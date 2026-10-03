'use strict';

const { asyncHandler } = require('../asyncHandler');

function registerCollectionRoutes(router, { priceCollectionService }) {
  router.post('/collection/run', asyncHandler(async (request, response) => {
    const summary = await priceCollectionService.collect();
    response.json(summary);
  }));
}

module.exports = {
  registerCollectionRoutes
};

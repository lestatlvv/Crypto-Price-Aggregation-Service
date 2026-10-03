'use strict';

const { isMongoConnected } = require('../../infrastructure/mongodb/client');

function registerHealthRoutes(router) {
  router.get('/health', (request, response) => {
    response.json({
      status: isMongoConnected() ? 'ok' : 'degraded'
    });
  });
}

module.exports = {
  registerHealthRoutes
};

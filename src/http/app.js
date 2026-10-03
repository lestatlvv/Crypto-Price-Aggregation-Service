'use strict';

const express = require('express');
const logger = require('../logger');
const { ApplicationError } = require('../errors/applicationError');
const { registerHealthRoutes } = require('./routes/health');
const { registerCollectionRoutes } = require('./routes/collection');
const { registerPriceRoutes } = require('./routes/prices');

function createApp({ priceQueryService, priceCollectionService }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const router = express.Router();
  registerHealthRoutes(router);
  registerCollectionRoutes(router, { priceCollectionService });
  registerPriceRoutes(router, { priceQueryService });
  app.use(router);

  app.use((request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Unknown route ${request.method} ${request.path}`
      }
    });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const status = error instanceof ApplicationError ? error.status : 500;
    const code = error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR';
    const message = error instanceof ApplicationError ? error.message : 'Internal server error';

    logger.event('http_request_failed', {
      code,
      message: error.message,
      path: request.path
    });

    response.status(status).json({
      error: { code, message }
    });
  });

  return app;
}

module.exports = {
  createApp
};

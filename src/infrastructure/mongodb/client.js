'use strict';

const mongoose = require('mongoose');
const logger = require('../../logger');
const { PriceSample } = require('../../models/priceSample');
const { ApplicationError } = require('../../errors/applicationError');

async function connectMongo(uri, dbName) {
  try {
    await mongoose.connect(uri, { dbName });
    await PriceSample.syncIndexes();
    logger.event('mongodb_connected', { dbName });
  } catch (error) {
    throw new ApplicationError('DATABASE_ERROR', `MongoDB connection failed: ${error.message}`);
  }
}

async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectMongo,
  disconnectMongo,
  isMongoConnected
};

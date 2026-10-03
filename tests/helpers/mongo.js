'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectMongo, disconnectMongo } = require('../../src/infrastructure/mongodb/client');
const { PriceSample } = require('../../src/models/priceSample');

let mongod;

async function startTestMongo() {
  if (process.env.MONGODB_URI) {
    const dbName = process.env.MONGODB_DB || `crypto_prices_test_${process.pid}`;
    await connectMongo(process.env.MONGODB_URI, dbName);
    return;
  }

  mongod = await MongoMemoryServer.create();
  await connectMongo(mongod.getUri(), 'crypto_prices_test');
}

async function stopTestMongo() {
  await disconnectMongo();

  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

async function clearSamples() {
  await PriceSample.deleteMany({});
}

module.exports = {
  startTestMongo,
  stopTestMongo,
  clearSamples
};

'use strict';

const { PriceSample } = require('../../models/priceSample');
const { ApplicationError } = require('../../errors/applicationError');

function createPriceRepository(model = PriceSample) {
  async function insert(sample) {
    try {
      await model.create(sample);
      return sample;
    } catch (error) {
      throw new ApplicationError('DATABASE_ERROR', `Failed to persist price sample: ${error.message}`);
    }
  }

  async function findLatestByPairs(pairs) {
    try {
      const documents = await Promise.all(
        pairs.map((pair) => model.findOne({ pair, price: { $ne: null } }).sort({ timestamp: -1 }).lean())
      );

      return documents.filter(Boolean);
    } catch (error) {
      throw new ApplicationError('DATABASE_ERROR', `Failed to load latest prices: ${error.message}`);
    }
  }

  async function findHistoricalByPairs(pairs, from, to, { limit } = {}) {
    try {
      const query = model.find({
        pair: { $in: pairs },
        price: { $ne: null },
        timestamp: {
          $gte: new Date(from),
          $lte: new Date(to)
        }
      }).sort({ timestamp: 1 });

      if (Number.isFinite(limit)) {
        query.limit(limit + 1);
      }

      return query.lean();
    } catch (error) {
      throw new ApplicationError('DATABASE_ERROR', `Failed to load historical prices: ${error.message}`);
    }
  }

  return {
    insert,
    findLatestByPairs,
    findHistoricalByPairs
  };
}

module.exports = {
  createPriceRepository
};

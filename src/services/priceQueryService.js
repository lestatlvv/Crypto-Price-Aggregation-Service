'use strict';

const config = require('../config');
const { parsePairs, validateTimeRange } = require('../domain/price/validators');
const { ApplicationError } = require('../errors/applicationError');

function toPriceView(sample) {
  return {
    pair: sample.pair,
    price: sample.price,
    timestamp: sample.timestamp instanceof Date ? sample.timestamp : new Date(sample.timestamp),
    sources: (sample.exchanges || []).map((exchange) => ({
      exchange: exchange.id,
      price: exchange.price
    }))
  };
}

function createPriceQueryService({
  priceRepository,
  maxResults = config.history.maxResults
} = {}) {
  if (!priceRepository) {
    throw new Error('priceRepository is required');
  }

  async function getLatestPrices(pairsInput) {
    const pairs = parsePairs(pairsInput);
    const samples = await priceRepository.findLatestByPairs(pairs);
    const byPair = new Map(samples.map((sample) => [sample.pair, sample]));

    return pairs
      .filter((pair) => byPair.has(pair))
      .map((pair) => toPriceView(byPair.get(pair)));
  }

  async function getHistoricalPrices(pairsInput, from, to) {
    const pairs = parsePairs(pairsInput);
    const range = validateTimeRange(from, to);
    const samples = await priceRepository.findHistoricalByPairs(
      pairs,
      range.from,
      range.to,
      { limit: maxResults }
    );

    if (samples.length > maxResults) {
      throw new ApplicationError(
        'RESULT_TOO_LARGE',
        `Result exceeds maximum of ${maxResults} samples`
      );
    }

    return samples.map(toPriceView);
  }

  return {
    getLatestPrices,
    getHistoricalPrices
  };
}

module.exports = {
  createPriceQueryService,
  toPriceView
};

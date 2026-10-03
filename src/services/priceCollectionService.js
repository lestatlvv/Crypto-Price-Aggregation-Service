'use strict';

const config = require('../config');
const logger = require('../logger');
const defaultClient = require('../infrastructure/coingecko/client');
const { createPriceSample } = require('../models/priceSample');
const { averagePrice } = require('../domain/price/average');
const { selectTopExchangePrices } = require('../domain/price/selectExchangeTickers');
const { ApplicationError, classifyUpstreamError } = require('../errors/applicationError');

function createPriceCollectionService({
  coinGeckoClient = defaultClient,
  priceRepository,
  now = () => new Date(),
  metadataCacheTtlMs = config.collection.metadataCacheTtlMs
} = {}) {
  if (!priceRepository) {
    throw new Error('priceRepository is required');
  }

  let running = false;
  let metadataCache = null;

  async function loadMetadata() {
    if (metadataCache && Date.now() < metadataCache.expiresAt) {
      return metadataCache;
    }

    try {
      const coins = await coinGeckoClient.getTopCoinsByMarketCap();
      const rankedExchanges = await coinGeckoClient.getTopExchanges();
      metadataCache = {
        coins,
        rankedExchanges,
        expiresAt: Date.now() + metadataCacheTtlMs
      };
      return metadataCache;
    } catch (error) {
      if (metadataCache) {
        logger.event('metadata_cache_stale', { message: error.message });
        return metadataCache;
      }

      throw error;
    }
  }

  async function collectCoin(coin, rankedExchanges, collectedAt) {
    const tickers = await coinGeckoClient.getCoinTickers(
      coin.id,
      rankedExchanges.map((exchange) => exchange.id)
    );
    const exchanges = selectTopExchangePrices(tickers, coin, rankedExchanges);
    const price = averagePrice(exchanges);

    if (price === null) {
      return null;
    }

    const sample = createPriceSample({
      pair: `${coin.symbol}/${config.coingecko.quoteSymbol}`,
      coinId: coin.id,
      price,
      timestamp: collectedAt,
      exchanges,
      expectedSources: config.coingecko.topExchanges
    });

    await priceRepository.insert(sample);
    return sample;
  }

  async function collect() {
    if (running) {
      throw new ApplicationError(
        'COLLECTION_ALREADY_RUNNING',
        'A collection run is already in progress'
      );
    }

    running = true;
    logger.event('collection_started');

    try {
      const collectedAt = now();
      const { coins, rankedExchanges } = await loadMetadata();
      const failed = [];
      let collected = 0;

      for (const coin of coins) {
        try {
          const sample = await collectCoin(coin, rankedExchanges, collectedAt);

          if (sample) {
            collected += 1;
          } else {
            failed.push({
              coinId: coin.id,
              reason: 'NO_USABLE_EXCHANGES'
            });
            logger.event('coin_collection_failed', {
              coinId: coin.id,
              reason: 'NO_USABLE_EXCHANGES'
            });
          }
        } catch (error) {
          const classified = classifyUpstreamError(error);
          failed.push({
            coinId: coin.id,
            reason: classified.code
          });
          logger.event('coin_collection_failed', {
            coinId: coin.id,
            reason: classified.code
          });
        }
      }

      const status = failed.length === 0
        ? 'completed'
        : collected === 0
          ? 'failed'
          : 'partial';

      const summary = { status, collected, failed };
      const eventName = status === 'completed'
        ? 'collection_completed'
        : status === 'partial'
          ? 'collection_partial'
          : 'collection_failed';

      logger.event(eventName, summary);
      return summary;
    } catch (error) {
      const classified = classifyUpstreamError(error);
      logger.event('collection_failed', {
        code: classified.code,
        message: classified.message
      });
      throw classified;
    } finally {
      running = false;
    }
  }

  return {
    collect,
    isRunning: () => running
  };
}

module.exports = {
  createPriceCollectionService
};

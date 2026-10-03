'use strict';

const config = require('./config');
const logger = require('./logger');
const {
  getTopCoinsByMarketCap,
  getTopExchanges,
  getCoinTickers
} = require('./coingeckoClient');
const { createPriceSample, toLogDocument } = require('./models/priceSample');
const { averagePrice } = require('./domain/price/average');
const { selectTopExchangePrices } = require('./domain/price/selectExchangeTickers');

async function collectCoinPrice(coin, topExchanges) {
  const { quoteSymbol, topExchanges: expectedSources } = config.coingecko;
  const pair = `${coin.symbol}/${quoteSymbol}`;

  logger.log(`[collector] collecting ${pair} (${coin.id}, rank ${coin.marketCapRank})`);

  const tickers = await getCoinTickers(coin.id, topExchanges.map((exchange) => exchange.id));
  logger.log(`[collector] received ${tickers.length} tickers for ${coin.id}`);

  const exchanges = selectTopExchangePrices(tickers, coin, topExchanges);
  const price = averagePrice(exchanges);

  if (price === null) {
    logger.log(`[collector] no usable ${pair} prices from top ${expectedSources} exchanges`);
  } else {
    logger.log(`[collector] ${pair} sources: ${exchanges.map((item) => `${item.id}=${item.price}`).join(', ')}`);
    logger.log(`[collector] ${pair} average=${price} from ${exchanges.length}/${expectedSources} exchanges`);
  }

  return createPriceSample({
    pair,
    coinId: coin.id,
    price,
    timestamp: new Date(),
    exchanges,
    expectedSources
  });
}

async function collectPrices() {
  const { topCoins, topExchanges: expectedSources, quoteSymbol } = config.coingecko;

  logger.log('[collector] starting price collection');
  logger.log(`[collector] target: top ${topCoins} coins vs ${quoteSymbol}, average of top ${expectedSources} exchanges`);

  const coins = await getTopCoinsByMarketCap();
  logger.log(`[collector] top coins: ${coins.map((coin) => `${coin.symbol} (${coin.id})`).join(', ')}`);

  const topExchanges = await getTopExchanges();
  logger.log(`[collector] CoinGecko exchange ranking: ${topExchanges.map((exchange) => `${exchange.id} (#${exchange.trustScoreRank})`).join(', ')}`);

  const samples = [];

  for (const coin of coins) {
    const sample = await collectCoinPrice(coin, topExchanges);
    samples.push(sample);
  }

  logger.log(`[collector] finished collection: ${samples.length} pairs`);
  printLastLiveRun(samples);
  return samples;
}

function printLastLiveRun(samples) {
  logger.log('[collector] Last live run');
  logger.log(JSON.stringify(samples.map(toLogDocument), null, 2));
}

module.exports = {
  collectPrices,
  collectCoinPrice,
  selectTopExchangePrices,
  averagePrice,
  printLastLiveRun
};

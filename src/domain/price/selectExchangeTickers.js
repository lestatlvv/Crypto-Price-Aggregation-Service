'use strict';

const config = require('../../config');
const logger = require('../../logger');

const DERIVATIVE_EXCHANGE = /futures|swap|perp|derivative|option/i;

function parsePrice(value) {
  const price = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function isUsdtQuote(ticker) {
  const target = String(ticker.target || '').toUpperCase();
  return target === config.coingecko.quoteSymbol || ticker.target_coin_id === config.coingecko.quoteCoinId;
}

function isUsdtSpotTicker(ticker, coin) {
  if (!ticker || parsePrice(ticker.last) === null) {
    return false;
  }

  if (!isUsdtQuote(ticker)) {
    return false;
  }

  const base = String(ticker.base || '').toUpperCase();
  const exchangeId = ticker.market?.identifier || '';
  const coinIdMatches = !ticker.coin_id || ticker.coin_id === coin.id;
  const symbolMatches = Boolean(base && coin.symbol && base === coin.symbol);

  // CoinGecko sometimes uses different ids on /coins/markets vs /tickers
  // (e.g. binancecoin vs bnb). Accept either id or base symbol.
  if (!coinIdMatches && !symbolMatches) {
    return false;
  }

  if (!exchangeId) {
    return false;
  }

  if (DERIVATIVE_EXCHANGE.test(exchangeId)) {
    return false;
  }

  return true;
}

function selectTopExchangePrices(tickers, coin, rankedExchanges) {
  const { topExchanges: expectedSources } = config.coingecko;
  const rankById = new Map((rankedExchanges || []).map((exchange, index) => [exchange.id, index]));
  const skipped = { other: 0, anomaly: 0, stale: 0 };
  const eligible = [];

  for (const ticker of tickers || []) {
    if (!isUsdtSpotTicker(ticker, coin)) {
      skipped.other += 1;
      continue;
    }

    if (ticker.is_anomaly) {
      skipped.anomaly += 1;
      continue;
    }

    if (ticker.is_stale) {
      skipped.stale += 1;
      continue;
    }

    eligible.push(ticker);
  }

  logger.log(`[collector] ${coin.symbol} USDT tickers=${eligible.length} skipped=${JSON.stringify(skipped)}`);

  const bestByExchange = new Map();

  for (const ticker of eligible) {
    const exchangeId = ticker.market?.identifier;
    if (exchangeId && !bestByExchange.has(exchangeId)) {
      bestByExchange.set(exchangeId, ticker);
    }
  }

  return [...bestByExchange.values()]
    .sort((a, b) => {
      const rankA = rankById.has(a.market.identifier) ? rankById.get(a.market.identifier) : Number.MAX_SAFE_INTEGER;
      const rankB = rankById.has(b.market.identifier) ? rankById.get(b.market.identifier) : Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    })
    .slice(0, expectedSources)
    .map((ticker) => ({
      id: ticker.market.identifier,
      price: parsePrice(ticker.last)
    }));
}

module.exports = {
  parsePrice,
  isUsdtQuote,
  isUsdtSpotTicker,
  selectTopExchangePrices
};

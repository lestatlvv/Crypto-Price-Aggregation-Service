'use strict';

const config = require('./config');
const logger = require('./logger');
const { createRateLimiter, sleep } = require('./rateLimiter');

const rateLimiter = createRateLimiter({
  maxCalls: config.coingecko.callsPerMinute,
  windowMs: 60_000
});

let cooldownUntil = 0;

function getCooldownRemainingMs() {
  return Math.max(0, cooldownUntil - Date.now());
}

function resetCooldown() {
  cooldownUntil = 0;
}

function startCooldown(waitMs) {
  cooldownUntil = Date.now() + waitMs;
}

function buildHeaders() {
  const headers = { accept: 'application/json' };
  const { apiKey } = config.coingecko;

  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  return headers;
}

function buildUrl(pathname, query = {}) {
  const url = new URL(`${config.coingecko.baseUrl}${pathname}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function parseErrorBody(response) {
  const text = await response.text();

  try {
    const json = JSON.parse(text);
    return json.error || json.status?.error_message || text;
  } catch {
    return text || response.statusText;
  }
}

function retryWaitMs(response, attempt) {
  const { retryDelayMs } = config.coingecko;
  const retryAfter = Number(response?.headers?.get('retry-after'));

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  return retryDelayMs * attempt;
}

async function request(pathname, query) {
  const { requestTimeoutMs, retryCount } = config.coingecko;
  const url = buildUrl(pathname, query);
  let lastError;

  const cooldownMs = getCooldownRemainingMs();
  if (cooldownMs > 0) {
    throw new Error(`CoinGecko 429: rate limited; retry after ${Math.ceil(cooldownMs / 1000)}s`);
  }

  await rateLimiter.schedule(pathname);

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    logger.log(`[coingecko] GET ${url} (attempt ${attempt}/${retryCount})`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(),
        signal: controller.signal
      });

      if (response.status === 429) {
        const body = await parseErrorBody(response);
        const waitMs = retryWaitMs(response, attempt);
        startCooldown(waitMs);
        logger.event('upstream_retry', {
          status: 429,
          pathname,
          attempt,
          waitMs,
          action: 'cooldown'
        });
        throw new Error(`CoinGecko 429: ${body}`);
      }

      if (response.status >= 500) {
        const body = await parseErrorBody(response);
        lastError = new Error(`CoinGecko ${response.status}: ${body}`);
        const waitMs = retryWaitMs(response, attempt);
        logger.event('upstream_retry', {
          status: response.status,
          pathname,
          attempt,
          waitMs
        });
        logger.log(`[coingecko] retryable error: ${lastError.message}; waiting ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const body = await parseErrorBody(response);
        throw new Error(`CoinGecko ${response.status}: ${body}`);
      }

      const data = await response.json();
      logger.log(`[coingecko] ${response.status} ${pathname}`);
      return data;
    } catch (error) {
      if (error.message.startsWith('CoinGecko ')) {
        throw error;
      }

      lastError = error.name === 'AbortError'
        ? new Error(`CoinGecko request timed out after ${requestTimeoutMs}ms: ${pathname}`)
        : error;

      logger.log(`[coingecko] request failed: ${lastError.message}`);

      if (attempt < retryCount) {
        await sleep(retryWaitMs(null, attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function getTopCoinsByMarketCap() {
  const { marketCapCurrency, topCoins, quoteCoinId } = config.coingecko;

  logger.log(`[coingecko] fetching top coins by market cap vs ${marketCapCurrency.toUpperCase()}`);

  const markets = await request('/coins/markets', {
    vs_currency: marketCapCurrency,
    order: 'market_cap_desc',
    per_page: topCoins + 5,
    page: 1,
    sparkline: false
  });

  if (!Array.isArray(markets) || markets.length === 0) {
    throw new Error('CoinGecko returned no market-cap data');
  }

  const coins = markets
    .filter((coin) => coin && coin.id && coin.id !== quoteCoinId)
    .slice(0, topCoins)
    .map((coin) => ({
      id: coin.id,
      symbol: String(coin.symbol || '').toUpperCase(),
      name: coin.name,
      marketCapRank: coin.market_cap_rank
    }));

  if (coins.length < topCoins) {
    throw new Error(`Expected ${topCoins} coins, received ${coins.length}`);
  }

  return coins;
}

async function getTopExchanges() {
  const { exchangeRankLimit } = config.coingecko;

  logger.log('[coingecko] fetching CoinGecko exchange ranking');

  const exchanges = await request('/exchanges', {
    per_page: exchangeRankLimit,
    page: 1
  });

  if (!Array.isArray(exchanges) || exchanges.length === 0) {
    throw new Error('CoinGecko returned no exchange ranking data');
  }

  return exchanges
    .filter((exchange) => exchange && exchange.id)
    .sort((a, b) => (a.trust_score_rank || 999) - (b.trust_score_rank || 999))
    .slice(0, exchangeRankLimit)
    .map((exchange, index) => ({
      id: exchange.id,
      name: exchange.name,
      trustScoreRank: exchange.trust_score_rank || index + 1
    }));
}

async function getCoinTickers(coinId, exchangeIds = []) {
  const exchangeFilter = exchangeIds.join(',');
  logger.log(`[coingecko] fetching tickers for ${coinId}${exchangeFilter ? ` on ${exchangeFilter}` : ''}`);

  const payload = await request(`/coins/${encodeURIComponent(coinId)}/tickers`, {
    exchange_ids: exchangeFilter,
    order: 'volume_desc',
    page: 1
  });

  return Array.isArray(payload?.tickers) ? payload.tickers : [];
}

module.exports = {
  getTopCoinsByMarketCap,
  getTopExchanges,
  getCoinTickers,
  getCooldownRemainingMs,
  resetCooldown,
  sleep
};

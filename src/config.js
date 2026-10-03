'use strict';

const DEFAULT_REAL_BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFAULT_MOCK_PORT = 8081;

function resolveApiMode() {
  const mode = String(process.env.COINGECKO_API_MODE || 'real').toLowerCase();
  return mode === 'mock' ? 'mock' : 'real';
}

function resolveMockPort() {
  return Number(process.env.COINGECKO_MOCK_PORT || DEFAULT_MOCK_PORT);
}

function resolveBaseUrl(mode, mockPort) {
  if (process.env.COINGECKO_BASE_URL) {
    return process.env.COINGECKO_BASE_URL;
  }

  if (mode === 'mock') {
    return `http://127.0.0.1:${mockPort}/api/v3`;
  }

  return DEFAULT_REAL_BASE_URL;
}

function resolveBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

function resolveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveCollectionIntervalMs(mode, apiKey) {
  if (process.env.COLLECTION_INTERVAL_MS) {
    return resolveNumber(process.env.COLLECTION_INTERVAL_MS, 30_000);
  }

  if (mode === 'mock' || apiKey) {
    return 30_000;
  }

  return 120_000;
}

function resolveCallsPerMinute(mode, apiKey) {
  if (process.env.COINGECKO_CALLS_PER_MINUTE) {
    return resolveNumber(process.env.COINGECKO_CALLS_PER_MINUTE, 10);
  }

  if (mode === 'mock' || apiKey) {
    return 99;
  }

  return 10;
}

const mode = resolveApiMode();
const mockPort = resolveMockPort();
const apiKey = process.env.COINGECKO_API_KEY || '';

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    dbName: process.env.MONGODB_DB || 'crypto_prices'
  },
  collection: {
    intervalMs: resolveCollectionIntervalMs(mode, apiKey),
    metadataCacheTtlMs: resolveNumber(process.env.METADATA_CACHE_TTL_MS, 10 * 60 * 1000)
  },
  history: {
    maxResults: Number(process.env.HISTORY_MAX_RESULTS || 10_000)
  },
  rpc: {
    enabled: resolveBoolean(process.env.RPC_ENABLED, false),
    publicKeyFile: process.env.RPC_PUBLIC_KEY_FILE || '.rpc-key',
    tcpHost: process.env.RPC_TCP_HOST || '127.0.0.1',
    tcpPort: Number(process.env.RPC_TCP_PORT || 5001),
    tcpEndpointFile: process.env.RPC_TCP_FILE || '.rpc-tcp',
    bootstrap: process.env.RPC_BOOTSTRAP === 'local'
      ? ['local']
      : String(process.env.RPC_BOOTSTRAP || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
  },
  coingecko: {
    mode,
    mockPort,
    baseUrl: resolveBaseUrl(mode, mockPort),
    apiKey,
    marketCapCurrency: 'usd',
    quoteSymbol: 'USDT',
    quoteCoinId: 'tether',
    topCoins: 5,
    topExchanges: 3,
    exchangeRankLimit: 20,
    requestTimeoutMs: Number(process.env.COINGECKO_TIMEOUT_MS || 15_000),
    retryCount: Number(process.env.COINGECKO_RETRY_COUNT || 3),
    retryDelayMs: Number(process.env.COINGECKO_RETRY_DELAY_MS || 2_000),
    callsPerMinute: resolveCallsPerMinute(mode, apiKey)
  }
};

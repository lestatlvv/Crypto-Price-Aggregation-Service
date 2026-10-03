'use strict';

const http = require('http');
const logger = require('../logger');
const { MARKETS, EXCHANGES, TICKERS_BY_COIN } = require('./fixtures');

const DEFAULT_PORT = Number(process.env.COINGECKO_MOCK_PORT || 8081);

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*'
  });
  response.end(JSON.stringify(body));
}

function normalizePathname(pathname) {
  return pathname.replace(/^\/api\/v3/, '') || '/';
}

function parseRequest(request) {
  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  return {
    pathname: normalizePathname(url.pathname),
    query: url.searchParams
  };
}

function handleMarkets(query) {
  const vsCurrency = String(query.get('vs_currency') || '').toLowerCase();

  if (vsCurrency && vsCurrency !== 'usd') {
    return { status: 400, body: { error: 'invalid vs_currency' } };
  }

  const perPage = Number(query.get('per_page') || 100);
  const page = Number(query.get('page') || 1);
  const start = Math.max(0, (page - 1) * perPage);
  const markets = MARKETS.slice(start, start + perPage);

  return { status: 200, body: markets };
}

function handleExchanges(query) {
  const perPage = Number(query.get('per_page') || 100);
  const page = Number(query.get('page') || 1);
  const start = Math.max(0, (page - 1) * perPage);
  const exchanges = EXCHANGES
    .slice()
    .sort((a, b) => a.trust_score_rank - b.trust_score_rank)
    .slice(start, start + perPage);

  return { status: 200, body: exchanges };
}

function handleTickers(coinId, query) {
  const tickers = TICKERS_BY_COIN[coinId];

  if (!tickers) {
    return { status: 404, body: { error: 'coin not found' } };
  }

  const exchangeIds = String(query.get('exchange_ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const filtered = exchangeIds.length === 0
    ? tickers
    : tickers.filter((ticker) => exchangeIds.includes(ticker.market.identifier));

  return {
    status: 200,
    body: {
      name: coinId,
      tickers: filtered
    }
  };
}

function route(pathname, query) {
  if (pathname === '/health') {
    return { status: 200, body: { ok: true, service: 'coingecko-mock' } };
  }

  if (pathname === '/coins/markets') {
    return handleMarkets(query);
  }

  if (pathname === '/exchanges') {
    return handleExchanges(query);
  }

  const tickerMatch = pathname.match(/^\/coins\/([^/]+)\/tickers$/);
  if (tickerMatch) {
    return handleTickers(decodeURIComponent(tickerMatch[1]), query);
  }

  return { status: 404, body: { error: `unknown mock endpoint ${pathname}` } };
}

function createMockServer() {
  return http.createServer((request, response) => {
    if (request.method !== 'GET') {
      json(response, 405, { error: 'method not allowed' });
      return;
    }

    const { pathname, query } = parseRequest(request);
    const result = route(pathname, query);
    logger.log(`[mock] ${request.method} ${pathname} -> ${result.status}`);
    json(response, result.status, result.body);
  });
}

function startMockServer(port = DEFAULT_PORT) {
  const server = createMockServer();

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const url = `http://127.0.0.1:${actualPort}/api/v3`;
      logger.log(`[mock] CoinGecko mock listening on ${url}`);
      resolve({
        port: actualPort,
        url,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => (error ? closeReject(error) : closeResolve()));
        })
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function ensureMockServer(port = DEFAULT_PORT) {
  try {
    return await startMockServer(port);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      const url = `http://127.0.0.1:${port}/api/v3`;
      logger.log(`[mock] already running on ${url}`);
      return { port, url, close: async () => {} };
    }

    throw error;
  }
}

if (require.main === module) {
  startMockServer().catch((error) => {
    logger.error(`[mock] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createMockServer,
  startMockServer,
  ensureMockServer
};

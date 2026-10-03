# Crypto Price Aggregation Service

Node.js service that collects USDT prices for the current top cryptocurrencies from CoinGecko, stores compact historical samples in MongoDB, and exposes latest/historical queries over HTTP. The same query service is also available over Hyperswarm RPC.

## Architecture

The process is a modular monolith:

- `CoinGeckoClient` talks to CoinGecko (or the local mock) and never writes to MongoDB.
- `PriceCollectionService` runs one collection pipeline: top coins, ticker filtering, arithmetic average, persist.
- `PriceQueryService` serves latest and historical reads.
- `PriceRepository` hides Mongoose/MongoDB query details.
- HTTP, Hyperswarm RPC, and the scheduler are transport/orchestration adapters only.

Reads are never blocked by collection. Only one collection run can execute at a time inside a single process. A second trigger is rejected with `COLLECTION_ALREADY_RUNNING`.

```text
CoinGecko or local mock
        |
        v
PriceCollectionService --> PriceRepository --> MongoDB
        ^                                         ^
 Scheduler / POST /collection/run                 |
                                                  |
                         PriceQueryService -------+
                                  ^
                         HTTP and RPC adapters
```

## Prerequisites

- Node.js 18+
- MongoDB 6+ for local/service runs
- Automated tests use `mongodb-memory-server` and do not need a running MongoDB

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | MongoDB connection string |
| `MONGODB_DB` | `crypto_prices` | Database name |
| `COINGECKO_API_MODE` | `real` | `real` or `mock` |
| `COINGECKO_BASE_URL` | CoinGecko v3 or local mock | Override upstream base URL |
| `COINGECKO_API_KEY` | empty | Optional demo API key |
| `COINGECKO_MOCK_PORT` | `8081` | Local mock listen port |
| `COINGECKO_TIMEOUT_MS` | `15000` | Upstream request timeout |
| `COINGECKO_CALLS_PER_MINUTE` | `10` real / `99` mock or keyed | Local CoinGecko pacing |
| `COLLECTION_INTERVAL_MS` | `120000` real / `30000` mock or keyed | Delay after each collection run |
| `METADATA_CACHE_TTL_MS` | `600000` | How long top coins and exchange ranking are reused |
| `HISTORY_MAX_RESULTS` | `10000` | Maximum historical samples per query |
| `RPC_ENABLED` | `false` | Start the Hyperswarm RPC server |
| `RPC_PUBLIC_KEY_FILE` | `.rpc-key` | File written with the RPC public key |
| `RPC_PUBLIC_KEY` | empty | Client-side public key override |
| `RPC_BOOTSTRAP` | public DHT | `local` or `host:port` bootstrap nodes |
| `RPC_TCP_HOST` | `127.0.0.1` | Local TCP RPC bind address |
| `RPC_TCP_PORT` | `5001` | Local TCP RPC port |
| `RPC_PAIRS` | `BTC/USDT,ETH/USDT` | Pairs used by the demo RPC client |

Do not commit API keys.

## MongoDB setup

```bash
mongod --dbpath /data/db
```

The service connects on startup, fails fast if MongoDB is unreachable, and ensures this index:

```js
db.price_samples.createIndex({ pair: 1, timestamp: -1 })
```

## Install

```bash
npm install
```

## Run

Real CoinGecko:

```bash
npm start
```

Local CoinGecko mock (started automatically when `COINGECKO_API_MODE=mock`):

```bash
npm run start:mock
```

Standalone mock server:

```bash
npm run mock
```

One-shot collection without the HTTP server:

```bash
npm run collect:mock
npm run collect:real
```

## Test

```bash
npm test
```

Unit, integration, and HTTP/RPC e2e suites live under `tests/`. Tests inject a fake CoinGecko client or use the local mock. They do not call the public CoinGecko API. RPC tests exercise the same handlers and payloads as the live Hyperswarm server.

## HTTP endpoints

Health:

```bash
curl http://127.0.0.1:3000/health
```

On-demand collection:

```bash
curl -X POST http://127.0.0.1:3000/collection/run
```

Latest prices:

```bash
curl 'http://127.0.0.1:3000/prices/latest?pairs=BTC/USDT,ETH/USDT'
```

Historical prices (`from` and `to` are Unix milliseconds):

```bash
curl 'http://127.0.0.1:3000/prices/history?pairs=BTC/USDT&from=1760000000000&to=1760003600000'
```

Last 10 minutes of BTC:
```bash
curl -sS "http://127.0.0.1:3000/prices/history?pairs=BTC/USDT&from=$(($(date +%s%3N)-600000))&to=$(date +%s%3N)"
```

Pair format is `BASE/USDT` (uppercase). A valid pair with no stored data returns `{ "data": [] }`. Invalid pairs or inverted/non-numeric time ranges return:

```json
{
  "error": {
    "code": "INVALID_PAIR",
    "message": "Invalid pair: BTCUSD"
  }
}
```

## RPC

Start the service with RPC enabled:

```bash
npm run start:rpc
```

If the public DHT is unreachable, use a local bootstrap node:

```bash
npm run start:rpc:local
```

The server writes `.rpc-tcp` (`127.0.0.1:5001`) for local clients and `.rpc-key` for Hyperswarm. The demo client uses the local TCP endpoint first, because the public DHT often closes with `CHANNEL_CLOSED`.

```bash
npm run start:rpc
npm run rpc:client
```

Methods:

- `getLatestPrices({ pairs })`
- `getHistoricalPrices({ pairs, from, to })`

Both reuse `PriceQueryService`. Errors use the same `{ error: { code, message } }` shape as HTTP.

E2E tests call the same server/client methods and payloads as the live Hyperswarm transport. Use `RPC_BOOTSTRAP=local` if the public DHT is unreachable.

If the public DHT is blocked on your network, run a local bootstrap node with [hyperdht](https://github.com/holepunchto/hyperdht):

```bash
hyperdht --bootstrap --host 127.0.0.1 --port 30001
```

## Start REST API and RPC Services from the Command Line

```bash
RPC_ENABLED=true COINGECKO_API_MODE=real PORT=3000 MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB=crypto_prices node src/index.js
```


## Data model

Collection: `price_samples`

```js
{
  pair: 'BTC/USDT',
  coinId: 'bitcoin',
  price: 67231.42,
  timestamp: ISODate('2026-10-03T08:00:00.000Z'),
  exchanges: [
    { id: 'binance', price: 67230.10 },
    { id: 'okx', price: 67233.12 }
  ],
  quality: {
    expectedSources: 3,
    actualSources: 2
  }
}
```

Only pair identity, CoinGecko coin id, aggregated price, timestamp, contributing exchange prices, and source counts are stored. Raw CoinGecko payloads, logos, market caps, and unrelated ticker fields are discarded.

## Data quality policy

For each selected coin:

1. Keep USDT spot tickers with a positive numeric price and an exchange id.
2. Drop stale, anomalous, derivative, missing, zero, or negative prices.
3. Deduplicate by exchange, preserving first-seen CoinGecko order.
4. Rank remaining exchanges with CoinGecko's exchange trust ranking.
5. Use at most 3 exchanges.
6. Persist the arithmetic mean, not a volume-weighted average.

Quality outcomes:

- 3 valid exchanges: persist, `quality.actualSources = 3`
- 1-2 valid exchanges: persist a partial sample
- 0 valid exchanges: do not persist that coin; continue the run

A single coin failure does not roll back other coins. HTTP 5xx and timeouts are retried up to 3 times. HTTP 429 fails that coin immediately, starts a process-wide cooldown from `Retry-After`, and later coins in the same run fail fast instead of sleeping under the collection lock. Other 4xx responses are not retried.

Top-5 coins and the exchange ranking are cached for `METADATA_CACHE_TTL_MS` (default 10 minutes). Ticker fetches ask CoinGecko only for those ranked venues. Every sample in a run shares one collection timestamp.

## USDT / top-5 interpretation

CoinGecko's top market-cap list often includes Tether. `USDT/USDT` is not a meaningful pair, so `coinId = tether` is excluded and selection continues until 5 non-USDT assets are available.

## Exchange-selection interpretation

"Top 3 exchanges as determined by CoinGecko" is implemented as:

- load CoinGecko's exchange trust ranking;
- keep only valid USDT tickers for the coin;
- pick the highest-ranked remaining distinct exchanges, up to 3;
- average those last prices.

Unknown exchanges can still be used if no higher-ranked valid ticker exists, but ranked venues are preferred.

## Overlapping collection

The collection service uses an in-process mutex. A concurrent `POST /collection/run` is rejected with `COLLECTION_ALREADY_RUNNING` (HTTP 409). The scheduler waits until the previous run finishes, then waits the configured interval (and any CoinGecko cooldown). If it still collides with an on-demand run, it logs `collection_skipped` rather than `collection_failed`. Multi-instance production deployments would need an external lock or scheduler.

## Known limitations

- Single-process overlap protection only.
- Scheduler waits for the previous run to finish, then delays `COLLECTION_INTERVAL_MS`; it does not collect immediately on startup.
- Historical queries are capped at 10,000 samples.
- The public CoinGecko API is rate-limited. Without an API key the default interval is 2 minutes and local pacing is 10 calls/min. Prefer `COINGECKO_API_MODE=mock` for development.
- RPC depends on Hyperswarm connectivity.
- `ANSWERS.md` must be written personally by the candidate and is not generated by this repository's implementation notes.

## Project layout

```text
src/
  coingeckoClient.js          existing CoinGecko HTTP client
  mock/                       local CoinGecko mock + fixtures
  domain/price/               average, ticker selection, validators
  services/                   collection + query application services
  infrastructure/             MongoDB + CoinGecko adapters
  http/                       Express app and routes
  rpc/                        Hyperswarm RPC server and demo client
  jobs/scheduler.js
  index.js
tests/
  unit/
  integration/
  e2e/
```

# Crypto Price Aggregation Service — Technical Specification

## 1. Purpose

Build a Node.js service that aggregates cryptocurrency prices from CoinGecko, persists historical price samples in MongoDB, exposes them through an HTTP API, and optionally exposes the same query functionality through Hyperswarm RPC.

The implementation must use JavaScript only.

---

## 2. Goals

The service must:

- fetch the current top 5 cryptocurrencies by market capitalization from CoinGecko;
- collect USDT-denominated prices for each selected cryptocurrency;
- use up to the top 3 valid exchanges returned/ranked by CoinGecko;
- calculate an arithmetic average price across the selected exchanges;
- persist only the data needed for current and historical queries;
- preserve the exchange metadata used for every aggregated price;
- run the collection pipeline on a fixed schedule;
- allow the collection pipeline to be triggered on demand;
- expose latest and historical prices through HTTP;
- optionally expose the same data through Hyperswarm RPC;
- handle partial and invalid upstream data without corrupting stored results;
- provide automated tests for successful requests, edge cases, and failures.

---

## 3. Non-Goals

The first version does not require:

- UI;
- user authentication;
- portfolio management;
- order execution;
- WebSocket streaming;
- Redis;
- Kafka;
- microservices;
- distributed scheduling;
- real-time per-trade market data;
- long-term raw CoinGecko response storage.

---

## 4. Architecture

Use a modular monolith.

```text
                         +------------------+
                         |    CoinGecko     |
                         +---------+--------+
                                   |
                                   v
                         +------------------+
                         | CoinGecko Client |
                         +---------+--------+
                                   |
                                   v
+-------------+          +-----------------------+
|  Scheduler  |--------->| PriceCollectionService|
+-------------+          +-----------+-----------+
                                     |
+-------------+                      |
| HTTP POST   |----------------------+
| /collect    |
+-------------+
                                     v
                              +-------------+
                              | Repository  |
                              +------+------+ 
                                     |
                                     v
                                +---------+
                                | MongoDB |
                                +----+----+
                                     ^
                                     |
                           +------------------+
                           | PriceQueryService|
                           +------------------+
                                     |
                                     ^
                     +---------------+---------------+
                     |                               |
                     v                               v
             +---------------+               +---------------+
             | HTTP Queries  |               | Hyperswarm RPC|
             +-------+-------+               +-------+-------+
                     |                               |
                     +---------------+---------------+
```

### Architectural principles

- HTTP, RPC, and scheduling are transport/orchestration layers only.
- Business logic must live in application/domain services.
- MongoDB access must be isolated behind repositories.
- CoinGecko-specific API logic must be isolated behind a client/adapter.
- Read and write operations share the same MongoDB database, but use separate application services.
- Collection must not block reads.
- RPC and HTTP must reuse the same query service.

---

## 5. Suggested Project Structure

```text
src/
  config/
    env.js

  infrastructure/
    mongodb/
      client.js
      priceRepository.js
    coingecko/
      client.js

  services/
    priceCollectionService.js
    priceQueryService.js

  domain/
    price/
      average.js
      validators.js
      selectExchangeTickers.js

  jobs/
    scheduler.js

  http/
    app.js
    routes/
      prices.js
      collection.js
      health.js

  rpc/
    server.js
    handlers.js
    client.js

  errors/
    applicationError.js
    validationError.js

  index.js

tests/
  unit/
  integration/
  e2e/
```

---

## 6. Core Components

### 6.1 CoinGeckoClient

Responsibilities:

- fetch top cryptocurrencies by market cap;
- fetch exchange ticker data for a coin;
- normalize CoinGecko responses into application-friendly values;
- apply request timeout;
- distinguish retryable and non-retryable upstream errors.

Suggested methods:

```js
getTopCoins(limit)
getCoinTickers(coinId, page)
```

The client must not write to MongoDB.

---

### 6.2 PriceCollectionService

Responsibilities:

- execute one complete collection run;
- determine the current top coins;
- fetch tickers;
- select valid USDT exchange prices;
- calculate averages;
- persist samples;
- return a summary of the collection run;
- prevent overlapping collection executions within one process.

Suggested public method:

```js
collect()
```

Both the scheduler and on-demand trigger must call the same method.

---

### 6.3 PriceQueryService

Responsibilities:

- validate pair queries;
- return the latest available price for requested pairs;
- return historical samples for requested pairs and time ranges.

Suggested methods:

```js
getLatestPrices(pairs)
getHistoricalPrices(pairs, from, to)
```

The service must not contain HTTP- or RPC-specific logic.

---

### 6.4 PriceRepository

Responsibilities:

- insert price samples;
- fetch latest samples;
- fetch historical samples;
- hide MongoDB-specific query details from the service layer.

Suggested methods:

```js
insert(sample)
findLatestByPairs(pairs)
findHistoricalByPairs(pairs, from, to)
```

---

### 6.5 Scheduler

Responsibilities:

- trigger `PriceCollectionService.collect()` at the configured interval;
- avoid stopping permanently when one run fails;
- log collection failures;
- avoid overlapping scheduled executions.

Default interval:

```text
30 seconds
```

The interval should be configurable through environment variables.

---

## 7. Coin Selection

The application must obtain the highest-ranked cryptocurrencies by market capitalization from CoinGecko.

Expected selection algorithm:

1. Request coins ordered by market cap descending.
2. Exclude assets that cannot produce a meaningful `<BASE>/USDT` pair.
3. Select 5 base assets.
4. Preserve the CoinGecko coin ID and symbol for the collection run.

### USDT edge case

If USDT itself appears in the top market-cap list, `USDT/USDT` is not a meaningful exchange pair.

Recommended behavior:

- exclude Tether (`coinId = tether`) from source assets;
- continue selecting until 5 non-USDT assets are available.

This behavior must be documented in README.

---

## 8. Exchange Price Selection

For every selected coin:

1. Fetch CoinGecko ticker data.
2. Consider only tickers whose quote asset is USDT.
3. Reject stale tickers.
4. Reject anomalous tickers.
5. Reject missing, non-numeric, zero, or negative prices.
6. Deduplicate by exchange.
7. Preserve CoinGecko ordering/ranking when selecting exchanges.
8. Select at most 3 distinct exchanges.
9. Calculate the arithmetic mean.

Example:

```text
Binance: 100
OKX:     101
Bybit:    99

average = (100 + 101 + 99) / 3 = 100
```

Do not implement a volume-weighted average unless explicitly required.

---

## 9. Partial Data Policy

The service should be resilient to incomplete market data.

Recommended policy:

### 3 valid exchanges

Persist normally.

```text
quality = complete
```

### 1-2 valid exchanges

Persist the average using available valid exchanges.

```text
quality = partial
```

The stored document must preserve the actual source count.

### 0 valid exchanges

Do not persist a sample for that coin.

The collection run should continue processing other coins.

---

## 10. Data Quality Rules

The collector must explicitly handle:

- stale tickers;
- anomalous tickers;
- missing USDT markets;
- duplicate exchange records;
- invalid prices;
- missing exchange identifiers;
- CoinGecko timeout;
- CoinGecko HTTP 429;
- CoinGecko 5xx errors;
- partial per-coin failures;
- fewer than 3 usable exchanges;
- no usable exchange data.

### Retry policy

Retry only transient failures, for example:

- network timeout;
- HTTP 429;
- HTTP 500;
- HTTP 502;
- HTTP 503;
- HTTP 504.

Do not retry clearly invalid requests such as HTTP 400/404 unless there is a specific reason.

Recommended maximum:

```text
3 attempts
```

Use a small backoff between attempts.

---

## 11. MongoDB Data Model

Use one main collection:

```text
price_samples
```

Recommended document:

```js
{
  _id: ObjectId,

  pair: 'BTC/USDT',
  coinId: 'bitcoin',

  price: 67231.42,
  timestamp: ISODate('2026-10-03T08:00:00.000Z'),

  sources: [
    {
      exchange: 'binance',
      price: 67230.10
    },
    {
      exchange: 'okx',
      price: 67233.12
    },
    {
      exchange: 'bybit_spot',
      price: 67231.04
    }
  ],

  sourceCount: 3
}
```

### Why one collection

The access patterns are time-series oriented:

- latest sample by pair;
- historical samples by pair and time range.

Separate collections for coins and exchanges are not required for this task because the relevant exchange metadata must remain associated with the exact price calculation that used it.

---

## 12. Minimal Persistence Policy

Persist only data required for:

- pair identification;
- CoinGecko asset identification;
- aggregated price;
- collection timestamp;
- source exchange metadata;
- historical queries;
- data quality interpretation.

Do not persist the entire upstream CoinGecko response.

Do not persist data such as logos, URLs, market capitalization, descriptions, or unrelated ticker fields unless the implementation later proves they are required.

---

## 13. MongoDB Indexes

Required index:

```js
db.price_samples.createIndex({
  pair: 1,
  timestamp: -1
})
```

This supports:

- latest price lookup;
- pair/time-range history queries.

Optional later indexes should only be added based on measured query patterns.

---

## 14. Write Behavior

A collection run writes independent samples per pair.

Example:

```text
BTC success
ETH success
SOL failure
BNB success
XRP success
```

Expected behavior:

```text
4 samples stored
1 collection item failed
overall run status = partial
```

A single coin failure must not rollback successful results for other coins.

---

## 15. Concurrency

Reads and writes must be allowed concurrently.

A query received while a new collection run is in progress should return the latest already committed MongoDB sample.

Do not block reads while collecting.

### Collection overlap

Only one collection pipeline should execute at a time inside a single Node.js process.

Recommended behavior for a second trigger while a collection is already running:

- reject with a deterministic application error; or
- return a `skipped/already_running` status.

Document the chosen behavior.

For a multi-instance production deployment, a distributed lock or external scheduler would be required.

---

## 16. HTTP API

The task requires the stored data to be exposed over HTTP.

Recommended endpoints:

### Health

```http
GET /health
```

Example response:

```json
{
  "status": "ok"
}
```

---

### Trigger collection

```http
POST /collection/run
```

Example response:

```json
{
  "status": "completed",
  "collected": 5,
  "failed": []
}
```

Partial example:

```json
{
  "status": "partial",
  "collected": 4,
  "failed": [
    {
      "coinId": "example",
      "reason": "UPSTREAM_TIMEOUT"
    }
  ]
}
```

---

### Get latest prices

```http
GET /prices/latest?pairs=BTC/USDT,ETH/USDT
```

Example response:

```json
{
  "data": [
    {
      "pair": "BTC/USDT",
      "price": 67231.42,
      "timestamp": "2026-10-03T08:00:00.000Z",
      "sources": [
        {
          "exchange": "binance",
          "price": 67230.1
        }
      ]
    }
  ]
}
```

---

### Get historical prices

```http
GET /prices/history?pairs=BTC/USDT,ETH/USDT&from=1760000000000&to=1760003600000
```

`from` and `to` are Unix timestamps in milliseconds.

Results should be ordered by timestamp ascending.

A maximum result size should be enforced to protect the API.

Suggested limit:

```text
10,000 samples
```

---

## 17. Pair Validation

Expected pair format:

```text
BASE/USDT
```

Example valid values:

```text
BTC/USDT
ETH/USDT
SOL/USDT
```

Examples of invalid input:

```text
BTCUSD
btc/usdt
BTC/
null
123
```

Suggested syntax validation:

```js
/^[A-Z0-9]+\/USDT$/
```

A syntactically valid pair with no stored data should return an empty result rather than an internal error.

---

## 18. Historical Query Validation

Reject requests where:

```text
from > to
```

Reject non-numeric timestamps.

Optionally enforce a maximum query range or maximum output size.

---

## 19. Hyperswarm RPC — Bonus

Implement RPC only after all required features are complete.

Use:

```text
@hyperswarm/rpc
```

RPC handlers must call the same `PriceQueryService` used by HTTP.

### getLatestPrices

Logical signature:

```js
getLatestPrices(pairs)
```

Recommended network payload:

```json
{
  "pairs": ["BTC/USDT", "ETH/USDT"]
}
```

Example response:

```json
{
  "data": [
    {
      "pair": "BTC/USDT",
      "price": 67231.42,
      "timestamp": 1760000000000
    }
  ]
}
```

---

### getHistoricalPrices

Logical signature:

```js
getHistoricalPrices(pairs, from, to)
```

Recommended payload:

```json
{
  "pairs": ["BTC/USDT"],
  "from": 1760000000000,
  "to": 1760003600000
}
```

The method returns all matching stored samples in the requested interval, subject to a safe maximum result size.

---

## 20. RPC Demo Client

Provide an executable client such as:

```text
src/rpc/client.js
```

It should:

1. connect to the RPC server;
2. call `getLatestPrices`;
3. print the result;
4. call `getHistoricalPrices`;
5. print the result;
6. close cleanly.

---

## 21. Scheduling

The service must execute collection periodically and on demand.

Recommended implementation for this scope:

- native timer mechanism;
- configurable interval;
- application-level mutex to prevent overlapping runs.

Example config:

```env
COLLECTION_INTERVAL_MS=30000
```

Avoid introducing Redis/job queues unless there is a demonstrated requirement.

---

## 22. Configuration

Recommended environment variables:

```env
PORT=3000

MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=crypto_prices

COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
COINGECKO_API_KEY=

COLLECTION_INTERVAL_MS=30000
COINGECKO_TIMEOUT_MS=5000

RPC_ENABLED=true
```

If the CoinGecko API mode used requires a key, pass it through environment configuration and never commit it.

---

## 23. Logging

Use structured logging.

Recommended events:

```text
service_started
mongodb_connected
collection_started
collection_completed
collection_partial
collection_failed
coin_collection_failed
upstream_retry
rpc_started
http_request_failed
```

Do not log full upstream payloads by default.

Do not log secrets.

---

## 24. Error Model

Use predictable application error codes.

Examples:

```text
INVALID_PAIR
INVALID_TIME_RANGE
COLLECTION_ALREADY_RUNNING
UPSTREAM_TIMEOUT
UPSTREAM_RATE_LIMITED
UPSTREAM_FAILURE
RESULT_TOO_LARGE
DATABASE_ERROR
```

HTTP errors should map to appropriate status codes.

Example:

```json
{
  "error": {
    "code": "INVALID_PAIR",
    "message": "Invalid pair: BTCUSD"
  }
}
```

RPC should return an equivalent structured error representation.

---

## 25. Testing Strategy

Use automated tests at multiple levels.

### Unit tests

Test pure business logic:

- average calculation;
- ticker filtering;
- exchange deduplication;
- top-3 selection;
- invalid prices;
- pair validation;
- time range validation.

### Integration tests

Test:

- MongoDB repository queries;
- latest price retrieval;
- historical retrieval;
- collection service with mocked CoinGecko client.

### HTTP E2E tests

Use `supertest` or a similar library.

Required scenarios:

- successful latest price query;
- successful historical query;
- empty result;
- invalid pair;
- invalid time range;
- collection trigger;
- application error handling.

### RPC tests

If RPC is implemented, run a real local RPC server/client flow where practical.

Required scenarios:

- successful latest query;
- successful historical query;
- empty result;
- invalid pair;
- error handling.

---

## 26. Upstream API Testing

Do not depend on the real CoinGecko API for deterministic automated tests.

Inject the CoinGecko client into `PriceCollectionService`.

Example:

```js
const fakeCoinGeckoClient = {
  getTopCoins: async () => [...],
  getCoinTickers: async () => [...]
}
```

Create fixtures for:

- 3 valid exchanges;
- 2 valid exchanges;
- duplicate exchange tickers;
- stale ticker;
- anomalous ticker;
- invalid price;
- no USDT market;
- upstream timeout;
- rate limit error.

---

## 27. Suggested Dependencies

Production:

```text
express
mongodb
@hyperswarm/rpc
pino
```

Optional validation:

```text
zod
```

Testing:

```text
supertest
```

Use either Node.js built-in test runner, `tap`, or another lightweight test library.

Prefer native `fetch` available in modern Node.js unless another HTTP client provides a concrete benefit.

---

## 28. Startup Sequence

Recommended startup order:

```text
1. Load configuration
2. Validate configuration
3. Connect to MongoDB
4. Ensure required indexes
5. Construct repositories
6. Construct application services
7. Start HTTP server
8. Start optional RPC server
9. Start scheduler
10. Log service readiness
```

If MongoDB connection cannot be established during startup, fail fast rather than accepting requests in a broken state.

---

## 29. Shutdown Sequence

Handle termination signals.

Recommended behavior:

```text
1. Stop accepting new HTTP requests
2. Stop scheduler
3. Stop RPC server
4. Wait for active collection if appropriate
5. Close MongoDB client
6. Exit
```

Support at least:

```text
SIGINT
SIGTERM
```

---

## 30. README Requirements

`README.md` must include:

- project overview;
- architecture summary;
- prerequisites;
- environment variables;
- MongoDB setup;
- install command;
- run command;
- test command;
- HTTP endpoint examples;
- RPC startup instructions if implemented;
- RPC client usage if implemented;
- data model;
- data quality policy;
- known limitations;
- USDT/top-5 interpretation;
- exchange-selection interpretation.

---

## 31. Written Questions

The assignment requires a root-level:

```text
ANSWERS.md
```

It must answer the mandatory written questions from the task.

Important: the assignment explicitly requires these answers to be authored without AI/LLM assistance. They should therefore be written personally by the candidate and should not be generated from this specification.

The questions cover:

- MongoDB schema design;
- scheduling;
- data quality and edge cases;
- Hyperswarm RPC experience;
- testing strategy;
- production readiness;
- dependencies/tooling.

---

## 32. Acceptance Criteria

The implementation is complete when all mandatory requirements below are satisfied.

### Data collection

- [ ] Top 5 eligible cryptocurrencies are obtained from CoinGecko.
- [ ] Prices are collected against USDT.
- [ ] Up to 3 distinct CoinGecko-ranked exchanges are used.
- [ ] Invalid, stale, and anomalous ticker records are filtered.
- [ ] Arithmetic average is calculated correctly.

### Storage

- [ ] MongoDB is used.
- [ ] Historical samples are persisted.
- [ ] Exchange metadata used in the average is persisted.
- [ ] Raw unnecessary API payloads are not stored.
- [ ] `{ pair: 1, timestamp: -1 }` index exists.

### Execution

- [ ] Collection runs automatically at a configured interval.
- [ ] Collection can be triggered on demand.
- [ ] Overlapping collection runs are handled deterministically.

### HTTP

- [ ] Latest price endpoint exists.
- [ ] Historical price endpoint exists.
- [ ] Collection trigger endpoint exists.
- [ ] Validation and error responses are implemented.

### Data quality

- [ ] Partial upstream failures do not fail unrelated coins.
- [ ] Missing exchange data is handled.
- [ ] API failures are handled.
- [ ] Stale/anomalous prices are handled.
- [ ] Behavior is documented.

### Testing

- [ ] Successful query scenarios are tested.
- [ ] Empty results are tested.
- [ ] Invalid pairs are tested.
- [ ] Error handling is tested.

### Documentation

- [ ] README contains setup/run/test instructions.
- [ ] README documents assumptions and limitations.
- [ ] ANSWERS.md exists and is authored personally by the candidate.

### Bonus

- [ ] Hyperswarm RPC server implemented.
- [ ] `getLatestPrices` implemented.
- [ ] `getHistoricalPrices` implemented.
- [ ] RPC client demo implemented.
- [ ] RPC behavior covered by tests.

---

## 33. Recommended Implementation Priority

Given the assignment time limit, implement in this order:

```text
1. MongoDB connection + repository
2. CoinGecko client
3. Collection service
4. Data-quality filtering
5. Scheduled execution
6. On-demand execution
7. HTTP query API
8. Tests
9. README
10. Hyperswarm RPC bonus
11. RPC client
```

Do not sacrifice mandatory functionality or testing to complete the RPC bonus.

---

## 34. Key Design Decisions

The intended implementation should remain deliberately small.

Use:

```text
modular monolith
shared MongoDB
separate collection/query services
repository abstraction
one collection pipeline
one primary price_samples collection
HTTP + optional RPC adapters
```

Avoid unnecessary infrastructure.

The design should optimize for:

```text
clarity
testability
correctness
small persistent documents
predictable query patterns
easy local execution
```

rather than premature distributed-system complexity.

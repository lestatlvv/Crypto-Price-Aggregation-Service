# Q1 — MongoDB Schema Design

```
Describe the schema/collection structure you chose for storing price data. Why did you design
it this way? What trade-offs did you consider (e.g. document size, query patterns, indexing)?
```

I used one collection with each document storing an aggregated price for a trading pair at a specific  time. It fits the requirements - latest prices and historical ranges.

I chose the next index for the data:

```js
{ pair: 1, timestamp: -1 }
```
This provides a fast lookup table for pairs and keep the data ordered by time for efficient historical queries.

One trade-off is duplication of exchange identifiers.


# Q2 — Scheduling Approach
```
What library or mechanism did you use for scheduling the pipeline (e.g. node-cron,
setInterval, a job queue, something else)? Why did you pick that over the alternatives?
What would you change if this needed to run across multiple instances?
```

I used the native Node.js timer mechanism rather than node-cron or a job queue. It is sufficient to meet the requirements while keeping the service as a single process and avoiding unnecessary operational complexity.

if running across multiple instances needed then I would add/change: 
 - external scheduler for this this workload
 - queue for jobs
 - workers
 and implemented retry policies.

# Q3 — Data Quality & Edge Cases
```
What data quality issues did you anticipate or encounter? How does your code handle them?
Give at least two concrete examples.
```

I encountered the CoinGecko's public API rate limit then I have added a rate  limiting to the the outgoing CoinGecko API client to ensure the software stay within the allowed request rate. 
Additionaly, I implemented a mock service that emulates the CoinGecko API, allowing the application to be tested and debuggged without consuming the public API rate limit.
HTTP responses, error scenarios and requests timeouts are also covered by tests.

Addionaly I anticipated missing/invalid price and partial exchange data.



# Q4 — Hyperswarm RPC - Optional
```
Had you used Hyperswarm RPC (or any Holepunch libraries) before this task? Describe briefly how you approached learning / integrating it. What surprised you or what would you do differently next time?
```

I had not used Hyperswarm RPC before this task.
I started to use Hyperswarm RPC to build a small issolated RPC prototype before integrating it into the applicatoin. This help me understand p2p communication technologies.

# Q5 — Testing Strategy
```
Describe your testing approach. What did you prioritise testing and why? If you had more
time, what additional tests would you add?
```
As I mentioned above, I have been added a mock service to run application against a simulated  CoinGecko API. I also used a layered testing strategy like: unit, integration and e2e tests to cover core functionality.
To validate system stability and historical functionaly I would also add:
- long-running e2e test;
- load-focused e2e test covering both RPC and HTTPS endpoints.

# Q6 — Production Readiness
```
If this service were going to production, what would you add or change? Think about: error
handling, logging, monitoring, deployment, scaling, security.
```
I would:
- add rate limiting for incoming requests for RPC and HTTPS clients
- add metrics observability: incoming request(HTTP/RPC) latency and duration , success/error income request rates, CoinGecko latency and error rate, retry counts, DB latency, number of skipped requests, age of the latest stored data, number of concurrent RPC client connections.
- add graceful shutdown
- add a logging framework
- limit historical query sizes
- validate all HTTP and RPC inputs
- validate CoinGecko responses
- keep all credentials in a secret manager
- add TLS

Additionaly I would package the application to a container and run it as non-root user and set up a  CI/CD pipeline for automated testing, building, and deployment.

# Q7 — Dependencies & Tooling

```
List the key npm packages you used (beyond the ones specified in the requirements). For
each one, briefly explain why you chose it over alternatives.
```

```
express
```
I chose Express because the HTTP API is small and does not require the additional application framework such as Nest.js.

```
mongodb-memory-server
```
This is a development dependency used for integration testing instead of mocking Mongoose models

```
supertest
```
I used it for HTTP e2e/integration testing. It can call the express application directly to test routing, middleware, validation, status code.

```
@hyperswarm/dht
@hyperswarm/rpc
mongoose
```
specified in the requirements

I kept the dependency list small and used Node.js built-in functionality where is was sufficient.

Objective & Requirements / Task Overview

Build a crypto currency price aggregation service that collects market data, stores it, and
exposes it over an http API and optionally over an Hyperswarm RPC.

Detailed Requirements
1. Data Collection
- Fetch price data from the CoinGecko public API.
- Collect prices for the top 5 cryptocurrencies (by market cap, as determined by
CoinGecko) priced against USDt.
- For each currency, fetch prices from the top 3 exchanges (as determined by
CoinGecko) and compute an average price across those exchanges.
2. Data Processing
- Store only the minimal necessary data — assume the dataset will grow over time.
- Retain relevant metadata about which exchanges contributed to each price
calculation.
- Handle data quality issues (e.g. missing exchange data, API errors, stale prices).
Document what you handle and how.
3. Data Storage
- Use MongoDB for persistent storage.
- You may use the native MongoDB driver, Mongoose, or any other library you prefer.
4. Scheduling
- Implement a mechanism to run the data collection pipeline at a regular interval (e.g.
every 30 seconds).
- The pipeline must also support on-demand execution (i.e. triggerable outside the
schedule).

5. BONUS - Data Exposure via RPC
Note: this is not required but it will be valued positively if completed, please complete every
other point before this to not get any negative valuation.
- Expose the stored data over Hyperswarm RPC.
- Implement the following RPC methods:
- getLatestPrices(pairs: string[]) — returns the most recent prices
for the given pairs.
- getHistoricalPrices(pairs: string[], from: number, to:
number) — returns prices within a time range.

- Write a simple RPC client that demonstrates calling these methods and printing
results.
6. Testing
- Write end-to-end API tests for the RPC methods (using supertest, tap, or a similar
approach).
- Tests should cover at least: successful queries, edge cases (empty results, invalid
pairs), and error handling.

Technical Constraints
- JavaScript only (Node.js). No TypeScript.
- No UI required.
- Include a README.md with setup instructions and how to run the service + tests.

Written Questions
These are mandatory. Answer them in a file called ANSWERS.md in the root of your
repository. We read these carefully — they help us understand your thinking beyond the code.
It is MANDATORY TO NOT USE AI / LLMS TO ANSWER THESE QUESTIONS. If we
believe the answers were thought and written by AI, your candidacy for this position may be
immediately disqualified.

Q1 — MongoDB Schema Design
Describe the schema/collection structure you chose for storing price data. Why did you design
it this way? What trade-offs did you consider (e.g. document size, query patterns, indexing)?
Q2 — Scheduling Approach
What library or mechanism did you use for scheduling the pipeline (e.g. node-cron,
setInterval, a job queue, something else)? Why did you pick that over the alternatives?
What would you change if this needed to run across multiple instances?
Q3 — Data Quality & Edge Cases
What data quality issues did you anticipate or encounter? How does your code handle them?
Give at least two concrete examples.
Q4 — Hyperswarm RPC - Optional
Had you used Hyperswarm RPC (or any Holepunch libraries) before this task? Describe
briefly how you approached learning / integrating it. What surprised you or what would you do
differently next time?
Q5 — Testing Strategy
Describe your testing approach. What did you prioritise testing and why? If you had more
time, what additional tests would you add?
Q6 — Production Readiness
If this service were going to production, what would you add or change? Think about: error
handling, logging, monitoring, deployment, scaling, security.
Q7 — Dependencies & Tooling
List the key npm packages you used (beyond the ones specified in the requirements). For
each one, briefly explain why you chose it over alternatives.

Time Expectation
Spend no more than 6 hours on this, ideally around 4 hours. We know it may not be
possible to complete everything in that time.

If you run out of time, write up what is missing and how you would complete it in
ANSWERS.md. Partial implementations with clear explanations of limitations and next steps
are perfectly acceptable.
Good luck!

Reference Links/ Resources:
- @hyperswarm/rpc on npm
Note - Optional - you can use the hyperdht CLI ( https://github.com/holepunchto/hyperdht )
with the command hyperdht --bootstrap --host 127.0.0.1 --port 30001 to
launch a local bootstrap node in case the public dht is not working on your network.

Duration for completion:
Should be possible in 4 hours, 6 hours total are allowed for submission

Submission Steps
Format of Submission
Github Repository containing the code you produced.
Must haves
Push your code to a private GitHub repository and invite us as collaborators (we will provide
the GitHub handles).
- Make sure ANSWERS.md is included.
- Make sure the README.md has clear instructions for running your solution.

Github IDs to be added (as applicable)
- Rilindmehmeti
- VirginiaTether

Best Practices
- Follow the requirements closely
- Answer to the written questions
- Spend a full hour if not more on testing and answering about testing

Evaluation Criterias
- Code completeness
- Code design / Architecture
- Best practices (e.g. testing)
- Quality of answers given
- Answering without the help of an LLM
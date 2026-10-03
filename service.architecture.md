# Description
a modular monolith with separated command and query application services and a shared repository layer. Reads and writes use the same MongoDB instance, while the collection pipeline and query API remain logically isolated

# Scheme
                        CoinGecko public API.
                                |
HTTP ─┐                         |
      ├── PriceService(Query, Collection, Repository) ── MongoDB
RPC ──┘
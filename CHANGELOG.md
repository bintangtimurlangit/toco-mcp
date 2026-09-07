# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-08

Initial release.

### Added

- **Marketplace discovery**
  - `search_products` — free-text search with price, condition, city, category, official-store filters and eight sort presets
  - `get_search_suggestions` — autocomplete for partial search terms
  - `get_product_detail` — description, effective price, stock, shipping dimensions, category path, seller
  - `get_product_variants` — per-SKU price and stock across variant axes
  - `get_product_promos` — eligible vouchers and free-shipping subsidies
  - `get_product_reviews` — reviews with the overall rating summary
- **Stores**
  - `get_store_info` — seller profile, rating, KYC and tier badges
  - `get_store_products` — a store's catalogue, searchable and filterable
  - `search_stores` — find sellers by name, city, or official status
- **Taxonomy**
  - `get_category_tree` — browse departments, categories, and types, and get the UUIDs the search tools accept
- **Classifieds**
  - `search_vehicles` — car and motorbike ads filtered by production year, mileage, and transmission
  - `search_properties` — property ads filtered by bedrooms, bathrooms, building and lot area, and sale-vs-rent
- Zero-config operation — no API key, no login, no browser automation
- Bounded in-memory TTL cache with in-flight request coalescing
- Retry with exponential backoff and `Retry-After` support on transient failures
- Live smoke test covering every registered tool, which fails if a tool has no check
- [`reference/API.md`](./reference/API.md) documenting the Toco endpoints this server builds on

[Unreleased]: https://github.com/bintangtimurlangit/toco-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bintangtimurlangit/toco-mcp/releases/tag/v1.0.0

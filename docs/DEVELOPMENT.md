# Development

## Scripts

| Command             | Description                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| `npm install`       | Install dependencies                                                                  |
| `npm run build`     | Compile TypeScript to `build/` (`tsc`)                                                |
| `npm run dev`       | Watch mode: `tsx watch src/index.ts`                                                  |
| `npm run start`     | Run compiled server: `node build/index.js`                                            |
| `npm run typecheck` | `tsc --noEmit`, strict, with unused-symbol checks                                     |
| `npm run test:unit` | Offline unit tests — no network                                                       |
| `npm test`          | Unit tests, then a **live health check** calling every tool against the real Toco API |

## Project layout

```
src/
  index.ts          # MCP server entry; registers all tool groups
  api/
    http.ts         # retry/backoff, error type, TTL cache + in-flight coalescing
    client.ts       # the three transports: search service, backend REST, _next/data
    query.ts        # buildSearchBody() — the shared /listing-search request builder
    listing.ts      # slug normalisation + the shared listing/page loaders
    types.ts        # shared listing, store, taxonomy, and page-props types
  tools/
    search.ts       # search_products, get_search_suggestions
    product.ts      # get_product_detail, get_product_variants, get_product_promos
    reviews.ts      # get_product_reviews
    store.ts        # get_store_info, get_store_products, search_stores
    category.ts     # get_category_tree
    classified.ts   # search_vehicles, search_properties
  utils/
    cache.ts        # in-memory TTL cache (bounded, oldest-first eviction)
    errors.ts       # withErrorHandling wrapper, truncate helper
    format.ts       # rupiah, ratings, listing/store renderers, pagination footer
test/
  smoke.ts          # the npm test health check (live)
  query.test.ts     # offline tests for the search-body builder
  format.test.ts    # offline tests for price/slug/rendering helpers
  cache.test.ts     # offline tests for the cache, eviction, and coalescing
```

## How the Toco API is used (important)

Toco has no anti-bot layer and no auth on its read endpoints, so this is a plain
`fetch` client — no browser, no cookies. There are **three** transports, and picking
the wrong one for a new tool is the easiest mistake to make:

1. **Search service** — `POST toco.id/api/toco-api/search`. An envelope: `path` picks the
   sub-service (`/listing-search`, `/listing-suggestion`, `/store-search`) and `body` is
   that service's request. This is the workhorse; every list-returning tool uses it.

2. **Backend REST** — `GET api-main.tocobagus.net/api/...`. Used for listing detail
   (`/api/listing/{slug}`) and the taxonomy (`/api/category`).

3. **`_next/data`** — `GET toco.id/_next/data/{buildId}/<route>.json`. For data that is
   only server-rendered and has no XHR: **product reviews** and **store profiles**.

### The `buildId` is the fragile part

Transport 3 embeds a Next.js build id that **rotates on every Toco deploy**. It is scraped
from `__NEXT_DATA__` on the homepage, cached, and — on a 404 — re-scraped once before the
request is retried (`nextData()` in `src/api/client.ts`). Without that retry, every review
and store lookup would break for hours after each Toco deploy. If you touch that function,
keep the refresh-and-retry path.

### `add_to_cart` splits the catalogue

One flag decides whether a listing is a buyable product or a classified ad:

- `add_to_cart: true` → marketplace product (stock, variants, cart)
- `add_to_cart: false` → classified ad (vehicle, property, service)

Getting it wrong returns the wrong half of the catalogue **without erroring**, which is why
`buildSearchBody()` requires it explicitly rather than defaulting, and why `query.test.ts`
pins it. The classified tools additionally pin their department UUID — `add_to_cart: false`
alone lets car _parts_ leak into vehicle results.

### Other traps

- **`price_special` vs `price`.** `price_special` is the effective/sale price and is what
  the index filters and sorts on. On the detail endpoint it can be `null`, where `price` applies.
- **`new` is tri-state.** Omitting it returns both new and second-hand. Only send it when
  the caller picked a side.
- **`store-search` totals are capped** at 10,000 by the index — a flat `10000` is a floor,
  not a count, and is rendered as `10,000+`.
- **Ratings without reviews.** Toco returns a `rating` even when nothing has been reviewed;
  the formatters suppress it unless a review count backs it.

## When Toco changes

A tool can break silently. **`npm test` is the tripwire** — it spawns the real server and
calls every tool against live Toco, and it also fails if a registered tool has no check, so
new tools cannot ship untested. CI runs it on a weekly schedule.

If a check fails, capture the current request from a browser: open the relevant Toco page
with DevTools → Network, find the call, and compare its payload against what
`src/api/query.ts` or `src/api/client.ts` sends. [`reference/API.md`](../reference/API.md)
records the shapes as captured, and is the place to update when they drift.

## Build output

`npm run build` emits JavaScript under **`build/`**. The repo **gitignores** `build/`; CI and
**`prepublishOnly`** run **`npm run build`** so the npm tarball always ships compiled files.

## Local MCP testing

After `npm run build`, use **`node`** with an absolute path to **`build/index.js`** in your
`mcpServers` entry, or **`npm link`** and the **`toco-mcp`** bin. See
[Configuration](./CONFIGURATION.md).

## Tech stack

- TypeScript, **strict** (with `noUnusedLocals` / `noUnusedParameters`)
- Zod for MCP tool input validation
- `@modelcontextprotocol/sdk` (stdio server + client for the smoke test)

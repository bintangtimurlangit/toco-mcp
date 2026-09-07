# Toco API — reconnaissance notes

Captured 2026-09-08 against `https://toco.id`. Everything below was verified live
with `curl` — **no browser, no cookies, no login**.

## TL;DR

Toco does **not** need CloakBrowser. It is a Next.js (Pages Router) frontend over a
plain REST backend, and every read surface a discovery MCP needs answers to an
anonymous `fetch`. This is a `tokopedia-mcp`-shaped project, not a `shopee-mcp`-shaped one.

|           | Toco            | Tokopedia      | Shopee         |
| --------- | --------------- | -------------- | -------------- |
| Transport | plain JSON REST | public GraphQL | signed XHR     |
| Anti-bot  | none observed   | none           | anti-fraud SDK |
| Approach  | `fetch`         | `fetch`        | CloakBrowser   |

## Hosts

| Host                             | Role                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `toco.id`                        | Next.js frontend; also hosts `/api/*` route handlers that proxy the search service |
| `api-main.tocobagus.net`         | main backend REST API (axios `baseURL`, header `x-platform-type: web`)             |
| `d13eru2cpf9i9v.cloudfront.net`  | images / static assets                                                             |
| `toco-share-cards.tocobagus.net` | OG + share card images                                                             |

Authenticated endpoints take `Authorization: Bearer <supabase access_token>`.
Everything listed under "Public read surface" needs no such header.

## Public read surface (verified 200)

### 1. Search service — `POST https://toco.id/api/toco-api/search`

The primary endpoint. An envelope that proxies three sub-paths:

```jsonc
{ "path": "/listing-search" | "/listing-suggestion" | "/store-search", "body": { ... } }
```

**`/listing-search`** — request body:

```jsonc
{
  "from": 0, "size": 20,
  "query": "sepatu pria",
  "search_operator": "and" | "or",
  "sort_mode": "relevance_only" | "field_only",
  "include_quality_score": true,
  "filters": {
    "web": true,
    "add_to_cart": true,        // true = marketplace, false = classifieds
    "department": "<uuid>", "category": ["<uuid>"], "type": "<uuid>",
    "sub_type_category": ["<uuid>"],
    "price_special": { "min": 0, "max": 500000 },
    "new": true,                 // omitted = both new and second-hand
    "city": ["Kota Bandung"],
    "store_id": "<uuid>", "official_seller": true, "store_tier": ["..."],
    "collections": ["tren-terkini"],
    "special_daytop": false, "safe_search": true
  },
  "sort_param": [{ "field": "sold", "order": "desc" }],
  "aggregations": { "department_agg": { "terms": { "field": "department" } } }
}
```

Response: `{ results[], total, query, filters, aggregations, search_id }`.
`sort_param` accepts arbitrary listing fields — `sold`, `rating`, `review_count`,
`views`, `likes`, `price_special`, `created_at` all confirmed working.

Each result carries **108 fields**, including: `id, slug, title, price, price_special,
stock, sold, new, city, rating, rating_count, review_count, views, likes, wish_count,
cart_count, store{}, store_tier, official_seller, department, category, category_name,
type, sub_type, is_free_ongkir, cod, is_preorder, has_variant, photos, thumbnails,
created_at` — plus classified-specific fields (`production_year, mileage,
transmission_type, fuel, license_plate_category, lot_area, building_area,
number_of_bedroom, number_of_bathroom, rental_type, legal_certificate, facilities`).

**`/listing-suggestion`** — `{ query, limit, filters: { add_to_cart, official_seller } }`
→ `{ suggestions: string[], query, search_id }`. Autocomplete.

**`/store-search`** — `{ query, limit, offset, source: [...fields], filters: { toco_city,
official_seller, store_tier }, aggregations }` → `{ results[], total, aggregations }`.

### 2. Listing detail — `GET https://api-main.tocobagus.net/api/listing/{slug}`

Returns `{ code, data: { listing, variant_types_and_values, variants[], wishlists,
shopping_cart } }`. `listing` embeds fully expanded `department`, `category`, `type`,
`sub_type`, `store`, and a `promo[]` array of eligible vouchers (free-shipping etc.).
`variants[]` gives per-SKU `price`, `stock`, `photos`, and the two variant axes.

### 3. Reviews + rating summary — `GET https://toco.id/_next/data/{buildId}/listing/{slug}.json`

There is no standalone review endpoint; reviews are server-rendered. `pageProps` gives:

- `summary: { rating_average, rating_count }`
- `reviews: [{ rate, review_text, created_at, user_display_name }]` (top 5)
- `auctionDetails`, `listingMetaData`, and the full listing under `dehydratedState`

**`buildId` is not stable** — it changes on every Toco deploy. Scrape it from
`__NEXT_DATA__.buildId` on any page and cache it; re-scrape on 404.

### 4. Taxonomy — `GET https://api-main.tocobagus.net/api/category`

Full department list with `id, name_id, name_en, slug, icon, sort, classified`.
Departments where `classified: true` (Kendaraan, Properti) are listing-style ads;
the rest are marketplace. Category and type UUIDs come back embedded in listing
detail and in the search `aggregations`.

### 5. Homepage / category / store pages — `_next/data`

`GET https://toco.id/_next/data/{buildId}/<route>.json`, all SSR with real data:

- `/` → `menus[]`, `layoutConfig[]`, banners, `departments`
- `/p/{department}` (and `/{category}/{type}`) → resolved `department` object
- `/store/{tocoShortName}` → `profile` / `storeMetaData` (20 fields: `toco_name`,
  `toco_city`, `rating`, `active_product`, `official_seller`, `store_tier`, KYC state…)
- `/mall`, `/campaign/{slug}`, `/discovery/{slug}`, `/bundle/{slug}`

### 6. Legacy raw-Elasticsearch route (do not use)

`POST /api/elastic/ads/fetchAdsV2` takes a raw ES DSL body. It currently returns
**HTTP 500** and is superseded by `/api/toco-api/search`. Its client-side query
builder is still the best documentation of the underlying ES field names.

## Site routes (from `_buildManifest.js`)

Public: `/search`, `/find/[keyword]`, `/listing/[listingSlug]`, `/store/[tocoShortName]`,
`/p/[department]/[category]/[type]`, `/classified/{kendaraan,property}`,
`/classified/p/[department]/[category]/[type]`, `/mall`, `/mall/brand-categories`,
`/campaign/[slug]`, `/discovery/[discoverSlug]`, `/bundle/[slug]`, `/lelang` (auction),
`/community/{post,event}/[slug]`, `/article/[slug]`.

Authenticated: `/cart`, `/checkout`, `/orders`, `/chat`, `/notifications`, `/seller`, `/invoice`.

## Notes / gotchas

- `add_to_cart` is the marketplace-vs-classified switch, and it is easy to get wrong:
  `true` = buyable product, `false` = classified ad (vehicle/property/service).
- `store_search` reports `total: 10000` — an ES `track_total_hits` cap, not a real count.
- `price` vs `price_special`: `price_special` is the effective/sale price and is what
  search filters and sorts on; it can be `null` on the detail endpoint, where `price` applies.
- Prices are integer IDR (no minor units).
- Locale is `en` by default with `id` available; category names ship as `name_id` / `name_en`.

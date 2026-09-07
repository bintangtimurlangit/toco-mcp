# Toco MCP

[![npm version](https://img.shields.io/npm/v/@bintangtimurlangit/toco-mcp.svg)](https://www.npmjs.com/package/@bintangtimurlangit/toco-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A zero-config [Model Context Protocol](https://modelcontextprotocol.io) server for
discovering **[Toco](https://toco.id)** — Indonesia's community marketplace, founded by
the creator of Tokobagus and built on 0% sales commission.

**No login, no API key, no browser automation.** Toco serves its catalogue over a public
JSON API, so this server is a plain HTTP client. It is strictly **read-only**: it searches
and reads, and never carts, buys, messages, or writes anything.

## What it does

- 🔍 **Search products** — free-text plus price, condition, city, category, and official-store filters
- 💡 **Autocomplete** — see how sellers actually spell a product before searching
- 📦 **Product detail** — description, effective price, stock, shipping dimensions, category path, seller
- 🎨 **Variants** — per-SKU price and stock across variant axes like Color and Size
- 🎟 **Promos** — vouchers and free-shipping subsidies a listing qualifies for
- 📝 **Reviews** — ratings and written reviews with the overall summary
- 🏬 **Stores** — seller profiles, their catalogue, and store search
- 🗂 **Categories** — the full department → category → type taxonomy
- 🚗 **Vehicle ads** — classified cars and motorbikes, filtered by year, mileage, transmission
- 🏠 **Property ads** — houses and land for sale or rent, filtered by bedrooms and area

## Install

```bash
npm install -g @bintangtimurlangit/toco-mcp
```

## Configure

Add to your MCP client config (for Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "toco": {
      "command": "npx",
      "args": ["-y", "@bintangtimurlangit/toco-mcp"]
    }
  }
}
```

That's the whole setup — there is nothing to authenticate. See
[docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for local-build and tuning options.

## Tools

| Tool                     | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `search_products`        | Search buyable marketplace products with filters and sorting |
| `get_search_suggestions` | Autocomplete suggestions for a partial search term           |
| `get_product_detail`     | Full detail for one listing                                  |
| `get_product_variants`   | Every variant SKU with its own price and stock               |
| `get_product_promos`     | Vouchers and promotions a listing is eligible for            |
| `get_product_reviews`    | Reviews and rating summary                                   |
| `get_store_info`         | A seller's profile                                           |
| `get_store_products`     | What a specific store sells                                  |
| `search_stores`          | Find sellers by name, city, or official status               |
| `get_category_tree`      | Browse the taxonomy and get category UUIDs                   |
| `search_vehicles`        | Classified car and motorbike ads                             |
| `search_properties`      | Classified property ads                                      |

Product and store arguments accept either a slug (`sepatu-pria-30`) or a pasted URL
(`https://toco.id/listing/sepatu-pria-30`).

## Marketplace vs. classifieds

Toco is two catalogues behind one search index, split by an `add_to_cart` flag:

- **Marketplace** listings are buyable — they have stock, variants, and a cart. Use `search_products`.
- **Classified** listings are contact-the-seller ads — vehicles, property, services. Use `search_vehicles` / `search_properties`.

Searching for `"avanza"` with the wrong one returns car _parts_ instead of cars, so the
tools are split along that line rather than exposing the flag as a filter.

## Example prompts

> Find running shoes on Toco under Rp300.000, sorted by most sold.

> What variants does this Toco listing have, and which sizes are out of stock?

> Show me second-hand Toyota Avanzas from 2018 or newer with under 100,000 km.

> Find 3-bedroom houses for sale in Bandung with at least 100 m² of building area.

> Which official Toco Mall stores sell coffee, and what are they rated?

## Documentation

- [Configuration](./docs/CONFIGURATION.md)
- [Development](./docs/DEVELOPMENT.md)
- [Releases](./docs/RELEASES.md)
- [Toco API reference](./reference/API.md) — the reconnaissance notes this server is built on
- [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md)

## Disclaimer

Unofficial and not affiliated with, endorsed by, or sponsored by Toco. It reads the same
public endpoints a visitor's browser does, at a browser's pace. Respect Toco's
[terms of service](https://toco.id/privacy). Because it depends on undocumented endpoints,
Toco can change them at any time — `npm test` is the tripwire that catches it.

## License

MIT © [bintangtimurlangit](https://github.com/bintangtimurlangit)

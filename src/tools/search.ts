import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchService } from '../api/client.js';
import { buildSearchBody, SORT_PRESETS, type SortPreset } from '../api/query.js';
import type { ListingSearchResponse, SuggestionResponse } from '../api/types.js';
import { cache } from '../utils/cache.js';
import { withErrorHandling } from '../utils/errors.js';
import { formatProduct, num, pageFooter } from '../utils/format.js';

const SORT_KEYS = Object.keys(SORT_PRESETS) as [SortPreset, ...SortPreset[]];

export function registerSearchTools(server: McpServer): void {
  server.tool(
    'search_products',
    'Search buyable products on the Toco marketplace (toco.id). Supports free-text queries plus price, condition, city, category, and official-store filters. Returns titles, prices, ratings, sales counts, stores, and product URLs. For cars, motorbikes, or property use search_vehicles / search_properties instead — those are classified ads, not buyable products.',
    {
      query: z
        .string()
        .min(1)
        .optional()
        .describe('Search keywords, e.g. "sepatu pria". Omit to browse by filters alone.'),
      page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Results per page, max 50 (default: 20)'),
      minPrice: z.number().int().min(0).optional().describe('Minimum price in IDR'),
      maxPrice: z.number().int().min(0).optional().describe('Maximum price in IDR'),
      condition: z
        .enum(['new', 'second'])
        .optional()
        .describe('Filter by item condition. Omit to include both.'),
      cities: z
        .array(z.string())
        .optional()
        .describe('Filter by city names as Toco spells them, e.g. ["Kota Bandung"]'),
      departmentId: z.string().uuid().optional().describe('Department UUID from get_category_tree'),
      categoryIds: z
        .array(z.string().uuid())
        .optional()
        .describe('Category UUIDs from get_category_tree'),
      officialOnly: z
        .boolean()
        .default(false)
        .describe('Only return listings from official Toco Mall stores (default: false)'),
      sort: z.enum(SORT_KEYS).default('relevance').describe('Sort order (default: relevance)'),
    },
    async (args) => {
      return withErrorHandling(async () => {
        const { query, page, limit, sort } = args;
        const cacheKey = cache.key('search', JSON.stringify(args));
        const hit = cache.get<string>(cacheKey);
        if (hit) return { content: [{ type: 'text', text: hit }] };

        const body = buildSearchBody({
          query,
          page,
          size: limit,
          addToCart: true,
          department: args.departmentId,
          category: args.categoryIds,
          price: { min: args.minPrice, max: args.maxPrice },
          condition: args.condition,
          cities: args.cities,
          officialOnly: args.officialOnly,
          sort,
        });

        const data = await searchService<ListingSearchResponse>('/listing-search', body);
        const results = data.results ?? [];

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: query
                  ? `No products found for "${query}" with these filters. Try broader terms or fewer filters.`
                  : 'No products matched these filters.',
              },
            ],
          };
        }

        const header = [
          `🔍 **Toco product search**${query ? ` — "${query}"` : ''}`,
          `📦 ${num(data.total)} results | page ${page} | sorted by ${sort}`,
          '',
        ];
        const blocks = results.map((l, i) => formatProduct(l, (page - 1) * limit + i + 1));
        const text = [...header, blocks.join('\n\n'), '', pageFooter(page, limit, data.total)].join(
          '\n',
        );

        cache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      });
    },
  );

  server.tool(
    'get_search_suggestions',
    "Get Toco's autocomplete suggestions for a partial search term. Useful for discovering how sellers actually spell a product before running search_products.",
    {
      query: z.string().min(1).describe('Partial search term, e.g. "sepa"'),
      limit: z.number().int().min(1).max(20).default(10).describe('Max suggestions (default: 10)'),
      officialOnly: z
        .boolean()
        .default(false)
        .describe('Bias suggestions to official Toco Mall stores (default: false)'),
    },
    async ({ query, limit, officialOnly }) => {
      return withErrorHandling(async () => {
        const cacheKey = cache.key('suggest', query, limit, officialOnly);
        const hit = cache.get<string>(cacheKey);
        if (hit) return { content: [{ type: 'text', text: hit }] };

        const data = await searchService<SuggestionResponse>('/listing-suggestion', {
          query,
          limit,
          filters: { add_to_cart: true, ...(officialOnly ? { official_seller: true } : {}) },
        });

        const suggestions = data.suggestions ?? [];
        if (suggestions.length === 0) {
          return {
            content: [{ type: 'text', text: `No suggestions for "${query}".` }],
          };
        }

        const text = [
          `💡 **Suggestions for "${query}"**`,
          '',
          ...suggestions.map((s, i) => `${i + 1}. ${s}`),
        ].join('\n');

        cache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      });
    },
  );
}

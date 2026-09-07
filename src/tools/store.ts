import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cachedNextData, searchService } from '../api/client.js';
import { buildSearchBody, SORT_PRESETS, type SortPreset } from '../api/query.js';
import type { ListingSearchResponse, StorePageProps, StoreSearchResponse } from '../api/types.js';
import { cache } from '../utils/cache.js';
import { withErrorHandling, truncate } from '../utils/errors.js';
import { formatProduct, formatStore, num, pageFooter, stars, storeUrl } from '../utils/format.js';

const SORT_KEYS = Object.keys(SORT_PRESETS) as [SortPreset, ...SortPreset[]];

/** Accepts a short name or a full /store/<shortName> URL. */
function normalizeShortName(input: string): string {
  const match = /\/store\/([^/?#]+)/.exec(input.trim());
  return decodeURIComponent(match ? match[1] : input.trim().replace(/^\/+|\/+$/g, ''));
}

export function registerStoreTools(server: McpServer): void {
  server.tool(
    'get_store_info',
    'Get a Toco seller\'s profile: display name, city, description, rating, active product count, official/tier badges, and KYC status. Takes the store short name (e.g. "ysn-store") or a full toco.id/store/... URL.',
    {
      store: z.string().min(1).describe('Store short name or full toco.id/store/... URL'),
    },
    async ({ store }) => {
      return withErrorHandling(async () => {
        const shortName = normalizeShortName(store);
        const page = await cachedNextData<StorePageProps>(
          'store-page',
          `store/${encodeURIComponent(shortName)}`,
        );

        if (page.notFound) {
          return {
            content: [{ type: 'text', text: `❌ No Toco store found for "${shortName}".` }],
          };
        }
        if (page.isBanned) {
          return {
            content: [{ type: 'text', text: `⚠️ The Toco store "${shortName}" is banned.` }],
          };
        }

        // A missing store still answers 200 — it just carries no profile.
        const p = page.profile ?? page.storeMetaData;
        if (!p) {
          return {
            content: [{ type: 'text', text: `❌ No Toco store found for "${shortName}".` }],
          };
        }

        const lines = [`# 🏬 ${(p.toco_name ?? shortName).trim()}`, ''];
        if (p.official_seller) lines.push('🏅 Official Toco Mall store');
        if (p.store_tier) lines.push(`🏪 Tier: ${p.store_tier}`);
        if (p.toco_city) lines.push(`📍 ${p.toco_city}`);
        if (p.rating) lines.push(`⭐ ${stars(p.rating)} ${p.rating}/5`);
        if (typeof p.active_product === 'number') {
          lines.push(`📦 ${num(p.active_product)} active products`);
        }
        if (p.profile_kyc) lines.push(`🪪 KYC: ${p.profile_kyc}`);
        if (p.is_online) lines.push('🟢 Online now');
        else if (p.latest_online) lines.push(`🕒 Last online ${p.latest_online.slice(0, 10)}`);
        if (p.toco_description?.trim()) {
          lines.push('', '## About', truncate(p.toco_description.replace(/\s+/g, ' ').trim(), 600));
        }
        if (p.id) {
          lines.push('', `Use get_store_products with "${shortName}" to list what they sell.`);
        }
        lines.push('', `🔗 ${storeUrl(shortName)}`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      });
    },
  );

  server.tool(
    'get_store_products',
    'List the products a specific Toco store sells, with optional keyword and price filtering. Takes the store short name or a full toco.id/store/... URL.',
    {
      store: z.string().min(1).describe('Store short name or full toco.id/store/... URL'),
      query: z.string().optional().describe('Optional keywords to search within the store'),
      page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(50).default(20).describe('Results per page (default: 20)'),
      minPrice: z.number().int().min(0).optional().describe('Minimum price in IDR'),
      maxPrice: z.number().int().min(0).optional().describe('Maximum price in IDR'),
      sort: z.enum(SORT_KEYS).default('relevance').describe('Sort order (default: relevance)'),
    },
    async ({ store, query, page, limit, minPrice, maxPrice, sort }) => {
      return withErrorHandling(async () => {
        const shortName = normalizeShortName(store);
        const profilePage = await cachedNextData<StorePageProps>(
          'store-page',
          `store/${encodeURIComponent(shortName)}`,
        );
        const profile = profilePage.profile ?? profilePage.storeMetaData;
        const storeId = profile?.id;

        if (!storeId) {
          return {
            content: [
              { type: 'text', text: `❌ Could not resolve a store id for "${shortName}".` },
            ],
          };
        }

        const body = buildSearchBody({
          query,
          page,
          size: limit,
          addToCart: true,
          storeId,
          price: { min: minPrice, max: maxPrice },
          sort,
        });
        const data = await searchService<ListingSearchResponse>('/listing-search', body);
        const results = data.results ?? [];

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No products found in **${profile?.toco_name ?? shortName}**${query ? ` matching "${query}"` : ''}.`,
              },
            ],
          };
        }

        const text = [
          `🏬 **Products from ${(profile?.toco_name ?? shortName).trim()}**${query ? ` — "${query}"` : ''}`,
          `📦 ${num(data.total)} products | page ${page} | sorted by ${sort}`,
          '',
          results.map((l, i) => formatProduct(l, (page - 1) * limit + i + 1)).join('\n\n'),
          '',
          pageFooter(page, limit, data.total),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      });
    },
  );

  server.tool(
    'search_stores',
    'Search for sellers on Toco by name or description. Filter by city, official-store status, or store tier. Returns store names, cities, ratings, and their toco.id links.',
    {
      query: z.string().min(1).describe('Store name or keywords, e.g. "kopi"'),
      page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(50).default(20).describe('Results per page (default: 20)'),
      cities: z
        .array(z.string())
        .optional()
        .describe('Filter by city as Toco spells it, e.g. ["Kota Surabaya"]'),
      officialOnly: z
        .boolean()
        .default(false)
        .describe('Only official Toco Mall stores (default: false)'),
    },
    async ({ query, page, limit, cities, officialOnly }) => {
      return withErrorHandling(async () => {
        const cacheKey = cache.key('stores', query, page, limit, String(cities), officialOnly);
        const hit = cache.get<string>(cacheKey);
        if (hit) return { content: [{ type: 'text', text: hit }] };

        const filters: Record<string, unknown> = {};
        if (cities && cities.length > 0) filters.toco_city = cities;
        if (officialOnly) filters.official_seller = true;

        const data = await searchService<StoreSearchResponse>('/store-search', {
          query,
          limit,
          offset: (page - 1) * limit,
          source: [
            'toco_name',
            'toco_short_name',
            'toco_description',
            'toco_city',
            'rating',
            'official_seller',
            'store_tier',
            'active_product',
          ],
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        });

        const results = data.results ?? [];
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No Toco stores found for "${query}".` }] };
        }

        // The index caps its hit counter, so a flat 10000 is a floor, not a count.
        const totalLabel = data.total >= 10000 ? '10,000+' : num(data.total);
        const text = [
          `🏬 **Toco store search — "${query}"**`,
          `${totalLabel} stores | page ${page}`,
          '',
          results.map((s, i) => formatStore(s, (page - 1) * limit + i + 1)).join('\n\n'),
        ].join('\n');

        cache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      });
    },
  );
}

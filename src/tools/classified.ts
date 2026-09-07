/**
 * Classified-ad search: vehicles and property.
 *
 * These are not buyable products — they carry `add_to_cart: false` and the buyer
 * contacts the seller. Both tools also pin the relevant department, because
 * `add_to_cart: false` alone lets car *parts* and property services leak into
 * the results.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchService } from '../api/client.js';
import {
  buildSearchBody,
  CLASSIFIED_DEPARTMENTS,
  SORT_PRESETS,
  type SortPreset,
} from '../api/query.js';
import type { ListingSearchResponse } from '../api/types.js';
import { withErrorHandling } from '../utils/errors.js';
import { formatProperty, formatVehicle, num, pageFooter } from '../utils/format.js';

const SORT_KEYS = Object.keys(SORT_PRESETS) as [SortPreset, ...SortPreset[]];

/** Only send a range when at least one bound was given. */
function range(min?: number, max?: number): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  if (typeof min === 'number') out.min = min;
  if (typeof max === 'number') out.max = max;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function registerClassifiedTools(server: McpServer): void {
  server.tool(
    'search_vehicles',
    'Search classified vehicle ads on Toco — cars and motorbikes listed by owners and dealers. Filter by production year, mileage, and transmission. These are contact-the-seller ads, not add-to-cart products.',
    {
      query: z
        .string()
        .optional()
        .describe('Keywords, e.g. "avanza" or "honda beat". Omit to browse by filters alone.'),
      page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(50).default(20).describe('Results per page (default: 20)'),
      minPrice: z.number().int().min(0).optional().describe('Minimum price in IDR'),
      maxPrice: z.number().int().min(0).optional().describe('Maximum price in IDR'),
      minYear: z.number().int().min(1900).max(2100).optional().describe('Earliest production year'),
      maxYear: z.number().int().min(1900).max(2100).optional().describe('Latest production year'),
      maxMileage: z.number().int().min(0).optional().describe('Maximum odometer reading in km'),
      transmission: z
        .enum(['automatic', 'manual'])
        .optional()
        .describe('Filter by transmission type'),
      cities: z.array(z.string()).optional().describe('Filter by city, e.g. ["Kota Bandung"]'),
      condition: z.enum(['new', 'second']).optional().describe('Item condition'),
      sort: z.enum(SORT_KEYS).default('relevance').describe('Sort order (default: relevance)'),
    },
    async (args) => {
      return withErrorHandling(async () => {
        const { query, page, limit, sort } = args;
        const extra: Record<string, unknown> = {};
        const year = range(args.minYear, args.maxYear);
        if (year) extra.production_year = year;
        const mileage = range(undefined, args.maxMileage);
        if (mileage) extra.mileage = mileage;
        if (args.transmission) extra.transmission_type = args.transmission;

        const body = buildSearchBody({
          query,
          page,
          size: limit,
          addToCart: false,
          department: CLASSIFIED_DEPARTMENTS.vehicles,
          price: { min: args.minPrice, max: args.maxPrice },
          condition: args.condition,
          cities: args.cities,
          sort,
          extraFilters: extra,
        });

        const data = await searchService<ListingSearchResponse>('/listing-search', body);
        const results = data.results ?? [];

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No vehicle ads found${query ? ` for "${query}"` : ''} with these filters. Try widening the year or price range.`,
              },
            ],
          };
        }

        const text = [
          `🚗 **Toco vehicle ads**${query ? ` — "${query}"` : ''}`,
          `📦 ${num(data.total)} results | page ${page} | sorted by ${sort}`,
          '_Classified ads — contact the seller directly._',
          '',
          results.map((l, i) => formatVehicle(l, (page - 1) * limit + i + 1)).join('\n\n'),
          '',
          pageFooter(page, limit, data.total),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      });
    },
  );

  server.tool(
    'search_properties',
    'Search classified property ads on Toco — houses, apartments, and land for sale or rent. Filter by bedrooms, bathrooms, building and lot area, and sale-vs-rent. These are contact-the-seller ads, not add-to-cart products.',
    {
      query: z
        .string()
        .optional()
        .describe('Keywords, e.g. "rumah bandung". Omit to browse by filters alone.'),
      page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(50).default(20).describe('Results per page (default: 20)'),
      minPrice: z.number().int().min(0).optional().describe('Minimum price in IDR'),
      maxPrice: z.number().int().min(0).optional().describe('Maximum price in IDR'),
      minBedrooms: z.number().int().min(0).optional().describe('Minimum number of bedrooms'),
      minBathrooms: z.number().int().min(0).optional().describe('Minimum number of bathrooms'),
      minBuildingArea: z.number().int().min(0).optional().describe('Minimum building area in m²'),
      minLotArea: z.number().int().min(0).optional().describe('Minimum lot area in m²'),
      listingType: z
        .enum(['sale', 'rent'])
        .optional()
        .describe('Restrict to properties for sale or for rent. Omit for both.'),
      cities: z.array(z.string()).optional().describe('Filter by city, e.g. ["Kota Medan"]'),
      sort: z.enum(SORT_KEYS).default('relevance').describe('Sort order (default: relevance)'),
    },
    async (args) => {
      return withErrorHandling(async () => {
        const { query, page, limit, sort } = args;
        const extra: Record<string, unknown> = {};
        const bed = range(args.minBedrooms, undefined);
        if (bed) extra.number_of_bedroom = bed;
        const bath = range(args.minBathrooms, undefined);
        if (bath) extra.number_of_bathroom = bath;
        const building = range(args.minBuildingArea, undefined);
        if (building) extra.building_area = building;
        const lot = range(args.minLotArea, undefined);
        if (lot) extra.lot_area = lot;

        const body = buildSearchBody({
          query,
          page,
          size: limit,
          addToCart: false,
          department: CLASSIFIED_DEPARTMENTS.property,
          price: { min: args.minPrice, max: args.maxPrice },
          cities: args.cities,
          sort,
          extraFilters: extra,
        });

        const data = await searchService<ListingSearchResponse>('/listing-search', body);
        const fetched = data.results ?? [];

        // `rental_type` is set on rentals and null on sales. The service has no
        // "is null" filter, so sale-vs-rent is narrowed client-side — which means
        // it thins the current page rather than the whole result set.
        const results = args.listingType
          ? fetched.filter((l) => (args.listingType === 'rent' ? !!l.rental_type : !l.rental_type))
          : fetched;

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No property ads found${query ? ` for "${query}"` : ''} with these filters. Try widening the area or price range.`,
              },
            ],
          };
        }

        const head = [
          `🏠 **Toco property ads**${query ? ` — "${query}"` : ''}`,
          `📦 ${num(data.total)} results | page ${page} | sorted by ${sort}`,
          '_Classified ads — contact the seller directly._',
        ];
        if (args.listingType) {
          head.push(
            `_Narrowed to "${args.listingType}" after fetching: ${results.length} of ${fetched.length} on this page. Page through for more._`,
          );
        }

        const text = [
          ...head,
          '',
          results.map((l, i) => formatProperty(l, (page - 1) * limit + i + 1)).join('\n\n'),
          '',
          pageFooter(page, limit, data.total),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      });
    },
  );
}

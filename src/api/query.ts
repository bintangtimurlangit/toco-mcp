/**
 * Builds request bodies for the `/listing-search` service.
 *
 * The single most important field is `add_to_cart`, which is Toco's
 * marketplace-vs-classified switch:
 *
 *   add_to_cart: true   → buyable marketplace product (has stock, cart, variants)
 *   add_to_cart: false  → classified ad (vehicle, property, service) — contact the seller
 *
 * Getting it wrong silently returns the wrong half of the catalogue, so the
 * tools set it explicitly rather than leaving it to the service default.
 */

/** Departments whose listings are classified ads rather than buyable products. */
export const CLASSIFIED_DEPARTMENTS = {
  vehicles: '87ea23f9-f37e-4d84-8f4a-bbc9e88801da',
  property: '1dfe20c4-e1f5-49db-98df-4ec714a08569',
} as const;

/** Sort presets, mapped to the service's `sort_param` field/order pairs. */
export const SORT_PRESETS = {
  relevance: null,
  newest: [{ field: 'created_at', order: 'desc' }],
  price_low: [{ field: 'price_special', order: 'asc' }],
  price_high: [{ field: 'price_special', order: 'desc' }],
  most_sold: [{ field: 'sold', order: 'desc' }],
  most_viewed: [{ field: 'views', order: 'desc' }],
  highest_rating: [{ field: 'rating', order: 'desc' }],
  most_reviewed: [{ field: 'review_count', order: 'desc' }],
} as const;

export type SortPreset = keyof typeof SORT_PRESETS;

export interface RangeFilter {
  min?: number;
  max?: number;
}

export interface BuildSearchOptions {
  query?: string;
  page?: number;
  size?: number;
  /** true = marketplace products, false = classified ads. */
  addToCart: boolean;
  department?: string;
  category?: string[];
  type?: string;
  price?: RangeFilter;
  condition?: 'new' | 'second';
  cities?: string[];
  storeId?: string;
  officialOnly?: boolean;
  sort?: SortPreset;
  /** Extra service filters (vehicle/property fields) merged verbatim. */
  extraFilters?: Record<string, unknown>;
  /** Request facet counts alongside the hits. */
  aggregations?: boolean;
}

const FACETS = {
  department_agg: { terms: { field: 'department' } },
  category_agg: { terms: { field: 'category' } },
  type_agg: { terms: { field: 'type' } },
  store_tier_agg: { terms: { field: 'store_tier' } },
  official_seller_agg: { terms: { field: 'official_seller' } },
};

/** Drop undefined/empty range bounds so we never send `{}` as a filter. */
function range(r?: RangeFilter): RangeFilter | undefined {
  if (!r) return undefined;
  const out: RangeFilter = {};
  if (typeof r.min === 'number') out.min = r.min;
  if (typeof r.max === 'number') out.max = r.max;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildSearchBody(opts: BuildSearchOptions): Record<string, unknown> {
  const page = Math.max(1, opts.page ?? 1);
  const size = opts.size ?? 20;

  const filters: Record<string, unknown> = { web: true, add_to_cart: opts.addToCart };

  if (opts.department) filters.department = opts.department;
  if (opts.category && opts.category.length > 0) filters.category = opts.category;
  if (opts.type) filters.type = opts.type;
  if (opts.storeId) filters.store_id = opts.storeId;
  if (opts.officialOnly) filters.official_seller = true;
  if (opts.cities && opts.cities.length > 0) filters.city = opts.cities;

  const price = range(opts.price);
  if (price) filters.price_special = price;

  // `new` is tri-state: set it only when the caller picked a side, because
  // omitting it is what returns both new and second-hand listings.
  if (opts.condition === 'new') filters.new = true;
  if (opts.condition === 'second') filters.new = false;

  for (const [key, value] of Object.entries(opts.extraFilters ?? {})) {
    if (value !== undefined) filters[key] = value;
  }

  const sortParam = SORT_PRESETS[opts.sort ?? 'relevance'];

  const body: Record<string, unknown> = {
    from: (page - 1) * size,
    size,
    // "and" narrows multi-word queries; without a query the operator is moot.
    search_operator: 'and',
    include_quality_score: true,
    sort_mode: sortParam ? 'field_only' : 'relevance_only',
    filters,
  };

  if (opts.query) body.query = opts.query;
  if (sortParam) body.sort_param = sortParam;
  if (opts.aggregations) body.aggregations = FACETS;

  return body;
}

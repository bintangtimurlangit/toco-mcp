import { backendGet, cachedNextData } from './client.js';
import { cached, TocoAPIError } from './http.js';
import { cache } from '../utils/cache.js';
import type { ListingDetail, ListingPageProps } from './types.js';

/** A Toco product slug, from search results or a /listing/<slug> URL. */
export function normalizeSlug(input: string): string {
  const trimmed = input.trim();
  const match = /\/listing\/([^/?#]+)/.exec(trimmed);
  if (match) return decodeURIComponent(match[1]);
  return decodeURIComponent(trimmed.replace(/^\/+|\/+$/g, ''));
}

/**
 * Full listing detail from the backend REST API — listing core, expanded
 * taxonomy, store, eligible promos, and every variant SKU. Shared by the
 * detail, variants, and promo tools so one lookup serves all three.
 *
 * Resolves to `null` for an unknown slug: the backend answers 404 there, and a
 * mistyped slug should read as "not found" rather than as an HTTP failure.
 */
export function loadListing(slug: string): Promise<ListingDetail | null> {
  return cached(cache.key('listing', slug), async () => {
    try {
      const res = await backendGet<{ code: number; data: ListingDetail }>(
        `/api/listing/${encodeURIComponent(slug)}`,
        'listing detail',
      );
      return res.data ?? null;
    } catch (err) {
      if (err instanceof TocoAPIError && err.statusCode === 404) return null;
      throw err;
    }
  });
}

/**
 * Reviews and the rating summary.
 *
 * Toco has no review XHR — reviews are only server-rendered into the product
 * page, so this reads the page's `pageProps` instead.
 */
export function loadListingPage(slug: string): Promise<ListingPageProps> {
  return cachedNextData<ListingPageProps>('listing-page', `listing/${encodeURIComponent(slug)}`);
}

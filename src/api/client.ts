import 'dotenv/config';
import { TocoAPIError, USER_AGENT, fetchWithRetry, cached } from './http.js';
import { cache } from '../utils/cache.js';

export { TocoAPIError };

export const SITE = 'https://toco.id';
/** Main backend REST API. The host name is a nod to Tokobagus, Toco's predecessor. */
export const BACKEND = 'https://api-main.tocobagus.net';

const JSON_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Content-Type': 'application/json',
  Origin: SITE,
  Referer: `${SITE}/`,
  // The web client stamps every backend call with this; mirror it so our
  // traffic looks like what Toco's own frontend sends.
  'x-platform-type': 'web',
};

/**
 * Calls Toco's search service through the frontend's proxy route.
 *
 * `POST /api/toco-api/search` is an envelope: `path` selects the sub-service
 * (`/listing-search`, `/listing-suggestion`, `/store-search`) and `body` is that
 * service's own request. Everything here is public and unauthenticated.
 */
export async function searchService<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithRetry(
    `${SITE}/api/toco-api/search`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ path, body }) },
    `search${path}`,
  );

  const json = (await res.json()) as T & { message?: string; error?: string };
  if (json.error) {
    throw new TocoAPIError(`Search service error on ${path}: ${json.error}`, undefined, path);
  }
  return json;
}

/** GET a public endpoint on the main backend REST API. */
export async function backendGet<T>(path: string, label = path): Promise<T> {
  const res = await fetchWithRetry(
    `${BACKEND}${path}`,
    { method: 'GET', headers: JSON_HEADERS },
    label,
  );
  return (await res.json()) as T;
}

// ─── Next.js data routes ──────────────────────────────────────────────────────
//
// Some data (product reviews, store profiles) is only server-rendered — there is
// no XHR for it. Those pages are reachable as JSON at
// `/_next/data/<buildId>/<route>.json`, but `buildId` changes on every Toco
// deploy, so it has to be scraped and refreshed rather than pinned.

const BUILD_ID_KEY = 'toco:buildId';
let buildIdPromise: Promise<string> | null = null;

async function scrapeBuildId(): Promise<string> {
  const res = await fetchWithRetry(
    `${SITE}/`,
    {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    },
    'buildId',
  );
  const html = await res.text();
  const match = /"buildId"\s*:\s*"([^"]+)"/.exec(html);
  if (!match) {
    throw new TocoAPIError(
      'Could not read Next.js buildId from the Toco homepage — the page shape may have changed.',
      undefined,
      'buildId',
    );
  }
  return match[1];
}

/** The current Next.js buildId, cached across calls and refreshed on demand. */
export async function getBuildId(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    buildIdPromise = null;
  } else {
    const hit = cache.get<string>(BUILD_ID_KEY);
    if (hit) return hit;
    if (buildIdPromise) return buildIdPromise;
  }

  buildIdPromise = (async () => {
    const id = await scrapeBuildId();
    cache.set(BUILD_ID_KEY, id);
    return id;
  })();

  try {
    return await buildIdPromise;
  } finally {
    buildIdPromise = null;
  }
}

/**
 * Fetch a server-rendered page's `pageProps` as JSON.
 *
 * `route` is the site path without a leading slash, e.g. `listing/my-product`.
 * A stale `buildId` yields a 404, so that case re-scrapes once and retries —
 * otherwise every review lookup would break for hours after a Toco deploy.
 */
export async function nextData<T>(route: string, label = route): Promise<T> {
  const attempt = async (buildId: string): Promise<T> => {
    const res = await fetchWithRetry(
      `${SITE}/_next/data/${buildId}/${route}.json`,
      {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: `${SITE}/` },
      },
      label,
    );
    const json = (await res.json()) as { pageProps?: T };
    if (!json.pageProps) {
      throw new TocoAPIError(`No pageProps in Next.js data for ${route}`, undefined, label);
    }
    return json.pageProps;
  };

  try {
    return await attempt(await getBuildId());
  } catch (err) {
    if (err instanceof TocoAPIError && err.statusCode === 404) {
      // Either the buildId went stale or the page genuinely doesn't exist.
      // Refresh once and let a second 404 stand as "not found".
      return attempt(await getBuildId(true));
    }
    throw err;
  }
}

/** `nextData` behind the shared TTL cache + in-flight coalescing. */
export function cachedNextData<T>(namespace: string, route: string): Promise<T> {
  return cached(cache.key(namespace, route), () => nextData<T>(route, namespace));
}

/**
 * Shared HTTP plumbing: the error type, retry/backoff, and the cache +
 * in-flight coalescing wrapper used by every loader.
 *
 * Lives below `client.ts` in the import graph so the search-service path, the
 * backend REST path, and the `_next/data` path all share one retry policy
 * without a circular import.
 */
import { cache } from '../utils/cache.js';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 300;

export class TocoAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
  ) {
    super(message);
    this.name = 'TocoAPIError';
  }
}

/** 429 and 5xx are transient; every other 4xx is our fault and won't improve. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number, retryAfter?: string | null): number {
  // Honour Retry-After when it's a sane number of seconds, else exponential.
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0 && seconds <= 10) return seconds * 1000;
  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  return exponential + Math.floor(Math.random() * 100); // jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a fetch with retry on transient failures (network errors, 429, 5xx).
 * `label` is used for the endpoint field on thrown errors.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error | undefined;
  // Local, not module-level: concurrent callers must not share backoff state.
  let retryAfter: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1, retryAfter));

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        lastError = new TocoAPIError(
          `Timed out after ${Math.round(timeoutMs / 1000)}s calling ${label}. Toco may be slow or unreachable.`,
          undefined,
          label,
        );
      } else {
        lastError = new TocoAPIError(
          `Network error calling ${label}: ${err instanceof Error ? err.message : String(err)}`,
          undefined,
          label,
        );
      }
      retryAfter = null;
      continue; // network-level failures are always worth one more try
    }

    if (res.ok) return res;

    if (isRetryableStatus(res.status) && attempt < MAX_ATTEMPTS - 1) {
      retryAfter = res.headers.get('retry-after');
      lastError = new TocoAPIError(
        `Toco returned HTTP ${res.status} for ${label}`,
        res.status,
        label,
      );
      continue;
    }

    throw new TocoAPIError(`Toco returned HTTP ${res.status} for ${label}`, res.status, label);
  }

  throw lastError ?? new TocoAPIError(`Failed calling ${label}`, undefined, label);
}

/**
 * Per-key in-flight loads. The TTL cache only dedupes *sequential* calls;
 * without this, two tools issuing the same request in parallel each fetch it,
 * because neither has populated the cache when the other starts.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `load` through the TTL cache, coalescing concurrent calls for the same
 * key. The parsed object is cached, not the raw body, so several tools can read
 * different parts of one response.
 */
export async function cached<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get<T>(cacheKey);
  if (hit !== undefined) return hit;

  const pending = inFlight.get(cacheKey) as Promise<T> | undefined;
  if (pending) return pending;

  const run = (async (): Promise<T> => {
    const result = await load();
    cache.set(cacheKey, result);
    return result;
  })();

  // Cleared on failure too, so a transient error doesn't pin a rejected promise
  // and poison every later call for this key.
  inFlight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inFlight.delete(cacheKey);
  }
}

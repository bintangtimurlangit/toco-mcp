/**
 * Offline tests for the TTL cache, eviction, and in-flight coalescing.
 * No network — the loader passed to `cached()` is a counter, not a fetch.
 */
import { Cache } from '../src/utils/cache.js';
import { cached } from '../src/api/http.js';
import { assert, assertEqual, section, finish } from './helpers.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

section('TTL cache basics');
{
  const c = new Cache(1000, 10);
  c.set('a', { v: 1 });
  assertEqual(c.get<{ v: number }>('a'), { v: 1 }, 'stores and returns a value');
  assertEqual(c.get('missing'), undefined, 'a miss returns undefined');
  assertEqual(c.key('ns', 'x', 3), 'ns:x:3', 'key() joins parts with colons');
}

section('expiry');
{
  const c = new Cache(30, 10);
  c.set('a', 1);
  assertEqual(c.get('a'), 1, 'value is live before the TTL');
  await sleep(60);
  assertEqual(c.get('a'), undefined, 'value is gone after the TTL');
}

section('bounded eviction, oldest write first');
{
  const c = new Cache(10_000, 3);
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3);
  c.set('d', 4);
  assert(c.size() <= 3, 'size stays within the cap');
  assertEqual(c.get('a'), undefined, 'the oldest entry is evicted');
  assertEqual(c.get('d'), 4, 'the newest entry survives');

  // Re-writing a key must refresh its position, not keep its original slot.
  const c2 = new Cache(10_000, 2);
  c2.set('x', 1);
  c2.set('y', 2);
  c2.set('x', 3);
  c2.set('z', 4);
  assertEqual(c2.get('y'), undefined, 're-written key outlives the one written after it');
  assertEqual(c2.get('x'), 3, 're-written key keeps its newer value');
}

section('in-flight coalescing');
{
  let calls = 0;
  const load = async () => {
    calls++;
    await sleep(30);
    return 'result';
  };

  const [a, b, c] = await Promise.all([
    cached('coalesce-key', load),
    cached('coalesce-key', load),
    cached('coalesce-key', load),
  ]);

  assertEqual(calls, 1, 'three concurrent calls trigger one load');
  assert(a === b && b === c && a === 'result', 'all callers get the same result');

  // A later call is served from the cache, not re-loaded.
  await cached('coalesce-key', load);
  assertEqual(calls, 1, 'a subsequent call hits the cache');
}

section('a failed load is not cached');
{
  let attempts = 0;
  const failing = async () => {
    attempts++;
    throw new Error('boom');
  };

  for (let i = 0; i < 2; i++) {
    try {
      await cached('failing-key', failing);
    } catch {
      /* expected */
    }
  }
  assertEqual(attempts, 2, 'a rejected load is retried rather than pinned');
}

finish('cache');

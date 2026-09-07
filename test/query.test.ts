/**
 * Offline tests for the search-body builder.
 *
 * The `add_to_cart` switch and the tri-state `new` filter are the two things
 * most likely to be broken by a careless edit, and both fail silently against
 * the live API (wrong results, not an error), so they are pinned here.
 */
import { buildSearchBody, CLASSIFIED_DEPARTMENTS } from '../src/api/query.js';
import { assert, assertEqual, section, finish } from './helpers.js';

section('add_to_cart marketplace/classified switch');
{
  const market = buildSearchBody({ addToCart: true });
  const classified = buildSearchBody({ addToCart: false });
  assertEqual(
    (market.filters as Record<string, unknown>).add_to_cart,
    true,
    'marketplace sets add_to_cart:true',
  );
  assertEqual(
    (classified.filters as Record<string, unknown>).add_to_cart,
    false,
    'classified sets add_to_cart:false',
  );
  assertEqual((market.filters as Record<string, unknown>).web, true, 'always sets web:true');
}

section('condition is tri-state');
{
  const both = buildSearchBody({ addToCart: true });
  const isNew = buildSearchBody({ addToCart: true, condition: 'new' });
  const second = buildSearchBody({ addToCart: true, condition: 'second' });
  assert(!('new' in (both.filters as object)), 'omitted condition sends no `new` filter');
  assertEqual((isNew.filters as Record<string, unknown>).new, true, 'condition=new sends new:true');
  assertEqual(
    (second.filters as Record<string, unknown>).new,
    false,
    'condition=second sends new:false',
  );
}

section('pagination');
{
  const p1 = buildSearchBody({ addToCart: true, page: 1, size: 20 });
  const p3 = buildSearchBody({ addToCart: true, page: 3, size: 20 });
  assertEqual(p1.from, 0, 'page 1 starts at offset 0');
  assertEqual(p3.from, 40, 'page 3 with size 20 starts at offset 40');
  const p0 = buildSearchBody({ addToCart: true, page: 0 });
  assertEqual(p0.from, 0, 'page 0 clamps to the first page');
}

section('price range is omitted when empty');
{
  const none = buildSearchBody({ addToCart: true, price: {} });
  assert(!('price_special' in (none.filters as object)), 'empty range sends no price filter');
  const min = buildSearchBody({ addToCart: true, price: { min: 1000 } });
  assertEqual(
    (min.filters as Record<string, unknown>).price_special,
    { min: 1000 },
    'min-only range',
  );
  const both = buildSearchBody({ addToCart: true, price: { min: 1000, max: 5000 } });
  assertEqual(
    (both.filters as Record<string, unknown>).price_special,
    { min: 1000, max: 5000 },
    'min+max range',
  );
}

section('sort mode follows the preset');
{
  const relevance = buildSearchBody({ addToCart: true, sort: 'relevance' });
  assertEqual(relevance.sort_mode, 'relevance_only', 'relevance uses relevance_only');
  assert(!('sort_param' in relevance), 'relevance sends no sort_param');

  const cheap = buildSearchBody({ addToCart: true, sort: 'price_low' });
  assertEqual(cheap.sort_mode, 'field_only', 'field sort uses field_only');
  assertEqual(
    cheap.sort_param,
    [{ field: 'price_special', order: 'asc' }],
    'price_low sorts on price_special asc',
  );
}

section('extra filters merge, undefined values dropped');
{
  const body = buildSearchBody({
    addToCart: false,
    department: CLASSIFIED_DEPARTMENTS.vehicles,
    extraFilters: { production_year: { min: 2015 }, transmission_type: undefined },
  });
  const f = body.filters as Record<string, unknown>;
  assertEqual(f.department, CLASSIFIED_DEPARTMENTS.vehicles, 'vehicle department pinned');
  assertEqual(f.production_year, { min: 2015 }, 'extra range filter passed through');
  assert(!('transmission_type' in f), 'undefined extra filter is dropped');
}

section('query is optional');
{
  const noQuery = buildSearchBody({ addToCart: true });
  assert(!('query' in noQuery), 'no query key when browsing by filters alone');
  const withQuery = buildSearchBody({ addToCart: true, query: 'sepatu' });
  assertEqual(withQuery.query, 'sepatu', 'query passed through');
}

finish('query builder');

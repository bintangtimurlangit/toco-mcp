/** Offline tests for price/slug/rendering helpers. */
import { normalizeSlug } from '../src/api/listing.js';
import { idr, priceLine, stars, pageFooter, formatProduct } from '../src/utils/format.js';
import type { Listing } from '../src/api/types.js';
import { assert, assertEqual, section, finish } from './helpers.js';

section('rupiah formatting');
{
  assertEqual(idr(100000), 'Rp100.000', 'thousands use Indonesian separators');
  assertEqual(idr(0), 'Rp0', 'zero renders as Rp0');
  assertEqual(idr(null), '—', 'null renders as an em dash');
}

section('price_special is the effective price');
{
  assertEqual(
    priceLine({ price: 100000, price_special: 100000 }),
    'Rp100.000',
    'equal prices show once',
  );
  assert(
    priceLine({ price: 100000, price_special: 75000 }).includes('-25%'),
    'a lower price_special renders a discount percentage',
  );
  assertEqual(
    priceLine({ price: 50000, price_special: null }),
    'Rp50.000',
    'null special falls back to price',
  );
}

section('slug normalisation');
{
  assertEqual(normalizeSlug('sepatu-pria-30'), 'sepatu-pria-30', 'bare slug passes through');
  assertEqual(
    normalizeSlug('https://toco.id/listing/sepatu-pria-30'),
    'sepatu-pria-30',
    'full URL is reduced to the slug',
  );
  assertEqual(
    normalizeSlug('https://toco.id/listing/sepatu-pria-30?utm_source=x'),
    'sepatu-pria-30',
    'query string is stripped',
  );
  assertEqual(
    normalizeSlug('  /sepatu-pria-30/  '),
    'sepatu-pria-30',
    'whitespace and slashes trimmed',
  );
}

section('stars');
{
  assertEqual(stars(5), '★★★★★', '5 renders five filled stars');
  assertEqual(stars(3), '★★★☆☆', '3 renders three filled and two empty');
  assertEqual(stars(null), '', 'no rating renders nothing');
}

section('pagination footer');
{
  assert(pageFooter(1, 20, 100).includes('1–20 of 100'), 'first page reports its range');
  assert(pageFooter(1, 20, 100).includes('page=2'), 'more results advertise the next page');
  assert(!pageFooter(5, 20, 100).includes('page=6'), 'last page does not advertise a next page');
  assert(
    pageFooter(1, 20, 5).includes('1–5 of 5'),
    'a short result set is not padded to the page size',
  );
}

section('product rendering');
{
  const listing = {
    title: 'Sepatu Lari',
    slug: 'sepatu-lari',
    price: 200000,
    price_special: 150000,
    stock: 4,
    sold: 12,
    rating: 5,
    review_count: 3,
    city: 'Kota Bandung',
    store: { toco_name: 'Toko Uji' },
    is_free_ongkir: true,
    new: false,
    category_name: 'Sepatu Pria',
  } as unknown as Listing;

  const out = formatProduct(listing, 1);
  assert(out.includes('**Sepatu Lari**'), 'title is bolded');
  assert(out.includes('-25%'), 'discount is shown');
  assert(out.includes('12 sold'), 'sales count is shown');
  assert(out.includes('Toko Uji'), 'store name is shown');
  assert(out.includes('Second-hand'), 'second-hand items are flagged');
  assert(out.includes('Free ongkir'), 'free shipping is flagged');
  assert(out.includes('https://toco.id/listing/sepatu-lari'), 'a usable product URL is included');

  // Toco returns a `rating` even for listings nobody has reviewed, which would
  // otherwise render as a bogus "5/5 (0 reviews)".
  const unreviewed = {
    ...listing,
    rating: 5,
    review_count: 0,
    rating_count: 0,
  } as unknown as Listing;
  assert(
    !formatProduct(unreviewed, 1).includes('/5'),
    'a rating with no reviews behind it is hidden',
  );
}

finish('formatting');

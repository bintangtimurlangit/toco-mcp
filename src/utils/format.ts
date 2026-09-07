import type { Listing, StoreSummary } from '../api/types.js';
import { truncate } from './errors.js';

export const SITE_URL = 'https://toco.id';

/** Format an integer rupiah amount. Toco prices carry no minor units. */
export function idr(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `Rp${value.toLocaleString('id-ID')}`;
}

export function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return value.toLocaleString('id-ID');
}

export function listingUrl(slug: string): string {
  return `${SITE_URL}/listing/${slug}`;
}

export function storeUrl(shortName: string): string {
  return `${SITE_URL}/store/${shortName}`;
}

/** `price_special` is the effective price; `price` is the pre-discount one. */
export function priceLine(l: { price: number | null; price_special: number | null }): string {
  const effective = l.price_special ?? l.price;
  if (l.price_special !== null && l.price !== null && l.price_special < l.price) {
    const off = Math.round(((l.price - l.price_special) / l.price) * 100);
    return `${idr(effective)} ~~${idr(l.price)}~~ (-${off}%)`;
  }
  return idr(effective);
}

export function stars(rating: number | null | undefined): string {
  if (!rating) return '';
  const r = Math.round(rating);
  return '★'.repeat(r) + '☆'.repeat(Math.max(0, 5 - r));
}

/** Badges a buyer would actually care about, in a stable order. */
function badges(l: Listing): string[] {
  const out: string[] = [];
  if (l.official_seller) out.push('🏅 Official');
  if (l.store_tier) out.push(`🏪 ${l.store_tier}`);
  if (l.is_free_ongkir) out.push('🚚 Free ongkir');
  if (l.cod) out.push('💵 COD');
  if (l.is_preorder) out.push('⏳ Pre-order');
  if (l.new === false) out.push('♻️ Second-hand');
  return out;
}

/** One marketplace product, rendered as a numbered search-result block. */
export function formatProduct(l: Listing, index: number): string {
  const lines = [`${index}. **${l.title}**`, `   💰 ${priceLine(l)}`];

  const stats: string[] = [];
  // A rating with no reviews behind it is noise — Toco defaults `rating` to a
  // value even when nothing has been reviewed yet.
  const reviews = l.review_count ?? l.rating_count ?? 0;
  if (l.rating && reviews > 0)
    stats.push(`${stars(l.rating)} ${l.rating}/5 (${num(reviews)} reviews)`);
  if (l.sold) stats.push(`${num(l.sold)} sold`);
  if (typeof l.stock === 'number') stats.push(`stock ${num(l.stock)}`);
  if (stats.length > 0) lines.push(`   📊 ${stats.join(' | ')}`);

  const store = l.store?.toco_name ?? l.store_name;
  if (store) lines.push(`   🏬 ${store.trim()}${l.city ? ` — ${l.city}` : ''}`);
  else if (l.city) lines.push(`   📍 ${l.city}`);

  const b = badges(l);
  if (b.length > 0) lines.push(`   ${b.join(' | ')}`);
  if (l.category_name) lines.push(`   🗂 ${l.category_name}`);
  lines.push(`   🔗 ${listingUrl(l.slug)}`);
  return lines.join('\n');
}

/** One classified vehicle listing. */
export function formatVehicle(l: Listing, index: number): string {
  const lines = [`${index}. **${l.title}**`, `   💰 ${priceLine(l)}`];

  const spec: string[] = [];
  if (l.production_year) spec.push(`${l.production_year}`);
  if (l.transmission_type) spec.push(l.transmission_type);
  if (l.mileage) spec.push(`${num(l.mileage)} km`);
  if (l.fuel) spec.push(l.fuel);
  if (l.number_of_seat) spec.push(`${l.number_of_seat} seats`);
  if (spec.length > 0) lines.push(`   🚗 ${spec.join(' | ')}`);

  const extra: string[] = [];
  if (l.color) extra.push(`color ${l.color}`);
  if (l.license_plate_category) extra.push(`plate ${l.license_plate_category}`);
  if (l.cylinder_capacity) extra.push(`${num(l.cylinder_capacity)} cc`);
  if (extra.length > 0) lines.push(`   ⚙️ ${extra.join(' | ')}`);

  if (l.city) lines.push(`   📍 ${l.city}`);
  lines.push(`   🔗 ${listingUrl(l.slug)}`);
  return lines.join('\n');
}

/** One classified property listing. */
export function formatProperty(l: Listing, index: number): string {
  const lines = [`${index}. **${l.title}**`];
  const rental = l.rental_type ? ` (rent — ${l.rental_type})` : ' (for sale)';
  lines.push(`   💰 ${priceLine(l)}${rental}`);

  const spec: string[] = [];
  if (l.number_of_bedroom) spec.push(`${l.number_of_bedroom} bed`);
  if (l.number_of_bathroom) spec.push(`${l.number_of_bathroom} bath`);
  if (l.building_area) spec.push(`building ${num(l.building_area)} m²`);
  if (l.lot_area) spec.push(`lot ${num(l.lot_area)} m²`);
  if (l.number_of_floor) spec.push(`${l.number_of_floor} floors`);
  if (spec.length > 0) lines.push(`   🏠 ${spec.join(' | ')}`);

  if (l.legal_certificate) lines.push(`   📜 ${l.legal_certificate}`);
  if (l.city) lines.push(`   📍 ${l.city}`);
  lines.push(`   🔗 ${listingUrl(l.slug)}`);
  return lines.join('\n');
}

export function formatStore(s: StoreSummary, index?: number): string {
  const head = index !== undefined ? `${index}. ` : '';
  const lines = [`${head}**${(s.toco_name ?? 'Unnamed store').trim()}**`];
  const meta: string[] = [];
  if (s.toco_city) meta.push(`📍 ${s.toco_city}`);
  if (s.rating) meta.push(`${stars(s.rating)} ${s.rating}/5`);
  if (typeof s.active_product === 'number') meta.push(`${num(s.active_product)} products`);
  if (s.official_seller) meta.push('🏅 Official');
  if (s.store_tier) meta.push(`🏪 ${s.store_tier}`);
  if (meta.length > 0) lines.push(`   ${meta.join(' | ')}`);
  if (s.toco_description)
    lines.push(`   ${truncate(s.toco_description.replace(/\s+/g, ' ').trim(), 160)}`);
  if (s.toco_short_name) lines.push(`   🔗 ${storeUrl(s.toco_short_name)}`);
  return lines.join('\n');
}

/** Pagination footer shared by every list-returning tool. */
export function pageFooter(page: number, size: number, total: number): string {
  const shown = Math.min(page * size, total);
  const parts = [`Showing ${(page - 1) * size + 1}–${shown} of ${num(total)}`];
  if (shown < total) parts.push(`Use page=${page + 1} for more.`);
  return parts.join('. ');
}

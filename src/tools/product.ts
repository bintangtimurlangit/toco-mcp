import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadListing, normalizeSlug } from '../api/listing.js';
import { withErrorHandling, truncate } from '../utils/errors.js';
import { idr, listingUrl, num, priceLine, stars } from '../utils/format.js';

const SLUG_ARG = z
  .string()
  .min(1)
  .describe(
    'Product slug (the `slug` field from search_products) or a full toco.id/listing/... URL',
  );

export function registerProductTools(server: McpServer): void {
  server.tool(
    'get_product_detail',
    'Get full detail for one Toco listing: description, effective price, stock, condition, shipping weight and dimensions, category path, seller info, and whether it has variants. Works for both marketplace products and classified ads.',
    { product: SLUG_ARG },
    async ({ product }) => {
      return withErrorHandling(async () => {
        const slug = normalizeSlug(product);
        const detail = await loadListing(slug);

        if (!detail?.listing) {
          return {
            content: [{ type: 'text', text: `❌ No Toco listing found for "${slug}".` }],
          };
        }
        const { listing, variants } = detail;

        const lines: string[] = [`# ${listing.title}`, ''];
        lines.push(`💰 **Price:** ${priceLine(listing)}`);
        if (listing.add_to_cart === false) {
          lines.push('🏷 **Type:** Classified ad — contact the seller directly (not add-to-cart).');
        }
        lines.push(
          `📦 **Stock:** ${num(listing.stock)}${listing.min_order && listing.min_order > 1 ? ` (min order ${listing.min_order})` : ''}`,
        );
        lines.push(`✨ **Condition:** ${listing.new === false ? 'Second-hand' : 'New'}`);
        if (listing.sold) lines.push(`🛒 **Sold:** ${num(listing.sold)}`);
        const reviewCount = listing.review_count ?? listing.rating_count ?? 0;
        if (listing.rating && reviewCount > 0) {
          lines.push(
            `⭐ **Rating:** ${stars(listing.rating)} ${listing.rating}/5 (${num(reviewCount)} reviews)`,
          );
        }

        const engagement: string[] = [];
        if (listing.views) engagement.push(`${num(listing.views)} views`);
        if (listing.likes) engagement.push(`${num(listing.likes)} likes`);
        if (listing.wish_count) engagement.push(`${num(listing.wish_count)} wishlisted`);
        if (engagement.length > 0) lines.push(`👀 **Engagement:** ${engagement.join(' | ')}`);

        const path = [listing.department, listing.category, listing.type, listing.sub_type]
          .filter((n) => n && typeof n === 'object')
          .map((n) => (n as { name_id: string }).name_id);
        if (path.length > 0) lines.push(`🗂 **Category:** ${path.join(' › ')}`);

        const store = listing.store;
        if (store) {
          lines.push('', '## Seller');
          lines.push(
            `🏬 **${(store.toco_name ?? '—').trim()}**${store.official_seller ? ' 🏅 Official' : ''}`,
          );
          const meta: string[] = [];
          if (store.toco_city) meta.push(`📍 ${store.toco_city}`);
          if (typeof store.active_product === 'number')
            meta.push(`${num(store.active_product)} active products`);
          if (store.profile_kyc) meta.push(`KYC ${store.profile_kyc}`);
          if (store.is_online) meta.push('🟢 online now');
          if (meta.length > 0) lines.push(meta.join(' | '));
          if (store.toco_short_name)
            lines.push(`Use get_store_info with "${store.toco_short_name}" for more.`);
        }

        if (listing.description) {
          lines.push('', '## Description', truncate(listing.description.trim(), 1500));
        }

        const logistics: string[] = [];
        if (listing.weight) logistics.push(`${num(listing.weight)} g`);
        if (listing.length && listing.width && listing.height) {
          logistics.push(`${listing.length}×${listing.width}×${listing.height} cm`);
        }
        if (listing.is_free_ongkir) logistics.push('🚚 free shipping');
        if (listing.cod) logistics.push('💵 COD available');
        if (listing.is_preorder) logistics.push('⏳ pre-order');
        if (logistics.length > 0) lines.push('', `📮 **Shipping:** ${logistics.join(' | ')}`);

        if (listing.has_variant && variants && variants.length > 0) {
          lines.push(
            '',
            `🎨 **Variants:** ${variants.length} SKUs — use get_product_variants for the breakdown.`,
          );
        }

        const promos = (listing.promo ?? []).flatMap((p) => p.promo_eligible ?? []);
        if (promos.length > 0) {
          lines.push(
            '',
            `🎟 **Promos available:** ${promos.length} — use get_product_promos for detail.`,
          );
        }

        if (listing.city) lines.push('', `📍 **Location:** ${listing.city}`);
        lines.push('', `🔗 ${listingUrl(listing.slug)}`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      });
    },
  );

  server.tool(
    'get_product_variants',
    'List every variant SKU of a Toco product with its own price, stock, and SKU code. Returns the variant axes (e.g. Color, Size) and flags which combinations are out of stock.',
    { product: SLUG_ARG },
    async ({ product }) => {
      return withErrorHandling(async () => {
        const slug = normalizeSlug(product);
        const detail = await loadListing(slug);

        if (!detail?.listing) {
          return {
            content: [{ type: 'text', text: `❌ No Toco listing found for "${slug}".` }],
          };
        }
        const { listing, variants, variant_types_and_values: axes } = detail;

        if (!variants || variants.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**${listing.title}** has no variants — it is a single-SKU listing priced at ${priceLine(listing)}.`,
              },
            ],
          };
        }

        const lines = [`🎨 **Variants of ${listing.title}**`, ''];

        if (axes?.first_variant_type) {
          lines.push(`**${axes.first_variant_type}:** ${axes.first_variant_values.join(', ')}`);
        }
        if (axes?.second_variant_type) {
          lines.push(`**${axes.second_variant_type}:** ${axes.second_variant_values.join(', ')}`);
        }
        lines.push('', `${variants.length} SKUs:`, '');

        variants.forEach((v, i) => {
          const name = [v.first_variant_value, v.second_variant_value].filter(Boolean).join(' / ');
          const stock = v.stock ?? 0;
          const mark = stock > 0 ? `stock ${num(stock)}` : '❌ out of stock';
          const flags = [v.default ? 'default' : null, v.active === false ? 'inactive' : null]
            .filter(Boolean)
            .join(', ');
          lines.push(
            `${i + 1}. **${name || 'Default'}** — ${idr(v.price_special ?? v.price)} | ${mark}${flags ? ` (${flags})` : ''}${v.sku ? ` | SKU ${v.sku}` : ''}`,
          );
        });

        const inStock = variants.filter((v) => (v.stock ?? 0) > 0).length;
        lines.push('', `${inStock} of ${variants.length} variants in stock.`);
        lines.push(`🔗 ${listingUrl(listing.slug)}`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      });
    },
  );

  server.tool(
    'get_product_promos',
    'List the vouchers and promotions a Toco listing is currently eligible for — free-shipping subsidies, discounts, minimum spend, and expiry dates.',
    { product: SLUG_ARG },
    async ({ product }) => {
      return withErrorHandling(async () => {
        const slug = normalizeSlug(product);
        const detail = await loadListing(slug);

        if (!detail?.listing) {
          return {
            content: [{ type: 'text', text: `❌ No Toco listing found for "${slug}".` }],
          };
        }
        const { listing } = detail;
        const promos = (listing.promo ?? []).flatMap((pr) => pr.promo_eligible ?? []);

        if (promos.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No promos currently running on **${listing.title}**.`,
              },
            ],
          };
        }

        const lines = [`🎟 **Promos on ${listing.title}**`, ''];
        promos.forEach((p, i) => {
          lines.push(`${i + 1}. **${p.title}**`);
          const terms: string[] = [];
          if (p.discount_amount) terms.push(`${idr(p.discount_amount)} off`);
          if (p.discount_percentage) terms.push(`${p.discount_percentage}% off`);
          if (p.maximum_discount) terms.push(`max ${idr(p.maximum_discount)}`);
          if (p.minimum_transaction) terms.push(`min spend ${idr(p.minimum_transaction)}`);
          if (terms.length > 0) lines.push(`   💸 ${terms.join(' | ')}`);
          if (p.voucher_type) lines.push(`   🏷 ${p.voucher_type}`);
          if (p.expiry_date) lines.push(`   📅 Expires ${p.expiry_date.slice(0, 10)}`);
          if (p.description) {
            lines.push(`   ${truncate(p.description.replace(/\s+/g, ' ').trim(), 220)}`);
          }
          if (i < promos.length - 1) lines.push('');
        });

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      });
    },
  );
}

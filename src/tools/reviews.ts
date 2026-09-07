import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadListingPage, normalizeSlug } from '../api/listing.js';
import { withErrorHandling, truncate } from '../utils/errors.js';
import { listingUrl, num, stars } from '../utils/format.js';

export function registerReviewTools(server: McpServer): void {
  server.tool(
    'get_product_reviews',
    'Get customer reviews and the rating summary for a Toco listing. Toco server-renders reviews rather than exposing a review API, so this returns the set shown on the product page (most recent first) alongside the overall average and total count.',
    {
      product: z
        .string()
        .min(1)
        .describe(
          'Product slug (the `slug` field from search_products) or a full toco.id/listing/... URL',
        ),
      minRating: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('Only show reviews at or above this star rating'),
      withTextOnly: z
        .boolean()
        .default(false)
        .describe('Skip star-only ratings that carry no written review (default: false)'),
    },
    async ({ product, minRating, withTextOnly }) => {
      return withErrorHandling(async () => {
        const slug = normalizeSlug(product);
        const page = await loadListingPage(slug);

        if (page.notFound) {
          return { content: [{ type: 'text', text: `❌ No Toco listing found for "${slug}".` }] };
        }

        const summary = page.summary ?? {};
        const all = page.reviews ?? [];

        const title = page.listingMetaData?.product_title?.trim() || slug;
        const header: string[] = [`📝 **Reviews — ${title}**`];
        if (summary.rating_average) {
          header.push(
            `⭐ ${stars(summary.rating_average)} ${summary.rating_average}/5 from ${num(summary.rating_count)} ratings`,
          );
        }

        if (all.length === 0) {
          header.push('', 'This listing has no written reviews yet.');
          return { content: [{ type: 'text', text: header.join('\n') }] };
        }

        let shown = all;
        if (minRating) shown = shown.filter((r) => r.rate >= minRating);
        if (withTextOnly) shown = shown.filter((r) => r.review_text && r.review_text.trim());

        if (shown.length === 0) {
          header.push('', 'No reviews match those filters. Try relaxing them.');
          return { content: [{ type: 'text', text: header.join('\n') }] };
        }

        const lines = [...header, ''];
        shown.forEach((r, i) => {
          const who = r.user_display_name?.trim() || 'Toco buyer';
          lines.push(`${i + 1}. ${stars(r.rate)} — **${who}**`);
          if (r.review_text?.trim()) {
            lines.push(`   ${truncate(r.review_text.replace(/\s+/g, ' ').trim(), 300)}`);
          } else {
            lines.push('   _(rating only, no written review)_');
          }
          lines.push(`   📅 ${r.created_at.slice(0, 10)}`);
          if (i < shown.length - 1) lines.push('');
        });

        // Toco embeds only the first page of reviews in the page payload.
        if (summary.rating_count && summary.rating_count > all.length) {
          lines.push(
            '',
            `ℹ️ Showing the ${all.length} reviews Toco renders on the product page, out of ${num(summary.rating_count)} total ratings.`,
          );
        }
        lines.push('', `🔗 ${listingUrl(slug)}`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      });
    },
  );
}

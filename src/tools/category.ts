import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { backendGet } from '../api/client.js';
import { cached } from '../api/http.js';
import type { TaxonomyNode } from '../api/types.js';
import { cache } from '../utils/cache.js';
import { withErrorHandling } from '../utils/errors.js';
import { num } from '../utils/format.js';

/**
 * Toco's full taxonomy: 29 departments → ~393 categories → ~2,860 types →
 * sub-types. It is large and changes rarely, so it is fetched once and sliced
 * locally rather than re-requested per level.
 */
function loadTaxonomy(): Promise<TaxonomyNode[]> {
  return cached(cache.key('taxonomy'), () =>
    backendGet<TaxonomyNode[]>('/api/category', 'category tree'),
  );
}

function countLabel(n: TaxonomyNode): string {
  return typeof n.listing_count === 'number' ? ` (${num(n.listing_count)} listings)` : '';
}

function render(nodes: TaxonomyNode[], depth: number, maxDepth: number, indent = ''): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(`${indent}- **${n.name_id}** \`${n.slug}\`${countLabel(n)}`);
    lines.push(`${indent}  id: ${n.id}`);
    if (depth < maxDepth) {
      const children = n.categories ?? n.types ?? n.sub_types ?? [];
      if (children.length > 0) {
        lines.push(...render(children, depth + 1, maxDepth, `${indent}  `));
      }
    }
  }
  return lines;
}

export function registerCategoryTools(server: McpServer): void {
  server.tool(
    'get_category_tree',
    "Browse Toco's category taxonomy and get the UUIDs that search_products, search_vehicles, and search_properties accept as departmentId / categoryIds. Start with depth 1 for the department list, then drill into one department by slug.",
    {
      department: z
        .string()
        .optional()
        .describe('Department slug to drill into, e.g. "fashion-pria". Omit for all departments.'),
      depth: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(1)
        .describe(
          'How deep to render: 1 = departments, 2 = + categories, 3 = + types (default: 1). The full tree is large, so widen this only after narrowing by department.',
        ),
    },
    async ({ department, depth }) => {
      return withErrorHandling(async () => {
        const tree = await loadTaxonomy();

        if (department) {
          const node = tree.find((d) => d.slug === department || d.id === department);
          if (!node) {
            const known = tree.map((d) => d.slug).join(', ');
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ No Toco department "${department}".\n\nKnown departments: ${known}`,
                },
              ],
            };
          }
          const text = [
            `🗂 **${node.name_id}** \`${node.slug}\`${countLabel(node)}`,
            `id: ${node.id}`,
            '',
            ...render(node.categories ?? [], 1, depth),
          ].join('\n');
          return { content: [{ type: 'text', text }] };
        }

        const text = [
          `🗂 **Toco departments** (${tree.length})`,
          '',
          ...render(tree, 1, depth),
          '',
          'Pass a `department` slug with depth=2 or 3 to see its categories and types.',
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      });
    },
  );
}

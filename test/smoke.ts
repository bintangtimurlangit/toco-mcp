/**
 * Live smoke test / health check.
 *
 * Spawns the real MCP server over stdio and calls every tool against the live
 * Toco API, so it catches the failure mode this project is most prone to: Toco
 * changing an endpoint, a filter name, or a page shape and silently breaking a
 * tool. Every tool is public and read-only, so each must return real data.
 *
 * The `buildId`-backed tools (reviews, store info) are the most fragile — a Toco
 * deploy rotates the id, and this is what proves the re-scrape path still works.
 *
 * Run with: npm test   (exits non-zero if any check fails)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsxBin = resolve(__dirname, '../node_modules/.bin/tsx');
const serverEntry = resolve(__dirname, '../src/index.ts');

// Markers that mean the tool call actually failed, as opposed to a graceful
// "nothing matched" result.
const HARD_FAILURES = [
  'Toco API Error',
  'Toco returned HTTP',
  'Network error',
  'Unknown error occurred',
  'Could not read Next.js buildId',
  'No pageProps',
];

interface Check {
  tool: string;
  args: Record<string, unknown>;
  /** At least one substring must be present for a pass. */
  expect: string[];
  label?: string;
}

// A stable, long-lived listing used as the fixture for the detail-side tools.
// It is a multi-variant product from a real store, so an empty variant axis
// means the payload shape drifted rather than that the product is single-SKU.
const FIXTURE_SLUG = 'sepatu-pria-30';
const FIXTURE_STORE = 'ysn-store';
// This one carries real reviews, which the fixture above does not.
const REVIEWED_SLUG = 'hvn-hboss-orange-parfum-pria-aroma-citrus-10ml-30ml-55ml';

const CHECKS: Check[] = [
  {
    tool: 'search_products',
    args: { query: 'sepatu', limit: 3 },
    expect: ['Toco product search'],
  },
  {
    tool: 'search_products',
    label: 'search_products+filters',
    // A price ceiling must actually bind: every hit should be under 50k, and the
    // sort proves sort_param reaches the service.
    args: { query: 'tas', limit: 3, maxPrice: 50000, sort: 'price_low' },
    expect: ['sorted by price_low'],
  },
  {
    tool: 'get_search_suggestions',
    args: { query: 'sepa' },
    expect: ['Suggestions for'],
  },
  {
    tool: 'get_product_detail',
    args: { product: FIXTURE_SLUG },
    expect: ['**Price:**', '**Stock:**'],
  },
  {
    tool: 'get_product_detail',
    label: 'get_product_detail+url',
    // Proves slug normalisation accepts a pasted product URL.
    args: { product: `https://toco.id/listing/${FIXTURE_SLUG}` },
    expect: ['**Price:**'],
  },
  {
    tool: 'get_product_variants',
    args: { product: FIXTURE_SLUG },
    expect: ['SKUs'],
  },
  {
    tool: 'get_product_promos',
    // Promos rotate, so either outcome proves the extraction path works.
    args: { product: FIXTURE_SLUG },
    expect: ['Promos on', 'No promos currently running'],
  },
  {
    tool: 'get_product_reviews',
    // Reviews come from the server-rendered page — this is the buildId tripwire.
    args: { product: REVIEWED_SLUG },
    expect: ['Reviews —'],
  },
  {
    tool: 'get_store_info',
    args: { store: FIXTURE_STORE },
    expect: ['🏬'],
  },
  {
    tool: 'get_store_products',
    args: { store: FIXTURE_STORE, limit: 3 },
    expect: ['Products from', 'No products found'],
  },
  {
    tool: 'search_stores',
    args: { query: 'toko', limit: 3 },
    expect: ['Toco store search'],
  },
  {
    tool: 'get_category_tree',
    args: {},
    expect: ['Toco departments'],
  },
  {
    tool: 'get_category_tree',
    label: 'get_category_tree+drilldown',
    args: { department: 'fashion-pria', depth: 2 },
    expect: ['Fashion Pria'],
  },
  {
    tool: 'search_vehicles',
    // Department-pinned, so results must be actual vehicles with a year.
    args: { query: 'avanza', limit: 3, minYear: 2010 },
    expect: ['Toco vehicle ads', 'No vehicle ads found'],
  },
  {
    tool: 'search_properties',
    args: { query: 'rumah', limit: 3, minBedrooms: 2 },
    expect: ['Toco property ads', 'No property ads found'],
  },
  {
    tool: 'get_product_detail',
    label: 'get_product_detail+missing',
    // The backend answers 404 for an unknown slug; a mistyped slug must read as
    // "not found" rather than leaking an HTTP error at the user.
    args: { product: 'definitely-not-a-real-listing-xyz' },
    expect: ['No Toco listing found'],
  },
  {
    tool: 'get_store_info',
    label: 'get_store_info+missing',
    // A missing store still answers 200 — it just carries no profile.
    args: { store: 'definitely-not-a-real-store-xyz' },
    expect: ['No Toco store found'],
  },
];

async function main(): Promise<void> {
  const client = new Client({ name: 'toco-mcp-smoke', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: tsxBin, args: [serverEntry] });
  await client.connect(transport);

  const tools = await client.listTools();
  const registered = new Set(tools.tools.map((t) => t.name));
  console.log(`\n🔌 Connected. ${registered.size} tools registered.\n`);

  let passed = 0;
  let failed = 0;

  // Every registered tool must be exercised, or a broken tool can ship unnoticed.
  const covered = new Set(CHECKS.map((c) => c.tool));
  for (const name of registered) {
    if (!covered.has(name)) {
      console.error(`❌ ${name}: registered but has no smoke check`);
      failed++;
    }
  }

  for (const check of CHECKS) {
    const label = check.label ?? check.tool;
    try {
      const res = await client.callTool({ name: check.tool, arguments: check.args });
      const content = res.content as Array<{ type: string; text?: string }>;
      const text = content.map((c) => c.text ?? '').join('\n');

      const hardFailure = HARD_FAILURES.find((m) => text.includes(m));
      if (hardFailure) {
        console.error(`❌ ${label}: hit "${hardFailure}"`);
        console.error(`   ${text.slice(0, 220).replace(/\n/g, '\n   ')}`);
        failed++;
        continue;
      }

      const matched = check.expect.some((e) => text.includes(e));
      if (!matched) {
        console.error(`❌ ${label}: expected one of ${JSON.stringify(check.expect)}`);
        console.error(`   ${text.slice(0, 220).replace(/\n/g, '\n   ')}`);
        failed++;
        continue;
      }

      console.log(`✅ ${label} (${text.length} chars)`);
      passed++;
    } catch (err) {
      console.error(`❌ ${label}: threw ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  await client.close();

  console.log(`\n${failed === 0 ? '✅' : '❌'} Smoke: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});

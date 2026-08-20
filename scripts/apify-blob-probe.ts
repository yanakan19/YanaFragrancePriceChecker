/**
 * Diagnostic: render ONE category page for a named shop through the same
 * Apify actor path scripts/catalogue-harvest.ts already uses, and scan the
 * returned HTML for known JS-hydration state-blob markers — the unchecked
 * hypothesis behind Selfridges, John Lewis, Zara and Superdrug all coming
 * back HTTP 200 with a real, rendered page and zero schema.org Product
 * nodes: their product data may sit in an embedded blob (`__NEXT_DATA__`,
 * `window.__PRELOADED_STATE__`, Apollo state, etc.) rather than in the JSON-LD
 * `parseListings()` reads.
 *
 *   npm run apify:blob-probe -- --shop=selfridges
 *   npm run apify:blob-probe -- --shop=selfridges --url=https://...
 *
 * Prints, per shop: which marker (if any) was found, whether the blob it
 * names looks price-shaped and name-shaped, and a REDACTED sample — a short
 * slice with digit runs and quoted string values blanked out, never the raw
 * HTML and never a real price or product name. This is the one thing the
 * task that added this script insisted on: the findings get committed, the
 * page never does.
 *
 * Costs one Apify actor page render per shop, same as any other row in
 * catalogue-harvest.ts's own MAX_ACTOR_PAGES_PER_RUN budget — see
 * src/catalogue/apifyActor.ts's header for the per-page cost estimate.
 * Writes no registry data and commits nothing; this is a read-only probe.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { apifyActorConfigFromEnv, apifyActorRenderer } from '../src/catalogue/apifyActor.js';
import { apifyProxyConfigFromEnv } from '../src/catalogue/apifyProxy.js';
import { checkApifyAccount } from '../src/catalogue/apifyAccount.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const shopId = arg('shop');
if (!shopId) {
  console.error('usage: npm run apify:blob-probe -- --shop=<retailer id> [--url=<override>]');
  process.exit(1);
}

const retailer = RETAILERS.find((r) => r.id === shopId);
if (!retailer) {
  console.error(`no retailer with id "${shopId}"`);
  process.exit(1);
}

const urlOverride = arg('url');
const firstSection = retailer.catalogue?.sections[0];
const url =
  urlOverride ??
  (firstSection && retailer.catalogue
    ? firstSection.urlTemplate.replace('{page}', String(retailer.catalogue.firstPage))
    : null);

if (!url) {
  console.error(`${retailer.name} has no catalogue.sections entry and no --url override was given.`);
  process.exit(1);
}

const actorConfig = apifyActorConfigFromEnv();
if (!actorConfig) {
  console.error('APIFY_TOKEN is not set. Nothing can be rendered.');
  process.exit(1);
}

const proxyConfig = apifyProxyConfigFromEnv();
for (const line of (await checkApifyAccount(actorConfig.token, proxyConfig?.password ?? null)).lines) {
  console.log(line);
}
console.log('');

console.log(`Rendering ${retailer.name}: ${url}`);
const renderer = apifyActorRenderer(actorConfig);
const results = await renderer.render([url]);
const res = results.get(url);

if (!res || !res.ok) {
  console.log(`render failed: HTTP ${res?.status ?? 0}${res?.error ? ` — ${res.error}` : ''}`);
  process.exit(0);
}

console.log(`rendered ${res.body.length.toLocaleString()} bytes\n`);

/**
 * Known hydration-blob shapes. Each pattern captures the JSON payload itself
 * so it can be inspected for price/name-shaped keys without ever printing it.
 */
const MARKERS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'Next.js __NEXT_DATA__',
    pattern: /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  },
  { name: 'Nuxt __NUXT__', pattern: /window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/ },
  {
    name: 'generic __PRELOADED_STATE__',
    pattern: /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
  },
  {
    name: 'generic __INITIAL_STATE__',
    pattern: /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
  },
  {
    name: 'Apollo __APOLLO_STATE__',
    pattern: /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
  },
  { name: 'React Server Components self.__next_f', pattern: /self\.__next_f\.push/ },
];

const PRICE_HINT = /"(price|gbp|amount|salePrice|listPrice|currentPrice)"\s*:/i;
const NAME_HINT = /"(name|title|productName|displayName)"\s*:/i;
const CURRENCY_HINT = /"(currency|priceCurrency)"\s*:\s*"[A-Z]{3}"/;

/** Redact digit runs and quoted string values, keeping key names and structure only. */
function redact(sample: string): string {
  return sample
    .replace(/"[^"]{0,60}"(\s*:)/g, '"…"$1') // quoted keys stay recognisable via the trailing colon
    .replace(/:\s*"[^"]*"/g, ': "█"')
    .replace(/\d/g, '#');
}

let anyFound = false;
for (const m of MARKERS) {
  const match = res.body.match(m.pattern);
  if (!match) {
    console.log(`  ${m.name}: not found`);
    continue;
  }
  anyFound = true;
  const blob = match[1] ?? match[0];
  const hasPrice = PRICE_HINT.test(blob);
  const hasName = NAME_HINT.test(blob);
  const hasCurrency = CURRENCY_HINT.test(blob);
  console.log(
    `  ${m.name}: FOUND, ${blob.length.toLocaleString()} bytes` +
      ` — price-shaped keys: ${hasPrice}, name-shaped keys: ${hasName}, currency key: ${hasCurrency}`,
  );
  console.log(`    redacted sample: ${redact(blob.slice(0, 220))}`);
}

// Any other application/json script block, by id only — structural, not content.
const otherBlocks = [...res.body.matchAll(/<script[^>]+id="([^"]+)"[^>]*type="application\/json"/g)].map(
  (mm) => mm[1],
);
if (otherBlocks.length) {
  console.log(`  other application/json script blocks by id: ${otherBlocks.join(', ')}`);
  anyFound = true;
}

if (!anyFound) {
  console.log('\nNo known hydration-blob marker found in this page.');
}

console.log(`\nApify actor pages rendered this run: ${renderer.used()}`);

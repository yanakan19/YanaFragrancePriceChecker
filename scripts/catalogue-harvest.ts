/**
 * Harvest real listings via each shop's sitemap and write them to the catalogue.
 *
 *   npm run harvest                 # every shop, 40 product pages each
 *   npm run harvest -- --max=120    # deeper
 *   npm run harvest -- --shop=allbeauty
 *
 * This is the route the probe proved works. Guessed section URLs returned
 * nothing; asking the sitemap returned real products.
 *
 * Nothing here fabricates a listing. A shop that yields nothing is reported as
 * yielding nothing.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { loadRobots, BROWSER_HEADERS, type Http } from '../src/catalogue/attempt.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const maxPages = Number.parseInt(arg('max') ?? '40', 10);
const onlyShop = arg('shop');
const dryRun = process.argv.includes('--dry-run');

const http: Http = async (url, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    return { status: res.status, body: await res.text(), ok: res.ok };
  } catch (err) {
    return { status: 0, body: '', ok: false, error: String(err).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
};

const store = new CatalogueStore(resolve(root, 'data/catalogue'));
const now = new Date().toISOString();
const shops = RETAILERS.filter((r) => r.enabled && (!onlyShop || r.id === onlyShop));

console.log(`\nSitemap harvest`);
console.log(`shops    ${shops.length}`);
console.log(`budget   ${maxPages} product pages each`);
if (dryRun) console.log(`mode     dry run, nothing written`);
console.log('');

let totalListings = 0;
let reached = 0;

for (const retailer of shops) {
  const robots = await loadRobots(retailer, http);
  const gapMs = Math.max(
    retailer.catalogue?.minRequestGapMs ?? 1500,
    (robots.crawlDelaySeconds ?? 0) * 1000,
  );

  const result = await crawlViaSitemap({
    retailer, http, robots, maxPages, gapMs, headers: BROWSER_HEADERS,
  });

  const withPrice = result.listings.filter((l) => l.priceGbp !== null);
  totalListings += withPrice.length;
  if (withPrice.length > 0) reached++;

  console.log(
    `  ${retailer.name.padEnd(20)} ${String(result.urlsDiscovered).padStart(5)} urls  ` +
      `${String(result.pagesFetched).padStart(3)} fetched  ` +
      `${String(withPrice.length).padStart(3)} priced listings` +
      (result.errors.length ? `  (${result.errors.length} errors)` : ''),
  );
  for (const e of result.errors.slice(0, 1)) console.log(`      ${e}`);

  if (dryRun || withPrice.length === 0) continue;

  // Live data and fixture data must never be reconciled against each other.
  const snapshot = store.read(retailer.id);
  const existing = snapshot.source === 'live' ? snapshot.listings : [];

  const outcome = reconcile({
    existing, crawled: withPrice, retailerId: retailer.id, now, complete: true,
  });

  store.write({
    retailerId: retailer.id,
    updatedAt: now,
    source: 'live',
    listings: outcome.listings,
    runs: snapshot.source === 'live' ? snapshot.runs : [],
  });
}

console.log(`\n${reached} of ${shops.length} shops yielded real priced listings`);
console.log(`${totalListings} listings total\n`);

if (reached === 0) {
  console.error('Nothing harvested. Not writing anything rather than showing an empty app.');
  process.exit(1);
}

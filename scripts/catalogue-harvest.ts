/**
 * Harvest real listings via each shop's sitemap and write them to the catalogue.
 *
 *   npm run harvest                        # every shop, free routes only
 *   npm run harvest -- --max=120           # deeper
 *   npm run harvest -- --shop=allbeauty
 *   npm run harvest -- --allow-metered     # also try Apify proxy for shops the free route can't reach
 *
 * This is the route the probe proved works for the sites that allow it.
 * Guessed section URLs returned nothing; asking the sitemap returned real
 * products. For shops that refuse every free route (see docs/SPIKE-RESULTS.md
 * and docs/INGESTION.md), --allow-metered retries through Apify's residential
 * proxy when APIFY_PROXY_PASSWORD is set, using the exact same sitemap walk
 * and the exact same parser — only the transport changes.
 *
 * Nothing here fabricates a listing. A shop that yields nothing is reported as
 * yielding nothing, proxy or not.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { loadRobots, BROWSER_HEADERS, type Http } from '../src/catalogue/attempt.js';
import {
  apifyProxyConfigFromEnv, apifyProxyHttp, MAX_PROXIED_REQUESTS_PER_RUN,
} from '../src/catalogue/apifyProxy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const maxPages = Number.parseInt(arg('max') ?? '40', 10);
const onlyShop = arg('shop');
const dryRun = process.argv.includes('--dry-run');
const allowMetered = process.argv.includes('--allow-metered');

const proxyConfig = apifyProxyConfigFromEnv();
const useProxy = allowMetered && proxyConfig !== null;

if (allowMetered && !proxyConfig) {
  console.log('--allow-metered was passed but APIFY_PROXY_PASSWORD is not set. Skipping proxied retrieval.\n');
} else if (useProxy) {
  console.log(`Apify proxy available. Genuinely blocked shops get a metered retry, capped at ${MAX_PROXIED_REQUESTS_PER_RUN} requests each.\n`);
}

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
// A shop on 'affiliate-feed' has an approved feed as its ingestion route —
// scraping it anyway would be exactly the "improve it into a crawler"
// mistake docs/INGESTION.md warns against, on a partner who already handed
// the data over for free. npm run catalogue:feed is that route instead.
const shops = RETAILERS.filter(
  (r) => r.enabled && r.adapter !== 'affiliate-feed' && (!onlyShop || r.id === onlyShop),
);

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

  let result = await crawlViaSitemap({
    retailer, http, robots, maxPages, gapMs, headers: BROWSER_HEADERS,
  });
  let withPrice = result.listings.filter((l) => l.priceGbp !== null);
  let viaProxy = false;

  // Only pay for retrieval where the free route genuinely found nothing.
  // Robots.txt itself is refetched through the proxy too: a shop that 403s
  // everything usually 403s that as well, and NO_RESTRICTIONS must never be
  // assumed just because the free fetch failed.
  if (withPrice.length === 0 && useProxy) {
    const proxiedHttp = apifyProxyHttp(proxyConfig!);
    const proxiedRobots = await loadRobots(retailer, proxiedHttp);
    const retry = await crawlViaSitemap({
      retailer, http: proxiedHttp, robots: proxiedRobots, maxPages, gapMs: 0,
      headers: BROWSER_HEADERS,
    });
    const retryWithPrice = retry.listings.filter((l) => l.priceGbp !== null);
    if (retryWithPrice.length > 0) {
      result = retry;
      withPrice = retryWithPrice;
      viaProxy = true;
    } else {
      result.errors.push(...retry.errors.map((e) => `[proxied] ${e}`));
    }
  }

  totalListings += withPrice.length;
  if (withPrice.length > 0) reached++;

  console.log(
    `  ${retailer.name.padEnd(20)} ${String(result.urlsDiscovered).padStart(5)} urls  ` +
      `${String(result.pagesFetched).padStart(3)} fetched  ` +
      `${String(withPrice.length).padStart(3)} priced listings` +
      (viaProxy ? '  [via Apify proxy]' : '') +
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

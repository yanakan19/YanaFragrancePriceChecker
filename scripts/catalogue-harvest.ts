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
import { createHttp } from '../src/catalogue/httpFetch.js';
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

const http: Http = createHttp();

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
// Tracked separately from the per-shop log line above because that line
// scrolls away. A shop stuck at zero looks identical, run after run, to a
// shop having one bad day — unless something rolls it up and says so at the
// end, which is exactly the gap docs/INGESTION-AUDIT.md found: eight shops
// sat on week-old fixture data with nothing ever surfacing that as a rollup.
const neverLive: string[] = [];
const zeroThisRun: string[] = [];

for (const retailer of shops) {
  const robots = await loadRobots(retailer, http);
  const gapMs = Math.max(
    retailer.catalogue?.minRequestGapMs ?? 1500,
    (robots.crawlDelaySeconds ?? 0) * 1000,
  );

  // What we already hold, so the walk can spend its budget on products it has
  // not seen instead of re-fetching the same head of the sitemap every hour.
  // Fixture listings are excluded: their URLs are invented and matching a real
  // sitemap against them would be meaningless.
  const prior = store.read(retailer.id);
  const knownUrls = new Map<string, string>(
    prior.source === 'live' ? prior.listings.map((l) => [l.url, l.lastSeenAt]) : [],
  );

  // onProgress fires on every fetch, not just at the end of this shop's run —
  // see the field's own comment in sitemapCrawl.ts. Plain console.log rather
  // than a carriage-return progress line: CI log capture is not a terminal,
  // and a `\r`-only update can sit in a buffer instead of reaching the log
  // stream, which would defeat the entire point of this. A line every 5
  // fetches is enough to keep the runner convinced the job is alive without
  // flooding the log — GitHub kills a job after 10 minutes of *no* output,
  // not after a lot of it. Without this, a shop whose fetches are all slow
  // (rather than erroring) can go silent long enough for the runner to decide
  // the job is stuck and kill it — which is exactly what happened to a run
  // against this exact codepath: no code change caused it, a slow shop just
  // went unnoticed for the same reason a slow shop always would have.
  const heartbeat = (fetched: number, found: number) => {
    if (fetched % 5 === 0) console.log(`      ${retailer.name}: ${fetched} pages fetched, ${found} found so far`);
  };

  let result = await crawlViaSitemap({
    retailer, http, robots, maxPages, gapMs, headers: BROWSER_HEADERS, knownUrls, onProgress: heartbeat,
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
      headers: BROWSER_HEADERS, knownUrls, onProgress: heartbeat,
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

  if (withPrice.length === 0) {
    zeroThisRun.push(retailer.id);
    if (prior.source !== 'live') neverLive.push(retailer.id);
  }

  if (dryRun || withPrice.length === 0) continue;

  // Live data and fixture data must never be reconciled against each other.
  const existing = prior.source === 'live' ? prior.listings : [];

  // A cost-capped sample is not evidence of absence.
  //
  // This used to pass `complete: true` unconditionally, which told reconcile()
  // that everything it did not see had gone off sale. But `maxPages` stops the
  // walk long before a real shop's catalogue ends — 60 pages out of Beauty
  // Base's 829 — so "not in this run" overwhelmingly meant "not sampled this
  // run", not "withdrawn". Every hourly run therefore delisted the entire
  // previous run's findings in one stroke: Beauty Base held 300 distinct SKUs
  // but only ever 60 active, and LOOKFANTASTIC's stored listings all carried
  // the same delistedAt to the millisecond. The stored catalogue could never
  // exceed one run's sample no matter how often it ran.
  //
  // Absence only means withdrawal when the walk actually reached the end of
  // what it discovered, which is the case for a genuinely small catalogue and
  // not for a budgeted sample of a large one.
  const complete = result.pagesFetched >= result.urlsDiscovered;

  const outcome = reconcile({
    existing, crawled: withPrice, retailerId: retailer.id, now, complete,
  });

  store.write({
    retailerId: retailer.id,
    updatedAt: now,
    source: 'live',
    listings: outcome.listings,
    runs: prior.source === 'live' ? prior.runs : [],
  });

  // The stored total is the number that actually matters now: a run's own
  // count only ever reports one budget's worth, so growth is invisible without
  // it.
  const active = outcome.listings.filter((l) => l.status === 'active').length;
  console.log(
    `      stored: ${active} active of ${outcome.listings.length} known` +
      `  (+${outcome.newIds.length} new` +
      (outcome.delistedIds.length ? `, -${outcome.delistedIds.length} delisted` : '') +
      `${complete ? '' : ', partial walk so nothing delisted'})`,
  );
}

console.log(`\n${reached} of ${shops.length} shops yielded real priced listings`);
console.log(`${totalListings} listings total`);
if (zeroThisRun.length) console.log(`zero this run: ${zeroThisRun.join(', ')}`);
if (neverLive.length) console.log(`never once live: ${neverLive.join(', ')} — still on fixtures, excluded from the site`);
console.log('');

if (reached === 0) {
  console.error('Nothing harvested. Not writing anything rather than showing an empty app.');
  process.exit(1);
}

/**
 * Adaptive probe: try to reach each shop, learn from what fails, write it down.
 *
 *   npm run probe                 # every shop
 *   npm run probe -- --shop=boots # one shop
 *
 * Each shop gets its strategies ordered by what has worked before, tried until
 * one returns listings. Every outcome, good or bad, is folded into
 * data/strategy-memory.json, so the next run starts from what this one learned
 * instead of repeating it.
 *
 * Writes no catalogue data. Discovery only.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { loadRobots, runStrategy, type Http } from '../src/catalogue/attempt.js';
import { BOT_HEADERS, METERED_TIERS_ENABLED } from '../src/catalogue/botIdentity.js';
import { crawlViaShopifyProducts } from '../src/catalogue/shopifyProductsCrawl.js';
import { apifyProxyConfigFromEnv, apifyProxyHttp } from '../src/catalogue/apifyProxy.js';
import { apifyActorConfigFromEnv, apifyActorRenderer } from '../src/catalogue/apifyActor.js';
import {
  EMPTY_MEMORY, planFor, record, explain, type StrategyMemory,
} from '../src/catalogue/strategy.js';
import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { probeRobots } from '../src/catalogue/robotsSource.js';
import type { Retailer } from '../src/types/retailer.js';
import type { StoredListing } from '../src/catalogue/types.js';
import { isFragrance, sizeMl } from '../src/catalogue/fragranceId.js';
import { concentration } from '../src/catalogue/productName.js';
import { readSizesFromProductPages } from '../src/catalogue/productPageSize.js';
import { readStrengthsFromProductPages } from '../src/catalogue/productPageStrength.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const memoryPath = resolve(root, 'data/strategy-memory.json');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');

// The Apify proxy and actor are off (METERED_TIERS_ENABLED in
// src/catalogue/botIdentity.ts): every shop is read as PriceSniffsBot and a
// refusal is never worked around, which a residential address and a rendered
// browser exist to do. proxied-fetch and browser-render stay out of every plan.
const proxyConfig = METERED_TIERS_ENABLED ? apifyProxyConfigFromEnv() : null;
const proxiedHttp = proxyConfig ? apifyProxyHttp(proxyConfig) : undefined;
if (!METERED_TIERS_ENABLED) {
  console.log('The Apify proxy and actor tiers are off (owner decision 2026-10-04). proxied-fetch and browser-render are unavailable.\n');
} else if (proxyConfig) {
  console.log('Apify residential proxy configured. proxied-fetch is available this run.\n');
} else {
  console.log('No APIFY_PROXY_PASSWORD set. proxied-fetch will stay unavailable.\n');
}

// A separate credential from the proxy above — see apifyActor.ts's own
// header on why the two are not interchangeable. Either, both or neither may
// be set; each strategy fails soft with its own clear reason when its
// credential is absent, same as proxied-fetch always has.
const actorConfig = METERED_TIERS_ENABLED ? apifyActorConfigFromEnv() : null;
const actorRenderer = actorConfig ? apifyActorRenderer(actorConfig) : undefined;
if (!METERED_TIERS_ENABLED) {
  // Said above.
} else if (actorConfig) {
  console.log('Apify actor configured. browser-render is available this run.\n');
} else {
  console.log('No APIFY_TOKEN set. browser-render will stay unavailable.\n');
}

let memory: StrategyMemory = EMPTY_MEMORY;
if (existsSync(memoryPath)) {
  try {
    memory = JSON.parse(readFileSync(memoryPath, 'utf8')) as StrategyMemory;
  } catch {
    console.error('strategy-memory.json is unreadable. Starting fresh rather than guessing.');
  }
}

// The shared client: it sends as PriceSniffsBot and refuses anything else.
const http: Http = createHttp({ timeoutMs: 20_000 });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// affiliate-feed shops have an approved feed as their route in — probing
// retrieval strategies against them would mean testing how to scrape a
// partner who already handed the data over for free. See catalogue-harvest.ts.
//
// `enabled` is skipped only when a specific --shop was named. The bulk sweep
// (no --shop) stays scoped to enabled shops, same as always — nobody wants a
// routine run spending politeness budget on shops nobody has decided to
// carry. But a handful of disabled candidates (very, beauty-bay,
// cult-beauty-global, beauty-pie) have never had a single retrieval strategy
// tried against them at all: their registry entries hold `catalogue: null`
// because nobody has confirmed real section URLs yet, which is a fact that
// can only be established by asking, and asking a specific disabled shop by
// name is a deliberate diagnostic act, not an accidental one. Flipping
// `enabled` to make that possible is explicitly out of scope for this
// module — see the retailer's own comment — so the bypass lives here
// instead.
const shops = RETAILERS.filter(
  (r) => r.adapter !== 'affiliate-feed' && r.adapter !== 'owner-import' && (onlyShop ? r.id === onlyShop : r.enabled),
);

console.log(`\nAdaptive retrieval probe`);
console.log(`shops    ${shops.length}`);
console.log(`memory   ${Object.keys(memory.records).length} prior observations\n`);

const wins: string[] = [];
const losses: string[] = [];

/**
 * A shop with a pinned sitemap route (`Retailer.sitemapRoute`) is probed by
 * walking that route, and nothing else.
 *
 * The adaptive plan below tries a handful of ways to ask (the section page, the
 * sitemap, the search page, the homepage), every one as PriceSniffsBot. A
 * pinned route is a different promise: a route the owner has read and pinned,
 * robots.txt first, at the shop's own crawl delay. So the probe for such a shop
 * is the harvest's own walk, run dry with a small budget, and it reports what a
 * harvest would store: every listing with its price, or the currency it was
 * withheld for.
 */
const ROUTE_PROBE_PAGES = 8;
/** What a probe of a category walking route may take, as a scheduled run's per shop ceiling (--shop-minutes=40). */
const ROUTE_PROBE_CATEGORY_MS = 40 * 60_000;

async function probeRoute(retailer: Retailer): Promise<void> {
  const routeHttp = createHttp();
  const probe = await probeRobots(retailer, routeHttp, BOT_HEADERS);
  const robots = probe.rules;
  const gapMs = Math.max(retailer.catalogue?.minRequestGapMs ?? 1500, (robots.crawlDelaySeconds ?? 0) * 1000);
  console.log(`${retailer.name}: pinned sitemap route, honest user agent, ${gapMs}ms between requests`);
  for (const a of probe.attempts) console.log(`  robots ${a.url}: HTTP ${a.status}${a.error ? ` ${a.error}` : ''}`);
  if (robots.unavailable) {
    console.log('  robots.txt could not be read, so nothing is asked');
    memory = record(memory, retailer.id, 'sitemap-discovery', {
      ok: false, status: null, listings: 0, error: 'robots.txt unreadable',
    });
    return;
  }
  const result = await crawlViaSitemap({
    retailer, http: routeHttp, robots, maxPages: ROUTE_PROBE_PAGES, gapMs, headers: BOT_HEADERS,
    // A route that reads category pages walks them all before its first
    // product: 148 pages for Cult Beauty, about 5 to 11 minutes. The walk's
    // default 8 minutes left the first local probe with 109 pages and no
    // product, so the probe is given what a scheduled run's shop ceiling is.
    ...(retailer.sitemapRoute?.categories ? { maxDurationMs: ROUTE_PROBE_CATEGORY_MS } : {}),
    onProgress: (n, found) => console.log(`  ${n} fetched, ${found} found`),
  });
  const priced = result.listings.filter((l) => l.priceGbp !== null);
  if (result.categoryPagesFetched) console.log(`  ${result.categoryPagesFetched} category pages read to find them`);
  console.log(`  ${result.urlsDiscovered} product urls on the route, ${result.pagesFetched} fetched, ` +
    `${result.listings.length} listings, ${priced.length} priced in GBP`);
  for (const l of result.listings) {
    const money = l.priceGbp !== null
      ? `£${l.priceGbp.toFixed(2)}`
      : l.nativePrice ? `withheld (${l.nativePrice.amount} ${l.nativePrice.currency})` : 'no price';
    console.log(`    ${money.padEnd(28)} ${l.rawBrand ?? '?'} | ${l.rawTitle} | ${l.url}`);
  }
  for (const u of result.sampledUrls) console.log(`  fetched: ${u}`);
  for (const e of result.errors.slice(0, 12)) console.log(`  error: ${e}`);
  memory = record(memory, retailer.id, 'sitemap-discovery', {
    ok: priced.length > 0,
    status: 200,
    listings: priced.length,
    ...(priced.length > 0 ? {} : { error: result.errors[0] ?? 'route walked, nothing priced' }),
  });
  (priced.length > 0 ? wins : losses).push(
    `  ${retailer.name.padEnd(20)} pinned route: ${priced.length} of ${result.listings.length} listings priced`,
  );
}

/**
 * A shop named with `--shop` that is a confirmed Shopify storefront is probed
 * by the harvest's own route: robots.txt first, then the same
 * `crawlViaShopifyProducts` walk the harvest runs, a few pages deep and
 * writing nothing. It reports what a harvest would store, which is the only
 * thing worth knowing: which market was asked, what currency settled the
 * figures, and every sampled listing with its price, or the reason none was
 * given.
 *
 * Only reached for a named shop. The bulk sweep keeps to its adaptive
 * strategies, which do not know this route.
 */
const SHOPIFY_PROBE_PAGES = 12;

async function probeShopify(retailer: Retailer): Promise<void> {
  const routeHttp = createHttp();
  // Every shop is asked as PriceSniffsBot, robots.txt included, once.
  const probe = await probeRobots(retailer, routeHttp, BOT_HEADERS);
  const robots = probe.rules;
  const gapMs = Math.max(retailer.catalogue?.minRequestGapMs ?? 1500, (robots.crawlDelaySeconds ?? 0) * 1000);
  console.log(`${retailer.name}: Shopify /products.json route, robots.txt first, ${gapMs}ms between requests`);
  for (const a of probe.attempts) console.log(`  robots ${a.url}: HTTP ${a.status}${a.error ? ` ${a.error}` : ''}`);
  if (robots.unavailable) {
    console.log('  robots.txt could not be read, so nothing is asked');
    losses.push(`  ${retailer.name.padEnd(20)} robots.txt unreadable`);
    return;
  }
  const result = await crawlViaShopifyProducts({
    retailer, http: routeHttp, robots, headers: BOT_HEADERS,
    maxPages: SHOPIFY_PROBE_PAGES, gapMs,
    onProgress: (n, found) => console.log(`  ${n} fetched, ${found} found`),
  });
  let shown = result.listings;
  if (retailer.sizeFromProductPage) {
    // The same read the harvest makes, so the probe shows what a harvest would
    // store: the feed has no size, the product page does.
    const read = await readSizesFromProductPages(result.listings.filter((l) => l.priceGbp !== null), {
      http: routeHttp, robots, headers: { ...BOT_HEADERS, ...result.market.headers },
      gapMs, marketParam: result.market.query.replace(/^\?/, '') || null,
    });
    const bySku = new Map(read.listings.map((l) => [l.retailerSku, l]));
    shown = result.listings.map((l) => bySku.get(l.retailerSku) ?? l);
    console.log(`  product pages  ${read.fetched} read, ${read.sized} sizes read, ${read.unsized.length} state no size, ${read.unread.length} not read`);
    for (const u of read.unsized) console.log(`    states no size, left unsized: ${u}`);
    for (const u of read.unread) console.log(`    not read: ${u}`);
    for (const d of read.priceDisagreements) console.log(`    Shop now price differs from feed: ${d}`);
  }
  if (retailer.strengthFromProductPage) {
    // The same read the harvest makes: the titles name no strength, the page does.
    const read = await readStrengthsFromProductPages(shown.filter((l) => l.priceGbp !== null), {
      retailerId: retailer.id, http: routeHttp, robots,
      headers: { ...BOT_HEADERS, ...result.market.headers },
      gapMs, marketParam: result.market.query.replace(/^\?/, '') || null,
    });
    const bySku = new Map(read.listings.map((l) => [l.retailerSku, l]));
    shown = shown.map((l) => bySku.get(l.retailerSku) ?? l);
    console.log(`  product pages  ${read.fetched} read, ${read.stated} strengths read, ${read.unstated.length} state no strength, ${read.unread.length} not read`);
    for (const u of read.unstated) console.log(`    states no strength, left as it was: ${u}`);
    for (const u of read.unread) console.log(`    not read: ${u}`);
  }
  const priced = shown.filter((l) => l.priceGbp !== null);
  const keptAsFragrance = priced.filter((l) => isFragrance({ ...l, retailerId: retailer.id } as unknown as StoredListing));
  if (retailer.sizeFromProductPage || retailer.strengthFromProductPage) {
    console.log(`  fragrances the site would keep: ${keptAsFragrance.length} of ${priced.length} priced`);
    for (const l of keptAsFragrance) console.log(`    kept: ${l.rawTitle} | sizeMl ${sizeMl(l.rawTitle, l.description)} | ${concentration(l.rawTitle)} | £${l.priceGbp} | ${l.url}`);
  }
  console.log(`  market asked   ${result.market.label} (${result.market.why})`);
  console.log(`  currency       ${result.currency.isSterling ? 'STERLING' : 'not proven'}: ${result.currency.reason}`);
  console.log(`  rate ${result.currency.rate ?? 'none'}, presented ${result.currency.presented ?? 'nothing'}, ` +
    `settles ${result.currency.settlement ?? 'nothing'}, country ${result.currency.country ?? 'nothing'}`);
  console.log(`  ${result.pagesFetched} pages, ${result.listings.length} listings, ${priced.length} priced in GBP`);
  for (const l of shown) {
    const money = l.priceGbp !== null
      ? `£${l.priceGbp.toFixed(2)}`
      : l.nativePrice ? `withheld (${l.nativePrice.amount} ${l.nativePrice.currency})` : 'no price';
    console.log(`    ${money.padEnd(28)} ${l.rawBrand ?? '?'} | ${l.rawTitle} | ${l.productType ?? '-'} | ${l.url}`);
  }
  for (const e of result.errors.slice(0, 12)) console.log(`  error: ${e}`);
  (priced.length > 0 ? wins : losses).push(
    `  ${retailer.name.padEnd(20)} shopify route: ${priced.length} of ${result.listings.length} listings priced ` +
      `(${result.market.label})`,
  );
}

for (const retailer of shops) {
  if (onlyShop && retailer.shopifyStorefront && !retailer.sitemapRoute) {
    await probeShopify(retailer);
    continue;
  }
  if (retailer.sitemapRoute) {
    await probeRoute(retailer);
    continue;
  }
  const robots = await loadRobots(retailer, http);
  const politeGap = Math.max(
    retailer.catalogue?.minRequestGapMs ?? 1500,
    (robots.crawlDelaySeconds ?? 0) * 1000,
  );

  const plan = planFor(memory, retailer.id, {
    allowMetered: Boolean(proxyConfig) || Boolean(actorConfig),
  });
  const tried: string[] = [];
  let won = false;

  for (const strategyId of plan) {
    const attempt = await runStrategy(strategyId, {
      retailer, http, robots, sampleQuery: 'Dior Sauvage Eau de Parfum 100ml',
      ...(proxiedHttp ? { proxiedHttp } : {}),
      ...(actorRenderer ? { actorRender: actorRenderer.render } : {}),
    });

    memory = record(memory, retailer.id, strategyId, attempt.result);
    tried.push(
      `${strategyId} ${attempt.result.ok ? `ok ${attempt.result.listings}` : `x ${attempt.result.error}`}`,
    );

    // A strategy that returned real listings ends the search for this shop.
    if (attempt.result.ok && attempt.result.listings > 0) {
      won = true;
      wins.push(
        `  ${retailer.name.padEnd(20)} ${strategyId} found ${attempt.result.listings} listings` +
          (attempt.discovered?.sectionUrls?.[0]
            ? `\n      working URL: ${attempt.discovered.sectionUrls[0]}`
            : ''),
      );
      break;
    }

    await sleep(politeGap);
  }

  if (!won) {
    losses.push(`  ${retailer.name.padEnd(20)} ${tried.join(' | ')}`);
  }

  const robotsNote = robots.unavailable
    ? 'robots.txt unreadable'
    : `${robots.sitemaps.length} sitemaps, ${robots.disallow.length} disallow rules`;
  console.log(`${retailer.name.padEnd(20)} ${won ? 'REACHED' : 'blocked'}   (${robotsNote})`);
}

if (actorRenderer) {
  console.log(`\nApify actor pages rendered this run: ${actorRenderer.used()}`);
}

mkdirSync(dirname(memoryPath), { recursive: true });
writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);

console.log(`\n${wins.length} of ${shops.length} shops reached\n`);
if (wins.length) {
  console.log('Working:');
  console.log(wins.join('\n'));
}
if (losses.length) {
  console.log('\nStill blocked, with everything tried:');
  console.log(losses.join('\n'));
}

console.log('\nWhat the crawler now believes:\n');
for (const retailer of shops) {
  console.log(`  ${retailer.name}`);
  for (const line of explain(memory, retailer.id)) console.log(`    ${line}`);
}
console.log('\nmemory written to data/strategy-memory.json\n');

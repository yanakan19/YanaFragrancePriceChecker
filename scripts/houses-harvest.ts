/**
 * Harvest fragrance houses directly from their own storefronts, without an API.
 *
 *   npm run houses                     # every enabled house
 *   npm run houses -- --house=rasasi   # just one
 *   npm run houses -- --dry-run        # fetch and report, write nothing
 *
 * The route this leans on is Shopify's public `/products.json`, which needs no
 * key and no browser — see the header of src/catalogue/shopifyJson.ts for why
 * that is the way in for this segment. Where a house is not on Shopify it falls
 * back to the same sitemap + JSON-LD walk the UK retailers use.
 *
 * Nothing here fabricates anything. A house that cannot be reached is reported
 * as unreachable, a price in dirhams is recorded as dirhams, and a house whose
 * currency could not be established gets no sterling price at all.
 *
 * ── This script was not behind the "Vulcan Feu £67.99" report ───────────────
 * Checked 2026-08-13, because it had been suggested twice and never tested.
 *
 * A user reported French Avenue "Vulcan Feu" priced at £67.99 when the shop
 * charged £30.99. The second-hand explanation was that French Avenue is
 * `enabled: false, adapter: 'unknown'` in retailers.ts and therefore arrives
 * through this file's direct Shopify scrape. Every step of that is wrong, and
 * it is written down here because this is where the next person will look:
 *
 *   - French Avenue is a *brand* on that listing, not the shop selling it.
 *     The listing is MyBeauty.Boutique's, `sectionId: 'awin-feed'`, SKU
 *     shopify_GB_8416685916297_45147050049673 in
 *     data/catalogue/mybeauty-boutique.json.
 *   - There is no French Avenue house. src/config/houses.ts holds 33 houses
 *     and none of them is French Avenue — its header says so explicitly, it
 *     was moved to retailers.ts when a UK-specific domain turned up. This
 *     script has therefore never fetched it.
 *   - The `french-avenue` retailers.ts entry has no data file under
 *     data/catalogue/ or data/houses/ at all, so it contributes zero listings.
 *     `enabled: false` is doing exactly what it says.
 *
 * What actually happened: the merchant's Awin feed published `search_price`
 * 67.99 while its own storefront charged 30.99 — and 67.99 turned out to be
 * that storefront's `compare_at_price`. So it *was* a compare-at figure being
 * served as a selling price, which is the bug that was suspected, but it
 * happened inside the merchant's feed export, upstream of this repo, not in
 * any parser here. Traced through five daily snapshots holding 67.99
 * (2026-08-10 e6ed32a through 2026-08-12 3da6aa7) and the correction to 30.99
 * in f25111c, once scripts/storefront-reprice.ts ran at 2026-08-13T09:11:28Z.
 *
 * The route this file uses is clean: src/catalogue/shopifyJson.ts takes the
 * variant's `price` as the selling price and keeps `compare_at_price` only
 * when it is genuinely above it — asserted as 95 against 120 by "prices in
 * sterling only when the shop actually sells in sterling" in
 * tests/coverage.test.ts. An offline audit of every active stored listing
 * agrees: of 36,253 active listings across data/catalogue and data/houses,
 * 12,589 carry a reference price and zero of them have that reference sitting
 * at or below the selling price. There was no bug here to fix, so nothing in
 * this file changed — only this note, so the third person to suspect it can
 * start from the evidence instead of repeating the search.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { HOUSES, type House } from '../src/config/houses.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { parseShopifyProducts, parseShopCurrency, isShopifyProductsPayload } from '../src/catalogue/shopifyJson.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { parseRobots, isAllowed, NO_RESTRICTIONS, UNREACHABLE_ROBOTS, type RobotsRules } from '../src/catalogue/robots.js';
import { BROWSER_HEADERS, type Http } from '../src/catalogue/attempt.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import type { RawListing } from '../src/catalogue/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyHouse = arg('house');
const dryRun = process.argv.includes('--dry-run');
const maxProducts = Number.parseInt(arg('max') ?? '250', 10);

const http: Http = createHttp();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A house whose fetches are all slow (rather than erroring) can otherwise go
// silent for the whole loop and only print once it finishes — and a CI
// runner treats 10 minutes of a job producing no log output as a stuck
// process and kills it. This is what actually happened to a real run against
// this file: no code change caused it, a slow house's fetches just went
// unnoticed for exactly this reason. Every fetch below logs a short line
// for that reason, not for readability.
//
// PER_HOUSE_DEADLINE_MS is the second half of the fix: logging keeps the job
// alive, but does nothing to stop one slow house from spending the entire
// run's time budget that would otherwise have gone to the other 29.
const PER_HOUSE_DEADLINE_MS = 3 * 60_000;

async function robotsFor(origin: string): Promise<RobotsRules> {
  const res = await http(`${origin}/robots.txt`, BROWSER_HEADERS);
  if (res.ok && res.body) return parseRobots(res.body, 'pricesniffsbot');
  if (res.status >= 400 && res.status < 500) return NO_RESTRICTIONS;
  return UNREACHABLE_ROBOTS;
}

/** What one house's attempt produced, for the report. */
interface HouseOutcome {
  houseId: string;
  name: string;
  origin: string;
  routeUsed: string | null;
  currency: string | null;
  listings: number;
  pricedInGbp: number;
  withPhoto: number;
  errors: string[];
  blockers: string[];
}

/**
 * Try Shopify's public catalogue endpoint.
 *
 * Paginated because a house with a deep range will not fit one response, and
 * stopped as soon as a page comes back empty or short — Shopify signals the end
 * of the catalogue by returning fewer products than asked for.
 */
async function viaShopify(
  house: House,
  robots: RobotsRules,
  currency: string | null,
  errors: string[],
  deadlineAt: number,
): Promise<RawListing[]> {
  const listings: RawListing[] = [];
  const perPage = Math.min(maxProducts, 250);

  for (let page = 1; page <= 10; page++) {
    if (Date.now() >= deadlineAt) {
      errors.push('stopped early: exceeded this house\'s time budget');
      break;
    }

    const url = `${house.origin}/products.json?limit=${perPage}&page=${page}`;
    if (!isAllowed(robots, url)) {
      errors.push(`robots.txt disallows ${url}`);
      break;
    }

    const res = await http(url, BROWSER_HEADERS);
    console.log(`      ${house.name}: shopify page ${page}${res.ok ? '' : ` (HTTP ${res.status})`}`);
    if (!res.ok) {
      // A 404 here just means "not a Shopify storefront", which is a fact about
      // the house rather than a failure worth shouting about.
      if (res.status !== 404) {
        errors.push(`${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      }
      break;
    }

    if (!isShopifyProductsPayload(res.body)) {
      // Some sites answer any unknown path with their homepage.
      break;
    }

    const batch = parseShopifyProducts(res.body, {
      origin: house.origin,
      sectionId: 'house-direct',
      currency,
    });
    listings.push(...batch);

    const count = (JSON.parse(res.body) as { products: unknown[] }).products.length;
    if (count < perPage || listings.length >= maxProducts) break;

    await sleep(1500);
  }

  return listings;
}

/** Fall back to the sitemap walk when a house is not on Shopify. */
async function viaSitemap(
  house: House,
  robots: RobotsRules,
  errors: string[],
  deadlineAt: number,
): Promise<RawListing[]> {
  const roots = robots.sitemaps.length ? robots.sitemaps : [`${house.origin}/sitemap.xml`];
  const productUrls = new Set<string>();
  const queue = [...roots.slice(0, 4)];
  const seen = new Set<string>();
  let sitemapFetches = 0;

  while (queue.length > 0 && sitemapFetches < 8 && productUrls.size < maxProducts && Date.now() < deadlineAt) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!isAllowed(robots, url)) continue;

    const res = await http(url, BROWSER_HEADERS);
    sitemapFetches++;
    console.log(`      ${house.name}: sitemap fetch ${sitemapFetches}${res.ok ? '' : ` (HTTP ${res.status})`}`);
    if (!res.ok) {
      errors.push(`${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      continue;
    }

    for (const loc of [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!)) {
      if (/\.xml(\.gz)?(\?|$)/i.test(loc)) {
        if (/product/i.test(loc)) queue.push(loc);
      } else if (/\/products?\//i.test(loc)) {
        productUrls.add(loc);
      }
    }
  }

  const listings: RawListing[] = [];
  const productList = [...productUrls].slice(0, Math.min(maxProducts, 60));
  for (const [i, url] of productList.entries()) {
    if (Date.now() >= deadlineAt) {
      errors.push('stopped early: exceeded this house\'s time budget');
      break;
    }
    if (!isAllowed(robots, url)) continue;
    const res = await http(url, BROWSER_HEADERS);
    if ((i + 1) % 5 === 0 || i === productList.length - 1) {
      console.log(`      ${house.name}: product page ${i + 1}/${productList.length}`);
    }
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        errors.push('stopped early: the house began refusing requests');
        break;
      }
      continue;
    }
    listings.push(...parseListings(res.body, { sectionId: 'house-direct', pageUrl: url }));
    await sleep(1500);
  }

  return listings;
}

async function harvestHouse(house: House): Promise<HouseOutcome> {
  const deadlineAt = Date.now() + PER_HOUSE_DEADLINE_MS;
  const errors: string[] = [];
  const outcome: HouseOutcome = {
    houseId: house.id,
    name: house.name,
    origin: house.origin,
    routeUsed: null,
    currency: null,
    listings: 0,
    pricedInGbp: 0,
    withPhoto: 0,
    errors,
    blockers: [...house.blockers],
  };

  // A house is registered under one spelling of its origin, but only one of
  // `https://www.house.com` and `https://house.com` necessarily answers — the
  // other can refuse TLS or never resolve, which reads here as an unreachable
  // robots.txt and stops the house dead. Afnan and Al Attaar both failed that
  // way on the first live run. Trying the other spelling costs one request and
  // is not a guess about permission: whichever origin answers, its own
  // robots.txt is what gets obeyed.
  const alternate = house.origin.includes('://www.')
    ? house.origin.replace('://www.', '://')
    : house.origin.replace('://', '://www.');

  let origin = house.origin;
  let robots = await robotsFor(origin);

  if (robots.unavailable) {
    const viaAlternate = await robotsFor(alternate);
    if (!viaAlternate.unavailable) {
      origin = alternate;
      robots = viaAlternate;
      outcome.origin = origin;
      errors.push(`${house.origin} did not answer; used ${alternate} instead`);
    }
  }

  if (robots.unavailable) {
    errors.push(
      `robots.txt unreachable at ${house.origin} and ${alternate} — ` +
        'holding off rather than guessing we are welcome',
    );
    return outcome;
  }

  // Everything below must use the origin that actually answered, not the one
  // the registry happened to be written with.
  house = { ...house, origin };

  // Currency first: it changes how every price below is recorded, and getting
  // it wrong is worse than getting nothing.
  const meta = await http(`${house.origin}/meta.json`, BROWSER_HEADERS);
  const home = await http(`${house.origin}/`, BROWSER_HEADERS);
  const currency = parseShopCurrency(meta.ok ? meta.body : null, home.ok ? home.body : null);
  outcome.currency = currency;

  if (currency === null) {
    errors.push('storefront currency could not be established — no sterling price recorded');
  } else if (currency !== 'GBP') {
    outcome.blockers.push(`prices are in ${currency}, not GBP — needs a UK price source before these are comparable`);
  }

  let listings: RawListing[] = [];
  for (const route of house.routes) {
    if (Date.now() >= deadlineAt) {
      errors.push('stopped early: exceeded this house\'s time budget before trying every route');
      break;
    }
    listings =
      route === 'shopify-products-json'
        ? await viaShopify(house, robots, currency, errors, deadlineAt)
        : await viaSitemap(house, robots, errors, deadlineAt);

    if (listings.length > 0) {
      outcome.routeUsed = route;
      break;
    }
  }

  outcome.listings = listings.length;
  outcome.pricedInGbp = listings.filter((l) => l.priceGbp !== null).length;
  outcome.withPhoto = listings.filter((l) => l.imageUrl !== null).length;

  if (listings.length === 0) {
    outcome.blockers.push('no listings retrieved from the storefront on this run');
    return outcome;
  }

  if (dryRun) return outcome;

  // Stored under the house id so a house never collides with a UK retailer.
  const store = new CatalogueStore(resolve(root, 'data/houses'));
  const prior = store.read(house.id);
  const existing = prior.source === 'live' ? prior.listings : [];
  const now = new Date().toISOString();

  // Shopify's products.json is the whole catalogue rather than a sample, so
  // absence there really does mean withdrawn. The sitemap fallback is budgeted
  // and therefore is not evidence of absence — the same rule the retailer
  // harvest now follows.
  const complete = outcome.routeUsed === 'shopify-products-json';

  const result = reconcile({
    existing, crawled: listings, retailerId: house.id, now, complete,
  });

  store.write({
    retailerId: house.id,
    updatedAt: now,
    source: 'live',
    listings: result.listings,
    runs: prior.source === 'live' ? prior.runs : [],
  });

  return outcome;
}

const houses = HOUSES.filter((h) => h.enabled && (!onlyHouse || h.id === onlyHouse));

console.log('\nHouse direct harvest');
console.log(`houses   ${houses.length}`);
if (dryRun) console.log('mode     dry run, report only, no catalogue written');
console.log('');

const outcomes: HouseOutcome[] = [];
for (const house of houses) {
  const outcome = await harvestHouse(house);
  outcomes.push(outcome);

  console.log(
    `  ${house.name.padEnd(18)} ${String(outcome.listings).padStart(4)} listings  ` +
      `${String(outcome.pricedInGbp).padStart(4)} in GBP  ` +
      `${String(outcome.withPhoto).padStart(4)} with photo  ` +
      `${outcome.routeUsed ?? 'no route worked'}` +
      `${outcome.currency ? `  [${outcome.currency}]` : ''}`,
  );
  for (const e of outcome.errors.slice(0, 2)) console.log(`      ${e}`);
}

const reached = outcomes.filter((o) => o.listings > 0).length;
const totalGbp = outcomes.reduce((n, o) => n + o.pricedInGbp, 0);

writeFileSync(
  resolve(root, 'data/house-sourcing-report.json'),
  `${JSON.stringify({ checkedAt: new Date().toISOString(), outcomes }, null, 2)}\n`,
);

console.log(`\n${reached} of ${houses.length} houses returned listings`);
console.log(`${totalGbp} of those carry a sterling price and could enter the comparison`);
console.log('Report: data/house-sourcing-report.json\n');

if (reached === 0) {
  console.log(
    'No house storefront could be read on this run. That is recorded as-is:\n' +
      'these houses stay listed as known-but-unsourced rather than being given\n' +
      'invented prices. See data/house-sourcing-report.json for the reason each gave.',
  );
}

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
import type { RawListing } from '../src/catalogue/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyHouse = arg('house');
const dryRun = process.argv.includes('--dry-run');
const maxProducts = Number.parseInt(arg('max') ?? '250', 10);

const http: Http = async (url, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    return { status: res.status, body: await res.text(), ok: res.ok };
  } catch (err) {
    return { status: 0, body: '', ok: false, error: String(err).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
): Promise<RawListing[]> {
  const listings: RawListing[] = [];
  const perPage = Math.min(maxProducts, 250);

  for (let page = 1; page <= 10; page++) {
    const url = `${house.origin}/products.json?limit=${perPage}&page=${page}`;
    if (!isAllowed(robots, url)) {
      errors.push(`robots.txt disallows ${url}`);
      break;
    }

    const res = await http(url, BROWSER_HEADERS);
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
): Promise<RawListing[]> {
  const roots = robots.sitemaps.length ? robots.sitemaps : [`${house.origin}/sitemap.xml`];
  const productUrls = new Set<string>();
  const queue = [...roots.slice(0, 4)];
  const seen = new Set<string>();
  let sitemapFetches = 0;

  while (queue.length > 0 && sitemapFetches < 8 && productUrls.size < maxProducts) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!isAllowed(robots, url)) continue;

    const res = await http(url, BROWSER_HEADERS);
    sitemapFetches++;
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
  for (const url of [...productUrls].slice(0, Math.min(maxProducts, 60))) {
    if (!isAllowed(robots, url)) continue;
    const res = await http(url, BROWSER_HEADERS);
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
    listings =
      route === 'shopify-products-json'
        ? await viaShopify(house, robots, currency, errors)
        : await viaSitemap(house, robots, errors);

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

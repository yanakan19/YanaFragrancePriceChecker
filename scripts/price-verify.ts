/**
 * Check the prices we publish against what the shops actually charge today.
 *
 *   npm run price:verify                          # every enabled retailer
 *   npm run price:verify -- --shop=mybeauty-boutique
 *   npm run price:verify -- --sample=40           # cap the page-fetch route
 *   npm run price:verify -- --no-report           # log only, write nothing
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Everything else in this repo asks "what does this shop sell". Nothing asked
 * "is the number we print beside the bottle still the number on the shop's own
 * page". That is the one claim the whole site rests on, and until this script
 * it was never independently measured — a stale snapshot, a mis-mapped feed
 * column or a broken extractor all look identical from inside the catalogue.
 *
 * So this reads the shop again, by a route that is deliberately *not* the route
 * that produced the stored price, and reports the disagreement. It never writes
 * a price. It cannot fix anything, and that is on purpose: a verifier that
 * repairs what it measures can no longer be trusted to measure it.
 *
 * ── Two routes, and why the choice matters ───────────────────────────────────
 * `products.json`  Shopify serves its whole live catalogue, unauthenticated, at
 *                  `/products.json`. Where a shop runs Shopify this checks
 *                  *every* stored listing rather than a sample, in ~1 request
 *                  per 250 products, and gives an exact key (variant id or
 *                  variant sku) rather than a title guess. This is the route
 *                  that can settle an affiliate-feed retailer, because a feed
 *                  row's only URL is an Awin tracking link.
 *
 * `product-page`   Fetch the stored product URL and re-read schema.org JSON-LD
 *                  with the same parser the harvest uses. Sampled, because a
 *                  shop with 8,000 listings is 8,000 requests. Used where the
 *                  shop is not on Shopify.
 *
 * ── What it will not do ──────────────────────────────────────────────────────
 *   - It never fetches an affiliate deeplink. An `awin1.com/pclick` URL is a
 *     click that gets reported to the merchant as a real customer, and firing
 *     thousands of them to check prices would be fraud against the programme
 *     that feeds us. Listings whose only URL is a tracking link are verified
 *     through `products.json` or reported unverifiable — never by following the
 *     link.
 *
 *     Since 2026-08-13 a feed listing usually has a second address: Awin's
 *     `merchant_deep_link`, stored as `merchantUrl` (see the header of
 *     src/catalogue/awinFeed.ts). That is the merchant's own product page, so
 *     it can be fetched exactly like any scraped retailer's URL, and it is
 *     what gives Fragrance Click — 907 active listings, no `/products.json`,
 *     every stored `url` a tracking link — a verification route for the first
 *     time. The choice between the two URLs is made in one place,
 *     `verificationTarget()`, which returns nothing at all unless the address
 *     is on the retailer's own domain. A tracking link therefore cannot be
 *     fetched even if the two fields are ever populated the wrong way round.
 *   - It never guesses a price. A listing it could not key against live data is
 *     counted as `unkeyed`, not as agreeing.
 *   - It obeys robots.txt, the registry's `minRequestGapMs` and any
 *     `crawl-delay` the shop states, taking whichever is slowest. A verification
 *     pass that gets us blocked costs more than it is worth.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { RETAILERS } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import {
  parseRobots,
  isAllowed,
  NO_RESTRICTIONS,
  UNREACHABLE_ROBOTS,
  type RobotsRules,
} from '../src/catalogue/robots.js';
import { BROWSER_HEADERS, type Http } from '../src/catalogue/attempt.js';
import { parseShopCurrency } from '../src/catalogue/shopifyJson.js';
import {
  emptyPriceIndex,
  indexShopifyPage,
  lookupLivePrice,
  type ShopifyPriceIndex,
} from '../src/catalogue/shopifyPriceIndex.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { verificationTarget } from '../src/catalogue/verificationTarget.js';
import type { StoredListing } from '../src/catalogue/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');
const sampleSize = Number.parseInt(arg('sample') ?? '30', 10);
const writeReport = !process.argv.includes('--no-report');
/** Deterministic sampling, so a re-run measures the same listings. */
const seed = Number.parseInt(arg('seed') ?? '20260812', 10);
const perShopBudgetMs = Number.parseInt(arg('budget-ms') ?? '240000', 10);

const http: Http = createHttp({ timeoutMs: 20_000 });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A price counts as agreeing when it rounds to the same penny. */
const PENNY = 0.005;

/**
 * Floor on the gap between requests, on top of whatever the registry and
 * robots.txt ask for. `minRequestGapMs` is unset for every feed retailer (they
 * were never crawled), and this pass does crawl them, so it needs its own.
 */
const GAP_FLOOR_MS = 1200;

// ── Sampling ────────────────────────────────────────────────────────────────

/** mulberry32: a small deterministic PRNG, so `--seed` genuinely repeats. */
function rng(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(items: readonly T[], n: number, random: () => number): T[] {
  if (items.length <= n) return [...items];
  const picked = [...items];
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return picked.slice(0, n);
}

// ── Live price lookup ───────────────────────────────────────────────────────

interface Comparison {
  retailerSku: string;
  title: string;
  storedPrice: number;
  livePrice: number;
  /** Positive when we show more than the shop charges — the damaging direction. */
  overstatementGbp: number;
  overstatementPct: number;
  liveUrl: string;
}

interface ShopOutcome {
  retailerId: string;
  name: string;
  route: 'products.json' | 'product-page' | null;
  /** How many active listings this shop contributes to the site. */
  activeListings: number;
  /** How many of those this run actually attempted to key against live data. */
  attempted: number;
  /** Of those, how many produced a live price to compare. */
  compared: number;
  agree: number;
  drifted: number;
  overstated: number;
  understated: number;
  unkeyed: number;
  outOfStockLive: number;
  /** Sum of pounds we overstate across every compared listing. */
  overstatementGbpTotal: number;
  medianAbsDriftGbp: number;
  worst: Comparison[];
  notes: string[];
  /** True when `compared` covers every active listing, not a sample. */
  fullPopulation: boolean;
  snapshotUpdatedAt: string;
  /**
   * The currency the storefront itself publishes, or null where it publishes
   * none. Recorded on every outcome because a comparison between two
   * currencies is not a drift measurement, it is a nonsense one.
   */
  storefrontCurrency: string | null;
  /**
   * Set when the result was thrown away as not a like-for-like comparison.
   * Distinct from "no route": a route ran, and its answer was rejected.
   */
  notComparable: string | null;
}

async function robotsFor(origin: string): Promise<RobotsRules> {
  const res = await http(`${origin}/robots.txt`, BROWSER_HEADERS);
  if (res.ok && res.body) return parseRobots(res.body, 'pricesniffsbot');
  if (res.status >= 400 && res.status < 500) return NO_RESTRICTIONS;
  return UNREACHABLE_ROBOTS;
}

function gapFor(retailer: Retailer, robots: RobotsRules): number {
  const registry = retailer.catalogue?.minRequestGapMs ?? 0;
  const stated = (robots.crawlDelaySeconds ?? 0) * 1000;
  return Math.max(GAP_FLOOR_MS, registry, stated);
}

/**
 * Walk a Shopify storefront's public catalogue into a lookup table.
 *
 * The table itself lives in src/catalogue/shopifyPriceIndex.ts, shared with
 * scripts/storefront-reprice.ts on purpose: the repair must key listings by
 * exactly the same rules this pass used to measure them, or a re-verification
 * would be checking a different question from the one the fix answered.
 */
async function shopifyIndex(
  origin: string,
  robots: RobotsRules,
  gap: number,
  deadlineAt: number,
  notes: string[],
): Promise<ShopifyPriceIndex | null> {
  const index = emptyPriceIndex();
  let products = 0;

  // The end-of-catalogue signal is an *empty* page, not a short one. Breaking
  // on `< 250` looked right and was wrong in a way that silently halved this
  // pass's reach: it stopped Escentual at 248 products, so 7,846 of its 8,103
  // listings were reported unkeyed when the shop had simply returned a page
  // the theme had padded differently.
  for (let page = 1; page <= 200; page++) {
    if (Date.now() >= deadlineAt) {
      notes.push(`stopped at products.json page ${page}: out of time budget`);
      break;
    }

    const url = `${origin}/products.json?limit=250&page=${page}`;
    if (!isAllowed(robots, url)) {
      notes.push(`robots.txt disallows ${origin}/products.json — no full-catalogue route`);
      return null;
    }

    const res = await http(url, BROWSER_HEADERS);
    if (!res.ok) {
      if (page === 1) {
        notes.push(`products.json: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
        return null;
      }
      notes.push(`products.json stopped at page ${page}: HTTP ${res.status}`);
      break;
    }

    const parsed = indexShopifyPage(res.body, origin, index);
    if (!parsed.isShopify) {
      if (page === 1) {
        notes.push('products.json did not return a Shopify products payload');
        return null;
      }
      break;
    }
    products += parsed.products;
    if (parsed.products === 0) break;
    await sleep(gap);
  }

  if (index.size === 0) {
    notes.push('products.json answered but carried no priced variants');
    return null;
  }
  notes.push(`products.json: ${products} products, ${index.size} lookup keys`);
  return index;
}

// ── The pass itself ─────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function record(
  outcome: ShopOutcome,
  listing: StoredListing,
  live: { price: number; available: boolean | null; productUrl: string },
  drifts: number[],
): void {
  const stored = listing.priceGbp!;
  outcome.compared++;
  if (live.available === false) outcome.outOfStockLive++;

  const delta = stored - live.price;
  drifts.push(Math.abs(delta));

  if (Math.abs(delta) < PENNY) {
    outcome.agree++;
    return;
  }

  outcome.drifted++;
  if (delta > 0) {
    outcome.overstated++;
    outcome.overstatementGbpTotal += delta;
  } else {
    outcome.understated++;
  }

  outcome.worst.push({
    retailerSku: listing.retailerSku,
    title: listing.rawTitle.slice(0, 70),
    storedPrice: stored,
    livePrice: live.price,
    overstatementGbp: Number(delta.toFixed(2)),
    overstatementPct: Number(((delta / live.price) * 100).toFixed(1)),
    liveUrl: live.productUrl,
  });
}

async function verifyShop(retailer: Retailer): Promise<ShopOutcome> {
  const deadlineAt = Date.now() + perShopBudgetMs;
  const store = new CatalogueStore(resolve(root, 'data/catalogue'));
  const snapshot = store.read(retailer.id);
  const active =
    snapshot.source === 'live'
      ? snapshot.listings.filter(
          (l) => l.status === 'active' && typeof l.priceGbp === 'number' && l.priceGbp > 0,
        )
      : [];

  const outcome: ShopOutcome = {
    retailerId: retailer.id,
    name: retailer.name,
    route: null,
    activeListings: active.length,
    attempted: 0,
    compared: 0,
    agree: 0,
    drifted: 0,
    overstated: 0,
    understated: 0,
    unkeyed: 0,
    outOfStockLive: 0,
    overstatementGbpTotal: 0,
    medianAbsDriftGbp: 0,
    worst: [],
    notes: [],
    fullPopulation: false,
    snapshotUpdatedAt: snapshot.updatedAt,
    storefrontCurrency: null,
    notComparable: null,
  };

  if (active.length === 0) {
    outcome.notes.push(
      snapshot.source === 'live'
        ? 'no active priced listings — nothing on the site to verify'
        : 'snapshot is fixture data, which scripts/build-demo-catalogue.ts refuses to publish — ' +
          'nothing of this retailer is on the site, so there is no live price to check',
    );
    return outcome;
  }

  // `domain`, not `homepage`. They disagree on the www prefix for several
  // retailers, and Shopify does not treat the two as the same storefront:
  // https://www.escentual.com/products.json answered with 248 products while
  // https://escentual.com/products.json (what the harvest itself uses, via
  // shopifyProductsCrawl.ts) carries the whole catalogue. Reading a different
  // origin from the one that produced the data is how a verifier reports
  // 7,846 phantom mismatches.
  const origin = `https://${retailer.domain.replace(/^www\./, '')}`;
  const robots = await robotsFor(origin);
  if (robots.unavailable) {
    outcome.notes.push(
      'robots.txt could not be read — holding off rather than assuming we are welcome',
    );
    return outcome;
  }
  const gap = gapFor(retailer, robots);
  outcome.notes.push(`gap ${gap}ms (registry ${retailer.catalogue?.minRequestGapMs ?? 0}, robots ${robots.crawlDelaySeconds ?? 0}s)`);

  // Currency before prices, because it changes what every number below means.
  //
  // Nicchia Luxury is why this exists. Run 2 compared all 6,844 of its
  // listings against its storefront and reported every single one as drifted,
  // none agreeing, all in the same direction — and the worst cases were a
  // stored £5 against a live 6, exactly 1.2x, repeated. A shop does not
  // reprice its entire catalogue by a constant factor. That is two different
  // currencies being subtracted from each other and the difference reported as
  // pounds, which is the one class of error this project must never commit.
  //
  // The same check src/catalogue/shopifyJson.ts already uses for houses, for
  // the same reason.
  const meta = await http(`${origin}/meta.json`, BROWSER_HEADERS);
  const home = await http(`${origin}/`, BROWSER_HEADERS);
  outcome.storefrontCurrency = parseShopCurrency(meta.ok ? meta.body : null, home.ok ? home.body : null);
  if (outcome.storefrontCurrency !== null && outcome.storefrontCurrency !== 'GBP') {
    outcome.notComparable =
      `storefront publishes prices in ${outcome.storefrontCurrency}, not GBP — ` +
      'no comparison made rather than a difference between two currencies reported as pounds';
    outcome.notes.push(outcome.notComparable);
    return outcome;
  }

  const drifts: number[] = [];

  // ── Route 1: the shop's whole live catalogue ──────────────────────────────
  const index = await shopifyIndex(origin, robots, gap, deadlineAt, outcome.notes);
  if (index) {
    for (const listing of active) {
      outcome.attempted++;
      // `merchantUrl` first: the index's last-resort lookup reads a
      // `/products/<handle>` path out of the URL, and a feed listing's `url` is
      // a tracking link that has no such path — so before this field existed
      // that fallback was simply dead for every feed retailer.
      const live = lookupLivePrice(
        listing.retailerSku,
        listing.merchantUrl ?? listing.url,
        index,
      );
      if (!live) {
        outcome.unkeyed++;
        continue;
      }
      record(outcome, listing, live, drifts);
    }

    // A storefront can be on Shopify and still be unkeyable: AllBeauty serves
    // /products.json but its stored SKUs are its own merchant codes, so 115 of
    // its 116 listings found nothing there. Reporting that as "verified, 1 of
    // 116" would be a route failure dressed up as a result, so anything under
    // half keyed falls through to reading the product pages instead — which
    // works, because those retailers store their own real product URLs.
    // A shop cannot have repriced every listing it sells since the last sync.
    // Zero agreement across a large population means the two sides are not the
    // same quantity — a currency the check above could not read, a market with
    // its own price list, a tax base. Whatever it is, it is not drift, and
    // reporting it as drift would put a fabricated number in the report.
    if (outcome.compared >= 50 && outcome.agree === 0) {
      outcome.notComparable =
        `not one of ${outcome.compared} listings agreed with the storefront, and every ` +
        `difference ran the same way — the two sides are not the same quantity ` +
        `(storefront currency: ${outcome.storefrontCurrency ?? 'not published'}). ` +
        'Reported as uncomparable rather than as drift.';
      outcome.notes.push(outcome.notComparable);
      outcome.route = 'products.json';
      outcome.drifted = 0;
      outcome.overstated = 0;
      outcome.understated = 0;
      outcome.compared = 0;
      outcome.worst = [];
      outcome.overstatementGbpTotal = 0;
      return outcome;
    }

    const keyed = outcome.compared / active.length;
    if (keyed >= 0.5) {
      outcome.route = 'products.json';
      outcome.fullPopulation = outcome.compared === active.length;
      outcome.medianAbsDriftGbp = Number(median(drifts).toFixed(2));
      outcome.worst.sort((a, b) => b.overstatementGbp - a.overstatementGbp);
      outcome.worst = outcome.worst.slice(0, 8);
      return outcome;
    }

    outcome.notes.push(
      `products.json keyed only ${outcome.compared}/${active.length} listings — ` +
        'falling back to reading product pages',
    );
    outcome.attempted = 0;
    outcome.compared = 0;
    outcome.agree = 0;
    outcome.drifted = 0;
    outcome.overstated = 0;
    outcome.understated = 0;
    outcome.unkeyed = 0;
    outcome.outOfStockLive = 0;
    outcome.overstatementGbpTotal = 0;
    outcome.worst = [];
    drifts.length = 0;
  }

  // ── Route 2: re-read a sample of product pages ────────────────────────────
  //
  // Only listings that expose an address on the retailer's own domain — their
  // `merchantUrl` where a feed published one, otherwise their `url`. A feed
  // retailer's `url` is an Awin tracking link and fetching one reports a
  // customer click that never happened, so a listing offering nothing else is
  // counted unverifiable instead. See `verificationTarget`.
  const fetchable = active
    .map((listing) => ({ listing, target: verificationTarget(listing, retailer.domain) }))
    .filter((entry): entry is { listing: StoredListing; target: string } => entry.target !== null);

  const viaMerchantUrl = fetchable.filter((e) => Boolean(e.listing.merchantUrl)).length;

  if (fetchable.length === 0) {
    outcome.notes.push(
      'no listing carries a URL on this retailer\'s own domain — the only stored URL is an ' +
        'affiliate tracking link, which this pass will not fetch, and no merchant_deep_link ' +
        'was carried through either. Unverifiable by this route.',
    );
    return outcome;
  }
  if (fetchable.length < active.length) {
    outcome.notes.push(
      `${active.length - fetchable.length} listings skipped: no address on the retailer's own domain`,
    );
  }
  if (viaMerchantUrl > 0) {
    outcome.notes.push(
      `${viaMerchantUrl} listings verified via merchant_deep_link rather than the tracking link`,
    );
  }

  outcome.route = 'product-page';
  const picked = sample(fetchable, sampleSize, rng(seed));

  for (const { listing, target } of picked) {
    if (Date.now() >= deadlineAt) {
      outcome.notes.push('stopped early: out of time budget');
      break;
    }
    // Already absolute and already domain-checked by verificationTarget().
    const url = target;
    if (!isAllowed(robots, url)) {
      outcome.notes.push(`robots.txt disallows ${new URL(url).pathname} — skipped`);
      continue;
    }

    outcome.attempted++;
    const res = await http(url, BROWSER_HEADERS);
    if (!res.ok) {
      outcome.unkeyed++;
      if (outcome.notes.length < 12) outcome.notes.push(`HTTP ${res.status} on ${new URL(url).pathname}`);
      await sleep(gap);
      continue;
    }

    const parsed = parseListings(res.body, { sectionId: 'verify', pageUrl: url });
    const hit =
      parsed.find((p) => p.retailerSku === listing.retailerSku) ??
      (parsed.length === 1 ? parsed[0]! : undefined);

    if (!hit || hit.priceGbp === null) {
      outcome.unkeyed++;
      await sleep(gap);
      continue;
    }

    record(
      outcome,
      listing,
      { price: hit.priceGbp, available: hit.inStock, productUrl: url },
      drifts,
    );
    await sleep(gap);
  }

  outcome.medianAbsDriftGbp = Number(median(drifts).toFixed(2));
  outcome.worst.sort((a, b) => b.overstatementGbp - a.overstatementGbp);
  outcome.worst = outcome.worst.slice(0, 8);
  return outcome;
}

// ── Run ─────────────────────────────────────────────────────────────────────

const shops = RETAILERS.filter((r) => r.enabled && (!onlyShop || r.id === onlyShop));

console.log('\nPrice verification');
console.log(`shops     ${shops.length}`);
console.log(`sample    ${sampleSize} per shop on the product-page route (products.json checks every listing)`);
console.log(`seed      ${seed}`);
console.log('');

const outcomes: ShopOutcome[] = [];
for (const retailer of shops) {
  const started = Date.now();
  let outcome: ShopOutcome;
  try {
    outcome = await verifyShop(retailer);
  } catch (err) {
    console.log(`  ${retailer.id}: threw — ${String(err).slice(0, 160)}`);
    continue;
  }
  outcomes.push(outcome);
  console.log(
    `  ${outcome.retailerId.padEnd(22)} ${(outcome.route ?? 'no route').padEnd(14)} ` +
      `${String(outcome.compared).padStart(5)}/${String(outcome.activeListings).padEnd(5)} compared  ` +
      `agree ${String(outcome.agree).padStart(5)}  drift ${String(outcome.drifted).padStart(5)}  ` +
      `over ${String(outcome.overstated).padStart(5)}  unkeyed ${String(outcome.unkeyed).padStart(5)}  ` +
      `${Math.round((Date.now() - started) / 1000)}s`,
  );
  for (const n of outcome.notes.slice(0, 4)) console.log(`      ${n}`);
  // Printed here, per shop, rather than only in the summary at the end: a run
  // that is cancelled or hits the job cap loses everything after the last line
  // it printed, and the first full-fleet pass was cut off exactly that way.
  // The evidence for each shop should survive its own line.
  if (outcome.overstated > 0) {
    console.log(
      `      overstated on ${outcome.overstated} of ${outcome.compared} compared, ` +
        `£${outcome.overstatementGbpTotal.toFixed(2)} total, median abs drift £${outcome.medianAbsDriftGbp}`,
    );
    for (const w of outcome.worst.slice(0, 3)) {
      console.log(
        `      we show £${w.storedPrice.toFixed(2)}, shop charges £${w.livePrice.toFixed(2)} ` +
          `(+£${w.overstatementGbp.toFixed(2)}, ${w.overstatementPct}%) ${w.title}`,
      );
    }
  }
}

if (writeReport) {
  writeFileSync(
    resolve(root, 'data/price-verification-report.json'),
    `${JSON.stringify({ checkedAt: new Date().toISOString(), seed, sampleSize, outcomes }, null, 2)}\n`,
  );
}

// ── The summary, printed last so it survives a truncated log tail ───────────

console.log('\n──────── drift by retailer, worst first ────────');
console.log('retailer                route          compared  agree%  over%  medianDrift  worstOver');
const ranked = [...outcomes].sort((a, b) => {
  const ra = a.compared ? a.overstated / a.compared : -1;
  const rb = b.compared ? b.overstated / b.compared : -1;
  return rb - ra;
});
for (const o of ranked) {
  const agreePct = o.compared ? ((o.agree / o.compared) * 100).toFixed(1) : '  n/a';
  const overPct = o.compared ? ((o.overstated / o.compared) * 100).toFixed(1) : '  n/a';
  const worst = o.worst[0] ? `£${o.worst[0].overstatementGbp.toFixed(2)}` : '-';
  console.log(
    `${o.retailerId.padEnd(23)} ${(o.route ?? 'none').padEnd(14)} ${String(o.compared).padStart(8)}  ` +
      `${agreePct.padStart(6)}  ${overPct.padStart(5)}  ${String(o.medianAbsDriftGbp).padStart(11)}  ${worst.padStart(9)}` +
      `${o.fullPopulation ? '  [all]' : ''}`,
  );
}

console.log('\n──────── worst overstatements seen ────────');
const allWorst = outcomes
  .flatMap((o) => o.worst.map((w) => ({ ...w, retailerId: o.retailerId })))
  .filter((w) => w.overstatementGbp > 0)
  .sort((a, b) => b.overstatementGbp - a.overstatementGbp)
  .slice(0, 25);
for (const w of allWorst) {
  console.log(
    `  ${w.retailerId.padEnd(22)} stored £${w.storedPrice.toFixed(2).padStart(8)}  ` +
      `live £${w.livePrice.toFixed(2).padStart(8)}  ` +
      `+£${w.overstatementGbp.toFixed(2).padStart(8)} (${w.overstatementPct}%)  ${w.title}`,
  );
}

const totalCompared = outcomes.reduce((n, o) => n + o.compared, 0);
const totalOver = outcomes.reduce((n, o) => n + o.overstated, 0);
const totalDrift = outcomes.reduce((n, o) => n + o.drifted, 0);
const unverifiable = outcomes.filter((o) => o.route === null);

console.log(`\n${totalCompared} listings compared against a live shop price.`);
console.log(`${totalDrift} disagree; ${totalOver} of those are overstatements (we show more than the shop charges).`);
if (unverifiable.length > 0) {
  console.log(`\n${unverifiable.length} retailers produced no verification route:`);
  for (const o of unverifiable) {
    console.log(`  ${o.retailerId.padEnd(22)} ${o.activeListings} active listings — ${o.notes[o.notes.length - 1] ?? 'no reason recorded'}`);
  }
}
if (writeReport) console.log('\nReport: data/price-verification-report.json');
console.log('');

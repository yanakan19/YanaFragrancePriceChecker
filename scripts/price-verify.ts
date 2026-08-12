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
import { createHttp } from '../src/catalogue/httpFetch.js';
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

interface LivePrice {
  price: number;
  compareAt: number | null;
  available: boolean | null;
  /** Where on the shop this figure was read, for the report's evidence trail. */
  liveUrl: string;
}

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

function money(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Walk a Shopify storefront's public catalogue into a lookup table.
 *
 * The table is keyed several ways on purpose. A stored `retailerSku` was
 * written by whichever ingestion route produced it, and those disagree: the
 * Awin feed writes `shopify_GB_<productId>_<variantId>`, `shopifyJson.ts`
 * writes the variant's own sku (or `<productId>-<variantTitle>` when the shop
 * left sku blank), and a JSON-LD harvest writes whatever the page's markup
 * called it. Registering every one of those spellings as an alias is what lets
 * one route verify listings that another route created — which is the entire
 * point of this script.
 */
async function shopifyIndex(
  origin: string,
  robots: RobotsRules,
  gap: number,
  deadlineAt: number,
  notes: string[],
): Promise<Map<string, LivePrice> | null> {
  const index = new Map<string, LivePrice>();
  const add = (key: string | null | undefined, value: LivePrice) => {
    if (!key) return;
    const k = key.trim();
    if (k && !index.has(k)) index.set(k, value);
  };

  let products = 0;
  for (let page = 1; page <= 400; page++) {
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

    let batch: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(res.body) as { products?: unknown };
      if (!Array.isArray(parsed.products)) {
        if (page === 1) {
          notes.push('products.json did not return a Shopify products payload');
          return null;
        }
        break;
      }
      batch = parsed.products as Record<string, unknown>[];
    } catch {
      if (page === 1) {
        notes.push('products.json was not JSON — not a Shopify storefront');
        return null;
      }
      break;
    }

    for (const product of batch) {
      const productId = product['id'] === undefined ? null : String(product['id']);
      const handle = typeof product['handle'] === 'string' ? product['handle'] : null;
      const productUrl = handle ? `${origin}/products/${handle}` : origin;
      const variants = Array.isArray(product['variants']) ? product['variants'] : [];

      for (const raw of variants) {
        if (!raw || typeof raw !== 'object') continue;
        const v = raw as Record<string, unknown>;
        const price = money(v['price']);
        if (price === null) continue;

        const live: LivePrice = {
          price,
          compareAt: money(v['compare_at_price']),
          available: typeof v['available'] === 'boolean' ? v['available'] : null,
          liveUrl: productUrl,
        };

        const variantId = v['id'] === undefined ? null : String(v['id']);
        const vSku = typeof v['sku'] === 'string' ? v['sku'] : null;
        const vTitle = typeof v['title'] === 'string' ? v['title'] : null;

        add(variantId, live);
        add(vSku, live);
        if (productId && variantId) {
          // The Awin feed's spelling, and the currency-prefixed variants of it.
          add(`${productId}_${variantId}`, live);
          add(`shopify_GB_${productId}_${variantId}`, live);
        }
        // shopifyJson.ts's fallback when the shop leaves variant sku blank.
        if (productId) add(`${productId}-${vTitle ?? 'default'}`, live);
        if (handle) add(`${handle}-${vTitle ?? 'default'}`, live);
      }
      products++;
    }

    if (batch.length < 250) break;
    await sleep(gap);
  }

  if (index.size === 0) {
    notes.push('products.json answered but carried no priced variants');
    return null;
  }
  notes.push(`products.json: ${products} products, ${index.size} lookup keys`);
  return index;
}

/**
 * Key one stored listing against the live Shopify table.
 *
 * Tried in order of how specific the key is. The trailing-numbers fallback
 * exists for the Awin feed's `shopify_GB_<productId>_<variantId>` spelling
 * even when the prefix differs by market.
 */
function lookupShopify(listing: StoredListing, index: Map<string, LivePrice>): LivePrice | null {
  const sku = listing.retailerSku;
  const direct = index.get(sku);
  if (direct) return direct;

  const parts = sku.split('_');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const pair = `${parts[parts.length - 2]!}_${last}`;
    const byPair = index.get(pair);
    if (byPair) return byPair;
    const byVariant = index.get(last);
    if (byVariant) return byVariant;
  }

  // A stored URL that is the shop's own product page pins the handle even when
  // no id lines up. Only usable when the shop has exactly one priced variant
  // under that handle, which is why it is keyed on the handle-default alias.
  try {
    const path = new URL(listing.url, 'https://x.invalid').pathname;
    const m = /\/products\/([^/?#]+)/.exec(path);
    if (m) {
      const byHandle = index.get(`${m[1]!}-Default Title`);
      if (byHandle) return byHandle;
    }
  } catch {
    // A malformed stored URL is a separate defect; it is not this lookup's job.
  }

  return null;
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
  live: LivePrice,
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
    liveUrl: live.liveUrl,
  });
}

async function verifyShop(retailer: Retailer): Promise<ShopOutcome> {
  const deadlineAt = Date.now() + perShopBudgetMs;
  const store = new CatalogueStore(resolve(root, 'data/catalogue'));
  const snapshot = store.read(retailer.id);
  const active = snapshot.listings.filter(
    (l) => l.status === 'active' && typeof l.priceGbp === 'number' && l.priceGbp > 0,
  );

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
  };

  if (active.length === 0) {
    outcome.notes.push('no active priced listings — nothing on the site to verify');
    return outcome;
  }

  const origin = retailer.homepage.replace(/\/+$/, '');
  const robots = await robotsFor(origin);
  if (robots.unavailable) {
    outcome.notes.push(
      'robots.txt could not be read — holding off rather than assuming we are welcome',
    );
    return outcome;
  }
  const gap = gapFor(retailer, robots);
  outcome.notes.push(`gap ${gap}ms (registry ${retailer.catalogue?.minRequestGapMs ?? 0}, robots ${robots.crawlDelaySeconds ?? 0}s)`);

  const drifts: number[] = [];

  // ── Route 1: the shop's whole live catalogue ──────────────────────────────
  const index = await shopifyIndex(origin, robots, gap, deadlineAt, outcome.notes);
  if (index) {
    outcome.route = 'products.json';
    for (const listing of active) {
      outcome.attempted++;
      const live = lookupShopify(listing, index);
      if (!live) {
        outcome.unkeyed++;
        continue;
      }
      record(outcome, listing, live, drifts);
    }
    outcome.fullPopulation = outcome.attempted === active.length;
    outcome.medianAbsDriftGbp = Number(median(drifts).toFixed(2));
    outcome.worst.sort((a, b) => b.overstatementGbp - a.overstatementGbp);
    outcome.worst = outcome.worst.slice(0, 8);
    return outcome;
  }

  // ── Route 2: re-read a sample of product pages ────────────────────────────
  //
  // Only listings whose stored URL is the retailer's own. A feed retailer's
  // URLs are Awin tracking links; fetching one reports a customer click that
  // never happened, so those listings are counted unverifiable instead.
  const ownDomain = (url: string): boolean => {
    try {
      const host = new URL(url, origin).hostname.replace(/^www\./, '');
      return host === retailer.domain.replace(/^www\./, '') || host.endsWith(`.${retailer.domain}`);
    } catch {
      return false;
    }
  };

  const fetchable = active.filter((l) => ownDomain(l.url));
  if (fetchable.length === 0) {
    outcome.notes.push(
      'no listing carries a URL on this retailer\'s own domain — the only stored URL is an ' +
        'affiliate tracking link, which this pass will not fetch. Unverifiable by this route.',
    );
    return outcome;
  }
  if (fetchable.length < active.length) {
    outcome.notes.push(`${active.length - fetchable.length} listings skipped: affiliate-link-only URL`);
  }

  outcome.route = 'product-page';
  const picked = sample(fetchable, sampleSize, rng(seed));

  for (const listing of picked) {
    if (Date.now() >= deadlineAt) {
      outcome.notes.push('stopped early: out of time budget');
      break;
    }
    const url = new URL(listing.url, origin).toString();
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
      { price: hit.priceGbp, compareAt: hit.wasPriceGbp, available: hit.inStock, liveUrl: url },
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

import type { Retailer } from '../types/retailer.js';
import type { RawListing, StoredListing } from './types.js';
import type { Http } from './attempt.js';
import { isAllowed, type RobotsRules } from './robots.js';
import { isShopifyProductsPayload } from './shopifyJson.js';

/**
 * Re-price listings we already hold from the shop's own catalogue endpoint,
 * instead of fetching every product page again.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * A shop on the sitemap route is priced one product page per request, spaced
 * by its politeness gap: measured on the 2026-10-02 runs at 4.3 to 5.6
 * seconds a page from a GitHub runner. Beautybase holds 3,223 listings, so
 * one full re-read that way is about four and a half hours of requests, every
 * day, for one shop. It was never done: each run re-read 28.
 *
 * Several of those shops run on a platform that publishes its whole public
 * catalogue as paged JSON. Asked once each on 2026-10-03:
 *
 *   Shopify /products.json        allbeauty, Beautybase, Justmylook, Glorious
 *                                 Beauty, BellaVita, Oud Arabian, Manchester
 *                                 Ouds
 *   WooCommerce Store API         Perfumeo, ScentStore
 *
 * Beautybase's whole catalogue is 15 such pages, Justmylook's about 70,
 * Perfumeo's 21. Reading those instead of thousands of product pages is
 * lighter on the shop, not heavier.
 *
 * ── What this does and does not do ──────────────────────────────────────────
 * It only re-prices listings already stored, always on the same product page:
 * by the shop's own SKU among that page's items, or by the page alone where
 * it names exactly one priced item and we hold exactly one listing for it.
 * Measured 2026-10-03 from this sandbox: Justmylook 1,981 of 2,020 matched,
 * Perfumeo 1,647 of 1,729, Beautybase 3,048 of 3,223; of the matched
 * listings priced from their page in the previous 48 hours, 0 of 210, 0 of
 * 211 and 5 of 206 disagreed, and the Beautybase product page read just
 * after carried the feed's figure (Gucci Guilty Pour Homme 90ml, £59.00,
 * stored as £97 two days earlier).
 * Discovery of new products stays on the product-page route, which is where
 * the EAN, the rating and the rest of the JSON-LD come from (a Shopify
 * /products.json carries no barcode). A listing that cannot be matched here is
 * left for the product-page refresh, so nothing is dropped by this step.
 *
 * Only the price and stock change. A was-price or promotion end read off the
 * product page is kept only while the price is the one it was read beside:
 * once the price moves, neither can be vouched for, and they are cleared
 * rather than carried next to a price they never described.
 *
 * ── The consistency guard ───────────────────────────────────────────────────
 * Before any of it is used, the feed is checked against every price we
 * recorded for the same listings in the last 48 hours (from the product page
 * on the first run, and after that from this feed or a page). If more than a
 * quarter of those disagree, the feed is quoting something else (another
 * market, prices before VAT, a stale cache) or the whole shop has repriced at
 * once, and either way the read is set aside for the run. The product-page
 * refresh then covers the shop exactly as it would have without this step.
 */

/** One priced item as a catalogue endpoint publishes it. */
export interface RefreshItem {
  sku: string | null;
  url: string;
  priceGbp: number;
  inStock: boolean | null;
}

export type RefreshPlatform = 'shopify' | 'woocommerce';

export interface CatalogueRefreshResult {
  /** Stored listings re-priced from the feed, ready for reconcile(). */
  listings: RawListing[];
  /** The retailerSku of every stored listing those cover. */
  refreshedSkus: Set<string>;
  /** Set when the guard refused the feed; the reason, for the log. */
  rejected: string | null;
  /** How many feed items were compared against a recent page price, and how many disagreed. */
  checked: number;
  disagreed: number;
}

/** Share of recently page-priced listings that may disagree before the feed is refused. */
export const MAX_DISAGREEMENT = 0.25;
/** Fewer recent comparisons than this and the guard has nothing to judge by, so it does not refuse. */
export const MIN_COMPARISONS = 10;
/** How recent a page price must be to judge the feed against. */
const RECENT_MS = 48 * 60 * 60 * 1000;

/**
 * A product URL reduced to what identifies the page: host without `www.`,
 * path without a trailing slash, no query or fragment, lower case.
 */
export function normaliseProductUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Match feed items to stored listings and build the re-priced rows.
 *
 * `now` is when the feed was read; it decides which stored prices are recent
 * enough to judge the feed by.
 */
export function refreshFromItems(
  known: readonly StoredListing[],
  items: readonly RefreshItem[],
  now: Date,
): CatalogueRefreshResult {
  // Always matched within the same product page. A SKU alone is not an
  // identity: BellaVita lists one SKU under six product pages at three
  // prices (rose-woman-perfume-3-4-fl-oz, -byob, -bogo, -deal, -copy, -b2g2;
  // £19.99 to £24.99, read 2026-10-03), so a SKU match across pages would
  // put one page's price on another's listing.
  const byUrl = new Map<string, RefreshItem[]>();
  for (const item of items) {
    const key = normaliseProductUrl(item.url);
    const list = byUrl.get(key);
    if (list) list.push(item);
    else byUrl.set(key, [item]);
  }

  const active = known.filter((l) => l.status === 'active');
  const knownPerUrl = new Map<string, number>();
  for (const l of active) {
    const key = normaliseProductUrl(l.url);
    knownPerUrl.set(key, (knownPerUrl.get(key) ?? 0) + 1);
  }

  const matched: { prior: StoredListing; item: RefreshItem }[] = [];
  for (const prior of active) {
    const key = normaliseProductUrl(prior.url);
    const candidates = byUrl.get(key) ?? [];
    const bySku = candidates.filter((c) => c.sku !== null && c.sku === prior.retailerSku);
    let item: RefreshItem | undefined;
    // The same SKU twice on one page at two prices is not an answer.
    if (bySku.length > 0 && bySku.every((c) => c.priceGbp === bySku[0]!.priceGbp)) item = bySku[0];
    // Otherwise the page is only an identity when it names one priced item
    // and one stored listing. A page with a 50ml and a 100ml is neither.
    else if (bySku.length === 0 && candidates.length === 1 && knownPerUrl.get(key) === 1) item = candidates[0];
    if (item) matched.push({ prior, item });
  }

  let checked = 0;
  let disagreed = 0;
  for (const { prior, item } of matched) {
    if (prior.priceGbp === null) continue;
    const age = now.getTime() - Date.parse(prior.lastSeenAt);
    if (!(age >= 0 && age <= RECENT_MS)) continue;
    checked++;
    if (Math.abs(prior.priceGbp - item.priceGbp) > 0.005) disagreed++;
  }
  if (checked >= MIN_COMPARISONS && disagreed / checked > MAX_DISAGREEMENT) {
    return {
      listings: [],
      refreshedSkus: new Set(),
      rejected:
        `feed set aside: ${disagreed} of ${checked} listings priced from their product page in the ` +
        `last 48h disagree with it (over ${Math.round(MAX_DISAGREEMENT * 100)}%)`,
      checked,
      disagreed,
    };
  }

  const listings: RawListing[] = [];
  const refreshedSkus = new Set<string>();
  for (const { prior, item } of matched) {
    const {
      retailerId: _r, firstSeenAt: _f, lastSeenAt: _l, status: _s, delistedAt: _d,
      relistedAt: _rl, eligibleForNewBadge: _e, variantId: _v, ...raw
    } = prior;
    const samePrice = prior.priceGbp !== null && Math.abs(prior.priceGbp - item.priceGbp) <= 0.005;
    listings.push({
      ...raw,
      priceGbp: item.priceGbp,
      inStock: item.inStock,
      wasPriceGbp: samePrice ? raw.wasPriceGbp : null,
      promoEndsAt: samePrice ? raw.promoEndsAt : null,
    });
    refreshedSkus.add(prior.retailerSku);
  }
  return { listings, refreshedSkus, rejected: null, checked, disagreed };
}

/** Feed items from listings a Shopify `/products.json` walk produced. */
export function itemsFromShopifyListings(listings: readonly RawListing[]): RefreshItem[] {
  return listings
    .filter((l) => l.priceGbp !== null)
    .map((l) => ({ sku: l.retailerSku, url: l.url, priceGbp: l.priceGbp!, inStock: l.inStock }));
}

/** The storefront origin a catalogue endpoint lives under. */
export function storefrontOrigin(retailer: Retailer): string {
  return `https://${retailer.domain}`;
}

/**
 * One cheap request: does this storefront answer `/products.json` like Shopify?
 * Disallowed by robots.txt reads as "no", and nothing is asked. A refusal
 * (403, 429, 503) is reported as such, so the caller asks this shop nothing
 * more of the kind this run.
 */
export async function looksLikeShopify(
  retailer: Retailer,
  http: Http,
  robots: RobotsRules,
  headers: Record<string, string>,
): Promise<'shopify' | 'no' | 'refused'> {
  const url = `${storefrontOrigin(retailer)}/products.json?limit=1`;
  if (!isAllowed(robots, url)) return 'no';
  const res = await http(url, headers);
  if (res.status === 403 || res.status === 429 || res.status === 503) return 'refused';
  return res.ok && isShopifyProductsPayload(res.body) ? 'shopify' : 'no';
}

/** Items per WooCommerce Store API page: the API's own maximum. */
export const WOO_PAGE_SIZE = 100;
/** A ceiling on pages, so a store that never shortens its last page cannot walk forever. */
export const WOO_MAX_PAGES = 200;

export interface WooCrawlOptions {
  retailer: Retailer;
  http: Http;
  robots: RobotsRules;
  headers: Record<string, string>;
  gapMs: number;
  sleep?: (ms: number) => Promise<void>;
  deadlineAt?: number;
  onProgress?: (fetched: number, found: number) => void;
}

export interface WooCrawlResult {
  isWoo: boolean;
  items: RefreshItem[];
  pagesFetched: number;
  errors: string[];
}

type Json = Record<string, unknown>;

/**
 * Turn one Store API page into items. Simple products only: a variable
 * product's `prices.price` is the cheapest of its variations, which is not
 * the price of any one stored listing, so those are left to the product page.
 * Anything not quoted in GBP is skipped, never converted.
 */
export function parseWooStoreProducts(body: string): RefreshItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const items: RefreshItem[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Json;
    if (p['type'] !== 'simple') continue;
    const permalink = typeof p['permalink'] === 'string' ? p['permalink'] : null;
    const prices = p['prices'] && typeof p['prices'] === 'object' ? (p['prices'] as Json) : null;
    if (!permalink || !prices) continue;
    if (prices['currency_code'] !== 'GBP') continue;
    const minor = typeof prices['currency_minor_unit'] === 'number' ? prices['currency_minor_unit'] : null;
    const rawPrice = typeof prices['price'] === 'string' ? prices['price'] : null;
    if (minor === null || !rawPrice || !/^\d+$/.test(rawPrice)) continue;
    const priceGbp = Number.parseInt(rawPrice, 10) / 10 ** minor;
    if (!(priceGbp > 0)) continue;
    const sku = typeof p['sku'] === 'string' && p['sku'].trim() ? p['sku'].trim() : null;
    const inStock = typeof p['is_in_stock'] === 'boolean' ? p['is_in_stock'] : null;
    items.push({ sku, url: permalink, priceGbp: Math.round(priceGbp * 100) / 100, inStock });
  }
  return items;
}

/**
 * Walk a WooCommerce store's public Store API product list. Read only: the
 * products route and nothing else under it (never the cart or checkout
 * routes that share its namespace). A store that does not answer it, or
 * answers with something that is not a product list, is reported as not
 * WooCommerce with no error line, since that is a fact about the shop.
 */
export async function crawlWooStoreProducts(options: WooCrawlOptions): Promise<WooCrawlResult> {
  const { retailer, http, robots, headers, gapMs } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const items: RefreshItem[] = [];
  const errors: string[] = [];
  let pagesFetched = 0;
  let isWoo = false;

  for (let page = 1; page <= WOO_MAX_PAGES; page++) {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      errors.push(`[store-api] stopped early: exceeded this shop's time budget after ${pagesFetched} page(s)`);
      break;
    }
    const url = `${storefrontOrigin(retailer)}/wp-json/wc/store/v1/products?per_page=${WOO_PAGE_SIZE}&page=${page}`;
    if (!isAllowed(robots, url)) {
      if (page > 1) errors.push(`[store-api] robots.txt disallows ${url}`);
      break;
    }
    if (page > 1 && gapMs > 0) await sleep(gapMs);
    const res = await http(url, headers);
    pagesFetched++;
    if (!res.ok) {
      if (page > 1) errors.push(`[store-api] ${url}: HTTP ${res.status}`);
      break;
    }
    let onPage: unknown[];
    try {
      const parsed: unknown = JSON.parse(res.body);
      if (!Array.isArray(parsed)) break;
      onPage = parsed;
    } catch {
      break;
    }
    // Page one being a product list is the evidence: an array whose entries
    // carry Store API prices (or an empty store, which is still one).
    if (page === 1) {
      const first = onPage[0] as Json | undefined;
      const looksLikeProducts = onPage.length === 0 || (first !== undefined && typeof first === 'object' && first !== null && 'prices' in first && 'permalink' in first);
      if (!looksLikeProducts) break;
      isWoo = true;
    }
    items.push(...(parseWooStoreProducts(res.body) ?? []));
    options.onProgress?.(pagesFetched, items.length);
    // The array length, not the parsed count, says whether more pages exist:
    // variable products are skipped by the parser but still fill the page.
    if (onPage.length < WOO_PAGE_SIZE) break;
  }

  return { isWoo, items, pagesFetched, errors };
}

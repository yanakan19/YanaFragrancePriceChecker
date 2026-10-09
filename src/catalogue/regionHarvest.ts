/**
 * One region shop read once, for the US and India dry runs
 * (docs/INTERNATIONAL-PLAN.md, Phase 1, step one: "a US test run with no
 * publishing").
 *
 * This reuses the UK adapters rather than copying them: Shopify's
 * `/products.json` walk (shopifyProductsCrawl.ts, parsed by shopifyJson.ts),
 * the pinned sitemap route with each product page's schema.org JSON-LD
 * (sitemapCrawl.ts, jsonld.ts), robots.txt as the UK reads it
 * (robotsSource.ts) and the honest PriceSniffsBot identity (httpFetch.ts,
 * botIdentity.ts). What is new is only the currency rule and the snapshot.
 *
 * ── Currency: the region's own, stated by the shop, never converted ─────────
 * The UK adapters keep a price as pounds only when the shop says pounds, and
 * otherwise carry the figure as `nativePrice` with the currency the shop
 * named. The region layer keeps that figure as the price only when the named
 * currency is the region's (USD for the US, INR for India), exactly as the UK
 * guard does for GBP:
 *   - a Shopify shop must publish the region's currency at no conversion
 *     (`Shopify.currency` active and `/meta.json` settlement agree, rate 1),
 *     or nothing it lists is priced (`regionStorefrontCurrency`);
 *   - a JSON-LD page must name the currency on its offer or in its price meta
 *     (the walk runs with `requireGbp`, which turns silence into "unknown"), and
 *     a page that names any other currency, pounds included, is not priced.
 * A shop that answers in another currency is refused the same way a UK shop
 * answering in dollars is: recorded, never converted.
 *
 * ── What is stored ───────────────────────────────────────────────────────────
 * Only listings the catalogue would keep (`isCatalogueListing`, the UK's one
 * gate: a sized fragrance with a price, or a fragrance gift set), so a beauty
 * chain's skincare never reaches the repository. No photo address is stored
 * (photos for new countries wait on the owner's D24 decision) and no affiliate
 * link exists. Prices are `price` and `wasPrice` with the currency on the
 * file, as the plan says for region snapshots; UK snapshots keep `priceGbp`.
 */
import type { Retailer } from '../types/retailer.js';
import type { RegionCurrency, RegionRetailer } from '../types/regionRetailer.js';
import type { RawListing, StoredListing } from './types.js';
import type { Http } from './attempt.js';
import { BOT_HEADERS } from './botIdentity.js';
import { probeRobots } from './robotsSource.js';
import { isAllowed, type RobotsRules } from './robots.js';
import { fetchStorefrontCurrency, type StorefrontCurrency } from './shopCurrency.js';
import { crawlViaShopifyProducts } from './shopifyProductsCrawl.js';
import { crawlViaSitemap } from './sitemapCrawl.js';
import { cleanBarcode } from './barcode.js';
import { parsePrice } from './jsonld.js';
import { isCatalogueListing } from './fragranceId.js';

/** A conversion this close to 1 is the theme's own rounding (shopCurrency.ts uses the same). */
const RATE_EPSILON = 0.005;

/** One listing in a region snapshot. */
export interface RegionListing {
  retailerSku: string;
  url: string;
  rawTitle: string;
  rawBrand: string | null;
  /** A barcode that passes the UK's barcode checks (barcode.ts), or null. */
  ean: string | null;
  /** In the snapshot's currency, as the shop stated it. */
  price: number;
  /** The shop's own higher reference price on the same listing, where it shows one. */
  wasPrice: number | null;
  inStock: boolean | null;
  availability?: 'preOrder' | null;
  productType?: string | null;
  sectionId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'active' | 'delisted';
}

export interface RegionSnapshot {
  retailerId: string;
  region: RegionRetailer['region'];
  currency: RegionCurrency;
  updatedAt: string;
  /** True when this read reached the end of the shop's catalogue, so an absence means delisted. */
  complete: boolean;
  listings: RegionListing[];
}

export type RegionShopStatus =
  /** Read, and at least one listing carried a price in the region's currency. */
  | 'priced'
  /** Answered, but no listing was priced in the region's currency. */
  | 'no-prices'
  /** robots.txt was not served, or a refusal: nothing else was asked. */
  | 'refused'
  /** `enabled: false` in the registry. */
  | 'off';

export interface RegionShopReport {
  id: string;
  name: string;
  route: NonNullable<RegionRetailer['route']>['kind'] | null;
  singleBrand: boolean;
  status: RegionShopStatus;
  /** Listings the adapter returned, priced or not. */
  listingsRead: number;
  /** Listings with a price in the region's currency. */
  priced: number;
  /** Priced listings the catalogue keeps (sized fragrances and fragrance gift sets). */
  kept: number;
  /** Kept listings carrying a barcode that passes the checks. */
  withBarcode: number;
  pagesFetched: number;
  seconds: number;
  /** The currency the shop stated, and why it was or was not accepted. */
  currency: string;
  errors: string[];
  note?: string;
  /**
   * What the network said when it said no: the first few requests that did
   * not come back 200, with the status and the transport's own error text
   * (a status of 0 is a request that never got an answer: a reset, a refused
   * connection, a timeout), and for a sitemap walk how many product
   * addresses it found. A shop that reads nothing from the runner but reads
   * fine elsewhere is diagnosed from this, never by asking again differently.
   */
  diagnostics?: string[];
}

/**
 * Wraps the bot's fetch to remember, for the report, the first few requests
 * that failed, and a sitemap that came back 200 with no address in it (what
 * was served instead: its size and first characters).
 */
export function recordingHttp(http: Http, sink: string[], max = 6): Http {
  return async (url, headers) => {
    const res = await http(url, headers);
    if (sink.length >= max) return res;
    if (!res.ok) sink.push(`${url}: HTTP ${res.status}${res.error ? ` (${res.error.slice(0, 160)})` : ''}`);
    else if (/\.xml(?:$|\?)/i.test(url) && !/<loc[\s>]/i.test(res.body)) {
      sink.push(`${url}: HTTP 200 but no <loc> in ${res.body.length} bytes, starting ${JSON.stringify(res.body.slice(0, 100).replace(/\s+/g, ' '))}`);
    }
    return res;
  };
}

/**
 * Whether a Shopify storefront publishes the region's currency as its own
 * price list: the same three tests readStorefrontCurrency applies to GBP.
 */
export function regionStorefrontCurrency(c: StorefrontCurrency, expected: RegionCurrency): { ok: boolean; reason: string } {
  if (c.presented === null) return { ok: false, reason: 'the storefront published no currency, which is unknown, not ' + expected };
  if (c.presented !== expected) return { ok: false, reason: `the storefront quotes ${c.presented}, not ${expected}` };
  if (c.settlement !== null && c.settlement !== expected) {
    return { ok: false, reason: `the storefront settles in ${c.settlement} but quotes ${expected}, so its prices are converted` };
  }
  if (c.rate !== null && Math.abs(c.rate - 1) > RATE_EPSILON) {
    return { ok: false, reason: `the storefront applies a conversion rate of ${c.rate}, so its prices are converted` };
  }
  return { ok: true, reason: `the storefront publishes ${expected}${c.rate !== null ? ` at rate ${c.rate}` : ''}${c.settlement ? `, settles in ${c.settlement}` : ''}` };
}

/**
 * The listing's price in the region's currency, or null. A figure the shop
 * labelled pounds (`priceGbp`) is never a US or Indian price, and an unnamed
 * or different currency is never one either.
 */
export function regionPriceOf(l: RawListing, expected: RegionCurrency): number | null {
  if (l.priceGbp !== null) return null;
  const n = l.nativePrice;
  if (!n || n.currency !== expected) return null;
  return Number.isFinite(n.amount) && n.amount > 0 ? Math.round(n.amount * 100) / 100 : null;
}

/**
 * The shape the UK's catalogue gate reads. `priceGbp` holds the region price
 * here only because `isCatalogueListing` asks one thing of it, that it is a
 * positive number; nothing is stored or shown from this object.
 */
export function asGateListing(l: Pick<RegionListing, 'retailerSku' | 'url' | 'rawTitle' | 'rawBrand' | 'ean' | 'price' | 'inStock' | 'productType' | 'sectionId'>, retailerId: string): StoredListing {
  return {
    retailerSku: l.retailerSku,
    url: l.url,
    rawTitle: l.rawTitle,
    rawBrand: l.rawBrand,
    ean: l.ean,
    imageUrl: null,
    priceGbp: l.price,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: l.inStock,
    sectionId: l.sectionId,
    productType: l.productType ?? null,
    retailerId,
    firstSeenAt: '',
    lastSeenAt: '',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  };
}

/** What the adapters return, priced in the region's currency and cut to what the catalogue keeps. */
export function toRegionListings(
  raw: readonly RawListing[],
  shop: RegionRetailer,
  now: string,
): { listings: RegionListing[]; priced: number } {
  const excluded = new Set((shop.excludeProductTypes ?? []).map((t) => t.toLowerCase()));
  const mustMatch = shop.titleMustMatch ? new RegExp(shop.titleMustMatch, 'i') : null;
  const seen = new Set<string>();
  const listings: RegionListing[] = [];
  let priced = 0;
  for (const l of raw) {
    if (l.productType && excluded.has(l.productType.trim().toLowerCase())) continue;
    if (mustMatch && !mustMatch.test(l.rawTitle)) continue;
    const price = regionPriceOf(l, shop.currency);
    if (price === null) continue;
    priced++;
    if (seen.has(l.retailerSku)) continue;
    // A single house's own shop sells only that house; its vendor field is
    // sometimes a category ("Frag", "BnB") rather than the house.
    const notHouse = new Set((shop.vendorNotHouse ?? []).map((v) => v.toLowerCase()));
    const rawBrand = shop.singleBrandOnly ?? (shop.vendorIsShop || (l.rawBrand && notHouse.has(l.rawBrand.trim().toLowerCase())) ? null : l.rawBrand);
    const ean = cleanBarcode(l.ean) ?? (shop.skuIsBarcode ? cleanBarcode(l.retailerSku) : null) ?? barcodeInSku(l.retailerSku, shop);
    const candidate: RegionListing = {
      retailerSku: l.retailerSku,
      url: l.url,
      rawTitle: l.rawTitle,
      rawBrand,
      ean,
      price,
      // Neither adapter carries a non sterling reference price yet (shopifyJson.ts
      // keeps compare_at_price for GBP only), so none is claimed.
      wasPrice: null,
      inStock: l.inStock,
      ...(l.availability ? { availability: l.availability } : {}),
      productType: l.productType ?? null,
      sectionId: l.sectionId,
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'active',
    };
    if (!isCatalogueListing(asGateListing(candidate, shop.id))) continue;
    seen.add(l.retailerSku);
    listings.push(candidate);
  }
  return { listings, priced };
}

/**
 * The size of each variant a page's schema.org ProductGroup names, by sku
 * (`hasVariant[].sku` and `.size`, Ulta). Read from the page's own JSON-LD;
 * a block that does not parse is skipped.
 */
export function productGroupSizes(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1]!); } catch { continue; }
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (Array.isArray(o['hasVariant'])) {
        for (const v of o['hasVariant'] as Record<string, unknown>[]) {
          const sku = typeof v?.['sku'] === 'string' ? v['sku'] : null;
          const size = typeof v?.['size'] === 'string' ? v['size'].trim() : null;
          if (sku && size) out.set(sku, size);
        }
      }
      if (o['@graph']) visit(o['@graph']);
    };
    visit(data);
  }
  return out;
}

/** A title with the size the page gives its sku added, where the title states none. */
export function withVariantSize(title: string, size: string | undefined): string {
  if (!size) return title;
  if (/\d\s*(?:ml|oz|fl\.?\s?oz)\b/i.test(title)) return title;
  return `${title} ${size}`;
}

/** The barcode inside the shop's own id (`skuBarcodeFrom`), when it passes the checks. */
export function barcodeInSku(sku: string, shop: Pick<RegionRetailer, 'skuBarcodeFrom'>): string | null {
  if (!shop.skuBarcodeFrom) return null;
  const m = new RegExp(shop.skuBarcodeFrom).exec(sku);
  return m?.[1] ? cleanBarcode(m[1]) : null;
}

/**
 * The shop's own ids whose page stated a price of exactly 0 in the region's
 * currency, for a shop that marks a sold out product that way
 * (`zeroPriceMeansSoldOut`, Purplle). Empty for every other shop.
 */
export function zeroPricedSkus(raw: readonly RawListing[], shop: RegionRetailer): Set<string> {
  if (!shop.zeroPriceMeansSoldOut) return new Set();
  return new Set(
    raw.filter((l) => l.priceGbp === null && l.nativePrice?.currency === shop.currency && l.nativePrice.amount === 0).map((l) => l.retailerSku),
  );
}

/**
 * This read against the last snapshot. A listing keeps the day it was first
 * seen. One not seen this time is marked delisted only when this read reached
 * the end of the shop's catalogue; otherwise it is kept as it was, and ages.
 */
export function reconcileRegion(
  previous: readonly RegionListing[] | null,
  current: readonly RegionListing[],
  complete: boolean,
  /** Ids read this time as sold out (a stated price of 0): kept at their last price, out of stock, seen now. */
  soldOut: { skus: ReadonlySet<string>; at: string } | null = null,
): RegionListing[] {
  const before = new Map((previous ?? []).map((l) => [l.retailerSku, l]));
  const out: RegionListing[] = [];
  const seenNow = new Set<string>();
  for (const l of current) {
    seenNow.add(l.retailerSku);
    const old = before.get(l.retailerSku);
    out.push(old ? { ...l, firstSeenAt: old.firstSeenAt } : l);
  }
  for (const old of before.values()) {
    if (seenNow.has(old.retailerSku)) continue;
    if (soldOut?.skus.has(old.retailerSku)) {
      out.push({ ...old, inStock: false, lastSeenAt: soldOut.at, status: 'active' });
      continue;
    }
    out.push(complete ? { ...old, status: 'delisted' } : old);
  }
  return out.sort((a, b) => a.retailerSku.localeCompare(b.retailerSku));
}

const OG_CURRENCY: Record<string, string> = { inr: 'INR', rupee: 'INR', rupees: 'INR', rs: 'INR', '₹': 'INR', usd: 'USD', '$': 'USD', gbp: 'GBP', '£': 'GBP' };

function metaContent(html: string, property: string): string | null {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
  if (a) return a[1]!;
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`, 'i').exec(html);
  return b ? b[1]! : null;
}

const decodeEntities = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

/**
 * One product page that states its price only in Open Graph product tags
 * (`og:price:amount` "₹5,000.00", `product:price:currency` "Rupee") and its
 * name in its one <h1> (AAR Fragrances). The currency word is mapped to its
 * code ("Rupee" is INR); a page that names no currency, or one this reader
 * does not know, is unpriced. Stock is not stated in the served page (it is
 * filled in by the shop's script), so it is unknown, never guessed.
 */
export function readOgProductPage(html: string, url: string, sectionId: string): RawListing | null {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const title = decodeEntities((h1 ?? metaContent(html, 'og:title') ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  if (!title) return null;
  const amountText = metaContent(html, 'og:price:amount') ?? metaContent(html, 'product:price:amount');
  const currencyText = (metaContent(html, 'product:price:currency') ?? metaContent(html, 'og:price:currency') ?? '').trim();
  const code = OG_CURRENCY[currencyText.toLowerCase()] ?? (/^[A-Z]{3}$/.test(currencyText) ? currencyText : null);
  const amount = amountText ? parsePrice(decodeEntities(amountText)) : null;
  let slug = url;
  try { slug = new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || url; } catch { /* keep the address */ }
  return {
    retailerSku: slug,
    url,
    rawTitle: title,
    rawBrand: null,
    ean: null,
    imageUrl: null,
    priceGbp: null,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: null,
    sectionId,
    ...(amount !== null && code ? { nativePrice: { amount, currency: code } } : {}),
  } as RawListing;
}

/**
 * The walk for an `og-price` shop: its sitemap, then product pages, never
 * seen ones first and then the oldest stored ones, each allowed by
 * robots.txt, at the shop's gap, within the page budget and the clock.
 */
async function crawlOgShop(
  shop: RegionRetailer,
  route: Extract<NonNullable<RegionRetailer['route']>, { kind: 'og-price' }>,
  o: { http: Http; robots: RobotsRules; headers: Record<string, string>; gapMs: number; sleep: (ms: number) => Promise<void>;
    deadlineAt: number; maxPages: number; previous: RegionSnapshot | null; now: string; refreshAfterHours: number },
): Promise<{ listings: RawListing[]; pagesFetched: number; complete: boolean; errors: string[]; discovered: number }> {
  const errors: string[] = [];
  if (!isAllowed(o.robots, route.sitemap)) return { listings: [], pagesFetched: 0, complete: false, errors: [`${route.sitemap}: not asked, robots.txt does not permit it`], discovered: 0 };
  const sm = await o.http(route.sitemap, o.headers);
  if (!sm.ok) return { listings: [], pagesFetched: 1, complete: false, errors: [`${route.sitemap}: HTTP ${sm.status}`], discovered: 0 };
  const product = new RegExp(route.product, 'i');
  const exclude = route.exclude ? new RegExp(route.exclude, 'i') : null;
  const urls = [...new Set([...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!)))]
    .filter((u) => product.test(u) && !(exclude && exclude.test(u)));
  const stored = new Map((o.previous?.listings ?? []).filter((l) => l.status === 'active').map((l) => [l.url, l.lastSeenAt]));
  const cutoff = Date.parse(o.now) - o.refreshAfterHours * 3_600_000;
  const fresh = urls.filter((u) => !stored.has(u));
  const due = urls.filter((u) => stored.has(u) && Date.parse(stored.get(u)!) < cutoff).sort((a, b) => stored.get(a)!.localeCompare(stored.get(b)!));
  const plan = [...fresh.slice(0, o.maxPages), ...due];
  const listings: RawListing[] = [];
  let fetched = 1;
  let failedInARow = 0;
  for (const u of plan) {
    if (Date.now() > o.deadlineAt) { errors.push('stopped early: exceeded this shop\'s time budget'); break; }
    if (!isAllowed(o.robots, u)) continue;
    await o.sleep(o.gapMs);
    const res = await o.http(u, o.headers);
    fetched++;
    if (!res.ok) {
      errors.push(`${u}: HTTP ${res.status}`);
      if (res.status === 403 || res.status === 429) { errors.push('stopped early: the shop began refusing requests'); break; }
      if (++failedInARow >= 5) { errors.push('stopped early: 5 pages in a row failed'); break; }
      continue;
    }
    failedInARow = 0;
    const l = readOgProductPage(res.body, u, `${shop.id}-og`);
    if (l) listings.push(l);
  }
  return { listings, pagesFetched: fetched, complete: plan.length === urls.length && errors.length === 0, errors, discovered: urls.length };
}

/**
 * The UK crawlers take a `Retailer`. This is the smallest one they can walk:
 * the domain, the pinned route, and blanks for everything they never read for
 * a walk (delivery, affiliate, currency: the walk is told the region's
 * currency directly, and the sitemap route runs with `requireGbp`, so the
 * registry's 'GBP' literal is never taken as the price's currency). It exists
 * only in memory for the length of one walk.
 */
export function crawlerRetailer(shop: RegionRetailer): Retailer {
  const route = shop.route?.kind === 'sitemap' ? { ...shop.route.sitemapRoute, requireGbp: true } : undefined;
  return {
    id: shop.id,
    name: shop.name,
    domain: shop.domain,
    homepage: shop.homepage,
    tiers: shop.tiers,
    enabled: shop.enabled,
    adapter: shop.route?.kind === 'sitemap' ? 'json-ld' : 'unknown',
    ...(shop.route?.kind === 'shopify' ? { shopifyStorefront: true } : {}),
    ...(shop.route?.kind === 'shopify' && shop.route.variantRule ? { shopifyVariantRule: shop.route.variantRule } : {}),
    ...(route ? { sitemapRoute: route } : {}),
    shipping: { standardGbp: null, freeOverGbp: null, estimatedDays: [0, 0], verifiedAt: shop.delivery.verifiedAt, confidence: 'unverified' },
    affiliate: { network: null, verified: false, status: 'not-researched', publisherId: null, deeplinkTemplate: null, querySuffixTemplate: null, signupUrl: null },
    catalogue: null,
    currency: 'GBP',
  };
}

export interface RegionHarvestOptions {
  shop: RegionRetailer;
  http: Http;
  /** ISO time of this run. */
  now: string;
  previous: RegionSnapshot | null;
  /** Product pages a sitemap walk may read that it has never read before. */
  maxPages: number;
  /** Wall clock for this shop. */
  shopMs: number;
  /** A stored listing older than this is re-read first (sitemap walk). */
  refreshAfterHours: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface RegionHarvestResult {
  report: RegionShopReport;
  /** Null when nothing new was learned (refused, off, or no prices): the last snapshot stands. */
  snapshot: RegionSnapshot | null;
}

function emptyReport(shop: RegionRetailer, status: RegionShopStatus): RegionShopReport {
  return {
    id: shop.id,
    name: shop.name,
    route: shop.route?.kind ?? null,
    singleBrand: shop.singleBrandOnly !== undefined,
    status,
    listingsRead: 0,
    priced: 0,
    kept: 0,
    withBarcode: 0,
    pagesFetched: 0,
    seconds: 0,
    currency: '',
    errors: [],
  };
}

export async function harvestRegionShop(options: RegionHarvestOptions): Promise<RegionHarvestResult> {
  const { shop, now } = options;
  const failures: string[] = [];
  const http = recordingHttp(options.http, failures);
  const log = options.log ?? (() => {});
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const report = emptyReport(shop, 'off');
  if (!shop.enabled || !shop.route) {
    report.note = shop.blockedReason ?? 'off';
    return { report, snapshot: null };
  }
  const started = Date.now();
  const deadlineAt = started + options.shopMs;
  const headers = { ...BOT_HEADERS };

  // robots.txt first, as the bot, once. A file that is not served (a 5xx, a
  // network error, a challenge page) stops here: nothing else is asked.
  const robotsProbe = await probeRobots({ domain: shop.domain, homepage: shop.homepage }, http, headers);
  const robots: RobotsRules = robotsProbe.rules;
  const robotsWall = robotsProbe.attempts.some((a) => a.error && /captcha|challenge/i.test(a.error));
  if (robots.unavailable || robotsWall) {
    report.status = 'refused';
    report.errors = robotsProbe.attempts.map((a) => `robots.txt ${a.url}: ${a.status}${a.error ? ` ${a.error}` : ''}`);
    report.seconds = Math.round((Date.now() - started) / 1000);
    return { report, snapshot: null };
  }
  const gapMs = Math.max(shop.minRequestGapMs, (robots.crawlDelaySeconds ?? 0) * 1000);

  let raw: RawListing[] = [];
  let complete = false;
  if (shop.route.kind === 'shopify') {
    const origin = `https://${shop.domain}`;
    if (!isAllowed(robots, `${origin}/products.json`)) {
      report.status = 'refused';
      report.errors = ['robots.txt disallows /products.json'];
      return { report, snapshot: null };
    }
    await sleep(gapMs);
    const storefront = await fetchStorefrontCurrency(origin, http, headers);
    const verdict = regionStorefrontCurrency(storefront, shop.currency);
    report.currency = verdict.reason;
    report.pagesFetched += 2;
    if (!verdict.ok) {
      report.status = 'no-prices';
      report.seconds = Math.round((Date.now() - started) / 1000);
      log(`${shop.id}: ${verdict.reason}; nothing priced`);
      return { report, snapshot: null };
    }
    await sleep(gapMs);
    const walk = await crawlViaShopifyProducts({
      retailer: crawlerRetailer(shop),
      http,
      robots,
      headers,
      maxPages: 100,
      gapMs,
      sleep,
      // The region's currency, settled above; never the UK market search.
      currency: { ...storefront, isSterling: false, reason: verdict.reason },
      resolveUkMarket: false,
      deadlineAt,
      onProgress: (pages, found) => { if (pages % 5 === 0) log(`${shop.id}: ${pages} page(s), ${found} listing(s)`); },
    });
    raw = walk.listings;
    report.pagesFetched += walk.pagesFetched;
    const errors = walk.errors.filter((e) => !e.startsWith('currency: '));
    report.errors.push(...errors.slice(0, 5));
    // The walk calls itself incomplete for any non-sterling list; for a region
    // shop "complete" is: Shopify, no error, and the last page came back short.
    complete = walk.isShopify && errors.length === 0 && walk.pagesFetched < 100;
    if (!walk.isShopify) report.errors.push('/products.json did not answer as a Shopify catalogue');
  } else if (shop.route.kind === 'og-price') {
    const walk = await crawlOgShop(shop, shop.route, {
      http, robots, headers, gapMs, sleep, deadlineAt, maxPages: options.maxPages, previous: options.previous, now,
      refreshAfterHours: options.refreshAfterHours,
    });
    raw = walk.listings;
    report.pagesFetched += walk.pagesFetched;
    report.errors.push(...walk.errors.slice(0, 5));
    complete = walk.complete;
    const named = new Set(raw.map((l) => l.nativePrice?.currency ?? 'none'));
    report.currency = `og:price tags named: ${[...named].sort().join(', ') || 'nothing read'}`;
    failures.push(`sitemap: ${walk.discovered} product address(es)`);
  } else {
    const known = new Map<string, string>();
    for (const l of options.previous?.listings ?? []) if (l.status === 'active') known.set(l.url, l.lastSeenAt);
    // Ulta: the size of each sku, read off every page as it is fetched.
    const sizes = new Map<string, string>();
    const pageHttp: Http = shop.sizeFromProductGroup
      ? async (url, h) => {
        const res = await http(url, h);
        if (res.ok && !/\.xml(?:$|\?)/i.test(url)) for (const [k, v] of productGroupSizes(res.body)) sizes.set(k, v);
        return res;
      }
      : http;
    const cutoff = Date.parse(now) - options.refreshAfterHours * 3_600_000;
    const due = [...known.entries()].filter(([, at]) => Date.parse(at) < cutoff).sort((a, b) => a[1].localeCompare(b[1])).map(([u]) => u);
    const walk = await crawlViaSitemap({
      retailer: crawlerRetailer(shop),
      http: pageHttp,
      robots,
      maxPages: options.maxPages,
      gapMs,
      headers,
      sleep,
      maxDurationMs: Math.max(0, deadlineAt - Date.now()),
      knownUrls: known,
      refreshUrls: due,
      onProgress: (pages, found) => { if (pages % 25 === 0) log(`${shop.id}: ${pages} request(s), ${found} listing(s)`); },
    });
    raw = shop.sizeFromProductGroup ? walk.listings.map((l) => ({ ...l, rawTitle: withVariantSize(l.rawTitle, sizes.get(l.retailerSku)) })) : walk.listings;
    report.pagesFetched += walk.pagesFetched + (walk.categoryPagesFetched ?? 0);
    report.errors.push(...walk.errors.slice(0, 5));
    complete = walk.fetchedEveryDiscovered === true;
    failures.push(`sitemap: ${walk.urlsDiscovered} product address(es) found${walk.sampledUrls.length ? `, first read ${walk.sampledUrls[0]}` : ''}`);
    const named = new Set(raw.map((l) => l.nativePrice?.currency ?? (l.priceGbp !== null ? 'GBP' : 'none')));
    report.currency = `JSON-LD offers named: ${[...named].sort().join(', ') || 'nothing read'}`;
  }

  if (failures.length > 0) report.diagnostics = failures;
  report.listingsRead = raw.length;
  const { listings, priced } = toRegionListings(raw, shop, now);
  report.priced = priced;
  report.kept = listings.length;
  report.withBarcode = listings.filter((l) => l.ean !== null).length;
  const soldOut = zeroPricedSkus(raw, shop);
  if (soldOut.size > 0) report.note = `${soldOut.size} page(s) stated a price of 0: read as sold out, never as a price`;
  report.status = priced > 0 ? 'priced' : 'no-prices';
  report.seconds = Math.round((Date.now() - started) / 1000);
  if (priced === 0) return { report, snapshot: null };

  const merged = reconcileRegion(options.previous?.listings ?? null, listings, complete, soldOut.size > 0 ? { skus: soldOut, at: now } : null);
  return {
    report,
    snapshot: {
      retailerId: shop.id,
      region: shop.region,
      currency: shop.currency,
      updatedAt: now,
      complete,
      listings: merged,
    },
  };
}

/** A snapshot as text: one listing per line, so a day's change is a small diff. */
export function encodeRegionSnapshot(s: RegionSnapshot): string {
  const head = JSON.stringify({ ...s, listings: [] }, null, 2).replace(/\n {2}"listings": \[\]\n\}$/, '');
  const rows = s.listings.map((l) => `    ${JSON.stringify(l)}`).join(',\n');
  return `${head}\n  "listings": [\n${rows}\n  ]\n}\n`;
}

/**
 * The data a region's pages are built from (the US at /us/, India at /in/;
 * public beta since 9 October 2026, docs/INTERNATIONAL-PLAN.md "Public beta,
 * 9 October 2026: what shipped").
 *
 * The UK page reads its products from the generated modules the UK crawl
 * commits (demo/catalogue.generated.ts and the rest). A region's page reads
 * the same shapes, built here at deploy time from what the region crawl
 * commits under data/regions/<us|in>/: the shops' snapshots
 * (catalogue/<shop>.json), the price history (price-history.json) and the
 * region's own product address memory (product-slugs.json). Nothing here
 * reads or writes a UK file except the UK's product addresses, read only, so a
 * bottle sold in both countries keeps its UK address under /us/ or /in/.
 *
 * The rules are the UK's where the UK has one:
 *   - products: the region build's own matching (src/catalogue/regionCatalogue.ts,
 *     regionMatchName included, which the owner ran the beta on), a product
 *     with no house dropped (no brand page, no address);
 *   - a shop's previous price is shown only when the other shops corroborate
 *     it (src/catalogue/wasPriceCredibility.ts, the UK's withholding rule);
 *   - Today's Deals: the UK's candidate rule (src/services/dealCandidates.ts)
 *     on the price the product page prints, bottles only, buyable offers only,
 *     never a house's own shop, on the shop's own stated reference price kept
 *     by the crawl (compare at, list price, MRP) once the other shops corroborate
 *     it, and not against the shop's own recorded prices
 *     (src/catalogue/regionDeals.ts);
 *   - the NEW badge only for a listing that arrived after the shop's first
 *     crawl (src/catalogue/newBadge.ts);
 *   - photos (D24, answered by the owner on 9 Oct 2026 for the US and India): a
 *     shop with `imageBasis` shows its own picture, hot-linked from its page
 *     (the offer's `imageUrl`; never downloaded); a shop without it shows none.
 *     A product's picture is the matching UK product's first (`entry.image`
 *     and its per photo transform, src/catalogue/regionUkPhotos.ts, owner
 *     instruction of 9 Oct 2026), else the best of its shops' own pictures by
 *     the UK's `pickImage` rules; none at all and the page draws its
 *     placeholder. A gift set never takes a UK bottle's picture, only its own shops';
 *   - notes (owner instruction, 9 Oct 2026): the region shops' listings carry
 *     none, so a product that is the same bottle as a UK product (the same
 *     match as the picture, `matchUkNotes`) shows the UK product's notes, as
 *     the UK page shows them (alias folded) with the UK shop's name and link
 *     ("As published by <UK shop>", `source.retailerName`); no other product
 *     has any.
 *
 * Product addresses: a product the UK also sells takes its UK address; a
 * product new to the region is given one by the UK's own rules
 * (src/catalogue/productSlug.ts), avoiding every UK address. The region's
 * memory is append only, like data/product-slugs.json: the region crawl
 * (scripts/build-region-catalogue.ts) writes it, the page build only reads it
 * and gives a product it does not hold yet the same address the next crawl
 * will write.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RegionConfig } from '../src/config/regions.js';
import { REGION_CRAWL, REGION_RETAILERS } from '../src/config/regionRetailers.js';
import type { RegionCode, RegionRetailer } from '../src/types/regionRetailer.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import {
  buildRegionCatalogue, type RegionOffer, type RegionPriceHistory, type RegionProduct,
} from '../src/catalogue/regionCatalogue.js';
import { assignSlugs, assertSlugsAppendOnly, type SlugProduct } from '../src/catalogue/productSlug.js';
import { judgeWasPrice, type CredibilityOffer } from '../src/catalogue/wasPriceCredibility.js';
import { NEW_WINDOW_DAYS } from '../src/catalogue/newBadge.js';
import { isOilStrength } from '../src/catalogue/perfumeOil.js';
import { brandKey } from '../src/catalogue/brandName.js';
import { regionShopAsRetailer } from '../src/config/regionShops.js';
import { presentOffer } from '../src/services/priceService.js';
import { dealCandidateForOffer } from '../src/services/dealCandidates.js';
import { historyAllowsDeal, REGION_MIN_DEALS } from '../src/catalogue/regionDeals.js';
import { regionById } from '../src/config/regions.js';
import type { StockState } from '../src/types/offer.js';
import { shownPrice } from '../demo/msrpComparison.js';
import { slugify } from '../demo/router.js';
import { matchUkNotes, matchUkPhotos, type UkPhotoSource } from '../src/catalogue/regionUkPhotos.js';
import { pickImage } from '../src/catalogue/pickImage.js';

const DAY_MS = 86_400_000;

/** One shop's offer in the page's shape (demo/catalogue.generated.ts `CrawledOffer`). */
export interface RegionCrawledOffer {
  retailerId: string;
  price: number;
  wasPrice: number | null;
  promoEndsAt: null;
  stock: StockState;
  url: string;
  fetchedAt: string;
  firstSeenAt: string;
  isNew: boolean;
  /** The shop's own picture, a URL on the shop's side, for a shop with `imageBasis` (D24); else null. */
  imageUrl: string | null;
  rating: null;
  /** On a set sold by two shops or more: this shop's own title, where it differs from the set's. */
  title?: string;
}

/** One product in the page's shape (demo/catalogue.generated.ts `CatalogueEntry`). */
export interface RegionCatalogueEntry {
  id: string;
  slug: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
  ean: string | null;
  shops: number;
  /**
   * The matching UK product's picture (src/catalogue/regionUkPhotos.ts), else
   * the best of the region shops' own pictures (`pickImage`), else null.
   */
  image: string | null;
  /** The UK photo's own build time transform (docs/IMAGE-SCALE-PLAN.md), carried with it. */
  imageTransform?: string;
  /** The matching UK product's notes and where the UK page says they were published; null for a product with no UK match. */
  notes: RegionNotes | null;
  giftSet?: { contents: null; title: string };
}

/** Notes in the page's shape (`Notes` of demo/catalogue.generated.ts), the source named in full because the UK shop is not in the region's registry. */
export interface RegionNotes {
  top: string[];
  middle: string[];
  base: string[];
  source: { retailerId: string; url: string; retailerName?: string } | null;
}

/** One deal in the page's shape (demo/deals.generated.ts `RawDeal`). */
export interface RegionDeal {
  fragranceId: string;
  price: number;
  delivered: boolean;
  wasPrice: number;
  percentOff: number;
  retailerId: string;
  kind: 'retailer' | 'house';
  houseName: string | null;
}

export interface RegionHistoryPoint {
  at: string;
  priceGbp: number | null;
  retailerId: string | null;
}

export type RegionHistoryGap = { reason: 'not-enough'; priceGbp: number; retailerId: string; at: string };

/** Everything a region's page is built from. */
export interface RegionSite {
  region: RegionCode;
  catalogue: RegionCatalogueEntry[];
  crawled: Record<string, RegionCrawledOffer[]>;
  deals: RegionDeal[];
  dealsGeneratedAt: string;
  priceHistory: Record<string, RegionHistoryPoint[]>;
  priceHistoryGap: Record<string, RegionHistoryGap>;
  /** The region's whole address memory after this build: every slug ever given, current or not. */
  slugs: Record<string, string>;
  /** When the newest shop's prices were read: the freshness line and the sitemap's dates. */
  crawledAt: string;
  /** Shops with at least one offer on the page. */
  shopCount: number;
}

/** What the region crawl committed, read from data/regions/<folder>/. */
export interface RegionInputs {
  region: RegionCode;
  shops: readonly RegionRetailer[];
  snapshots: RegionSnapshot[];
  history: RegionPriceHistory | null;
  slugMemory: Record<string, string>;
  harvestRanAt: string | null;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The region's folder under data/regions/: us or in. */
export function regionFolder(region: RegionCode): string {
  return `data/regions/${REGION_CRAWL[region].folder}`;
}

/** The region's address memory, repository relative (append only, like data/product-slugs.json). */
export function regionSlugPath(region: RegionCode): string {
  return `${regionFolder(region)}/product-slugs.json`;
}

/** Reads what the region crawl committed. Missing files read as empty: a region with no data builds an empty page. */
export function readRegionInputs(root: string, region: RegionCode): RegionInputs {
  const folder = resolve(root, regionFolder(region));
  const shops = REGION_RETAILERS[region];
  const known = new Set(shops.map((s) => s.id));
  const currency = REGION_CRAWL[region].currency;
  const dir = resolve(folder, 'catalogue');
  const snapshots: RegionSnapshot[] = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
      .map((f) => readJson<RegionSnapshot>(resolve(dir, f)))
      .filter((s): s is RegionSnapshot => s !== null && known.has(s.retailerId) && s.currency === currency)
    : [];
  const harvest = readJson<{ ranAt?: string }>(resolve(folder, 'harvest-report.json'));
  return {
    region,
    shops,
    snapshots,
    history: readJson<RegionPriceHistory>(resolve(folder, 'price-history.json')),
    slugMemory: readJson<{ slugs?: Record<string, string> }>(resolve(root, regionSlugPath(region)))?.slugs ?? {},
    harvestRanAt: harvest?.ranAt ?? null,
  };
}

/** The region build's products, with each offer's listing carried for the page (the same call the crawl makes). */
export function regionProducts(inputs: RegionInputs, now: string, ukIds?: ReadonlySet<string>): RegionProduct[] {
  const shops = inputs.shops;
  return buildRegionCatalogue(inputs.snapshots, {
    now,
    shopNames: new Map(shops.map((s) => [s.id, s.name])),
    ...(ukIds ? { ukIds } : {}),
    groups: new Map(shops.filter((s) => s.catalogueGroup).map((s) => [s.id, s.catalogueGroup!])),
    formatWords: new Map(shops.filter((s) => s.titleMustMatch).map((s) => [s.id, s.titleMustMatch!])),
    notHouse: new Map(shops.filter((s) => s.vendorNotHouse?.length).map((s) => [s.id, new Set(s.vendorNotHouse!.map((v) => v.toLowerCase()))])),
    withListingDetail: true,
  }).products;
}

/** A product the page can show: it names its house (no house, no brand page and no address). */
export function isShowable(p: Pick<RegionProduct, 'brand'>): boolean {
  return p.brand.trim() !== '';
}

/** What the address rules read of a region product. */
export function regionSlugProduct(p: RegionProduct): SlugProduct {
  return { id: p.id, brand: p.brand, name: p.name, concentration: p.concentration ?? 'Not stated', sizeMl: p.kind === 'set' ? null : p.sizeMl, giftSet: p.kind === 'set' };
}

/**
 * Every product's address in the region, never changing one already given.
 *
 *   1. One the region's memory holds stays (append only).
 *   2. A product the UK also has takes its UK address, unless the region's
 *      memory already gave that address to another product.
 *   3. Any other is given one by the UK's rules, avoiding every UK address
 *      and every address in the region's memory.
 */
export function regionSlugs(
  products: readonly SlugProduct[],
  ukSlugs: Readonly<Record<string, string>>,
  memory: Readonly<Record<string, string>>,
): Record<string, string> {
  const previous: Record<string, string> = { ...memory };
  const taken = new Set(Object.values(memory));
  for (const p of [...products].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (Object.prototype.hasOwnProperty.call(previous, p.id)) continue;
    const uk = ukSlugs[p.id];
    if (uk && !taken.has(uk)) {
      previous[p.id] = uk;
      taken.add(uk);
    }
  }
  const reserved = new Set(Object.values(ukSlugs).filter((s) => !taken.has(s)));
  const { slugs } = assignSlugs(previous, products, reserved);
  assertSlugsAppendOnly(memory, slugs);
  return slugs;
}

function stockOf(o: RegionOffer): StockState {
  if (o.detail?.preOrder) return 'preOrder';
  return o.inStock === true ? 'inStock' : o.inStock === false ? 'outOfStock' : 'unknown';
}

/** Each shop's first crawl: the earliest first sighting among its listings. A listing seen then is its baseline, never "new". */
function shopBaselines(snapshots: readonly RegionSnapshot[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of snapshots) {
    let first = Number.POSITIVE_INFINITY;
    for (const l of s.listings) {
      const t = Date.parse(l.firstSeenAt);
      if (Number.isFinite(t) && t < first) first = t;
    }
    if (Number.isFinite(first)) out.set(s.retailerId, first);
  }
  return out;
}

/**
 * The cheapest offer on each day the region's history recorded a change, with
 * the shop that held it: the line the UK chart draws (scripts/build-price-history.ts),
 * from the region's own per shop history (data/regions/<r>/price-history.json).
 */
export function cheapestSeries(byShop: Readonly<Record<string, readonly (readonly [string, number])[]>>): RegionHistoryPoint[] {
  const days = [...new Set(Object.values(byShop).flatMap((series) => series.map(([d]) => d)))].sort();
  const out: RegionHistoryPoint[] = [];
  for (const day of days) {
    let best: { price: number; shop: string } | null = null;
    for (const shop of Object.keys(byShop).sort()) {
      let price: number | null = null;
      for (const [d, p] of byShop[shop]!) if (d <= day) price = p;
      if (price !== null && price > 0 && (!best || price < best.price)) best = { price, shop };
    }
    if (!best) continue;
    const last = out[out.length - 1];
    if (last && last.priceGbp === best.price && last.retailerId === best.shop) continue;
    out.push({ at: `${day}T00:00:00Z`, priceGbp: best.price, retailerId: best.shop });
  }
  return out;
}

/** The deal rules' stock allowlist (scripts/build-deals.ts BUYABLE). */
const BUYABLE: ReadonlySet<StockState> = new Set<StockState>(['inStock', 'lowStock']);

function notesOf(m: ReturnType<typeof matchUkNotes> extends Map<string, infer V> ? V | undefined : never, ukShopName: (retailerId: string) => string | undefined): RegionNotes | null {
  if (!m) return null;
  const name = m.source ? ukShopName(m.source.retailerId) : undefined;
  return { top: m.top, middle: m.middle, base: m.base, source: m.source ? { ...m.source, ...(name ? { retailerName: name } : {}) } : null };
}

/** Builds a region's page data from what its crawl committed. Pure apart from the clock it is given. */
export function buildRegionSite(
  inputs: RegionInputs,
  ukSlugs: Readonly<Record<string, string>>,
  now: string,
  /** The UK catalogue, read only, for the pictures of matching bottles (`matchUkPhotos`); none given, none shown. */
  uk: readonly UkPhotoSource[] = [],
  /** A UK shop's name, to credit the shop a UK product's notes were read from; unknown, the credit keeps no name. */
  ukShopName: (retailerId: string) => string | undefined = () => undefined,
): RegionSite {
  const products = regionProducts(inputs, now).filter(isShowable);
  const ukPhotos = matchUkPhotos(products, uk);
  const ukNotes = matchUkNotes(products, uk);
  const slugs = regionSlugs(products.map(regionSlugProduct), ukSlugs, inputs.slugMemory);
  const shopById = new Map(inputs.shops.map((s) => [s.id, s]));
  const retailerById = new Map(inputs.shops.map((s) => [s.id, regionShopAsRetailer(s)]));
  const baselines = shopBaselines(inputs.snapshots);
  const nowMs = Date.parse(now);
  const nowDate = new Date(now);

  const catalogue: RegionCatalogueEntry[] = [];
  const crawled: Record<string, RegionCrawledOffer[]> = {};
  const deals: RegionDeal[] = [];
  let newest = '';

  for (const p of products) {
    const isSet = p.kind === 'set';
    const concentration = p.concentration ?? 'Not stated';
    const setTitle = isSet ? (p.offers[0]?.detail?.title ?? `${p.brand} ${p.name}`) : null;
    // A shop's previous price stands only where the other shops corroborate it.
    const cred: CredibilityOffer[] = p.offers.map((o) => {
      const shop = shopById.get(o.shopId);
      const house = shop?.singleBrandOnly ? brandKey(shop.singleBrandOnly) : '';
      const brand = brandKey(p.brand);
      return {
        retailerId: o.shopId,
        price: o.price,
        wasPrice: o.detail?.wasPrice ?? null,
        sizeMl: p.sizeMl,
        brandDirect: !!house && !!brand && (brand.startsWith(house) || house.startsWith(brand)),
      };
    });
    const offers: RegionCrawledOffer[] = p.offers.map((o, i) => {
      const d = o.detail;
      const fetchedAt = d?.lastSeenAt ?? now;
      if (fetchedAt > newest) newest = fetchedAt;
      const firstSeen = Date.parse(d?.firstSeenAt ?? '');
      const baseline = baselines.get(o.shopId);
      const isNew = Number.isFinite(firstSeen) && baseline !== undefined && firstSeen - baseline > DAY_MS &&
        nowMs - firstSeen >= 0 && nowMs - firstSeen <= NEW_WINDOW_DAYS * DAY_MS;
      const kept = judgeWasPrice(cred, cred[i]!) === 'corroborated' ? (d?.wasPrice ?? null) : null;
      return {
        retailerId: o.shopId,
        price: o.price,
        wasPrice: kept !== null && kept > o.price ? kept : null,
        promoEndsAt: null,
        stock: stockOf(o),
        url: d?.url ?? '',
        fetchedAt,
        firstSeenAt: d?.firstSeenAt ?? fetchedAt,
        isNew,
        imageUrl: shopById.get(o.shopId)?.imageBasis && d?.imageUrl ? d.imageUrl : null,
        rating: null,
        ...(isSet && d?.title && d.title !== setTitle ? { title: d.title } : {}),
      };
    }).filter((o) => o.url !== '');
    if (offers.length === 0) continue;

    catalogue.push({
      id: p.id,
      slug: slugs[p.id]!,
      brand: p.brand,
      name: p.name,
      concentration,
      sizeMl: isSet ? null : p.sizeMl,
      ean: p.ean,
      shops: offers.length,
      image: (isSet ? undefined : ukPhotos.get(p.id)?.image) ?? pickImage(offers.map((o) => ({ retailerId: o.retailerId, imageUrl: o.imageUrl, fetchedAt: o.fetchedAt })), nowDate),
      ...(!isSet && ukPhotos.get(p.id)?.imageTransform ? { imageTransform: ukPhotos.get(p.id)!.imageTransform! } : {}),
      notes: notesOf(isSet ? undefined : ukNotes.get(p.id), ukShopName),
      ...(isSet ? { giftSet: { contents: null, title: setTitle! } } : {}),
    });
    crawled[p.id] = offers;

    // Today's Deals: bottles only, as in the UK (scripts/build-deals.ts).
    if (isSet || isOilStrength(concentration)) continue;
    const candidates: RegionDeal[] = [];
    for (const o of offers) {
      const retailer = retailerById.get(o.retailerId);
      if (!retailer?.enabled || retailer.singleBrandOnly || !BUYABLE.has(o.stock)) continue;
      // Region only, and it only takes a deal away: the shop's own recorded prices must not contradict it (src/catalogue/regionDeals.ts).
      if (!historyAllowsDeal(inputs.history?.points[p.id]?.[o.retailerId], o.price, nowMs)) continue;
      const shown = shownPrice(presentOffer({ ...o, variantId: p.id, currency: 'GBP' }, retailer, nowDate));
      const c = dealCandidateForOffer({ brand: p.brand, houseCeiling: null }, {
        price: o.price,
        wasPrice: o.wasPrice,
        retailerId: o.retailerId,
        shownPrice: shown.amountGbp,
        shownDelivered: shown.delivered,
      });
      if (c) candidates.push({ fragranceId: p.id, ...c });
    }
    candidates.sort((a, b) => a.price - b.price);
    if (candidates[0] && candidates[0].percentOff > 0) deals.push(candidates[0]);
  }

  // Most widely stocked first, as the UK catalogue is ordered; then by id, so a build is repeatable.
  catalogue.sort((a, b) => b.shops - a.shops || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  deals.sort((a, b) => b.percentOff - a.percentOff || (a.fragranceId < b.fragranceId ? -1 : 1));

  const shown = new Set(catalogue.map((c) => c.id));
  const priceHistory: Record<string, RegionHistoryPoint[]> = {};
  const priceHistoryGap: Record<string, RegionHistoryGap> = {};
  for (const id of [...shown].sort()) {
    const byShop = inputs.history?.points[id];
    if (!byShop) continue;
    // A price a reader could have paid: the region history records no stock,
    // so a shop whose bottle is sold out now is left out of the line (the UK
    // chart plots buyable prices only, scripts/build-price-history.ts).
    const buyable = new Set((crawled[id] ?? []).filter((o) => o.stock !== 'outOfStock' && o.stock !== 'preOrder').map((o) => o.retailerId));
    const series = cheapestSeries(Object.fromEntries(Object.entries(byShop).filter(([shop]) => buyable.has(shop))));
    if (series.length >= 2) priceHistory[id] = series;
    else if (series.length === 1) {
      const only = series[0]!;
      priceHistoryGap[id] = { reason: 'not-enough', priceGbp: only.priceGbp!, retailerId: only.retailerId!, at: only.at };
    }
  }

  const shopCount = new Set(Object.values(crawled).flatMap((offers) => offers.map((o) => o.retailerId))).size;
  return {
    region: inputs.region,
    catalogue,
    crawled,
    deals,
    dealsGeneratedAt: now,
    priceHistory,
    priceHistoryGap,
    slugs,
    crawledAt: newest || inputs.harvestRanAt || now,
    shopCount,
  };
}

/**
 * data/regions/<r>/deals.json: Today's Deals as the page shows them, with the
 * counts that say where they come from (the crawl writes it beside the
 * report; the page build computes the same deals from the same snapshots).
 */
export function regionDealsFile(inputs: Pick<RegionInputs, 'region' | 'snapshots'>, site: Pick<RegionSite, 'crawled' | 'deals'>, builtAt: string) {
  const cfg = regionById(inputs.region)!;
  const active = inputs.snapshots.flatMap((s) => s.listings.filter((l) => l.status === 'active'));
  return {
    region: inputs.region,
    currency: REGION_CRAWL[inputs.region].currency,
    referencePriceName: cfg.referencePriceName,
    builtAt,
    rule: "The UK's deal rules (src/services/dealCandidates.ts) on each shop's own stated reference price (compare at, list price or MRP, as published, never converted), kept only where the other shops corroborate it (src/catalogue/wasPriceCredibility.ts), and not against the shop's own recorded prices (src/catalogue/regionDeals.ts).",
    /** Active listings carrying the shop's own reference price, before any check. */
    listingsWithReference: active.filter((l) => l.wasPrice !== null).length,
    /** Offers on the page whose reference survived the market check. */
    offersWithCorroboratedReference: Object.values(site.crawled).reduce((n, offers) => n + offers.filter((o) => o.wasPrice !== null).length, 0),
    deals: site.deals,
    minDealsForFullList: REGION_MIN_DEALS,
  };
}

/**
 * What one region's page knows about the other regions, for the country menu
 * and the "You are seeing UK prices" bar (plan section 2, "The menu: switching
 * and remembering"): for each other live region, the address there of every
 * product this region also sells, and the brands sold there. A lazy data file
 * (`regions`, scripts/dataFiles.ts), fetched only when the menu or the bar
 * needs it, so the first load does not grow.
 */
export type RegionLinks = Partial<Record<'GB' | RegionCode, { slugs: Record<string, string>; brands: string[] }>>;

export interface RegionLinkSource {
  id: 'GB' | RegionCode;
  /** Product id to its address in that region, for every product it has a page for. */
  slugs: Readonly<Record<string, string>>;
  /** The brands it sells. */
  brands: Iterable<string>;
}

/** The links file of one region's page: every other region's overlap with it. */
export function regionLinksFor(self: RegionLinkSource, others: readonly RegionLinkSource[]): RegionLinks {
  const out: RegionLinks = {};
  for (const o of others) {
    if (o.id === self.id) continue;
    const slugs: Record<string, string> = {};
    for (const id of Object.keys(self.slugs).sort()) {
      const there = o.slugs[id];
      if (there) slugs[id] = there;
    }
    out[o.id] = { slugs, brands: [...new Set([...o.brands].map(slugify).filter(Boolean))].sort() };
  }
  return out;
}

/** The region a page config names, as the region code the region files use. */
export function regionCodeOf(region: RegionConfig): RegionCode {
  if (region.id === 'GB') throw new Error('the UK has no region folder');
  return region.id;
}

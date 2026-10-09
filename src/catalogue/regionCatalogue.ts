/**
 * A region's catalogue, price history and go/no-go numbers, built from its
 * snapshots (data/regions/<us|in>/catalogue/*.json) and nothing else
 * (docs/INTERNATIONAL-PLAN.md, Phase 1, step one, and section 7 "What to
 * measure before committing to the US").
 *
 * Product identity is the UK's, shared, not a copy of it:
 *   - `fragranceId` (fragranceId.ts): the barcode id `ean-<13 digits>` where a
 *     listing carries a trustworthy barcode (a 12 digit UPC is padded to the
 *     same EAN-13 the UK uses), else the shop's own id;
 *   - `untrustworthyEans` (productMatch.ts): a code one shop prints on two
 *     different perfumes is nobody's identity (Luckyscent repeats a gtin);
 *   - `findDuplicateGroups` (productMatch.ts): the same house, size, strength
 *     and name words make one bottle, and two real barcodes that disagree are
 *     never merged.
 * Names, strengths and sizes are read with the UK's own readers
 * (`displayName`, `concentrationOfListing`, `sizeMl`), and a US ounce size
 * with no millilitres is read as the nominal bottle (3.4 oz is 100 ml,
 * ounceSizes.ts), as the plan says.
 *
 * Nothing here reads or writes a UK file: no slug, no alias, no UK history.
 * `ukIds` is a read only set of the UK's product ids, used only to count how
 * many region products land on an existing UK product by barcode.
 */
import type { RegionCurrency } from '../types/regionRetailer.js';
import type { RegionListing, RegionSnapshot } from './regionHarvest.js';
import { asGateListing } from './regionHarvest.js';
import { fragranceId, isCatalogueListing, sizeMl } from './fragranceId.js';
import { findDuplicateGroups, untrustworthyEans, trustworthyEan, type MatchableProduct } from './productMatch.js';
import { concentrationOfListing, displayName } from './productName.js';
import { ownSizeTitle } from './shopifyJson.js';
import { nominalMlForOz, ouncesStated } from './ounceSizes.js';
import { recoverBrandFromTitle } from './brandName.js';
import { isGiftSet } from './giftSet.js';

export interface RegionOffer {
  shopId: string;
  price: number;
  inStock: boolean | null;
  /**
   * The listing behind the offer, carried only when the caller asks for it
   * (`BuildRegionOptions.withListingDetail`): the region page build needs the
   * shop's address, its own previous price and when it was seen
   * (src/catalogue/regionSite.ts). Never written to catalogue.json, which
   * keeps its dry run shape.
   */
  detail?: RegionOfferDetail;
}

export interface RegionOfferDetail {
  url: string;
  title: string;
  wasPrice: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** The shop's own page says the bottle is a pre-order. */
  preOrder?: true;
  /** The shop's own picture of the listing, an address on the shop's side (`RegionListing.imageUrl`). */
  imageUrl?: string;
}

export interface RegionProduct extends MatchableProduct {
  kind: 'bottle' | 'set';
  offers: RegionOffer[];
}

export interface RegionMeasures {
  /** Products with at least one offer seen within the freshness window. */
  products: number;
  /** Products offered by two or more different shops: the plan's key measure. */
  productsWithTwoOrMoreShops: number;
  /** As a share of products, 0 to 1. The plan's bar is a quarter. */
  shareWithTwoOrMoreShops: number;
  /**
   * The same, counting shops that run one catalogue (`catalogueGroup`) as one:
   * the honest version of the measure.
   */
  productsWithTwoOrMoreIndependentShops: number;
  shareWithTwoOrMoreIndependentShops: number;
  productsWithThreeOrMoreShops: number;
  /** Among products with two or more shops: the median gap between the dearest and cheapest offer, as a share of the cheapest. */
  medianPriceGap: number | null;
  /** Listings carrying a trustworthy barcode, as a share of listings. */
  listingBarcodeShare: number;
  /** Products whose barcode id is also a UK product id (`data/product-slugs.json`, read only). */
  productsMatchingUkByBarcode: number;
  /** Per shop: products it offers, and how many of those another shop offers too. */
  shops: { id: string; products: number; shared: number }[];
}

/** Days after which a listing no longer counts, the UK's own window (offerAge.ts). */
export const REGION_STALE_DAYS = 7;

function brandOf(l: RegionListing, confirmed: ReadonlySet<string>, shopName: string, notHouse?: ReadonlySet<string>): string {
  if (l.rawBrand && l.rawBrand.trim() && !notHouse?.has(l.rawBrand.trim().toLowerCase())) return l.rawBrand.trim();
  return recoverBrandFromTitle(l.rawTitle, shopName, confirmed) ?? '';
}

function regionSizeMl(title: string): number | null {
  const oz = ouncesStated(title);
  if (oz !== null) return nominalMlForOz(oz) ?? sizeMl(title);
  return sizeMl(title);
}

const MEN = '(?:men|man|him|gents?)';
const WOMEN = '(?:women|woman|her|ladies|lady)';
const BOTH = new RegExp(`\\bfor\\s+(?:${MEN}\\s*(?:&|and|/)\\s*${WOMEN}|${WOMEN}\\s*(?:&|and|/)\\s*${MEN}|unisex|all)\\b|\\bunisex\\b`, 'gi');
const FOR_MEN = new RegExp(`\\bfor\\s+${MEN}\\b`, 'gi');
const FOR_WOMEN = new RegExp(`\\bfor\\s+${WOMEN}\\b`, 'gi');
const has = (re: RegExp, text: string): boolean => text.search(re) >= 0;

/**
 * The name the region build matches on: the shop's "for Men", "For Man &
 * Woman", "For Unisex" and a note in brackets ("(New Release 2025)") taken
 * out, and who it is for put back as one word only where it is one sex. So
 * "Khamrah For Unisex" and "Khamrah For Men & Women" are one bottle, while
 * "Code for Men" and "Code for Women" stay two, and a name that states no
 * one is matched only with names that say unisex or nothing. Indian shops
 * write these phrases in every title, in many spellings; the UK merge
 * (findDuplicateGroups) is exact about words, so without this one bottle
 * read as three. The display name is left as the shop wrote it.
 */
export function regionMatchName(name: string): string {
  let n = name.replace(/\([^)]*\)/g, ' ');
  let who = '';
  if (has(BOTH, n)) n = n.replace(BOTH, ' ');
  else if (has(FOR_WOMEN, n)) { who = 'forwomen'; n = n.replace(FOR_WOMEN, ' '); }
  else if (has(FOR_MEN, n)) { who = 'formen'; n = n.replace(FOR_MEN, ' '); }
  n = n.replace(/\s+/g, ' ').trim();
  return who ? `${n} ${who}` : n;
}

export interface BuildRegionOptions {
  now: string;
  /** Shop id to display name, for the brand reader's refusal of the shop's own name. */
  shopNames: ReadonlyMap<string, string>;
  ukIds?: ReadonlySet<string>;
  /** Shop id to its `catalogueGroup`, for the independent count. */
  groups?: ReadonlyMap<string, string>;
  /** Shop id to the vendor names it uses for itself (`vendorNotHouse`), lower case: never a brand. */
  notHouse?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Shop id to its `titleMustMatch`: words that name the shop's format, not the perfume, taken out of the name. */
  formatWords?: ReadonlyMap<string, string>;
  /** Carry each offer's listing (`RegionOffer.detail`) for the page build. Off for the dry run files. */
  withListingDetail?: boolean;
}

export function buildRegionCatalogue(snapshots: readonly RegionSnapshot[], options: BuildRegionOptions): { products: RegionProduct[]; measures: RegionMeasures } {
  const cutoff = Date.parse(options.now) - REGION_STALE_DAYS * 86_400_000;
  const rows: { shopId: string; l: RegionListing }[] = [];
  for (const s of snapshots) {
    for (const l of s.listings) {
      if (l.status !== 'active' || Date.parse(l.lastSeenAt) < cutoff) continue;
      if (!isCatalogueListing(asGateListing(l, s.retailerId))) continue;
      rows.push({ shopId: s.retailerId, l });
    }
  }
  const untrustworthy = untrustworthyEans(rows.map(({ shopId, l }) => ({ retailerId: shopId, ean: l.ean, rawTitle: l.rawTitle })));
  const notHouseAll = new Set([...(options.notHouse?.values() ?? [])].flatMap((v) => [...v]));
  const confirmed = new Set(rows.map(({ l }) => l.rawBrand?.trim().toLowerCase()).filter((b): b is string => !!b && !notHouseAll.has(b)));

  const byId = new Map<string, RegionProduct>();
  let withBarcode = 0;
  for (const { shopId, l } of rows) {
    const gate = asGateListing(l, shopId);
    const id = fragranceId(gate, untrustworthy);
    const ean = trustworthyEan({ retailerId: shopId, ean: l.ean, rawTitle: l.rawTitle }, untrustworthy);
    if (ean) withBarcode++;
    const format = options.formatWords?.get(shopId);
    const title = ownSizeTitle(format ? l.rawTitle.replace(new RegExp(`\\s*-?\\s*${format}`, 'gi'), ' ').replace(/\s+/g, ' ').trim() : l.rawTitle);
    const brand = brandOf(l, confirmed, options.shopNames.get(shopId) ?? shopId, options.notHouse?.get(shopId));
    const offer: RegionOffer = options.withListingDetail
      ? { shopId, price: l.price, inStock: l.inStock, detail: { url: l.url, title: l.rawTitle, wasPrice: l.wasPrice, firstSeenAt: l.firstSeenAt, lastSeenAt: l.lastSeenAt, ...(l.availability === 'preOrder' ? { preOrder: true as const } : {}), ...(l.imageUrl ? { imageUrl: l.imageUrl } : {}) } }
      : { shopId, price: l.price, inStock: l.inStock };
    const existing = byId.get(id);
    if (existing) {
      existing.offers.push(offer);
      continue;
    }
    byId.set(id, {
      id,
      kind: isGiftSet(gate) ? 'set' : 'bottle',
      brand,
      name: displayName(title, brand || null, brand || null),
      concentration: concentrationOfListing(title, null),
      sizeMl: regionSizeMl(title),
      ean,
      offers: [offer],
    });
  }

  // One bottle sold by several shops under different ids: the UK's own merge,
  // run on the match name (regionMatchName) and mapped back to the products.
  const bottles = [...byId.values()].filter((p) => p.kind === 'bottle' && p.brand !== '');
  const proxyOf = new Map<RegionProduct, RegionProduct>();
  const proxies = bottles.map((p) => {
    const proxy = { ...p, name: regionMatchName(p.name) };
    proxyOf.set(proxy, p);
    return proxy;
  });
  const groups = findDuplicateGroups(proxies, { shopsOf: (p) => p.offers.map((o) => o.shopId) });
  for (const g of groups) {
    const canonical = proxyOf.get(g.canonical)!;
    for (const a of g.absorbed) {
      const absorbed = proxyOf.get(a)!;
      canonical.offers.push(...absorbed.offers);
      byId.delete(absorbed.id);
    }
  }

  // One offer per shop per product: its cheapest in stock, else its cheapest.
  const products = [...byId.values()].map((p) => {
    const best = new Map<string, RegionOffer>();
    for (const o of p.offers) {
      const cur = best.get(o.shopId);
      const rank = (x: RegionOffer) => (x.inStock === false ? 1 : 0);
      if (!cur || rank(o) < rank(cur) || (rank(o) === rank(cur) && o.price < cur.price)) best.set(o.shopId, o);
    }
    return { ...p, offers: [...best.values()].sort((a, b) => a.price - b.price || a.shopId.localeCompare(b.shopId)) };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const multi = products.filter((p) => p.offers.length >= 2);
  const sourceOf = (shopId: string) => options.groups?.get(shopId) ?? shopId;
  const independent = products.filter((p) => new Set(p.offers.map((o) => sourceOf(o.shopId))).size >= 2);
  const gaps = multi
    .map((p) => {
      const prices = p.offers.map((o) => o.price);
      const lo = Math.min(...prices);
      return lo > 0 ? (Math.max(...prices) - lo) / lo : null;
    })
    .filter((g): g is number => g !== null)
    .sort((a, b) => a - b);
  const shopIds = [...new Set(rows.map((r) => r.shopId))].sort();
  const measures: RegionMeasures = {
    products: products.length,
    productsWithTwoOrMoreShops: multi.length,
    shareWithTwoOrMoreShops: products.length ? Math.round((multi.length / products.length) * 1000) / 1000 : 0,
    productsWithTwoOrMoreIndependentShops: independent.length,
    shareWithTwoOrMoreIndependentShops: products.length ? Math.round((independent.length / products.length) * 1000) / 1000 : 0,
    productsWithThreeOrMoreShops: products.filter((p) => p.offers.length >= 3).length,
    medianPriceGap: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]! * 1000) / 1000 : null,
    listingBarcodeShare: rows.length ? Math.round((withBarcode / rows.length) * 1000) / 1000 : 0,
    productsMatchingUkByBarcode: options.ukIds ? products.filter((p) => p.id.startsWith('ean-') && options.ukIds!.has(p.id)).length : 0,
    shops: shopIds.map((id) => {
      const mine = products.filter((p) => p.offers.some((o) => o.shopId === id));
      return { id, products: mine.length, shared: mine.filter((p) => p.offers.length >= 2).length };
    }),
  };
  return { products, measures };
}

/**
 * A region's price history: per product, per shop, the price on each day it
 * changed (and the first day it was seen). Built from its own last copy and
 * today's catalogue, and only ever appended to, so a run that sees a price
 * unchanged adds nothing.
 */
export interface RegionPriceHistory {
  currency: RegionCurrency;
  updatedAt: string;
  /** productId -> shopId -> [day, price][] */
  points: Record<string, Record<string, [string, number][]>>;
}

export function appendRegionHistory(
  previous: RegionPriceHistory | null,
  products: readonly RegionProduct[],
  currency: RegionCurrency,
  now: string,
): RegionPriceHistory {
  const day = now.slice(0, 10);
  const points: RegionPriceHistory['points'] = structuredClone(previous?.points ?? {});
  for (const p of products) {
    const byShop = (points[p.id] ??= {});
    for (const o of p.offers) {
      const series = (byShop[o.shopId] ??= []);
      const last = series[series.length - 1];
      if (last && last[1] === o.price) continue;
      if (last && last[0] === day) last[1] = o.price;
      else series.push([day, o.price]);
    }
  }
  return { currency, updatedAt: now, points };
}

/** One entry per line, so a day's change is a small diff. */
export function encodeLines(head: Record<string, unknown>, key: string, rows: readonly unknown[]): string {
  const top = JSON.stringify(head, null, 2).replace(/\n\}$/, '');
  const body = rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  return `${top},\n  "${key}": [\n${body}\n  ]\n}\n`;
}

export function encodeHistory(h: RegionPriceHistory): string {
  const ids = Object.keys(h.points).sort();
  const body = ids.map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(h.points[id])}`).join(',\n');
  return `{\n  "currency": ${JSON.stringify(h.currency)},\n  "updatedAt": ${JSON.stringify(h.updatedAt)},\n  "points": {\n${body}\n  }\n}\n`;
}

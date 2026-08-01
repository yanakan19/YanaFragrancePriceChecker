/**
 * Build the app's catalogue from real harvested listings.
 *
 * Nothing here is curated by hand any more. Products come from what the shops
 * actually listed, grouped across shops by EAN, and a fragrance exists in the
 * app only because a shop was selling it when we looked.
 *
 * Two rules this enforces, both of which were broken before:
 *
 *   1. **Live snapshots only.** Fixture data is invented, so mixing it with
 *      real prices would put fabricated figures in front of a reader beside
 *      genuine ones, which is the one thing this project must never do.
 *   2. **Fragrance only.** A sitemap walk picks up whatever a shop files near
 *      its perfume, and "Fragrance-free baby nappy cream" is not a fragrance.
 *
 * Run after a harvest: npm run catalogue:demo
 */
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../src/catalogue/store.js';
import { isNewListing } from '../src/catalogue/newBadge.js';
import type { StoredListing } from '../src/catalogue/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'data/catalogue');
const store = new CatalogueStore(dir);
const now = new Date();

/* ── deciding what is actually a fragrance ─────────────────────────────────── */

/** Concentrations, which are the strongest signal a listing is a scent. */
const CONCENTRATION =
  /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|parfum|edp|edt|edc|aftershave|cologne|extrait)\b/i;

/** Things that live near perfume in a sitemap but are not perfume. */
const NOT_A_FRAGRANCE =
  /\b(fragrance[- ]free|unperfumed|unscented|nappy|tissue|soap bar|body cream|shampoo|conditioner|deodorant|shower gel|body wash|candle|diffuser|reed|gift ?set|set of|bundle|tester|sample|refill|travel spray|decant|hand wash|moisturis|lotion|balm|scrub|talc)\b/i;

/** Size in millilitres, needed before two listings can be compared at all. */
function sizeMl(title: string): number | null {
  const ml = title.match(/(\d{1,4}(?:\.\d)?)\s*ml\b/i);
  if (ml) return Math.round(Number.parseFloat(ml[1]!));
  const oz = title.match(/(\d{1,2}(?:\.\d)?)\s*(?:fl\.?\s*)?oz\b/i);
  if (oz) return Math.round(Number.parseFloat(oz[1]!) * 29.5735);
  return null;
}

function isFragrance(l: StoredListing): boolean {
  const t = l.rawTitle;
  if (NOT_A_FRAGRANCE.test(t)) return false;
  if (!CONCENTRATION.test(t)) return false;
  if (sizeMl(t) === null) return false;
  return l.priceGbp !== null && l.priceGbp > 0;
}

/** Concentration as a display string. */
function concentration(title: string): string {
  const m = title.match(CONCENTRATION);
  if (!m) return 'Fragrance';
  const raw = m[0].toLowerCase();
  if (raw === 'edp') return 'Eau de Parfum';
  if (raw === 'edt') return 'Eau de Toilette';
  if (raw === 'edc') return 'Eau de Cologne';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Strip the shop's noise off a title to get something readable.
 *
 * Deliberately conservative. Where this cannot do better it leaves the shop's
 * own words alone, because a mangled name is worse than a verbose one.
 */
function displayName(title: string, brand: string | null): string {
  let s = title;
  if (brand) s = s.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '');
  s = s
    .replace(CONCENTRATION, '')
    .replace(/\b\d{1,4}(?:\.\d)?\s*ml\b/gi, '')
    .replace(/\b(spray|splash|for (?:men|women|him|her)|refillable|vapo|natural)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,\-|]+|[\s,\-|]+$/g, '');
  return s || title;
}

/* ── gather ────────────────────────────────────────────────────────────────── */

interface Offer {
  retailerId: string;
  price: number;
  wasPrice: number | null;
  promoEndsAt: string | null;
  stock: 'inStock' | 'outOfStock' | 'unknown';
  url: string;
  fetchedAt: string;
  firstSeenAt: string;
  isNew: boolean;
}

interface Product {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  offers: Offer[];
}

const products = new Map<string, Product>();
let liveShops = 0;
let considered = 0;
let rejected = 0;

if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const snapshot = store.read(file.replace(/\.json$/, ''));

    // Invented data never reaches the app, whatever else happens.
    if (snapshot.source !== 'live') continue;

    const active = snapshot.listings.filter((l) => l.status === 'active');
    if (active.length > 0) liveShops++;

    for (const l of active) {
      considered++;
      if (!isFragrance(l)) {
        rejected++;
        continue;
      }

      const size = sizeMl(l.rawTitle)!;
      // EAN groups the same bottle across shops. Without one a listing can only
      // stand alone, which is honest: we cannot claim two titles are the same
      // product until the matcher exists.
      const id = l.ean
        ? `ean-${l.ean}`
        : `${l.retailerId}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

      const existing = products.get(id);
      const offer: Offer = {
        retailerId: l.retailerId,
        price: l.priceGbp!,
        wasPrice: l.wasPriceGbp,
        promoEndsAt: l.promoEndsAt,
        stock: l.inStock === true ? 'inStock' : l.inStock === false ? 'outOfStock' : 'unknown',
        url: l.url,
        fetchedAt: l.lastSeenAt,
        firstSeenAt: l.firstSeenAt,
        isNew: isNewListing(l, now),
      };

      if (existing) {
        existing.offers.push(offer);
      } else {
        products.set(id, {
          id,
          brand: l.rawBrand ?? 'Unbranded',
          name: displayName(l.rawTitle, l.rawBrand),
          concentration: concentration(l.rawTitle),
          sizeMl: size,
          ean: l.ean,
          offers: [offer],
        });
      }
    }
  }
}

// Most shops first, so the comparison leads with products that have one.
const ordered = [...products.values()].sort(
  (a, b) => b.offers.length - a.offers.length || a.brand.localeCompare(b.brand),
);

const crawled: Record<string, Offer[]> = {};
for (const p of ordered) crawled[p.id] = p.offers;

const crawledAt =
  ordered.flatMap((p) => p.offers.map((o) => o.fetchedAt)).sort().at(-1) ??
  new Date(0).toISOString();

const catalogue = ordered.map((p) => ({
  id: p.id,
  brand: p.brand,
  name: p.name,
  concentration: p.concentration,
  sizeMl: p.sizeMl,
  ean: p.ean,
  shops: p.offers.length,
}));

const body = `// Generated by scripts/build-demo-catalogue.ts. Do not edit by hand.
//
// Every product and every price below was harvested from a live UK shop through
// its own sitemap. Nothing here is curated, invented or typed by hand: a
// fragrance appears because a shop was selling it when we looked.
//
// Regenerate: npm run harvest && npm run catalogue:demo

import type { RawOffer, StockState } from '../src/types/offer.js';

export interface CrawledOffer {
  retailerId: string;
  price: number;
  wasPrice: number | null;
  promoEndsAt: string | null;
  stock: StockState;
  url: string;
  fetchedAt: string;
  firstSeenAt: string;
  isNew: boolean;
}

export interface CatalogueEntry {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  shops: number;
}

/** Products, most widely stocked first. */
export const CATALOGUE: CatalogueEntry[] = ${JSON.stringify(catalogue, null, 2)};

export const CRAWLED: Record<string, CrawledOffer[]> = ${JSON.stringify(crawled, null, 2)};

/** When the harvest that produced this data ran. */
export const CRAWLED_AT = ${JSON.stringify(crawledAt)};

/** How many shops the data came from. */
export const SHOP_COUNT = ${liveShops};

export function offersFor(productId: string): RawOffer[] {
  return (CRAWLED[productId] ?? []).map((o) => ({
    retailerId: o.retailerId,
    variantId: productId,
    price: o.price,
    wasPrice: o.wasPrice,
    currency: 'GBP' as const,
    stock: o.stock,
    url: o.url,
    promoEndsAt: o.promoEndsAt,
    fetchedAt: o.fetchedAt,
  }));
}

/** Whether a shop added this product inside the badge window. */
export function isNewAt(productId: string, retailerId: string): boolean {
  return CRAWLED[productId]?.some((o) => o.retailerId === retailerId && o.isNew) ?? false;
}
`;

writeFileSync(resolve(root, 'demo/catalogue.generated.ts'), body);

const multi = ordered.filter((p) => p.offers.length > 1).length;
console.log(
  `demo/catalogue.generated.ts written from LIVE data only:\n` +
    `  ${liveShops} shops, ${considered} listings considered, ${rejected} were not fragrance\n` +
    `  ${ordered.length} products, ${multi} of them stocked by more than one shop`,
);

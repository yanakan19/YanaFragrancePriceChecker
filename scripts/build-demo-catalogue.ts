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
import { RETAILERS } from '../src/config/retailers.js';

/** Retailers whose product photos we've actually confirmed a licence for. */
const IMAGE_LICENSED = new Set(
  RETAILERS.filter((r) => r.affiliate.imageUsageConfirmed === true).map((r) => r.id),
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'data/catalogue');
const store = new CatalogueStore(dir);
const now = new Date();

/* ── deciding what is actually a fragrance ─────────────────────────────────── */

/**
 * Concentrations, which are the strongest signal a listing is a scent.
 *
 * "perfume" was a real gap here: a title reading "Chanel No 5 Perfume 100ml"
 * matched none of the French-derived terms and was silently rejected as not
 * a fragrance, despite being an obvious one — plain English listings (feeds
 * especially) favour "perfume" over "parfum". "attar" and "oud" cover the
 * concentrated-oil style Middle Eastern perfumery uses, relevant because the
 * registry already models a 'mideast' tier for three retailers.
 */
const CONCENTRATION =
  /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|parfum|perfume|edp|edt|edc|aftershave|cologne|extrait|attar|oud)\b/i;

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

/**
 * Canonical display form per CONCENTRATION alternative, so "EDT" and "Eau De
 * Toilette" in two different retailers' titles both land on the identical
 * string. Without this, a naive title case of whatever phrase the title used
 * produced two different strings ("Eau de Toilette" from the abbreviation,
 * "Eau De Toilette" from the spelled out phrase) for the same concentration,
 * which then meant only one of the two ever matched the app's own
 * abbreviation table for the popular rail's compact size and concentration
 * label.
 */
const CONCENTRATION_DISPLAY: Record<string, string> = {
  edp: 'Eau de Parfum', edt: 'Eau de Toilette', edc: 'Eau de Cologne',
  'eau de parfum': 'Eau de Parfum', 'eau de toilette': 'Eau de Toilette',
  'eau de cologne': 'Eau de Cologne', 'eau fraiche': 'Eau Fraiche',
  parfum: 'Parfum', perfume: 'Perfume', aftershave: 'Aftershave',
  cologne: 'Cologne', extrait: 'Extrait', attar: 'Attar', oud: 'Oud',
};

/** Concentration as a display string. */
function concentration(title: string): string {
  const m = title.match(CONCENTRATION);
  if (!m) return 'Fragrance';
  const raw = m[0].toLowerCase();
  return CONCENTRATION_DISPLAY[raw] ?? raw.replace(/\b\w/g, (c) => c.toUpperCase());
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
  /** Only ever set for a retailer in IMAGE_LICENSED — see that constant. */
  imageUrl: string | null;
  /** The retailer's own copy, read only to extract labelled notes from. */
  description: string | null;
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

/**
 * Picks the product-level photo from whichever licensed offer has one, most
 * recently fetched first. A stale licensed photo is worse than none, so
 * freshness — not a fixed retailer ranking — breaks the tie when more than
 * one licensed source ever exists.
 */
function pickImage(offers: Offer[]): string | null {
  const licensed = offers
    .filter((o) => o.imageUrl !== null)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  return licensed[0]?.imageUrl ?? null;
}

export interface Notes {
  top: string[];
  middle: string[];
  base: string[];
}

/**
 * Pull the note pyramid out of a retailer's own product copy.
 *
 * This only ever reads notes a source has explicitly labelled ("Top notes:",
 * "Middle notes:" or "Heart notes:", "Base notes:"). It never infers a note
 * from a product name, a brand's house style or anything else — a fragrance
 * whose description does not spell them out simply has no notes here, and the
 * app says so rather than filling the gap.
 *
 * Worth being precise about the source: this is the *retailer's* copy, taken
 * from the affiliate feed we are licensed to use, not the perfumer's own
 * website. Those two usually agree, and where a retailer has copied the house
 * text they agree exactly, but this is not a claim to be quoting the maker
 * directly.
 */
function parseNotes(description: string | null | undefined): Notes | null {
  if (!description) return null;

  // Each section runs until the next label or the end of the copy. Feeds
  // frequently omit any separator between one section and the next label
  // ("...CardamomMiddle notes:"), so the lookahead does the splitting.
  /**
   * A note name, as opposed to a sentence that happened to follow one.
   *
   * The last section in a description runs into whatever marketing prose comes
   * after it, and some sources write the next heading without a colon so the
   * lookahead cannot split on it. Both leak sentences into the list, so the
   * shape of a real note is asserted directly: a short phrase of a few words,
   * with no sentence punctuation and no leftover heading fragment.
   */
  /**
   * Words that only ever appear because a sentence has been sliced mid clause
   * ("...where amber and musk take over", "citrus through spices"). A real note
   * is a noun phrase and never contains any of these.
   */
  // Adverbs are matched by name rather than by an "ends in ly" rule, which
  // would throw away Lily of the Valley.
  const PROSE =
    /\b(take|takes|taken|over|through|leading|with|into|from|that|which|while|before|after|creating|providing|making|giving|adding|fairly|quickly|slowly|gently|softly|deeply|subtly|really|quite|very|soon|later|eventually|immediately)\b/i;

  const looksLikeNote = (s: string): boolean =>
    s.length > 1 &&
    s.length <= 24 &&
    s.split(/\s+/).length <= 3 &&
    !/[.:;!?()]/.test(s) &&
    !/\bnotes?\b/i.test(s) &&
    // Feed copy capitalises note names. A lowercase start means the split
    // landed inside a sentence rather than on a list item.
    /^[A-Z]/.test(s) &&
    !PROSE.test(s);

  const section = (label: string): string[] => {
    const re = new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=(?:top|middle|heart|base)\\s+notes?\\s*:|$)`, 'i');
    const m = description.match(re);
    if (!m?.[1]) return [];
    // Notes are a comma separated list, never sentences, so the first full stop
    // that ends a sentence also ends the list.
    const listOnly = m[1].split(/\.\s|\.$/)[0] ?? '';
    return listOnly
      .split(/[,;/]|\band\b/i)
      .map((s) => s.trim())
      .filter(looksLikeNote)
      .slice(0, 14);
  };

  const top = section('top\\s+notes?');
  const middle = section('(?:middle|heart)\\s+notes?');
  const base = section('base\\s+notes?');

  if (top.length === 0 && middle.length === 0 && base.length === 0) return null;
  return { top, middle, base };
}

/** Notes from whichever offer published them most recently. */
function pickNotes(offers: Offer[]): Notes | null {
  const withCopy = offers
    .filter((o) => o.description)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  for (const o of withCopy) {
    const parsed = parseNotes(o.description);
    if (parsed) return parsed;
  }
  return null;
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
        imageUrl: IMAGE_LICENSED.has(l.retailerId) ? l.imageUrl : null,
        description: l.description ?? null,
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

// `description` is read for its notes above and then deliberately dropped: it
// is several hundred words per product across hundreds of products, and
// shipping all of it into a single page bundle would cost far more than the
// handful of note names actually displayed.
const crawled: Record<string, Omit<Offer, 'description'>[]> = {};
for (const p of ordered) {
  crawled[p.id] = p.offers.map(({ description: _drop, ...rest }) => rest);
}

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
  image: pickImage(p.offers),
  notes: pickNotes(p.offers),
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
  imageUrl: string | null;
}

export interface Notes {
  top: string[];
  middle: string[];
  base: string[];
}

export interface CatalogueEntry {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  shops: number;
  /** A real, licensed product photo — see demo/photo.ts. Null means none yet. */
  image: string | null;
  /**
   * Notes as a source explicitly labelled them, never inferred. Null where the
   * retailer's copy did not spell them out, which the app states plainly
   * rather than papering over.
   */
  notes: Notes | null;
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

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
import { HOUSES } from '../src/config/houses.js';
import { buildBrandCanon } from '../src/catalogue/brandName.js';
import { findDuplicateGroups } from '../src/catalogue/productMatch.js';

/**
 * Retailers whose product photos may be displayed, and on what grounds.
 *
 * A retailer qualifies once `imageBasis` names a reason — a licence read in
 * the affiliate terms, the brand's own storefront, or a deliberate unlicensed
 * hot-link. Unset still means the placeholder, so adding a shop never starts
 * showing its photography by accident.
 */
const IMAGE_ALLOWED = new Set(
  RETAILERS.filter((r) => r.affiliate.imageBasis != null).map((r) => r.id),
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
 * The same question asked of a fragrance house's own storefront.
 *
 * The concentration and size tests above exist to pick perfume out of a
 * general retailer's sitemap, where "Fragrance-free baby nappy cream" sits two
 * URLs away from Sauvage. A house that sells nothing but perfume needs no such
 * proof: Armaf lists "CLUB DE NUIT INTENSE OVERDOSE 3.6 Oz" and French Avenue
 * lists "Imperial Ocean", neither of which names a concentration, and both of
 * which are obviously scent because of where they came from. Demanding the
 * same evidence there would reject almost the entire catalogue of exactly the
 * houses we went to the trouble of sourcing.
 *
 * The exclusion list still applies, because a house does also sell body
 * lotion and deodorant.
 */
function isHouseFragrance(l: StoredListing): boolean {
  if (NOT_A_FRAGRANCE.test(l.rawTitle)) return false;
  // The shared list catches "gift set" and "set of" but not a bare trailing
  // "set", which is how a house usually writes one — "Club de Nuit Bling
  // Travel Buddy Set" came through as though it were a single bottle. Kept
  // here rather than added to NOT_A_FRAGRANCE so the retailer catalogue's
  // behaviour is untouched. `\bset\b` is safe against "Sunset": there is no
  // word boundary before the "set" inside it.
  return !/\b(set|coffret|collection)\b/i.test(l.rawTitle);
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
  /** Only ever set for a retailer in IMAGE_ALLOWED — see that constant. */
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

/**
 * One display spelling per brand, decided before anything is built.
 *
 * Retailer feeds disagree about casing for the same house, and every variant
 * used to become its own row in the Brands list: "ARMAF" and "Armaf" were two
 * brands, "Dolce & Gabbana" was three. Ten such groups across 166 strings.
 * See src/catalogue/brandName.ts for how the winner is chosen and why it is
 * not simply the most common one.
 */
const brandCanon = (() => {
  const seen: string[] = [];
  for (const d of [dir, resolve(root, 'data/houses')]) {
    if (!existsSync(d)) continue;
    const s = new CatalogueStore(d);
    for (const file of readdirSync(d).filter((f) => f.endsWith('.json'))) {
      const snap = s.read(file.replace(/\.json$/, ''));
      if (snap.source !== 'live') continue;
      for (const l of snap.listings) {
        if (l.status === 'active' && l.rawBrand) seen.push(l.rawBrand);
      }
    }
  }
  return buildBrandCanon(seen);
})();

/** The chosen spelling for a brand, or the raw one if it was never grouped. */
function canonBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return brandCanon.get(raw.trim()) ?? raw.trim();
}

const products = new Map<string, Product>();
let liveShops = 0;
let considered = 0;
const skippedShops: string[] = [];
let rejected = 0;

if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const snapshot = store.read(file.replace(/\.json$/, ''));

    // Invented data never reaches the app, whatever else happens.
    if (snapshot.source !== 'live') continue;

    // A snapshot can exist for a retailer the app cannot yet price. Importing
    // an affiliate feed writes data/catalogue/<id>.json regardless of whether
    // that retailer's delivery terms have been established, and every offer
    // here eventually reaches resolveDelivery, which refuses to guess a
    // delivery cost it was never given. Skipping them here is what keeps a
    // freshly imported feed from either crashing the app or — far worse —
    // quietly sorting an unpriceable shop to the top of the delivered-price
    // comparison.
    const retailer = RETAILERS.find((r) => r.id === snapshot.retailerId);
    if (!retailer || !retailer.enabled || retailer.shipping.standardGbp === null) {
      const why = !retailer
        ? 'not in the registry'
        : !retailer.enabled
          ? 'disabled'
          : 'standard delivery cost not established';
      skippedShops.push(`${snapshot.retailerId} (${why})`);
      continue;
    }

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
        imageUrl: IMAGE_ALLOWED.has(l.retailerId) ? l.imageUrl : null,
        description: l.description ?? null,
      };

      if (existing) {
        existing.offers.push(offer);
      } else {
        products.set(id, {
          id,
          brand: canonBrand(l.rawBrand) ?? 'Unbranded',
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

/* ── one bottle, one product ───────────────────────────────────────────────
   Keying on EAN alone left the same bottle listed twice whenever only one
   shop published a barcode — Afnan Supremacy In Extrait De Parfum, 100ml,
   appeared at £38.99 and £50.00 as two products. Folding them together is
   what turns two listings into an actual comparison. See
   src/catalogue/productMatch.ts for when two listings count as the same
   bottle and where it refuses to decide. */
const duplicateGroups = findDuplicateGroups([...products.values()]);
for (const { canonical, absorbed } of duplicateGroups) {
  for (const dupe of absorbed) {
    canonical.offers.push(...dupe.offers);
    // The barcode is worth keeping if the canonical record lacked one.
    canonical.ean ??= dupe.ean;
    products.delete(dupe.id);
  }
}
const mergedProducts = duplicateGroups.reduce((n, g) => n + g.absorbed.length, 0);

/* ── houses we source direct, which we cannot price in sterling yet ────────── */

/**
 * Fragrance houses read straight from their own storefronts.
 *
 * These are kept completely apart from the products above and never enter the
 * comparison. Every one of them is priced in the house's own currency — Armaf
 * in USD, French Avenue in AED — and the app's entire offer pipeline, from
 * bestOffer down to the delivered-price sort, is built on the assumption that
 * a price is sterling. Letting a dirham figure into it would produce a wrong
 * "cheapest" answer, which is the one failure this project exists to avoid.
 *
 * So they are surfaced as what they honestly are: products we know exist, with
 * the house's own photograph and its own published price in its own currency,
 * and no claim about what they would cost a UK buyer.
 */
interface HouseProduct {
  id: string;
  house: string;
  brand: string;
  name: string;
  sizeMl: number | null;
  url: string;
  image: string | null;
  nativePrice: { amount: number; currency: string } | null;
  inStock: boolean | null;
}

const houseProducts: HouseProduct[] = [];
const housesDir = resolve(root, 'data/houses');

if (existsSync(housesDir)) {
  const houseStore = new CatalogueStore(housesDir);
  for (const file of readdirSync(housesDir).filter((f) => f.endsWith('.json'))) {
    const id = file.replace(/\.json$/, '');
    const snapshot = houseStore.read(id);
    if (snapshot.source !== 'live') continue;

    const houseName = HOUSES.find((h) => h.id === id)?.name ?? id;

    for (const l of snapshot.listings) {
      if (l.status !== 'active') continue;
      if (!isHouseFragrance(l)) continue;

      houseProducts.push({
        id: `${id}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        house: houseName,
        brand: canonBrand(l.rawBrand) ?? houseName,
        name: l.rawTitle,
        sizeMl: sizeMl(l.rawTitle),
        url: l.url,
        // A house's own photography of its own bottle, hot-linked exactly like
        // every other image here — nothing is downloaded or rehosted.
        image: l.imageUrl,
        nativePrice: l.nativePrice ?? null,
        inStock: l.inStock,
      });
    }
  }
}

// Same rule as the retailer catalogue above: smallest bottle first within one
// perfume. A house listing may have no size at all, and those sort last rather
// than being treated as zero millilitres and leading the group.
houseProducts.sort(
  (a, b) =>
    a.house.localeCompare(b.house) ||
    a.name.localeCompare(b.name) ||
    (a.sizeMl ?? Infinity) - (b.sizeMl ?? Infinity) ||
    a.id.localeCompare(b.id),
);

// Most shops first, so the comparison leads with products that have one.
// Name and then size break the remaining ties, both ascending: without them
// the three sizes of one bottle came out in whatever order the Map happened to
// hold them, which is neither reproducible between builds nor sensible to
// read. Smallest bottle first — see compareVariants in demo/data.ts, which
// applies the same rule at display time.
const ordered = [...products.values()].sort(
  (a, b) =>
    b.offers.length - a.offers.length ||
    a.brand.localeCompare(b.brand) ||
    a.name.localeCompare(b.name) ||
    a.sizeMl - b.sizeMl,
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

/**
 * Houses read direct from their own storefronts.
 *
 * Deliberately not part of CATALOGUE and never priced against it: these carry
 * the house's own currency, and the comparison assumes sterling throughout.
 */
export interface HouseProduct {
  id: string;
  house: string;
  brand: string;
  name: string;
  sizeMl: number | null;
  url: string;
  image: string | null;
  /** The house's published price in its own currency. Never converted. */
  nativePrice: { amount: number; currency: string } | null;
  inStock: boolean | null;
}

export const HOUSE_PRODUCTS: HouseProduct[] = ${JSON.stringify(houseProducts, null, 2)};

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
    `  ${ordered.length} products, ${multi} of them stocked by more than one shop\n` +
    `  ${mergedProducts} duplicate listings folded into an existing product\n` +
    `  ${houseProducts.length} house products, catalogue-only (no sterling price yet)` +
    (skippedShops.length
      ? `\n  skipped: ${skippedShops.join(', ')}`
      : ''),
);

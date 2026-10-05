/**
 * The figures behind docs/GIFT-SETS-AND-OILS-PLAN.md, from the built catalogue
 * and from the shops' stored listings, so every phase of that plan can show
 * before and after on the same footing.
 *
 *   npm run sets-oils:report
 *   npm run sets-oils:report -- --json     the same figures as one JSON object
 *
 * Prints only. It writes no file and changes nothing.
 *
 * Two kinds of count are kept apart. A product is one catalogue entry (one
 * page); a listing or an offer is one shop's row for it.
 *
 * Needs `demo/catalogue.generated.ts` (the committed catalogue) and
 * `data/catalogue/*.json` (the stored listings). The listing level figures
 * (oil format flags, lost oil and set candidates) read the stored listings
 * through the same gates the build uses.
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_FRAGRANCES, type DemoFragrance } from '../demo/data.js';
import { CRAWLED } from '../demo/catalogue.generated.js';
import { productKind } from '../demo/productKind.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import type { StoredListing } from '../src/catalogue/types.js';
import { RETAILERS } from '../src/config/retailers.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { isGiftSet } from '../src/catalogue/giftSet.js';
import { concentrationOfStoredListing } from '../src/catalogue/productName.js';

const ROOT = resolve(import.meta.dirname, '..');

type Tally = Record<string, number>;

const bump = (t: Tally, key: string, by = 1) => {
  t[key] = (t[key] ?? 0) + by;
};
const sortedTally = (t: Tally, n = Infinity): [string, number][] =>
  Object.entries(t)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
const pct = (n: number, of: number) => (of === 0 ? '0.0%' : `${((100 * n) / of).toFixed(1)}%`);
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const BANDS: [string, number, number][] = [
  ['under 25', 0, 25],
  ['25 to 50', 25, 50],
  ['50 to 100', 50, 100],
  ['100 to 200', 100, 200],
  ['200 and over', 200, Infinity],
];

/** Lowest price a product is offered at, or null when it has no priced offer. */
function lowest(f: DemoFragrance): number | null {
  const prices = (CRAWLED[f.id] ?? []).map((o) => o.price).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
}

interface ProductGroup {
  products: DemoFragrance[];
  offers: number;
  byShop: Tally;
  brands: Tally;
  photo: number;
  inStock: number;
  shopsPerProduct: Tally;
  atTwoOrMore: number;
  lowestBands: Tally;
  medianLowest: number;
}

function group(products: DemoFragrance[]): ProductGroup {
  const out: ProductGroup = {
    products,
    offers: 0,
    byShop: {},
    brands: {},
    photo: 0,
    inStock: 0,
    shopsPerProduct: {},
    atTwoOrMore: 0,
    lowestBands: {},
    medianLowest: 0,
  };
  const lows: number[] = [];
  for (const f of products) {
    const offers = CRAWLED[f.id] ?? [];
    out.offers += offers.length;
    for (const o of offers) bump(out.byShop, o.retailerId);
    bump(out.brands, f.brand);
    if (f.photoUrl) out.photo += 1;
    if (offers.some((o) => o.stock === 'inStock')) out.inStock += 1;
    const shops = new Set(offers.map((o) => o.retailerId)).size;
    bump(out.shopsPerProduct, String(shops));
    if (shops >= 2) out.atTwoOrMore += 1;
    const low = lowest(f);
    if (low !== null) {
      lows.push(low);
      const band = BANDS.find(([, lo, hi]) => low >= lo && low < hi)!;
      bump(out.lowestBands, band[0]);
    }
  }
  out.medianLowest = median(lows);
  return out;
}

/** How a set's contents list reads, the plan's table in section 1.2. */
function contentsQuality(sets: DemoFragrance[]) {
  const q = { hasList: 0, none: 0, oneItem: 0, bareItem: 0, onlyPieces: 0, twoLabelled: 0, bundleNamed: 0 };
  for (const f of sets) {
    const c = f.giftSet!.contents;
    if (/\bbundle/i.test(f.name) || /\bbundle/i.test(f.giftSet!.title)) q.bundleNamed += 1;
    if (!c || c.length === 0) {
      q.none += 1;
      continue;
    }
    q.hasList += 1;
    if (c.length === 1) q.oneItem += 1;
    const bare = c.some((item) => /^[\d.]+ ?ml$/i.test(item.trim()));
    if (bare) q.bareItem += 1;
    const pieces = c.some((item) => /\bpieces?$/i.test(item.trim()));
    if (c.length === 1 && pieces) q.onlyPieces += 1;
    else if (pieces && c.every((item) => /\bpieces?$/i.test(item.trim()))) q.onlyPieces += 1;
    if (c.length >= 2 && !bare && !pieces) q.twoLabelled += 1;
  }
  return q;
}

/** The listings the build reads: enabled shops, active, with a price. */
function storedListings(): StoredListing[] {
  const dir = resolve(ROOT, 'data/catalogue');
  if (!existsSync(dir)) return [];
  const store = new CatalogueStore(dir);
  const enabled = new Set(RETAILERS.filter((r) => r.enabled).map((r) => r.id));
  const out: StoredListing[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const id = file.replace(/\.json$/, '');
    if (!enabled.has(id)) continue;
    const snap = store.read(id);
    if (snap.source !== 'live') continue;
    for (const l of snap.listings) {
      if (l.status === 'active' && typeof l.priceGbp === 'number' && l.priceGbp > 0) out.push(l);
    }
  }
  return out;
}

const ROLL_ON = /\broll[- ]?on\b|\broller\b(?!\s*ball)/i;
const DROPPER = /\bdropper\b/i;
const ALCOHOL_FREE = /\balcohol[- ]free\b|\bnon[- ]?alcoholic\b|\bwithout alcohol\b/i;
const OIL_PHRASE = /\b(?:concentrated )?perfum(?:e|ed) oil\b|\bfragrance oil\b|\bconcentrated oil\b|\broll[- ]?on oil\b|\battar\b/i;
const SET_WORDS = /\bgift ?sets?\b|\bduo\b|\btrio\b|\bcollection\b|\bdiscovery\b/i;

function listingFigures() {
  const listings = storedListings();
  const oilListings = listings.filter((l) => !isGiftSet(l) && isCatalogueListing(l) && concentrationOfStoredListing(l) === 'Perfume Oil');
  const flags = { rollOn: 0, rollOnTitle: 0, alcoholFree: 0, alcoholFreeTitle: 0, dropper: 0, concentrated: 0 };
  for (const l of oilListings) {
    const title = l.rawTitle;
    const text = `${title} ${l.description ?? ''}`;
    if (ROLL_ON.test(text)) flags.rollOn += 1;
    if (ROLL_ON.test(title)) flags.rollOnTitle += 1;
    if (ALCOHOL_FREE.test(text)) flags.alcoholFree += 1;
    if (ALCOHOL_FREE.test(title)) flags.alcoholFreeTitle += 1;
    if (DROPPER.test(text)) flags.dropper += 1;
    if (/\bconcentrated\b/i.test(text)) flags.concentrated += 1;
  }
  const setListings = listings.filter((l) => isGiftSet(l) && isCatalogueListing(l));
  const withDescription = setListings.filter((l) => l.description && l.description.trim().length > 0).length;
  const describesContents = setListings.filter((l) => /\b(?:contains?|includes?|comprises?)\b/i.test(l.description ?? '')).length;

  // Listings the catalogue turns away that read like an oil or a fragrance set.
  const lostOils: Tally = {};
  const lostSets: Tally = {};
  for (const l of listings) {
    if (isCatalogueListing(l)) continue;
    if (OIL_PHRASE.test(l.rawTitle) && !/\b(body|hair|face|bath|lip|candle|massage)\b/i.test(l.rawTitle)) bump(lostOils, l.retailerId);
    if (SET_WORDS.test(l.rawTitle) && /\b(?:perfum|parfum|fragrance|eau de|edp|edt)/i.test(l.rawTitle) && !/\b(candle|diffuser|empty|body|shower|lotion)\b/i.test(l.rawTitle)) {
      bump(lostSets, l.retailerId);
    }
  }
  return {
    listings: listings.length,
    oilListings: oilListings.length,
    flags,
    setListings: setListings.length,
    withDescription,
    describesContents,
    lostOils,
    lostSets,
  };
}

export function buildReport() {
  const bottles = DEMO_FRAGRANCES.filter((f) => productKind(f) === 'bottle');
  const sets = DEMO_FRAGRANCES.filter((f) => productKind(f) === 'set');
  const oils = DEMO_FRAGRANCES.filter((f) => productKind(f) === 'oil');
  const setsHoldingOilStrength = sets.filter((f) => f.concentration === 'Perfume Oil').length;
  const barcodeSets = sets.filter((f) => f.id.startsWith('set-ean-')).length;
  return {
    totals: {
      products: DEMO_FRAGRANCES.length,
      bottles: bottles.length,
      sets: sets.length,
      oils: oils.length,
      setsHoldingOilStrength,
      sum: bottles.length + sets.length + oils.length,
    },
    bottles: group(bottles),
    sets: { ...group(sets), contents: contentsQuality(sets), idByBarcode: barcodeSets, idByTitle: sets.length - barcodeSets },
    oils: {
      ...group(oils),
      sizes: oils.reduce<Tally>((t, f) => (bump(t, f.sizeMl === null ? 'unknown' : String(f.sizeMl)), t), {}),
    },
    listings: listingFigures(),
  };
}

function printGroup(name: string, g: ProductGroup, allProducts: number) {
  console.log(`\n${name}`);
  console.log(`  products ${g.products.length} (${pct(g.products.length, allProducts)} of ${allProducts}), offers ${g.offers}`);
  console.log(`  brands ${Object.keys(g.brands).length}; top: ${sortedTally(g.brands, 8).map(([b, n]) => `${b} ${n}`).join(', ')}`);
  console.log(`  shops with any ${Object.keys(g.byShop).length}; top by offers: ${sortedTally(g.byShop, 8).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  console.log(`  photo ${g.photo} (${pct(g.photo, g.products.length)}), an in stock offer ${g.inStock} (${pct(g.inStock, g.products.length)})`);
  console.log(`  shops per product: ${sortedTally(g.shopsPerProduct).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, n]) => `${k}:${n}`).join(' ')}; at 2 or more: ${g.atTwoOrMore} (${pct(g.atTwoOrMore, g.products.length)})`);
  console.log(`  lowest price bands: ${BANDS.map(([label]) => `${label} ${g.lowestBands[label] ?? 0}`).join(', ')}; median ${g.medianLowest.toFixed(2)}`);
}

function main() {
  const r = buildReport();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  const t = r.totals;
  console.log('Sets and Oils report (prints only, writes nothing)');
  console.log(`products ${t.products} = bottles ${t.bottles} + sets ${t.sets} + oils ${t.oils} (sum ${t.sum}); sets that also carry the Perfume Oil strength: ${t.setsHoldingOilStrength}`);
  printGroup('Bottles', r.bottles, t.products);
  printGroup('Sets', r.sets, t.products);
  const c = r.sets.contents;
  console.log(`  id by barcode ${r.sets.idByBarcode}, by title ${r.sets.idByTitle}`);
  console.log(
    `  contents: list ${c.hasList}, none ${c.none}, one item ${c.oneItem}, an item with no name ${c.bareItem}, only a piece count ${c.onlyPieces}, ` +
      `two or more labelled ${c.twoLabelled}; named bundle ${c.bundleNamed}`,
  );
  printGroup('Oils', r.oils, t.products);
  console.log(`  sizes (ml): ${sortedTally(r.oils.sizes).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, n]) => `${k}:${n}`).join(' ')}`);
  const l = r.listings;
  console.log('\nListings (enabled shops, active, priced)');
  console.log(`  ${l.listings} listings; ${l.setListings} set listings (${l.withDescription} with a description, ${l.describesContents} that say contains, includes or comprises)`);
  console.log(
    `  ${l.oilListings} oil listings: roll on ${l.flags.rollOn} (${l.flags.rollOnTitle} in the title), alcohol free ${l.flags.alcoholFree} (${l.flags.alcoholFreeTitle} in the title), ` +
      `dropper ${l.flags.dropper}, concentrated ${l.flags.concentrated}`,
  );
  console.log(`  turned away but reading like an oil, by shop: ${sortedTally(l.lostOils).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}`);
  console.log(`  turned away but reading like a fragrance set, by shop: ${sortedTally(l.lostSets).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}`);
  console.log('\nThe turned away lists are keyword searches, not decisions: each needs a hand read (plan sections 1.3 and 1.2).');
}

if (import.meta.url === `file://${process.argv[1]}`) main();

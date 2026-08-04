import type { RetailerTier } from '../src/types/retailer.js';
import { CATALOGUE, CRAWLED, type Notes } from './catalogue.generated.js';

/**
 * The app's product list, derived entirely from harvested listings.
 *
 * There is no hand written catalogue any more. Every entry here exists because
 * a shop was selling it when the harvest ran, and every price attached to it
 * came off that shop's own page or feed.
 *
 * `photoUrl` is only ever set when scripts/build-demo-catalogue.ts found an
 * offer from a retailer whose affiliate programme has confirmed we may use its
 * images — see demo/photo.ts. Everything else renders a plain placeholder
 * rather than a stand in illustration: a picture we are not licensed to show
 * and a picture we made up are the same kind of dishonest.
 */

export type { Notes };

export interface DemoFragrance {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  tier: RetailerTier;
  /** How many shops stock it. Doubles as the popularity signal for now. */
  popularity: number;
  photoUrl: string | null;
  /** Only ever notes a source explicitly labelled. Null means genuinely unknown. */
  notes: Notes | null;
}

/**
 * Rough tier, used only to skip shops that cannot plausibly stock something.
 *
 * Price is the honest proxy available today. A real tier belongs on the
 * fragrance record once the matcher and a brand table exist.
 */
function priceTierFor(id: string): RetailerTier {
  const prices = (CRAWLED[id] ?? []).map((o) => o.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  return lowest >= 150 ? 'niche' : 'designer';
}

/**
 * Real, well known Middle Eastern and Arabic perfume houses. This is a named
 * fact about who makes the fragrance, the same kind of thing a brand's own
 * "About" page states, not a guess or an invented category. Lowercased for a
 * case insensitive match.
 */
const MIDEAST_HOUSES = new Set([
  'lattafa', 'rasasi', 'ajmal', 'swiss arabian', 'al haramain', 'nabeel',
  'armaf', 'afnan', 'al rehab', 'nusuk', 'amouage', 'khalis', 'surrati',
  'arabian oud', 'junaid jamshed', 'my perfumes', 'lattafa pride',
]);

export const DEMO_FRAGRANCES: DemoFragrance[] = CATALOGUE.map((entry) => ({
  id: entry.id,
  brand: entry.brand,
  name: entry.name,
  concentration: entry.concentration,
  sizeMl: entry.sizeMl,
  ean: entry.ean,
  tier: priceTierFor(entry.id),
  popularity: entry.shops,
  photoUrl: entry.image,
  notes: entry.notes,
}));

const BY_ID = new Map(DEMO_FRAGRANCES.map((f) => [f.id, f]));
export const fragranceById = (id: string): DemoFragrance | undefined => BY_ID.get(id);

/**
 * Per brand tier, for the Brands page filter. A brand is Middle Eastern when it
 * is a named house from that market, whatever it happens to be priced at today.
 * Otherwise it takes whichever of designer or niche most of its own fragrances
 * in the current catalogue fall under.
 */
export function brandTierFor(brand: string): RetailerTier {
  if (MIDEAST_HOUSES.has(brand.toLowerCase())) return 'mideast';
  const tiers = DEMO_FRAGRANCES.filter((f) => f.brand === brand).map((f) => f.tier);
  const niche = tiers.filter((t) => t === 'niche').length;
  return niche * 2 > tiers.length ? 'niche' : 'designer';
}

/**
 * Ordered for the rail.
 *
 * Products carried by several shops come first, because a comparison across
 * five shops is worth more than a single listing. Cheapest breaks the tie so
 * the front page is not led by a £300 bottle.
 */
export const BY_POPULARITY: DemoFragrance[] = [...DEMO_FRAGRANCES].sort((a, b) => {
  // Different sizes of the same perfume get separate entries (different EAN),
  // so without this a 50ml and a 100ml of the same bottle could land in either
  // order depending on price alone. Where it is genuinely the same brand and
  // name, the larger size leads.
  if (a.brand === b.brand && a.name === b.name && a.sizeMl !== b.sizeMl) {
    return b.sizeMl - a.sizeMl;
  }
  if (b.popularity !== a.popularity) return b.popularity - a.popularity;
  const lowest = (f: DemoFragrance) => Math.min(...(CRAWLED[f.id] ?? []).map((o) => o.price), Infinity);
  return lowest(a) - lowest(b);
});

/** Lowest listed price for a fragrance, before delivery. Infinity when unlisted. */
export function lowestPrice(id: string): number {
  return Math.min(...(CRAWLED[id] ?? []).map((o) => o.price), Infinity);
}

/* ── deals ─────────────────────────────────────────────────────────────────── */

export interface Deal {
  fragrance: DemoFragrance;
  price: number;
  wasPrice: number;
  percentOff: number;
  retailerId: string;
}

/**
 * Every fragrance whose best offer carries a genuine reduction, deepest first.
 *
 * The "was" figure is the merchant's own stated recommended retail price out of
 * their feed, kept only where it is actually above what they are charging (see
 * src/catalogue/awinFeed.ts). Nothing here is computed from a price history we
 * do not have, and a shop that publishes no reference price simply never
 * appears on this page.
 *
 * Percentages round down, matching the rule the rest of the app already
 * follows: a 19.6 per cent saving shows as 19, never as 20.
 */
export const DEALS: Deal[] = DEMO_FRAGRANCES.flatMap((fragrance) => {
  const reduced = (CRAWLED[fragrance.id] ?? [])
    .filter((o) => o.wasPrice !== null && o.wasPrice > o.price)
    .sort((a, b) => a.price - b.price);
  const best = reduced[0];
  if (!best || best.wasPrice === null) return [];
  return [{
    fragrance,
    price: best.price,
    wasPrice: best.wasPrice,
    percentOff: Math.floor((1 - best.price / best.wasPrice) * 100),
    retailerId: best.retailerId,
  }];
}).filter((d) => d.percentOff > 0);

/* ── retailers ─────────────────────────────────────────────────────────────── */

/** Which fragrances a given shop actually lists, most widely stocked first. */
export function fragrancesAt(retailerId: string): DemoFragrance[] {
  return BY_POPULARITY.filter((f) =>
    (CRAWLED[f.id] ?? []).some((o) => o.retailerId === retailerId),
  );
}

/** How many listings a shop contributes. Used for the retailer directory. */
export function listingCountAt(retailerId: string): number {
  let n = 0;
  for (const offers of Object.values(CRAWLED)) {
    if (offers.some((o) => o.retailerId === retailerId)) n++;
  }
  return n;
}

/* ── notes ─────────────────────────────────────────────────────────────────── */

export type NoteLayer = 'top' | 'middle' | 'base';

/** Every distinct note name in the catalogue, with how many fragrances use it. */
export const NOTE_INDEX: { name: string; count: number; layers: Set<NoteLayer> }[] = (() => {
  const map = new Map<string, { name: string; count: number; layers: Set<NoteLayer> }>();
  for (const f of DEMO_FRAGRANCES) {
    if (!f.notes) continue;
    const seen = new Set<string>();
    for (const layer of ['top', 'middle', 'base'] as NoteLayer[]) {
      for (const raw of f.notes[layer]) {
        const name = raw.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        let entry = map.get(key);
        if (!entry) {
          entry = { name, count: 0, layers: new Set() };
          map.set(key, entry);
        }
        entry.layers.add(layer);
        // A note listed in two layers of the same fragrance still counts once.
        if (!seen.has(key)) {
          entry.count++;
          seen.add(key);
        }
      }
    }
  }
  return [...map.values()];
})();

/** Fragrances carrying a given note, optionally restricted to one layer. */
export function fragrancesWithNote(note: string, layer: NoteLayer | 'any'): DemoFragrance[] {
  const needle = note.toLowerCase();
  return BY_POPULARITY.filter((f) => {
    if (!f.notes) return false;
    const layers: NoteLayer[] = layer === 'any' ? ['top', 'middle', 'base'] : [layer];
    return layers.some((l) => f.notes![l].some((n) => n.toLowerCase() === needle));
  });
}

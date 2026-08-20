import type { RetailerTier } from '../src/types/retailer.js';
import { brandTierForName } from '../src/catalogue/brandTier.js';
import { RETAILERS } from '../src/config/retailers.js';
import { brandKey } from '../src/catalogue/brandName.js';
import { CATALOGUE, CRAWLED, type Notes } from './catalogue.generated.js';
import { DEALS_RAW, DEALS_GENERATED_AT as DEALS_GENERATED_AT_RAW } from './deals.generated.js';

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
/**
 * A named Middle Eastern house (see brandTierForName's own MIDEAST_HOUSES
 * doc) is 'mideast' whatever it happens to be priced at, checked first and
 * decisively — this used to fall straight to the price split below with no
 * Middle Eastern case at all, so a mideast-tier-only retailer's own offer
 * (e.g. Emirates Oud, tiers: ['mideast']) never matched this fragrance's own
 * tier and buildComparison's `tier` filter silently dropped it from every
 * tier-filtered view. For a fragrance that retailer was the only seller of,
 * the fragrance read as sold out everywhere despite being genuinely in
 * stock. `tiers: []` is safe to pass here: brandTierForName only reaches its
 * price-derived fallback once the named-house and override checks have both
 * missed, and this call only ever uses its result when one of those hit.
 */
/**
 * Houses that run their own shop, and the tier that shop declares itself to be.
 *
 * A brand's own storefront is better evidence of its segment than a price
 * threshold is. Escentric Molecules is the case that forced this: its shop is
 * `tiers: ['niche']`, but its bottles run £60-£220, so everything under £150
 * came out 'designer' below and then failed `retailer.tiers.includes(tier)` in
 * buildComparison — the house's own products did not match the house's own
 * shop. 43 of its 46 products rendered as "Sold out" while every one of its
 * 118 harvested listings was inStock. Exactly the failure the mideast branch
 * above already exists to prevent, arriving through a different door.
 *
 * Only shops declaring exactly one tier are used, because a shop spanning two
 * says nothing decisive about any single product.
 */
const HOUSE_OWN_TIER = new Map<string, RetailerTier>(
  RETAILERS.flatMap((r) =>
    r.singleBrandOnly && r.tiers.length === 1
      ? [[brandKey(r.singleBrandOnly), r.tiers[0]!] as const]
      : [],
  ),
);

function priceTierFor(id: string, brand: string): RetailerTier {
  const named = brandTierForName(brand, []);
  if (named === 'mideast') return named;
  const own = HOUSE_OWN_TIER.get(brandKey(brand));
  if (own) return own;
  const prices = (CRAWLED[id] ?? []).map((o) => o.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  return lowest >= 150 ? 'niche' : 'designer';
}

export const DEMO_FRAGRANCES: DemoFragrance[] = CATALOGUE.map((entry) => ({
  id: entry.id,
  brand: entry.brand,
  name: entry.name,
  concentration: entry.concentration,
  sizeMl: entry.sizeMl,
  ean: entry.ean,
  tier: priceTierFor(entry.id, entry.brand),
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
  const tiers = DEMO_FRAGRANCES.filter((f) => f.brand === brand).map((f) => f.tier);
  return brandTierForName(brand, tiers);
}

/**
 * Compare two fragrances of the same perfume: smallest bottle first.
 *
 * Ascending, deliberately. 10ml then 30ml then 50ml is how a reader scans a
 * range, and it puts the entry price first rather than leading with the
 * biggest bottle. Falls back to id so the order is fully determined and the
 * build is reproducible.
 */
export function compareVariants(a: DemoFragrance, b: DemoFragrance): number {
  if (a.sizeMl !== b.sizeMl) return a.sizeMl - b.sizeMl;
  return a.id.localeCompare(b.id);
}

/**
 * Ordered for the rail and for every unsorted list.
 *
 * Products carried by several shops come first, because a comparison across
 * five shops is worth more than a single listing. Within one shop count the
 * order is alphabetical: brand, then perfume name, then bottle size.
 *
 * Price used to break the tie ahead of brand, on the reasoning that it kept
 * the front page from being led by a £300 bottle. Removed on the owner's
 * instruction (2026-08-20): the shop count is the ranking claim this page
 * makes, and past that, a reader looking for a specific house wants a
 * predictable A-to-Z, not an ordering that reshuffles every time a shop
 * changes a price. Nothing about the leading rows changes — everything at the
 * top of this list is stocked by many shops, and the tie-break only ever
 * decides the order *inside* one shop count.
 *
 * Every step below is a *total* order, which an older version was not: it
 * compared sizes only when brand and name matched and otherwise compared
 * price, so A could beat B on price, B beat C on price, and C beat A on size.
 * A comparator with a cycle in it lets the sort return effectively any order,
 * which is how Dylan Blue came out 10ml, 50ml, 30ml. Brand then name then
 * compareVariants keeps that property without needing price at all: variants
 * of one perfume share a brand and a name, so only the size step can separate
 * them, and it separates them completely.
 */
export const BY_POPULARITY: DemoFragrance[] = [...DEMO_FRAGRANCES].sort((a, b) => {
  if (b.popularity !== a.popularity) return b.popularity - a.popularity;
  const brandDiff = a.brand.localeCompare(b.brand);
  if (brandDiff !== 0) return brandDiff;
  const nameDiff = a.name.localeCompare(b.name);
  if (nameDiff !== 0) return nameDiff;
  return compareVariants(a, b);
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
 * "Today's Deals" — a fixed snapshot refreshed at most every 6 hours, not
 * recomputed on every hourly build the way everything else here is. See
 * scripts/build-deals.ts's own header comment for why deals move on a
 * schedule instead of reshuffling under a reader mid-visit.
 *
 * deals.generated.ts stores only a fragrance id per deal, resolved against
 * DEMO_FRAGRANCES here rather than the generated file carrying a second,
 * duplicate copy of every discounted fragrance's full record.
 */
export const DEALS_GENERATED_AT = DEALS_GENERATED_AT_RAW;
export const DEALS: Deal[] = DEALS_RAW.flatMap((d) => {
  const fragrance = BY_ID.get(d.fragranceId);
  return fragrance ? [{ ...d, fragrance }] : [];
});

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

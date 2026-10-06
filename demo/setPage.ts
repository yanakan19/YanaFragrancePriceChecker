import { isTooOldToShow } from '../src/services/priceService.js';
import { BY_POPULARITY, fragranceById, shopNameOf, type DemoFragrance } from './data.js';
import { CRAWLED, type CrawledOffer } from './catalogue.generated.js';
import { isOil, isSet } from './productKind.js';

/**
 * What a set's page and an oil's page say beyond the shared product page
 * (docs/GIFT-SETS-AND-OILS-PLAN.md, 2.5): pure functions over the catalogue, so a
 * Node test can read them. demo/app.ts draws the markup. A bottle's page calls
 * none of this.
 */

/** An offer a reader could use today: in the list the page shows, in stock, not a pre-order. */
const buyable = (o: CrawledOffer): boolean => (o.stock === 'inStock' || o.stock === 'lowStock') && !isTooOldToShow(o.fetchedAt);

export interface ValueLine {
  /** The shop that sells both. */
  shopId: string;
  shopName: string;
  setPrice: number;
  bottlePrice: number;
  bottle: DemoFragrance;
}

/**
 * The one comparison a set's page may make with a single bottle, and only where it
 * is honest: the set's main bottle is exactly one catalogue bottle (giftSet.bottleId),
 * and a shop sells both the set and that bottle in stock. Both figures are that one
 * shop's item prices, so the shop's own differences cancel. Where several shops sell
 * both, the shop with the lowest set price. Null otherwise.
 *
 * It is two prices, never a percentage and never a saving: it can go the other way
 * (the set dearer than the bottle alone), and says so by showing both figures.
 */
export function valueLine(f: Pick<DemoFragrance, 'id' | 'giftSet'>): ValueLine | null {
  const bottleId = f.giftSet?.bottleId;
  if (!bottleId) return null;
  const bottle = fragranceById(bottleId);
  if (!bottle || bottle.giftSet !== null || isOil(bottle)) return null;
  const bottleAt = new Map<string, number>();
  for (const o of CRAWLED[bottleId] ?? []) if (buyable(o) && o.price > 0) bottleAt.set(o.retailerId, Math.min(o.price, bottleAt.get(o.retailerId) ?? Infinity));
  let best: ValueLine | null = null;
  for (const o of CRAWLED[f.id] ?? []) {
    if (!buyable(o) || o.price <= 0) continue;
    const bottlePrice = bottleAt.get(o.retailerId);
    if (bottlePrice === undefined) continue;
    if (best === null || o.price < best.setPrice) best = { shopId: o.retailerId, shopName: shopNameOf(o.retailerId), setPrice: o.price, bottlePrice, bottle };
  }
  return best;
}

/** Other sets of the same brand and scent words, most widely stocked first, at most `limit`. */
export function siblingSets(f: Pick<DemoFragrance, 'id' | 'brand' | 'giftSet'>, limit = 6): DemoFragrance[] {
  const scent = f.giftSet?.scent;
  if (!scent) return [];
  const out: DemoFragrance[] = [];
  for (const other of BY_POPULARITY) {
    if (other.id === f.id || other.brand !== f.brand || other.giftSet?.scent !== scent) continue;
    out.push(other);
    if (out.length >= limit) break;
  }
  return out;
}

/** The shop's own title for a set at a shop, where the set is sold by two shops or more. */
export function shopTitleOf(f: Pick<DemoFragrance, 'id' | 'giftSet'>, retailerId: string): string | null {
  if (!f.giftSet) return null;
  const offers = CRAWLED[f.id] ?? [];
  if (offers.length < 2) return null;
  const own = offers.find((o) => o.retailerId === retailerId);
  return own ? (own.title ?? f.giftSet.title) : null;
}

/** Other sizes of the same oil: the same brand and name, nearest the size shown first. */
export function otherOilSizes(f: Pick<DemoFragrance, 'id' | 'brand' | 'name' | 'sizeMl'>, limit = 6): DemoFragrance[] {
  const out = BY_POPULARITY.filter((o) => o.id !== f.id && isOil(o) && o.brand === f.brand && o.name === f.name);
  const at = f.sizeMl ?? 0;
  return out.sort((a, b) => Math.abs((a.sizeMl ?? 0) - at) - Math.abs((b.sizeMl ?? 0) - at) || (a.sizeMl ?? 0) - (b.sizeMl ?? 0)).slice(0, limit);
}

/** The spray bottle of an oil's scent, for "The spray version"; null where there is none (or the link points at a non bottle). */
export function sprayVersion(f: Pick<DemoFragrance, 'oil'>): DemoFragrance | null {
  const id = f.oil?.sprayId;
  if (!id) return null;
  const spray = fragranceById(id);
  return spray && !isSet(spray) && !isOil(spray) ? spray : null;
}

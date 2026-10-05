import type { DemoFragrance } from './data.js';

/**
 * What a catalogue product is: a bottle, a set or an oil. The one place that
 * says so (docs/GIFT-SETS-AND-OILS-PLAN.md, section 4.1), so the Sets and Oils
 * tabs, Most Stocked, the Deals page and the social posts cannot disagree.
 *
 *   - A set carries a `giftSet` record (src/catalogue/giftSet.ts). Gift sets,
 *     miniature and discovery sets, and bundles of full bottles are all sets.
 *   - An oil has the strength `Perfume Oil` and is not a set. Three products
 *     are both a set and carry that strength (a set holding an oil); a set
 *     wins, so a product is never counted as two kinds.
 *   - Everything else is a bottle.
 *
 * Kept free of anything that reads the catalogue, so a script can import it.
 */
export type ProductKind = 'bottle' | 'set' | 'oil';

type KindFields = Pick<DemoFragrance, 'concentration' | 'giftSet'>;

export function isSet(f: Pick<DemoFragrance, 'giftSet'>): boolean {
  return f.giftSet !== null;
}

export function isOil(f: KindFields): boolean {
  return f.giftSet === null && f.concentration === 'Perfume Oil';
}

export function productKind(f: KindFields): ProductKind {
  if (f.giftSet !== null) return 'set';
  return f.concentration === 'Perfume Oil' ? 'oil' : 'bottle';
}

/**
 * Whether a product may be the subject of a post about one bottle's price: the
 * daily deal post and the savings post. A set has no single bottle price to
 * compare with a house's price, and an oil is sold on a scale that does not
 * compare with a spray, so neither is ever chosen.
 */
export function eligibleForBottlePosts(f: KindFields): boolean {
  return productKind(f) === 'bottle';
}

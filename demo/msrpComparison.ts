import { roundPence } from '../src/services/money.js';

/**
 * Which side of the fragrance house's own price one shop's bottle price sits
 * on, and by how much — the figure printed as "12% below MSRP" / "30% above
 * MSRP" on the small second line of an offer row.
 *
 * ── Why this exists next to buildHouseAnchor rather than inside it ──────────
 *
 * `buildHouseAnchor` (src/services/discount.ts) answers a narrower question:
 * "is there a saving against the house worth advertising?", and by design it
 * returns null the moment the house is *not* the more expensive side. That is
 * correct for what reads it — a deal tile, where the whole claim is a saving —
 * and it is why the fragrance page could only ever say "below MSRP". A shop
 * charging £39 for a bottle whose house sells it at £30 simply rendered
 * nothing, which reads as "no comparison exists" when in fact the comparison
 * exists and is unflattering. Measured over the whole shipped catalogue on
 * 2026-09-01, applying `houseAnchorFor`'s own two exclusions (no ceiling; the
 * house's own storefront row): 411 offer rows can be compared to a house
 * ceiling at all. 324 sit at least a whole percent below it, 32 land inside
 * one percent either way and are rightly silent — and 55, across 39 products,
 * sit at least a whole percent *above* it and rendered nothing at all. That
 * is one in seven comparable rows dropping the only reference price the page
 * had for them, in the one direction a shopper most needs to be told about.
 *
 * So this states the fact in both directions and leaves the judgement of what
 * to do with it to the caller, rather than widening `buildHouseAnchor`, whose
 * "a saving, or nothing" contract the deal builder depends on.
 *
 * ── The rules, and why each one is the honest choice ────────────────────────
 *
 *   - The price passed in must be the *item* price, never a delivered one.
 *     `houseCeilingGbp` is what the house charges for the bottle, with its own
 *     delivery on top; comparing a delivered price against it would compare a
 *     bottle-plus-postage against a bottle and inflate every "above" and
 *     deflate every "below". `offerRow` prints this percentage on the same
 *     line as the item price precisely so a reader can check the arithmetic.
 *
 *   - The percentage is always relative to the house's price, in both
 *     directions: below is (msrp - item) / msrp, above is (item - msrp) / msrp.
 *     One denominator, so "10% below" and "10% above" are the same distance
 *     from the same figure and the two readings cannot be compared unfairly.
 *
 *   - Floored, never rounded up — the same rule `buildDiscount` and
 *     `buildHouseAnchor` already keep, and for the same reason applied to both
 *     sides here: flooring understates a saving (a CPR pricing-claims matter)
 *     *and* understates a mark-up (a claim about a shop we would not want to
 *     overstate either). 19.6% displays as 19% whichever way it points.
 *
 *   - Anything under one whole percent is no comparison at all, not "0%".
 *     This is what keeps a shop that matches the house's price exactly — or
 *     misses it by a penny, which the catalogue is full of — from rendering
 *     "0% below MSRP". Returning null here is the single guarantee that a
 *     zero can never be printed.
 *
 *   - Exactly one direction, or none. The return is one object with one
 *     `direction`, so no caller can end up holding a "below" and an "above"
 *     for the same row and render both.
 *
 * Lives in its own module rather than in demo/app.ts so it can be unit tested
 * directly: app.ts calls init() at import time, so nothing in it is importable
 * from a plain Node test. Same reason as demo/priceDeliveryNote.ts and
 * demo/deliveryFacts.ts.
 */
export interface MsrpComparison {
  /** Which side of the house's own price this shop sits on. Never both. */
  direction: 'below' | 'above';
  /** Whole percent against the house's price, floored. Always >= 1. */
  percent: number;
}

export function msrpComparison(
  itemPriceGbp: number,
  houseCeilingGbp: number,
): MsrpComparison | null {
  if (!Number.isFinite(itemPriceGbp) || !Number.isFinite(houseCeilingGbp)) return null;
  // A ceiling of zero or less is not a price to compare against, and dividing
  // by it would produce Infinity rather than a refusal.
  if (houseCeilingGbp <= 0) return null;

  const gap = roundPence(itemPriceGbp - houseCeilingGbp);
  if (Math.abs(gap) < 0.01) return null;

  const percent = Math.floor((Math.abs(gap) / houseCeilingGbp) * 100);
  if (percent < 1) return null;

  return { direction: gap < 0 ? 'below' : 'above', percent };
}

/** The row's own words for the comparison, e.g. "12% below MSRP". */
export function msrpComparisonLabel(c: MsrpComparison): string {
  return `${c.percent}% ${c.direction} MSRP`;
}

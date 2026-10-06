import type { PresentedOffer } from '../src/types/offer.js';

/**
 * A product page's offers in the order they are shown. Four groups, each
 * strictly cheapest first (owner feedback, 2026-10-01):
 *
 *   delivered     buyable, delivery included
 *   plusDelivery  buyable, the shop states no delivery cost (its own
 *                 "Delivery not included" section, because its price cannot
 *                 be compared with an all in one)
 *   gone          sold out
 *   preOrder      the shop sells it but is not shipping it yet (its own
 *                 Pre-Order statement), under the sold out rows: neither can be
 *                 bought today, so neither is ever in the Cheapest tag, the
 *                 count in the heading or any in stock figure (owner's
 *                 request, 2026-10-04)
 *
 * ── Why there is no "Older prices" group (owner's decision, 2026-10-03) ─────
 * For one morning, offers last checked over ten days ago sat in a
 * group of their own below the current ones. The owner's call the same day:
 * every listed offer belongs in the one list, sorted by delivered price, each
 * row saying its own age in its facts line, and the Cheapest tag goes on the
 * cheapest listed buyable row whatever its age (bestOffer no longer passes an
 * older offer over). So no cheaper row can ever sit above the Cheapest row:
 * the tagged row is the first row of the delivered group, or, where no shop
 * states its delivery cost, the first of the plusDelivery group. Offers too
 * old to trust are still not listed at all (HIDE_OFFER_AFTER_DAYS).
 *
 * The shared sort in priceService ranks stock state before price, which put a
 * cheaper Low stock row under a dearer In stock one; within a group the price
 * alone decides. Shared by detailView and the wrong price report, so the
 * report's shop list reads in the same order as the page above it.
 */
export interface OfferGroups {
  delivered: PresentedOffer[];
  plusDelivery: PresentedOffer[];
  gone: PresentedOffer[];
  preOrder: PresentedOffer[];
}

const byPrice = (a: PresentedOffer, b: PresentedOffer): number =>
  (a.deliveredPriceGbp ?? a.itemPriceGbp) - (b.deliveredPriceGbp ?? b.itemPriceGbp) ||
  a.itemPriceGbp - b.itemPriceGbp ||
  a.retailer.name.localeCompare(b.retailer.name);

export function offerGroups(rows: readonly PresentedOffer[]): OfferGroups {
  const live = rows.filter((r) => r.isPurchasable);
  return {
    delivered: live.filter((r) => r.deliveredPriceGbp !== null).sort(byPrice),
    plusDelivery: live.filter((r) => r.deliveredPriceGbp === null).sort(byPrice),
    gone: rows.filter((r) => !r.isPurchasable && r.stock !== 'preOrder').sort(byPrice),
    preOrder: rows.filter((r) => r.stock === 'preOrder').sort(byPrice),
  };
}

/** Every group in page order, for anything listing the shops as the page does. */
export function offersInPageOrder(groups: OfferGroups): PresentedOffer[] {
  return [...groups.delivered, ...groups.plusDelivery, ...groups.gone, ...groups.preOrder];
}

/**
 * The heading above a product page's offers: every listed buyable row counts,
 * whatever its age (owner's decision, 2026-10-03). Empty when nothing can be
 * bought, which hides the heading.
 */
export function availabilityHeading(groups: Pick<OfferGroups, 'delivered' | 'plusDelivery'>): string {
  const n = groups.delivered.length + groups.plusDelivery.length;
  return n > 0 ? `Available at (${n} ${n === 1 ? 'Shop' : 'Shops'})` : '';
}

/**
 * How long ago a listing was last checked, as the short value at the end of
 * its facts line and the full sentence a screen reader gets in its place
 * (owner request, 6 Oct 2026). Every row states its own age, from its own
 * checked time; the page no longer carries one "last checked" line.
 *
 * Short values: "Now" under 90 seconds, "45m" under an hour, "9h" up to 23
 * hours, then whole days, "1d" to "7d" (nothing older than
 * HIDE_OFFER_AFTER_DAYS is shown at all, so the day count stays small).
 */
export function offerAge(ageSeconds: number): { short: string; long: string } {
  if (ageSeconds < 90) return { short: 'Now', long: 'checked just now' };
  const m = Math.round(ageSeconds / 60);
  if (m < 60) return { short: `${m}m`, long: `checked ${m} ${m === 1 ? 'minute' : 'minutes'} ago` };
  const h = Math.round(m / 60);
  if (h < 24) return { short: `${h}h`, long: `checked ${h} ${h === 1 ? 'hour' : 'hours'} ago` };
  const d = Math.round(h / 24);
  return { short: `${d}d`, long: `checked ${d} ${d === 1 ? 'day' : 'days'} ago` };
}

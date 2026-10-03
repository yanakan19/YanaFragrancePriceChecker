import type { PresentedOffer } from '../src/types/offer.js';

/**
 * A product page's offers in the order they are shown. Three groups, each
 * strictly cheapest first (owner feedback, 2026-10-01):
 *
 *   delivered     buyable, delivery included
 *   plusDelivery  buyable, the shop states no delivery cost (its own
 *                 "Delivery not included" section, because its price cannot
 *                 be compared with an all in one)
 *   gone          sold out
 *
 * ── Why there is no "Older prices" group (owner's decision, 2026-10-03) ─────
 * For one morning, offers last checked over STALE_OFFER_DAYS ago sat in a
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
    gone: rows.filter((r) => !r.isPurchasable).sort(byPrice),
  };
}

/** Every group in page order, for anything listing the shops as the page does. */
export function offersInPageOrder(groups: OfferGroups): PresentedOffer[] {
  return [...groups.delivered, ...groups.plusDelivery, ...groups.gone];
}

/**
 * The heading above a product page's offers: every listed buyable row counts,
 * whatever its age (owner's decision, 2026-10-03). Empty when nothing can be
 * bought, which hides the heading.
 */
export function availabilityHeading(groups: Pick<OfferGroups, 'delivered' | 'plusDelivery'>): string {
  const n = groups.delivered.length + groups.plusDelivery.length;
  return n > 0 ? `Available at (${n} ${n === 1 ? 'shop' : 'shops'})` : '';
}

/**
 * Whether a row's facts line states its age: every row last checked more
 * than about a day ago. The page caption gives the freshest age, so a row
 * checked within the day says nothing extra.
 */
export const ROW_AGE_AFTER_SECONDS = 24 * 60 * 60;
export function rowShowsAge(row: Pick<PresentedOffer, 'ageSeconds'>): boolean {
  return row.ageSeconds > ROW_AGE_AFTER_SECONDS;
}

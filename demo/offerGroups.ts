import type { PresentedOffer } from '../src/types/offer.js';

/**
 * A product page's offers in the order they are shown. Four groups, each
 * strictly cheapest first (owner feedback, 2026-10-01):
 *
 *   delivered     buyable, checked within STALE_OFFER_DAYS, delivery included
 *   plusDelivery  buyable, checked within STALE_OFFER_DAYS, the shop states no
 *                 delivery cost (its own "Delivery not included" section,
 *                 because its price cannot be compared with an all in one)
 *   older         buyable, but last checked more than STALE_OFFER_DAYS ago
 *                 (the "Older prices" section, each row saying how long ago)
 *   gone          sold out
 *
 * ── Why "older" is its own group (owner's decision, 2026-10-03) ─────────────
 * An offer older than STALE_OFFER_DAYS can never be tagged Cheapest (see
 * preferFreshOffers in src/services/priceService.ts). When it sat in the
 * delivered group sorted by price, a cheaper 10 to 21 day old Perfumeo or
 * Justmylook row landed ABOVE the row tagged Cheapest on 4 of the 5 most
 * stocked products, which read as a bug. The owner's view: older prices,
 * cheaper or dearer, are history, not today's comparison. So they go below
 * every current offer, under their own heading, and onto the price graph
 * (demo/priceHistoryChart.ts). Nothing older can therefore ever sit above the
 * Cheapest row: when at least one current offer exists the Cheapest row is
 * one of them, and when none does the Cheapest row is the first older one.
 *
 * The older group keeps the delivered sort's rule inside itself: a row with a
 * stated delivery cost ranks above one without, then price decides, which is
 * the same order bestOffer picks from when every buyable offer is old.
 *
 * The shared sort in priceService ranks stock state before price, which put a
 * cheaper Low stock row under a dearer In stock one; within a group the price
 * alone decides. Shared by detailView and the wrong price report, so the
 * report's shop list reads in the same order as the page above it.
 */
export interface OfferGroups {
  delivered: PresentedOffer[];
  plusDelivery: PresentedOffer[];
  older: PresentedOffer[];
  gone: PresentedOffer[];
}

const byPrice = (a: PresentedOffer, b: PresentedOffer): number =>
  (a.deliveredPriceGbp ?? a.itemPriceGbp) - (b.deliveredPriceGbp ?? b.itemPriceGbp) ||
  a.itemPriceGbp - b.itemPriceGbp ||
  a.retailer.name.localeCompare(b.retailer.name);

export function offerGroups(rows: readonly PresentedOffer[], best: PresentedOffer | null = null): OfferGroups {
  const live = rows.filter((r) => r.isPurchasable);
  const current = live.filter((r) => !r.stale);
  const older = live
    .filter((r) => r.stale)
    .sort(
      (a, b) =>
        // When every buyable offer is old, bestOffer picks one of these, and
        // its own order also weighs stock (an unconfirmed row ranks below an
        // in stock one). Leading with it keeps the promise above: no older
        // row ever sits above the row tagged Cheapest.
        Number(b === best) - Number(a === best) ||
        Number(a.deliveredPriceGbp === null) - Number(b.deliveredPriceGbp === null) ||
        byPrice(a, b),
    );
  return {
    delivered: current.filter((r) => r.deliveredPriceGbp !== null).sort(byPrice),
    plusDelivery: current.filter((r) => r.deliveredPriceGbp === null).sort(byPrice),
    older,
    gone: rows.filter((r) => !r.isPurchasable).sort(byPrice),
  };
}

/** Every group in page order, for anything listing the shops as the page does. */
export function offersInPageOrder(groups: OfferGroups): PresentedOffer[] {
  return [...groups.delivered, ...groups.plusDelivery, ...groups.older, ...groups.gone];
}

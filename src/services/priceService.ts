import type { PresentedOffer, RawOffer, StockState } from '../types/offer.js';
import type { Retailer, RetailerTier } from '../types/retailer.js';
import { RETAILERS, getRetailer } from '../config/retailers.js';
import { resolveDelivery } from './shipping.js';
import { buildDiscount } from './discount.js';
import { buildOutboundLink } from './affiliate.js';
import { roundPence } from './money.js';

/**
 * Turns raw captured offers into the ordered comparison rows the UI renders.
 *
 * The whole point of this module is that a row can be trusted: the price is
 * what the retailer is charging, the discount is the retailer's own, the
 * delivery cost is the one that will appear at checkout, and an item that
 * cannot be bought is not sitting at the top of the table.
 */

/** Which price the table sorts on. */
export type SortKey =
  /** Item price plus delivery. The default, and the honest one. */
  | 'delivered'
  /** Item price alone, ignoring delivery. */
  | 'item';

export interface ComparisonOptions {
  sortBy?: SortKey;
  /** Restrict to retailers that stock this catalogue segment. */
  tier?: RetailerTier;
  /** Drop out-of-stock rows entirely instead of grouping them at the bottom. */
  hideOutOfStock?: boolean;
  /** Injected for deterministic tests. */
  now?: Date;
}

/**
 * Sort weight for stock state.
 *
 * Only three tiers, and the coarseness is the point. Every state that is a
 * positive signal of availability shares tier 0, so price decides between them
 * — an earlier version ranked `lowStock` below `inStock`, which buried a
 * cheaper low-stock listing beneath a dearer in-stock one and made the table
 * look broken (£108 above £105). Low stock is still stock.
 *
 * `unknown` sits below confirmed availability but above out-of-stock: a page we
 * could not parse is not evidence the product is gone, so demoting it to the
 * bottom would misrepresent the retailer, while promoting it to compete on
 * price would overstate what we know.
 *
 * Only an explicit out-of-stock signal reaches the bottom.
 */
const STOCK_RANK: Record<StockState, number> = {
  inStock: 0,
  lowStock: 0,
  preOrder: 0,
  unknown: 1,
  outOfStock: 2,
};

/** Only an explicit out-of-stock signal makes a row unbuyable. */
export function isPurchasable(stock: StockState): boolean {
  return stock !== 'outOfStock';
}

/**
 * How old a captured price can be before it stops being eligible to headline
 * as "Cheapest" or as a Today's Deal — see `preferFreshOffers` below and
 * `dealCandidateForOffer`'s caller in scripts/build-deals.ts.
 *
 * Chosen from the real distribution measured across data/catalogue/ on
 * 2026-09-01 (the John Lewis case this exists for: its only working harvest
 * route had failed 10 consecutive times, and 4 of its 5 listings had been
 * sitting unconfirmed on the live site for 10.6 days with nothing saying so).
 * Restricted to shops actually published (`retailer.enabled`), which is what
 * a reader can ever see:
 *
 *   - At the shop level, a large, actively-harvested catalogue legitimately
 *     carries some fraction of its own listings well past a week old — its
 *     crawl budget does not reach every SKU on every run, not because
 *     anything is broken. Four such shops (beautybase, justmylook,
 *     allbeauty, lookfantastic) were measured with a `lastSeenAt` spread
 *     from under a day up to 25-30 days on some fraction of their own
 *     listings, while the *same* shop's newest listing was under a day old —
 *     proof the harvest route is working, just not exhaustive on every pass.
 *     A threshold has to tolerate that or it fires on a healthy shop, which
 *     is a bug, not a safety feature.
 *   - At 7 days, 3,570 published offers (12 shops) already sit past it,
 *     including 1,885 of beautybase's own — most of that shop's own normal,
 *     healthy long tail, not a broken one. 989 fragrances would lose every
 *     visible offer if stale offers were hidden outright at that point (they
 *     are not — see `preferFreshOffers` — but it is the honest measure of
 *     how much of the catalogue is still mid-cycle at 7 days).
 *   - By 10 days that healthy-shop noise has mostly cleared: 652 offers
 *     across 12 shops remain, and only 152 fragrances would lose every
 *     visible offer under the same hypothetical, almost all of them shops
 *     whose *entire* listed catalogue shares one frozen `lastSeenAt` (the
 *     signature of a dead harvest route, not a long tail) — John Lewis
 *     (10.6d, all 5 listings), superdrug (10.6d flat, all 112) and zara
 *     (10.4d flat, all 8) among them.
 *   - 10 days is also the largest whole number that still catches today's
 *     John Lewis case at all: at 11 days it and superdrug and zara all drop
 *     out of the measurement (their offers are 10.4-10.6 days old), which
 *     would mean shipping a fix that does not fire on the case that
 *     motivated it.
 *
 * Full measurement, both site-wide and per-shop, is not repeated here as a
 * comment — see the commit that introduced this constant for the numbers at
 * every threshold from 2 to 30 days.
 */
export const STALE_OFFER_DAYS = 10;

const STALE_OFFER_SECONDS = STALE_OFFER_DAYS * 24 * 60 * 60;

/** Whether a captured price is older than `STALE_OFFER_DAYS`. Never negative. */
export function isStaleFetch(fetchedAt: string, now: Date = new Date()): boolean {
  const fetchedMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedMs)) return false;
  return now.getTime() - fetchedMs > STALE_OFFER_SECONDS * 1000;
}

/** Attach retailer context, delivery, discount and outbound link to one offer. */
export function presentOffer(
  offer: RawOffer,
  retailer: Retailer,
  now: Date = new Date(),
): PresentedOffer {
  const itemPriceGbp = roundPence(offer.price);
  const delivery = resolveDelivery(retailer, itemPriceGbp);
  const link = buildOutboundLink(retailer, offer.url);
  const fetchedMs = Date.parse(offer.fetchedAt);

  return {
    retailer,
    variantId: offer.variantId,
    itemPriceGbp,
    // Null delivery cost means null delivered price. Substituting the item
    // price here would read on screen as "delivery is free", which is the one
    // thing we know we cannot say about this shop.
    deliveredPriceGbp:
      delivery.costGbp === null ? null : roundPence(itemPriceGbp + delivery.costGbp),
    currency: 'GBP',
    discount: buildDiscount(offer),
    delivery,
    stock: offer.stock,
    isPurchasable: isPurchasable(offer.stock),
    outboundUrl: link.url,
    isAffiliateLink: link.isAffiliateLink,
    imageUrl: offer.imageUrl ?? null,
    fetchedAt: offer.fetchedAt,
    ageSeconds: Number.isFinite(fetchedMs)
      ? Math.max(0, Math.round((now.getTime() - fetchedMs) / 1000))
      : 0,
    stale: isStaleFetch(offer.fetchedAt, now),
    rating: offer.rating ?? null,
  };
}

/**
 * Build the ordered comparison table for one variant.
 *
 * Ordering, in priority order:
 *   1. stock — buyable rows first, explicit out-of-stock last;
 *   2. under the delivered sort only, whether a delivered price exists at all
 *      — every shop that states its delivery cost ranks above every shop that
 *      does not;
 *   3. price — delivered by default, item price if asked;
 *   4. the other price, as a tiebreak;
 *   5. retailer name, so the order is stable rather than input-dependent.
 *
 * Step 2 is what makes it safe to show a shop whose delivery cost is unknown.
 * Sorting the table on delivered price while one row has no delivered price
 * has only two honest answers: leave that shop out, or rank it strictly below
 * everything that can be compared. This takes the second. Unknown-delivery
 * rows are ordered among themselves by item price — the only figure they have
 * — and can never be read as beating a row whose true, all-in cost is known,
 * however low their item price is.
 *
 * The item sort is untouched by all of this: item price is known for every
 * retailer, so there is nothing there to demote.
 */
export function buildComparison(
  offers: readonly RawOffer[],
  options: ComparisonOptions = {},
): PresentedOffer[] {
  const { sortBy = 'delivered', tier, hideOutOfStock = false, now = new Date() } = options;

  const rows: PresentedOffer[] = [];
  for (const offer of offers) {
    const retailer = getRetailer(offer.retailerId);
    // An offer from an unknown or disabled retailer is dropped rather than
    // rendered without any shipping rules at all. A retailer that is in the
    // registry but has not stated its delivery cost is a different case and is
    // kept: it renders as "delivery not stated" and is demoted below every
    // comparable row rather than being hidden.
    if (!retailer || !retailer.enabled) continue;
    if (tier && !retailer.tiers.includes(tier)) continue;
    if (hideOutOfStock && offer.stock === 'outOfStock') continue;
    rows.push(presentOffer(offer, retailer, now));
  }

  // 0 for a row we can compare on delivered price, 1 for one we cannot. Only
  // applied under the delivered sort; under the item sort there is nothing
  // unknown to demote.
  const deliveryRank = (o: PresentedOffer) =>
    sortBy === 'item' || o.deliveredPriceGbp !== null ? 0 : 1;
  // Falling back to the item price is safe *only* because deliveryRank has
  // already separated the two groups: an unknown-delivery row is never
  // compared against a known-delivery one here, so its item price can order it
  // among its own kind without ever being mistaken for a delivered price.
  const primary = (o: PresentedOffer) =>
    sortBy === 'item' ? o.itemPriceGbp : o.deliveredPriceGbp ?? o.itemPriceGbp;
  const secondary = (o: PresentedOffer) =>
    sortBy === 'item' ? o.deliveredPriceGbp ?? o.itemPriceGbp : o.itemPriceGbp;

  return rows.sort(
    (a, b) =>
      STOCK_RANK[a.stock] - STOCK_RANK[b.stock] ||
      deliveryRank(a) - deliveryRank(b) ||
      primary(a) - primary(b) ||
      secondary(a) - secondary(b) ||
      a.retailer.name.localeCompare(b.retailer.name),
  );
}

/** The rows a user can actually buy from, in order. */
export function purchasableOffers(rows: readonly PresentedOffer[]): PresentedOffer[] {
  return rows.filter((r) => r.isPurchasable);
}

/** The out-of-stock rows, which render as a separate group at the bottom. */
export function outOfStockOffers(rows: readonly PresentedOffer[]): PresentedOffer[] {
  return rows.filter((r) => !r.isPurchasable);
}

/**
 * Buyable rows that are not stale-priced (see `STALE_OFFER_DAYS`), falling
 * back to every buyable row when none of them are fresh.
 *
 * Nothing is ever hidden by this — a fragrance whose every offer is stale
 * still lists every one of them, exactly as harvested. What changes is which
 * offer is *eligible to be called the cheapest*: `bestOffer` and
 * `cheapestVerdict` both draw from this instead of `purchasableOffers`
 * directly, so a shop whose price has not been reconfirmed in over
 * `STALE_OFFER_DAYS` cannot outrank a fresher, possibly costlier, offer for
 * the headline. The fallback (stale-only) case is the same shape as the
 * unknown-delivery fallback just below: naming the one price on record beats
 * showing nothing, and the row itself still carries `stale: true` for the UI
 * to say so.
 */
export function preferFreshOffers(rows: readonly PresentedOffer[]): PresentedOffer[] {
  const buyable = purchasableOffers(rows);
  const fresh = buyable.filter((r) => !r.stale);
  return fresh.length > 0 ? fresh : buyable;
}

/**
 * The cheapest buyable row. Out-of-stock offers are never eligible, however
 * cheap — headlining a price nobody can pay is the classic comparison-site lie.
 *
 * A row whose retailer does not state a delivery cost is not eligible either,
 * for the same reason: the headline is read as "this is the cheapest way to
 * buy it", and a shop whose all-in cost is unknown cannot be shown to be the
 * cheapest anything. The rule is enforced here and not left to the sort, so it
 * holds whichever order the caller built the rows in.
 *
 * Nor is a stale-priced row (see `preferFreshOffers`), for the same reason
 * again: "cheapest" is a claim about the price *today*, and a figure nobody
 * has reconfirmed in over `STALE_OFFER_DAYS` is not evidence of today's price,
 * only of what it was then.
 *
 * The one case where an ineligible row is returned regardless is when it is
 * the only kind there is: with no comparable offer to displace it, naming the
 * shop that does have it is more use than showing nothing, and the UI labels
 * it accordingly (delivery not stated, or its own captured age) rather than
 * as an unqualified winning price.
 */
export function bestOffer(rows: readonly PresentedOffer[]): PresentedOffer | null {
  const buyable = preferFreshOffers(rows);
  return buyable.find((r) => r.deliveredPriceGbp !== null) ?? buyable[0] ?? null;
}

export { RETAILERS, getRetailer };

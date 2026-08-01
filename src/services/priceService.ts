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
 * Anything with a positive or unread signal sits above anything explicitly
 * unavailable. `unknown` ranks below confirmed availability but above
 * out-of-stock, because a page we could not parse is not evidence the product
 * is gone — demoting it to the bottom would misrepresent the retailer.
 */
const STOCK_RANK: Record<StockState, number> = {
  inStock: 0,
  lowStock: 1,
  preOrder: 2,
  unknown: 3,
  outOfStock: 4,
};

/** Only an explicit out-of-stock signal makes a row unbuyable. */
export function isPurchasable(stock: StockState): boolean {
  return stock !== 'outOfStock';
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
    deliveredPriceGbp: roundPence(itemPriceGbp + delivery.costGbp),
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
  };
}

/**
 * Build the ordered comparison table for one variant.
 *
 * Ordering, in priority order:
 *   1. stock — buyable rows first, explicit out-of-stock last;
 *   2. price — delivered by default, item price if asked;
 *   3. the other price, as a tiebreak;
 *   4. retailer name, so the order is stable rather than input-dependent.
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
    // rendered without its shipping rules — a row with no delivery cost would
    // undercut every honest row in the table.
    if (!retailer || !retailer.enabled) continue;
    if (tier && !retailer.tiers.includes(tier)) continue;
    if (hideOutOfStock && offer.stock === 'outOfStock') continue;
    rows.push(presentOffer(offer, retailer, now));
  }

  const primary = (o: PresentedOffer) =>
    sortBy === 'item' ? o.itemPriceGbp : o.deliveredPriceGbp;
  const secondary = (o: PresentedOffer) =>
    sortBy === 'item' ? o.deliveredPriceGbp : o.itemPriceGbp;

  return rows.sort(
    (a, b) =>
      STOCK_RANK[a.stock] - STOCK_RANK[b.stock] ||
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
 * The cheapest buyable row. Out-of-stock offers are never eligible, however
 * cheap — headlining a price nobody can pay is the classic comparison-site lie.
 */
export function bestOffer(rows: readonly PresentedOffer[]): PresentedOffer | null {
  return purchasableOffers(rows)[0] ?? null;
}

export { RETAILERS, getRetailer };

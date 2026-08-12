import type { StoredListing } from './types.js';
import { lookupLivePrice, type ShopifyPriceIndex } from './shopifyPriceIndex.js';

/**
 * Replace an affiliate feed's price with the merchant's own storefront price.
 *
 * ── The measurement this exists to answer ────────────────────────────────────
 * MyBeauty.Boutique's Awin feed carries exactly one price column,
 * `search_price` — no rrp_price, store_price, display_price, base_price,
 * saving or savings_percent anywhere in it (confirmed off the wire, see the
 * header of awinFeed.ts). So there was no better column to map and no parser
 * bug to fix. The open question was whether that single column is *right*.
 *
 * It is not. "Price verification" run 1 (job 94286860783, 2026-08-12) keyed
 * 8,902 of that merchant's 8,908 stored listings to a live variant on its own
 * Shopify storefront and compared them:
 *
 *     agree      2,613   (29.4%)
 *     disagree   6,289   (70.6%)
 *     of which overstated 6,245, understated 44
 *
 * A stale snapshot drifts in both directions roughly evenly. 6,245 against 44
 * is not drift, it is a systematic offset: the feed publishes a price above
 * what the shop charges, on seven listings in ten. That matches the one case a
 * human had already found by hand — search_price 77.99 against a live £20.49 —
 * and it matches an independent, network-free check: of MyBeauty offers on
 * products at least three shops stock, 78 of 542 are priced at or above twice
 * the median of the other shops.
 *
 * ── Why correcting beats disabling ───────────────────────────────────────────
 * The merchant hands us a bad price and a good one. `search_price` is bad;
 * `/products.json` on the same merchant's storefront is the price a customer
 * actually pays, published by the same shop, keyed to the same variant id the
 * feed row already carries. Dropping the retailer would remove 4,511 offers —
 * 23.8% of everything on the site — to solve a problem the merchant themselves
 * publishes the answer to.
 *
 * So the feed keeps what only it has (the Awin deeplink, which is how this is
 * monetised, plus the EAN and the product copy) and the storefront supplies
 * what it is authoritative about: price, reference price and stock.
 *
 * ── What happens to a listing that will not key ──────────────────────────────
 * Its price is cleared, not kept. Keeping it would mean publishing a
 * `search_price` we have just established is wrong seven times in ten, on the
 * grounds that we failed to check this particular one — which is the worst
 * reading of the evidence available. A listing with no price is carried as
 * known-but-unpriced and skipped by the demo build, the same treatment a house
 * that prices in dirhams already gets.
 */

export interface FeedPriceRepairOptions {
  /**
   * Clear the price of a listing the storefront does not carry, rather than
   * leaving the feed's figure in place.
   *
   * True is the right default for a merchant whose feed has been *measured*
   * wrong. It must stay false for a merchant that has not been measured: on an
   * unmeasured feed, "the storefront index missed it" is far more likely to
   * mean the index is incomplete than that the price is wrong, and blanking
   * thousands of prices on that assumption would be its own fabrication.
   */
  clearUnkeyed: boolean;
}

export interface FeedPriceRepairResult {
  listings: StoredListing[];
  /** Listings whose feed price already matched the storefront to the penny. */
  agreed: number;
  /** Listings whose price was replaced with the storefront's. */
  corrected: number;
  /** Of those, how many the feed had overstated. */
  wasOverstated: number;
  wasUnderstated: number;
  /** Pounds of overstatement removed, summed across corrected listings. */
  overstatementRemovedGbp: number;
  /** Listings the storefront index could not key. */
  unkeyed: number;
  /** Of those, how many had their price cleared. */
  cleared: number;
}

/** Agreement is to the penny; anything finer is float noise, not a price. */
const PENNY = 0.005;

export function repairFeedPrices(
  listings: readonly StoredListing[],
  index: ShopifyPriceIndex,
  options: FeedPriceRepairOptions,
): FeedPriceRepairResult {
  const out: StoredListing[] = [];
  const result: FeedPriceRepairResult = {
    listings: out,
    agreed: 0,
    corrected: 0,
    wasOverstated: 0,
    wasUnderstated: 0,
    overstatementRemovedGbp: 0,
    unkeyed: 0,
    cleared: 0,
  };

  for (const listing of listings) {
    // A delisted row is history. Re-pricing it would rewrite what we recorded
    // at the time it was still for sale, and nothing reads its price anyway.
    if (listing.status !== 'active') {
      out.push(listing);
      continue;
    }

    const live = lookupLivePrice(listing.retailerSku, listing.url, index);

    if (!live) {
      result.unkeyed++;
      if (options.clearUnkeyed && listing.priceGbp !== null) {
        result.cleared++;
        out.push({ ...listing, priceGbp: null, wasPriceGbp: null });
      } else {
        out.push(listing);
      }
      continue;
    }

    const before = listing.priceGbp;
    if (before !== null && Math.abs(before - live.price) < PENNY) {
      result.agreed++;
      // Still take the storefront's reference price and stock: the feed has no
      // rrp column at all and its in_stock flag is a day old at best.
      out.push({
        ...listing,
        wasPriceGbp: live.compareAt,
        inStock: live.available ?? listing.inStock,
      });
      continue;
    }

    result.corrected++;
    if (before !== null) {
      const delta = before - live.price;
      if (delta > 0) {
        result.wasOverstated++;
        result.overstatementRemovedGbp += delta;
      } else {
        result.wasUnderstated++;
      }
    }

    out.push({
      ...listing,
      priceGbp: live.price,
      wasPriceGbp: live.compareAt,
      inStock: live.available ?? listing.inStock,
    });
  }

  result.overstatementRemovedGbp = Number(result.overstatementRemovedGbp.toFixed(2));
  return result;
}

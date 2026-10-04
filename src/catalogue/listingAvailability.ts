import type { StockState } from '../types/offer.js';
import type { RawListing, StoredListing } from './types.js';

/**
 * Whether a listing is one a reader could actually have bought: the shop
 * still lists the product, and the shop has not told us it is out of stock.
 *
 * ── Two different questions, one easy to mistake for the other ─────────────
 * `status` (see ListingStatus in types.ts) is lifecycle: 'active' means the
 * shop's page was still there the last time a crawl looked, 'delisted' means
 * a *completed* crawl stopped seeing it (reconcile.ts). It says nothing about
 * whether the product on that page could be bought right now — a shop can
 * keep a sold-out product's page live indefinitely.
 *
 * `inStock` is the separate field that answers that: `true`/`false` from a
 * retailer that publishes stock state, `null` from one that does not (or
 * whose page this crawl route never parses far enough to find it).
 *
 * A listing needs both: still listed, and not confirmed unavailable.
 *
 * ── Why `null` is kept in, not excluded ─────────────────────────────────────
 * `inStock: null` means "never established", not "out of stock" — and for
 * some shops it is the *only* value that field ever holds. Measured against
 * data/catalogue/*.json on 2026-08-26: superdrug, selfridges,
 * the-perfume-shop and zara report `inStock: null` on 100% of their active
 * listings (289 listings total) — none of their adapters currently parse a
 * stock signal at all. Excluding null would not trim a few uncertain rows
 * from those shops, it would erase them from every fragrance's history they
 * have ever priced, permanently, which is a worse failure than occasionally
 * keeping a price that quietly went out of stock and back before the next
 * crawl caught it.
 *
 * This is not a new judgement call invented for history — it is the same one
 * src/services/priceService.ts already makes for the *live* comparison
 * table: `isPurchasable(stock) { return stock !== 'outOfStock'; }` treats its
 * 'unknown' state (mapped from this exact `inStock: null`, see
 * `l.inStock === true ? 'inStock' : l.inStock === false ? 'outOfStock' :
 * 'unknown'` in scripts/build-demo-catalogue.ts) as purchasable, and lets it
 * win `bestOffer`. Only an explicit out-of-stock signal excludes a row there;
 * this function draws the same line for the past.
 *
 * Measured impact of adding this stock check on top of the existing
 * status-only filter, 2026-08-26:
 *
 * Today's snapshot alone — data/catalogue/*.json, active-status listings
 * only: 54,344 total, of which 9,275 are `inStock: false` (now excluded) and
 * 289 are `inStock: null` (stay included, all 289 belonging to superdrug,
 * selfridges, the-perfume-shop and zara).
 *
 * Replaying the *whole* reconstructed history (every commit that ever
 * touched data/catalogue, 312 of them) and counting every active-status
 * listing encountered along the way, not just today's: 10,670,045 encounters,
 * of which 1,724,997 (16.2%) are `inStock: false` and 19,855 (0.19%) are
 * `inStock: null`.
 *
 * Effect on the reconstructed history itself: of the 20,826 fragrances that
 * have ever recorded a price under the old status-only rule, adding this
 * stock check changes the collapsed cheapest-price series on 4,246 of them
 * (20.4%) — not merely dropping a losing offer from a commit that already had
 * a cheaper alternative, but changing which price and/or which retailer wins.
 * 2,482 of those 4,246 lose their price history outright: every price they
 * ever had traced to a listing that was out of stock at the time, so
 * excluding out-of-stock listings leaves them with nothing to plot.
 *
 * What actually reaches the chart (2+ points, demo/app.ts's own bar for
 * drawing a line at all): 6,246 fragrances clear it under the old rule.
 * 1,614 of those drop below it here and lose their chart entirely. Of the
 * 4,632 that keep a chart on both sides, only 113 (2.4%) draw a genuinely
 * different line — a different price and/or a different winning retailer
 * somewhere in the series, not just a shorter one; the remaining 4,519 render
 * identically, because the listing that was excluded was never the cheapest
 * one anyway. A further 20 fragrances gain a chart they did not have before:
 * removing an out-of-stock listing that had been sitting at a flat, always-
 * cheapest price revealed a real change underneath it, which is exactly the
 * "quietly went out of stock and the field wasn't uniform" case this filter
 * exists to surface rather than paper over.
 *
 * Isolating the null question specifically: treating `inStock: null` the
 * same as `false` (excluding it too, rather than keeping it per the rule
 * above) would change 163 more fragrances' series and permanently lose 163
 * more fragrances' entire history (2,645 instead of 2,482) — while changing
 * the *chartable* count not at all (4,652 either way). That is, excluding
 * null buys nothing extra that reaches an actual reader's chart, while
 * costing the four shops above their history everywhere they were ever the
 * cheapest, which is the trade this function's header argues against.
 */
export function isAvailableListing(
  listing: Pick<StoredListing, 'status' | 'inStock'> & Partial<Pick<StoredListing, 'availability' | 'rawTitle'>>,
): boolean {
  // A pre-order is not something a reader could have bought on that day, so it
  // is left out of the history exactly as a sold out listing is. Its stored
  // flag is already false from the harvest, but this also covers a listing
  // stored before the field existed whose title carries the shop's own
  // Pre-Order wording.
  if (listing.availability === 'preOrder') return false;
  if (listing.inStock !== false && listing.rawTitle && titleStatesPreOrder(listing.rawTitle)) return false;
  return listing.status === 'active' && listing.inStock !== false;
}

/**
 * Whether a shop's own title says the bottle is a pre-order, in the shop's
 * words: "PRE-ORDER: Estimated dispatch: 7th October" (Emirates Oud), "Pre
 * Order", "Preorder". A whole word match only, so a word that merely contains
 * the letters does not count. Never a guess from a price, a date or a missing
 * stock figure.
 */
export function titleStatesPreOrder(rawTitle: string): boolean {
  return /(?:^|[^a-z])pre[\s-]?order(?![a-z])/i.test(rawTitle);
}

/**
 * The stock state a stored listing is shown with: the one place that decides
 * between in stock, out of stock, pre-order and unknown.
 *
 * Order matters. A shop's explicit "unavailable" (`inStock: false`) is the
 * strongest statement and wins over a pre-order wording in the title, because
 * a sold out pre-order is sold out. After that, an explicit pre-order (the
 * stored field, or the shop's own wording in the title) beats the in stock
 * flag, which is the whole point: Bloom Perfumery's feed calls a Pre-Order
 * bottle available. A stored `availability: 'preOrder'` carries `inStock:
 * false` by construction (see `RawListing.availability`), so it is read first.
 */
export function listingStockState(
  listing: Pick<RawListing, 'inStock' | 'rawTitle'> & { availability?: RawListing['availability'] },
): StockState {
  if (listing.availability === 'preOrder') return 'preOrder';
  if (listing.inStock === false) return 'outOfStock';
  if (titleStatesPreOrder(listing.rawTitle)) return 'preOrder';
  if (listing.inStock === true) return 'inStock';
  return 'unknown';
}

/**
 * Marks the listings whose own title says Pre-Order, as the harvest stores
 * them: `availability: 'preOrder'` and `inStock: false`. A listing the shop
 * already states unavailable (`inStock: false`) is left alone, since sold out
 * wins, and one already marked is left as it is.
 */
export function markTitlePreOrders<
  T extends Pick<RawListing, 'inStock' | 'rawTitle'> & { availability?: RawListing['availability'] },
>(listings: readonly T[]): { listings: T[]; marked: string[] } {
  const marked: string[] = [];
  const out = listings.map((l) => {
    if (l.availability === 'preOrder' || l.inStock === false || !titleStatesPreOrder(l.rawTitle)) return l;
    marked.push(l.rawTitle);
    return { ...l, inStock: false, availability: 'preOrder' as const };
  });
  return { listings: out, marked };
}

/**
 * A listing with its stock re-read from a shop's feed or storefront, keeping
 * an earlier explicit pre-order where the new reading is silent about it.
 *
 * Two paths re-price stored listings from a feed that only knows a true/false
 * available flag (catalogueRefresh.ts, feedPriceRepair.ts). That flag says
 * "available" for a pre-order too, so it must not undo a pre-order the shop's
 * own page stated; but `false` is the shop saying it cannot be had at all,
 * which clears it. A null reading leaves everything as it was.
 */
export function withFeedStock<T extends Pick<RawListing, 'inStock'> & { availability?: RawListing['availability'] }>(
  listing: T,
  available: boolean | null,
): T {
  if (available === false) {
    const { availability: _gone, ...rest } = listing;
    return { ...rest, inStock: false } as T;
  }
  if (available === null) return listing;
  if (listing.availability === 'preOrder') return { ...listing, inStock: false };
  return { ...listing, inStock: available };
}

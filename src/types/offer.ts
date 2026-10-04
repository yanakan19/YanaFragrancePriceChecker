import type { Retailer } from './retailer.js';

/**
 * Stock state as reported by a retailer.
 *
 * `unknown` is kept distinct from `outOfStock` on purpose. A page we failed to
 * parse is not evidence that a product is unavailable, and demoting it to the
 * bottom of the results would misrepresent the retailer. Only an explicit
 * out-of-stock signal earns the bottom of the list.
 */
export type StockState = 'inStock' | 'lowStock' | 'preOrder' | 'outOfStock' | 'unknown';

/**
 * A single offer as captured from a retailer, before presentation.
 *
 * `price` is always the amount the customer pays today, in GBP, excluding
 * delivery. `wasPrice` is the retailer's own reference price and is only ever
 * populated when the retailer publishes one — it is never inferred from our own
 * price history, because presenting a derived figure as the retailer's "was"
 * price would be a UK CPR pricing-claims problem, not just a modelling one.
 */
export interface RawOffer {
  retailerId: string;
  variantId: string;
  price: number;
  wasPrice?: number | null;
  currency: 'GBP';
  stock: StockState;
  /** Canonical product URL at the retailer. */
  url: string;
  imageUrl?: string | null;
  /** Retailer-published promotion end time, ISO-8601. Never invent one. */
  promoEndsAt?: string | null;
  /** When this offer was captured, ISO-8601. Drives the staleness indicator. */
  fetchedAt: string;
  /**
   * This retailer's own published rating for this listing, read from its
   * schema.org aggregateRating (src/catalogue/jsonld.ts) — never computed,
   * never carried over from a different retailer's rating of the same
   * fragrance. `count` is null where the source states a star value with no
   * review count. Absent or null wherever the source publishes none; never
   * defaulted or guessed.
   */
  rating?: { value: number; count: number | null } | null;
}

/** The was/now/percentage triple, present only on a genuine retailer promotion. */
export interface DiscountDisplay {
  wasPrice: number;
  nowPrice: number;
  /** Absolute saving in GBP, rounded to pence. */
  savingGbp: number;
  /**
   * Whole-percent saving, rounded *down*. A 19.6% saving displays as 19%, not
   * 20% — overstating a discount is the one rounding error with regulatory
   * consequences.
   */
  percentOff: number;
  /** Retailer-published end time, or null when the retailer did not give one. */
  endsAt: string | null;
}

/**
 * A comparison to the fragrance house's own price, never the retailer's.
 *
 * `DiscountDisplay` states a claim the shop itself made about its own former
 * price. This states a different kind of fact entirely: what the company
 * that makes the bottle charges for it (`CatalogueEntry.houseCeiling`,
 * test zero in src/catalogue/wasPriceCredibility.ts), which this shop never
 * claimed and may not even know about. Kept as its own type, never folded
 * into `DiscountDisplay`, so the two can never be rendered by code that
 * forgot which one it was holding and attributed the house's figure to the
 * shop — the exact CPR pricing-claims problem `wasPrice`'s own comment on
 * `RawOffer` warns about. `houseName` exists so every render of this type has
 * the attribution to hand rather than having to go and find it.
 */
export interface HouseAnchorDisplay {
  /**
   * The company that makes the bottle, e.g. "Armaf".
   *
   * Not named on every screen any more. The demo's fragrance detail page moved
   * to "% below MSRP" on 2026-08-26 (owner's wording) and no longer prints
   * this, which it can do because the MSRP box at the top of that same page
   * carries the figure and the product's brand; scripts/build-deals.ts still
   * reads it, and a deal tile — one line in a grid of many brands, with no
   * such box above it — still prints it, because there the reference price
   * would otherwise go unidentified. Kept on the type for that reason: the
   * attribution has to travel with the number even where a given view has
   * somewhere else to put it.
   */
  houseName: string;
  /**
   * The highest figure the house itself publishes for this bottle — its own
   * price, or its own struck-through reference price, whichever is higher.
   * Never the shop's figure.
   */
  housePriceGbp: number;
  /** What this shop charges today, for the saving arithmetic. */
  nowPriceGbp: number;
  /** Absolute saving in GBP against the house's price, rounded to pence. */
  savingGbp: number;
  /** Whole-percent saving against the house's price, rounded down — see DiscountDisplay.percentOff. */
  percentOff: number;
}

/** How delivery resolves for this offer at this basket value. */
export interface DeliveryDisplay {
  /**
   * Delivery cost applied to the delivered price.
   *
   * `null` means the retailer does not state one, and it never means zero. A
   * shop can be shown without this figure — it is displayed as "delivery not
   * stated" and is barred from ever ranking as the cheapest offer (see
   * `buildComparison` and `bestOffer`) — but it can never be silently priced
   * at £0, which would sort it to the top as artificially cheapest.
   *
   * `0` is a different statement entirely: it is a real, sourced claim that
   * this shop ships free. The two must never be conflated.
   *
   * When null, `isFree` is false, `freeReason` is null and
   * `spendMoreForFreeGbp` is null: none of those can be asserted about a cost
   * nobody has established.
   */
  costGbp: number | null;
  isFree: boolean;
  /** Why delivery is free, when it is. */
  freeReason: 'threshold-met' | 'always-free' | null;
  /**
   * How much more the customer would need to spend to unlock free delivery,
   * or null when free delivery is already met or unavailable by spend.
   */
  spendMoreForFreeGbp: number | null;
  estimatedDays: [number, number];
  /** Membership-only free delivery, surfaced as a footnote and never priced in. */
  membershipNote: string | null;
  /** False when the shipping rule is indicative rather than confirmed. */
  confirmed: boolean;
}

/** An offer with everything the comparison row needs to render honestly. */
export interface PresentedOffer {
  retailer: Retailer;
  variantId: string;
  /** Price of the item itself, excluding delivery. */
  itemPriceGbp: number;
  /**
   * Item price plus applicable delivery. The default sort key.
   *
   * `null` exactly when `delivery.costGbp` is null — the retailer does not
   * state a delivery cost, so no delivered price exists. It is never filled in
   * with the item price: that would be the same lie as pricing delivery at
   * zero, just written somewhere else.
   */
  deliveredPriceGbp: number | null;
  currency: 'GBP';
  discount: DiscountDisplay | null;
  delivery: DeliveryDisplay;
  stock: StockState;
  /** True only for an explicit out-of-stock signal; drives the bottom grouping. */
  isPurchasable: boolean;
  /** Affiliate link when the programme is live, otherwise the plain retailer URL. */
  outboundUrl: string;
  /** Whether `outboundUrl` carries affiliate tracking. */
  isAffiliateLink: boolean;
  imageUrl: string | null;
  fetchedAt: string;
  /** Age of the captured price in seconds, for the "checked N min ago" label. */
  ageSeconds: number;
  /** This retailer's own published rating for this listing — see RawOffer. */
  rating: { value: number; count: number | null } | null;
}

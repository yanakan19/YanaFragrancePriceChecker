import { buildHouseAnchor } from './discount.js';

/** The minimal shape of a fragrance `dealCandidateForOffer` needs. */
export interface DealCandidateFragrance {
  brand: string;
  /** `CatalogueEntry.houseCeiling`; null where the house is not stocked here. */
  houseCeiling: number | null;
}

/** The minimal shape of an offer `dealCandidateForOffer` needs. */
export interface DealCandidateOffer {
  price: number;
  wasPrice: number | null;
  retailerId: string;
}

/** One offer's best possible Today's Deals candidate. */
export interface DealCandidate {
  price: number;
  wasPrice: number;
  percentOff: number;
  retailerId: string;
  kind: 'retailer' | 'house';
  houseName: string | null;
}

/**
 * The best deal candidate one offer can supply, or null if it does not
 * qualify.
 *
 * House-anchored first: when the fragrance's house is stocked here and this
 * offer genuinely undercuts it, `buildHouseAnchor` — the same function
 * demo/app.ts's offerRow uses for the fragrance's own page — is always the
 * stronger and more informative figure, so it wins outright (see
 * scripts/build-deals.ts's own header for the measured 2026-08-26 rollout of
 * this path).
 *
 * The retailer path — a shop's own corroborated wasPrice — is gated against
 * the same houseCeiling, not just handed whatever wasPrice CRAWLED happens to
 * hold. That gate is deliberate, not redundant with
 * src/catalogue/wasPriceCredibility.ts's own "test zero", which already
 * refutes (nulls) a wasPrice above the house ceiling — inside a single
 * `scripts/build-demo-catalogue.ts` run, over one consistent snapshot. Today's
 * Deals is built by a *separate* script on its own ~6-hourly cadence (this
 * file's caller, scripts/build-deals.ts), and .github/workflows/catalogue-
 * daily.yml runs that refresh *before* the same run's harvest step — so a
 * fragrance that gains a houseCeiling for the first time this run (a new
 * brand-direct offer landing) can hand this function a wasPrice the market
 * has not yet had the chance to refute against it, and the next deals refresh
 * may not run for hours.
 *
 * ean-6290171071051 is exactly that shape, confirmed from the real history
 * rather than assumed: Zimaya added its own £35 Fatima 100ml storefront
 * listing in the 2026-08-31 21:57:52 UTC harvest (commit fbae46b0),
 * establishing this product's houseCeiling for the first time. Perfume
 * Click's £50 wasPrice for the same bottle had been sitting unchanged in the
 * deals snapshot since 2026-08-13 (commit ed880e1c) — genuinely corroborated
 * at the time, since no house price existed yet to contradict it — and the
 * last deals refresh before the harvest (commit 7bc50143, 20:52:48 UTC, over
 * an hour *before* the harvest that added the Zimaya offer) had no reason to
 * touch it. No deals refresh ran again before this repository's tests were
 * checked, so the stale £50 reference shipped in demo/deals.generated.ts
 * against a £35 house price it now contradicts.
 *
 * Re-checking the ceiling here closes that gap independent of timing: this
 * function is now the single place that decides whether a retailer wasPrice
 * may become a deal, and it can never emit one above the fragrance's own
 * house ceiling, whatever state scripts/build-demo-catalogue.ts's own
 * withholding pass happened to be in when CRAWLED was last written. A
 * fragrance whose house ceiling exists and whose retailer wasPrice exceeds
 * it, with the offer's own price not genuinely below the ceiling either
 * (`buildHouseAnchor` already covers the case where it is), yields no
 * candidate at all — dropped, not re-anchored, because there is no genuine
 * saving against the house to state in that case: `buildHouseAnchor` itself
 * would return null for the identical price/ceiling pair, so re-anchoring
 * would only recompute the same "no deal" answer through a second path.
 */
export function dealCandidateForOffer(
  fragrance: DealCandidateFragrance,
  offer: DealCandidateOffer,
): DealCandidate | null {
  if (fragrance.houseCeiling !== null) {
    const anchor = buildHouseAnchor(offer.price, fragrance.houseCeiling, fragrance.brand);
    if (anchor) {
      return {
        price: offer.price,
        wasPrice: anchor.housePriceGbp,
        percentOff: anchor.percentOff,
        retailerId: offer.retailerId,
        kind: 'house',
        houseName: anchor.houseName,
      };
    }
  }

  if (offer.wasPrice === null || !(offer.wasPrice > offer.price)) return null;

  // Never state a reference price the house itself contradicts — see this
  // function's own header comment for why this cannot simply inherit the
  // withholding scripts/build-demo-catalogue.ts already applied to CRAWLED.
  if (fragrance.houseCeiling !== null && offer.wasPrice > fragrance.houseCeiling) return null;

  return {
    price: offer.price,
    wasPrice: offer.wasPrice,
    percentOff: Math.floor((1 - offer.price / offer.wasPrice) * 100),
    retailerId: offer.retailerId,
    kind: 'retailer',
    houseName: null,
  };
}

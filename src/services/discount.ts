import type { DiscountDisplay, HouseAnchorDisplay, RawOffer } from '../types/offer.js';
import { roundPence } from './money.js';

/**
 * Build the was/now/percent display for an offer.
 *
 * Returns null unless the retailer itself published a reference price that is
 * genuinely higher than what it is charging today. Three things this
 * deliberately will not do:
 *
 *   - infer a "was" price from our own price history. That figure would be
 *     ours, not the retailer's, and presenting it as the retailer's reference
 *     price is a UK CPR pricing-claims problem;
 *   - show a 0% or negative "saving" when wasPrice <= price, which happens
 *     routinely when a retailer leaves a stale RRP in its markup;
 *   - round the percentage up. 19.6% displays as 19%.
 */
export function buildDiscount(offer: RawOffer): DiscountDisplay | null {
  const was = offer.wasPrice;
  if (was == null) return null;
  if (!Number.isFinite(was) || was <= offer.price) return null;

  const saving = roundPence(was - offer.price);
  if (saving < 0.01) return null;

  const percentOff = Math.floor((saving / was) * 100);
  // A saving too small to register as a whole percent is not worth a badge.
  if (percentOff < 1) return null;

  return {
    wasPrice: roundPence(was),
    nowPrice: roundPence(offer.price),
    savingGbp: saving,
    percentOff,
    endsAt: offer.promoEndsAt ?? null,
  };
}

/**
 * Build the "cheaper than buying direct" comparison against the fragrance
 * house's own price — never the shop's, see `HouseAnchorDisplay`.
 *
 * `houseCeilingGbp` is `CatalogueEntry.houseCeiling`: the highest figure the
 * house itself publishes for this size-matched bottle, already computed by
 * scripts/build-demo-catalogue.ts as it runs test zero in
 * wasPriceCredibility.ts. This function does no evidence-gathering of its
 * own — it only turns a ceiling that already exists into a display, the same
 * split `buildDiscount` keeps between judging a claim and rendering it.
 *
 * Mirrors `buildDiscount`'s two safeguards exactly, for the same reasons:
 *
 *   - null whenever the house is not actually more expensive (`<= price`).
 *     15 of 178 comparable products measured 2026-08-26 are exactly this: the
 *     house undercuts every retailer, and showing a "saving" against a price
 *     that is not the higher one would invent a discount that does not exist
 *     — see wasPriceCredibility.ts's "house being cheaper" section.
 *   - the percentage is floored, never rounded up, and a saving too small to
 *     reach one whole percent renders nothing rather than "0% below Armaf".
 */
export function buildHouseAnchor(
  price: number,
  houseCeilingGbp: number,
  houseName: string,
): HouseAnchorDisplay | null {
  if (!Number.isFinite(houseCeilingGbp) || houseCeilingGbp <= price) return null;

  const saving = roundPence(houseCeilingGbp - price);
  if (saving < 0.01) return null;

  const percentOff = Math.floor((saving / houseCeilingGbp) * 100);
  if (percentOff < 1) return null;

  return {
    houseName,
    housePriceGbp: roundPence(houseCeilingGbp),
    nowPriceGbp: roundPence(price),
    savingGbp: saving,
    percentOff,
  };
}

/**
 * Whether a countdown may be rendered for this promotion.
 *
 * Only ever true when the retailer published an end time that is still in the
 * future. An invented countdown is the fastest way to lose a price-comparison
 * user's trust, and pressure-selling on a fabricated deadline is an ASA/CPR
 * exposure on top of that.
 */
export function canShowCountdown(discount: DiscountDisplay | null, now = new Date()): boolean {
  if (!discount?.endsAt) return false;
  const ends = Date.parse(discount.endsAt);
  return Number.isFinite(ends) && ends > now.getTime();
}

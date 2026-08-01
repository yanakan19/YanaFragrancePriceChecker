import type { DiscountDisplay, RawOffer } from '../types/offer.js';
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

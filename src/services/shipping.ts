import type { Retailer } from '../types/retailer.js';
import type { DeliveryDisplay } from '../types/offer.js';
import { roundPence } from './money.js';

/**
 * Resolve what delivery actually costs for a given basket value at a retailer.
 *
 * `basketGbp` is the order subtotal excluding delivery. For a single-fragrance
 * comparison that is just the item price, which is the case that matters: it is
 * why Harvey Nichols' £300 threshold effectively never fires and why Boots'
 * £25 one often does.
 *
 * Membership schemes are recorded but never applied. Quoting a Beautycard or
 * Selfridges+ price as the headline would mean showing a number the average
 * visitor cannot actually pay.
 */
export function resolveDelivery(retailer: Retailer, basketGbp: number): DeliveryDisplay {
  const { shipping } = retailer;

  const membershipNote = shipping.membershipPerk
    ? `${shipping.membershipPerk.scheme}: ${shipping.membershipPerk.description}`
    : null;

  const base = {
    estimatedDays: shipping.estimatedDays,
    membershipNote,
    confirmed: shipping.confidence === 'confirmed',
  };

  // Unknown is not zero, and it is not a reason to hide the shop either.
  //
  // This used to throw, because the only safe way to handle a shop with no
  // established delivery cost was to keep it out of the pipeline entirely
  // (`enabled: false`). That protected the sort at the cost of hiding real
  // shops. The rule is now narrower and does the same job: an unstated cost
  // stays unstated all the way to the screen, the delivered price is null
  // rather than invented, and a row with a null delivered price can never
  // outrank one with a real number (see buildComparison and bestOffer). It is
  // shown, labelled "delivery not stated", and it cannot win on price.
  if (shipping.standardGbp === null) {
    return {
      ...base,
      costGbp: null,
      // Nothing below can be asserted about a cost nobody has established.
      // "Free" in particular would be a claim, not an absence of one.
      isFree: false,
      freeReason: null,
      spendMoreForFreeGbp: null,
    };
  }
  const standardGbp = shipping.standardGbp;

  // Some retailers ship free at any basket value. This is a real, sourced zero
  // — a claim that the shop ships free — and is deliberately distinct from the
  // null case above.
  if (standardGbp === 0) {
    return {
      ...base,
      costGbp: 0,
      isFree: true,
      freeReason: 'always-free',
      spendMoreForFreeGbp: null,
    };
  }

  // No spend-based free delivery at all (Notino). Delivery always applies.
  if (shipping.freeOverGbp === null) {
    return {
      ...base,
      costGbp: standardGbp,
      isFree: false,
      freeReason: null,
      spendMoreForFreeGbp: null,
    };
  }

  if (basketGbp >= shipping.freeOverGbp) {
    return {
      ...base,
      costGbp: 0,
      isFree: true,
      freeReason: 'threshold-met',
      spendMoreForFreeGbp: null,
    };
  }

  return {
    ...base,
    costGbp: standardGbp,
    isFree: false,
    freeReason: null,
    spendMoreForFreeGbp: roundPence(shipping.freeOverGbp - basketGbp),
  };
}

/**
 * Item price plus applicable delivery — the default comparison sort key.
 *
 * `null` when the retailer does not state a delivery cost. Callers must carry
 * that null rather than coalescing it to the item price: a delivered price
 * that quietly equals the item price is indistinguishable from free delivery,
 * which is exactly the claim we are refusing to make.
 */
export function deliveredPrice(retailer: Retailer, itemPriceGbp: number): number | null {
  const { costGbp } = resolveDelivery(retailer, itemPriceGbp);
  return costGbp === null ? null : roundPence(itemPriceGbp + costGbp);
}

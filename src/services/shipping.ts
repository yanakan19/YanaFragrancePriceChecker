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

  // Unknown is not zero. A retailer whose standard delivery cost has never been
  // established must be disabled (see the field's doc comment and the registry
  // test that enforces it), so reaching here with null means a disabled shop
  // has leaked into the offer pipeline. Failing loudly is right: the quiet
  // alternative is treating unknown as free and sorting that shop to the top.
  if (shipping.standardGbp === null) {
    throw new Error(
      `${retailer.id}: standard delivery cost is not established, so a delivered ` +
        'price cannot be computed. This retailer should be enabled: false.',
    );
  }
  const standardGbp = shipping.standardGbp;
  const membershipNote = shipping.membershipPerk
    ? `${shipping.membershipPerk.scheme}: ${shipping.membershipPerk.description}`
    : null;

  const base = {
    estimatedDays: shipping.estimatedDays,
    membershipNote,
    confirmed: shipping.confidence === 'confirmed',
  };

  // Some retailers ship free at any basket value.
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

/** Item price plus applicable delivery — the default comparison sort key. */
export function deliveredPrice(retailer: Retailer, itemPriceGbp: number): number {
  return roundPence(itemPriceGbp + resolveDelivery(retailer, itemPriceGbp).costGbp);
}

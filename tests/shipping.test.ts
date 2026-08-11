import { describe, expect, it } from 'vitest';
import { getRetailer } from '../src/config/retailers.js';
import { resolveDelivery, deliveredPrice } from '../src/services/shipping.js';
import type { Retailer } from '../src/types/retailer.js';

const boots = getRetailer('boots')!;
const notino = getRetailer('notino-uk')!;
const harveyNichols = getRetailer('harvey-nichols')!;
const superdrug = getRetailer('superdrug')!;

describe('resolveDelivery', () => {
  it('charges standard delivery below the threshold', () => {
    const d = resolveDelivery(boots, 20);
    expect(d.costGbp).toBe(3.95);
    expect(d.isFree).toBe(false);
    expect(d.spendMoreForFreeGbp).toBe(5);
  });

  it('is free at exactly the threshold', () => {
    const d = resolveDelivery(boots, 25);
    expect(d.costGbp).toBe(0);
    expect(d.isFree).toBe(true);
    expect(d.freeReason).toBe('threshold-met');
    expect(d.spendMoreForFreeGbp).toBeNull();
  });

  it('is free above the threshold', () => {
    expect(resolveDelivery(boots, 82.5).isFree).toBe(true);
  });

  it('reports the shortfall to free delivery in pence', () => {
    expect(resolveDelivery(boots, 19.99).spendMoreForFreeGbp).toBe(5.01);
  });

  it('always charges when the retailer has no spend-based free delivery', () => {
    // Notino: free postage is per-product, never basket-value based.
    const d = resolveDelivery(notino, 500);
    expect(d.isFree).toBe(false);
    expect(d.costGbp).toBe(2.99);
    expect(d.spendMoreForFreeGbp).toBeNull();
  });

  it('never applies a membership perk to the headline price', () => {
    // Superdrug Beautycard is free over £20; a non-member at £22 still pays.
    const d = resolveDelivery(superdrug, 22);
    expect(d.isFree).toBe(false);
    expect(d.costGbp).toBe(4.5);
    expect(d.membershipNote).toContain('Beautycard');
  });

  it('carries delivery on a typical Harvey Nichols fragrance', () => {
    // The £300 threshold is unreachable on a single bottle, which is exactly
    // why delivered price is the honest sort.
    const d = resolveDelivery(harveyNichols, 180);
    expect(d.isFree).toBe(false);
    expect(d.costGbp).toBe(5.95);
  });

  it('flags unconfirmed shipping data', () => {
    expect(resolveDelivery(boots, 10).confirmed).toBe(false);
  });

  it('handles an always-free retailer', () => {
    const free: Retailer = {
      ...boots,
      shipping: { ...boots.shipping, standardGbp: 0, freeOverGbp: null },
    };
    const d = resolveDelivery(free, 5);
    expect(d.isFree).toBe(true);
    expect(d.freeReason).toBe('always-free');
    // A sourced zero, not an absence of a figure. It stays a number.
    expect(d.costGbp).toBe(0);
  });

  describe('when the retailer states no standard delivery cost', () => {
    // This used to throw, on the reasoning that such a retailer must never
    // reach the pipeline at all. It now resolves to an explicitly unstated
    // cost instead, which the sort demotes and the UI labels — the shop is
    // shown, and it still cannot win on a price nobody has established.
    const unstated: Retailer = {
      ...boots,
      shipping: { ...boots.shipping, standardGbp: null, freeOverGbp: 25 },
    };

    it('returns a null cost rather than throwing', () => {
      expect(() => resolveDelivery(unstated, 20)).not.toThrow();
      expect(resolveDelivery(unstated, 20).costGbp).toBeNull();
    });

    it('claims nothing about free delivery', () => {
      // Not free, no reason it might be, and no shortfall to quote — a
      // threshold is meaningless without the cost it is a threshold on. Even
      // at a basket that clears the £25 free-over figure, "free" is a claim
      // this retailer has not made.
      for (const basket of [20, 25, 500]) {
        const d = resolveDelivery(unstated, basket);
        expect(d.isFree).toBe(false);
        expect(d.freeReason).toBeNull();
        expect(d.spendMoreForFreeGbp).toBeNull();
      }
    });

    it('still reports everything it does know', () => {
      const d = resolveDelivery(unstated, 20);
      expect(d.estimatedDays).toEqual(boots.shipping.estimatedDays);
      expect(d.confirmed).toBe(false);
    });

    it('is not confused with a genuinely free retailer', () => {
      const free: Retailer = { ...boots, shipping: { ...boots.shipping, standardGbp: 0 } };
      expect(resolveDelivery(free, 5).costGbp).toBe(0);
      expect(resolveDelivery(unstated, 5).costGbp).toBeNull();
      expect(resolveDelivery(free, 5).isFree).toBe(true);
      expect(resolveDelivery(unstated, 5).isFree).toBe(false);
    });
  });
});

describe('deliveredPrice', () => {
  it('adds delivery below the threshold', () => {
    expect(deliveredPrice(boots, 20)).toBe(23.95);
  });

  it('adds nothing above the threshold', () => {
    expect(deliveredPrice(boots, 62.95)).toBe(62.95);
  });

  it('rounds to pence rather than leaking float drift', () => {
    expect(deliveredPrice(notino, 19.99)).toBe(22.98);
  });

  it('is null, never the item price, when the cost is unstated', () => {
    // Returning the item price here would be indistinguishable from free
    // delivery to every caller downstream.
    const unstated: Retailer = { ...boots, shipping: { ...boots.shipping, standardGbp: null } };
    expect(deliveredPrice(unstated, 20)).toBeNull();
  });

  it('can make a cheaper item more expensive delivered', () => {
    // The case that justifies delivered-price sorting: Boots at £24.99 clears
    // nothing, John Lewis at £26 would still pay £4.50.
    const jl = getRetailer('john-lewis')!;
    expect(deliveredPrice(boots, 24.99)).toBe(28.94);
    expect(deliveredPrice(jl, 26)).toBe(30.5);
  });
});

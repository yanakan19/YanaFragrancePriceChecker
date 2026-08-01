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

  it('can make a cheaper item more expensive delivered', () => {
    // The case that justifies delivered-price sorting: Boots at £24.99 clears
    // nothing, John Lewis at £26 would still pay £4.50.
    const jl = getRetailer('john-lewis')!;
    expect(deliveredPrice(boots, 24.99)).toBe(28.94);
    expect(deliveredPrice(jl, 26)).toBe(30.5);
  });
});

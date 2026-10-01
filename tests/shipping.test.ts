import { describe, expect, it } from 'vitest';
import { getRetailer, RETAILERS } from '../src/config/retailers.js';
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
    // £3, Superdrug's own non-member rate as of 2026-10-01 (was £4.50).
    expect(d.costGbp).toBe(3);
    expect(d.membershipNote).toContain('Beautycard');
  });

  it('carries delivery on a typical Harvey Nichols fragrance', () => {
    // The £300 threshold is unreachable on a single bottle, which is exactly
    // why delivered price is the honest sort.
    const d = resolveDelivery(harveyNichols, 180);
    expect(d.isFree).toBe(false);
    // The beauty-only rate, £4.50 as of 2026-10-01 (was recorded as £5.95).
    expect(d.costGbp).toBe(4.5);
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

    it('claims nothing about free delivery below a stated threshold', () => {
      // Not free, no reason it might be, and no shortfall to quote: a
      // shortfall would imply a known cost that the shortfall avoids.
      const d = resolveDelivery(unstated, 20);
      expect(d.isFree).toBe(false);
      expect(d.freeReason).toBeNull();
      expect(d.spendMoreForFreeGbp).toBeNull();
    });

    it('ships free at or over a threshold the shop states, even with no flat rate', () => {
      // FragranceHub publishes "free delivery over £90" but no standard rate:
      // a bottle above £90 ships free in the shop's own words.
      for (const basket of [25, 500]) {
        const d = resolveDelivery(unstated, basket);
        expect(d.costGbp).toBe(0);
        expect(d.isFree).toBe(true);
        expect(d.freeReason).toBe('threshold-met');
        expect(deliveredPrice(unstated, basket)).toBe(basket);
      }
      const noThreshold: Retailer = { ...unstated, shipping: { ...unstated.shipping, freeOverGbp: null } };
      expect(resolveDelivery(noThreshold, 500).costGbp).toBeNull();
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

describe('free-delivery thresholds on the real registry', () => {
  // Every shop whose page was read for this states its threshold inclusively
  // at the boundary — "when you spend £25 or more" (Boots, Superdrug, Avon),
  // "£50 and over" (John Lewis), "£80 or more" (Escentric Molecules), a band
  // that ends "up to £27.99" / "£0.01 - £49.99" (Glorious Beauty, Zimaya),
  // or an empty basket reading "Spend £25.00 more for FREE UK delivery"
  // (Allbeauty). So a single bottle priced at exactly the threshold ships
  // free, and one a penny under pays standard delivery. This pins that for
  // every shop at once, so a threshold comparison that drifts to `>` — or a
  // threshold that stops being applied at all — fails here by name.
  const thresholded = RETAILERS.filter(
    (r) =>
      r.shipping.standardGbp !== null &&
      r.shipping.standardGbp > 0 &&
      r.shipping.freeOverGbp !== null &&
      r.shipping.freeOverGbp > 0,
  );

  it('covers the shops that have one', () => {
    expect(thresholded.length).toBeGreaterThan(20);
  });

  it('is free at exactly the threshold, for every shop', () => {
    for (const r of thresholded) {
      const at = r.shipping.freeOverGbp!;
      const d = resolveDelivery(r, at);
      expect(d.costGbp, `${r.name} charged delivery at its own £${at} threshold`).toBe(0);
      expect(d.freeReason, r.name).toBe('threshold-met');
      expect(d.spendMoreForFreeGbp, r.name).toBeNull();
      expect(deliveredPrice(r, at), r.name).toBe(at);
    }
  });

  it('charges standard delivery a penny under it, and says it is a penny short', () => {
    for (const r of thresholded) {
      const under = Math.round((r.shipping.freeOverGbp! - 0.01) * 100) / 100;
      const d = resolveDelivery(r, under);
      expect(d.costGbp, `${r.name} waived delivery below its threshold`).toBe(r.shipping.standardGbp);
      expect(d.isFree, r.name).toBe(false);
      expect(d.spendMoreForFreeGbp, r.name).toBe(0.01);
      expect(deliveredPrice(r, under), r.name).toBe(
        Math.round((under + r.shipping.standardGbp!) * 100) / 100,
      );
    }
  });

  it('applies French Avenue’s £100 threshold, which was missing until 2026-10-01', () => {
    // The page states "free standard shipping on all orders above £100" and
    // "£4.99 applies on orders below £100". With freeOverGbp null every
    // bottle at £100 or more was quoted £4.99 dearer than the shop charges.
    const fa = getRetailer('french-avenue')!;
    expect(deliveredPrice(fa, 100)).toBe(100);
    expect(deliveredPrice(fa, 120)).toBe(120);
    expect(deliveredPrice(fa, 99.99)).toBe(104.98);
    expect(resolveDelivery(fa, 95).spendMoreForFreeGbp).toBe(5);
  });

  it('gives Selfridges no spend threshold a non-member can use', () => {
    // Its £100 (Selfridges+) and £150 (Selfridges Unlocked) free-delivery
    // figures are both membership benefits. The registry used to hold £100
    // as if it were open to everyone, which showed £100-£150 bottles as
    // delivered free.
    const selfridges = getRetailer('selfridges')!;
    const d = resolveDelivery(selfridges, 120);
    expect(d.isFree).toBe(false);
    expect(d.costGbp).toBe(6.95);
    expect(d.spendMoreForFreeGbp).toBeNull();
    expect(d.membershipNote).toContain('Unlocked');
  });

  it('prices a shop that ships every order free at the item price', () => {
    const perfumeo = getRetailer('perfumeo')!;
    expect(resolveDelivery(perfumeo, 9.99).freeReason).toBe('always-free');
    expect(deliveredPrice(perfumeo, 9.99)).toBe(9.99);
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

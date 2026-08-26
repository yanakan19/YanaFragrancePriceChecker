import { describe, expect, it } from 'vitest';
import { deliveryPriceNote } from '../demo/priceDeliveryNote.js';
import { resolveDelivery } from '../src/services/shipping.js';
import { presentOffer } from '../src/services/priceService.js';
import { RETAILERS, getRetailer } from '../src/config/retailers.js';
import type { DeliveryDisplay, RawOffer } from '../src/types/offer.js';
import type { Retailer, ShippingRule } from '../src/types/retailer.js';

// A real registry entry as the base, with `shipping` fully replaced each time,
// so every non-shipping field is a genuinely valid Retailer while the delivery
// figures under test stay deterministic rather than moving whenever a shop is
// re-verified. Same approach as tests/deliveryFacts.test.ts.
const BASE = getRetailer('boots')!;
function withShipping(shipping: ShippingRule): Retailer {
  return { ...BASE, shipping };
}

const DAYS: [number, number] = [3, 5];

function noteFor(shipping: ShippingRule, itemPriceGbp: number): string {
  return deliveryPriceNote(resolveDelivery(withShipping(shipping), itemPriceGbp));
}

describe('deliveryPriceNote', () => {
  it('says "includes" for a stated, charged delivery cost', () => {
    expect(
      noteFor(
        { standardGbp: 3.99, freeOverGbp: 30, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'confirmed' },
        24.99,
      ),
    ).toBe('Incl. £3.99 delivery');
  });

  it('says "includes" for a shop that ships free on every order', () => {
    expect(
      noteFor(
        { standardGbp: 0, freeOverGbp: null, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'confirmed' },
        24.99,
      ),
    ).toBe('Incl. free delivery');
  });

  it('says "includes free" once the basket has met the free-delivery threshold', () => {
    expect(
      noteFor(
        { standardGbp: 3.99, freeOverGbp: 30, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'confirmed' },
        34.0,
      ),
    ).toBe('Incl. free delivery');
  });

  // The whole reason this helper exists rather than a template literal: the
  // number this line sits under is only a delivered price when the shop states
  // a delivery cost. Where it does not, the number is the item price, and the
  // line has to read as an addition rather than an inclusion.
  it('never says "includes" where the shop states no delivery cost', () => {
    const note = noteFor(
      { standardGbp: null, freeOverGbp: null, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'unverified' },
      24.99,
    );
    expect(note).toBe('Plus delivery');
    expect(note.toLowerCase()).not.toContain('includes');
  });

  it('never names a figure, and never says "free", where delivery is unstated', () => {
    const note = noteFor(
      { standardGbp: null, freeOverGbp: 30, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'unverified' },
      24.99,
    );
    expect(note).not.toMatch(/[£\d]/);
    expect(note.toLowerCase()).not.toContain('free');
  });

  // Confidence is a fact about the delivery figure, not about what the price
  // contains. It is carried on the facts line beside the same figure; this
  // line stays out of it, and this test pins that so the two cannot silently
  // start disagreeing about which line owns the caveat.
  it('reads the same whether or not the delivery figure is confirmed', () => {
    const confirmed = noteFor(
      { standardGbp: 4.5, freeOverGbp: null, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'confirmed' },
      24.99,
    );
    const indicative = noteFor(
      { standardGbp: 4.5, freeOverGbp: null, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'unverified' },
      24.99,
    );
    expect(confirmed).toBe('Incl. £4.50 delivery');
    expect(indicative).toBe(confirmed);
  });

  it('is never empty, so every row gets the same two-line price treatment', () => {
    const rules: ShippingRule[] = [
      { standardGbp: 3.99, freeOverGbp: 30, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'confirmed' },
      { standardGbp: 0, freeOverGbp: null, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'confirmed' },
      { standardGbp: null, freeOverGbp: null, estimatedDays: DAYS, verifiedAt: '2026-08-05', confidence: 'unverified' },
    ];
    for (const rule of rules) {
      expect(noteFor(rule, 24.99).length).toBeGreaterThan(0);
    }
  });
});

/**
 * The claim the note makes is only true because of what the row prints above
 * it. offerRow() prints `deliveredPriceGbp ?? itemPriceGbp`, so these check
 * the arithmetic that "Incl. £3.99 delivery" is asserting, against the same
 * presentOffer() the page calls — not against a restatement of it here.
 */
describe('the number the note sits under', () => {
  function offer(price: number): RawOffer {
    return {
      retailerId: BASE.id,
      variantId: 'v-1',
      price,
      currency: 'GBP',
      stock: 'inStock',
      url: 'https://example.com/p',
      fetchedAt: '2026-08-25T00:00:00.000Z',
    };
  }

  it('already contains the delivery the note claims it contains', () => {
    const retailer = withShipping({
      standardGbp: 3.99,
      freeOverGbp: 30,
      estimatedDays: DAYS,
      verifiedAt: '2026-08-05',
      confidence: 'confirmed',
    });
    const row = presentOffer(offer(24.99), retailer);
    expect(row.itemPriceGbp).toBe(24.99);
    expect(row.deliveredPriceGbp).toBe(28.98);
    expect(deliveryPriceNote(row.delivery)).toBe('Incl. £3.99 delivery');
    // The stated inclusion, checked as arithmetic rather than as a string.
    expect(row.deliveredPriceGbp! - row.itemPriceGbp).toBeCloseTo(3.99, 10);
  });

  it('is the item price, and says "plus", where delivery is unstated', () => {
    const retailer = withShipping({
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: DAYS,
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
    });
    const row = presentOffer(offer(40), retailer);
    expect(row.deliveredPriceGbp).toBeNull();
    expect(row.deliveredPriceGbp ?? row.itemPriceGbp).toBe(40);
    expect(deliveryPriceNote(row.delivery)).toBe('Plus delivery');
  });

  it('equals the item price where delivery is a sourced zero, and says so', () => {
    const retailer = withShipping({
      standardGbp: 0,
      freeOverGbp: null,
      estimatedDays: DAYS,
      verifiedAt: '2026-08-05',
      confidence: 'confirmed',
    });
    const row = presentOffer(offer(40), retailer);
    expect(row.deliveredPriceGbp).toBe(40);
    expect(deliveryPriceNote(row.delivery)).toBe('Incl. free delivery');
  });
});

// Every live shop in the registry, so a future entry with a shape none of the
// hand-written cases above cover cannot slip through with a note that claims
// an inclusion the delivered price does not have.
describe('across the real registry', () => {
  it('says "includes" exactly when a delivered price exists', () => {
    expect(RETAILERS.length).toBeGreaterThan(0);
    for (const retailer of RETAILERS) {
      const delivery: DeliveryDisplay = resolveDelivery(retailer, 24.99);
      const note = deliveryPriceNote(delivery);
      const hasDeliveredPrice = delivery.costGbp !== null;
      expect(note.startsWith('Incl.')).toBe(hasDeliveredPrice);
      if (!hasDeliveredPrice) expect(note).not.toMatch(/[£\d]/);
    }
  });
});

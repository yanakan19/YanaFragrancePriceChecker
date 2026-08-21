import { describe, expect, it } from 'vitest';
import { deliveryLines } from '../demo/deliveryFacts.js';
import { getRetailer } from '../src/config/retailers.js';
import type { Retailer, ShippingRule } from '../src/types/retailer.js';

// A real registry entry as the base (so every non-shipping field is a
// genuinely valid Retailer), with `shipping` fully replaced each time — the
// point is to test deliveryLines against deterministic, hand-chosen shipping
// data rather than whatever a real shop's own figures happen to be today,
// which move as the registry is re-verified.
const BASE = getRetailer('boots')!;
function withShipping(shipping: ShippingRule): Retailer {
  return { ...BASE, shipping };
}

const DAYS: [number, number] = [3, 5];

describe('deliveryLines', () => {
  it('states a known standard cost', () => {
    const lines = deliveryLines(
      withShipping({
        standardGbp: 3.95,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
      }),
    );
    expect(lines[0]).toBe('Standard delivery £3.95');
  });

  it('states free delivery on every order as its own fact, not "£0.00"', () => {
    const lines = deliveryLines(
      withShipping({
        standardGbp: 0,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
      }),
    );
    expect(lines[0]).toBe('Free standard delivery on every order');
  });

  // The two different reasons a null standardGbp can mean, kept apart in the
  // wording — this is the entire reason standardRateNotPublished exists (see
  // its own doc comment in src/types/retailer.ts).
  it('distinguishes "nobody has looked" from "the shop was read and states no rate"', () => {
    const unresearched = deliveryLines(
      withShipping({
        standardGbp: null,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'unverified',
      }),
    );
    expect(unresearched[0]).toContain('We have not established');

    const readAndSilent = deliveryLines(
      withShipping({
        standardGbp: null,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'unverified',
        standardRateNotPublished: true,
      }),
    );
    expect(readAndSilent[0]).toContain('This shop publishes no standard delivery cost');
  });

  it('names the confirmation source when one is recorded', () => {
    const lines = deliveryLines(
      withShipping({
        standardGbp: 3.95,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
        source: { url: 'https://example.com/delivery', quote: '£3.95 standard', readAt: '2026-08-01' },
      }),
    );
    expect(lines[1]).toBe('Read from this shop’s own delivery page on 2026-08-01');
  });

  it('says plainly when delivery terms have not been confirmed with the shop', () => {
    const lines = deliveryLines(
      withShipping({
        standardGbp: 3.95,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'unverified',
      }),
    );
    expect(lines[1]).toContain('Not yet confirmed with the shop');
  });

  it('states a free-delivery threshold when there is one, and its absence when there is none', () => {
    const withThreshold = deliveryLines(
      withShipping({
        standardGbp: 3.95,
        freeOverGbp: 25,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
      }),
    );
    expect(withThreshold).toContain('Free once you spend £25.00');

    const withoutThreshold = deliveryLines(
      withShipping({
        standardGbp: 2.99,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
      }),
    );
    expect(withoutThreshold).toContain('No spend based free delivery');
  });

  it('states the delivery window, collapsing a single-day window to one figure', () => {
    const range = deliveryLines(
      withShipping({
        standardGbp: 3.95, freeOverGbp: null, estimatedDays: [3, 5],
        verifiedAt: '2026-08-01', confidence: 'confirmed',
      }),
    );
    expect(range).toContain('Arrives in about 3 to 5 working days');

    const single = deliveryLines(
      withShipping({
        standardGbp: 3.95, freeOverGbp: null, estimatedDays: [1, 1],
        verifiedAt: '2026-08-01', confidence: 'confirmed',
      }),
    );
    expect(single).toContain('Arrives in about 1 working days');
  });

  it('includes a membership perk as a footnote when the shop has one', () => {
    const lines = deliveryLines(
      withShipping({
        standardGbp: 4.5,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
        membershipPerk: { scheme: 'Beautycard', description: 'Free delivery over £20 for members' },
      }),
    );
    expect(lines).toContain('Beautycard: Free delivery over £20 for members');
  });

  it('omits the membership line entirely when the shop has no scheme', () => {
    const lines = deliveryLines(
      withShipping({
        standardGbp: 3.95,
        freeOverGbp: null,
        estimatedDays: DAYS,
        verifiedAt: '2026-08-01',
        confidence: 'confirmed',
      }),
    );
    expect(lines.some((l) => l.includes('member'))).toBe(false);
  });
});

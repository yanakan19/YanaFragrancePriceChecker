import { describe, expect, it } from 'vitest';
import { buildDiscount, canShowCountdown } from '../src/services/discount.js';
import type { RawOffer } from '../src/types/offer.js';

function offer(over: Partial<RawOffer> = {}): RawOffer {
  return {
    retailerId: 'boots',
    variantId: 'sauvage-edp-100',
    price: 80,
    currency: 'GBP',
    stock: 'inStock',
    url: 'https://www.boots.com/p/1',
    fetchedAt: '2026-08-01T12:00:00Z',
    ...over,
  };
}

describe('buildDiscount', () => {
  it('returns null when the retailer published no reference price', () => {
    expect(buildDiscount(offer())).toBeNull();
    expect(buildDiscount(offer({ wasPrice: null }))).toBeNull();
  });

  it('builds was/now/percent from a genuine promotion', () => {
    const d = buildDiscount(offer({ price: 80, wasPrice: 100 }))!;
    expect(d.wasPrice).toBe(100);
    expect(d.nowPrice).toBe(80);
    expect(d.savingGbp).toBe(20);
    expect(d.percentOff).toBe(20);
  });

  it('rounds the percentage down, never up', () => {
    // 19.6% off must not be advertised as 20%.
    const d = buildDiscount(offer({ price: 80.4, wasPrice: 100 }))!;
    expect(d.percentOff).toBe(19);
  });

  it('ignores a stale RRP that is at or below the current price', () => {
    expect(buildDiscount(offer({ price: 80, wasPrice: 80 }))).toBeNull();
    expect(buildDiscount(offer({ price: 80, wasPrice: 75 }))).toBeNull();
  });

  it('ignores a saving too small to reach one percent', () => {
    expect(buildDiscount(offer({ price: 99.5, wasPrice: 100 }))).toBeNull();
  });

  it('ignores a non-finite reference price', () => {
    expect(buildDiscount(offer({ price: 80, wasPrice: Number.NaN }))).toBeNull();
  });

  it('carries the retailer end time through, and null when absent', () => {
    expect(buildDiscount(offer({ wasPrice: 100 }))!.endsAt).toBeNull();
    expect(
      buildDiscount(offer({ wasPrice: 100, promoEndsAt: '2026-08-05T23:59:00Z' }))!.endsAt,
    ).toBe('2026-08-05T23:59:00Z');
  });
});

describe('canShowCountdown', () => {
  const now = new Date('2026-08-01T12:00:00Z');

  it('is false when there is no discount at all', () => {
    expect(canShowCountdown(null, now)).toBe(false);
  });

  it('is false when the retailer published no end time', () => {
    // Never invent an expiry — a fabricated countdown is pressure selling.
    const d = buildDiscount(offer({ wasPrice: 100 }));
    expect(canShowCountdown(d, now)).toBe(false);
  });

  it('is true for a retailer-published end time in the future', () => {
    const d = buildDiscount(offer({ wasPrice: 100, promoEndsAt: '2026-08-05T23:59:00Z' }));
    expect(canShowCountdown(d, now)).toBe(true);
  });

  it('is false once the promotion has expired', () => {
    const d = buildDiscount(offer({ wasPrice: 100, promoEndsAt: '2026-07-30T23:59:00Z' }));
    expect(canShowCountdown(d, now)).toBe(false);
  });

  it('is false for an unparseable end time', () => {
    const d = buildDiscount(offer({ wasPrice: 100, promoEndsAt: 'soon' }));
    expect(canShowCountdown(d, now)).toBe(false);
  });
});

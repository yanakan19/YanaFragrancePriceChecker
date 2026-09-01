import { describe, expect, it } from 'vitest';
import { presentOffer, STALE_OFFER_DAYS } from '../src/services/priceService.js';
import {
  cheapestVerdict,
  deliveredPriceRange,
  tooCloseToCallNote,
} from '../src/services/deliveryConfidence.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { RawOffer, PresentedOffer } from '../src/types/offer.js';
import type { Retailer, ShippingRule } from '../src/types/retailer.js';

const NOW = new Date('2026-08-13T12:00:00Z');

/**
 * Retailers are built here rather than taken from the registry, because the
 * registry is the thing this logic exists to survive changes in: the day
 * somebody confirms Boots' delivery page, a test pinned to Boots being
 * unverified starts failing for a reason that has nothing to do with the rule
 * being tested.
 */
const BASE = RETAILERS[0]!;

function shop(id: string, shipping: Partial<ShippingRule>): Retailer {
  return {
    ...BASE,
    id,
    name: id,
    enabled: true,
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-01',
      confidence: 'confirmed',
      ...shipping,
    },
  };
}

function row(
  retailer: Retailer,
  price: number,
  stock: RawOffer['stock'] = 'inStock',
  fetchedAt = '2026-08-13T11:55:00Z',
): PresentedOffer {
  const raw: RawOffer = {
    retailerId: retailer.id,
    variantId: 'v1',
    price,
    currency: 'GBP',
    stock,
    url: 'https://example.com/p/1',
    fetchedAt,
  };
  return presentOffer(raw, retailer, NOW);
}

/** `fetchedAt` `days` before NOW, as an ISO string — for staleness tests. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('deliveredPriceRange', () => {
  it('collapses to a point for a confirmed delivery rule', () => {
    const r = deliveredPriceRange(row(shop('confirmed', { standardGbp: 3.99 }), 20))!;
    expect(r).toEqual({ lowGbp: 23.99, highGbp: 23.99, uncertain: false });
  });

  it('spans from the item price to item plus the standard rate when unverified', () => {
    // Unverified means we cannot show the charge applies, and cannot show it
    // does not. Both ends are figures the registry actually holds; nothing in
    // between is invented and nothing beyond it is claimed.
    const r = deliveredPriceRange(row(shop('unsure', { standardGbp: 2.99, confidence: 'unverified' }), 20))!;
    expect(r).toEqual({ lowGbp: 20, highGbp: 22.99, uncertain: true });
  });

  it('keeps the standard rate as the top of the range when a threshold made this basket free', () => {
    // The £25 threshold is exactly as unverified as the £2.99 is. If it is
    // wrong this order is charged, so the top of the range has to allow for it.
    const free = shop('threshold', { standardGbp: 2.99, freeOverGbp: 25, confidence: 'unverified' });
    const r = deliveredPriceRange(row(free, 30))!;
    expect(r.lowGbp).toBe(30);
    expect(r.highGbp).toBe(32.99);
  });

  it('is null when the shop states no delivery cost at all', () => {
    expect(deliveredPriceRange(row(shop('silent', { standardGbp: null }), 20))).toBeNull();
  });
});

describe('cheapestVerdict', () => {
  const confirmed = shop('confirmed-shop', { standardGbp: 3.99 });
  const unverified = shop('unverified-shop', { standardGbp: 2.99, confidence: 'unverified' });

  it('allows the label when the lead survives the worst reading of every figure', () => {
    // 19.99 + up to 2.99 = 22.98 at worst, against 30.00 + 3.99 confirmed.
    const v = cheapestVerdict([row(unverified, 19.99), row(confirmed, 30)]);
    expect(v.decided).toBe(true);
    expect(v.reason).toBe('clear');
    expect(v.offer!.retailer.id).toBe('unverified-shop');
    expect(v.overlapGbp).toBe(0);
    expect(tooCloseToCallNote(v)).toBeNull();
  });

  it('withholds the label when an unverified charge is what decides the order', () => {
    // 21.00 + 2.99 = 23.99 leads 22.50 + 2.99 = 25.49 by £1.50. But the runner
    // up's £2.99 is unverified too, and if it is not actually charged that shop
    // costs £22.50, which beats the leader. The two possible prices overlap, so
    // which is cheaper is not established and the label goes.
    const rival = shop('unverified-rival', { standardGbp: 2.99, confidence: 'unverified' });
    const v = cheapestVerdict([row(unverified, 21), row(rival, 22.5)]);
    expect(v.decided).toBe(false);
    expect(v.reason).toBe('within-unverified-delivery');
    expect(v.marginGbp).toBe(1.5);
    expect(v.overlapGbp).toBe(1.49);
    expect(tooCloseToCallNote(v)).toContain('Too close to call');
    expect(tooCloseToCallNote(v)).toContain('unverified-shop');
  });

  it('withholds it when a free-delivery threshold we have not confirmed is the reason', () => {
    // The leader is free here only because its unverified £25 threshold is met.
    // If that threshold is wrong the order is charged £2.99, taking it to
    // £25.99 and behind a runner up whose own figure is confirmed.
    const freeAt25 = shop('threshold-shop', {
      standardGbp: 2.99,
      freeOverGbp: 25,
      confidence: 'unverified',
    });
    const rival = shop('confirmed-rival', { standardGbp: 1.5 });
    const v = cheapestVerdict([row(freeAt25, 25), row(rival, 24)]);
    expect(v.offer!.retailer.id).toBe('threshold-shop');
    expect(v.offer!.deliveredPriceGbp).toBe(25);
    expect(v.decided).toBe(false);
    expect(tooCloseToCallNote(v)).toContain('threshold-shop');
  });

  it('two confirmed rules always settle it, however small the gap', () => {
    const other = shop('confirmed-two', { standardGbp: 3.99 });
    const v = cheapestVerdict([row(confirmed, 20), row(other, 20.01)]);
    expect(v.decided).toBe(true);
    expect(v.marginGbp).toBe(0.01);
  });

  it('a single comparable offer has no ordering to get wrong', () => {
    const v = cheapestVerdict([row(unverified, 19.99)]);
    expect(v.decided).toBe(true);
    expect(v.reason).toBe('sole-offer');
  });

  it('never decides on an out-of-stock row', () => {
    const v = cheapestVerdict([row(confirmed, 5, 'outOfStock'), row(confirmed, 50)]);
    expect(v.offer!.itemPriceGbp).toBe(50);
    expect(v.reason).toBe('sole-offer');
  });

  it('reports no offers when nothing is buyable', () => {
    const v = cheapestVerdict([row(confirmed, 5, 'outOfStock')]);
    expect(v.offer).toBeNull();
    expect(v.decided).toBe(false);
    expect(v.reason).toBe('no-offers');
  });

  it('says delivery is unstated rather than calling such a row cheapest', () => {
    const silent = shop('silent-shop', { standardGbp: null });
    const v = cheapestVerdict([row(silent, 15)]);
    expect(v.decided).toBe(false);
    expect(v.reason).toBe('delivery-unstated');
    expect(v.offer!.deliveredPriceGbp).toBeNull();
  });

  it('ignores a cheaper unstated-delivery row when a comparable one exists', () => {
    // The unstated row sorts below every comparable one, so the contest is
    // between the rows that can actually be compared.
    const silent = shop('silent-shop', { standardGbp: null });
    const v = cheapestVerdict([row(confirmed, 40), row(silent, 15)]);
    expect(v.offer!.retailer.id).toBe('confirmed-shop');
    expect(v.reason).toBe('sole-offer');
    expect(v.decided).toBe(true);
  });

  it('an unverified always-free claim is not treated as uncertainty it cannot bound', () => {
    // standardGbp 0 says this shop never charges. If that is wrong there is no
    // figure anywhere to say by how much, so the range stays a point and the
    // caveat is carried by the row's own "not confirmed" wording instead of by
    // a number nobody has.
    const alwaysFree = shop('free-shop', { standardGbp: 0, confidence: 'unverified' });
    const r = deliveredPriceRange(row(alwaysFree, 20))!;
    expect(r).toEqual({ lowGbp: 20, highGbp: 20, uncertain: false });
  });
});

describe('cheapestVerdict and staleness', () => {
  const confirmed = shop('confirmed-shop', { standardGbp: 3.99 });
  const other = shop('confirmed-two', { standardGbp: 3.99 });

  it('picks the fresh, costlier row over a cheaper stale one, and still calls it Cheapest', () => {
    const stale = row(other, 10, 'inStock', daysAgo(STALE_OFFER_DAYS + 1));
    const fresh = row(confirmed, 15, 'inStock', daysAgo(1));
    const v = cheapestVerdict([stale, fresh]);
    expect(v.offer!.retailer.id).toBe('confirmed-shop');
    expect(v.decided).toBe(true);
    expect(v.reason).toBe('sole-offer');
  });

  it('withholds "Cheapest" when every buyable row is stale, but still names one', () => {
    const bothStale = [
      row(confirmed, 20, 'inStock', daysAgo(STALE_OFFER_DAYS + 3)),
      row(other, 25, 'inStock', daysAgo(STALE_OFFER_DAYS + 1)),
    ];
    const v = cheapestVerdict(bothStale);
    expect(v.offer!.retailer.id).toBe('confirmed-shop');
    expect(v.offer!.stale).toBe(true);
    expect(v.decided).toBe(false);
    expect(v.reason).toBe('stale-only');
  });

  it('does not call a stale row stale-only when a fresh one is available instead', () => {
    const v = cheapestVerdict([
      row(confirmed, 999, 'inStock', daysAgo(STALE_OFFER_DAYS + 5)),
      row(other, 20, 'inStock', daysAgo(2)),
    ]);
    expect(v.reason).not.toBe('stale-only');
    expect(v.offer!.stale).toBe(false);
  });

  it('does not flag a shop visited a handful of days ago as stale-only', () => {
    // The rotation case that must never be caught — see STALE_OFFER_DAYS.
    const v = cheapestVerdict([row(confirmed, 20, 'inStock', daysAgo(6))]);
    expect(v.reason).toBe('sole-offer');
    expect(v.decided).toBe(true);
  });

  it('exactly at the boundary is still fresh, not stale-only', () => {
    const v = cheapestVerdict([row(confirmed, 20, 'inStock', daysAgo(STALE_OFFER_DAYS))]);
    expect(v.offer!.stale).toBe(false);
    expect(v.reason).toBe('sole-offer');
  });
});

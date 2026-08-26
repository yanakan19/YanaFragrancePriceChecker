import { describe, expect, it } from 'vitest';
import { priceHistoryGapMessage, type PriceHistoryGap } from '../src/services/priceHistoryGaps.js';

describe('priceHistoryGapMessage', () => {
  it('states plainly that nothing has ever been recorded, for the "never" reason', () => {
    const gap: PriceHistoryGap = { reason: 'never' };
    expect(priceHistoryGapMessage(gap)).toBe('No price has been recorded for this fragrance yet.');
  });

  it('names the date range and says every reading was out of stock, for the "sold-out" reason', () => {
    const gap: PriceHistoryGap = { reason: 'sold-out', firstAt: '2026-08-05T10:00:00Z', lastAt: '2026-08-19T10:00:00Z' };
    const msg = priceHistoryGapMessage(gap);
    expect(msg).toContain('5 Aug');
    expect(msg).toContain('19 Aug');
    expect(msg).toContain('out of stock');
    // The hard rule this whole feature exists for: never state an out of
    // stock listing's actual price, even in the sentence explaining why
    // there is no chart.
    expect(msg).not.toMatch(/£\d/);
  });

  it('names the one real buyable price on record, for the "not-enough" reason', () => {
    const gap: PriceHistoryGap = { reason: 'not-enough', priceGbp: 45, retailerId: 'allbeauty', at: '2026-08-12T09:00:00Z' };
    const msg = priceHistoryGapMessage(gap);
    expect(msg).toContain('£45.00');
    expect(msg).toContain('Allbeauty');
    expect(msg).toContain('12 Aug');
  });

  it('falls back to the raw retailer id when it does not resolve, rather than throwing', () => {
    const gap: PriceHistoryGap = { reason: 'not-enough', priceGbp: 30, retailerId: 'not-a-real-retailer', at: '2026-08-12T09:00:00Z' };
    expect(priceHistoryGapMessage(gap)).toContain('not-a-real-retailer');
  });

  it('names the latest same-day price and the single day, for the "same-day" reason', () => {
    const gap: PriceHistoryGap = { reason: 'same-day', priceGbp: 19.9, retailerId: 'allbeauty', at: '2026-08-14T20:36:06Z' };
    const msg = priceHistoryGapMessage(gap);
    expect(msg).toContain('£19.90');
    expect(msg).toContain('Allbeauty');
    expect(msg).toContain('14 Aug');
  });

  it('never uses a hyphen, en dash or em dash — house style for reader facing text', () => {
    const gaps: PriceHistoryGap[] = [
      { reason: 'never' },
      { reason: 'sold-out', firstAt: '2026-08-05T10:00:00Z', lastAt: '2026-08-19T10:00:00Z' },
      { reason: 'not-enough', priceGbp: 45, retailerId: 'allbeauty', at: '2026-08-12T09:00:00Z' },
      { reason: 'same-day', priceGbp: 19.9, retailerId: 'allbeauty', at: '2026-08-14T20:36:06Z' },
    ];
    for (const gap of gaps) {
      const msg = priceHistoryGapMessage(gap);
      expect(msg).not.toMatch(/[-–—]/);
    }
  });
});

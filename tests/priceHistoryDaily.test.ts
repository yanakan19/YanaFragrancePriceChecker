import { describe, expect, it } from 'vitest';
import { dailyHistory, dayKey, type RawHistoryPoint } from '../src/services/priceHistoryDaily.js';

const point = (at: string, priceGbp: number | null, retailerId: string | null = 'allbeauty'): RawHistoryPoint => ({
  at,
  priceGbp,
  retailerId,
});

describe('dayKey', () => {
  it('takes the first 10 characters of an ISO timestamp', () => {
    expect(dayKey('2026-08-06T11:22:33Z')).toBe('2026-08-06');
  });
});

describe('dailyHistory', () => {
  it('repeats the last real price forward on a quiet day, marking it carried', () => {
    const days = dailyHistory([point('2026-08-01T10:00:00Z', 10, 'allbeauty')], '2026-08-01', '2026-08-03', true);
    expect(days.map((d) => [d.dateKey, d.priceGbp, d.isCarried])).toEqual([
      ['2026-08-01', 10, false],
      ['2026-08-02', 10, true],
      ['2026-08-03', 10, true],
    ]);
  });

  it('leaves every day before the first sighting blank rather than carrying backwards', () => {
    const days = dailyHistory([point('2026-08-03T10:00:00Z', 10)], '2026-08-01', '2026-08-03', true);
    expect(days.map((d) => d.priceGbp)).toEqual([null, null, 10]);
  });

  it('stops carrying after the last reading once the fragrance is no longer purchasable', () => {
    const days = dailyHistory([point('2026-08-01T10:00:00Z', 10)], '2026-08-01', '2026-08-03', false);
    expect(days.map((d) => d.priceGbp)).toEqual([10, null, null]);
  });

  it('keeps carrying past the last reading while the fragrance is still purchasable', () => {
    const days = dailyHistory([point('2026-08-01T10:00:00Z', 10)], '2026-08-01', '2026-08-03', true);
    expect(days.map((d) => [d.priceGbp, d.isCarried])).toEqual([
      [10, false],
      [10, true],
      [10, true],
    ]);
  });

  it('takes the cheapest of several same-day readings', () => {
    const days = dailyHistory(
      [point('2026-08-01T09:00:00Z', 24.99), point('2026-08-01T18:00:00Z', 19.99)],
      '2026-08-01',
      '2026-08-01',
      true,
    );
    expect(days[0]?.priceGbp).toBe(19.99);
  });

  /**
   * The regression test for the residual carry forward case
   * scripts/build-price-history.ts's own header describes: a fragrance goes
   * unavailable everywhere and comes back at the *same* price, so the price
   * series alone (with no gap marker) would show no change at all and this
   * function would happily carry the old price straight across days it was
   * genuinely not buyable. A `priceGbp: null` gap marker between the two
   * readings must break that — the days in between stay blank, not carried,
   * even though the price either side is identical.
   */
  it('breaks the carry forward across an explicit gap marker, even when the price either side is unchanged', () => {
    const days = dailyHistory(
      [point('2026-08-01T10:00:00Z', 10), point('2026-08-03T10:00:00Z', null, null), point('2026-08-06T10:00:00Z', 10)],
      '2026-08-01',
      '2026-08-06',
      true,
    );
    expect(days.map((d) => [d.dateKey, d.priceGbp, d.isCarried])).toEqual([
      ['2026-08-01', 10, false],
      ['2026-08-02', 10, true], // still carrying, the gap has not been reached yet
      ['2026-08-03', null, false], // the gap marker itself: blank, not carried
      ['2026-08-04', null, false], // still inside the gap: carrying was reset to null
      ['2026-08-05', null, false],
      ['2026-08-06', 10, false], // a fresh real reading resumes the line
    ]);
  });

  it('does not widen the gap onto a day that actually has a real price', () => {
    // A gap marker and a real reading landing on the same calendar day: the
    // real price wins, because something genuinely was buyable that day.
    const days = dailyHistory(
      [point('2026-08-01T02:00:00Z', null, null), point('2026-08-01T20:00:00Z', 10)],
      '2026-08-01',
      '2026-08-01',
      true,
    );
    expect(days[0]?.priceGbp).toBe(10);
  });

  it('never re-carries a price whose gap marker already fired for a later quiet day', () => {
    // Once the gap marker at day 3 resets carrying, day 4 and 5 have no
    // event of their own at all — they must stay blank rather than reviving
    // the pre-gap price just because nothing new happened that day either.
    const days = dailyHistory(
      [point('2026-08-01T10:00:00Z', 10), point('2026-08-03T10:00:00Z', null, null)],
      '2026-08-01',
      '2026-08-05',
      true,
    );
    expect(days.map((d) => d.priceGbp)).toEqual([10, 10, null, null, null]);
  });
});

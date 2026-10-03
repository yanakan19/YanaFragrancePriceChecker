import { describe, expect, it } from 'vitest';
import { mergeCheapestSeries } from '../src/services/priceHistoryMerge.js';
import type { RawHistoryPoint } from '../src/services/priceHistoryDaily.js';

const p = (at: string, priceGbp: number | null, retailerId: string | null = priceGbp === null ? null : 'a'): RawHistoryPoint => ({
  at: `2026-09-${at}T00:00:00Z`,
  priceGbp,
  retailerId,
});

describe('mergeCheapestSeries', () => {
  it('returns one series unchanged and nothing for none', () => {
    expect(mergeCheapestSeries([])).toEqual([]);
    const one = [p('01', 10), p('03', 12)];
    expect(mergeCheapestSeries([one, []])).toEqual(one);
  });

  it('takes the cheapest held value at every change, holding each series between its points', () => {
    const a = [p('01', 30, 'a'), p('10', 26, 'a')];
    const b = [p('05', 28, 'b'), p('12', 32, 'b')];
    expect(mergeCheapestSeries([a, b])).toEqual([p('01', 30, 'a'), p('05', 28, 'b'), p('10', 26, 'a')]);
  });

  it('writes a gap only when nothing under any id is buyable, and only at the transition', () => {
    const a = [p('01', 30, 'a'), p('04', null)];
    const b = [p('02', 31, 'b'), p('06', null), p('08', 29, 'b')];
    expect(mergeCheapestSeries([a, b])).toEqual([p('01', 30, 'a'), p('04', 31, 'b'), p('06', null), p('08', 29, 'b')]);
  });

  it('never opens with a gap, and breaks a price tie on the lower retailer id as the replay does', () => {
    const a = [p('01', null), p('02', 20, 'z')];
    const b = [p('02', 20, 'm')];
    expect(mergeCheapestSeries([a, b])).toEqual([p('02', 20, 'm')]);
  });
});

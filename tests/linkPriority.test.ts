import { describe, expect, it } from 'vitest';
import { checkOrder, checkState, interleave, priorityOrder } from '../src/catalogue/linkPriority.js';

const item = (baseKey: string, offers: number) => ({ baseKey, offers });

describe('interleave', () => {
  it('takes every list\'s best before any list\'s second best', () => {
    expect(interleave([['a1', 'a2', 'a3'], ['b1', 'b2'], ['c1']])).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'a3']);
  });

  it('handles no lists and empty lists', () => {
    expect(interleave([])).toEqual([]);
    expect(interleave([[], ['x']])).toEqual(['x']);
  });
});

describe('priorityOrder', () => {
  const items = [item('low', 1), item('top', 9), item('deal', 3), item('mid', 5), item('brandtop', 2)];

  it('puts tiers first, in each tier\'s own order, then the rest by offers', () => {
    const out = priorityOrder(items, [['top'], ['deal'], ['brandtop']]).map((i) => i.baseKey);
    expect(out).toEqual(['top', 'deal', 'brandtop', 'mid', 'low']);
  });

  it('lists a perfume once, at its first position, and ignores keys the catalogue does not have', () => {
    const out = priorityOrder(items, [['deal', 'ghost'], ['deal', 'top']]).map((i) => i.baseKey);
    expect(out).toEqual(['deal', 'top', 'mid', 'brandtop', 'low']);
  });

  it('breaks offer ties by key, so every run gives the same order', () => {
    const tied = [item('b', 1), item('a', 1), item('c', 1)];
    expect(priorityOrder(tied, []).map((i) => i.baseKey)).toEqual(['a', 'b', 'c']);
  });

  it('keeps everything when there are no tiers', () => {
    expect(priorityOrder(items, [])).toHaveLength(items.length);
  });
});

describe('checkState / checkOrder', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it('classifies by age against the re-check age', () => {
    expect(checkState(undefined, 60, now)).toBe('never');
    expect(checkState('nonsense', 60, now)).toBe('never');
    expect(checkState(daysAgo(10), 60, now)).toBe('fresh');
    expect(checkState(daysAgo(59), 60, now)).toBe('fresh');
    expect(checkState(daysAgo(60), 60, now)).toBe('stale');
    expect(checkState(daysAgo(400), 60, now)).toBe('stale');
  });

  it('does never-checked first, re-checks last, and drops what is fresh, keeping priority order within each', () => {
    const states: Record<string, 'never' | 'stale' | 'fresh'> = { a: 'stale', b: 'never', c: 'fresh', d: 'stale', e: 'never' };
    expect(checkOrder(['a', 'b', 'c', 'd', 'e'], (k) => states[k]!)).toEqual(['b', 'e', 'a', 'd']);
  });
});

import { describe, expect, it } from 'vitest';
import type { DemoFragrance } from '../demo/data.js';
import { compareVariants } from '../demo/data.js';
import { LIST_SORT_OPTIONS, sortFragrances } from '../demo/listSort.js';

/**
 * Fixtures rather than the live catalogue: these assert the comparator's own
 * rules, which must hold whatever today's harvest happens to contain. The
 * live-data properties of the leading list are covered separately in
 * tests/byPopularity.test.ts.
 */
const frag = (over: Partial<DemoFragrance> & { id: string }): DemoFragrance =>
  ({
    brand: 'Brand', name: 'Name', sizeMl: 100, concentration: 'Eau de Parfum',
    tier: 'designer', popularity: 1, photoUrl: null, notes: null,
    ...over,
  }) as DemoFragrance;

const ids = (list: DemoFragrance[]) => list.map((f) => f.id);

describe('LIST_SORT_OPTIONS', () => {
  it('offers the four original orderings plus both size directions', () => {
    expect(LIST_SORT_OPTIONS.map((o) => o.value)).toEqual([
      'az', 'za', 'price-low', 'price-high', 'size-low', 'size-high',
    ]);
  });

  it('labels the size options in the same house style as the price ones', () => {
    const byValue = Object.fromEntries(LIST_SORT_OPTIONS.map((o) => [o.value, o.label]));
    expect(byValue['size-low']).toBe('Smallest Size');
    expect(byValue['size-high']).toBe('Largest Size');
  });
});

describe('sortFragrances by size', () => {
  const mixed = [
    frag({ id: 'c', sizeMl: 100 }),
    frag({ id: 'a', sizeMl: 10 }),
    frag({ id: 'b', sizeMl: 50 }),
  ];

  it('puts the smallest bottle first ascending', () => {
    expect(ids(sortFragrances(mixed, 'size-low'))).toEqual(['a', 'b', 'c']);
  });

  it('puts the largest bottle first descending', () => {
    expect(ids(sortFragrances(mixed, 'size-high'))).toEqual(['c', 'b', 'a']);
  });

  // The bug this branch exists to avoid: compareVariants is ascending by
  // definition, so reusing it to finish a descending sort would order every
  // group of same-sized bottles smallest-first inside a largest-first list.
  // Here the tie is on size, so only name may decide it — in both directions.
  it('breaks a size tie on name, not on size, in both directions', () => {
    const tied = [
      frag({ id: 'z', brand: 'Zimaya', sizeMl: 50 }),
      frag({ id: 'a', brand: 'Armaf', sizeMl: 50 }),
    ];
    expect(ids(sortFragrances(tied, 'size-low'))).toEqual(['a', 'z']);
    expect(ids(sortFragrances(tied, 'size-high'))).toEqual(['a', 'z']);
  });

  it('is a total order, so the same input always sorts the same way', () => {
    const same = [frag({ id: 'b', sizeMl: 50 }), frag({ id: 'a', sizeMl: 50 })];
    expect(ids(sortFragrances(same, 'size-high'))).toEqual(['a', 'b']);
    expect(ids(sortFragrances([...same].reverse(), 'size-high'))).toEqual(['a', 'b']);
  });

  it('does not mutate the list it is given', () => {
    const input = [frag({ id: 'c', sizeMl: 100 }), frag({ id: 'a', sizeMl: 10 })];
    sortFragrances(input, 'size-low');
    expect(ids(input)).toEqual(['c', 'a']);
  });
});

describe('sortFragrances by name', () => {
  // Unchanged behaviour, pinned here because the size branch was added above
  // it and a fall-through mistake would land in exactly this case.
  it('still ends a name sort on bottle size, smallest first, in both directions', () => {
    const sizes = [
      frag({ id: 'big', sizeMl: 100 }),
      frag({ id: 'small', sizeMl: 30 }),
    ];
    expect(ids(sortFragrances(sizes, 'az'))).toEqual(['small', 'big']);
    expect(ids(sortFragrances(sizes, 'za'))).toEqual(['small', 'big']);
  });
});

/**
 * A product whose own title states two conflicting sizes (see
 * DemoFragrance.sizeMl's own comment and sizeConflict in
 * src/catalogue/fragranceId.ts) carries `sizeMl: null` by the time it
 * reaches this comparator. These tests are the "seven ambiguous listings"
 * case for the sort a reader actually touches: whichever direction they
 * pick, an unreadable size must never read as the smallest or the largest
 * bottle in the list, and it must never silently produce `NaN` the way a
 * bare `a.sizeMl - b.sizeMl` would.
 */
describe('sortFragrances by size: an unknown size', () => {
  const withUnknown = [
    frag({ id: 'known-big', sizeMl: 100 }),
    frag({ id: 'unknown', sizeMl: null }),
    frag({ id: 'known-small', sizeMl: 10 }),
  ];

  it('sorts last, not first, ascending', () => {
    expect(ids(sortFragrances(withUnknown, 'size-low'))).toEqual(['known-small', 'known-big', 'unknown']);
  });

  // The exact bug a naive `b.sizeMl - a.sizeMl` descending rule would
  // reintroduce: negating a value built from an unknown-is-Infinity
  // substitution would put the unknown bottle first instead of last.
  it('still sorts last, not first, descending', () => {
    expect(ids(sortFragrances(withUnknown, 'size-high'))).toEqual(['known-big', 'known-small', 'unknown']);
  });

  it('breaks a tie between two unknown sizes on name, not NaN', () => {
    const bothUnknown = [
      frag({ id: 'z', brand: 'Zimaya', sizeMl: null }),
      frag({ id: 'a', brand: 'Armaf', sizeMl: null }),
    ];
    expect(ids(sortFragrances(bothUnknown, 'size-low'))).toEqual(['a', 'z']);
    expect(ids(sortFragrances(bothUnknown, 'size-high'))).toEqual(['a', 'z']);
  });

  it('does not throw or produce NaN ordering for an all-unknown list', () => {
    const result = sortFragrances(
      [frag({ id: 'b', brand: 'B', sizeMl: null }), frag({ id: 'a', brand: 'A', sizeMl: null })],
      'size-high',
    );
    expect(ids(result)).toEqual(['a', 'b']);
  });
});

/**
 * compareVariants is the tiebreaker every non-size sort ends on (az, za,
 * price-low, price-high — see sortFragrances' own header) and the rule
 * BY_POPULARITY in demo/data.ts uses directly. An unknown size must lose
 * that tiebreak to any known size rather than being read as size zero, which
 * would put it first.
 */
describe('compareVariants: an unknown size sorts after every known size', () => {
  it('places the unknown-size variant last', () => {
    const a = frag({ id: 'a', sizeMl: null });
    const b = frag({ id: 'b', sizeMl: 10 });
    expect(compareVariants(a, b)).toBeGreaterThan(0);
    expect(compareVariants(b, a)).toBeLessThan(0);
  });

  it('falls back to id, not to a NaN comparison, when both are unknown', () => {
    const a = frag({ id: 'a', sizeMl: null });
    const b = frag({ id: 'b', sizeMl: null });
    expect(compareVariants(a, b)).toBeLessThan(0);
    expect(compareVariants(b, a)).toBeGreaterThan(0);
  });
});

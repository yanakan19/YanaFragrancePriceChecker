import type { DemoFragrance } from './data.js';
import { compareVariants, lowestPrice } from './data.js';

/**
 * How a list of fragrances can be ordered, and the comparator that does it.
 *
 * Split out of demo/app.ts rather than left beside the views that call it, for
 * the same reason demo/volumeBands.ts is: app.ts calls `init()` against
 * `document` at module scope, so importing it from a Node test either throws
 * `document is not defined` or spends the time to transform the whole
 * generated catalogue. A comparator with this many branches is exactly the
 * kind of thing that should have tests, so it lives where tests can reach it.
 */
export type ListSort = 'az' | 'za' | 'price-low' | 'price-high' | 'size-low' | 'size-high';

/**
 * What browse and search can be ordered by.
 *
 * `stocked` is the order that list already arrived in — BY_POPULARITY, shop
 * count first — and remains its default, so offering this control changed
 * nothing about the page until a reader touches it. It is deliberately not
 * part of ListSort: the other three lists using that type are each already
 * scoped to one brand, note or retailer, where "most stocked" is a far weaker
 * statement than it is across the whole catalogue.
 */
export type BrowseSort = ListSort | 'stocked';

/** The six orderings offered wherever a fragrance list can be sorted. */
export const LIST_SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: 'az', label: 'A To Z' },
  { value: 'za', label: 'Z To A' },
  { value: 'price-low', label: 'Lowest Price' },
  { value: 'price-high', label: 'Highest Price' },
  { value: 'size-low', label: 'Smallest Size' },
  { value: 'size-high', label: 'Largest Size' },
];

/**
 * Every sort *except the two size sorts* ends on bottle size, smallest first.
 *
 * Without that last step the name and price sorts only ever compared brand,
 * name or price, all three of which are identical across the sizes of one
 * perfume — so the three Versace Dylan Blue bottles came out in whatever order
 * the input happened to be in, which read as 10ml, 50ml, 30ml. Size ascending
 * is the tiebreaker in all four of those directions, including Z to A:
 * reversing the alphabet is a statement about names, not a reason to start
 * listing bottles largest first. See compareVariants in demo/data.ts.
 *
 * The two size sorts are the exception, and have to be, because there size is
 * the primary comparison rather than the tiebreaker. compareVariants is
 * ascending by definition, so finishing "Largest Size" with it would order
 * every group of same-sized bottles smallest-first inside a largest-first
 * list. They break ties on name and finish on id instead — still a total
 * order, just not one that can contradict its own heading.
 */
export function sortFragrances(list: DemoFragrance[], sort: ListSort): DemoFragrance[] {
  return [...list].sort((a, b) => {
    if (sort === 'az' || sort === 'za') {
      const names = `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
      if (names !== 0) return sort === 'az' ? names : -names;
      return compareVariants(a, b);
    }
    if (sort === 'size-low' || sort === 'size-high') {
      if (a.sizeMl !== b.sizeMl) return sort === 'size-low' ? a.sizeMl - b.sizeMl : b.sizeMl - a.sizeMl;
      const names = `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
      if (names !== 0) return names;
      return a.id.localeCompare(b.id);
    }
    const diff = lowestPrice(a.id) - lowestPrice(b.id);
    if (diff !== 0) return sort === 'price-low' ? diff : -diff;
    const names = `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
    if (names !== 0) return names;
    return compareVariants(a, b);
  });
}

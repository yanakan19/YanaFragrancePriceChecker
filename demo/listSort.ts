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

/**
 * The words every sort control opens with, shown beside the select (see
 * `control` in demo/app.ts) and never inside an option. Every option names
 * both ends of its order, so together they read "Sort By: Lowest to Highest
 * Price". Owner's rule, 2026-10-04: a sort must always say that it is a sort,
 * and say where the list starts and where it ends.
 */
export const SORT_LEAD = 'Sort By:';

/** One option of a sort control, whatever list it sorts. */
export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * The six orderings offered wherever a fragrance list can be sorted. Each
 * label names both ends, in Title Case, with no hyphen or dash. The values,
 * and so every URL and saved state built from them, are unchanged.
 */
export const LIST_SORT_OPTIONS: SortOption<ListSort>[] = [
  { value: 'az', label: 'A to Z' },
  { value: 'za', label: 'Z to A' },
  { value: 'price-low', label: 'Lowest to Highest Price' },
  { value: 'price-high', label: 'Highest to Lowest Price' },
  { value: 'size-low', label: 'Smallest to Largest Size' },
  { value: 'size-high', label: 'Largest to Smallest Size' },
];

/** Browse and search: the stock ranking first, because it is what the list already did. */
export const BROWSE_SORT_OPTIONS: SortOption<BrowseSort>[] = [
  { value: 'stocked', label: 'Most to Least Stocked' },
  ...LIST_SORT_OPTIONS,
];

/** Explore, Brands. */
export const BRAND_SORT_OPTIONS: SortOption<'az' | 'za'>[] = [
  { value: 'az', label: 'A to Z' },
  { value: 'za', label: 'Z to A' },
];

/** Deals. */
export const DEAL_SORT_OPTIONS: SortOption<'discount' | 'lowest' | 'highest'>[] = [
  { value: 'discount', label: 'Best to Worst Saving' },
  { value: 'lowest', label: 'Lowest to Highest Price' },
  { value: 'highest', label: 'Highest to Lowest Price' },
];

/** Explore, Notes. */
export const NOTE_SORT_OPTIONS: SortOption<'common' | 'az'>[] = [
  { value: 'common', label: 'Most to Least Used' },
  { value: 'az', label: 'A to Z' },
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
      // A product whose own title cannot be read as one size (see
      // DemoFragrance.sizeMl's own comment) is not thereby the smallest
      // bottle in a "smallest first" list or the largest in a "largest
      // first" one — it is a bottle this site cannot honestly place on the
      // scale at all, so it sits out of the way at the end of *either*
      // ordering rather than a made-up position making a claim about its
      // size. Handled before the ordinary numeric comparison, and by a
      // fixed 1/-1 that a direction flip never reverses, rather than by
      // mapping the unknown to +-Infinity and letting the shared "reverse
      // for size-high" arithmetic below run over it: the value that reads
      // as "always last" ascending would read as "always first" once
      // negated for descending, which is exactly the claim being refused.
      if (a.sizeMl === null || b.sizeMl === null) {
        if (a.sizeMl === null && b.sizeMl !== null) return 1;
        if (b.sizeMl === null && a.sizeMl !== null) return -1;
      } else if (a.sizeMl !== b.sizeMl) {
        return sort === 'size-low' ? a.sizeMl - b.sizeMl : b.sizeMl - a.sizeMl;
      }
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

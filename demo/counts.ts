import { DEMO_FRAGRANCES } from './data.js';
import { productKind } from './productKind.js';

/**
 * How many products the catalogue holds, by kind: the one source of every "N
 * fragrances", "N sets" and "N oils" on the site (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * 4.2), so no page can disagree with another. A product is exactly one kind, so
 * the three add up to the total.
 *
 *   - `bottles`: fragrances sold as a bottle (the main comparison, the Search list)
 *   - `sets`: gift sets, miniature and discovery sets, bundles (the Sets tab)
 *   - `oils`: perfume oils and attars (the Oils tab)
 *   - `products`: all three; the number the banner states, as "Products"
 *
 * `tests/crossLinks.test.ts` fails if a page string builds one of these counts
 * from DEMO_FRAGRANCES.length itself.
 */
export interface Counts {
  products: number;
  bottles: number;
  sets: number;
  oils: number;
}

export function countKinds(list: readonly Parameters<typeof productKind>[0][]): Counts {
  const c: Counts = { products: list.length, bottles: 0, sets: 0, oils: 0 };
  for (const f of list) {
    const k = productKind(f);
    if (k === 'set') c.sets += 1;
    else if (k === 'oil') c.oils += 1;
    else c.bottles += 1;
  }
  return c;
}

export const COUNTS: Counts = countKinds(DEMO_FRAGRANCES);

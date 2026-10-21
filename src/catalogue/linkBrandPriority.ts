/**
 * The brands whose perfumes get their Fragrantica link looked for first
 * (owner request, 2026-10-21), and the order the link resolver works in:
 *
 *   1. the priority brands, in the owner's order, each brand's perfumes most
 *      stocked first (the number of shops listing the perfume, then the number
 *      of offers, then the key so every run orders them the same way);
 *   2. then everything else, most stocked first.
 *
 * Brands are matched through the site's own brand folding (knownAlias, then
 * brandGroupKey), never by exact string: "YSL", "Ysl" and "Yves Saint Laurent"
 * are one brand here, as are "Lattafa Pride" and "Lattafa", "Paco Rabanne" and
 * "Rabanne", "Thierry Mugler" and "Mugler", "Chloe" and "Chloé".
 *
 * Which perfumes have been tried already is not this module's business:
 * scripts/resolve-fragrance-links.ts puts the never checked ones first and the
 * ones whose last attempt is older than --retry-days after them (checkOrder),
 * so a perfume tried and not found waits its turn as before.
 */
import { brandGroupKey, knownAlias } from './brandName.js';

/** The owner's list, in order. A line is a brand and the other spellings the owner or a shop uses for it. */
export const PRIORITY_BRANDS: readonly (readonly string[])[] = [
  ['Yves Saint Laurent', 'YSL'],
  ['French Avenue'],
  ['Lattafa', 'Lattafa Pride'],
  ['Swiss Arabian'],
  ['Ahmed Al Maghribi'],
  ['Tom Ford'],
  ['Gucci'],
  ['Prada'],
  ['Chloé', 'Chloe'],
  ['Givenchy'],
  ['Khadlaj'],
  ['Arabiyat', 'Arabiyat Prestige'],
  ['Rabanne', 'Paco Rabanne'],
  ['Viktor & Rolf'],
  ['Jean Paul Gaultier'],
  ['Carolina Herrera'],
  ['Marc Jacobs'],
  ['Dolce & Gabbana'],
  ['Hugo Boss'],
  ['Jimmy Choo'],
  ['Mugler', 'Thierry Mugler'],
];

/** The site's folded form of a brand string: the kept spelling if the alias tables settle it, grouped. */
export const foldBrand = (brand: string): string => brandGroupKey(knownAlias(brand) ?? brand);

const RANK_BY_FOLDED = new Map<string, number>();
PRIORITY_BRANDS.forEach((names, rank) => {
  for (const n of names) {
    const k = foldBrand(n);
    if (k && !RANK_BY_FOLDED.has(k)) RANK_BY_FOLDED.set(k, rank);
  }
});

/** Position of the brand in the owner's list (0 first), or null where it is not on it. */
export function priorityBrandRank(brand: string): number | null {
  return RANK_BY_FOLDED.get(foldBrand(brand)) ?? null;
}

export interface Stocked {
  baseKey: string;
  brand: string;
  /** Distinct shops listing the perfume, across its variants. */
  shops: number;
  /** Offers across the perfume's variants. */
  offers: number;
}

const mostStocked = (a: Stocked, b: Stocked): number =>
  b.shops - a.shops || b.offers - a.offers || (a.baseKey < b.baseKey ? -1 : a.baseKey > b.baseKey ? 1 : 0);

/** Priority brands in the owner's order, most stocked first within each, then every other perfume most stocked first. */
export function brandsFirstOrder<T extends Stocked>(items: readonly T[]): T[] {
  const ranked: T[] = [];
  const rest: T[] = [];
  for (const i of items) (priorityBrandRank(i.brand) === null ? rest : ranked).push(i);
  ranked.sort((a, b) => priorityBrandRank(a.brand)! - priorityBrandRank(b.brand)! || mostStocked(a, b));
  rest.sort(mostStocked);
  return [...ranked, ...rest];
}

import type { DemoFragrance } from './data.js';

/**
 * One entry per scent in the lists that rank fragrances against each other
 * (owner's decision, 2026-10-03): the home page's Most stocked rail and its
 * full list, Today's Deals, and the Gift sets section and its full list. The
 * owner did not want the same perfume twice in one ranking, 50ml and 100ml
 * side by side. Search, brand pages, shop pages and note pages still list
 * every size.
 *
 * ── What "the same scent" is ───────────────────────────────────────────────
 * The catalogue keeps each bottle size as its own product (its own id, offers
 * and page) and links the sizes of one perfume by brand and perfume name: the
 * key scripts/social-deal-of-day.ts uses to borrow notes from "the same
 * perfume in another size", and the pair compareVariants (demo/data.ts) and
 * demo/listSort.ts order sizes within. Concentration is part of the key here
 * as well: an Eau de Toilette and an Eau de Parfum of one name are two
 * scents, priced and compared separately, not two sizes of one. Compared
 * without case, as that key already is.
 *
 * A gift set has no size and is its own product line, so the same key keeps
 * one entry per set line.
 */
export function scentKey(f: Pick<DemoFragrance, 'brand' | 'name' | 'concentration'>): string {
  return `${f.brand}|${f.name}|${f.concentration}`.toLowerCase();
}

/**
 * The first entry of each scent, in the list's own order. The caller passes
 * the list already ranked, so the size kept is the best ranked one by that
 * list's own ranking.
 */
export function onePerScent<T extends Pick<DemoFragrance, 'brand' | 'name' | 'concentration'>>(ranked: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of ranked) {
    const key = scentKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Today's Deals keeps the best deal of each scent: the deepest saving, then
 * the lower price, then the smaller bottle, so the choice does not depend on
 * which sort the reader picked. The page then sorts what is left as asked.
 */
export function bestDealPerScent<D extends { fragrance: Pick<DemoFragrance, 'id' | 'brand' | 'name' | 'concentration' | 'sizeMl'>; percentOff: number; price: number }>(
  deals: readonly D[],
): D[] {
  const best = new Map<string, D>();
  for (const d of deals) {
    const key = scentKey(d.fragrance);
    const held = best.get(key);
    if (!held || dealBeats(d, held)) best.set(key, d);
  }
  // In the input's own order, so a caller's order is kept for what survives.
  return deals.filter((d) => best.get(scentKey(d.fragrance)) === d);
}

function dealBeats(a: Parameters<typeof bestDealPerScent>[0][number], b: Parameters<typeof bestDealPerScent>[0][number]): boolean {
  if (a.percentOff !== b.percentOff) return a.percentOff > b.percentOff;
  if (a.price !== b.price) return a.price < b.price;
  const sa = a.fragrance.sizeMl ?? Infinity;
  const sb = b.fragrance.sizeMl ?? Infinity;
  if (sa !== sb) return sa < sb;
  return a.fragrance.id < b.fragrance.id;
}

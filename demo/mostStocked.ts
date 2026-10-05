import type { DemoFragrance } from './data.js';

/**
 * Who may be ranked in the home page's Most stocked list: the front page rail
 * and the full list behind See All. Kept out of demo/app.ts so a test
 * can hold the rule to the real catalogue (tests/mostStocked.test.ts).
 *
 * Two things are left out, and neither is hidden anywhere else: each keeps
 * its own page, its brand page, its place in search and every price.
 *
 *   - Perfume oils (owner's instruction, 2026-08-20): sold by the roller or
 *     the tola on a price scale that does not compare with a spray, so a
 *     list ranking what the UK's shops stock reads better without them.
 *   - Gift sets (owner's decision, 2026-10-03): their own category, never
 *     compared with a single bottle (src/catalogue/giftSet.ts), and not what
 *     a ranking of the most stocked fragrances is about.
 */
export function rankedInMostStocked(f: Pick<DemoFragrance, 'concentration' | 'giftSet'>): boolean {
  return f.concentration !== 'Perfume Oil' && f.giftSet === null;
}

/**
 * The front page rail: the most stocked bottle of each of the `n` most
 * stocked brands. Owner feedback, 2026-10-01: ranked straight, 7 of the 12
 * were French Avenue and 3 were Afnan, which read as an advert for two
 * brands. The full, unmixed ranking is still one tap away under See All, and it has no
 * end: it loads on as the reader scrolls.
 */
export function mostStockedRail<T extends Pick<DemoFragrance, 'brand' | 'concentration' | 'giftSet'>>(
  byPopularity: readonly T[],
  n = 12,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of byPopularity) {
    if (out.length === n) break;
    if (!rankedInMostStocked(f) || seen.has(f.brand)) continue;
    seen.add(f.brand);
    out.push(f);
  }
  return out;
}

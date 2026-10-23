import type { DemoFragrance } from './data.js';
import { rankedInMostStocked } from './mostStocked.js';
import { onePerScent, scentKey } from './oneScent.js';

/**
 * The home page's Most Popular row and the full list behind its See All
 * (owner request, 21 Oct 2026). Kept out of demo/app.ts so a test can hold
 * the rule (tests/mostPopular.test.ts).
 *
 * ── What "popular" is here, and why ───────────────────────────────────────
 * The site has three possible signals. In order of preference:
 *   1. its own product page views (Supabase site_page_views): on 21 Oct 2026
 *      120 product page views in all for the UK since counting began on
 *      5 Oct, spread over 81 products, and one or two for the US and India.
 *      Too few to rank anything, and most of them the owner's own checks;
 *   2. its own shop clicks (site_shop_clicks): 55 in all, the same problem;
 *   3. what the shops themselves publish: the review count on a listing's own
 *      schema.org aggregateRating (src/catalogue/jsonld.ts, RawOffer.rating),
 *      which about 7,000 UK products carry. A review count is how many buyers
 *      took the trouble to review a bottle, which is a fair, public, per
 *      country measure of how widely it is bought.
 * So the row ranks by reviews, and says so under its heading. It is a
 * different ranking from Most Stocked (how many shops carry a bottle), and it
 * also leaves out every scent the Most Stocked row shows, so the two rows
 * never repeat a perfume. When the site's own counts grow large enough to
 * rank on, this is the one place to change.
 *
 * A product's reviews are the LARGEST count any one shop publishes for it,
 * never the sum: shops that sell through the same review service (a brand's
 * reviews syndicated to several shops) publish the same reviews, and a sum
 * would count them once per shop. A country whose shops publish no review
 * counts (the US and India today, scripts/regionSite.ts) has no ranking,
 * so its home page shows no Most Popular row rather than an invented one.
 */

/** What a listing needs to carry for its reviews to be read. */
export interface ReviewedListing {
  rating?: { value: number; count: number | null } | null;
}

/** The largest review count any one shop publishes for a product, or 0 when none publishes one. */
export function reviewCount(listings: readonly ReviewedListing[] | undefined): number {
  let most = 0;
  for (const l of listings ?? []) {
    const n = l.rating?.count;
    if (typeof n === 'number' && Number.isFinite(n) && n > most) most = Math.floor(n);
  }
  return most;
}

type Ranked = Pick<DemoFragrance, 'id' | 'brand' | 'name' | 'concentration' | 'giftSet'>;

/**
 * Every bottle with published reviews, most reviewed first, one per scent (its
 * most reviewed size). `byPopularity` is the Most Stocked order, which breaks
 * a tie: of two bottles with the same count, the more widely stocked one
 * leads, then the order that list already has. Oils and gift sets are left
 * out, as in Most Stocked (demo/mostStocked.ts). Bottles no shop reviews are
 * not in it: a list that claims to rank by reviews ranks only what has some.
 */
export function byReviews<T extends Ranked>(byPopularity: readonly T[], reviewsOf: (id: string) => number): T[] {
  const place = new Map(byPopularity.map((f, i) => [f.id, i]));
  const counted = byPopularity
    .filter((f) => rankedInMostStocked(f))
    .map((f) => ({ f, n: reviewsOf(f.id) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || place.get(a.f.id)! - place.get(b.f.id)!);
  return onePerScent(counted.map((x) => x.f));
}

/**
 * The home row: the most reviewed bottle of each of the `n` most reviewed
 * brands (one per brand, the rule the Most Stocked row follows so a single
 * house cannot fill it), leaving out every scent in `shownAbove`, the Most
 * Stocked row, so no perfume is in both rows.
 */
export function mostPopularRail<T extends Ranked>(ranked: readonly T[], shownAbove: readonly Ranked[], n = 12): T[] {
  const above = new Set(shownAbove.map(scentKey));
  const brands = new Set<string>();
  const out: T[] = [];
  for (const f of ranked) {
    if (out.length === n) break;
    if (above.has(scentKey(f)) || brands.has(f.brand)) continue;
    brands.add(f.brand);
    out.push(f);
  }
  return out;
}

/**
 * A list in the order of its reviews, most first, for the Most to Least
 * Reviewed sort (the full list behind the home row's See All). Stable: ties,
 * and every bottle no shop reviews, keep the order the list came in (the
 * Most Stocked order), the unreviewed ones after all the reviewed ones.
 */
export function sortByReviews<T extends Pick<DemoFragrance, 'id'>>(list: readonly T[], reviewsOf: (id: string) => number): T[] {
  return list
    .map((f, i) => ({ f, i, n: reviewsOf(f.id) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.f);
}

/**
 * Where the shops publish no review counts (the US, India and Canada today),
 * the row still appears, so every country's home page has the same sections
 * (owner request, 23 Oct 2026), ranked on the one honest signal those
 * countries have: how many of their shops stock a bottle. It takes the next
 * houses down the Most Stocked ranking, one bottle each, leaving out every
 * house and scent the Most Stocked row already shows, and its note says what
 * it ranks on. `byPopularity` is the Most Stocked order.
 */
export function nextMostStockedRail<T extends Ranked>(byPopularity: readonly T[], shownAbove: readonly Ranked[], n = 12): T[] {
  const brandsAbove = new Set(shownAbove.map((f) => f.brand));
  const rest = onePerScent(byPopularity.filter((f) => rankedInMostStocked(f) && !brandsAbove.has(f.brand)));
  return mostPopularRail(rest, shownAbove, n);
}

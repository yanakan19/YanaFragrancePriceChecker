/**
 * The home page's scrolling word banner, directly under the hero.
 *
 * Ported from the owner's other site on 2026-10-03 and rewritten for this
 * one: every phrase below is something the code and the data can show today,
 * and the two that carry numbers are built from the catalogue as it was
 * built, so they cannot drift out of date as shops and fragrances come and go.
 *
 * What each phrase rests on, checked when it was written:
 *   - "20,000+ Fragrances Tracked": the number of catalogue entries the build
 *     produced (DEMO_FRAGRANCES), rounded down so the "+" is strictly true,
 *     in the same spirit as shopsPhrase in demo/head.ts.
 *   - "More Than 30 UK Shops": COVERAGE in demo/legal.ts, the rounded count
 *     of shops that show prices today, the same figure the hero sentence uses.
 *   - "Delivery Included Where Stated": a delivered price is shown only where
 *     the shop's standard delivery cost is known. Elsewhere the row says
 *     "Delivery not stated" and shows the item price only (deliveryFacts.ts,
 *     offerGroups.ts), so delivery is not included everywhere.
 *   - "Prices Rechecked Automatically": the catalogue workflow tries hourly
 *     and harvests when the last one is 150 minutes old, but delivered runs
 *     have had gaps of days (.github/workflows/catalogue-daily.yml and the
 *     harvest commit history), so no fixed interval is claimed.
 *   - "No Paid Placements": lists are ordered by stock and price
 *     (offerGroups.ts); affiliate links exist and are labelled on the row,
 *     and the affiliate page says no one can pay for a place in the results.
 *   - "Real Price History": every point on the graph is a bottle price the
 *     harvest actually recorded (priceHistoryChart.ts), never an invented
 *     one. Since 2026-10-03 the graph adds delivery at today's rates and its
 *     caption says so; the prices underneath are still the recorded ones.
 *
 * Title Case, no hyphens or dashes, as the rest of the site's labels: every
 * word capitalised except the small words (of, and, the, a, an, to, in, at,
 * for, or, by, on) when they are not first. None of the six uses one today.
 */

/**
 * The fragrance count as the banner states it: "20,000+" for 20,839. Rounded
 * down to the thousand below for five figures and more, the hundred below for
 * four, the ten below otherwise, and always strictly below the real count, so
 * "+" means "more than", as shopsPhrase's "more than 30" does.
 */
export function fragrancesPhrase(count: number): string {
  if (count <= 10) return String(Math.max(0, count));
  const step = count > 10_000 ? 1000 : count > 1000 ? 100 : 10;
  const floor = Math.floor((count - 1) / step) * step;
  return `${floor.toLocaleString('en-GB')}+`;
}

/** The words the site's Title Case keeps lowercase unless they come first. */
export const SMALL_WORDS = new Set(['of', 'and', 'the', 'a', 'an', 'to', 'in', 'at', 'for', 'or', 'by', 'on']);

/** "more than 30" as "More Than 30", in the site's Title Case. */
const titleCase = (s: string): string =>
  s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/**
 * The six phrases, in order. `coverage` is COVERAGE from demo/legal.ts, passed
 * in rather than imported so this module stays free of the catalogue and can
 * be tested on its own.
 */
export function marqueePhrases(fragranceCount: number, coverage: string): string[] {
  return [
    `${fragrancesPhrase(fragranceCount)} Fragrances Tracked`,
    `${titleCase(coverage)} UK Shops`,
    'Delivery Included Where Stated',
    'Prices Rechecked Automatically',
    'No Paid Placements',
    'Real Price History',
  ];
}

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The banner's markup. Every phrase is written twice: the second set is
 * aria-hidden and exists only so the scroll can loop without a seam, which is
 * why the two sets must stay identical and in the same order. A reader with a
 * screen reader hears the six once; with reduced motion the second set is
 * hidden and nothing moves (see .marquee in demo/template.html).
 */
export function marqueeHtml(phrases: readonly string[]): string {
  const items = (hidden: boolean) =>
    phrases
      .map((p) => `<span class="marquee-item"${hidden ? ' aria-hidden="true"' : ''}>${escHtml(p)}</span>`)
      .join('');
  return `<section class="marquee" aria-label="Why PriceSniffs">
      <div class="marquee-track">${items(false)}${items(true)}</div>
    </section>`;
}

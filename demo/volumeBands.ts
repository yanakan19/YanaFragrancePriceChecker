/**
 * The Volume facet's five size ranges, and which one a bottle falls in.
 *
 * Kept in its own module rather than inline in demo/app.ts, unlike the
 * otherwise-identical PRICE_BANDS/priceBandFor pair it mirrors: app.ts pulls
 * in the whole DOM-touching harness at import time (it calls `init()` at the
 * bottom of the file the moment it loads), so nothing in it can be imported
 * from a plain Node test. This file has no such cost — a fragrance's size in
 * millilitres in, a band out — so it can be unit tested directly rather than
 * only ever exercised through the rendered page.
 *
 * ── Why five bands instead of one option per bottle size ────────────────────
 * The catalogue carries 91 distinct sizeMl values today (counted with
 * `grep -oP '"sizeMl":\s*\K[0-9.]+' demo/catalogue.generated.ts | sort -u -n
 * | wc -l`, 2026-08-20) — everything from 1ml sample vials up to a 2218ml
 * outlier, all of them whole millilitres, none fractional (same grep piped to
 * `grep -c '\.'` reports 0). A filter with 91 tick boxes is not a filter a
 * reader can scan; a handful of size classes a shopper actually thinks in
 * ("something under 30ml to try it", "a full 100ml bottle") is.
 *
 * ── The boundary rule: inclusive lower bound, exclusive upper bound ─────────
 * A size sitting exactly on a shared boundary — 15, 30, 70 or 120 — goes in
 * the *higher* band. A 30ml bottle is filed under "30 - 70ml", not
 * "15 - 30ml"; a 120ml bottle is filed under "120ml And Over", not
 * "70 - 120ml". This is not an arbitrary pick: it is the exact rule
 * `priceBandFor` already uses for the Price facet next to this one in the
 * same filter panel (`price >= b.min && (b.max === null || price < b.max)`),
 * and matching it is not a style preference, it is what keeps the two banded
 * facets in one panel from teaching a reader two different rules for what
 * "30" means depending on which pill they are looking at. It also matches
 * the owner's own framing of the request: the bottom of a range is the end
 * that is included.
 *
 * This is not a boundary nobody hits. Of the catalogue's 15,912 products,
 * 1,523 sit on one of the four shared boundary values (165 at exactly 15ml,
 * 1,253 at exactly 30ml — by far the most common single size in the whole
 * catalogue, 34 at exactly 70ml, 71 at exactly 120ml — measured with the awk
 * pass below), so the convention decides where roughly 1 product in 10
 * lands, not a corner case:
 *
 *   grep -oP '"sizeMl":\s*\K[0-9.]+' demo/catalogue.generated.ts | awk '
 *     { v=$1+0;
 *       if (v==15) e15++; if (v==30) e30++; if (v==70) e70++; if (v==120) e120++ }
 *     END { print e15, e30, e70, e120 }'
 *
 * ── Band populations, same convention applied ────────────────────────────────
 * Measured with the same field, banded by the rule above (2026-08-20):
 *
 *   Under 15ml         584
 *   15 - 30ml           328
 *   30 - 70ml         4,007
 *   70 - 120ml        9,725
 *   120ml And Over     1,268
 *                    -------
 *   total            15,912
 */

/** One of the five size bands offered under the Volume facet. */
export type VolumeBand = '0-15' | '15-30' | '30-70' | '70-120' | '120+';

export const VOLUME_BANDS: { id: VolumeBand; label: string; min: number; max: number | null }[] = [
  { id: '0-15', label: 'Under 15ml', min: 0, max: 15 },
  { id: '15-30', label: '15 - 30ml', min: 15, max: 30 },
  { id: '30-70', label: '30 - 70ml', min: 30, max: 70 },
  { id: '70-120', label: '70 - 120ml', min: 70, max: 120 },
  { id: '120+', label: '120ml And Over', min: 120, max: null },
];

/**
 * Which band a bottle's size falls in. Always returns a band — sizeMl is a
 * required, always-positive field on every catalogue entry (see
 * CatalogueEntry in demo/catalogue.generated.ts), so unlike `priceBandFor`
 * there is no "no data" case to report null for. The fallback to the last
 * band mirrors `priceBandFor` anyway, so a future band list that stopped
 * covering every non-negative number would fail the same safe way price
 * bands do rather than throwing.
 */
export function volumeBandFor(sizeMl: number): VolumeBand {
  return (VOLUME_BANDS.find((b) => sizeMl >= b.min && (b.max === null || sizeMl < b.max)) ?? VOLUME_BANDS[VOLUME_BANDS.length - 1]!).id;
}

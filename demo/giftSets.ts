import type { DemoFragrance } from './data.js';

/**
 * The home page's Gift sets section, and the order of the full list behind
 * its See all gift sets link (/gift-sets). Owner's decision, 2026-10-03.
 * Kept out of demo/app.ts so tests/giftSets.test.ts can hold the rules to
 * plain inputs and to the real catalogue.
 *
 * ── The order ───────────────────────────────────────────────────────────────
 *   1. How many shops list the set to buy: the same count as the product
 *      page's "Available at (N shops)" (availabilityHeading in
 *      demo/offerGroups.ts).
 *   2. Then the saving: how much less the cheapest of those shops charges
 *      than the dearest, delivered prices compared with delivered prices (see
 *      giftSetSaving). A set at one shop has nothing to compare and saves
 *      nothing, never a figure we made up.
 *   3. Then brand and name, so the order is stable rather than input order.
 *
 * Only a set that can be bought somewhere is ranked: one sold out everywhere
 * keeps its own page and its place in search, but is not put forward on the
 * front page as popular. The full list keeps one entry per set line
 * (onePerScent in demo/oneScent.ts), the best ranked.
 *
 * ── The section ─────────────────────────────────────────────────────────────
 * Photo led like the Most stocked rail, so only sets with a photo we may show
 * (photoUrl, see demo/data.ts) are put in it; the full list carries every
 * ranked set, with or without one. Like the Most stocked rail (owner feedback,
 * 2026-10-01: seven of twelve from one brand read as an advert for it), the
 * section takes the best set of each brand in turn.
 */

/** What the ranking needs to know about one set, worked out by the caller. */
export interface GiftSetStanding {
  /** Shops listing it to buy, as the product page's Available at counts them. */
  shops: number;
  /** Pounds saved at the cheapest listed shop against the dearest; 0 at one shop. */
  saving: number;
}

/**
 * The saving between shops for one set: the dearest listed comparable price
 * minus the cheapest. Delivered prices are compared only with delivered
 * prices; if any listed shop states no delivery cost, item prices are
 * compared with item prices instead, so the two kinds are never mixed.
 */
export function giftSetSaving(rows: readonly { itemPriceGbp: number; deliveredPriceGbp: number | null }[]): number {
  if (rows.length < 2) return 0;
  const allDelivered = rows.every((r) => r.deliveredPriceGbp !== null);
  const prices = rows.map((r) => (allDelivered ? r.deliveredPriceGbp! : r.itemPriceGbp));
  return Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100;
}

type SetLike = Pick<DemoFragrance, 'id' | 'brand' | 'name' | 'giftSet' | 'photoUrl'>;

/** Every gift set that can be bought somewhere, in the order above. */
export function rankGiftSets<T extends SetLike>(list: readonly T[], standing: (f: T) => GiftSetStanding): T[] {
  const ranked = list
    .filter((f) => f.giftSet !== null)
    .map((f) => ({ f, s: standing(f) }))
    .filter(({ s }) => s.shops > 0);
  ranked.sort(
    (a, b) =>
      b.s.shops - a.s.shops ||
      b.s.saving - a.s.saving ||
      a.f.brand.localeCompare(b.f.brand) ||
      a.f.name.localeCompare(b.f.name) ||
      a.f.id.localeCompare(b.f.id),
  );
  return ranked.map(({ f }) => f);
}

/** The home page section: the best ranked set with a photo from each brand, `n` of them. */
export function giftSetRail<T extends SetLike>(ranked: readonly T[], n = 12): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of ranked) {
    if (out.length === n) break;
    if (f.photoUrl === null || seen.has(f.brand)) continue;
    seen.add(f.brand);
    out.push(f);
  }
  return out;
}

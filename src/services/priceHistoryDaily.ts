/**
 * Turns a fragrance's raw, event driven price history (one entry per real
 * change, from demo/priceHistory.generated.ts) into one point per calendar
 * day across a fixed window — the shape the chart in demo/app.ts actually
 * draws. Pulled out of demo/app.ts so this carry forward logic, which is the
 * whole reason a chart can quietly misstate a price, is a plain function
 * something can call in a test rather than a private closure inside a
 * five thousand line renderer.
 *
 * ── The carry forward rule, and the gap that breaks it ──────────────────────
 * A day with no fresh reading repeats the last real price rather than
 * leaving a hole, the same way a stock chart draws flat across a weekend
 * rather than gapping it (see DailyHistoryPoint.priceGbp's own comment).
 * That is only honest while the price is actually still on offer.
 * `RawHistoryPoint.priceGbp: null` is how scripts/build-price-history.ts
 * records the one case that is not: every listing for this fragrance went
 * unavailable this commit. It carries no price and names no retailer,
 * because there is nothing to name — it exists purely to break the carry
 * forward, so a fragrance that went out of stock and came back at an
 * unchanged price draws a real gap instead of a flat line implying it was
 * on sale the whole time. See that script's own header for the full
 * "why this file cannot see the gap without it" reasoning.
 */

/** YYYY-MM-DD in UTC, used only to bucket points onto calendar days. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * One entry in a fragrance's raw history. `priceGbp: null` is the explicit
 * "not buyable anywhere as of this instant" marker described above; a real
 * price is never null, so the two are never confused with each other.
 */
export interface RawHistoryPoint {
  at: string;
  priceGbp: number | null;
  retailerId: string | null;
}

export interface DailyHistoryPoint {
  dateKey: string;
  /**
   * null on a day this fragrance had no price at all — every day before the
   * site first saw it, every day it was known unavailable, and every day
   * after it stopped being purchasable. Deliberately null rather than 0: it
   * is plotted down on the baseline, but it must never be *labelled* £0.00,
   * because nobody ever offered it for nothing. "No price recorded" is the
   * true statement; zero would be an invented number, which is the one
   * thing this codebase does not do.
   */
  priceGbp: number | null;
  retailerId: string | null;
  /** The real harvest timestamp this price actually came from. */
  recordedAt: string | null;
  /** True on a day nothing was re-harvested — the price carried forward
   *  unchanged from recordedAt rather than a fresh reading taken that day. */
  isCarried: boolean;
}

/**
 * One point per calendar day across a fixed window, never one per harvest
 * event, and never a ragged axis that starts wherever this particular
 * fragrance happens to have been first seen.
 *
 * The raw history can carry several points on a single busy day and none at
 * all on a quiet one — real, but noisy and gappy to plot directly. A day
 * with a real harvest takes its cheapest recorded price that day; a day with
 * none carries the last real price forward flat, which is not an invented
 * number — the price did not change, so restating it is accurate. `isCarried`
 * keeps that distinction visible in the tooltip rather than pretending every
 * dot was a fresh reading.
 *
 * Three kinds of day get no price rather than a carried one, and all three
 * are real absences rather than gaps in the crawl:
 *
 *   - **Before the first sighting.** A fragrance added on the 9th did not
 *     have a secret price on the 3rd; it was not on the site. Carrying
 *     backwards would invent one.
 *   - **A known unavailable day, and every day after it until the next real
 *     reading.** See RawHistoryPoint's own comment: this is the mid series
 *     gap case, and it is the reason `carrying` is reset to null the moment
 *     one of these markers is reached rather than only being read once.
 *   - **After the last sighting, when it is no longer purchasable.** Carrying
 *     a price forward for something now sold out everywhere would assert a
 *     live price that no shop is offering. Carrying forward is only honest
 *     while the thing is still buyable, which is what `stillPurchasable`
 *     decides.
 */
export function dailyHistory(
  points: readonly RawHistoryPoint[],
  fromDayKey: string,
  toDayKey: string,
  stillPurchasable: boolean,
): DailyHistoryPoint[] {
  const byDay = new Map<string, { at: string; priceGbp: number; retailerId: string }>();
  const gapDays = new Set<string>();
  for (const p of points) {
    const key = dayKey(p.at);
    if (p.priceGbp === null) {
      gapDays.add(key);
      continue;
    }
    const cheapest = byDay.get(key);
    if (!cheapest || p.priceGbp < cheapest.priceGbp) {
      byDay.set(key, { at: p.at, priceGbp: p.priceGbp, retailerId: p.retailerId! });
    }
  }
  // A real price recorded the same day as a gap marker wins: something was
  // buyable that day after all, so the day is not treated as a break.
  for (const key of byDay.keys()) gapDays.delete(key);

  const lastRealDay = [...byDay.keys()].sort().at(-1) ?? null;

  const firstDay = new Date(`${fromDayKey}T00:00:00Z`);
  const lastDay = new Date(`${toDayKey}T00:00:00Z`);
  const totalDays = Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000) + 1;

  const blank = (key: string): DailyHistoryPoint => ({
    dateKey: key,
    priceGbp: null,
    retailerId: null,
    recordedAt: null,
    isCarried: false,
  });

  const daily: DailyHistoryPoint[] = [];
  let carrying: { priceGbp: number; retailerId: string; recordedAt: string } | null = null;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(firstDay.getTime() + i * 86_400_000);
    const key = dayKey(d.toISOString());
    const real = byDay.get(key);
    if (real) {
      carrying = { priceGbp: real.priceGbp, retailerId: real.retailerId, recordedAt: real.at };
      daily.push({ dateKey: key, priceGbp: real.priceGbp, retailerId: real.retailerId, recordedAt: real.at, isCarried: false });
      continue;
    }
    if (gapDays.has(key)) {
      // A known unavailable reading. Whatever was carrying up to here no
      // longer holds — this is the fix for the mid series gap: without
      // this reset, the next real price arriving unchanged from `carrying`
      // would never have broken the flat line, even though the fragrance
      // was genuinely unbuyable for everything in between.
      carrying = null;
      daily.push(blank(key));
      continue;
    }
    const isAfterLastReading = lastRealDay !== null && key > lastRealDay;
    if (carrying && !(isAfterLastReading && !stillPurchasable)) {
      daily.push({ dateKey: key, priceGbp: carrying.priceGbp, retailerId: carrying.retailerId, recordedAt: carrying.recordedAt, isCarried: true });
    } else {
      daily.push(blank(key));
    }
  }
  return daily;
}

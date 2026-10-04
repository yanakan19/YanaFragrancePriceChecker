import type { StoredListing } from './types.js';
import { isTooOldToShow } from '../services/offerAge.js';

/**
 * How old the prices are that a shop's stored listings would put on the site.
 *
 * Written into data/harvest-report.json for every shop after every harvest,
 * and checked by scripts/freshness-check.ts, so a shop whose prices start to
 * age is a number in the report and a failed step rather than something a
 * reader notices on a product page ("Perfumeo £28.99, 17d ago", 2026-10-03).
 *
 * "Shown" is what the catalogue build would list: an active listing with a
 * sterling price, confirmed recently enough not to be hidden by
 * HIDE_OFFER_AFTER_DAYS. The build also drops what is not fragrance, so this
 * counts a little more than the site shows, never less.
 */
export interface ShopFreshness {
  shown: number;
  /** Shown listings whose price was last confirmed more than 24 hours ago. */
  over24h: number;
  /** Shown listings whose price was last confirmed more than 48 hours ago. */
  over48h: number;
  /** The oldest confirmation among shown listings, or null when none are shown. */
  oldestShownAt: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

export function shopFreshness(listings: readonly StoredListing[], now: Date): ShopFreshness {
  let shown = 0;
  let over24h = 0;
  let over48h = 0;
  let oldest: string | null = null;
  for (const l of listings) {
    if (l.status !== 'active' || l.priceGbp === null) continue;
    if (isTooOldToShow(l.lastSeenAt, now)) continue;
    shown++;
    const age = now.getTime() - Date.parse(l.lastSeenAt);
    if (age > 24 * HOUR_MS) over24h++;
    if (age > 48 * HOUR_MS) over48h++;
    if (oldest === null || l.lastSeenAt < oldest) oldest = l.lastSeenAt;
  }
  return { shown, over24h, over48h, oldestShownAt: oldest };
}

/**
 * The tolerance scripts/freshness-check.ts allows a shop that answered this
 * run: a handful of listings whose page answered without a price (neither
 * gone nor priced) is not a regression; a slice of the catalogue is.
 */
export function freshnessTolerance(shown: number): number {
  return Math.max(5, Math.floor(shown * 0.02));
}

/**
 * How old the newest harvest report is, for scripts/freshness-check.ts. The
 * check runs even when an earlier step of the crawl failed (run #592 skipped
 * it), and then the report on disk can be one or more runs old: the line says
 * so, so a red run still shows how stale the prices are. `stale` once the
 * report is older than the guard's 150 minute gap plus a full run (about four
 * hours), which means at least one harvest that should have happened did not.
 */
export function reportAge(startedAt: string | undefined, now: Date): { hours: number | null; stale: boolean; line: string } {
  const started = startedAt ? Date.parse(startedAt) : NaN;
  if (Number.isNaN(started)) {
    return { hours: null, stale: true, line: 'The harvest report carries no start time, so its age is unknown.' };
  }
  const hours = Math.round(((now.getTime() - started) / HOUR_MS) * 10) / 10;
  const stale = hours > 4;
  return {
    hours,
    stale,
    line: `The newest harvest report is from a harvest that started ${hours} hours ago (${startedAt})` +
      (stale ? ', so at least one scheduled harvest since then did not happen or did not commit.' : '.'),
  };
}

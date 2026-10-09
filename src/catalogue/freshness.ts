import type { StoredListing } from './types.js';
import { isTooOldToShow } from '../services/offerAge.js';
import { getRetailer } from '../config/retailers.js';

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
    if (isTooOldToShow(l.lastSeenAt, now, getRetailer(l.retailerId)?.adapter === 'owner-import')) continue;
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

/**
 * How old a stored price may get before a harvest re-reads it, in hours,
 * unless the shop says otherwise (`Retailer.refreshAfterHours`): every other
 * shop is re-read about every other run of a sweep that lands every five to
 * seven hours.
 */
export const DEFAULT_REFRESH_AFTER_HOURS = 12;

/** The age scripts/freshness-check.ts fails a shop that answered on. */
export const FRESHNESS_LIMIT_HOURS = 48;

/**
 * What a price can age past its refresh age before the next harvest has
 * re-read it: the gap between two sweeps (4 hours at most when every one
 * lands, see `reportAge`, so 8 with one missed) plus the shop's own slot in
 * the run, rounded up. A shop's refresh age plus this must stay under
 * FRESHNESS_LIMIT_HOURS or the freshness check would fail it on a day
 * nothing went wrong, so the largest refresh age a shop may ask for is 36.
 */
export const SWEEP_SLACK_HOURS = 12;

export const MAX_REFRESH_AFTER_HOURS = FRESHNESS_LIMIT_HOURS - SWEEP_SLACK_HOURS;

/**
 * The refresh age one shop is harvested with. A shop's own `refreshAfterHours`
 * wins over the sweep's `--refresh-after-hours` (the scheduled workflow passes
 * 12 to every shop, and that must not undo a shop that asks for 24); the
 * flag's value is the default for every shop that sets none.
 */
export function refreshAfterHoursFor(shop: { refreshAfterHours?: number }, sweepDefault: number): number {
  return shop.refreshAfterHours ?? sweepDefault;
}

/**
 * The product pages a harvest re-reads for one shop: every stored listing that
 * is active, priced and not already re-priced from the shop's own feed this
 * run, last confirmed more than `hours` ago, oldest first, one address once.
 */
export function dueUrls(
  prior: readonly StoredListing[],
  refreshedSkus: ReadonlySet<string>,
  hours: number,
  now: Date,
): string[] {
  const dueBefore = new Date(now.getTime() - hours * HOUR_MS).toISOString();
  return [
    ...new Set(
      prior
        .filter((l) => l.status === 'active' && l.priceGbp !== null && !refreshedSkus.has(l.retailerSku) && l.lastSeenAt < dueBefore)
        .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt))
        .map((l) => l.url),
    ),
  ];
}

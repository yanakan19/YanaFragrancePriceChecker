import type { StoredListing } from './types.js';

/** How recently a listing must have appeared to earn the badge. */
export const NEW_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * Whether a listing should carry the NEW badge in a retailer's results.
 *
 * Three conditions, all required:
 *
 * 1. We first saw it inside the window. Seven days by default.
 * 2. It is eligible, meaning it did not arrive in the retailer's baseline
 *    crawl. On the first crawl of a shop we learn its whole catalogue at once
 *    and none of it is genuinely recent.
 * 3. It is still listed. A product that appeared and vanished within the week
 *    is not something to point a reader at.
 *
 * The badge is per retailer on purpose. Notino adding Khamrah is news about
 * Notino, and says nothing about whether Boots has carried it for two years.
 */
export function isNewListing(
  listing: StoredListing,
  now: Date = new Date(),
  windowDays: number = NEW_WINDOW_DAYS,
): boolean {
  if (!listing.eligibleForNewBadge) return false;
  if (listing.status !== 'active') return false;

  const firstSeen = Date.parse(listing.firstSeenAt);
  if (!Number.isFinite(firstSeen)) return false;

  const ageMs = now.getTime() - firstSeen;
  // A negative age means a clock problem, not a very new product.
  if (ageMs < 0) return false;

  return ageMs <= windowDays * DAY_MS;
}

/** Listings a retailer has added inside the window, newest first. */
export function newListings(
  listings: readonly StoredListing[],
  now: Date = new Date(),
  windowDays: number = NEW_WINDOW_DAYS,
): StoredListing[] {
  return listings
    .filter((l) => isNewListing(l, now, windowDays))
    .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt));
}

/** Whole days since a listing first appeared, for an "added 2 days ago" label. */
export function daysSinceFirstSeen(listing: StoredListing, now: Date = new Date()): number {
  const firstSeen = Date.parse(listing.firstSeenAt);
  if (!Number.isFinite(firstSeen)) return 0;
  return Math.max(0, Math.floor((now.getTime() - firstSeen) / DAY_MS));
}

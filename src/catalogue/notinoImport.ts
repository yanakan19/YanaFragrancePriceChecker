import type { Retailer } from '../types/retailer.js';
import type { CatalogueStore } from './store.js';
import { reconcile } from './reconcile.js';
import type { RawListing, StoredListing } from './types.js';

export interface SavedPageRead {
  /** ISO 8601, when the owner read the page. */
  readAt: string;
  listings: RawListing[];
}

export interface NotinoImportResult {
  written: boolean;
  /** Listings written or refreshed from the pages. */
  applied: number;
  /** Skipped because the store already holds a newer read of the same variant. */
  olderThanStored: number;
  newIds: string[];
}

/**
 * Merge owner saved pages into a shop's stored snapshot.
 *
 * Pages are applied oldest first, each one reconciled with `complete: false`
 * (one saved page never delists the rest) and with `now` set to the day the
 * page was read, so a listing's `lastSeenAt`, which is the date every offer
 * row and the 7 day hide rule (src/services/offerAge.ts) go by, is the day the
 * owner read it and never the day of the import. A variant the store already
 * holds from a later read is left alone, so importing an old file after a new
 * one cannot make a price look older, or fresher, than it is.
 *
 * With no pages nothing is read and nothing is written.
 */
export function ingestNotinoPages(
  store: CatalogueStore,
  retailer: Retailer,
  pages: readonly SavedPageRead[],
): NotinoImportResult {
  if (pages.length === 0) return { written: false, applied: 0, olderThanStored: 0, newIds: [] };

  const snapshot = store.read(retailer.id);
  // Live data and fixture data are never reconciled against each other.
  let listings: StoredListing[] = snapshot.source === 'live' ? snapshot.listings : [];
  let applied = 0;
  let older = 0;
  const newIds: string[] = [];

  for (const page of [...pages].sort((a, b) => a.readAt.localeCompare(b.readAt))) {
    const heldAt = new Map(listings.map((l) => [l.retailerSku, l.lastSeenAt]));
    const fresh = page.listings.filter((l) => {
      const held = heldAt.get(l.retailerSku);
      if (held !== undefined && held > page.readAt) {
        older++;
        return false;
      }
      return true;
    });
    if (fresh.length === 0) continue;
    const outcome = reconcile({
      existing: listings, crawled: fresh, retailerId: retailer.id, now: page.readAt, complete: false,
    });
    const added = new Set(outcome.newIds.map((k) => k.split('::')[1]));
    listings = outcome.listings.map((l) =>
      // An import is not a launch: a listing it adds never earns the NEW badge.
      added.has(l.retailerSku) ? { ...l, eligibleForNewBadge: false } : l,
    );
    applied += fresh.length;
    newIds.push(...outcome.newIds);
  }

  if (applied === 0) return { written: false, applied, olderThanStored: older, newIds };

  store.write({
    retailerId: retailer.id,
    updatedAt: new Date().toISOString(),
    source: 'live',
    listings,
    runs: snapshot.source === 'live' ? snapshot.runs : [],
  });
  return { written: true, applied, olderThanStored: older, newIds };
}

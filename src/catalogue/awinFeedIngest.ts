import type { Retailer } from '../types/retailer.js';
import type { CatalogueStore } from './store.js';
import { reconcile } from './reconcile.js';
import { parseAwinFeed } from './awinFeed.js';

export interface AwinFeedIngestResult {
  written: boolean;
  /** Rows the feed itself contained this run. */
  withPriceCount: number;
  /** The full stored count after reconciling — includes previously seen
   *  listings this run's feed did not mention but has not delisted long
   *  enough to drop. Only meaningful when `written` is true. */
  totalListings: number;
  newIds: string[];
  delistedIds: string[];
  relistedIds: string[];
  /** Set only when written is false. */
  reason?: string;
}

/**
 * The shared core of ingesting one Awin feed export for one retailer:
 * parse, refuse to write on zero usable rows, reconcile against whatever is
 * already stored, write it back as a live snapshot. Shared between
 * scripts/catalogue-feed.ts (a human hands over a downloaded file) and
 * scripts/awin-feed-sync.ts (fetched automatically from the Feed List
 * Download URL) so the two routes can never quietly drift into behaving
 * differently — a feed is a feed regardless of how its bytes arrived.
 */
export function ingestAwinFeedCsv(
  store: CatalogueStore,
  retailer: Retailer,
  csvText: string,
  now: string,
): AwinFeedIngestResult {
  const parsed = parseAwinFeed(csvText);
  const withPrice = parsed.filter((l) => l.priceGbp !== null);

  if (withPrice.length === 0) {
    return {
      written: false, withPriceCount: 0, totalListings: 0, newIds: [], delistedIds: [], relistedIds: [],
      reason: 'parsed to zero usable rows',
    };
  }

  // Live data and fixture data must never be reconciled against each other —
  // the same rule catalogue-harvest.ts enforces.
  const snapshot = store.read(retailer.id);
  const existing = snapshot.source === 'live' ? snapshot.listings : [];

  const outcome = reconcile({
    existing, crawled: withPrice, retailerId: retailer.id, now, complete: true,
  });

  store.write({
    retailerId: retailer.id,
    updatedAt: now,
    source: 'live',
    listings: outcome.listings,
    runs: snapshot.source === 'live' ? snapshot.runs : [],
  });

  return {
    written: true,
    withPriceCount: withPrice.length,
    totalListings: outcome.listings.length,
    newIds: outcome.newIds,
    delistedIds: outcome.delistedIds,
    relistedIds: outcome.relistedIds,
  };
}

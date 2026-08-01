import type { RawListing, ReconcileResult, StoredListing } from './types.js';
import { listingKey } from './types.js';

/**
 * Reconcile one crawl against what we already had for a retailer.
 *
 * This is the heart of the catalogue. Everything the NEW badge depends on is
 * decided here, and three rules matter more than the rest:
 *
 * 1. **The first crawl is a baseline.** When we have never crawled a retailer,
 *    every listing it returns is recorded but marked ineligible for the badge.
 *    Otherwise launch day would flag the entire catalogue as new, which tells a
 *    reader nothing and trains them to ignore the badge permanently.
 *
 * 2. **`firstSeenAt` never moves.** A listing that vanishes for a fortnight and
 *    returns is not a new product. It gets `relistedAt` instead, so a restock
 *    can be surfaced separately if you ever want to, without lying about age.
 *
 * 3. **A failed crawl must not delist anything.** Absence is only evidence when
 *    the crawl actually succeeded. Callers pass `complete: false` after a
 *    partial run and nothing is marked gone.
 */
export interface ReconcileOptions {
  /** Listings we already hold for this retailer. */
  existing: readonly StoredListing[];
  /** What the crawl just returned. */
  crawled: readonly RawListing[];
  retailerId: string;
  /** Crawl timestamp, ISO 8601. Injected so runs are reproducible in tests. */
  now: string;
  /**
   * Whether the crawl walked the whole catalogue. False after a partial or
   * failed run, which suppresses delisting entirely.
   */
  complete: boolean;
}

export function reconcile(options: ReconcileOptions): ReconcileResult {
  const { existing, crawled, retailerId, now, complete } = options;

  // A retailer we have never successfully crawled has no baseline to compare
  // against, so nothing found today can be called new.
  const baseline = existing.length === 0;

  const byKey = new Map(existing.map((l) => [listingKey(l.retailerId, l.retailerSku), l]));
  const seenKeys = new Set<string>();

  const newIds: string[] = [];
  const relistedIds: string[] = [];
  const result: StoredListing[] = [];

  for (const raw of crawled) {
    const key = listingKey(retailerId, raw.retailerSku);

    // A retailer can list the same product in two sections. First one wins.
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const prior = byKey.get(key);

    if (!prior) {
      result.push({
        ...raw,
        retailerId,
        firstSeenAt: now,
        lastSeenAt: now,
        status: 'active',
        delistedAt: null,
        relistedAt: null,
        eligibleForNewBadge: !baseline,
        variantId: null,
      });
      if (!baseline) newIds.push(key);
      continue;
    }

    const returning = prior.status === 'delisted';
    if (returning) relistedIds.push(key);

    result.push({
      // Refresh the retailer's own fields: titles, prices and images change.
      ...raw,
      retailerId,
      // Identity and history are ours and survive the refresh.
      firstSeenAt: prior.firstSeenAt,
      lastSeenAt: now,
      status: 'active',
      delistedAt: null,
      relistedAt: returning ? now : prior.relistedAt,
      eligibleForNewBadge: prior.eligibleForNewBadge,
      variantId: prior.variantId,
    });
  }

  const delistedIds: string[] = [];

  for (const prior of existing) {
    const key = listingKey(prior.retailerId, prior.retailerSku);
    if (seenKeys.has(key)) continue;

    // Absence only counts as evidence when the crawl actually finished.
    if (!complete) {
      result.push(prior);
      continue;
    }

    if (prior.status === 'delisted') {
      result.push(prior);
      continue;
    }

    delistedIds.push(key);
    result.push({ ...prior, status: 'delisted', delistedAt: now });
  }

  return { listings: result, newIds, delistedIds, relistedIds, baseline };
}

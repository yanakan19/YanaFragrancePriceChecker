/**
 * Catalogue types.
 *
 * The catalogue answers a different question from the price comparison. Prices
 * ask "what does this cost right now"; the catalogue asks "what does this shop
 * currently sell". Keeping them apart matters, because a listing exists and can
 * be new whether or not we have managed to price it yet.
 */

/** A product as one retailer lists it, before any matching has happened. */
export interface RawListing {
  /** The retailer's own product identifier, taken from the page or its URL. */
  retailerSku: string;
  /** Canonical product URL at the retailer. */
  url: string;
  /** Title exactly as the retailer wrote it. Never cleaned in place. */
  rawTitle: string;
  rawBrand: string | null;
  /** EAN or GTIN where the page exposes one. The best matching key we can get. */
  ean: string | null;
  imageUrl: string | null;
  priceGbp: number | null;
  /** The retailer's own reference price, where the page publishes one. */
  wasPriceGbp: number | null;
  /** Retailer published promotion end, ISO 8601. Never inferred. */
  promoEndsAt: string | null;
  inStock: boolean | null;
  /** Which catalogue section this listing was found in. */
  sectionId: string;
  /**
   * The retailer's own product copy, exactly as they wrote it, where a source
   * provides one. Carried unparsed: fragrance notes are pulled out of it at
   * display build time (see scripts/build-demo-catalogue.ts) so the parsing
   * rules can change without needing a fresh crawl. Optional because the
   * JSON-LD scrapers do not currently capture it.
   */
  description?: string | null;
  /**
   * The source's own price where it does not price in sterling.
   *
   * A brand's direct storefront often sells in AED, USD or EUR. Converting one
   * of those into `priceGbp` would mean inventing an exchange rate and a date,
   * and presenting the result as the price a UK customer pays — which it is
   * not, before that house's own shipping and any duty. So the figure is
   * carried here exactly as published, `priceGbp` stays null, and the listing
   * is recorded as known-but-unpriced rather than quietly mispriced.
   *
   * `currency` is `'unknown'` when the storefront never published one; that is
   * still not a licence to assume sterling.
   */
  nativePrice?: { amount: number; currency: string } | null;
}

/** Where a listing is in its life at a retailer. */
export type ListingStatus =
  /** Seen in the most recent successful crawl. */
  | 'active'
  /** Absent from the most recent crawl, but seen before. */
  | 'delisted';

/**
 * A stored listing: one row per retailer product, carrying the timestamps the
 * NEW badge depends on.
 */
export interface StoredListing extends RawListing {
  retailerId: string;
  /**
   * When we first saw this listing. Drives the NEW badge and never moves once
   * set, not even if the listing disappears and comes back.
   */
  firstSeenAt: string;
  /** The most recent crawl that found it. */
  lastSeenAt: string;
  status: ListingStatus;
  /** When it stopped appearing, cleared if it returns. */
  delistedAt: string | null;
  /** Most recent return from delisted, if any. Kept separate from firstSeenAt. */
  relistedAt: string | null;
  /**
   * False when this listing arrived in a retailer's very first crawl.
   *
   * Without this flag the entire catalogue would be flagged NEW on day one,
   * which is both useless and actively misleading. Baseline listings are known
   * to exist but not known to be recent, so they never earn the badge.
   */
  eligibleForNewBadge: boolean;
  /** Resolved variant once matching succeeds. Null while awaiting review. */
  variantId: string | null;
}

/** What one crawl of one retailer produced. */
export interface CatalogueRun {
  runId: string;
  retailerId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'ok' | 'partial' | 'failed';
  /** True when this was the retailer's first ever successful crawl. */
  baseline: boolean;
  pagesFetched: number;
  listingsSeen: number;
  newListings: number;
  delistedListings: number;
  relistedListings: number;
  errors: string[];
}

/** The outcome of reconciling one crawl against what we already had. */
export interface ReconcileResult {
  listings: StoredListing[];
  newIds: string[];
  delistedIds: string[];
  relistedIds: string[];
  baseline: boolean;
}

/** Composite key for a listing. A SKU is only unique within its retailer. */
export function listingKey(retailerId: string, retailerSku: string): string {
  return `${retailerId}::${retailerSku}`;
}

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
  /**
   * Canonical product URL at the retailer, and the address the app links to.
   *
   * For an affiliate-feed retailer this is the network's tracking link (an
   * `awin1.com/pclick` URL), which is how the site is monetised. It stays the
   * link the app sends a reader to. See `merchantUrl` below before reaching
   * for the other one.
   */
  url: string;
  /** Title exactly as the retailer wrote it. Never cleaned in place. */
  rawTitle: string;
  /**
   * The merchant's own product page, where a source publishes one *alongside*
   * a different `url`. Verification address only — never a link destination.
   *
   * This exists for one reason. An affiliate feed's only URL is the network's
   * tracking link, and scripts/price-verify.ts will not fetch one of those: an
   * `awin1.com/pclick` request is reported to the merchant as a customer click
   * that nobody made. So a feed retailer whose storefront serves no
   * `/products.json` had no address that could honestly be read, and sat
   * permanently outside price verification — Fragrance Click's 907 active
   * listings, 784 live offers, measured from data/catalogue/fragrance-click.json
   * and demo/catalogue.generated.ts on 2026-08-13.
   *
   * Awin's `merchant_deep_link` column is that address, published by the
   * merchant in the same row. Carrying it gives the verifier an ordinary
   * product page to read, and gives the app a fallback destination if a
   * deeplink ever breaks.
   *
   * **Do not swap this into `url`.** The tracking link is the revenue; this is
   * the evidence. Getting the two the wrong way round costs real money and is
   * the mistake this field is most likely to invite, which is why the verifier
   * reads it through one helper (`verificationTarget`) rather than inline.
   *
   * Null or absent wherever `url` is already the merchant's own page — every
   * scraped route, where the stored URL *is* the product page.
   */
  merchantUrl?: string | null;
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
  /**
   * The retailer's own `aggregateRating`, read off the same schema.org
   * Product node as the price — the legitimate substitute for a
   * Fragrantica-style rating, since that site's own ToS forbids scraping its
   * reviews (see docs/SCRAPING.md). `count` is null where a source publishes
   * a star value with no review count; never invented. Optional because only
   * the JSON-LD route (src/catalogue/jsonld.ts) currently reads it — every
   * other adapter leaves it absent, which must read as "not captured", never
   * as "no reviews".
   */
  rating?: { value: number; count: number | null } | null;
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

/**
 * Retailer registry types.
 *
 * ── On the absence of a `trusted` flag ────────────────────────────────────────
 * An earlier design carried a per-retailer `trusted` boolean. It was dropped
 * deliberately, because it never had a stated criterion and so could not be
 * maintained: Selfridges and Harvey Nichols are beyond reproach on
 * authenticity, yet were marked untrusted — which means the flag was silently
 * encoding "good value" while being named for authenticity.
 *
 * The decision taken instead: every retailer in this registry is a legitimate
 * UK stockist and all of them are fine to send a user to. What differentiates
 * a good listing from a bad one is not the retailer's identity but whether we
 * are showing the truth about the offer:
 *
 *   1. the genuine price being charged right now;
 *   2. the was/now pair and discount percentage, when the retailer is running
 *      a real promotion;
 *   3. the delivery cost that will actually be added at checkout, including
 *      whether this order clears that retailer's free-delivery threshold;
 *   4. the stock state, with out-of-stock listings pushed to the bottom rather
 *      than quietly mixed in.
 *
 * Those obligations are universal, so they live in the offer pipeline
 * (`src/services/`) rather than as a per-retailer flag. `enabled` remains as
 * the one per-retailer switch, and it means exactly what it says: whether we
 * currently fetch from this retailer at all.
 *
 * Per-seller trust *is* still modelled for TikTok Shop (see
 * `src/config/tiktokSellers.ts`), where counterfeits are a genuine risk and the
 * flag has a concrete meaning.
 */

/**
 * Catalogue segments a retailer meaningfully stocks. Used to skip retailers
 * that cannot plausibly carry a fragrance — there is no point asking Superdrug
 * for Amouage.
 */
export type RetailerTier = 'designer' | 'niche' | 'mideast';

/** How offers are fetched from this retailer. Set by the Phase 0 spike. */
export type AdapterStrategy =
  /** Retailer PDP embeds a schema.org/Product JSON-LD block: plain fetch + parse. */
  | 'json-ld'
  /** JS rendered but reachable: a plain headless browser is enough. */
  | 'headless'
  /**
   * Refuses a datacentre address outright. Needs retrieval through residential
   * addresses, which costs money per request, so this is the adapter of last
   * resort. Prefer an affiliate feed for anything marked this way.
   * See docs/INGESTION.md.
   */
  | 'proxied'
  /** Product feed from the affiliate network is the source of truth. */
  | 'affiliate-feed'
  /** Not yet determined — the Phase 0 spike has not covered this retailer. */
  | 'unknown';

/** Affiliate networks the UK beauty market actually runs on. */
export type AffiliateNetwork =
  | 'awin'
  | 'rakuten'
  | 'cj'
  | 'partnerize'
  | 'tradedoubler'
  | 'impact'
  /** Retailer runs its own in-house programme. */
  | 'direct';

export interface AffiliateConfig {
  /**
   * The network this programme runs on. `null` means not yet researched.
   * `verified` distinguishes "we confirmed this against the network's own
   * merchant listing" from "this is the likely network, pending the audit".
   */
  network: AffiliateNetwork | null;
  verified: boolean;
  /**
   * Application state. Nothing below `active` produces a tracked link — the
   * offer URL falls back to the plain retailer URL, which is correct and
   * clickable, just unmonetised.
   */
  status: 'not-researched' | 'not-applied' | 'pending' | 'active' | 'rejected';
  /** Publisher/affiliate id issued by the network once approved. */
  publisherId: string | null;
  /**
   * Deeplink template. `{{publisherId}}` and `{{url}}` (URL-encoded target)
   * are substituted at link-build time. Null until the programme is live.
   */
  deeplinkTemplate: string | null;
  /** Where to sign up, so the reminder output is actionable rather than nagging. */
  signupUrl: string | null;
  notes?: string;
}

/**
 * A retailer's standard UK delivery rules.
 *
 * Only *standard* delivery is modelled, because that is what the comparison
 * shows by default. Express tiers exist but are opt-in at checkout and would
 * make the headline number misleading.
 */
export interface ShippingRule {
  /** Cost of standard delivery when the free-delivery threshold is not met. */
  standardGbp: number;
  /**
   * Order subtotal (excluding delivery) at or above which standard delivery
   * becomes free. `null` means this retailer has no spend-based free delivery
   * — Notino, for example, gates free delivery on specific products instead.
   */
  freeOverGbp: number | null;
  /** Indicative standard delivery window, [min, max] working days. */
  estimatedDays: [number, number];
  /**
   * Free delivery that requires a paid subscription or loyalty scheme. Recorded
   * for display as a footnote, and never applied to the delivered price — we
   * cannot assume the user is a member, and quoting a members-only price as the
   * headline would be exactly the kind of dishonesty this model exists to avoid.
   */
  membershipPerk?: {
    scheme: string;
    description: string;
  };
  /** ISO-8601 date these figures were last checked against the retailer. */
  verifiedAt: string;
  /**
   * `confirmed` — read off the retailer's own delivery page.
   * `unverified` — sourced indirectly; treat the delivered price as indicative
   *   and surface a caveat in the UI.
   */
  confidence: 'confirmed' | 'unverified';
  notes?: string;
}

/**
 * Where a retailer's fragrance catalogue lives, and how to walk it.
 *
 * A daily crawl needs to know which pages actually enumerate the fragrance
 * range. Retailers split it differently: some have one /fragrance tree, some
 * separate men's and women's, some bury niche houses in a distinct department.
 * Each entry here is one walkable section.
 */
export interface CatalogueSection {
  /** Stable key for this section, unique within the retailer. */
  id: string;
  /** Human label, used in run reports. */
  label: string;
  /** Listing page URL. `{page}` is substituted with the page number. */
  urlTemplate: string;
  /** Which catalogue segment this section maps to, for matching hints. */
  tier: RetailerTier;
}

export interface CatalogueConfig {
  sections: CatalogueSection[];
  /** Page number the retailer's pagination starts at. Usually 1, sometimes 0. */
  firstPage: number;
  /**
   * Stop after this many pages per section, however many the retailer claims.
   * A guard against a pagination bug walking forever.
   */
  maxPages: number;
  /**
   * Minimum gap between requests to this retailer, in milliseconds. Politeness
   * is not optional: a daily catalogue walk is thousands of requests, and the
   * fastest way to get blocked is to arrive all at once.
   */
  minRequestGapMs: number;
}

export interface Retailer {
  /** Stable internal key. Never derive this from the domain — domains change. */
  id: string;
  /** Display name, exactly as the retailer brands itself. */
  name: string;
  domain: string;
  homepage: string;
  /** Catalogue segments this retailer is worth querying for. */
  tiers: RetailerTier[];
  /** Whether the pipeline currently fetches from this retailer at all. */
  enabled: boolean;
  adapter: AdapterStrategy;
  shipping: ShippingRule;
  affiliate: AffiliateConfig;
  /**
   * Fragrance catalogue entry points. `null` where the section URLs have not
   * been confirmed yet, which keeps the daily crawl from inventing paths.
   */
  catalogue: CatalogueConfig | null;
  /** All registry entries are UK storefronts pricing in sterling. */
  currency: 'GBP';
}

/**
 * TikTok Shop seller registry — Phase 5 beta, behind a feature flag.
 *
 * This file is deliberately separate from `retailers.ts` and the two must not
 * be merged. TikTok Shop remains aggressively anti-bot with chaotic
 * seller-authored titles, and when it breaks — and it will — the core
 * comparison has to be entirely unaffected.
 *
 * ── A stale claim, corrected 2026-08-27 ─────────────────────────────────────
 * This header used to say TikTok Shop has "no affiliate feed, no stable
 * product ids". Checked against the platform as it stands, both halves are
 * out of date. TikTok Shop opened an Affiliate Open API to developers in 2024
 * (Creator, Seller and Partner variants), and its Products API keys
 * everything — fetching, pricing, showcase membership — off a first-class
 * `product_id`. There is still no Awin-style downloadable datafeed, which is
 * what the old note was reaching for, but the queryable affiliate API is the
 * same job done differently. Evidence, route comparison and the chosen
 * integration path: docs/TIKTOK-SHOP-PLAN.md.
 *
 * The seller list is curated by hand. There is no open-ended TikTok search,
 * because an open search is precisely how a fragrance comparison site starts
 * surfacing counterfeits.
 *
 * Note that `trusted` genuinely means something here, unlike the retailer flag
 * it replaced: TikTok Shop fragrance has a real fake problem, so this flag
 * asserts that we have satisfied ourselves the seller ships authentic stock.
 */

export interface TikTokSeller {
  id: string;
  /** @handle, without the leading @. */
  handle: string;
  displayName: string;
  /**
   * The `retailers.ts` id of this company's own-website storefront, where the
   * TikTok shop is the same business as a retailer this site already
   * compares. That linkage is what the trust decisions below stand on, and it
   * is also what makes the BeautyBase pilot cross-check possible: the same
   * bottles exist in data/catalogue/<retailerId>.json with EANs and sterling
   * prices, so a TikTok capture can be verified against a known-good source
   * (see crossCheckTikTokCapture in src/catalogue/tiktokShop.ts). Absent for
   * a TikTok-only seller.
   */
  retailerId?: string;
  /**
   * Whether we have satisfied ourselves this seller ships authentic product.
   * Untrusted sellers are not rendered at all — see TIKTOK_BETA_CONFIG.
   */
  trusted: boolean;
  /** Why the trust decision went the way it did. Required — an undocumented
   *  trust call is one nobody can revisit. */
  notes: string;
  addedAt: string;
}

/**
 * Hand-curated, per the header. Every handle below was confirmed against a
 * search result naming the account before it was written down — the sourcing
 * for each is in its own notes, and docs/TIKTOK-SHOP-PLAN.md §5 carries the
 * links. Nothing here was seeded from a plausible guess.
 *
 * YeahLive is deliberately absent. The owner named it, and a "Yeah Live"
 * fragrance shop selling Arabian-inspired perfumes does exist (a Shopify
 * storefront is visible via shop.app), but no search result names its TikTok
 * handle — and a guessed handle on a site whose entire value is authenticity
 * would be worse than the gap. It gets added the moment the owner supplies
 * the @handle from the app, with a note recording that provenance.
 */
export const TIKTOK_SELLERS: readonly TikTokSeller[] = [
  {
    id: 'tiktok-beautybase',
    handle: 'beautybase',
    displayName: 'Beauty Base',
    retailerId: 'beautybase',
    trusted: true,
    notes:
      'The pilot seller. Same company as the beautybase registry retailer: ' +
      'the @beautybase TikTok account (106K followers, "Shopping & Retail") ' +
      'directs to www.beautybase.com and its videos name the same eight UK ' +
      'shopping-centre stores the website does. Trust rests on that identity ' +
      '— this site already sends customers to beautybase.com, and the TikTok ' +
      'shop is the same stock sold by the same business. First live capture ' +
      'must pass the cross-check against data/catalogue/beautybase.json ' +
      'before anything from it is shown.',
    addedAt: '2026-08-27',
  },
  {
    id: 'tiktok-perfumeo',
    handle: 'perfumeo.co.uk',
    displayName: 'PERFUMEO.UK',
    retailerId: 'perfumeo',
    trusted: true,
    notes:
      'Same company as the perfumeo registry retailer: the @perfumeo.co.uk ' +
      'TikTok account (28.9K followers) sells Arabian and designer ' +
      'fragrances through PERFUMEO.co.uk — the registry entry\'s own domain. ' +
      'Trust rests on that identity, same basis as Beauty Base.',
    addedAt: '2026-08-27',
  },
  {
    id: 'tiktok-oud-arabian',
    handle: 'oud.arabian',
    displayName: 'Oud Arabian',
    retailerId: 'oud-arabian',
    trusted: true,
    notes:
      'Same company as the oud-arabian registry retailer: the @oud.arabian ' +
      'TikTok account (18.7K followers) names stores in Telford, Milton ' +
      'Keynes, Essex and Guildford, and oudarabian.co.uk/pages/locations ' +
      'lists the same Telford, Milton Keynes and Chelmsford (Essex) sites. ' +
      'Trust rests on that identity, same basis as Beauty Base.',
    addedAt: '2026-08-27',
  },
];

export const TIKTOK_BETA_CONFIG = {
  /** The kill switch. One boolean turns the whole section off. */
  enabled: false,
  /**
   * Untrusted sellers are excluded outright rather than shown with a warning.
   * A warning label still gives a counterfeit listing a shelf next to genuine
   * stock, and the badge is doing more work than a badge can do.
   *
   * OPEN QUESTION for Yana (§8.7): if you would rather show untrusted sellers
   * behind a warning, flip this — but the exclusion default is the safer
   * starting position for a site selling its credibility.
   */
  showUntrustedSellers: false,
  /** Rendered above the section. Mandatory, non-dismissible. */
  authenticityDisclaimer:
    'TikTok Shop listings are seller-fulfilled and are not covered by the ' +
    'authenticity checks that apply to the retailers below. Buy at your own ' +
    'discretion.',
} as const;

/** Sellers eligible for rendering under the current beta configuration. */
export function visibleTikTokSellers(): TikTokSeller[] {
  if (!TIKTOK_BETA_CONFIG.enabled) return [];
  return TIKTOK_SELLERS.filter((s) => s.trusted || TIKTOK_BETA_CONFIG.showUntrustedSellers);
}

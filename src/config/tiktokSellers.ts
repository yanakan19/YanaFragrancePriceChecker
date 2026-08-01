/**
 * TikTok Shop seller registry — Phase 5 beta, behind a feature flag.
 *
 * This file is deliberately separate from `retailers.ts` and the two must not
 * be merged. TikTok Shop has no affiliate feed, no stable product ids,
 * aggressive anti-bot, and chaotic seller-authored titles. When it breaks — and
 * it will — the core comparison has to be entirely unaffected.
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
 * Empty by design. Populating this is a manual curation task, not something to
 * be seeded with plausible-looking handles — a fabricated seller list on a site
 * whose entire value is authenticity would be worse than no list at all.
 */
export const TIKTOK_SELLERS: readonly TikTokSeller[] = [];

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

import type { Retailer } from '../types/retailer.js';
import { RETAILERS } from '../config/retailers.js';

/**
 * Outbound link building.
 *
 * Most retailers have no affiliate programme live yet, so their links resolve
 * to the plain retailer URL — correct, clickable, and unmonetised. Once a
 * programme is approved for one of them, filling in `publisherId` and
 * `deeplinkTemplate` in the registry is the only change needed; nothing
 * downstream has to move.
 *
 * A retailer on the `affiliate-feed` adapter (Fragrance Click UK, currently)
 * is different: its programme is already live, but the tracking link comes
 * pre-built from the merchant's own datafeed rather than from a template here
 * — see the note on `buildOutboundLink` below.
 */

export interface OutboundLink {
  url: string;
  isAffiliateLink: boolean;
}

/**
 * Resolve the URL a "Buy" button should point at.
 *
 * Falls back to the direct URL whenever the programme is not live or the
 * template is incomplete. Failing open matters here: a broken tracking link
 * loses a sale, whereas an untracked link only loses the commission.
 *
 * A retailer on the `affiliate-feed` adapter is a special case: `productUrl`
 * there is `aw_deep_link` straight from that merchant's own Awin datafeed,
 * which is already a complete, per-product tracking redirect
 * (awin1.com/pclick.php?p=...) — not a plain merchant URL waiting to be
 * wrapped. Running it through `deeplinkTemplate` too would nest one Awin
 * redirect inside another (cread.php?...&ued=<that pclick.php URL>), which
 * is not a link Awin's redirector is meant to receive. The feed URL is the
 * finished link; it passes straight through, still flagged as affiliate.
 */
export function buildOutboundLink(retailer: Retailer, productUrl: string): OutboundLink {
  const { affiliate } = retailer;

  if (retailer.adapter === 'affiliate-feed') {
    return { url: productUrl, isAffiliateLink: true };
  }

  if (affiliate.status !== 'active' || !affiliate.publisherId) {
    return { url: productUrl, isAffiliateLink: false };
  }

  // The in-house shape: append a query parameter directly onto the
  // retailer's own URL rather than wrapping it inside a redirect domain —
  // see the field's own doc comment in src/types/retailer.ts for why this
  // cannot reuse deeplinkTemplate's {{url}} substitution (that one
  // URL-encodes its target, which is correct for a value inside someone
  // else's redirect and wrong for a parameter on a real, clickable link).
  if (affiliate.querySuffixTemplate) {
    const suffix = affiliate.querySuffixTemplate
      .replace('{{publisherId}}', encodeURIComponent(affiliate.publisherId))
      .replace(/^[?&]/, '');
    if (!suffix) return { url: productUrl, isAffiliateLink: false };
    const separator = productUrl.includes('?') ? '&' : '?';
    return { url: `${productUrl}${separator}${suffix}`, isAffiliateLink: true };
  }

  if (!affiliate.deeplinkTemplate) {
    return { url: productUrl, isAffiliateLink: false };
  }

  const url = affiliate.deeplinkTemplate
    .replace('{{publisherId}}', encodeURIComponent(affiliate.publisherId))
    .replace('{{url}}', encodeURIComponent(productUrl));

  // A template that substituted nothing is a misconfiguration, not a link.
  if (url === affiliate.deeplinkTemplate) {
    return { url: productUrl, isAffiliateLink: false };
  }

  return { url, isAffiliateLink: true };
}

export interface AffiliateGap {
  retailerId: string;
  retailerName: string;
  status: Retailer['affiliate']['status'];
  network: Retailer['affiliate']['network'];
  networkVerified: boolean;
  signupUrl: string | null;
  action: string;
}

/**
 * The reminder hook. Lists every retailer not yet earning, and what the next
 * concrete step is for each. Surfaced by `npm run affiliate:status`.
 */
export function pendingAffiliateSetup(
  retailers: readonly Retailer[] = RETAILERS,
): AffiliateGap[] {
  return retailers
    .filter((r) => r.affiliate.status !== 'active')
    .map((r) => ({
      retailerId: r.id,
      retailerName: r.name,
      status: r.affiliate.status,
      network: r.affiliate.network,
      networkVerified: r.affiliate.verified,
      signupUrl: r.affiliate.signupUrl,
      action: nextAction(r),
    }));
}

function nextAction(r: Retailer): string {
  switch (r.affiliate.status) {
    case 'not-researched':
      return `Find which network runs ${r.name}'s programme (check Awin first, then Rakuten, CJ, Partnerize, Tradedoubler).`;
    case 'not-applied':
      return `Apply to the ${r.affiliate.network ?? 'programme'} listing${r.affiliate.signupUrl ? ` at ${r.affiliate.signupUrl}` : ''}.`;
    case 'pending':
      return `Application submitted — chase approval, then fill in publisherId and deeplinkTemplate.`;
    case 'rejected':
      return `Rejected. Either re-apply once the site has traffic, or accept ${r.name} stays unmonetised.`;
    case 'active':
      return 'Live.';
  }
}

/** True while any retailer is still unmonetised. Drives the build-time nudge. */
export function hasAffiliateGaps(retailers: readonly Retailer[] = RETAILERS): boolean {
  return pendingAffiliateSetup(retailers).length > 0;
}

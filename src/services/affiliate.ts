import type { Retailer } from '../types/retailer.js';
import { RETAILERS } from '../config/retailers.js';

/**
 * Outbound link building.
 *
 * No affiliate programme is live yet, so every link currently resolves to the
 * plain retailer URL — correct, clickable, and unmonetised. Once a programme is
 * approved, filling in `publisherId` and `deeplinkTemplate` in the registry is
 * the only change needed; nothing downstream has to move.
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
 */
export function buildOutboundLink(retailer: Retailer, productUrl: string): OutboundLink {
  const { affiliate } = retailer;

  if (affiliate.status !== 'active' || !affiliate.deeplinkTemplate || !affiliate.publisherId) {
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

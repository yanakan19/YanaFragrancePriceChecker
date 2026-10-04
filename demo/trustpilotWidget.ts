import type { Retailer } from '../src/types/retailer.js';

/**
 * What `trustpilotWidget()` in demo/app.ts needs to render, decided
 * independently of any markup so it can be unit tested directly — app.ts
 * pulls in the whole DOM-touching harness at import time (it calls `init()`
 * at the bottom of the file the moment it loads), so nothing in it can be
 * imported from a plain Node test, the same reason demo/volumeBands.ts and
 * demo/listSort.ts already live in their own modules.
 *
 * The review link comes only from the registry's `trustpilotUrl`, a page
 * that was fetched and checked against the shop. It is never built from the
 * shop's domain, because a shop's Trustpilot page is not always filed under
 * its own domain, and a guessed address can land on someone else's reviews.
 * A shop without a verified address shows nothing at all (`none`): no
 * placeholder, no apology, no guess.
 *
 * `widget` is the older, optional extra: once a shop also has a
 * `trustpilotBusinessId`, a button offers Trustpilot's own rating widget,
 * loaded only when pressed. The plain link is shown either way. Nothing here
 * copies a score, star rating or review count from Trustpilot.
 */
export type TrustpilotState =
  | { kind: 'none' }
  | { kind: 'link'; reviewUrl: string; linkText: string; ariaLabel: string }
  | { kind: 'widget'; businessId: string; reviewUrl: string; linkText: string; ariaLabel: string };

/** Every review page this site links to starts with this. */
export const TRUSTPILOT_REVIEW_PREFIX = 'https://uk.trustpilot.com/review/';

/** The visible words of the link, Title Case. */
export const TRUSTPILOT_LINK_TEXT = 'Reviews on Trustpilot';

/** True for an address of the exact shape https://uk.trustpilot.com/review/<name>, with no query or fragment. */
export function isTrustpilotReviewUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.startsWith(TRUSTPILOT_REVIEW_PREFIX) &&
    /^[a-z0-9][a-z0-9.-]*$/i.test(url.slice(TRUSTPILOT_REVIEW_PREFIX.length))
  );
}

export function trustpilotStateFor(
  r: Pick<Retailer, 'name' | 'trustpilotUrl' | 'trustpilotBusinessId'>,
): TrustpilotState {
  if (!isTrustpilotReviewUrl(r.trustpilotUrl)) return { kind: 'none' };
  const base = {
    reviewUrl: r.trustpilotUrl,
    linkText: TRUSTPILOT_LINK_TEXT,
    // Starts with the visible words, so the spoken name matches what is seen.
    ariaLabel: `${TRUSTPILOT_LINK_TEXT} for ${r.name}, opens in a new tab`,
  };
  if (r.trustpilotBusinessId) return { kind: 'widget', businessId: r.trustpilotBusinessId, ...base };
  return { kind: 'link', ...base };
}

const escAttr = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The review link as a shop page shows it: the same pill the brand pages use
 * for an outside link, opening in a new tab. Not an affiliate link, so no
 * `sponsored` and no tracking parameters; `noopener` keeps the new tab from
 * reaching back. The visible words are the same on every shop, the spoken
 * name adds which shop. `iconHtml` is the app's own external link icon.
 */
export function trustpilotLinkMarkup(
  state: Extract<TrustpilotState, { kind: 'link' | 'widget' }>,
  iconHtml: string,
): string {
  return `<a class="brand-site-link trustpilot-link" href="${escAttr(state.reviewUrl)}" target="_blank" rel="noopener"
       aria-label="${escAttr(state.ariaLabel)}">
      <span class="control-ico" aria-hidden="true">${iconHtml}</span>
      <span>${escAttr(state.linkText)}</span>
    </a>`;
}

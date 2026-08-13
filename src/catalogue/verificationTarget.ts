import type { RawListing } from './types.js';

/**
 * Which address a price check is allowed to fetch for one listing.
 *
 * ── Why this is a module and not four lines inside the verifier ─────────────
 * A listing can now carry two URLs and only one of them may ever be requested.
 * `url` is the affiliate tracking link — an `awin1.com/pclick` request is
 * reported to the merchant as a customer click that nobody made, and firing
 * thousands to check prices would be fraud against the programme that funds
 * this project. `merchantUrl` is the merchant's own product page, published by
 * the merchant in the same feed row, and is an ordinary page anyone may read.
 *
 * That distinction is the single most consequential rule in the price
 * verification path, and an inline ternary is not somewhere a rule like that
 * can be tested. It lives here so it can be, and so there is exactly one
 * answer to "which URL do I fetch" rather than one per call site.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Prefer `merchantUrl`, fall back to `url`, and return either **only** if it is
 * on the retailer's own registered domain.
 *
 * The domain check is a whitelist, not an `awin1.com` blacklist, and that is
 * deliberate: a blacklist has to anticipate every affiliate network that might
 * ever appear in the data, and gets this wrong the first time one does. A
 * whitelist is wrong only in the safe direction — it can decline an address
 * that would have been fine, which is reported as "unverifiable by this
 * route", a true statement. It can never approve a tracking link, on any
 * network, even if the two fields are one day populated the wrong way round.
 *
 * Returning null is therefore a normal outcome and never a reason to relax the
 * rule. A listing with no qualifying address simply cannot be checked this way.
 */
export function verificationTarget(
  listing: Pick<RawListing, 'url' | 'merchantUrl'>,
  retailerDomain: string,
): string | null {
  const registered = retailerDomain.replace(/^www\./, '').toLowerCase();
  if (!registered) return null;

  const onOwnDomain = (raw: string | null | undefined): string | null => {
    if (!raw) return null;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      // Relative or malformed. Deliberately not resolved against the
      // storefront origin: a stored URL that is not absolute is a defect in
      // whatever wrote it, and picking an origin for it would be inventing an
      // address rather than reading one.
      return null;
    }

    // Anything that is not a plain web fetch — javascript:, data:, file: — is
    // not a product page and must never reach an HTTP client.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    // Exact match, or a subdomain of it. `endsWith` is anchored with the dot
    // so `notfragranceclick.co.uk` cannot pass as `fragranceclick.co.uk`.
    if (host !== registered && !host.endsWith(`.${registered}`)) return null;

    return parsed.toString();
  };

  return onOwnDomain(listing.merchantUrl) ?? onOwnDomain(listing.url);
}

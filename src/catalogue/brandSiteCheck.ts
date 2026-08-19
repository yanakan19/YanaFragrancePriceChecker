/**
 * Deciding what a brand link's landing address actually tells us.
 *
 * Split out of scripts/brand-site-probe.ts so the judgement can be tested
 * without a network. The probe's fetching half cannot run in this environment
 * at all (egress is blocked — docs/INGESTION.md), and a rule that decides
 * which of a reader's "official site" links are wrong is exactly the half that
 * should not be shipped on the strength of "it looked right when I wrote it".
 * Everything below is a pure function of a URL pair and a status code.
 *
 * ── The distinction this file exists to draw ─────────────────────────────────
 * Not every redirect is a fault, and not every foreign domain is one either.
 * Three genuinely different things get confused if they are not named apart:
 *
 *   - A brand that runs one global site. carolinaherrera.com is Carolina
 *     Herrera's own home; there is no .co.uk to prefer and nothing is wrong.
 *     A rule of "must be UK" would reject dozens of correct entries.
 *   - A brand whose link lands on the same house's *different market* —
 *     ae.ahmedalmaghribi.com being handed to a UK shopper. Same company, wrong
 *     storefront. This is the known real error and the reason for the sweep.
 *   - A brand whose link lands on a different company altogether: a lapsed
 *     domain now parked, or a URL that was wrong from the start.
 *
 * So the classifier compares what was *published* against what was *reached*,
 * rather than measuring either against an idea of what a UK site looks like.
 * A brand that publishes a global address and reaches it is `ok`. One that
 * publishes a UK address and is bounced elsewhere is not.
 */

export interface BrandSiteFinding {
  /** Every brand key in demo/brandSites.ts pointing at this URL. */
  brands: string[];
  /** The URL as demo/brandSites.ts publishes it. */
  declared: string;
  /** Where the request ended after redirects, or null if it never arrived. */
  landed: string | null;
  status: number;
  verdict: 'ok' | 'dead' | 'redirected-domain' | 'redirected-region' | 'could-not-ask' | 'unusable';
  reason: string;
}

export interface Landing {
  brands: string[];
  declared: string;
  landed: string | null;
  status: number;
  error?: string;
}

/**
 * Multi-part public suffixes this registry actually meets.
 *
 * Deliberately a short, literal list rather than an attempt at the Public
 * Suffix List. Getting `co.uk` right matters here because it is the single
 * most common shape in this file and a naive last-two-labels rule would read
 * every UK domain's registrable part as "co.uk" and call unrelated sites
 * identical. Anything not listed falls back to last-two-labels, which is
 * correct for .com/.fr/.ae and wrong only in ways that make this classifier
 * more cautious, not less: an unrecognised multi-part suffix makes two
 * different domains look different, which flags for review rather than
 * silently passing.
 */
const MULTI_PART_SUFFIXES = [
  'co.uk',
  'org.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'com.au',
  'co.nz',
  'com.tr',
  'co.jp',
  'com.br',
  'co.za',
  'com.sa',
];

/**
 * The part of a hostname that identifies the owner: "rabanne" in
 * "www.rabanne.com", "alharamainperfumes" in "alharamainperfumes.co.uk".
 *
 * Comparing these rather than whole hostnames is what lets `www.` and a bare
 * apex, or two paths on one site, count as the same place — while still
 * telling a genuinely different company apart.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  for (const suffix of MULTI_PART_SUFFIXES) {
    if (host.endsWith(`.${suffix}`)) {
      const suffixLabels = suffix.split('.').length;
      return labels.slice(-(suffixLabels + 1)).join('.');
    }
  }
  return labels.slice(-2).join('.');
}

/**
 * Country-market signals in an address.
 *
 * Read from the whole URL, because a market shows up in three different
 * places depending on how a site is built: the TLD (`.ae`), a subdomain
 * (`ae.house.com`, `uk.house.com`), or a path prefix (`/en-gb/`, `/us/`).
 * All three are used by entries already in demo/brandSites.ts, so all three
 * have to be read or the comparison misses the case it was built for.
 *
 * Returns null when an address names no market at all, which is the ordinary
 * case for a single global site and must never be confused with "not UK".
 */
export function marketOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // Path prefix: /en-gb/, /uk/, /en_us/, /us/ and similar.
  const pathMatch = path.match(/^\/(?:([a-z]{2})[-_]([a-z]{2})|([a-z]{2}))(?:\/|$)/);
  if (pathMatch) {
    const region = (pathMatch[2] ?? pathMatch[3] ?? '').toLowerCase();
    // A bare two-letter path segment is ambiguous — /it/ is as likely to be a
    // section name as a market — so only accept ones that are actually
    // country codes this registry uses, plus any language-REGION pair, which
    // is unambiguous by shape.
    if (pathMatch[2]) return region;
    if (['uk', 'gb', 'us', 'ae', 'fr', 'de', 'es', 'it'].includes(region)) return region;
  }

  // Subdomain: uk.house.com, ae.house.com.
  const first = host.split('.')[0]!;
  if (['uk', 'gb', 'us', 'ae', 'fr', 'de', 'es', 'it', 'eu'].includes(first)) return first;

  // TLD, but only country-code ones. A .com says nothing about market.
  const tld = host.slice(host.lastIndexOf('.') + 1);
  if (host.endsWith('.co.uk') || host.endsWith('.org.uk')) return 'uk';
  if (tld.length === 2 && tld !== 'co') return tld;

  return null;
}

/** "uk" and "gb" name one country and must not read as a mismatch. */
function sameMarket(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true;
  const norm = (m: string) => (m === 'gb' ? 'uk' : m);
  return norm(a) === norm(b);
}

/**
 * What a completed request tells us about a published brand link.
 *
 * Ordered most-serious first: a link that did not arrive cannot also be
 * judged on where it landed.
 */
export function classifyLanding(landing: Landing): BrandSiteFinding {
  const { brands, declared, landed, status, error } = landing;
  const base = { brands, declared, landed, status };

  if (status === 0) {
    return {
      ...base,
      verdict: 'dead',
      reason: `the request never completed${error ? ` — ${error}` : ''}`,
    };
  }
  if (status >= 400) {
    return {
      ...base,
      verdict: 'dead',
      reason:
        status === 404
          ? 'the page is gone — this link shows a reader an error'
          : 'the site refused or failed to serve this address',
    };
  }
  if (landed === null) {
    return {
      ...base,
      verdict: 'ok',
      reason: 'responded, though the final address was not reported',
    };
  }

  let declaredHost: string;
  let landedHost: string;
  try {
    declaredHost = registrableDomain(new URL(declared).hostname);
    landedHost = registrableDomain(new URL(landed).hostname);
  } catch {
    return { ...base, verdict: 'unusable', reason: 'the address could not be parsed' };
  }

  if (declaredHost !== landedHost) {
    return {
      ...base,
      verdict: 'redirected-domain',
      reason:
        `lands on ${landedHost}, a different domain from the ${declaredHost} this repo ` +
        'publishes — check the brand did not move, lapse or get parked',
    };
  }

  const declaredMarket = marketOf(declared);
  const landedMarket = marketOf(landed);
  if (!sameMarket(declaredMarket, landedMarket)) {
    return {
      ...base,
      verdict: 'redirected-region',
      reason:
        `published as the ${declaredMarket} site but lands on the ${landedMarket} one — note ` +
        'a CI runner is not in the UK, so a site that redirects by location may be ' +
        'answering the runner rather than showing a real fault',
    };
  }

  return { ...base, verdict: 'ok', reason: 'resolved on the address this repo publishes' };
}

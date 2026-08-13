/**
 * Finding the page a shop states its delivery terms on, by reading its own
 * links rather than guessing at paths.
 *
 * ── Why guessing was not enough ──────────────────────────────────────────────
 * `SHIPPING_PAGE_PATHS` tries sixteen conventional addresses. Against the shops
 * this project needs, that produced "NO PAGE FOUND: none of the candidate paths
 * exist on this shop" for nine of twenty-nine in the last run — every one of
 * them a real shop with a real, linked delivery page that simply does not live
 * at any of the sixteen. Debenhams, Beauty Bay, Cosmetify and the rest are not
 * Shopify stores and have no reason to honour Shopify's conventions.
 *
 * A shop always links its delivery terms from its own footer, because consumer
 * law effectively requires it to be findable before checkout. Reading that
 * footer is both more reliable than guessing and fewer requests: one fetch of a
 * page we were fetching anyway, against sixteen speculative ones.
 *
 * ── What this will not do ────────────────────────────────────────────────────
 * It never leaves the shop's own origin, it never follows more than the links
 * on the one page it was given, and it hands back candidates in the order a
 * human would try them. Whether any of them may be fetched is the caller's
 * decision, made against that shop's robots.txt — nothing here fetches.
 */

/** Link text or URL wording that means "this is where delivery is explained". */
const DELIVERY_WORDS =
  /\b(deliver\w*|shipping|postage|p&p)\b/i;

/**
 * Wording that means the link is about sending something *back*, which is a
 * different page with different numbers on it. Returns pages routinely quote a
 * returns postage charge, and that charge parses beautifully as a delivery
 * rate — it is exactly the trap `NOT_SHIPPING_CONTEXT` exists to catch one
 * level down, and it is cheaper to not fetch the page at all.
 *
 * A combined "Delivery & Returns" page is common and genuinely useful, so this
 * only rejects a link that is about returns and *not* about delivery.
 */
const RETURNS_ONLY = /\b(returns?|refunds?|exchanges?|cancellations?)\b/i;

/** Paths that are never a terms page however they are worded. */
const NOT_A_POLICY_PAGE =
  /\/(cart|checkout|account|login|register|search|collections|products|blogs?)(\/|$|\?)/i;

export interface DeliveryLink {
  url: string;
  /** The anchor text that suggested it, for the discovery report. */
  linkText: string;
  /**
   * Higher is likelier to be the real terms page. Ranking beats filtering
   * here: a shop with one obvious "Delivery Information" link and eight
   * incidental mentions should try the obvious one first, but the others are
   * still better candidates than a path nobody has evidence for.
   */
  score: number;
}

const ANCHOR = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))[^>]*>([\s\S]*?)<\/a>/gi;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every same-origin link on this page that looks like a delivery terms page,
 * best candidate first.
 *
 * `origin` is the shop's own origin (`https://example.com`), used both to
 * resolve relative hrefs and to refuse anything that leaves it.
 */
export function deliveryLinksFrom(html: string, origin: string, limit = 6): DeliveryLink[] {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return [];
  }

  const found = new Map<string, DeliveryLink>();

  for (const m of html.matchAll(ANCHOR)) {
    const href = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    // Same shop only. A footer link to a courier's own tracking page is not
    // this shop's statement of what it charges.
    if (url.origin !== base.origin) continue;
    if (NOT_A_POLICY_PAGE.test(url.pathname)) continue;

    const linkText = stripTags(m[5] ?? '');
    const path = decodeURIComponent(url.pathname);
    const inText = DELIVERY_WORDS.test(linkText);
    const inPath = DELIVERY_WORDS.test(path);
    if (!inText && !inPath) continue;
    // "Returns" on its own, with no mention of delivery anywhere, is the wrong
    // page and its numbers are actively misleading.
    if (RETURNS_ONLY.test(linkText) && !inText) continue;
    if (RETURNS_ONLY.test(path) && !inPath) continue;

    // A link whose own address says delivery is a better bet than one that
    // only mentions it in passing; a policy path better still; and a short
    // anchor ("Delivery") is more likely the real thing than a sentence that
    // happens to contain the word.
    let score = 0;
    if (inPath) score += 3;
    if (inText) score += 2;
    if (/\/(policies|policy|pages|help|customer-service[s]?|info|terms)\//i.test(path)) score += 2;
    if (inText && linkText.length <= 30) score += 1;
    if (RETURNS_ONLY.test(path) || RETURNS_ONLY.test(linkText)) score -= 1;

    url.hash = '';
    const key = url.toString();
    const existing = found.get(key);
    if (!existing || existing.score < score) found.set(key, { url: key, linkText, score });
  }

  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit);
}

/** Whether a URL's own path names delivery, which relaxes one parsing rule.
 *  See `ExtractOptions.deliveryPage` in shippingTerms.ts for exactly which. */
export function urlLooksLikeDeliveryPage(url: string): boolean {
  try {
    return DELIVERY_WORDS.test(decodeURIComponent(new URL(url).pathname));
  } catch {
    return false;
  }
}

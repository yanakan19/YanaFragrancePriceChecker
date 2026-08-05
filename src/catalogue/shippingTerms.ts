/**
 * Reading a shop's own delivery terms out of the page that states them.
 *
 * ── The problem this exists to solve ─────────────────────────────────────────
 * A retailer cannot be enabled until `shipping.standardGbp` is known, because
 * an unknown cost silently treated as zero would make that shop win the
 * delivered-price sort every time (see the field's own doc comment). Research
 * reliably turns up the *free-over threshold* — shops advertise it — and almost
 * never the flat rate below it, which is buried in a policy page nobody links
 * from the storefront. Eight retailers are currently disabled for exactly that
 * reason.
 *
 * ── Why this reads policy pages, not product pages ───────────────────────────
 * A product page usually carries a banner ("Free UK delivery over £50"), which
 * is the threshold we already have, not the number we are missing. The flat
 * rate lives on the delivery/shipping policy page, and on Shopify at the
 * canonical `/policies/shipping-policy`. That is what `SHIPPING_PAGE_PATHS`
 * below targets.
 *
 * ── Why this never writes to the registry ────────────────────────────────────
 * Everything here produces *candidates with the sentence they came from*, for
 * a human to confirm. Nothing in this module or its script sets `standardGbp`
 * or flips `enabled`. That is deliberate and worth keeping: this is the one
 * field where a confidently wrong value is worse than a null, and prose about
 * delivery is full of numbers that are not the standard cost — thresholds,
 * express upgrades, return fees, order minimums. A regex cannot tell which is
 * which with the confidence the delivered-price sort needs, so it does not get
 * to decide. It gathers the evidence and quotes it.
 */

/**
 * Candidate paths for a shop's delivery terms, most canonical first.
 *
 * Shopify serves `/policies/shipping-policy` on essentially every store, which
 * is why it leads. The `/pages/...` and bare forms cover Shopify stores that
 * put the real detail in a hand-built page instead, and WooCommerce/WordPress
 * shops which have no fixed convention at all.
 */
export const SHIPPING_PAGE_PATHS: readonly string[] = [
  '/policies/shipping-policy',
  '/pages/shipping-policy',
  '/pages/shipping-details',
  '/pages/delivery-information',
  '/pages/shipping',
  '/pages/delivery',
  '/shipping-policy',
  '/delivery',
  '/shipping',
];

/** What a matched sentence is claiming, as far as the wording can be trusted. */
export type ShippingClaimKind =
  /** A flat standard-delivery price. The number we actually need. */
  | 'standard-cost'
  /** Spend at or above which delivery becomes free. Usually already known. */
  | 'free-threshold'
  /** Delivery stated as free with no spend condition found in the sentence. */
  | 'free-unconditional';

export interface ShippingClaim {
  kind: ShippingClaimKind;
  /** The figure in GBP. Zero for `free-unconditional`. */
  amountGbp: number;
  /** The sentence this came from, trimmed — the evidence a human confirms against. */
  evidence: string;
  /**
   * Whether the wording named a *named* express or upgraded service. Those
   * carry a real price that is emphatically not the standard rate, so they are
   * reported (a human may still want to see them) but never presented as a
   * standard-cost candidate.
   */
  isUpgradeTier: boolean;
}

/** Strip tags, decode the handful of entities that matter, collapse whitespace. */
export function textFromHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&pound;|&#163;/gi, '£')
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sentence-ish chunks. Delivery tables often have no full stops, so bullets
 *  and pipes split too, otherwise one 400-word blob matches everything. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s*[•|]\s*|\s{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 400);
}

/** Words that mean this sentence is about a *faster* service, not the standard one. */
const UPGRADE_WORDS =
  /\b(next[- ]day|next working day|express|premium|guaranteed|24[- ]?hour|24hr|tracked 24|saturday|sunday|timed|pre[- ]?noon|by 1pm|special delivery|courier upgrade|click (?:and|&) collect)\b/i;

/**
 * Words that mean a number is about something other than shipping a normal
 * order. Trailing `\w*` on the plural-prone ones deliberately: a bare
 * `\breturn\b` does not match "Returns", which is exactly how "Returns
 * postage is £3.99" gets recorded as the standard delivery rate.
 */
const NOT_SHIPPING_CONTEXT =
  /\b(returns?|refunds?|restock\w*|exchanges?|customs|dut(?:y|ies)|vat|taxes?|gift wrap\w*|surcharges?|subscriptions?|membership\w*|pass|vouchers?|discount code|minimum order value|international\w*|worldwide|europe\w*|eu |usa|ireland|channel islands)\b/i;

const AMOUNT = /£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/;
const AMOUNT_G = /£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g;

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ''));
}

/**
 * Every delivery claim a page appears to make, in the order they appear.
 *
 * Deliberately generous about what it *reports* and strict about what it
 * labels `standard-cost`: a caller showing a human three candidates with their
 * sentences is useful, whereas one confidently-wrong number is not.
 */
export function extractShippingClaims(html: string): ShippingClaim[] {
  const text = textFromHtml(html);
  const claims: ShippingClaim[] = [];

  for (const sentence of sentences(text)) {
    // A sentence has to be about delivery at all before any number in it counts.
    if (!/\b(deliver\w*|shipping|postage|dispatch\w*|p&p)\b/i.test(sentence)) continue;
    if (NOT_SHIPPING_CONTEXT.test(sentence)) continue;

    const isUpgradeTier = UPGRADE_WORDS.test(sentence);
    const freeOver =
      /\bfree\b[\s\S]{0,60}?\b(?:on (?:all )?orders? )?(?:over|above|of|from)\s*£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i.exec(sentence) ??
      /\b(?:orders?|spend|spending)\b[\s\S]{0,40}?\bover\s*£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)[\s\S]{0,40}?\bfree\b/i.exec(sentence);

    if (freeOver) {
      claims.push({
        kind: 'free-threshold',
        amountGbp: toNumber(freeOver[1]!),
        evidence: sentence,
        isUpgradeTier,
      });
      // A "free over £50" sentence frequently also names the rate below it —
      // "£3.95, free over £50" — so keep looking at the other amounts here
      // rather than moving on.
      const others = [...sentence.matchAll(AMOUNT_G)]
        .map((m) => toNumber(m[1]!))
        .filter((n) => n !== toNumber(freeOver[1]!));
      for (const amount of others) {
        claims.push({ kind: 'standard-cost', amountGbp: amount, evidence: sentence, isUpgradeTier });
      }
      continue;
    }

    // "Free UK delivery" / "we offer free shipping", with no threshold in sight.
    if (/\bfree\b/i.test(sentence) && !AMOUNT.test(sentence)) {
      claims.push({ kind: 'free-unconditional', amountGbp: 0, evidence: sentence, isUpgradeTier });
      continue;
    }

    const amount = AMOUNT.exec(sentence);
    if (amount) {
      claims.push({
        kind: 'standard-cost',
        amountGbp: toNumber(amount[1]!),
        evidence: sentence,
        isUpgradeTier,
      });
    }
  }

  return claims;
}

export interface ShippingReading {
  /** Best guess at the flat standard rate, or null when nothing qualified. */
  standardGbp: number | null;
  /** Best guess at the free-delivery threshold, or null. */
  freeOverGbp: number | null;
  /**
   * Why a human still has to look. Non-empty whenever the page said something
   * ambiguous — several different candidate rates, only upgrade tiers, an
   * unconditional-free claim that may or may not be the whole story.
   */
  caveats: string[];
  claims: ShippingClaim[];
}

/**
 * Reduce a page's claims to at most one candidate figure each, plus the
 * reasons a human should not take them on trust.
 *
 * The lowest standard-cost candidate wins rather than the first, because
 * policy pages list the cheapest service first about as often as they list it
 * last, and if this is going to be wrong it should be wrong in the direction a
 * reviewer notices — a suspiciously low delivery charge invites checking,
 * whereas a plausible high one gets waved through.
 */
export function readShippingTerms(html: string): ShippingReading {
  const claims = extractShippingClaims(html);
  const caveats: string[] = [];

  const standardCandidates = claims.filter((c) => c.kind === 'standard-cost' && !c.isUpgradeTier);
  const thresholds = claims.filter((c) => c.kind === 'free-threshold' && !c.isUpgradeTier);

  const distinctStandard = [...new Set(standardCandidates.map((c) => c.amountGbp))];
  if (distinctStandard.length > 1) {
    caveats.push(
      `page names ${distinctStandard.length} different delivery charges (${distinctStandard
        .map((n) => `£${n.toFixed(2)}`)
        .join(', ')}) — confirm which is standard`,
    );
  }
  if (standardCandidates.length === 0 && claims.some((c) => c.isUpgradeTier)) {
    caveats.push('only named express/upgraded services carried a price — standard rate not stated');
  }
  if (standardCandidates.length === 0 && claims.some((c) => c.kind === 'free-unconditional')) {
    caveats.push(
      'delivery described as free with no threshold and no rate — confirm it is unconditional before recording 0',
    );
  }
  if (claims.length === 0) {
    caveats.push('no delivery terms recognised on this page');
  }

  const distinctThreshold = [...new Set(thresholds.map((c) => c.amountGbp))];
  if (distinctThreshold.length > 1) {
    caveats.push(
      `page names ${distinctThreshold.length} different free-delivery thresholds (${distinctThreshold
        .map((n) => `£${n.toFixed(2)}`)
        .join(', ')})`,
    );
  }

  return {
    standardGbp: distinctStandard.length ? Math.min(...distinctStandard) : null,
    freeOverGbp: distinctThreshold.length ? Math.min(...distinctThreshold) : null,
    caveats,
    claims,
  };
}

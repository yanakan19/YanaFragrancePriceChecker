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
  '/pages/faq',
  '/pages/shipping-returns',
  '/pages/delivery-returns',
  '/pages/shipping-info',
  '/pages/help',
  '/policies/refund-policy',
  '/pages/terms-of-service',
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

/**
 * Strip tags, decode the handful of entities that matter, collapse whitespace.
 *
 * Block boundaries become an explicit separator before the tags go, because
 * otherwise a nav bar and the paragraph beneath it collapse into one run of
 * text with no sentence break between them. On a real page that meant a header
 * basket total sat in the same "sentence" as the actual delivery rate, and
 * discarding the chrome discarded the answer with it.
 *
 * ── Why cells are not block boundaries ───────────────────────────────────────
 * `</td>`, `</th>` and `<br>` used to end a chunk the same way `</p>` does, and
 * that quietly made the commonest layout in the entire problem domain
 * unreadable. A delivery table is
 *
 *     <tr><td>Standard Delivery</td><td>3-5 days</td><td>£3.95</td></tr>
 *
 * and splitting on the cell put "Standard Delivery" in one chunk and "£3.95" in
 * another. Every chunk has to name delivery before its numbers count, so the
 * chunk holding the rate no longer did, and the page parsed to nothing at all —
 * not an ambiguous reading, not a caveat, nothing. Cells now join with a soft
 * separator that keeps the row intact as one sentence, while the row itself
 * still ends at `</tr>` so two services never merge into one claim.
 */
export function textFromHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Soft separators: still visible as a break to a reader, but they do not
    // end a sentence, so a row or a wrapped line stays one claim.
    .replace(/<br\s*\/?>/gi, ' ~ ')
    .replace(/<\/(td|th)\s*>/gi, ' ~ ')
    .replace(
      /<\/(p|div|li|tr|h[1-6]|section|article|header|footer|nav|ul|ol|table|dt|dd|blockquote)\s*>/gi,
      ' | ',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&pound;|&#163;/gi, '£')
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    // Collapse runs of the separator left by nested blocks, and drop the ones
    // that end up at either end with nothing to separate.
    .replace(/(?:\s*~\s*)+/g, ' ~ ')
    .replace(/(?:\s*\|\s*(?:~\s*)?)+/g, ' | ')
    .replace(/^\s*[|~]\s*|\s*[|~]\s*$/g, '')
    .trim();
}

/** Sentence-ish chunks. Delivery tables often have no full stops, so bullets
 *  and pipes split too, otherwise one 400-word blob matches everything. The
 *  soft `~` left by cells and line breaks deliberately does not split: it is
 *  what holds a table row together as one claim. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s*[•|]\s*|\s{2,}/)
    // A trailing cell separator is an artefact of the last empty cell in a row,
    // and it would otherwise be quoted back at a human as part of the evidence.
    .map((s) => s.replace(/^\s*~\s*|\s*~\s*$/g, '').trim())
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

/**
 * A live cart widget, not a statement of terms.
 *
 * Real pages carry "You are £200 away from free shipping" and a header cart
 * reading "0 / £0.00". Both parse as a delivery charge on a delivery page and
 * both are whatever the current basket happens to be — the first run of this
 * tool recorded £200 as Manchester Ouds' standard rate on exactly that
 * sentence.
 */
const CART_WIDGET =
  /\b(away from free|qualifies for free ship|your (?:cart|bag|order) (?:is|total)|items? in (?:your )?(?:cart|bag)|skip to content|hurry up)\b/i;

/** "Spend over £X" as a condition, whatever the reward is — free, half-price,
 *  discounted. A threshold, never the cost of the delivery itself. */
const SPEND_THRESHOLD =
  /\b(?:when you )?spend(?:ing)?\s*(?:over|above|of|more than)?\s*£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)|\b(?:half[- ]price|discounted|reduced)\b[\s\S]{0,40}?\b(?:over|above)\s*£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i;

/** The sentence explicitly calls this the standard/normal service. */
const NAMES_STANDARD = /\b(standard|normal|regular|basic|economy)\b/i;

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
export interface ExtractOptions {
  /**
   * The URL this HTML came from named delivery or shipping in its own path —
   * `/policies/shipping-policy`, `/pages/delivery`, and so on.
   *
   * It relaxes exactly one rule and no others. Ordinarily a sentence must name
   * delivery before any number in it counts, which is what keeps a price list
   * or a discount banner out of the reading. On a page whose own address says
   * delivery, a bare "Free on orders over £25." is a delivery threshold and
   * nothing else, and requiring the word again inside the sentence loses it —
   * that phrasing is extremely common, because the heading above it already
   * said the word.
   *
   * The relaxation admits *thresholds* only, never a standard-cost candidate.
   * A threshold that turns out to be wrong makes the delivered price too high,
   * which is visible and conservative; a wrong flat rate can make a shop win
   * the sort it should have lost, and no relaxation is worth that.
   */
  deliveryPage?: boolean;
}

export function extractShippingClaims(html: string, opts: ExtractOptions = {}): ShippingClaim[] {
  const text = textFromHtml(html);
  const claims: ShippingClaim[] = [];

  for (const sentence of sentences(text)) {
    // A sentence has to be about delivery at all before any number in it counts.
    const namesDelivery = /\b(deliver\w*|shipping|postage|dispatch\w*|p&p)\b/i.test(sentence);
    if (!namesDelivery && !opts.deliveryPage) continue;
    if (NOT_SHIPPING_CONTEXT.test(sentence)) continue;
    // Whatever the basket currently says is not a statement of terms.
    if (CART_WIDGET.test(sentence)) continue;

    const isUpgradeTier = UPGRADE_WORDS.test(sentence);

    // "Spend over £150 for half-price shipping" is a condition, not a charge.
    const spend = SPEND_THRESHOLD.exec(sentence);
    if (spend) {
      claims.push({
        kind: 'free-threshold',
        amountGbp: toNumber(spend[1] ?? spend[2]!),
        evidence: sentence,
        isUpgradeTier,
      });
      continue;
    }
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
      // rather than moving on. Only where the sentence itself names delivery:
      // on a relaxed match the sentence never said the word, so a second number
      // in it is not established to be a delivery charge.
      if (namesDelivery) {
        const others = [...sentence.matchAll(AMOUNT_G)]
          .map((m) => toNumber(m[1]!))
          .filter((n) => n !== toNumber(freeOver[1]!));
        for (const amount of others) {
          claims.push({ kind: 'standard-cost', amountGbp: amount, evidence: sentence, isUpgradeTier });
        }
      }
      continue;
    }

    // Past this point a sentence that never named delivery has nothing left to
    // offer: the relaxation covers thresholds only.
    if (!namesDelivery) continue;

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
  /** Present only when the caller asked for it (raw debug mode). The full
   *  plain-text extraction of the page, for a human to read directly when the
   *  regexes may be missing a rate phrased in an unanticipated way. */
  rawText?: string;
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
  /**
   * The page states delivery terms in detail and does not name a flat standard
   * charge anywhere in them.
   *
   * This is a finding, not a failure. A shop that advertises "free over £50"
   * and never prints what it charges below that has told you something true
   * about itself, and until this existed there was no way to record the
   * difference between that shop and one whose page we simply could not read.
   * The two look identical in the registry — `standardGbp: null` — and they are
   * not the same fact.
   *
   * Deliberately conservative about what counts. It requires the page to have
   * produced real delivery claims (so a 404 body or a cookie wall cannot
   * qualify), at least one of which is a threshold or an explicit free claim,
   * and none of which is a usable standard rate. A page that named a rate this
   * parser merely could not attribute produces a caveat instead, and is never
   * recorded as a shop that publishes nothing.
   */
  standardRateNotStated: boolean;
  /**
   * The sentences behind `standardRateNotStated`, so the claim that a shop
   * publishes no rate can itself be checked against the shop's own words.
   */
  thresholdEvidence: string[];
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
export function readShippingTerms(
  html: string,
  opts?: { includeRawText?: boolean; deliveryPage?: boolean },
): ShippingReading {
  const claims = extractShippingClaims(html, opts?.deliveryPage ? { deliveryPage: true } : {});
  const caveats: string[] = [];

  const standardCandidates = claims.filter(
    // A £0.00 in prose is a cart total or a stray, never a stated charge:
    // genuine free delivery is written in words, which is what
    // `free-unconditional` is for.
    (c) => c.kind === 'standard-cost' && !c.isUpgradeTier && c.amountGbp > 0,
  );
  const thresholds = claims.filter((c) => c.kind === 'free-threshold' && !c.isUpgradeTier);

  // A sentence that says "Standard Delivery (3-5 Working Days): £3.99" is
  // telling us outright, and beats one that merely mentions a number near the
  // word delivery. Without this the lowest figure wins, and on a real page
  // that was a £0.00 basket total sitting above the answer.
  const named = standardCandidates.filter((c) => NAMES_STANDARD.test(c.evidence));
  const preferred = named.length > 0 ? named : standardCandidates;

  const distinctStandard = [...new Set(preferred.map((c) => c.amountGbp))];
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

  // "This shop publishes no standard rate" is only sayable when the page did
  // talk about delivery terms, said something concrete about them, and still
  // named no charge. An upgrade-only page does not qualify: naming next-day at
  // £5.95 and nothing else usually means the standard rate is somewhere we did
  // not look, which is a gap in the reading rather than a fact about the shop.
  const freeClaims = claims.filter(
    (c) => (c.kind === 'free-threshold' || c.kind === 'free-unconditional') && !c.isUpgradeTier,
  );
  const standardRateNotStated =
    standardCandidates.length === 0 &&
    freeClaims.length > 0 &&
    !claims.some((c) => c.kind === 'standard-cost' && c.isUpgradeTier);

  return {
    standardGbp: distinctStandard.length ? Math.min(...distinctStandard) : null,
    freeOverGbp: distinctThreshold.length ? Math.min(...distinctThreshold) : null,
    caveats,
    claims,
    standardRateNotStated,
    thresholdEvidence: standardRateNotStated ? [...new Set(freeClaims.map((c) => c.evidence))] : [],
    ...(opts?.includeRawText ? { rawText: textFromHtml(html) } : {}),
  };
}

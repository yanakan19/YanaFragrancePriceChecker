/**
 * What kind of question this is, decided from the text alone.
 *
 * The client never sends an intent any more (the three intent buttons were
 * removed from the widget deliberately; demo/virtualYanny.ts posts
 * `intent: null`), so this function decides the route for every real
 * question the site receives.
 *
 * ── The bug this replaced ────────────────────────────────────────────────
 * The previous version was three lines:
 *
 *   if (/\bprice|cost|how much|cheapest|discount\b/.test(c)) return 'price';
 *   if (/\bnote|suggest|recommend|similar to|smells like\b/.test(c)) return 'suggest';
 *   return 'general';
 *
 * Alternation binds looser than anything else in a regex, so those word
 * boundaries did not distribute across the alternatives the way the shape of
 * the line suggests. The first pattern is really five separate alternatives:
 *
 *   (\bprice) | (cost) | (how much) | (cheapest) | (discount\b)
 *
 * — a leading boundary on the first alternative only, a trailing boundary on
 * the last only, and no boundary at all on the three in the middle. Measured,
 * not assumed (every case below was run against the old pattern before this
 * file was rewritten):
 *
 *   "any discounts?"            -> general   ← the plural never matched.
 *     `discount\b` requires a boundary straight after the final "t"; in
 *     "discounts" the next character is "s", a word character, so there is
 *     no boundary and the alternative fails. Nothing else in the pattern
 *     matches either, so the single most natural way to ask about deals fell
 *     through to 'general' while the singular "any discount?" hit 'price'.
 *   "costume party fragrance"   -> price     ← bare `cost`, unanchored, is a
 *   "costa coffee scent"        -> price        substring test. It fires
 *   "i want to accost someone"  -> price        inside costume, Costa, accost.
 *   "priceless"                 -> price     ← `\bprice` anchors only its
 *                                              left edge.
 *
 * Both directions are live defects: a real "any discounts?" was routed away
 * from anything that could answer it, and unrelated words routed *into* the
 * price path. They are pinned as regression cases in test/intent.test.js.
 *
 * ── What replaced it ─────────────────────────────────────────────────────
 * An ordered list of named rules, every pattern fully grouped so its
 * boundaries mean what they look like, and every rule's precedence stated
 * rather than emergent. First match wins, and the order is the interesting
 * part: many real questions carry words from two intents at once ("how much
 * is delivery from Boots" is both a price word and a delivery word), and the
 * rule that fires has to be the one describing what the reader actually
 * wants to know. Each ordering decision below carries the case that forced
 * it, and test/intent.test.js runs the whole corpus so a reordering that
 * breaks one of them fails rather than silently reroutes traffic.
 */

/**
 * Every intent this classifier can return, in precedence order.
 *
 * Exported so server/index.js can validate an explicit intent against the
 * real list rather than a hardcoded copy that drifts, and so tests can
 * assert the corpus covers all of them.
 */
export const INTENTS = [
  'meta',
  'deals',
  'compare',
  'delivery',
  'availability',
  'size',
  'budget',
  'notes',
  'brand',
  'price',
  'suggest',
  'general',
];

/**
 * The ordered rules. `[intent, pattern]`, first match wins.
 *
 * Every alternation is wrapped in a group so `\b` binds to the whole set —
 * the exact thing the old pattern got wrong.
 */
const RULES = [
  // ── meta ───────────────────────────────────────────────────────────────
  // First, deliberately. A question about the service itself is the one
  // shape most likely to be misread as a lookup: "how does your price
  // comparison work" and "how fresh are these prices" both contain price
  // words and neither names a fragrance. The old classifier sent both to
  // 'price', and council.js carries a workaround for exactly that (a
  // 'price' intent with no fragrance match but a real policy match falls
  // through to the council). That workaround stays as defence in depth, but
  // the question should never have been labelled 'price' in the first place.
  [
    'meta',
    /\b(how (do|does|did) (you|this|the site|pricesniffs|yanny|your)|make(s)? money|paid for|affiliate|commission|sponsored|promoted listing|who pays|where do (your|the|these) (prices|numbers|figures) come from)\b/,
  ],
  [
    'meta',
    /\b(how (fresh|old|current|recent|up.to.date)|when (was|were|did) .{0,40}(updated|refreshed|crawled|checked|harvested)|last (updated|refreshed|checked))\b/,
  ],
  [
    'meta',
    /\b((which|what|how many) (shops?|retailers?|stores?|sites?|merchants?)|do you (cover|track|include|check)|shops? do you|retailers? do you)\b/,
  ],
  [
    'meta',
    /\b(how many (fragrances?|perfumes?|products?|brands?|scents?)|who are you|are you (a )?(bot|robot|human|ai|real)|what (is|are) (this site|pricesniffs)|privacy|gdpr|terms of use|contact you)\b/,
  ],

  // ── deals ──────────────────────────────────────────────────────────────
  // Above 'price' because "biggest discount right now" is a browse of the
  // deals list, not a lookup of one product, and above everything else
  // because a deal word is an unusually strong signal of what is wanted.
  // `discounts?` is where the old pattern's missing boundary lived.
  [
    'deals',
    /\b(on sale|deals?|discounts?|discounted|reduced|clearance|bargains?|price drops?|special offers?|best offers?|savings?|% off|percent off)\b/,
  ],

  // ── compare ────────────────────────────────────────────────────────────
  // Above 'price' because "is X cheaper than Y" contains "cheaper" but is
  // not a request for one product's price — answering it as a lookup of
  // whichever product the matcher liked better is a wrong answer, not a
  // partial one.
  [
    'compare',
    /\b(cheaper than|dearer than|more expensive than|less than .{0,30}\bor\b|better value|better deal|which (is|one is|of these is)|vs\.?|versus|compare[ds]? (to|with)?)\b/,
  ],

  // ── delivery ───────────────────────────────────────────────────────────
  // Above 'availability' and 'price': "how much is delivery from Boots" is
  // a delivery-terms question that happens to start with "how much", and
  // "what's the cheapest including postage" is asking what delivery does to
  // the ranking. Both are answerable exactly from the retailer registry.
  [
    'delivery',
    /\b(delivery|deliveries|shipping|postage|p ?& ?p|p and p|posted to|deliver (to|from|it)|ships? (to|from))\b/,
  ],

  // ── availability ───────────────────────────────────────────────────────
  [
    'availability',
    /\b(in stock|out of stock|low stock|back in stock|stock level|sold out|stockists?|who (has|have|stocks?|sells?|carries|carry)|where can i (buy|get|find|order)|where do i (buy|get)|who (else )?(has|sells) it)\b/,
  ],

  // ── size ───────────────────────────────────────────────────────────────
  // Deliberately narrow. "how much is Dior Sauvage 100ml" names a size but
  // asks a price, and must stay on the price path — so a bare "\d+ml" is
  // never enough on its own; the question has to be *about* the sizes.
  [
    'size',
    /\b((what|which|how many|any other) sizes?|sizes? (do|does|are|is|you)|what size|(do|have) you (have|got|stock|list|sell|do) (a |an |the )?\d+(\.\d+)?\s?ml|is there (a|an) \d+(\.\d+)?\s?ml|come in \d+(\.\d+)?\s?ml|other bottle)\b/,
  ],

  // ── budget ─────────────────────────────────────────────────────────────
  // Above 'price' because "what can I get under £50" is a catalogue filter,
  // not a lookup: there is no named product to look up at all.
  [
    'budget',
    /\b(under|below|less than|no more than|up to|within|max(imum)?|around|about)\s*£?\s*\d+/,
  ],
  ['budget', /£\s*\d+\s*(or less|budget|max|maximum)\b/],
  [
    'budget',
    /\b(cheapest|cheap)\b(?=.{0,60}\b(niche|designer|mideast|middle eastern|overall|thing|anything|fragrance you|perfume you|you (list|have|stock|track|sell|do|carry))\b)/,
  ],

  // ── notes ──────────────────────────────────────────────────────────────
  // "What does X smell like" asks for one named product's published notes —
  // a lookup with an exact answer, including the honest "no notes published
  // for it" when the catalogue holds null. That is a different question from
  // "what smells like X", which asks for a recommendation and belongs to
  // the council; the lookahead below keeps the two apart.
  [
    'notes',
    /\b(what (do(es)?|kind of|sort of).{0,40}\bsmell(s)? (like|of)|how does .{0,40}\bsmell\b|what (are|is) (the |its )?notes?|notes? (in|for|on|of)\b|note list|what'?s in\b|accords? (in|of|for)|smell profile|top notes?|base notes?|middle notes?|heart notes?)\b/,
  ],

  // ── brand ──────────────────────────────────────────────────────────────
  // "what Creed do you have", "do you list Amouage". Below 'size' so "do
  // you have the 200ml" stays a size question, and below 'meta' so "do you
  // cover Boots" stays a coverage question about a shop.
  [
    'brand',
    /\b(do you (have|list|stock|carry|sell|do)|(what|which|any) .{0,30}\bdo you (have|list|stock|carry|sell)|what .{0,30}\bby\b)/,
  ],

  // ── price ──────────────────────────────────────────────────────────────
  // Fully grouped and fully anchored, which is the whole point: "costume",
  // "Costa", "accost" and "priceless" no longer reach this rule, and
  // "prices"/"pricing" now do.
  [
    'price',
    /\b(price|prices|pricing|priced|cost|costs|costing|how much|howmuch|cheapest|cheaper|lowest|dearest|rrp)\b/,
  ],

  // ── suggest ────────────────────────────────────────────────────────────
  // Genuinely open taste questions: what to try, what resembles what. These
  // are the council's job and stay there.
  [
    'suggest',
    /\b(recommend|recommendation|suggest|suggestion|similar to|smells? like|something (with|like|for)|anything (with|like)|alternatives? to|dupes?|clones? of|notes?|accords?)\b/,
  ],
];

/**
 * Classify a free-typed message. Always returns a member of INTENTS;
 * 'general' is the honest fallback, not a failure mode — it routes to the
 * council with the site's own about/policy context attached.
 */
export function classifyIntent(text) {
  const c = String(text ?? '').toLowerCase();
  for (const [intent, pattern] of RULES) {
    if (pattern.test(c)) return intent;
  }
  return 'general';
}

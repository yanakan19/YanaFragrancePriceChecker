import {
  parseBudget,
  mentionsDescriptor,
  detectPerformanceRequest,
  detectOccasionRequest,
} from './requestPhrases.js';

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
  'greeting',
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
  // ── greeting ───────────────────────────────────────────────────────────
  // Anchored to the *whole* message, which is what makes it safe at the top:
  // "hello, how much is Sauvage" contains a real question and must not stop
  // here, and cannot — the pattern only matches a message that is a greeting
  // or a thanks and nothing else. Before this rule, "hello" was 'general'
  // and cost a full council round (28 model calls, seconds of wall time) to
  // say hello back; a greeting has no facts to look up, so it is the
  // clearest possible case for a canned deterministic reply. See
  // resolveGreetingQuery in lookups.js for what it says (only live counts
  // from the catalogue snapshot — nothing invented).
  [
    'greeting',
    /^\s*(?:hi+|hiya|hey+|hello+|heya|yo|howdy|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|thankyou|ta|cheers|nice\s+one)(?:\s+(?:yanny|there|mate|man|again|very\s+much|a\s+lot))?\s*[!.,?]*\s*$/i,
  ],

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
    /\b(delivery|deliveries|shipping|postage|p ?& ?p|p and p|posted to|deliver (to|from|it)|deliver(s)? (for )?free|ships? (to|from))\b/,
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
  // The follow-up shape: "what about the 50ml", "and the 100ml?". No
  // conversation is kept, so this cannot be answered — but routing it to
  // 'size' means the refusal says the true reason (each message stands
  // alone; see seemsFollowUp in siteData.js) instead of sending a
  // council of models a question with no product in it.
  ['size', /\b(what|how|and) about (the |a |an )?\d+(\.\d+)?\s?ml\b|^\s*and (the |a |an )?\d+(\.\d+)?\s?ml\b/],

  // ── budget ─────────────────────────────────────────────────────────────
  // Above 'price' because "what can I get under £50" is a catalogue filter,
  // not a lookup: there is no named product to look up at all.
  //
  // A predicate rather than a pattern, and it is `parseBudget` — the same
  // function `resolveBudgetQuery` uses to read the amount back out. That
  // matters more than tidiness. The two used to be separate lists that had
  // already fallen out of step: the resolver could read "30 quid" and "for
  // £30", the classifier could not, so a question the resolver would have
  // answered never reached it. Measured against the modules before this:
  //
  //   "perfume for 30 pounds"            -> general
  //   "something £30ish"                 -> general
  //   "whats good for under fifty quid"  -> general
  //
  // Sharing the definition makes "the classifier routes it here" and "the
  // resolver can read it" the same statement rather than two that have to
  // be kept in agreement by hand. See requestPhrases.js for which phrases
  // count, and for why a bare unframed "£30" deliberately does not.
  ['budget', (c) => parseBudget(c) !== null],
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
  // Genuinely open taste questions: what to try, what resembles what.
  [
    'suggest',
    /\b(recommend|recommendation|suggest|suggestion|similar to|smells? like|something (with|like|for)|anything (with|like)|alternatives? to|dupes?|clones? of|notes?|accords?)\b/,
  ],

  // The same question typed by someone not composing a search query. Every
  // rule below is last-but-one on purpose: 'suggest' sits immediately above
  // 'general', so these can only ever capture questions that were falling
  // to 'general' anyway. Nothing above this point can be rerouted by them,
  // which is what makes widening the door here safe.
  //
  // Why widen it at all: 'general' grounds a question with the site's about
  // and policy pages and nothing else, so a real request for a fragrance
  // reached the council with no fragrance data attached. Measured before
  // this, every one of these was 'general':
  //
  //   "whats a good perfume for a man"
  //   "perfume for women"
  //   "something sweet"
  //   "whats the best perfume you got"
  //   "need something that lasts"
  //
  // On 'suggest' they get the note vocabulary, the descriptor families, and
  // an explicit statement of the constraints the catalogue cannot meet —
  // and, where the whole question rests on one of those, a deterministic
  // refusal instead of a model's (see resolveSuggestQuery in lookups.js).

  // A scent descriptor is a request for a smell, whatever else is in the
  // sentence: "something sweet", "i want something fresh and clean".
  ['suggest', (c) => mentionsDescriptor(c)],

  // A fragrance word carrying a question or a recipient. "what perfume you
  // recommend", "whats a good perfume for a man", "perfume for women",
  // "a scent for my mum".
  [
    'suggest',
    /\b(what|which|any|good|best|nice)\b.{0,30}\b(perfume|fragrance|scent|aftershave|cologne|eau de \w+)/,
  ],
  [
    'suggest',
    /\b(perfume|fragrance|scent|aftershave|cologne)s?\b\s+(for|to suit)\b/,
  ],

  // Asking to be helped rather than asking a question. "what should i buy",
  // "help me pick something", "u got anything nice", "a present for my mum".
  [
    'suggest',
    /\b(help me (pick|choose|decide|find)|what should i (buy|get|try)|got anything (nice|good|decent)|anything (nice|good|decent)\b|(present|gift) for)\b/,
  ],

  // Strength and longevity — "something strong that lasts all day", "need
  // something that lasts", and the owner's "for a smelly man". The
  // catalogue records none of it, and 'suggest' is where that gets said
  // plainly; on 'general' it was answered with the site's terms of use.
  ['suggest', (c) => detectPerformanceRequest(c)],

  // Season and occasion — "a summer fragrance", "what should I wear to a
  // wedding", "anything for the office". The catalogue records neither, and
  // 'suggest' is where that constraint is read and declined honestly (see
  // detectOccasionRequest in requestPhrases.js and resolveSuggestQuery in
  // lookups.js). These used to fall to 'general' and reach the council with
  // the about page as their only grounding; a grounded model could then only
  // ever refuse (rule 1 forbids "summer means citrus" from training), so the
  // refusal is now written directly, in milliseconds, naming what the data
  // cannot do and what it can. A question that also carries something real —
  // "something spicy for winter" — still grounds on the real part and goes
  // to the council with the season named as unmeetable.
  ['suggest', (c) => detectOccasionRequest(c)],
];

/**
 * Classify a free-typed message. Always returns a member of INTENTS;
 * 'general' is the honest fallback, not a failure mode — it routes to the
 * council with the site's own about/policy context attached.
 *
 * A rule's matcher is a RegExp or a predicate on the lowercased text. The
 * predicate form exists so a rule can share a parser with the resolver that
 * will answer it (see the budget rule above) rather than restate it as a
 * pattern that then drifts.
 */
export function classifyIntent(text) {
  const c = String(text ?? '').toLowerCase();
  for (const [intent, matcher] of RULES) {
    if (typeof matcher === 'function' ? matcher(c) : matcher.test(c)) return intent;
  }
  return 'general';
}

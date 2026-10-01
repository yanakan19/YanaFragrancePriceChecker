import { buildSiteDataBlock, resolvePriceQuery, formatPriceAnswer, policyContextFor, policyPageFor, extractNotes } from './siteData.js';
import { mentionsDescriptor } from './requestPhrases.js';
import {
  resolveAvailabilityQuery,
  formatAvailabilityAnswer,
  resolveNotesQuery,
  formatNotesAnswer,
  resolveSizeQuery,
  formatSizeAnswer,
  resolveDeliveryQuery,
  formatDeliveryAnswer,
  resolveDealsQuery,
  formatDealsAnswer,
  resolveBudgetQuery,
  formatBudgetAnswer,
  resolveCompareQuery,
  formatCompareAnswer,
  resolveBrandQuery,
  formatBrandAnswer,
  resolveMetaQuery,
  formatMetaAnswer,
  resolveSuggestQuery,
  formatSuggestAnswer,
  resolveGreetingQuery,
  formatGreetingAnswer,
  resolveSuggestFallback,
  formatSuggestFallback,
  formatPolicyFallback,
  SCOPE_ANSWER,
  NO_MODEL_ANSWER,
} from './lookups.js';
import { buildSystemPrompt } from './prompt.js';

export { buildSystemPrompt };

/**
 * Virtual Yanny's router: which questions the catalogue answers on its own,
 * and which ones need a model.
 *
 * This is what was left of `YanaFreeAPIMerger/server/council.js` once the
 * model fan-out was taken out of it. That file ran a 28-model "council" on a
 * Fly.io machine and ranked the answers; everything about the *routing* —
 * the table below, the two ways a deterministic path hands a question back,
 * `councilIntentFor` — is unchanged and now runs in the reader's browser.
 * The model call itself moved to workers/yanny/ and is reached through
 * demo/virtualYanny.ts, which is the only caller of `resolveQuestion`.
 *
 * ── The intents answered from site data alone, with no model in the loop ──
 * "How much is X" is a database question, not an opinion one: the exact
 * fact a price answer needs (does this fragrance exist, what sizes, what
 * does each cost, from where) is already sitting in the catalogue this page
 * shipped with, looked up the same deterministic way `resolvePriceQuery`
 * looks it up for the model's own SITE DATA block. Handing that to a model
 * and ranking its prose adds latency for no accuracy gain, and — as
 * measured against the reported "One Million Elixir" case, see
 * tests/yanny/scoring.test.js — is exactly how a *wrong* answer got
 * produced: nothing stopped a model from confidently denying a fragrance
 * the data underneath it named outright. A template with no model in the
 * loop cannot do that; it can only ever repeat a price, size or retailer
 * that is genuinely there, or say plainly that nothing matched.
 *
 * That argument is not special to price, and every entry below is a
 * question shape it applies to unchanged. See lookups.js's header for each
 * one's own safety argument.
 *
 * `format` takes the question as well as the result because the price
 * formatter reads a size back out of it; the others ignore it.
 *
 * A resolver may return `null`, which means "this is not a question I can
 * answer from the data" and hands the question to the model untouched.
 * That is how "how do you make money" (meta, but prose the site has already
 * written on its own legal pages) and "is anything nice under a tenner"
 * (budget-shaped, no threshold named) reach a model instead of a table.
 */
export const DETERMINISTIC_INTENTS = {
  greeting: { resolve: resolveGreetingQuery, format: (_q, result) => formatGreetingAnswer(result) },
  price: { resolve: resolvePriceQuery, format: (question, result) => formatPriceAnswer(question, result) },
  availability: { resolve: resolveAvailabilityQuery, format: (_q, result) => formatAvailabilityAnswer(result) },
  notes: { resolve: resolveNotesQuery, format: (_q, result) => formatNotesAnswer(result) },
  size: { resolve: resolveSizeQuery, format: (_q, result) => formatSizeAnswer(result) },
  delivery: { resolve: resolveDeliveryQuery, format: (_q, result) => formatDeliveryAnswer(result) },
  deals: { resolve: resolveDealsQuery, format: (_q, result) => formatDealsAnswer(result) },
  budget: { resolve: resolveBudgetQuery, format: (_q, result) => formatBudgetAnswer(result) },
  compare: { resolve: resolveCompareQuery, format: (_q, result) => formatCompareAnswer(result) },
  brand: { resolve: resolveBrandQuery, format: (_q, result) => formatBrandAnswer(result) },
  meta: { resolve: resolveMetaQuery, format: (_q, result) => formatMetaAnswer(result) },
  // The odd one out, and only barely. `resolveSuggestQuery` returns `null`
  // for every suggestion question the catalogue can ground — a note, a
  // descriptor, a named reference fragrance, a budget — so taste still
  // reaches the model. It answers only the question that named nothing
  // matchable at all ("what perfume you recommend for a smelly man"), where
  // a grounded model's answer could only ever be a refusal.
  suggest: { resolve: resolveSuggestQuery, format: (_q, result) => formatSuggestAnswer(result) },
};

/** The intents `buildSiteDataBlock` builds real catalogue grounding for.
 *  Anything else gets the about/policy block, which is what `'general'`
 *  means. Kept beside `councilIntentFor` so the two cannot drift. */
const GROUNDED_MODEL_INTENTS = new Set(['price', 'suggest']);

/**
 * Which intent a question is grounded as when a deterministic resolver
 * hands it back to the model.
 *
 * `resolveSuggestQuery` declines every suggestion question the catalogue
 * *can* ground — "something sweet", "what smells like Aventus" — and those
 * are precisely the questions whose SITE DATA block should carry real note
 * candidates. Demoting them to `'general'` would replace those candidates
 * with the about line and nothing else, so a declined resolver keeps its
 * own intent when `buildSiteDataBlock` has grounding for it, and falls to
 * `'general'` otherwise. A policy match in disguise still goes to
 * `'general'`: that branch exists precisely because the question turned
 * out to be about the site rather than about a product.
 */
export function councilIntentFor(intent, { declined, policyInDisguise }) {
  if (policyInDisguise) return 'general';
  return declined && GROUNDED_MODEL_INTENTS.has(intent) ? intent : 'general';
}

/**
 * Answers a question from the catalogue if it can, or says what a model
 * would need if it cannot. No network, no model, nothing asynchronous but
 * the lookups' own `await`s.
 *
 * Two results:
 *
 *   `{ ok: true, source: 'site-data-direct', winner, intent, priceMatchStatus }`
 *       the answer is `winner.content`, computed from the page's own data.
 *   `{ ok: false, source: 'model', intent, siteData }`
 *       a model's phrasing is the product. `intent` is the grounding intent
 *       (see `councilIntentFor`) and `siteData` the block it must answer
 *       from; demo/virtualYanny.ts posts both to the Worker.
 *
 * `winner.agentNumber` is 0 and `totalScore` 100 on the direct path, the
 * same shape the old council returned, so the widget's transcript and the
 * tests read unchanged.
 */
export async function resolveQuestion({ question, intent }) {
  let effectiveIntent = intent;
  const deterministic = DETERMINISTIC_INTENTS[intent];
  if (deterministic) {
    const result = await deterministic.resolve(question);

    // Two ways a deterministic path hands the question on, both deliberate:
    //
    //   1. The resolver returned `null` — it recognised the intent but not
    //      as something the data settles. "How do you make money" is meta;
    //      the answer is prose on the site's own affiliate disclosure page,
    //      not a number.
    //   2. It found no product AND the question matches a real policy/FAQ
    //      page. A question can carry an intent's vocabulary without naming
    //      a product at all: "how does your price comparison work" is
    //      labelled 'price' by nothing more than the word "price". Finding
    //      no product is not, on its own, "this fragrance does not exist" in
    //      that case — it is evidence the question was never about a
    //      specific fragrance. A plain "no match" with no policy signal is
    //      still answered directly, which is the normal case for a genuine
    //      lookup gone unmatched.
    const declined = result === null;
    // `followUp` bars the policy fallthrough: "what about the 50ml" is a
    // follow-up to a conversation this engine does not keep, not a policy
    // question — but its filler words overlap the legal pages enough to trip
    // policyContextFor's loose keyword match. The honest answer is the
    // follow-up refusal, and it is already written.
    const policyInDisguise =
      !declined && result.status === 'no_match' && !result.followUp && Boolean(await policyContextFor(question));

    if (declined || policyInDisguise) {
      effectiveIntent = councilIntentFor(intent, { declined, policyInDisguise });
    } else {
      const content = deterministic.format(question, result);
      return {
        ok: true,
        source: 'site-data-direct',
        intent,
        winner: { agentNumber: 0, content, totalScore: 100, criteriaScores: {}, rank: 1 },
        priceMatchStatus: result.status,
      };
    }
  }

  // ── Nothing classified it ─────────────────────────────────────────────
  // 'general' means no rule recognised the question's shape. Three things
  // can still be true of it, checked in this order:
  if (intent === 'general') {
    // 1. It is just a product's name. "sauvage", "creed aventus 100ml",
    //    "flowerbomb" — the commonest thing typed into any search box, and
    //    every one of them used to go to the model as an open question with
    //    only the about page for grounding, which can only produce a
    //    refusal. A near-complete match is answered as the price lookup it
    //    plainly is, before the policy pages are consulted: the legal pages
    //    are long enough that "club de nuit intense man" found two of its
    //    words in the About page and was answered with an excerpt from it.
    const asProduct = await resolvePriceQuery(question, 'general');
    const settled = productSettled(question, asProduct);
    if (settled && (asProduct.matchConfidence ?? 0) >= 90) {
      return direct('price', formatPriceAnswer(question, asProduct), asProduct.status);
    }
    // 2. It names notes: "something vanilla, no florals" (the widget's own
    //    example prompt) carries no rule's trigger word, but a catalogue note
    //    is a request for a smell. Grounded as a suggestion, so the model —
    //    or the catalogue, without one — gets the note-matched bottles.
    if ((await extractNotes(question)).length > 0) {
      const siteData = await buildSiteDataBlock(question, 'suggest');
      return { ok: false, source: 'model', intent: 'suggest', siteData };
    }
    // 3. It is about one of the site's own pages ("can I return a perfume"):
    //    the model summarises the page, with the page in front of it.
    const policy = await policyPageFor(question);
    if (!policy) {
      // A looser product match still beats sending a bare name to a model.
      if (settled) return direct('price', formatPriceAnswer(question, asProduct), asProduct.status);
      // 4. It is not about fragrance at all ("who won the football"). The
      //    model's own rule 7 would decline it; declining it here costs
      //    nothing and says what the assistant is for. A house or a product
      //    the matcher half-recognised keeps it on topic.
      const onTopic =
        FRAGRANCE_TOPIC_RE.test(question) ||
        mentionsDescriptor(question.toLowerCase()) ||
        Boolean(asProduct.brandNamed) ||
        (asProduct.status !== 'no_match' && !asProduct.fuzzy && (asProduct.matchConfidence ?? 0) >= 65);
      if (!onTopic) {
        const content = HELP_RE.test(question) ? formatGreetingAnswer(await resolveGreetingQuery('hello')) : SCOPE_ANSWER;
        return direct('general', content, 'scope');
      }
    }
  }

  const siteData = await buildSiteDataBlock(question, effectiveIntent);
  return { ok: false, source: 'model', intent: effectiveIntent, siteData };
}

/**
 * Whether an unclassified message names a product firmly enough to answer
 * it as a price lookup. A bare name may lean on a near miss ("sauvge"); a
 * sentence may not, because a sentence that no rule recognised is as
 * likely to be about anything else — "what's the weather in london today"
 * found Floris London Leather Oud by reading "weather" as "leather".
 */
const SENTENCE_RE = /\?|^\s*(what|whats|what's|who|whos|when|where|why|how|is|are|can|could|do|does|did|will|would|should|tell|i|i'm|im|my)\b/i;
function productSettled(question, r) {
  const settled = r.status === 'matched' || (r.status === 'ambiguous' && r.exact === true);
  return settled && !(r.fuzzy && SENTENCE_RE.test(question));
}

/** A deterministic result, in the shape `resolveQuestion` returns. */
function direct(intent, content, status) {
  return {
    ok: true,
    source: 'site-data-direct',
    intent,
    winner: { agentNumber: 0, content, totalScore: 100, criteriaScores: {}, rank: 1 },
    priceMatchStatus: status,
  };
}

/** Words that put a message on topic even when nothing else matched it:
 *  the vocabulary of shopping for a fragrance. Deliberately broad — the
 *  cost of a false "on topic" is one model call, the cost of a false "off
 *  topic" is a refusal of a real question. */
const FRAGRANCE_TOPIC_RE =
  /\b(perfumes?|parfums?|fragrances?|scents?|scented|smell\w*|aftershaves?|colognes?|eau|edp|edt|edc|extrait|notes?|accords?|bottles?|\d+\s?ml|prices?|cost\w*|cheap\w*|deals?|offers?|sale|discount\w*|delivery|deliver|shipping|postage|shops?|retailers?|stores?|brands?|stock\w*|gifts?|presents?|buy|order|wear\w*|spray\w*|oud|attar|dupes?|clones?|sizes?|tester|samples?|returns?|refunds?|account|wishlist|pricesniffs|yanny|site|website)\b/i;

/** "help", "what can you do" — answered with the greeting's own list of
 *  what this assistant can do, not with a refusal. */
const HELP_RE = /^\s*(help|help me|what can you do|what do you do|how does this work|how do (i|you) use (this|you)|what can i ask( you)?)\s*[?!.]*\s*$/i;

/** "Do you have X", "is there an X" — a question whose honest answer, when X
 *  is not quite in the catalogue, is the closest titles rather than nothing. */
const ASKS_FOR_PRODUCT_RE = /\b(do you (have|sell|stock|carry|list|do)|have you got|is there (a|an)|got any)\b/i;
/**
 * The answer to give when a question needed the model and there is none —
 * the Worker is not deployed in this build, refused (rate limit), or did
 * not answer. `intent` is the grounding intent `resolveQuestion` returned.
 *
 * Never throws and never returns an empty string: the widget shows whatever
 * this returns as the answer.
 */
export async function resolveOfflineAnswer({ question, intent }) {
  try {
    if (intent === 'suggest') {
      return formatSuggestFallback(await resolveSuggestFallback(question));
    }
    if (intent === 'price') {
      const r = await resolvePriceQuery(question);
      if (r.status !== 'no_match') return formatPriceAnswer(question, r);
    }
    // Same order as resolveQuestion's own: a near-complete product match,
    // then a policy page, then a looser product match.
    const asProduct = await resolvePriceQuery(question, 'general');
    const settled = productSettled(question, asProduct);
    if (settled && (asProduct.matchConfidence ?? 0) >= 90) return formatPriceAnswer(question, asProduct);
    const policy = await policyPageFor(question);
    if (policy) return formatPolicyFallback(policy);
    if (settled || asProduct.brandNamed) return formatPriceAnswer(question, asProduct);
    if (asProduct.status !== 'no_match' && ASKS_FOR_PRODUCT_RE.test(question)) return formatPriceAnswer(question, asProduct);
  } catch {
    /* fall through to the plain statement below */
  }
  return NO_MODEL_ANSWER;
}

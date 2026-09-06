import { buildSiteDataBlock, resolvePriceQuery, formatPriceAnswer, policyContextFor } from './siteData.js';
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

  const siteData = await buildSiteDataBlock(question, effectiveIntent);
  return { ok: false, source: 'model', intent: effectiveIntent, siteData };
}

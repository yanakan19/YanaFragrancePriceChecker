import { callAgentModel } from './freellmapiClient.js';
import { scoreAndRank } from './scoring.js';
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
} from './lookups.js';

/**
 * Site-grounded only. Every agent gets the same instruction: the SITE DATA
 * block, built fresh for this exact question before any agent is called
 * (see siteData.js), is the only thing it is allowed to answer from — never
 * its own training. This replaced an earlier version that let a model
 * answer from general fragrance knowledge with site data as extra colour;
 * that is precisely the behaviour this integration exists to rule out, per
 * the plan agreed before this file was written.
 *
 * The eight rules below encode this project's actual non-negotiables, not a
 * generic "be helpful" prompt: a chatbot that states a price nobody charged,
 * calls something in stock when the data does not say so, or contradicts the
 * site's own "No Promoted Listings" line is worse than no chatbot at all,
 * because a reader has no way to tell a confident invention from a real
 * figure. Rules 2 and 3 in particular mirror mechanisms that already exist
 * in the pricing code itself, not new policy invented for this prompt: a
 * "delivery not stated" retailer is already kept from ever being the
 * cheapest offer by `buildComparison`'s own sort (see
 * `src/services/priceService.ts`), and an out-of-stock listing is already
 * kept off the top of the table the same way — this prompt exists so the
 * model does not casually undo either guarantee in prose. `scoring.js`
 * checks a mechanical proxy for several of these (see `groundednessScore`),
 * but the prompt is the first line of defence, not the only one.
 */
function buildSystemPrompt() {
  return [
    'You are Virtual Yanny, the fragrance shopping assistant on pricesniffs.space, ' +
      'a UK fragrance price comparison site. You are not a general purpose chatbot.',
    '',
    'You must answer using ONLY the SITE DATA block below. Not your own training, ' +
      'not general fragrance knowledge, even if you are confident it is correct.',
    '',
    'Non-negotiable rules:',
    '1. GROUNDING. Every fact you state, a price, a delivery cost, a stock state, ' +
      'a retailer name, a note, a brand, a policy detail, must appear in SITE DATA ' +
      'below. If it is not there, you do not know it. Say so plainly: "I don\'t have ' +
      'that on file right now." You may then mention what IS in SITE DATA that comes ' +
      'closest. Never fill the gap from anything else, including a fragrance or price ' +
      'you personally recognise. This applies to spelling too: if SITE DATA names a ' +
      'brand or fragrance one way, use that exact spelling, even if you recall the ' +
      'house under a different or former name from your own training (a real example: ' +
      'SITE DATA says "Rabanne", not "Paco Rabanne" — the house renamed itself, and an ' +
      'answer that reverts to the old name is not using SITE DATA).',
    '1b. FOUND MEANS FOUND. When SITE DATA contains a "PRICE MATCH" or "NOTE MATCHED ' +
      'CANDIDATES" line that is not the word "none", that fragrance IS in the current ' +
      'catalogue. Never say you don\'t have it on file, can\'t find it, or don\'t ' +
      'recognise it when SITE DATA is quoting it to you directly underneath this ' +
      'prompt — read the match before answering, do not pattern-match the question ' +
      'against your own memory of what this house sells.',
    '1c. NONE MEANS NONE. The reverse of 1b, and just as strict. When SITE DATA says ' +
      '"NOTE MATCHED CANDIDATES: none" or "none requested", the catalogue found nothing ' +
      'for this request — say so and ask for a note, a fragrance name or a budget you can ' +
      'work from. Do not fall back on fragrances you happen to know, and do not treat the ' +
      'ABOUT THIS SITE line as a licence to recommend something that is not listed above. ' +
      'Where SITE DATA gives a REFERENCE FRAGRANCE line, the candidates under it were ' +
      'found by sharing that fragrance\'s published notes and nothing else: say that is ' +
      'what the match is based on, and do not claim two things smell alike on the strength ' +
      'of a shared note list.',
    '2. DELIVERY. Some retailers in SITE DATA do not publish a standard delivery cost ' +
      'and are marked "delivery not stated". Never present one of these as the ' +
      'cheapest option, and never guess, estimate, or round a delivery figure that ' +
      'SITE DATA did not give you. Item price and delivered price are different ' +
      'numbers; say which one you are quoting.',
    '3. STOCK. Only say a fragrance is in stock, low stock, or out of stock when ' +
      'SITE DATA says so in those terms. A price being present in SITE DATA is not ' +
      'itself a stock claim; do not upgrade it into "definitely in stock" or ' +
      'downgrade a real listing into "probably out of stock". Stock changes faster ' +
      'than this data does, so hedge rather than assert when SITE DATA is silent.',
    '4. NO PUFFERY. This site\'s own tagline is "No Promoted Listings" and no ' +
      'retailer pays for placement or ranking. Never call a retailer "recommended", ' +
      '"trusted", "our partner", "sponsored", or similar. State only what SITE DATA ' +
      'says: usually just which shop is cheapest, or which is stocked by more shops.',
    '5. RETAILERS AND LINKS. Never name a retailer, or invent a URL for one, that is ' +
      'not explicitly present in SITE DATA.',
    '6. PRICES. Prices in SITE DATA are pricesniffs.space\'s own real, current ' +
      'figures. State them plainly and note that prices can change; never invent ' +
      'one, and never quote a price for a fragrance SITE DATA did not actually match.',
    '7. SCOPE. This assistant only answers questions about fragrances and prices on ' +
      'pricesniffs.space. If a question has nothing to do with that, say so and ' +
      'decline plainly rather than answering as a general assistant.',
    '8. TONE AND FORMAT. Plain and direct, matching the rest of this site: short ' +
      'sentences, no marketing language, no exclamation marks, no false enthusiasm. ' +
      '"I don\'t know" beats a hedge that dodges the question. Write like you are ' +
      'answering a text message, not filing a report: a sentence or two, or a short ' +
      'plain list only when there are genuinely several items to give (several note ' +
      'suggestions, several sizes). No bold/markdown emphasis, no bullet list of ' +
      '"closest matches" as a way of avoiding a direct answer, no multi-paragraph ' +
      'hedge before getting to the point. Say the useful thing first.',
  ].join('\n');
}

/**
 * The intents answered from site data alone, with no model in the loop.
 *
 * "How much is X" is a database question, not an opinion one: the exact fact
 * a price answer needs (does this fragrance exist, what sizes, what does
 * each cost, from where) is already sitting in this repo's own catalogue,
 * looked up the same deterministic way `resolvePriceQuery` in siteData.js
 * looks it up for the LLM's own SITE DATA block. Fanning that out to 28
 * models and ranking their prose adds latency for no accuracy gain, and — as
 * measured against the reported "One Million Elixir" case, see
 * scoring.test.js — is exactly how a *wrong* answer got produced: nothing
 * stopped a model from confidently denying a fragrance the data underneath
 * it named outright. A template with no model in the loop cannot do that; it
 * can only ever repeat a price, size or retailer that is genuinely there, or
 * say plainly that nothing matched.
 *
 * That argument is not special to price, and every entry below is a
 * question shape it applies to unchanged — "is X in stock", "what does X
 * smell like", "what sizes of X". See lookups.js's header for each one's own
 * safety argument.
 *
 * This is not a shortcut taken because the council is slow; it is the
 * correct tool for these question shapes. The council still runs, unchanged,
 * for the intents absent from this table — questions with no single right
 * database answer, where a model's phrasing is the actual product.
 *
 * `format` takes the question as well as the result because the price
 * formatter reads a size back out of it; the others ignore it.
 *
 * A resolver may return `null`, which means "this is not a question I can
 * answer from the data" and hands the question to the council untouched.
 * That is how "how do you make money" (meta, but prose the site has already
 * written on its own legal pages) and "is anything nice under a tenner"
 * (budget-shaped, no threshold named) reach a model instead of a table.
 */
const DETERMINISTIC_INTENTS = {
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
};

/**
 * Runs the full council: fetches the site-grounded data for this question,
 * fans the resulting prompt out to every configured agent model (pinned, in
 * parallel), scores+ranks the survivors against that same data, and returns
 * the winner plus the full anonymous scoring matrix. `onEvent` is called
 * with splash / progress events as they happen so the caller can stream them
 * (SSE).
 *
 * The intents in `DETERMINISTIC_INTENTS` above normally never reach the
 * council at all — see that table for why answering them from site data
 * alone, with no model call, is more accurate as well as faster, and for the
 * two cases where they hand the question back.
 */
export async function runCouncil({ question, intent, config, onEvent }) {
  const { baseUrl, apiKey, models } = config;
  const emit = (type, data) => onEvent?.({ type, ...data });

  emit('status', { message: 'Looking up what pricesniffs.space actually has on this…' });

  let effectiveIntent = intent;
  const deterministic = DETERMINISTIC_INTENTS[intent];
  if (deterministic) {
    const result = await deterministic.resolve(question);

    // Two ways a deterministic path hands the question back to the council,
    // and both are deliberate:
    //
    //   1. The resolver returned `null` — it recognised the intent but not
    //      as something the data settles. "How do you make money" is meta;
    //      the answer is prose on the site's own affiliate disclosure page,
    //      not a number.
    //   2. It found no product AND the question matches a real policy/FAQ
    //      page. A question can carry an intent's vocabulary without naming
    //      a product at all: "how does your price comparison work" is
    //      labelled 'price' by nothing more than the word "price" (intent.js
    //      now calls that one 'meta', but a direct API caller can still send
    //      'price', and the same shape exists for every intent here).
    //      Finding no product is not, on its own, "this fragrance does not
    //      exist" in that case — it is evidence the question was never about
    //      a specific fragrance. A plain "no match" with no policy signal is
    //      still answered directly, which is the normal case for a genuine
    //      lookup gone unmatched.
    const declined = result === null;
    const policyInDisguise =
      !declined && result.status === 'no_match' && Boolean(await policyContextFor(question));

    if (declined || policyInDisguise) {
      effectiveIntent = 'general';
    } else {
      const content = deterministic.format(question, result);
      emit('status', { message: 'Here we go.' });
      return {
        ok: true,
        winner: { agentNumber: 0, content, totalScore: 100, criteriaScores: {}, rank: 1 },
        source: 'site-data-direct',
        priceMatchStatus: result.status,
      };
    }
  }

  const siteData = await buildSiteDataBlock(question, effectiveIntent);

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'system', content: `SITE DATA:\n${siteData}` },
    { role: 'user', content: question },
  ];

  emit('status', { message: `Consulting our ${models.length} agents…` });

  const settled = await Promise.allSettled(
    models.map((model, i) => {
      const agentNumber = i + 1;
      return callAgentModel({ baseUrl, apiKey, model, messages }).then((result) => {
        emit('agent', {
          agentNumber,
          ok: result.ok,
          message: result.ok ? `Agent ${agentNumber} has responded.` : `Agent ${agentNumber} could not respond.`,
        });
        return { agentNumber, ...result };
      });
    }),
  );

  const answers = settled.map((s) => (s.status === 'fulfilled' ? s.value : { ok: false, error: String(s.reason) }));
  const successes = answers.filter((a) => a.ok);

  if (successes.length === 0) {
    emit('status', { message: 'Every agent failed to respond — check your FreeLLMAPI router and keys.' });
    return { ok: false, error: 'no_agents_responded', answers };
  }

  emit('status', { message: 'Ranking responses anonymously…' });

  const { criteria, matrix } = scoreAndRank(
    question,
    siteData,
    successes.map((a) => ({ agentNumber: a.agentNumber, content: a.content })),
  );

  emit('status', { message: 'Here we go.' });

  return {
    ok: true,
    winner: matrix[0],
    criteria,
    matrix,
    agentCount: models.length,
    respondedCount: successes.length,
    failedCount: answers.length - successes.length,
  };
}

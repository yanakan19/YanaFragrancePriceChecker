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
  resolveSuggestQuery,
  formatSuggestAnswer,
  resolveGreetingQuery,
  formatGreetingAnswer,
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
  // reaches the council exactly as before. It answers only the question
  // that named nothing matchable at all ("what perfume you recommend for a
  // smelly man"), where the council's own answer could only ever be a
  // refusal and 28 models were being asked to write it with no fragrance
  // data in front of them. See its doc comment in lookups.js.
  suggest: { resolve: resolveSuggestQuery, format: (_q, result) => formatSuggestAnswer(result) },
};

/**
 * Reads a non-negative integer from the environment, falling back when it is
 * absent, empty or not a number. `Number('')` is 0, which is a real value for
 * both knobs below and would silently disable them, so an explicit check
 * rather than `Number(x) || fallback`.
 */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * How long the council waits, and why it is a deadline rather than a smaller
 * roster.
 *
 * The fan-out used to be `await Promise.allSettled(...)` over every model in
 * `agents.json`, which is 28 of them. That is not "as slow as the average
 * model": it is as slow as the *slowest* one, every single time, because
 * nothing could be sent until the last promise settled. One model having a
 * bad minute on a shared free tier — and the README's own note on pooled
 * quota says that is normal, not exceptional — pinned every council answer
 * to `AGENT_TIMEOUT_SECONDS`, currently 25 seconds. The 27 that came back in
 * time bought nothing.
 *
 * So the wait now ends at whichever of these comes first:
 *
 *   - `COUNCIL_QUORUM` agents have answered successfully. Enough distinct
 *     answers to rank between; more is diminishing.
 *   - `COUNCIL_DEADLINE_MS` has passed *since the first successful answer*.
 *     Deliberately not since fan-out: this is "how much longer we wait for
 *     the rest once we know we have something to ship", so a router that is
 *     slow to first token gets the time it needs and is not cut off holding
 *     zero answers.
 *   - Every agent has reported, which is the old behaviour and still the
 *     path a healthy fast router takes.
 *
 * Whatever is still in flight is then aborted rather than left running, so
 * abandoned calls stop consuming the shared quota that the next question
 * needs.
 *
 * ── What this costs ─────────────────────────────────────────────────────
 * Honestly: the winner is now the best of however many answered in time,
 * not the best of 28. That is a real reduction in the pool `scoreAndRank`
 * chooses from, and on a question where the 20th model would have written
 * the best answer, this ships a worse one. Two things make that trade
 * worth taking here. The questions where a wrong answer actually costs a
 * reader something — prices, stock, sizes, notes, delivery — never reach
 * the council at all (see DETERMINISTIC_INTENTS above); what is left is
 * `suggest` and `general`, where the difference between the best of eight
 * and the best of twenty-eight is phrasing. And every answer, whichever
 * wins, is held to the same SITE DATA grounding by the prompt and by
 * `groundednessScore`, so a smaller pool cannot make an answer less
 * grounded, only less well put.
 *
 * Both numbers are judgements, not measurements — nothing in this repo can
 * reach the router to measure real per-model latency (see the README). They
 * are env-tunable for exactly that reason, and the `[council]` line logged
 * at the end of every question is there so the owner can read the real
 * distribution off `flyctl logs` and set them from evidence.
 */
const COUNCIL_DEADLINE_DEFAULT_MS = 8000;
const COUNCIL_QUORUM_DEFAULT = 8;

/**
 * Which intent a question is grounded as when a deterministic resolver
 * hands it back to the council.
 *
 * This was the constant `'general'`, and it was right for as long as every
 * intent that could decline was one whose grounding *is* the site's policy
 * pages — "how do you make money" is meta, and the about/affiliate page is
 * exactly what a model needs to answer it.
 *
 * Adding a resolver to `'suggest'` broke that assumption in a way worth
 * being explicit about, because it went the wrong direction quietly.
 * `resolveSuggestQuery` declines every suggestion question the catalogue
 * *can* ground — "something sweet", "what smells like Aventus" — and those
 * are precisely the questions whose SITE DATA block should carry real note
 * candidates. Demoting them to `'general'` replaced those candidates with
 * the about line and nothing else, so the questions the council most needs
 * grounding for were the ones losing it. Measured while it was live:
 * "something sweet" reached the council with `(about-site line only)`.
 *
 * So a declined resolver keeps its own intent when `buildSiteDataBlock`
 * has grounding for it, and falls to `'general'` otherwise. A policy match
 * in disguise still goes to `'general'`: that branch exists precisely
 * because the question turned out to be about the site rather than about a
 * product.
 *
 * Exported so the rule is testable on its own rather than only through a
 * live council run — see test/messyQuestions.test.js.
 */
export function councilIntentFor(intent, { declined, policyInDisguise }) {
  if (policyInDisguise) return 'general';
  return declined && GROUNDED_COUNCIL_INTENTS.has(intent) ? intent : 'general';
}

/** The intents `buildSiteDataBlock` builds real catalogue grounding for.
 *  Anything else gets the about/policy block, which is what `'general'`
 *  means. Kept beside `councilIntentFor` so the two cannot drift. */
const GROUNDED_COUNCIL_INTENTS = new Set(['price', 'suggest']);

/**
 * Runs the full council: fetches the site-grounded data for this question,
 * fans the resulting prompt out to the configured agent models (pinned, in
 * parallel), scores+ranks whichever answered in time against that same data,
 * and returns the winner plus the full anonymous scoring matrix. `onEvent`
 * is called with splash / progress events as they happen so the caller can
 * stream them (SSE).
 *
 * The intents in `DETERMINISTIC_INTENTS` above normally never reach the
 * council at all — see that table for why answering them from site data
 * alone, with no model call, is more accurate as well as faster, and for the
 * two cases where they hand the question back.
 *
 * `signal` is the reader going away: the stop button in the site's own
 * widget, or simply closing the tab. server/index.js aborts it when the
 * response socket closes, and it reaches every in-flight model call, so the
 * work genuinely stops instead of running on into a socket nobody is
 * reading.
 */
export async function runCouncil({ question, intent, config, onEvent, signal }) {
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
    // `followUp` bars the policy fallthrough: "what about the 50ml" is a
    // follow-up to a conversation this server does not keep, not a policy
    // question — but its filler words ("what", "about") overlap the legal
    // pages enough to trip policyContextFor's loose keyword match, which
    // would send it to the council with the terms of use attached. The
    // honest answer is the follow-up refusal, and it is already written.
    const policyInDisguise =
      !declined && result.status === 'no_match' && !result.followUp && Boolean(await policyContextFor(question));

    if (declined || policyInDisguise) {
      effectiveIntent = councilIntentFor(intent, { declined, policyInDisguise });
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

  const deadlineMs = envInt('COUNCIL_DEADLINE_MS', COUNCIL_DEADLINE_DEFAULT_MS);
  const quorum = Math.max(1, Math.min(envInt('COUNCIL_QUORUM', COUNCIL_QUORUM_DEFAULT), models.length));

  // One controller for every agent call. It is aborted either because the
  // reader went away (the caller's `signal`) or because the council has what
  // it needs and the rest are stragglers.
  const agentsAbort = new AbortController();
  const onCallerAbort = () => agentsAbort.abort();
  if (signal?.aborted) agentsAbort.abort();
  else signal?.addEventListener('abort', onCallerAbort, { once: true });

  const startedAt = Date.now();
  const answers = [];
  let succeeded = 0;
  let firstAnswerMs = null;
  let deadlineTimer = null;

  // `stopWaiting` is idempotent and records only the first reason, so the
  // three ways the wait can end cannot race each other into disagreeing
  // about why it ended.
  let stopReason = null;
  let release = () => {};
  const enough = new Promise((resolve) => {
    release = resolve;
  });
  const stopWaiting = (why) => {
    if (stopReason === null) stopReason = why;
    release();
  };
  if (signal) signal.addEventListener('abort', () => stopWaiting('cancelled'), { once: true });

  const tasks = models.map((model, i) => {
    const agentNumber = i + 1;
    return callAgentModel({ baseUrl, apiKey, model, messages, signal: agentsAbort.signal }).then((result) => {
      answers.push({ agentNumber, ...result });
      emit('agent', {
        agentNumber,
        ok: result.ok,
        message: result.ok ? `Agent ${agentNumber} has responded.` : `Agent ${agentNumber} could not respond.`,
      });
      if (result.ok) {
        succeeded += 1;
        if (succeeded === 1) {
          firstAnswerMs = Date.now() - startedAt;
          // The clock starts here, not at fan-out. See the block comment on
          // COUNCIL_DEADLINE_DEFAULT_MS: a router slow to its first answer
          // must not be cut off holding nothing.
          if (deadlineMs > 0) deadlineTimer = setTimeout(() => stopWaiting('deadline'), deadlineMs);
        }
        if (succeeded >= quorum) stopWaiting('quorum');
      }
      // Every agent reported. Note this is the only branch that can fire
      // when nothing succeeded, which is why a total failure is still a
      // total failure rather than an early deadline with an empty pool.
      if (answers.length === models.length) stopWaiting('all');
    });
  });

  try {
    await Promise.race([Promise.all(tasks), enough]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  // Snapshot before aborting: stragglers resolve into `answers` afterwards
  // with ok:false, and they are not part of this answer either way.
  const collected = answers.slice();
  const outstanding = models.length - collected.length;
  if (outstanding > 0) agentsAbort.abort();

  const totalMs = Date.now() - startedAt;
  const successes = collected.filter((a) => a.ok);

  // stderr/stdout is what `flyctl logs` shows, and it is the only place the
  // council's real per-model latency can be seen from — nothing in this repo
  // can reach the router to measure it (see the README). Deliberately
  // carries no question text, no key and no URL: an intent label, the model
  // ids that are already public in agents.json, and milliseconds.
  console.log(
    `[council] intent=${effectiveIntent} models=${models.length} ok=${successes.length} ` +
      `waited=${stopReason ?? 'none'} firstAnswerMs=${firstAnswerMs ?? '-'} totalMs=${totalMs} ` +
      `outstanding=${outstanding} quorum=${quorum} deadlineMs=${deadlineMs} ` +
      `latencies=${collected.map((a) => `${a.model}${a.ok ? '' : '!'}:${a.latencyMs}`).join(',')}`,
  );

  // The reader left. Nothing is written back — index.js's own socket is
  // already gone — but returning rather than ranking means the scoring work
  // is not done for an answer that has nowhere to go.
  if (signal?.aborted) return { ok: false, error: 'cancelled' };

  if (successes.length === 0) {
    emit('status', { message: 'Every agent failed to respond — check your FreeLLMAPI router and keys.' });
    return { ok: false, error: 'no_agents_responded', answers: collected };
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
    // `agentCount` stays the size of the roster, so "8/28 agents responded"
    // in the widget's own scoring-matrix summary keeps meaning what it
    // always meant. `outstandingCount` is the new part of that story: how
    // many were still working when the council stopped waiting, as opposed
    // to having actually failed.
    agentCount: models.length,
    respondedCount: successes.length,
    failedCount: collected.length - successes.length,
    outstandingCount: outstanding,
    timings: { totalMs, firstAnswerMs, waited: stopReason ?? 'none' },
  };
}

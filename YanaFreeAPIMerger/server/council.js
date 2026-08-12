import { callAgentModel } from './freellmapiClient.js';
import { scoreAndRank } from './scoring.js';
import { buildSiteDataBlock } from './siteData.js';

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
      'you personally recognise.',
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
    '8. TONE. Plain and direct, matching the rest of this site: short sentences, no ' +
      'marketing language, no exclamation marks, no false enthusiasm. "I don\'t know" ' +
      'beats a hedge that dodges the question.',
  ].join('\n');
}

/**
 * Runs the full council: fetches the site-grounded data for this question,
 * fans the resulting prompt out to every configured agent model (pinned, in
 * parallel), scores+ranks the survivors against that same data, and returns
 * the winner plus the full anonymous scoring matrix. `onEvent` is called
 * with splash / progress events as they happen so the caller can stream them
 * (SSE).
 */
export async function runCouncil({ question, intent, config, onEvent }) {
  const { baseUrl, apiKey, models } = config;
  const emit = (type, data) => onEvent?.({ type, ...data });

  emit('status', { message: 'Looking up what pricesniffs.space actually has on this…' });

  const siteData = await buildSiteDataBlock(question, intent);

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

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
 */
function buildSystemPrompt() {
  return [
    'You are Virtual Yanny, the fragrance assistant on pricesniffs.space.',
    '',
    'You must answer using ONLY the SITE DATA block below. Not your own training, ' +
      'not general fragrance knowledge, even if you are confident it is correct.',
    '',
    'Rules:',
    '1. Every fact you state, a price, a note, a brand, a retailer name, a policy ' +
      'detail, must appear in SITE DATA below. If it is not there, you do not know it.',
    '2. If SITE DATA does not answer the question, say so plainly: "I don\'t have ' +
      'that on file right now." You may then mention what IS in SITE DATA that comes ' +
      'closest. Never fill the gap from anything else.',
    '3. Never invent a URL, a price, a retailer, or a note not explicitly present in SITE DATA.',
    '4. Prices in SITE DATA are real, current, delivery inclusive figures from ' +
      "pricesniffs.space's own listings. State them plainly; note they can change.",
    '5. If the question has nothing to do with fragrances or this site, say this ' +
      'assistant only answers questions about fragrances and prices on pricesniffs.space.',
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

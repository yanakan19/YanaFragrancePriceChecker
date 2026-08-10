import { callAgentModel } from './freellmapiClient.js';
import { scoreAndRank } from './scoring.js';
import { findFragrance } from './priceLookup.js';
import { suggestByNotes } from './suggest.js';

function buildSystemPrompt(intent) {
  const base =
    'You are a knowledgeable, concise fragrance expert helping a shopper on ' +
    'pricesniffs.space. Answer directly. When you state a price, note it is ' +
    'approximate and may vary. Do not invent exact URLs.';
  if (intent === 'price') {
    return base + ' The user wants current price information for a specific fragrance.';
  }
  if (intent === 'suggest') {
    return base + ' The user wants fragrance suggestions based on scent notes they described.';
  }
  return base;
}

/**
 * Runs the full council: fans the prompt out to every configured agent model
 * (pinned, in parallel), scores+ranks the survivors, and returns the winner
 * plus the full anonymous scoring matrix. `onEvent` is called with splash /
 * progress events as they happen so the caller can stream them (SSE).
 */
export async function runCouncil({ question, intent, config, onEvent }) {
  const { baseUrl, apiKey, models } = config;
  const emit = (type, data) => onEvent?.({ type, ...data });

  emit('status', { message: 'Thinking…' });

  let domainContext = '';
  if (intent === 'price') {
    const hit = await findFragrance(question);
    domainContext = hit
      ? `Local price-list match (mock data, confidence ${hit.matchConfidence}%): ${hit.brand} ${hit.name}, ${hit.size_ml}ml, ~$${hit.lowest_price_usd} at ${hit.retailer}. Use this as your primary source; mention it may be out of date.`
      : 'No local price-list match found for this query — say so plainly rather than guessing an exact number.';
  } else if (intent === 'suggest') {
    const { results } = await suggestByNotes(question);
    domainContext = results.length
      ? `Local notes-matched candidates: ${results.map((r) => `${r.listing.brand} ${r.listing.name} (notes: ${r.listing.notes.join(', ')})`).join('; ')}.`
      : 'No strong local candidates matched those notes — suggest general note-family guidance instead.';
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(intent) },
    ...(domainContext ? [{ role: 'system', content: domainContext }] : []),
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

  const { criteria, matrix } = scoreAndRank(question, successes.map((a) => ({ agentNumber: a.agentNumber, content: a.content })));

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

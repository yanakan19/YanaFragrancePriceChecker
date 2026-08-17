// Measures the one thing this repo's sandbox *can* measure about the
// deterministic answer paths without outbound network: how long each of them
// takes, end to end, against the real live catalogue.
//
// What this does NOT measure, and cannot from here (no outbound network —
// see this task's own report): the wall-clock time the council path spends
// waiting on 28 parallel FreeLLMAPI calls. That needs a live run behind the
// deployed backend; see docs/VIRTUAL-YANNY-DEPLOY.md and this task's report
// for the exact steps. What this script gives instead is real, on this
// machine, right now: run `npm run bench` from YanaFreeAPIMerger/.
//
// Every question below is routed through `classifyIntent` rather than being
// handed a pinned intent, so what is timed is the whole path a real message
// takes: classify, resolve, format.
import { runCouncil } from '../server/council.js';
import { classifyIntent } from '../server/intent.js';

const QUESTIONS = [
  // price
  'how much is One Million Elixir',
  'cheapest One Million Elixir',
  'how much is Dior Sauvage 100ml',
  'how much is Rabanne', // ambiguous — still no model call
  // availability
  'who stocks One Million Elixir',
  'is One Million Elixir in stock',
  // notes
  'what does One Million Elixir smell like',
  // size
  'what sizes of One Million Elixir do you have',
  // delivery
  'how much is delivery from Boots',
  'who does free delivery',
  // deals
  "what's on sale",
  'biggest discount right now',
  // budget
  'what can i get under £50',
  'cheapest niche fragrance you list',
  // compare
  'is One Million Elixir cheaper than Aventus',
  // brand
  'what Creed do you have',
  // meta
  'how fresh are these prices',
  'which shops do you cover',
  'how many fragrances do you have',
  // the shapes added 2026-08-16 (keep the set above intact so runs stay
  // comparable with the recorded baseline; these extend it)
  'hello',                                  // greeting
  'thanks',                                 // greeting
  'who are you',                            // meta identity
  'do you deliver to ireland',              // delivery geography
  'recommend me a summer fragrance',        // season/occasion refusal
  'what should i wear to a wedding',        // season/occasion refusal
  'what about the 50ml',                    // follow-up refusal
  'perfume for women',                      // audience refusal
  'what perfume you recommend for a smelly man', // longevity refusal
  // added 2026-08-17 with the gender and concentration answers. Both are
  // deterministic by design — a gender reading is a lookup over a
  // precomputed index, not a question of taste, and must never cost a
  // council round.
  'something for my girlfriend',            // gender, answered from title wording
  'whats a good perfume for a man',         // gender, the other direction
  'do you have any perfume oils',           // concentration browse
  'what attars do you have',                // strength this catalogue lacks
  'what concentrations do you cover',       // concentration vocabulary
];

const emptyConfig = { baseUrl: 'https://unused.invalid', apiKey: 'unused', models: [] };
const noop = () => {};

async function once(question) {
  const intent = classifyIntent(question);
  const startedAt = performance.now();
  const result = await runCouncil({ question, intent, config: emptyConfig, onEvent: noop });
  const ms = performance.now() - startedAt;
  if (result.source !== 'site-data-direct') {
    throw new Error(`expected a deterministic answer for "${question}" (intent ${intent}), got: ${JSON.stringify(result)}`);
  }
  return { ms, intent };
}

function stats(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return `${label.padEnd(14)} n=${String(sorted.length).padStart(3)} mean=${(sum / sorted.length).toFixed(2)}ms p50=${at(0.5).toFixed(2)}ms p95=${at(0.95).toFixed(2)}ms max=${sorted[sorted.length - 1].toFixed(2)}ms`;
}

async function main() {
  // Warm-up: pays for the one-time ~15 MB catalogue import (see siteData.js's
  // own header on why that happens once per process, not per question), and
  // for the one-time delivered-price index the budget path builds.
  for (const question of QUESTIONS) await once(question);

  console.log('question,intent,ms');
  const all = [];
  const byIntent = new Map();
  const ROUNDS = 5;
  for (let round = 0; round < ROUNDS; round++) {
    for (const question of QUESTIONS) {
      const { ms, intent } = await once(question);
      all.push(ms);
      byIntent.set(intent, [...(byIntent.get(intent) ?? []), ms]);
      if (round === 0) console.log(`"${question}",${intent},${ms.toFixed(2)}`);
    }
  }

  console.log('---');
  for (const [intent, samples] of [...byIntent].sort()) console.log(stats(intent, samples));
  console.log(stats('ALL', all));
  console.log('(warm process, post-import — the one-time catalogue import and the one-time');
  console.log(' delivered-price index are excluded, same as production after its first questions)');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

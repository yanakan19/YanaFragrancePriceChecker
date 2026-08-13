// Measures the one thing this repo's sandbox *can* measure about Part 3's
// speed claim without outbound network: how long the deterministic price
// path itself takes, end to end, against the real live catalogue.
//
// What this does NOT measure, and cannot from here (no outbound network —
// see this task's own report): the wall-clock time the OLD path spent
// waiting on 28 parallel FreeLLMAPI calls. That needs a live run behind the
// deployed backend; see docs/VIRTUAL-YANNY-DEPLOY.md and this task's report
// for the exact steps. What this script gives instead is real, on this
// machine, right now: run `npm run bench` from YanaFreeAPIMerger/.
import { runCouncil } from '../server/council.js';

const QUESTIONS = [
  ['how much is One Million Elixir', 'price'],
  ['cheapest One Million Elixir', 'price'],
  ['how much is Sauvage EDT', 'price'],
  ['how much is Dior Sauvage 100ml', 'price'],
  ['how much is Rabanne', 'price'], // ambiguous — still no model call
];

const emptyConfig = { baseUrl: 'https://unused.invalid', apiKey: 'unused', models: [] };
const noop = () => {};

async function once(question, intent) {
  const startedAt = performance.now();
  const result = await runCouncil({ question, intent, config: emptyConfig, onEvent: noop });
  const ms = performance.now() - startedAt;
  if (result.source !== 'site-data-direct') {
    throw new Error(`expected a deterministic answer for "${question}", got: ${JSON.stringify(result)}`);
  }
  return ms;
}

async function main() {
  // Warm-up: pays for the one-time ~15 MB catalogue import (see siteData.js's
  // own header on why that happens once per process, not per question).
  await once(...QUESTIONS[0]);

  console.log('question,ms');
  const allMs = [];
  const ROUNDS = 20;
  for (let i = 0; i < ROUNDS; i++) {
    const [question, intent] = QUESTIONS[i % QUESTIONS.length];
    const ms = await once(question, intent);
    allMs.push(ms);
    console.log(`"${question}",${ms.toFixed(2)}`);
  }

  allMs.sort((a, b) => a - b);
  const sum = allMs.reduce((a, b) => a + b, 0);
  const p50 = allMs[Math.floor(allMs.length * 0.5)];
  const p95 = allMs[Math.floor(allMs.length * 0.95)];
  console.log('---');
  console.log(`n=${allMs.length} mean=${(sum / allMs.length).toFixed(2)}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms min=${allMs[0].toFixed(2)}ms max=${allMs[allMs.length - 1].toFixed(2)}ms`);
  console.log('(warm process, post-import — the one-time catalogue import is excluded, same as production after its first question)');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

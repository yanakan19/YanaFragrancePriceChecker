import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPriceAnswer, resolvePriceQuery } from '../server/siteData.js';
import { groundednessScore } from '../server/scoring.js';
import { classifyIntent } from '../server/intent.js';
import { runCouncil } from '../server/council.js';

/**
 * The question corpus for the reported "One Million Elixir" defect and the
 * three parts of its fix, run offline (no outbound network — see this repo's
 * task notes) against two layers on purpose:
 *
 *   - `formatPriceAnswer` is pure text formatting over a `resolvePriceQuery`
 *     result shape, so its cases below use synthetic result objects, the
 *     same reason `test/siteData.test.js`'s own `findFragranceMatch` tests
 *     use a synthetic fixture rather than the live catalogue: a formatting
 *     rule should not go flaky because the hourly harvest changed what is in
 *     stock.
 *   - `resolvePriceQuery` and `runCouncil` cannot take a fixture — they call
 *     `loadSite()` directly — so the cases that exercise them are kept to
 *     facts about the live catalogue that are safe to assert: "One Million
 *     Elixir" is explicitly required by the task (it is the reported bug,
 *     re-run against the live catalogue is the point), and "Rabanne" having
 *     more than one product is true for any UK fragrance retailer's stock
 *     and not going to become false between harvests.
 */

const noopEmit = () => {};
const emptyModels = { baseUrl: 'https://unused.invalid', apiKey: 'unused', models: [] };

/* ── formatPriceAnswer: pure formatting, synthetic fixtures ────────────── */

test('formatPriceAnswer: no_match never invents a product', () => {
  const text = formatPriceAnswer('how much is Zzyzxqq Nonexistent Perfume', { status: 'no_match' });
  assert.match(text, /don'?t have a fragrance matching/i);
  assert.doesNotMatch(text, /£/, 'a no_match answer must never state a price');
});

test('formatPriceAnswer: ambiguous names every tied candidate and asks, never guesses one', () => {
  const result = {
    status: 'ambiguous',
    matchConfidence: 100,
    candidates: [
      { brand: 'Rabanne', name: 'Fame', concentration: 'Eau de Parfum' },
      { brand: 'Rabanne', name: 'Pure XS', concentration: 'Eau de Toilette' },
    ],
  };
  const text = formatPriceAnswer('how much is Rabanne', result);
  assert.match(text, /Rabanne Fame \(Eau de Parfum\)/);
  assert.match(text, /Rabanne Pure XS \(Eau de Toilette\)/);
  assert.match(text, /which one did you mean/i);
  assert.doesNotMatch(text, /£/, 'must not quote a price for an unresolved brand-only query');
});

test('formatPriceAnswer: low_confidence hedges on identity and states no price', () => {
  const result = { status: 'low_confidence', matchConfidence: 40, brand: 'Mexx', name: 'Whenever Wherever For Him', concentration: 'Aftershave' };
  const text = formatPriceAnswer('what fragrance have you ever heard of philosophically', result);
  // The hedge has to be *in the words*, not in a percentage. This used to
  // assert /40% confidence/, which pinned the copy rather than the promise:
  // a matcher score printed at a reader invites them to arbitrate a number
  // whose basis they cannot see. What must hold is that the reply admits it
  // is unsure and quotes no price — both still asserted below.
  assert.match(text, /not certain/i);
  assert.doesNotMatch(text, /%/, 'an internal matcher score must not reach the reader');
  assert.match(text, /is that what you meant/i);
  assert.doesNotMatch(text, /£/, 'a weak match must not be quoted a price against');
});

test('formatPriceAnswer: a single-size product states the price directly, no size question', () => {
  const result = {
    status: 'matched',
    matchConfidence: 100,
    brand: 'Creed',
    name: 'Aventus',
    concentration: 'Eau de Parfum',
    variants: [{ sizeMl: 100, best: { deliveredPriceGbp: 199.99, retailerName: 'Justmylook' } }],
  };
  const text = formatPriceAnswer('how much is Creed Aventus', result);
  assert.match(text, /£199\.99 delivered from Justmylook/);
  assert.doesNotMatch(text, /want the price for one size/i);
});

test('formatPriceAnswer: a multi-size product with no size named names the product, the tracked sizes, and offers the next step', () => {
  const result = {
    status: 'matched',
    matchConfidence: 100,
    brand: 'Rabanne',
    name: 'One Million Elixir Intense',
    concentration: 'Parfum',
    variants: [
      { sizeMl: 50, best: { deliveredPriceGbp: 56.5, retailerName: 'Justmylook' } },
      { sizeMl: 100, best: { deliveredPriceGbp: 70.99, retailerName: 'Justmylook' } },
      { sizeMl: 200, best: { deliveredPriceGbp: 108.99, retailerName: 'Justmylook' } },
    ],
  };
  const text = formatPriceAnswer('how much is One Million Elixir', result);
  assert.match(text, /Rabanne One Million Elixir Intense \(Parfum\)/);
  assert.match(text, /50ml, 100ml, 200ml/);
  assert.match(text, /one size.*cheapest across all/i);
  // The bug this whole fix exists for: never deny a product the data just named.
  assert.doesNotMatch(text, /don'?t have|no fragrance|not on file/i);
});

test('formatPriceAnswer: a size named in the question is answered directly with that size\'s real price', () => {
  const result = {
    status: 'matched',
    matchConfidence: 100,
    brand: 'Rabanne',
    name: 'One Million Elixir Intense',
    concentration: 'Parfum',
    variants: [
      { sizeMl: 50, best: { deliveredPriceGbp: 56.5, retailerName: 'Justmylook' } },
      { sizeMl: 100, best: { deliveredPriceGbp: 70.99, retailerName: 'Justmylook' } },
    ],
  };
  const text = formatPriceAnswer('how much is One Million Elixir 100ml', result);
  assert.match(text, /100ml/);
  assert.match(text, /£70\.99 delivered from Justmylook/);
  assert.doesNotMatch(text, /£56\.50/, 'must not also state the 50ml price when a specific size was asked for');
});

test('formatPriceAnswer: "cheapest" lists every tracked size with its own retailer, never one made up', () => {
  const result = {
    status: 'matched',
    matchConfidence: 100,
    brand: 'Rabanne',
    name: 'One Million Elixir Intense',
    concentration: 'Parfum',
    variants: [
      { sizeMl: 50, best: { deliveredPriceGbp: 56.5, retailerName: 'Justmylook' } },
      { sizeMl: 100, best: { deliveredPriceGbp: 70.99, retailerName: 'Justmylook' } },
      { sizeMl: 200, best: null },
    ],
  };
  const text = formatPriceAnswer('cheapest One Million Elixir', result);
  assert.match(text, /50ml: £56\.50 delivered from Justmylook/);
  assert.match(text, /100ml: £70\.99 delivered from Justmylook/);
  assert.match(text, /200ml: currently out of stock/);
});

test('formatPriceAnswer: a size that genuinely is not tracked says so, without inventing one', () => {
  const result = {
    status: 'matched',
    matchConfidence: 100,
    brand: 'Rabanne',
    name: 'One Million Elixir Intense',
    concentration: 'Parfum',
    variants: [{ sizeMl: 50, best: { deliveredPriceGbp: 56.5, retailerName: 'Justmylook' } }],
  };
  const text = formatPriceAnswer('how much is One Million Elixir 75ml', result);
  assert.match(text, /not in 75ml/);
  assert.match(text, /Sizes tracked: 50ml/);
});

/* ── Cross-check: formatPriceAnswer output can never trip the false-denial
      detector formatPriceAnswer's fix in scoring.js is defending against —
      the two fixes must agree with each other. ────────────────────────── */

test('formatPriceAnswer output is never scored as a false denial by groundednessScore', () => {
  const matched = {
    status: 'matched', matchConfidence: 100, brand: 'Rabanne', name: 'One Million Elixir Intense', concentration: 'Parfum',
    variants: [{ sizeMl: 50, best: { deliveredPriceGbp: 56.5, retailerName: 'Justmylook' } }],
  };
  const siteData = 'PRICE MATCH (100% confidence): Rabanne One Million Elixir Intense, Parfum, 50ml. Cheapest right now: £56.50 delivered, from Justmylook.';
  const text = formatPriceAnswer('how much is One Million Elixir', matched);
  assert.equal(groundednessScore(text, siteData), 100);
});

/* ── resolvePriceQuery + runCouncil: live catalogue, facts safe to pin ──── */

test('resolvePriceQuery: "One Million Elixir" is found — the reported defect, re-run against the live catalogue', async () => {
  const result = await resolvePriceQuery('how much is One Million Elixir');
  assert.equal(result.status, 'matched', `expected a match, got ${JSON.stringify(result)}`);
  assert.equal(result.brand, 'Rabanne');
  assert.match(result.name, /Elixir/);
  assert.ok(result.variants.length >= 1);
});

test('resolvePriceQuery: partial name "one million eli" — the exact phrase from the site\'s own search box — still finds it', async () => {
  const result = await resolvePriceQuery('one million eli');
  assert.equal(result.status, 'matched');
  assert.equal(result.brand, 'Rabanne');
  assert.match(result.name, /Elixir/);
});

test('runCouncil: a real price question for "One Million Elixir" is answered from site data alone, with zero model calls, and never denies the product', async () => {
  const result = await runCouncil({
    question: 'how much is One Million Elixir',
    intent: 'price',
    config: emptyModels, // no models configured at all — a network call would throw, proving none was made
    onEvent: noopEmit,
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'site-data-direct');
  assert.doesNotMatch(result.winner.content, /don'?t have|no fragrance|not on file/i);
  assert.match(result.winner.content, /Rabanne/);
  assert.match(result.winner.content, /Elixir/);
});

test('runCouncil: "cheapest One Million Elixir" states a real delivered price with its retailer, from site data, no LLM', async () => {
  const result = await runCouncil({
    question: 'cheapest One Million Elixir',
    intent: 'price',
    config: emptyModels,
    onEvent: noopEmit,
  });
  assert.equal(result.ok, true);
  assert.match(result.winner.content, /£\d+\.\d{2} delivered from \S/);
});

test('resolvePriceQuery: a bare brand name with more than one product is ambiguous, not a guess at one of them', async () => {
  const result = await resolvePriceQuery('how much is Rabanne');
  assert.equal(result.status, 'ambiguous');
  assert.ok(result.candidates.length > 1);
  for (const c of result.candidates) assert.equal(c.brand, 'Rabanne');
});

/* ── classifyIntent: the rest of the corpus, at the layer that can be
      exercised offline (buildSiteDataBlock / classifyIntent) — full council
      answers for 'suggest' and 'general' need a live model call this repo's
      sandbox cannot make; see this task's report for what still needs a
      live check. ────────────────────────────────────────────────────────── */

test('classifyIntent: a note-based suggestion is routed to the council (LLM answers, never a flat lookup)', () => {
  assert.equal(classifyIntent('suggest something with vanilla and amber, no florals'), 'suggest');
  assert.equal(classifyIntent('what smells similar to Aventus'), 'suggest');
});

test('classifyIntent: a genuinely out-of-scope question is not misread as a price lookup', () => {
  assert.equal(classifyIntent("what's the weather in London today"), 'general');
  assert.equal(classifyIntent('what is your favourite film'), 'general');
});

test('classifyIntent: "how does your price comparison work" is a question about the service, not a price lookup — the old three-regex classifier called it \'price\' on the bare word "price"', () => {
  // This used to assert 'price' and describe the misrouting as a known
  // false positive that council.js worked around downstream. intent.js now
  // classifies it correctly at source (see its header and
  // test/intent.test.js for the whole corpus). The council.js workaround —
  // a 'price' intent with no fragrance match but a real SITE POLICY match
  // falling through to the council rather than denying a fragrance nobody
  // named — is deliberately kept as defence in depth, and is still
  // exercised by the test below.
  assert.equal(classifyIntent('how does your price comparison work'), 'meta');
});

test('runCouncil: a price-intent question that names no fragrance but does match a site policy page is NOT answered as a flat "no fragrance" denial — council.js\'s fallback still holds independently of intent.js', async () => {
  const result = await runCouncil({
    question: 'how does your price comparison work',
    intent: 'price', // forced, to exercise the fallback rather than the fixed classifier
    config: emptyModels, // no agents configured, so the council path fails loudly...
    onEvent: noopEmit,
  });
  // ...which is exactly the point: reaching the "no agents responded" error
  // (rather than an ok:true site-data-direct denial) proves this question
  // was routed to the council, not answered as a missing fragrance.
  assert.equal(result.ok, false);
  assert.equal(result.error, 'no_agents_responded');
  assert.notEqual(result.source, 'site-data-direct');
});

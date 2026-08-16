import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent, INTENTS } from '../server/intent.js';

/**
 * The routing corpus.
 *
 * Every entry is a question shape a fragrance shopper plausibly types, with
 * the intent it must route to. This file is the specification for
 * server/intent.js: the classifier is an ordered rule list, so the only way
 * to know a reordering has not quietly rerouted real traffic is to run the
 * whole corpus.
 *
 * Phrasings are deliberately varied — contractions, missing apostrophes,
 * missing question marks, lowercase, plurals — because that is what arrives
 * in a chat box, and the defect this replaced (see intent.js's header) was
 * precisely a plural that the pattern did not cover.
 */
const CORPUS = [
  // ── meta: about the service, never a product lookup ───────────────────
  ['how do you make money', 'meta'],
  ['how does this site work', 'meta'],
  ['how does your price comparison work', 'meta'],
  ['do you get commission', 'meta'],
  ['are these sponsored results', 'meta'],
  ['where do your prices come from', 'meta'],
  ['how fresh are these prices', 'meta'],
  ['how old is this data', 'meta'],
  ['when were these prices last updated', 'meta'],
  ['which shops do you cover', 'meta'],
  ['what retailers do you track', 'meta'],
  ['how many shops do you check', 'meta'],
  ['how many fragrances do you have', 'meta'],
  ['who are you', 'meta'],
  ['are you a bot', 'meta'],
  ['what is pricesniffs', 'meta'],

  // ── deals ─────────────────────────────────────────────────────────────
  ["what's on sale", 'deals'],
  ['any discounts?', 'deals'], // the regression case: the plural used to fall to 'general'
  ['any discount?', 'deals'],
  ['biggest discount right now', 'deals'],
  ['show me the best deals', 'deals'],
  ['what has been reduced', 'deals'],
  ['any bargains today', 'deals'],
  ['whats got the biggest percent off', 'deals'],

  // ── compare ───────────────────────────────────────────────────────────
  ['is Sauvage cheaper than Aventus', 'compare'],
  ['Aventus vs Sauvage', 'compare'],
  ['Dior Sauvage versus Bleu de Chanel', 'compare'],
  ['which is better value, Sauvage or Aventus', 'compare'],
  ['is Aventus more expensive than Sauvage', 'compare'],

  // ── delivery ──────────────────────────────────────────────────────────
  ['how much is delivery from Boots', 'delivery'],
  ['who does free delivery', 'delivery'],
  ['what is the cheapest including postage', 'delivery'],
  ['do they ship to the uk', 'delivery'],
  ['whats the shipping cost at Notino', 'delivery'],
  ['is delivery free over a certain amount', 'delivery'],

  // ── availability ──────────────────────────────────────────────────────
  ['is Sauvage in stock', 'availability'],
  ['who has Aventus', 'availability'],
  ['where can i buy Baccarat Rouge 540', 'availability'],
  ['who sells Layton', 'availability'],
  ['is it sold out everywhere', 'availability'],
  ['which stockists have it', 'availability'],

  // ── size ──────────────────────────────────────────────────────────────
  ['what sizes of Sauvage do you have', 'size'],
  ['do you have the 200ml', 'size'],
  ['is there a 30ml of Aventus', 'size'],
  ['what size does it come in', 'size'],

  // ── budget ────────────────────────────────────────────────────────────
  ['what can i get under £50', 'budget'],
  ['anything under 30 quid', 'budget'],
  ['show me something less than £100', 'budget'],
  ['cheapest niche fragrance you list', 'budget'],
  ['fragrances up to £40', 'budget'],

  // ── notes for a named fragrance ───────────────────────────────────────
  ['what does Aventus smell like', 'notes'],
  ['what are the notes in Sauvage', 'notes'],
  ['notes for Bleu de Chanel', 'notes'],
  ['how does Layton smell', 'notes'],
  ['what are the top notes', 'notes'],

  // ── brand browsing ────────────────────────────────────────────────────
  ['what Creed do you have', 'brand'],
  ['do you list Amouage', 'brand'],
  ['do you stock Xerjoff', 'brand'],
  ['do you sell Tom Ford', 'brand'],

  // ── price ─────────────────────────────────────────────────────────────
  ['how much is One Million Elixir', 'price'],
  ['how much is Dior Sauvage 100ml', 'price'], // names a size, asks a price
  ['what price is Aventus', 'price'],
  ['cheapest One Million Elixir', 'price'],
  ['whats the cost of Layton', 'price'],
  ['pricing for Bleu de Chanel', 'price'],
  ['lowest price on Sauvage', 'price'],

  // ── suggest: open taste, the council's job ────────────────────────────
  ['suggest something with vanilla and amber, no florals', 'suggest'],
  ['what smells similar to Aventus', 'suggest'],
  ['recommend me a summer fragrance', 'suggest'],
  ['any dupes for Baccarat Rouge', 'suggest'],
  ['something with oud please', 'suggest'],

  // ── suggest: season/occasion, declined honestly rather than modelled ──
  // These were 'general' — grounded by the about page only, and a council
  // model bound by rule 1 could only ever refuse them. 'suggest' is where
  // the occasion constraint is read and, when the question grounds on
  // nothing else, refused deterministically (see resolveSuggestQuery).
  ['what should i wear to a wedding', 'suggest'],
  ['anything for summer', 'suggest'],
  ['perfume for the office', 'suggest'],

  // ── greeting: the whole message is a hello or a thanks ────────────────
  ['hello', 'greeting'],
  ['hi', 'greeting'],
  ['hey yanny', 'greeting'],
  ['good morning', 'greeting'],
  ['thanks', 'greeting'],
  ['thank you!', 'greeting'],

  // ── general: out of scope or unclassifiable ───────────────────────────
  ["what's the weather in London today", 'general'],
  ['what is your favourite film', 'general'],
  // A greeting with a question in it is not a greeting.
  ['hello, how does this site work', 'meta'],
];

test('classifyIntent: the whole corpus routes as specified', () => {
  const wrong = [];
  for (const [question, expected] of CORPUS) {
    const actual = classifyIntent(question);
    if (actual !== expected) wrong.push(`${JSON.stringify(question)} -> ${actual}, expected ${expected}`);
  }
  assert.deepEqual(wrong, [], `misrouted:\n${wrong.join('\n')}`);
});

test('classifyIntent: every intent it can return is exercised by the corpus', () => {
  const covered = new Set(CORPUS.map(([, intent]) => intent));
  const missing = INTENTS.filter((i) => !covered.has(i));
  assert.deepEqual(missing, [], `intents with no corpus case: ${missing.join(', ')}`);
});

test('classifyIntent: always returns a known intent, never undefined, for hostile input', () => {
  for (const input of ['', '   ', '?????', '£££', 'a'.repeat(500), '<script>alert(1)</script>']) {
    assert.ok(INTENTS.includes(classifyIntent(input)), `bad intent for ${JSON.stringify(input.slice(0, 20))}`);
  }
  assert.ok(INTENTS.includes(classifyIntent(null)));
  assert.ok(INTENTS.includes(classifyIntent(undefined)));
});

/**
 * The specific defects in the old three-regex classifier, pinned so they
 * cannot come back. See server/intent.js's header for why each one happened:
 * alternation binds looser than the word boundaries, so `\bprice|cost|...|
 * discount\b` anchored only its first and last alternatives.
 */
test('regression: "discounts" (plural) is a deal question — the old pattern\'s `discount\\b` never matched it', () => {
  assert.equal(classifyIntent('any discounts?'), 'deals');
  assert.equal(classifyIntent('are there any discounts on Sauvage'), 'deals');
  assert.equal(classifyIntent('big discounts today'), 'deals');
});

test('regression: an unanchored `cost` no longer fires on words that merely contain it', () => {
  for (const q of ['costume party fragrance', 'costa coffee scent', 'i want to accost someone']) {
    assert.notEqual(classifyIntent(q), 'price', `"${q}" must not route to price`);
  }
});

test('regression: `\\bprice` anchored only its left edge, so "priceless" read as a price question', () => {
  assert.notEqual(classifyIntent('this is priceless'), 'price');
  // ...while the words that genuinely are price questions still route there.
  assert.equal(classifyIntent('what is the price of Sauvage'), 'price');
  assert.equal(classifyIntent('your prices are good'), 'price');
});

test('regression: "notebook" no longer reads as a note question — `\\bnote` anchored only its left edge too', () => {
  assert.notEqual(classifyIntent('my notebook smells nice'), 'notes');
});

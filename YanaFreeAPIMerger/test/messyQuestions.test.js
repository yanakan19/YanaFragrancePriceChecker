import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from '../server/intent.js';
import { parseBudget, detectAudience, detectPerformanceRequest } from '../server/requestPhrases.js';
import {
  loadSite,
  requestedNotes,
  noteFamilies,
  parseSuggestRequest,
  suggestContextFor,
  buildSiteDataBlock,
  genderCoverage,
} from '../server/siteData.js';
import { councilIntentFor } from '../server/council.js';
import {
  resolveBudgetQuery,
  formatBudgetAnswer,
  resolveSuggestQuery,
  formatSuggestAnswer,
  resolveGenderQuery,
  formatGenderAnswer,
} from '../server/lookups.js';

/**
 * The messy-question corpus.
 *
 * ── Why this file is invented, and says so ───────────────────────────────
 * There is no history of real user questions to build a corpus from, and
 * this file must not pretend otherwise. The backend persists nothing (no
 * writeFile or appendFile anywhere in server/), `/api/chat` keeps no
 * conversation or context, and the site carries no analytics — demo/legal.ts
 * states that adding tracking would be disclosed. So no corpus of genuine
 * questions exists anywhere to draw on.
 *
 * Every question below is therefore written, not observed. Two of them are
 * the site owner's, quoted verbatim, and are the reason this work happened:
 *
 *   "what perfume you recommend for a smelly man"
 *   "find a woman a perfume under £30 that smells sweet"
 *
 * The rest are variations along the axes those two demand — ungrammatical
 * phrasing, an implied gender, a budget written the way people write money,
 * a scent adjective rather than a note name, an implied need for something
 * long-lasting, and several of those in one sentence. Treat the whole set as
 * a hypothesis about how people type, not as evidence of how they do.
 *
 * What it is good for regardless: it pins the behaviour that was measured
 * and changed, so a later edit that quietly reverts one of these fails here
 * rather than in production. That is the honest substitute for the history
 * that does not exist.
 *
 * ── The line every assertion below is protecting ─────────────────────────
 * Readers spend real money on the other side of these answers. An answer
 * may only ever repeat a price, note, size, stock state or retailer that is
 * genuinely in the catalogue. Where a question asks for something the data
 * does not hold, saying so is the correct behaviour and is asserted as
 * such — the tests for gender and longevity below fail if this code ever
 * starts answering them.
 */

/* ── routing ───────────────────────────────────────────────────────────── */

/**
 * Each of these was measured as 'general' before this work — the route that
 * grounds a question with the site's about and policy pages and no
 * fragrance data at all. They are the questions this corpus exists for.
 */
const ROUTING = [
  // the owner's own two
  ['what perfume you recommend for a smelly man', 'suggest'],
  ['find a woman a perfume under £30 that smells sweet', 'budget'],

  // ungrammatical, unpunctuated, lowercase
  ['whats a good perfume for a man', 'suggest'],
  ['u got anything nice', 'suggest'],
  ['whats the best perfume you got', 'suggest'],
  ['help me pick something', 'suggest'],
  ['what should i buy', 'suggest'],

  // an implied recipient
  ['perfume for women', 'suggest'],
  ['something for my girlfriend', 'suggest'],
  ['i need a present for my mum', 'suggest'],

  // money, written the way people write it
  ['anything decent under 30 quid', 'budget'],
  ['got anything for around £30', 'budget'],
  ['perfume for 30 pounds', 'budget'],
  ['something £30ish', 'budget'],
  ['whats good for under fifty quid', 'budget'],
  ['is anything nice under a tenner', 'budget'],
  ['ive got £40 to spend', 'budget'],

  // a scent adjective rather than a note name
  ['something sweet', 'suggest'],
  ['i want something fresh and clean', 'suggest'],
  ['something spicy for winter', 'suggest'],

  // strength and longevity, however it is phrased
  ['something strong that lasts all day', 'suggest'],
  ['need something that lasts', 'suggest'],

  // several constraints in one sentence
  ['sweet perfume for a woman under £40', 'budget'],
  ['fresh mens aftershave under 50 quid', 'budget'],
  ['cheap perfume under £30 for a bloke', 'budget'],
];

test('messy questions: every one reaches a path that can answer it', () => {
  for (const [question, expected] of ROUTING) {
    assert.equal(
      classifyIntent(question),
      expected,
      `"${question}" should route to '${expected}'`,
    );
  }
});

/**
 * The other direction, and the reason widening the classifier is safe: the
 * new rules sit immediately above 'general', so nothing that already had a
 * home may move. Pinned here as well as in intent.test.js because this is
 * the file that widened the door.
 */
test('messy questions: widening the classifier moved nothing that already had a route', () => {
  const unchanged = [
    ['how much is Dior Sauvage 100ml', 'price'],
    ['what perfume is cheapest', 'price'],
    ['what does Aventus smell like', 'notes'],
    ['what are the notes in Sauvage', 'notes'],
    ['is Aventus in stock', 'availability'],
    ['what sizes of Sauvage do you have', 'size'],
    ['delivery from Boots', 'delivery'],
    ['any discounts?', 'deals'],
    ['is Sauvage cheaper than Bleu de Chanel', 'compare'],
    ['do you list Amouage', 'brand'],
    ['how fresh are these prices', 'meta'],
    ['which shops do you cover', 'meta'],
    ['how do you make money', 'meta'],
    ["what's the weather in London today", 'general'],
    // Two deliberate moves since this list was first pinned, not accidents:
    // a message that is only a greeting is answered in milliseconds rather
    // than by 28 models, and a season/occasion question is read as the
    // constraint it is so it can be declined honestly (the catalogue
    // records no season, and a rule-1-bound council model could only ever
    // refuse it anyway). See intent.js's own comments on both rules.
    ['what should i wear to a wedding', 'suggest'],
    ['hello', 'greeting'],
  ];
  for (const [question, expected] of unchanged) {
    assert.equal(classifyIntent(question), expected, `"${question}" must stay '${expected}'`);
  }
});

/* ── money, written the way people write it ────────────────────────────── */

test('budget phrasing: symbols, slang, written numbers and approximations all read as one ceiling', () => {
  const cases = [
    ['under £30', 30],
    ['find a woman a perfume under £30 that smells sweet', 30],
    ['anything decent under 30 quid', 30],
    ['perfume for 30 pounds', 30],
    ['something £30ish', 30],
    ['got anything for around £30', 30],
    ['whats good for under fifty quid', 50],
    ['is anything nice under a tenner', 10],
    ['twenty five pounds', 25],
    ['up to a hundred', 100],
    ['two hundred quid', 200],
    ['budget of £75', 75],
    ['ive got £40 to spend', 40],
    ['no more than 45', 45],
    ['£30 or less', 30],
  ];
  for (const [question, expected] of cases) {
    assert.equal(parseBudget(question)?.maxGbp, expected, `"${question}" should read as £${expected}`);
  }
});

/**
 * The deliberate gap. A bare framed-by-nothing "£30" is not a ceiling, and
 * budget outranks price in the classifier, so admitting it would reroute
 * real price questions into a catalogue filter.
 */
test('budget phrasing: an unframed amount is not a budget', () => {
  for (const question of ['is Sauvage still £30', 'how much is Dior Sauvage 100ml', 'what was the last price']) {
    assert.equal(parseBudget(question), null, `"${question}" must not read as a budget`);
  }
});

/* ── scent adjectives, grounded in the catalogue's own notes ───────────── */

/**
 * The measurement that justifies expanding a descriptor at all: the literal
 * note is real but almost unused, so matching only it under-serves the
 * request by three orders of magnitude.
 */
test('scent words: "sweet" expands to notes the catalogue actually carries, not just the literal note', async () => {
  const { data } = await loadSite();
  const literal = data.NOTE_INDEX.find((n) => n.name.toLowerCase() === 'sweet');
  assert.ok(literal, 'the catalogue is expected to carry a literal "Sweet" note');

  const { notes, families, literal: literalHits } = await requestedNotes('something sweet');
  assert.deepEqual(literalHits, ['Sweet'], 'the literal note is still found');
  assert.equal(families.length, 1, 'and "sweet" is read as one family');
  assert.ok(
    notes.length > literalHits.length,
    'the family must add notes beyond the literal one',
  );

  // The whole point: many more products are reachable through the family.
  const productsFor = (names) => {
    const seen = new Set();
    for (const n of names) {
      for (const f of data.fragrancesWithNote(n, 'any')) {
        seen.add(`${f.brand}|${f.name}|${f.concentration}`.toLowerCase());
      }
    }
    return seen.size;
  };
  assert.ok(
    productsFor(notes) > productsFor(literalHits) * 10,
    `expanding "sweet" should reach far more products than the literal note ` +
      `(${productsFor(literalHits)} literal vs ${productsFor(notes)} expanded)`,
  );
});

/**
 * The safety property of the family table: it proposes names, the live
 * catalogue decides. Nothing can be offered that the catalogue does not
 * carry, whatever the table says.
 */
test('scent words: no family may name a note the catalogue does not carry', async () => {
  const { data } = await loadSite();
  const index = new Map(data.NOTE_INDEX.map((n) => [n.name.toLowerCase(), n.count]));
  const families = await noteFamilies();
  assert.ok(families.size > 0, 'at least one family must survive validation');
  for (const [family, notes] of families) {
    assert.ok(notes.length > 0, `family "${family}" must not be empty`);
    for (const note of notes) {
      const count = index.get(note.toLowerCase());
      assert.ok(count !== undefined, `family "${family}" names "${note}", which is not in NOTE_INDEX`);
      assert.ok(count >= 3, `family "${family}" names "${note}", used by only ${count} fragrances`);
    }
  }
});

test('scent words: a suggestion built on a descriptor says which notes it read the word as', async () => {
  const block = await suggestContextFor('something sweet');
  assert.match(block, /^NOTE MATCHED CANDIDATES/, 'the block still opens the way rule 1b keys off');
  assert.match(block, /HOW THE SCENT WORDS WERE READ/, 'the reading must be disclosed');
  assert.match(block, /"sweet" -> catalogue notes .*Vanilla/, 'and must name the notes used');
  assert.match(
    block,
    /this site's reading of the word, not a claim about any bottle/,
    'and must label it a reading rather than a fact about a product',
  );
});

/* ── gender: the constraint with no data behind it ─────────────────────── */

/**
 * The claim every gender answer in this codebase rests on, asserted against
 * the live catalogue rather than trusted.
 *
 * There is still no gender field, and that is the whole reason the answers
 * disclose their coverage: what Yanny reads is the product's own title, via
 * `demo/gender.ts`, and most titles say nothing. If a real gender or
 * audience field is ever added upstream, this fails — which is the intent.
 * It is a reminder that the disclosure would then be describing a mechanism
 * the site had stopped needing.
 */
test('gender: there is still no gender field, so the reading comes off the title and covers a minority', async () => {
  const { data } = await loadSite();
  const fields = Object.keys(data.DEMO_FRAGRANCES[0]);
  const genderish = fields.filter((f) => /gender|sex|audience|target|for(him|her)/i.test(f));
  assert.deepEqual(
    genderish,
    [],
    `DEMO_FRAGRANCES gained a gender-ish field (${genderish.join(', ')}) — every gender answer in ` +
      'lookups.js says the reading comes from title wording, and that claim would need revisiting',
  );

  // The coverage, recounted here through the same module the site's filter
  // panel uses. Recomputed rather than pinned: the catalogue is rewritten
  // roughly every two hours and these numbers move with it.
  const coverage = await genderCoverage();
  assert.equal(coverage.total, data.DEMO_FRAGRANCES.length);
  assert.equal(
    coverage.counts.mens + coverage.counts.womens + coverage.counts.unisex + coverage.counts.notStated,
    coverage.total,
    'every product falls into exactly one reading',
  );
  assert.equal(coverage.stated, coverage.total - coverage.counts.notStated);

  const share = coverage.stated / coverage.total;
  assert.ok(
    share > 0 && share < 0.5,
    `${(share * 100).toFixed(2)}% of titles state an audience. The answers disclose that split ` +
      'precisely because it is a minority; if it ever passed half, the wording deserves re-examining.',
  );

  // The rule the whole design rests on: silence is its own reading and is
  // never folded into unisex. Unisex is only ever the word itself.
  assert.ok(
    coverage.counts.unisex < coverage.counts.notStated / 100,
    `${coverage.counts.unisex} titles say unisex against ${coverage.counts.notStated} that say nothing — ` +
      'if these were ever conflated, the smaller number would swallow the larger one silently',
  );
  const [id, evidence] = [...coverage.byId].find(([, e]) => e.reading === 'unisex');
  const unisexProduct = data.DEMO_FRAGRANCES.find((f) => f.id === id);
  assert.match(
    `${unisexProduct.brand} ${unisexProduct.name} ${unisexProduct.concentration}`,
    /unisex|for men and women|for him and her/i,
    'a unisex reading is only ever the shop having written the word',
  );
  assert.ok(evidence.phrase, 'and the phrase that decided it is kept, so a reader can check it');
  for (const [pid, e] of coverage.byId) {
    if (e.reading !== 'notStated') continue;
    assert.equal(e.phrase, null, `${pid} is not stated but carries a phrase, which cannot be right`);
  }

  const withNotes = data.DEMO_FRAGRANCES.filter((f) => f.notes);
  const audienceInNotes = withNotes.filter((f) =>
    ['top', 'middle', 'base'].some((l) =>
      (f.notes[l] ?? []).some((n) => /^(women|men|unisex|ladies|gents|male|female)$/i.test(n.trim())),
    ),
  ).length;
  assert.ok(
    audienceInNotes < withNotes.length * 0.01,
    `${audienceInNotes} of ${withNotes.length} fragrances with notes carry an audience word in them — ` +
      'the note field is still not a source for this, and no answer reads it as one',
  );
});

/**
 * This test used to assert the opposite, and the change is deliberate.
 *
 * Yanny refused every gender question — "I can't filter by who it is for —
 * the catalogue doesn't record that" — and that was correct when it was
 * written. `demo/gender.ts` now exists, the site's own filter panel offers a
 * gender facet built on it, and a chatbot refusing what the sidebar beside
 * it answers is not being careful, it is being stale.
 *
 * What the test pins now is the *disclosed* answer: real listings, the
 * coverage stated in the same breath, and the two things that must never
 * appear — a bottle whose title says nothing, and silence rendered as
 * unisex.
 */
test('gender: a question naming a recipient is answered from title wording, with the coverage disclosed', async () => {
  for (const question of [
    'find a woman a perfume under £30 that smells sweet',
    'whats a good perfume for a man',
    'something for my girlfriend',
    'i need a present for my mum',
    'cheap perfume under £30 for a bloke',
  ]) {
    assert.ok(detectAudience(question), `"${question}" names a recipient`);
  }

  const coverage = await genderCoverage();
  const { data } = await loadSite();
  const byId = new Map(data.DEMO_FRAGRANCES.map((f) => [`${f.brand} ${f.name}`, f]));

  const result = await resolveBudgetQuery('find a woman a perfume under £30 that smells sweet');
  const answer = formatBudgetAnswer(result);
  assert.doesNotMatch(answer, /can't filter by who it is for/i, `the refusal is gone:\n${answer}`);
  assert.match(answer, /Filtered to the .* whose titles say Women's/, answer);
  assert.match(answer, /Read from wording in the title/, `the coverage must be disclosed:\n${answer}`);
  assert.match(answer, /Not stated is not the same as unisex/, answer);
  assert.match(
    answer,
    new RegExp(`${coverage.counts.notStated.toLocaleString('en-GB')} do not say`),
    `and the size of the silent pile named, recounted here as ${coverage.counts.notStated}:\n${answer}`,
  );

  // Every bottle quoted really is one whose own title says so. Checked
  // through the shared index rather than by re-reading the titles here: a
  // second reading in the test would pass while the answer and the site's
  // filter panel disagreed.
  for (const item of result.items) {
    const frag = byId.get(`${item.brand} ${item.name}`);
    assert.equal(
      coverage.byId.get(frag.id).reading,
      'womens',
      `${item.brand} ${item.name} was quoted for a women's request without a women's title`,
    );
  }

  // The gender-only shape, answered by the suggest path.
  const gender = await resolveGenderQuery('something for my girlfriend');
  assert.equal(gender.reading, 'womens');
  assert.equal(gender.readingTotal, coverage.counts.womens);
  const genderAnswer = formatGenderAnswer(gender);
  assert.match(genderAnswer, /Read from wording in the title/, genderAnswer);
  assert.match(genderAnswer, /Not stated is not the same as unisex/, genderAnswer);
  for (const item of gender.items) {
    assert.ok(item.phrase, 'every quoted bottle carries the phrase that classified it');
    assert.match(
      `${item.brand} ${item.name} ${item.concentration}`,
      new RegExp(item.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `the phrase must really be in the title: ${item.brand} ${item.name} / "${item.phrase}"`,
    );
  }
});

/**
 * The one rule the whole design rests on, checked at the level a reader
 * meets it: no answer to a gendered question may quote a bottle nobody
 * labelled.
 */
test('gender: "not stated" is never quoted as an answer and never becomes unisex', async () => {
  const coverage = await genderCoverage();
  const { data } = await loadSite();
  const byId = new Map(data.DEMO_FRAGRANCES.map((f) => [`${f.brand} ${f.name}`, f]));

  for (const [question, expected] of [
    ['perfume for women', 'womens'],
    ['whats a good perfume for a man', 'mens'],
    ['i need a present for my mum', 'womens'],
  ]) {
    const result = await resolveGenderQuery(question);
    assert.equal(result.reading, expected, question);
    for (const item of result.items) {
      const frag = byId.get(`${item.brand} ${item.name}`);
      const reading = coverage.byId.get(frag.id).reading;
      assert.notEqual(reading, 'notStated', `"${question}" quoted an unlabelled bottle: ${item.name}`);
      assert.equal(reading, expected, `"${question}" quoted a ${reading} bottle`);
    }
  }

  // And the council's own block says it in words, for the questions that
  // still reach a model.
  const block = await suggestContextFor('something floral for my girlfriend');
  assert.match(block, /Never treat "not stated" as unisex/, block);
  assert.match(block, /audience: not stated by any shop; do not assign one/, block);
});

/* ── strength and longevity: the other constraint with no data ─────────── */

test('longevity: "smelly man" is read as a request for something long-lasting, not as an insult', async () => {
  const question = 'what perfume you recommend for a smelly man';
  assert.ok(detectPerformanceRequest(question));

  const result = await resolveSuggestQuery(question);
  assert.ok(result, 'this is the shape answered deterministically rather than by the council');
  const answer = formatSuggestAnswer(result);

  assert.match(answer, /how strong or long-lasting something is/i, `must name the real constraint:\n${answer}`);
  assert.match(answer, /catalogue records neither|catalogue doesn't record that/i, 'and say the data does not hold it');

  // No lecture, no correction of the phrasing, no apology loop.
  for (const preachy of [/rude/i, /offens/i, /insult/i, /shouldn'?t say/i, /hygiene/i, /shower/i, /sorry/i]) {
    assert.doesNotMatch(answer, preachy, `the answer must not moralise: ${preachy}`);
  }
  // And nothing invented in place of an answer. The "under £30" in the
  // offer is an example of a phrase the reader could type, not a price
  // quoted for a product — a quoted price always arrives as "— £x from y".
  assert.doesNotMatch(answer, /— £\d/, 'a refusal must not quote a product price');
  assert.doesNotMatch(answer, /delivered from/, 'a refusal must not quote a listing');
});

test('longevity: strength wording in any phrasing is detected', () => {
  for (const question of [
    'something strong that lasts all day',
    'need something that lasts',
    'i want good longevity',
    'whats got the best sillage',
    'what perfume you recommend for a smelly man',
  ]) {
    assert.ok(detectPerformanceRequest(question), `"${question}" is a performance request`);
  }
  // The near-miss that must not trip it: "last" is not "lasts".
  assert.equal(detectPerformanceRequest('what was the last price'), false);
});

/* ── several constraints in one sentence ───────────────────────────────── */

/**
 * The owner's own question, and the one that has now been fixed twice.
 *
 * It was first answered with the five most widely stocked bottles under £30
 * — chosen for popularity, not for sweetness, the second of them Calvin
 * Klein Obsession For Men — with nothing admitting that two of its three
 * constraints had been dropped. The scent filter fixed one of those and the
 * third was named as impossible, which it was at the time.
 *
 * All three are honoured now. "For a woman" filters on the site's own
 * reading of the title, and the answer states the coverage of that reading
 * in the same breath, because 657 women's bottles out of 12,666 must not be
 * readable as "this site is thin on perfume for women". It is not; it is
 * thin on shops that said.
 */
test("the owner's example: price, scent and audience are all honoured, and the audience reading is disclosed", async () => {
  const question = 'find a woman a perfume under £30 that smells sweet';
  const result = await resolveBudgetQuery(question);

  assert.equal(result.maxGbp, 30, 'the price ceiling is read');
  assert.equal(result.scent.any, true, 'and the scent request is read');
  assert.ok(result.items.length > 0, 'and there are real matches');

  for (const item of result.items) {
    assert.ok(item.deliveredPriceGbp <= 30, `${item.brand} ${item.name} is over the ceiling`);
    assert.ok(
      item.matched.length > 0,
      `${item.brand} ${item.name} was listed without matching any requested note`,
    );
  }

  const coverage = await genderCoverage();
  const { data } = await loadSite();
  const byId = new Map(data.DEMO_FRAGRANCES.map((f) => [`${f.brand} ${f.name}`, f]));
  for (const item of result.items) {
    const frag = byId.get(`${item.brand} ${item.name}`);
    assert.equal(
      coverage.byId.get(frag.id).reading,
      'womens',
      `${item.brand} ${item.name} was returned for "find a woman" without a women's title`,
    );
  }

  const answer = formatBudgetAnswer(result);
  assert.match(answer, /Read "sweet" as/, `the scent reading must be shown:\n${answer}`);
  assert.match(answer, /Filtered to the .* whose titles say Women's/, `and the audience filter:\n${answer}`);
  assert.match(answer, /Read from wording in the title/, `and how that reading was made:\n${answer}`);
  assert.match(answer, /Not stated is not the same as unisex/, `and the rule behind it:\n${answer}`);
  assert.match(answer, /notes the shops published/, 'and the note subset must be disclosed');
});

/**
 * Every note a scent-filtered budget answer matched on must be a note that
 * fragrance genuinely lists. The structural guarantee, checked rather than
 * assumed — this is the one path that combines two filters, and the place a
 * mismatched join would show up.
 */
test('multi-constraint: every matched note is genuinely on the fragrance it is claimed for', async () => {
  const { data } = await loadSite();
  // Keyed including the size. Different bottle sizes of one perfume are
  // separate catalogue rows and can carry different note lists (see
  // suggestContextFor's own note on Tom Ford Black Orchid), so a key
  // without the size would compare an item's matched notes against a
  // different row's data and report a mismatch that is not there.
  const byKey = new Map();
  for (const f of data.DEMO_FRAGRANCES) {
    byKey.set(`${f.brand}|${f.name}|${f.concentration}|${f.sizeMl}`.toLowerCase(), f);
  }

  for (const question of [
    'find a woman a perfume under £30 that smells sweet',
    'fresh mens aftershave under 50 quid',
    'something woody under £60',
  ]) {
    const result = await resolveBudgetQuery(question);
    for (const item of result.items) {
      const frag = byKey.get(`${item.brand}|${item.name}|${item.concentration}|${item.sizeMl}`.toLowerCase());
      assert.ok(frag, `${item.brand} ${item.name} is not in the catalogue`);
      const own = ['top', 'middle', 'base']
        .flatMap((l) => frag.notes?.[l] ?? [])
        .map((n) => n.toLowerCase());
      for (const matched of item.matched) {
        assert.ok(
          own.includes(matched.toLowerCase()),
          `"${question}" claimed ${item.brand} ${item.name} shares "${matched}", which is not on its note list`,
        );
      }
    }
  }
});

/* ── degrading gracefully ──────────────────────────────────────────────── */

test('graceful failure: an ungroundable question offers what the catalogue can do instead, and names nothing', async () => {
  // "something for my girlfriend" was the second question here and is now
  // answered rather than refused — see the gender tests below. What remains
  // is the shape with genuinely nothing behind it.
  for (const question of ['what perfume you recommend for a smelly man', 'anything for the office']) {
    const result = await resolveSuggestQuery(question);
    assert.ok(result, `"${question}" should be answered deterministically`);
    const answer = formatSuggestAnswer(result);

    assert.match(answer, /a scent word/, 'must offer the scent words it can filter on');
    assert.match(answer, /under £30/, 'and a price ceiling');
    assert.match(answer, /notes of a fragrance you name/, 'and matching a named fragrance');
    // The one thing a refusal must never do.
    assert.doesNotMatch(answer, /\bEau de (Parfum|Toilette)\b/, 'a refusal must not name a product');
  }
});

test('graceful failure: open taste questions still go to the council, not to a deterministic refusal', async () => {
  // What deliberately stays with the council: questions that ground on
  // nothing but that the data does not contradict either. ("recommend me a
  // summer fragrance" used to be in this list; season is now read as a
  // constraint the catalogue provably lacks, and a question resting
  // entirely on it is refused deterministically — see the test below.)
  for (const question of ['do you have anything nice', 'help me pick something', 'whats your favourite perfume']) {
    assert.equal(
      await resolveSuggestQuery(question),
      null,
      `"${question}" is open taste and must stay with the council`,
    );
  }
});

test('season/occasion: a question resting entirely on one is refused honestly, in process', async () => {
  for (const question of [
    'recommend me a summer fragrance',
    'what should i wear to a wedding',
    'anything for the office',
  ]) {
    assert.equal(classifyIntent(question), 'suggest', `"${question}" should route to suggest`);
    const result = await resolveSuggestQuery(question);
    assert.ok(result, `"${question}" should be refused deterministically, not sent to the council`);
    const answer = formatSuggestAnswer(result);
    assert.match(answer, /season or occasion/i, `must name the constraint:\n${answer}`);
    assert.match(answer, /doesn't record that|records neither|records none/i, 'and say the data lacks it');
    // A refusal must still not name or price a product.
    assert.doesNotMatch(answer, /— £\d/, 'a refusal must not quote a product price');
    assert.doesNotMatch(answer, /delivered from/, 'a refusal must not quote a listing');
  }

  // A question that also carries something real still grounds on the real
  // part and reaches the council with the season named as unmeetable.
  assert.equal(classifyIntent('something spicy for winter'), 'suggest');
  assert.equal(await resolveSuggestQuery('something spicy for winter'), null);
  const block = await suggestContextFor('something spicy for winter');
  assert.match(block, /NOTE MATCHED CANDIDATES \(requested:/, block);
  assert.match(block, /SEASON AND OCCASION: not recorded/, block);
});

/**
 * Which filter emptied the result is a fact the reader needs, and the three
 * outcomes get three different sentences. The thresholds below are not
 * pinned to a number the catalogue has to keep — whichever branch this
 * question lands in today, the sentence for that branch has to be right.
 */
test('graceful failure: an empty result says which filter emptied it', async () => {
  for (const question of ['something smoky under £6', 'something smoky under £3', 'anything under £2']) {
    const result = await resolveBudgetQuery(question);
    const answer = formatBudgetAnswer(result);
    if (result.items.length > 0) {
      assert.match(answer, /delivered/, `a non-empty result must quote delivered prices:\n${answer}`);
      continue;
    }
    if (result.scent.any && result.pricedMatching > 0) {
      assert.match(
        answer,
        /without the scent filter/,
        `"${question}" was emptied by the scent filter and must say so:\n${answer}`,
      );
    } else {
      assert.match(
        answer,
        /Nothing .*comes in at/,
        `"${question}" found nothing at that price and must say so:\n${answer}`,
      );
    }
  }
});

/* ── the whole corpus, end to end ──────────────────────────────────────── */

/**
 * The invariant that matters most, run over every question in the corpus:
 * a deterministic answer may name only fragrances that are in the catalogue
 * and prices that were read from it. No formatter composes either, but this
 * is the check that would catch it if one ever started.
 */
test('the whole corpus: no deterministic answer names a fragrance or price the catalogue does not hold', async () => {
  const { data } = await loadSite();
  const titles = new Set(
    data.DEMO_FRAGRANCES.map((f) => `${f.brand} ${f.name} (${f.concentration})`.toLowerCase()),
  );

  for (const [question] of ROUTING) {
    const intent = classifyIntent(question);
    let answer = null;
    if (intent === 'budget') {
      const result = await resolveBudgetQuery(question);
      if (result) answer = formatBudgetAnswer(result);
    } else if (intent === 'suggest') {
      const result = await resolveSuggestQuery(question);
      if (result) answer = formatSuggestAnswer(result);
    }
    if (!answer) continue;

    for (const line of answer.split('\n')) {
      const named = line.match(/^(.+?) \d+(?:\.\d+)?ml — £/);
      if (!named) continue;
      assert.ok(
        titles.has(named[1].toLowerCase()),
        `"${question}" named "${named[1]}", which is not a catalogue product`,
      );
    }
  }
});

/**
 * Nothing in the corpus may produce an answer that claims a gender or a
 * longevity fact about a product. The refusals say the data does not hold
 * these; this checks no answer quietly asserts one anyway.
 */
test('the whole corpus: no answer claims a fragrance is for men or women, or ranks longevity', async () => {
  const forbidden = [
    /\bis a (men'?s|women'?s|ladies'?|masculine|feminine) (fragrance|perfume|scent)\b/i,
    /\b(designed|made|intended) for (men|women|him|her)\b/i,
    /\blasts (longer|all day|for hours)\b/i,
    /\b(strongest|longest ?lasting|best projection)\b/i,
  ];
  for (const [question] of ROUTING) {
    const intent = classifyIntent(question);
    let answer = null;
    if (intent === 'budget') {
      const result = await resolveBudgetQuery(question);
      if (result) answer = formatBudgetAnswer(result);
    } else if (intent === 'suggest') {
      const result = await resolveSuggestQuery(question);
      if (result) answer = formatSuggestAnswer(result);
    }
    if (!answer) continue;
    for (const pattern of forbidden) {
      assert.doesNotMatch(answer, pattern, `"${question}" produced a claim the data cannot support:\n${answer}`);
    }
  }
});

/**
 * The regression that adding a resolver to 'suggest' introduced, caught by
 * running the corpus through the real path rather than by reading the code.
 *
 * council.js demoted any declined resolver to 'general', which was right
 * while only meta and budget could decline — their grounding *is* the
 * policy pages. `resolveSuggestQuery` declines exactly the suggestion
 * questions the catalogue can ground, so demoting those stripped the note
 * candidates off the questions that needed them most: "something sweet"
 * reached the council with the about line and nothing else.
 */
test('routing: a declined suggest resolver keeps its note grounding instead of falling back to the about page', async () => {
  assert.equal(councilIntentFor('suggest', { declined: true, policyInDisguise: false }), 'suggest');
  assert.equal(councilIntentFor('budget', { declined: true, policyInDisguise: false }), 'general');
  assert.equal(councilIntentFor('meta', { declined: true, policyInDisguise: false }), 'general');
  // A question that turned out to be about the site, not a product, still
  // goes to 'general' — that is what that branch is for.
  assert.equal(councilIntentFor('suggest', { declined: false, policyInDisguise: true }), 'general');

  // And end to end: the block a declined suggest question actually gets.
  for (const question of ['something sweet', 'i want something fresh and clean']) {
    assert.equal(await resolveSuggestQuery(question), null, `"${question}" should decline to the council`);
    const intent = councilIntentFor('suggest', { declined: true, policyInDisguise: false });
    const block = await buildSiteDataBlock(question, intent);
    assert.match(
      block,
      /NOTE MATCHED CANDIDATES \(requested:/,
      `"${question}" reached the council with no note candidates:\n${block}`,
    );
  }
});

/**
 * The council-bound half of the corpus. A question that reaches a model
 * must arrive with a SITE DATA block that either grounds it or states
 * plainly what it cannot ground — never an empty one, which is the
 * configuration this project's original invented-answer bug came out of.
 */
test('the whole corpus: every council-bound question arrives with something real or an explicit refusal', async () => {
  for (const [question] of ROUTING) {
    if (classifyIntent(question) !== 'suggest') continue;
    if (await resolveSuggestQuery(question)) continue; // answered deterministically

    const block = await suggestContextFor(question);
    const grounded = /^NOTE MATCHED CANDIDATES \(requested:/.test(block);
    const refused = /^NOTE MATCHED CANDIDATES: none/.test(block);
    assert.ok(grounded || refused, `"${question}" produced an unrecognised block:\n${block}`);
    if (refused) {
      assert.match(
        block,
        /WHAT CAN BE FILTERED ON INSTEAD/,
        `"${question}" refused without offering anything the catalogue can do:\n${block}`,
      );
    }
  }
});

/**
 * The constraints the data cannot meet have to reach the model too, not
 * just the deterministic answers — a block that is merely silent about
 * gender leaves a model free to invent a filter for it under rule 1.
 */
test('the whole corpus: a council-bound question naming a recipient is told how the reading works and what it covers', async () => {
  const question = 'something floral for my girlfriend';
  const request = await parseSuggestRequest(question);
  assert.equal(request.audience, 'women');

  const block = await suggestContextFor(question);
  const coverage = await genderCoverage();
  assert.match(block, /WHO IT IS FOR:/, block);
  assert.match(block, /no gender or audience field/, block);
  assert.match(block, /read from title wording|Read from title wording/, block);
  assert.match(
    block,
    new RegExp(`${coverage.stated.toLocaleString('en-GB')} of the ${coverage.total.toLocaleString('en-GB')} bottles`),
    `the coverage must reach the model as a number, recounted here:\n${block}`,
  );
  assert.match(block, /Never treat "not stated" as unisex/, block);
  assert.match(block, /never infer an audience from a note list/, block);
});

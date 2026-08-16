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
} from '../server/siteData.js';
import {
  resolveBudgetQuery,
  formatBudgetAnswer,
  resolveSuggestQuery,
  formatSuggestAnswer,
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
    // Named in the README as the council's, and pinned in intent.test.js.
    ['what should i wear to a wedding', 'general'],
    ["what's the weather in London today", 'general'],
    ['hello', 'general'],
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
 * The claim every gender refusal in this codebase rests on, asserted
 * against the live catalogue rather than trusted.
 *
 * If a gender or audience field is ever added to DemoFragrance, this fails
 * — which is the intent. It is a reminder to revisit the refusal, not a
 * rule that one must never exist.
 */
test('gender: the catalogue has no field that could support filtering by who a fragrance is for', async () => {
  const { data } = await loadSite();
  const fields = Object.keys(data.DEMO_FRAGRANCES[0]);
  const genderish = fields.filter((f) => /gender|sex|audience|target|for(him|her)/i.test(f));
  assert.deepEqual(
    genderish,
    [],
    `DEMO_FRAGRANCES gained a gender-ish field (${genderish.join(', ')}) — the refusals in ` +
      'requestPhrases.js and lookups.js were written on the assumption there is none, and should be revisited',
  );

  // The two things that look like substitutes, measured rather than assumed.
  const MASC = /\b(pour homme|for men|for him|homme|men'?s|man|masculine)\b/i;
  const FEM = /\b(pour femme|for women|for her|femme|women'?s|woman|feminine)\b/i;
  const titled = data.DEMO_FRAGRANCES.filter((f) => {
    const t = `${f.brand} ${f.name}`;
    return MASC.test(t) || FEM.test(t);
  }).length;
  const share = titled / data.DEMO_FRAGRANCES.length;
  assert.ok(
    share < 0.2,
    `only ${(share * 100).toFixed(1)}% of titles state an audience — too few to filter on, which is ` +
      'why the answer says so instead. If this ever passes 20% the argument deserves re-examining.',
  );

  const withNotes = data.DEMO_FRAGRANCES.filter((f) => f.notes);
  const audienceInNotes = withNotes.filter((f) =>
    ['top', 'middle', 'base'].some((l) =>
      (f.notes[l] ?? []).some((n) => /^(women|men|unisex|ladies|gents|male|female)$/i.test(n.trim())),
    ),
  ).length;
  assert.ok(
    audienceInNotes < withNotes.length * 0.01,
    `${audienceInNotes} of ${withNotes.length} fragrances with notes carry an audience word in them — ` +
      'still far too few to filter on',
  );
});

test('gender: a question naming a recipient is detected, and answered by saying it cannot be honoured', async () => {
  for (const question of [
    'find a woman a perfume under £30 that smells sweet',
    'whats a good perfume for a man',
    'something for my girlfriend',
    'i need a present for my mum',
    'cheap perfume under £30 for a bloke',
  ]) {
    assert.ok(detectAudience(question), `"${question}" names a recipient`);
  }

  const result = await resolveBudgetQuery('find a woman a perfume under £30 that smells sweet');
  const answer = formatBudgetAnswer(result);
  assert.match(answer, /can't filter by who it is for/i, `the answer must say so:\n${answer}`);
  assert.match(answer, /doesn't record that/i, 'and why');
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
 * The failure this whole change exists to fix. Before it, this question was
 * answered with the five most widely stocked bottles under £30 — chosen for
 * popularity, not for sweetness, the second of them a men's fragrance —
 * with nothing in the answer admitting that two of the three constraints
 * had been dropped.
 */
test("the owner's example: price and scent are both honoured, and the constraint that cannot be is named", async () => {
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

  const answer = formatBudgetAnswer(result);
  assert.match(answer, /Read "sweet" as/, `the reading must be shown:\n${answer}`);
  assert.match(answer, /can't filter by who it is for/i, 'the unmet constraint must be named');
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
  for (const question of ['what perfume you recommend for a smelly man', 'something for my girlfriend']) {
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
  // The README's own list of what deliberately stays with the council.
  for (const question of ['recommend me a summer fragrance', 'do you have anything nice', 'help me pick something']) {
    assert.equal(
      await resolveSuggestQuery(question),
      null,
      `"${question}" is open taste and must stay with the council`,
    );
  }
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
test('the whole corpus: a council-bound question naming a recipient is told the catalogue has no such field', async () => {
  const question = 'perfume for women';
  const request = await parseSuggestRequest(question);
  assert.equal(request.audience, 'women');

  const block = await suggestContextFor(question);
  assert.match(block, /CONSTRAINTS THIS DATA CANNOT MEET/, block);
  assert.match(block, /no gender or audience field/, block);
  assert.match(block, /Do not filter by who a fragrance is for/, block);
});

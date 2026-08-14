import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCouncil } from '../server/council.js';
import { loadSite, resolveProductQuery, productWords } from '../server/siteData.js';
import {
  resolveAvailabilityQuery,
  formatAvailabilityAnswer,
  resolveNotesQuery,
  formatNotesAnswer,
  resolveSizeQuery,
  formatSizeAnswer,
} from '../server/lookups.js';

/**
 * These run against the live catalogue, which a scheduled workflow rewrites
 * roughly every two hours. So almost nothing here pins a price or a shop
 * name: what is asserted is the *shape* of an answer and, above all, its
 * traceability — that every figure and every retailer in the words a reader
 * sees came out of the data that was read.
 */

const site = await loadSite();
const RETAILER_NAMES = new Set(site.retailers.RETAILERS.map((r) => r.name));

/** Every "£12.34" in a string. */
const poundsIn = (text) => [...text.matchAll(/£(\d+\.\d{2})/g)].map((m) => Number(m[1]));

/* ── the invariant that matters most ───────────────────────────────────── */

/**
 * The deterministic paths exist because a model with the catalogue in front
 * of it still produced a confident denial of a fragrance the catalogue held
 * (the reported "One Million Elixir" case). The claim being made for these
 * replacements is not "a model is unlikely to invent a figure here" but "no
 * figure in this reply can be anything other than one that was read". This
 * test is that claim, checked rather than asserted in a comment: for a
 * spread of real questions, every pound figure in the answer must be a value
 * present in the resolved data, and every retailer named must exist in the
 * registry.
 */
test('traceability: every price and retailer in a deterministic answer comes from the data that was read', async () => {
  const cases = [
    ['availability', resolveAvailabilityQuery, formatAvailabilityAnswer],
    ['size', resolveSizeQuery, formatSizeAnswer],
  ];
  const questions = [
    'who stocks One Million Elixir',
    'who sells Layton',
    'who has Aventus',
    'what sizes does Layton come in',
    'is there a 30ml of Aventus',
    'is One Million Elixir in stock',
  ];

  for (const [intent, resolve, format] of cases) {
    for (const question of questions) {
      const result = await resolve(question);
      const answer = format(result);
      if (result.status !== 'matched') continue;

      // Every price stated must be one the resolver actually produced.
      const allowed = new Set(
        (result.sizes ?? [])
          .map((s) => s.best?.deliveredPriceGbp)
          .filter((p) => p != null)
          .map((p) => Number(p.toFixed(2))),
      );
      for (const stated of poundsIn(answer)) {
        assert.ok(allowed.has(stated), `[${intent}] "${question}" states £${stated}, not in the resolved data: ${answer}`);
      }

      // Every retailer named must be a registry retailer.
      const namedShops = (result.sizes ?? []).flatMap((s) => [
        ...(s.inStock ?? []), ...(s.lowStock ?? []), ...(s.preOrder ?? []),
        ...(s.outOfStock ?? []), ...(s.unknown ?? []),
        ...(s.best ? [s.best.retailerName] : []),
      ]);
      for (const shop of namedShops) {
        assert.ok(RETAILER_NAMES.has(shop), `[${intent}] "${question}" named a shop not in the registry: ${shop}`);
      }
    }
  }
});

/* ── product identity ──────────────────────────────────────────────────── */

test('resolveProductQuery: a single distinctive word resolves to the product whose title the query describes most completely', async () => {
  const result = await resolveProductQuery('who has Aventus', 'availability');
  assert.equal(result.status, 'matched');
  assert.equal(result.anchor.brand, 'Creed');
  assert.equal(result.anchor.name, 'Aventus');
});

test('resolveProductQuery: the tightest-fit tie-break never fires on a partial match — a query the catalogue has no exact answer for stays a question', async () => {
  // The site does not carry Chanel's Bleu de Chanel; "bleu" and "chanel"
  // each hit different, unrelated products at half the query's words. Left
  // to a shortest-title rule with no completeness guard, one of those would
  // be returned as the answer.
  const result = await resolveProductQuery('is Bleu de Chanel sold out', 'availability');
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.exact, false);
});

test('resolveProductQuery: the tie-break never fires on a brand-only query — a house is not a bottle', async () => {
  const result = await resolveProductQuery('how much is Rabanne', 'price');
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.exact, true);
  assert.ok(result.candidates.length > 1);
});

test('resolveProductQuery: genuinely distinct concentrations of one perfume stay a question, not a pick', async () => {
  const result = await resolveProductQuery('what sizes of Sauvage do you have', 'size');
  assert.equal(result.status, 'ambiguous');
  const dior = result.candidates.filter((c) => c.brand === 'Dior' && c.name === 'Sauvage');
  assert.ok(dior.length > 1, 'expected more than one Dior Sauvage concentration among the candidates');
  // Tightest fit first, so the clarifying question leads with the products
  // the query describes rather than whatever sat first in catalogue order.
  assert.equal(result.candidates[0].name, 'Sauvage');
});

test('productWords: intent-scoped stopwords keep a real product question above the match floor', async () => {
  // Under the price stopword list alone this is ['who','sells','layton'],
  // scores 1/3 = 0.33, and falls below the 0.34 floor — no match at all for
  // a fragrance the catalogue holds.
  assert.deepEqual(productWords('who sells Layton', 'availability'), ['layton']);
  // ...and the intent's own vocabulary is the only extra thing stripped, so
  // a product genuinely called "Blue Note" survives a stock question.
  assert.deepEqual(productWords('is Blue Note in stock', 'availability'), ['blue', 'note']);
  // A bare size is part of the question, not the name.
  assert.deepEqual(productWords('is there a 30ml of Aventus', 'size'), ['aventus']);
  // ...but the price path's word list is untouched, size token included.
  assert.ok(productWords('how much is Dior Sauvage 100ml', 'price').includes('100ml'));
});

/* ── availability ──────────────────────────────────────────────────────── */

test('availability: a matched product reports stock per size, per shop, with the crawl date it is true as of', async () => {
  const result = await resolveAvailabilityQuery('who stocks One Million Elixir');
  assert.equal(result.status, 'matched');
  assert.equal(result.brand, 'Rabanne');
  const answer = formatAvailabilityAnswer(result);
  assert.match(answer, /Rabanne/);
  assert.match(answer, /\d+ml:/);
  assert.match(answer, /Stock is as of the last catalogue refresh \(\d{4}-\d{2}-\d{2}\)/);
});

test('availability: an "unknown" stock state is never reported as in stock or out of stock', async () => {
  // Scan every product in the corpus for one carrying an unknown row, then
  // check the words. `unknown` means "we could not read that shop's page",
  // which is evidence of nothing — see src/types/offer.ts.
  const { data, catalogue, priceService } = site;
  const withUnknown = data.DEMO_FRAGRANCES.find((f) =>
    priceService
      .buildComparison(catalogue.offersFor(f.id), { sortBy: 'delivered', tier: f.tier })
      .some((r) => r.stock === 'unknown'),
  );
  if (!withUnknown) return; // none in this snapshot; nothing to assert
  const result = await resolveAvailabilityQuery(`${withUnknown.brand} ${withUnknown.name}`);
  if (result.status !== 'matched') return;
  const size = result.sizes.find((s) => s.unknown.length > 0);
  if (!size) return;
  const answer = formatAvailabilityAnswer(result);
  assert.match(answer, /did not state stock/);
  for (const shop of size.unknown) {
    assert.ok(
      !new RegExp(`in stock at [^\\n]*${shop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(answer),
      `${shop} has unknown stock but is listed as in stock`,
    );
  }
});

test('availability: an unidentifiable product is refused, never answered about a guess', async () => {
  for (const q of ['is the weather nice in stock', 'who sells asdfghjkl']) {
    const result = await resolveAvailabilityQuery(q);
    assert.notEqual(result.status, 'matched');
    const answer = formatAvailabilityAnswer(result);
    assert.doesNotMatch(answer, /in stock at/, `refusal must not state stock: ${answer}`);
  }
});

/* ── notes ─────────────────────────────────────────────────────────────── */

test('notes: a product with no published notes says so plainly and names no accord', async () => {
  const { data } = site;
  const noNotes = data.DEMO_FRAGRANCES.find((f) => !f.notes && f.popularity >= 2);
  assert.ok(noNotes, 'expected at least one popular product with null notes');
  const result = await resolveNotesQuery(`what does ${noNotes.brand} ${noNotes.name} smell like`);
  if (result.status !== 'matched') return; // ambiguous name; covered by the identity tests
  if (result.hasNotes) return; // another size of the same product does carry notes
  const answer = formatNotesAnswer(result);
  assert.match(answer, /No notes are on file/);
  assert.doesNotMatch(answer, /top:|heart:|base:/);
});

test('notes: every note stated in an answer is a note the catalogue holds for that product', async () => {
  const { data } = site;
  const withNotes = data.DEMO_FRAGRANCES.filter((f) => f.notes).slice(0, 40);
  let checked = 0;
  for (const frag of withNotes) {
    const result = await resolveNotesQuery(`what are the notes in ${frag.brand} ${frag.name}`);
    if (result.status !== 'matched' || !result.hasNotes) continue;
    const answer = formatNotesAnswer(result);
    const stated = answer.slice(answer.indexOf('—') + 1).split('. These are')[0];
    const published = new Set([...result.top, ...result.middle, ...result.base].map((n) => n.toLowerCase()));
    for (const part of stated.split(';')) {
      const [, list] = part.split(':');
      if (!list) continue;
      for (const note of list.split(',').map((n) => n.trim()).filter(Boolean)) {
        assert.ok(published.has(note.toLowerCase()), `stated a note not on file: "${note}" in ${answer}`);
      }
    }
    checked++;
    if (checked >= 10) break;
  }
  assert.ok(checked > 0, 'expected at least one product with notes to be checked');
});

/* ── sizes ─────────────────────────────────────────────────────────────── */

test('sizes: a size the product is not tracked in is refused, never substituted with a size it does have', async () => {
  const result = await resolveSizeQuery('do you have the 999ml One Million Elixir');
  assert.equal(result.status, 'matched');
  assert.equal(result.askedSizeMl, 999);
  const answer = formatSizeAnswer(result);
  assert.match(answer, /not in 999ml/);
  assert.match(answer, /Sizes tracked:/);
});

test('sizes: "out of stock everywhere" and "no shop lists it" are different sentences', async () => {
  const result = await resolveSizeQuery('what sizes does Layton come in');
  if (result.status !== 'matched') return;
  const answer = formatSizeAnswer(result);
  for (const s of result.sizes) {
    if (s.best?.deliveredPriceGbp != null) continue;
    if (s.listedCount === 0) assert.match(answer, /no shop this site tracks lists it/);
    else if (s.purchasableCount === 0) assert.match(answer, /out of stock at every shop this site tracks/);
  }
});

/* ── routing: these never reach a model ────────────────────────────────── */

/**
 * `config.models` is empty, so any attempt to call an agent would fail the
 * council outright with `no_agents_responded`. Reaching an ok:true
 * site-data-direct answer is therefore proof that zero model calls were
 * made — the same trick test/priceLookup.test.js already uses for the price
 * path, applied to the intents added alongside it.
 */
test('runCouncil: availability, notes and size questions are answered from site data with no model call at all', async () => {
  const emptyModels = { baseUrl: 'https://unused.invalid', apiKey: 'unused', models: [] };
  const cases = [
    ['who stocks One Million Elixir', 'availability'],
    ['what does One Million Elixir smell like', 'notes'],
    ['what sizes of One Million Elixir do you have', 'size'],
  ];
  for (const [question, intent] of cases) {
    const result = await runCouncil({ question, intent, config: emptyModels, onEvent: () => {} });
    assert.equal(result.ok, true, `${intent} did not answer: ${JSON.stringify(result)}`);
    assert.equal(result.source, 'site-data-direct');
    assert.match(result.winner.content, /Rabanne/, `${intent}: ${result.winner.content}`);
    // The original defect, restated per intent: never deny the product's
    // existence while quoting it. (A notes answer may well say no *notes*
    // are on file — that is a true statement about a null field, not a
    // denial of the fragrance, and it is the honest answer for the 6,893 of
    // 10,321 catalogue entries that carry none.)
    assert.doesNotMatch(
      result.winner.content,
      /don'?t have a fragrance|no fragrance matching|can'?t find (it|that) in the (current )?catalogue/i,
      `${intent}: ${result.winner.content}`,
    );
  }
});

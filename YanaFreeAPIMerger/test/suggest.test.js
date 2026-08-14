import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestContextFor, extractNotes } from '../server/siteData.js';

/**
 * Part 2's "clean up the format" finding: a note-based suggestion could list
 * the same product twice under two different, seemingly arbitrary note
 * lists, because the old dedup keyed on catalogue row id (one id per bottle
 * size) rather than on the product itself — different sizes of the same
 * perfume are separate rows and sometimes carry different, partially
 * overlapping note data harvested from different retailers' pages. Pinned
 * against the live catalogue's own Tom Ford Black Orchid Eau de Parfum,
 * whose 30ml and 100ml rows carry non-identical note sets (checked directly:
 * {Patchouli, Amber, Sandalwood} vs {Patchouli, Sandalwood, Balsam, Dark
 * Chocolate, Incense, Amber, Vanilla}) — exactly the shape that used to
 * render as two "different" recommendations for the same bottle.
 */
test('suggestContextFor: the same product across sizes is one candidate, not a duplicate with two different note lists', async () => {
  const block = await suggestContextFor('amber');
  const brandNameOccurrences = block.match(/Tom Ford Black Orchid \(Eau de Parfum\)/g) ?? [];
  assert.equal(
    brandNameOccurrences.length,
    1,
    `expected Tom Ford Black Orchid to appear once, got:\n${block}`,
  );
  // Every note actually published for either size is still present — merging
  // must not silently drop information from the size that lost the dedup.
  assert.match(block, /Vanilla/, 'a note only published on the 100ml row must survive the merge');
  assert.match(block, /Amber/, 'a note published on both rows must survive the merge');
});

test('suggestContextFor: never lists the same product name twice, for any note query — a general invariant, not pinned to one brand staying in the live catalogue\'s current top 5', async () => {
  for (const question of ['amber', 'vanilla', 'oud', 'rose, no musk', 'citrus and bergamot']) {
    const block = await suggestContextFor(question);
    const productLines = block
      .split('\n')
      .filter((l) => l.includes(' — notes on file:'))
      .map((l) => l.split(' — notes on file:')[0]);
    const uniqueNames = new Set(productLines);
    assert.equal(
      uniqueNames.size,
      productLines.length,
      `duplicate product line(s) for "${question}":\n${block}`,
    );
  }
});

test('suggestContextFor: an empty question requests no notes and is reported plainly, not silently empty', async () => {
  const block = await suggestContextFor('');
  assert.match(block, /^NOTE MATCHED CANDIDATES: none requested/);
});

test('suggestContextFor: an "no <note>" exclusion is honoured', async () => {
  const block = await suggestContextFor('vanilla, no amber');
  const noteLines = block.split('\n').filter((l) => l.includes('notes on file:'));
  assert.ok(noteLines.length > 0, 'expected at least one candidate line');
  for (const line of noteLines) {
    assert.doesNotMatch(line, /\bAmber\b/i, `an excluded note must not appear in a candidate's own notes: ${line}`);
  }
});

/* ── reading notes out of a real sentence ──────────────────────────────── */

/**
 * The original parser split the question on commas and " and " and treated
 * every fragment as a note name, which `fragrancesWithNote` then matched
 * exactly. Against a real sentence that drops most of the request on the
 * floor: "suggest something with vanilla and amber" yields the fragment
 * "suggest something with vanilla", which matches no note at all. The
 * council was then grounded with half a request, or none — and a model given
 * nothing to work from is the situation that produced this project's
 * original invented-answer bug.
 */
test('extractNotes: reads the catalogue\'s own note names out of a natural sentence', async () => {
  assert.deepEqual(
    (await extractNotes('suggest something with vanilla and amber')).sort(),
    ['Amber', 'Vanilla'],
  );
  // Longest match first, so a two-word note is not consumed as its shorter
  // half with a stray adjective left behind.
  assert.ok((await extractNotes('anything with dark chocolate')).includes('Dark Chocolate'));
  // Nothing is read out of a sentence naming no note.
  assert.deepEqual(await extractNotes('what should i wear to a wedding'), []);
});

test('extractNotes: a season is listing metadata, not a note request', async () => {
  // Some feeds put a season in the notes field — measured, Versace Pour
  // Homme Dylan Blue's stored notes read "Summer, Autumn, Summer, Autumn".
  // Read as a note, "recommend me a summer fragrance" grounds the council
  // with products sharing a season tag, which looks like an answer about
  // weather and is not one.
  assert.deepEqual(await extractNotes('recommend me a summer fragrance'), []);
  assert.deepEqual(await extractNotes('something for winter'), []);
});

test('suggestContextFor: a multi-note request leads with the products matching most of it', async () => {
  const block = await suggestContextFor('something with vanilla, amber and sandalwood');
  const shares = block
    .split('\n')
    .filter((l) => l.includes(' — shares: '))
    .map((l) => l.split(' — shares: ')[1].split(' — notes on file')[0].split(', ').length);
  assert.ok(shares.length > 0, `expected candidates:\n${block}`);
  for (let i = 1; i < shares.length; i++) {
    assert.ok(shares[i] <= shares[i - 1], `candidates are not ordered by how much of the request they match:\n${block}`);
  }
});

/* ── "what smells like X" ──────────────────────────────────────────────── */

test('suggestContextFor: a reference fragrance is looked up, and its notes — not the words of its name — drive the match', async () => {
  const block = await suggestContextFor('any dupes for Tom Ford Black Orchid');
  // The regression: "Orchid" is a word in the product's *title*, and reading
  // it as a requested note grounded the council with five unrelated florals
  // that happen to list orchid. The words used to identify a bottle are not
  // a description of what the reader wants it to smell like.
  assert.match(block, /REFERENCE FRAGRANCE: Tom Ford Black Orchid/);
  const requested = block.match(/requested: ([^)]+)\)/)?.[1] ?? '';
  const referenceNotes = block.match(/its own notes on file: ([^.]+)\./)?.[1] ?? '';
  assert.deepEqual(requested.split(', ').sort(), referenceNotes.split(', ').sort());
});

test('suggestContextFor: the reference fragrance is never recommended back, in any concentration', async () => {
  const block = await suggestContextFor('any dupes for Tom Ford Black Orchid');
  const candidateNames = block
    .split('\n')
    .filter((l) => l.includes(' — shares: '))
    .map((l) => l.split(' (')[0]);
  for (const name of candidateNames) {
    assert.notEqual(name, 'Tom Ford Black Orchid', `recommended the reference back:\n${block}`);
  }
});

test('suggestContextFor: an unresolvable reference says so rather than matching on whatever words it contained', async () => {
  const block = await suggestContextFor('what smells similar to asdfghjkl qwertyuiop');
  assert.match(block, /NOTE MATCHED CANDIDATES: none requested/);
  assert.match(block, /does not resolve to a single product/);
});

test('suggestContextFor: a reference with no published notes says exactly that, and invents none', async () => {
  const block = await suggestContextFor('something like Aventus');
  if (!/no published notes/.test(block)) return; // this snapshot has notes for it
  assert.match(block, /Creed Aventus/);
  assert.doesNotMatch(block, / — shares: /);
});

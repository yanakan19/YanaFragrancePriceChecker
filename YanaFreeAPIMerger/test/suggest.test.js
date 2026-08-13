import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestContextFor } from '../server/siteData.js';

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

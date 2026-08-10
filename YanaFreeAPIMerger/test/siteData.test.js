import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFragranceMatch, parseNoteRequest } from '../server/siteData.js';

// Synthetic fixtures, not live catalogue data: findFragranceMatch is a pure
// matching algorithm, and pinning the test to whatever the live harvest
// currently holds would make it flaky against the exact thing it has
// nothing to do with — the catalogue's own contents changing hour to hour.
const FRAGRANCES = [
  { id: 'f1', brand: 'Dior', name: 'Sauvage', concentration: 'Eau de Toilette' },
  { id: 'f2', brand: 'Dior', name: 'Sauvage', concentration: 'Eau de Parfum' },
  { id: 'f3', brand: 'Chanel', name: 'Bleu de Chanel', concentration: 'Eau de Parfum' },
];

test('findFragranceMatch: a natural question full of filler words still matches on the real content words', () => {
  const match = findFragranceMatch('how much is Sauvage EDT please', FRAGRANCES);
  assert.ok(match, 'expected a match');
  assert.equal(match.fragrance.id, 'f1');
});

test('findFragranceMatch: EDT/EDP abbreviations disambiguate between two concentrations of the same name', () => {
  const edt = findFragranceMatch('sauvage edt', FRAGRANCES);
  const edp = findFragranceMatch('sauvage edp', FRAGRANCES);
  assert.equal(edt.fragrance.id, 'f1');
  assert.equal(edp.fragrance.id, 'f2');
});

test('findFragranceMatch: a bare brand and name still matches, the original mock format', () => {
  const match = findFragranceMatch('Bleu de Chanel', FRAGRANCES);
  assert.equal(match.fragrance.id, 'f3');
});

test('findFragranceMatch: returns null rather than a weak guess when nothing is close', () => {
  assert.equal(findFragranceMatch('Zzyzxqq Nonexistent Perfume', FRAGRANCES), null);
});

test('findFragranceMatch: returns null for an empty or all-filler query rather than the first fragrance', () => {
  assert.equal(findFragranceMatch('how much is it', FRAGRANCES), null);
});

test('parseNoteRequest: splits wanted from unwanted', () => {
  assert.deepEqual(parseNoteRequest('vanilla, oud, no florals'), { wanted: ['vanilla', 'oud'], unwanted: ['florals'] });
});

test('parseNoteRequest: no exclusions is fine', () => {
  assert.deepEqual(parseNoteRequest('vanilla and amber'), { wanted: ['vanilla', 'amber'], unwanted: [] });
});

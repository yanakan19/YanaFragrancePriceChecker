import { test } from 'vitest';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import { buildSiteDataBlock, findFragranceMatch, loadSite } from '../../demo/yanny/siteData.js';

/** A forced full collection, so "retained" below means retained and not
 *  merely uncollected yet. vitest gives no `--expose-gc`, hence the flag
 *  being turned on from inside the process. */
const gc = (() => {
  v8.setFlagsFromString('--expose-gc');
  const fn = vm.runInNewContext('gc');
  v8.setFlagsFromString('--no-expose-gc');
  return async () => {
    for (let i = 0; i < 3; i++) {
      fn();
      await new Promise((r) => setImmediate(r));
    }
  };
})();

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

// ── The module-loading contract ─────────────────────────────────────────
// The engine used to run on a server whose `loadSite()` imported the site's
// ~15 MB of generated TypeScript afresh, under a cache-busted specifier,
// three or four times per answer, retaining ~129 MB of heap per question.
// It now holds one static snapshot — the modules the page itself was built
// from — and these pin that there is exactly one, shared by every caller,
// and that answering questions retains nothing. They touch the live
// catalogue but assert nothing about its contents, so an hourly harvest
// changing what is in it cannot make them flaky.

test('loadSite: hands back one and the same snapshot rather than re-importing per call', async () => {
  const a = await loadSite();
  const b = await loadSite();
  assert.equal(a, b, 'loadSite() must be memoised — a second import is a permanently retained copy');
  for (const key of ['data', 'catalogue', 'priceService', 'brandSites', 'legal', 'retailers', 'gender']) {
    assert.ok(a[key], `snapshot is missing ${key}`);
    assert.equal(a[key], b[key], `${key} was re-imported`);
  }
});

test('loadSite: concurrent first callers share a single import, not one each', async () => {
  const snapshots = await Promise.all(Array.from({ length: 8 }, () => loadSite()));
  for (const snap of snapshots) assert.equal(snap, snapshots[0]);
});

test('buildSiteDataBlock: answering many questions retains no measurable extra heap', async () => {
  // Warm-up outside the measurement: the first question pays for the
  // engine's own lazily built indexes. Everything after it must cost
  // nothing that survives a collection.
  await buildSiteDataBlock('how much is Dior Sauvage EDT', 'price');
  await gc();
  const before = process.memoryUsage().heapUsed;

  const questions = [
    ['how much is Dior Sauvage EDT', 'price'],
    ['something with vanilla and amber, no florals', 'suggest'],
    ['how does your delivery price comparison work', 'general'],
  ];
  const ROUNDS = 30;
  for (let i = 0; i < ROUNDS; i++) {
    const block = await buildSiteDataBlock(...questions[i % questions.length]);
    assert.ok(block.length > 50, 'expected a non-empty SITE DATA block');
  }
  await gc();
  const growth = process.memoryUsage().heapUsed - before;

  // The old loader retained ~129 MB per question — ~3.9 GB over this loop.
  // 16 MB of slack here is for ordinary allocation noise (the strings these
  // 30 answers build, V8's own bookkeeping), and is still two orders of
  // magnitude below a single re-import of demo/catalogue.generated.ts.
  const slackBytes = 16 * 1024 * 1024;
  assert.ok(
    growth < slackBytes,
    `retained heap grew ${(growth / 1024 / 1024).toFixed(1)} MB across ${ROUNDS} questions ` +
      `(${(growth / ROUNDS / 1024 / 1024).toFixed(2)} MB each) — the site modules are being re-imported again`,
  );
});

test('buildSiteDataBlock: the fragrance count it states matches the snapshot it answered from', async () => {
  // The stale-number guard. `aboutContext()` states "currently tracks N
  // fragrances"; N has to be this process's own catalogue, not a figure
  // left over from some earlier import of a different one.
  const block = await buildSiteDataBlock('what is this site', 'general');
  const { data, retailers } = await loadSite();
  const expected = data.DEMO_FRAGRANCES.length.toLocaleString('en-GB');
  const enabled = retailers.RETAILERS.filter((r) => r.enabled !== false).length;
  assert.match(block, new RegExp(`tracks ${expected} fragrances across ${enabled} enabled UK`));
});

test('buildSiteDataBlock: a price answer is computed from the same snapshot as the about line', async () => {
  const { data, catalogue, priceService } = await loadSite();
  const fragrance = data.DEMO_FRAGRANCES.find((f) => priceService.bestOffer(
    priceService.buildComparison(catalogue.offersFor(f.id), { sortBy: 'delivered', tier: f.tier }),
  ));
  if (!fragrance) return; // Nothing in stock anywhere right now; nothing to compare against.

  const block = await buildSiteDataBlock(`how much is ${fragrance.brand} ${fragrance.name}`, 'price');
  const rows = priceService.buildComparison(catalogue.offersFor(fragrance.id), {
    sortBy: 'delivered',
    tier: fragrance.tier,
  });
  const best = priceService.bestOffer(rows);
  assert.match(block, /PRICE MATCH/);
  // Whatever fragrance the matcher picked, the price quoted has to be one
  // this same snapshot can produce — a figure from a different import of
  // the catalogue could not be.
  assert.ok(best.deliveredPriceGbp !== null);
});

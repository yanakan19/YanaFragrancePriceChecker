import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import v8 from 'node:v8';
import vm from 'node:vm';
import {
  buildSiteDataBlock,
  changedSince,
  findFragranceMatch,
  loadSite,
  parseNoteRequest,
  siteDataFreshness,
} from '../server/siteData.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** A forced full collection, so "retained" below means retained and not
 *  merely uncollected yet. `node --test` gives no `--expose-gc`, hence the
 *  flag being turned on from inside the process. */
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

test('parseNoteRequest: splits wanted from unwanted', () => {
  assert.deepEqual(parseNoteRequest('vanilla, oud, no florals'), { wanted: ['vanilla', 'oud'], unwanted: ['florals'] });
});

test('parseNoteRequest: no exclusions is fine', () => {
  assert.deepEqual(parseNoteRequest('vanilla and amber'), { wanted: ['vanilla', 'amber'], unwanted: [] });
});

// ── The module-loading contract ─────────────────────────────────────────
// These are the tests for the thing that used to make this process grow by
// ~129 MB of permanently retained heap per question: `loadSite()` importing
// the site's ~15 MB of generated TypeScript afresh, under a cache-busted
// specifier, three or four times per answer. Unlike the matching tests
// above these do touch the live catalogue, because the property under test
// is exactly "how many times does this process read the real thing" — but
// none of them assert anything about its contents, so an hourly harvest
// changing what is in it cannot make them flaky.

test('loadSite: hands back one and the same snapshot rather than re-importing per call', async () => {
  const a = await loadSite();
  const b = await loadSite();
  assert.equal(a, b, 'loadSite() must be memoised — a second import is a permanently retained copy');
  for (const key of ['data', 'catalogue', 'priceService', 'index', 'brandSites', 'legal', 'retailers']) {
    assert.ok(a[key], `snapshot is missing ${key}`);
    assert.equal(a[key], b[key], `${key} was re-imported`);
  }
});

test('loadSite: concurrent first callers share a single import, not one each', async () => {
  const snapshots = await Promise.all(Array.from({ length: 8 }, () => loadSite()));
  for (const snap of snapshots) assert.equal(snap, snapshots[0]);
});

test('buildSiteDataBlock: answering many questions retains no measurable extra heap', async () => {
  // Warm-up outside the measurement: the first question legitimately pays
  // for the one-time import of the site modules. Everything after it must
  // cost nothing that survives a collection.
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

test('siteDataFreshness: reports the snapshot it loaded, and no staleness on an unchanged tree', async () => {
  await loadSite();
  const fresh = await siteDataFreshness();
  assert.equal(fresh.loaded, true);
  assert.ok(Date.parse(fresh.loadedAt) > 0, 'loadedAt should be an ISO timestamp');
  assert.equal(typeof fresh.catalogueCrawledAt, 'string');
  assert.deepEqual(fresh.changedFiles, [], 'nothing should have changed under a test run');
  assert.equal(fresh.stale, false);
});

test('changedSince: a rewritten, added or removed watched file all read as changed', () => {
  const before = new Map([['demo/catalogue.generated.ts', '1:100'], ['demo/legal.ts', '2:200']]);
  assert.deepEqual(changedSince(before, before), []);
  assert.deepEqual(
    changedSince(before, new Map([['demo/catalogue.generated.ts', '9:900'], ['demo/legal.ts', '2:200']])),
    ['demo/catalogue.generated.ts'],
  );
  assert.deepEqual(
    changedSince(before, new Map([...before, ['demo/deals.generated.ts', '3:300']])),
    ['demo/deals.generated.ts'],
  );
  assert.deepEqual(
    changedSince(before, new Map([['demo/legal.ts', '2:200']])),
    ['demo/catalogue.generated.ts'],
  );
});

test('the loader cannot refresh a module graph in place — which is why loadSite() does not try', async () => {
  // This pins the resolver behaviour that server/siteData.js's header gives
  // as its reason for loading once and reporting staleness rather than
  // reloading: a `?t=` query is honoured on the specifier you hand to
  // `import()`, but it is dropped by relative resolution *inside* the module
  // that specifier loaded, so the graph below the entry point stays pinned
  // to whatever was first imported. If a future Node or tsx ever changes
  // that, this test fails and the comment needs rewriting.
  const dir = path.join(here, `.tmp-loader-fixture-${process.pid}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(path.join(dir, 'dep.ts'), 'export const V = 1;\n');
    await fs.writeFile(path.join(dir, 'entry.ts'), "export { V } from './dep.js';\n");
    const entry = pathToFileURL(path.join(dir, 'entry.js')).href;
    const dep = pathToFileURL(path.join(dir, 'dep.js')).href;

    const first = await import(`${entry}?t=1`);
    assert.equal(first.V, 1);

    await new Promise((r) => setTimeout(r, 1100)); // outside mtime granularity
    await fs.writeFile(path.join(dir, 'dep.ts'), 'export const V = 2;\n');

    const directAgain = await import(`${dep}?t=2`);
    assert.equal(directAgain.V, 2, 'a directly cache-busted entry does re-read from disk');

    const entryAgain = await import(`${entry}?t=2`);
    assert.equal(
      entryAgain.V,
      1,
      'the transitive dependency stayed pinned to its first import — a reloaded snapshot would be half fresh and half stale',
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

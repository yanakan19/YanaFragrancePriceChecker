import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeDemoInputsHash, readStampedHash } from '../scripts/demoInputsHash.js';
import { checkDataPairing, dataFileContents, readDataFile, readPageDataVersion } from '../scripts/demoDataFile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Guards against exactly what shipped twice on 2026-08-26: a commit that
 * edits `demo/app.ts` (or `demo/template.html`, or anything else
 * `scripts/build-demo.ts` bundles) without also running `npm run demo`
 * afterwards. `demo/index.html` and `demo/404.html` are not source — they
 * are *that source, already built* — and until this test existed,
 * nothing compared the two. Both incidents shipped with a fully green
 * `npm test`, because green only meant "the source behaves correctly", never
 * "the built page matches the source".
 *
 * The mechanism (full reasoning in scripts/demoInputsHash.ts): every real
 * `npm run demo` stamps a sha256 of its own inputs into the document it
 * writes. This test recomputes that same hash from the source tree as it
 * stands right now and fails if the two disagree — which is precisely what
 * "the page was not rebuilt after its inputs changed" looks like.
 *
 * This runs inside the ordinary, non-watch `npx vitest run` — the pre-commit
 * gate this repository already requires — rather than a separate CI step,
 * because both real incidents were local commits pushed straight past that
 * gate; a check that only fired in CI would have caught them one crawl cycle
 * later than the gate already sitting in front of every commit. It stays
 * cheap enough to belong there because it only reads and hashes the ~100
 * small input files (milliseconds), never re-running the ~1-2 minute
 * `tsc` + `esbuild` build itself.
 */
describe('demo build freshness', () => {
  it('demo/index.html was rebuilt after its most recent source change', () => {
    const built = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
    const stamped = readStampedHash(built);
    expect(
      stamped,
      'demo/index.html has no demo-build-hash stamp at all. That means it predates this check, ' +
        'or was hand-edited. Run `npm run demo` and commit the result.',
    ).not.toBeNull();

    const current = computeDemoInputsHash(root);
    expect(
      stamped,
      `demo/index.html is stale: it was built from a different set of source files than what is ` +
        `on disk right now (expected sha256:${current.hash}, found sha256:${stamped}). This is the ` +
        `2026-08-26 failure mode — demo/app.ts, demo/template.html, or another file ` +
        `tsconfig.demo.json bundles changed since the last real build. Run \`npm run demo\` and ` +
        `commit demo/index.html and demo/404.html alongside your source change.`,
    ).toBe(current.hash);
  });

  it('does not fingerprint the file this very test run rewrites', () => {
    // demo/testCount.generated.ts is written by scripts/testCountReporter.ts
    // at the end of the run that this test is part of. Hashing it made the
    // verdict depend on whether the reporter or this test ran first, and
    // failed run #397 on the runner for a page that had passed locally. See
    // HASH_EXCLUDED_INPUTS in scripts/demoInputsHash.ts.
    const { files } = computeDemoInputsHash(root);
    expect(files).not.toContain('demo/testCount.generated.ts');
    // The exclusion is exactly that one file: everything else the bundle
    // reads, including the other generated inputs, is still covered.
    expect(files).toContain('demo/catalogue.generated.ts');
    expect(files).toContain('demo/priceHistory.generated.ts');
    expect(files).toContain('demo/template.html');
  });

  it('demo/data.json is the data demo/index.html was built with', () => {
    // The page reads its catalogue from demo/data.json by position, so the
    // two are only ever right as a pair from one build: a commit carrying a
    // new page with yesterday's data (or the other way round) publishes a
    // site that refuses to start. The version the page asks for has to be the
    // version the file says it is, and the file has to hash to that version.
    // See scripts/demoDataFile.ts.
    const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
    expect(
      readPageDataVersion(html),
      'demo/index.html does not load demo/data.json. Run `npm run demo` and commit the result.',
    ).not.toBeNull();
    expect(checkDataPairing(root)).toBeNull();
  });

  it('demo/404.html is byte-identical to demo/index.html', () => {
    // build-demo.ts writes the same standalone document to both paths on
    // purpose (see its own header: GitHub Pages serves 404.html for every
    // in-app route, and there must be no difference for a deep link to hit).
    // A stray hand-edit of only one of the two would defeat that, quietly.
    const index = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
    const notFound = readFileSync(resolve(root, 'demo/404.html'), 'utf8');
    expect(notFound).toBe(index);
  });
});

describe('demo/data.json pairing', () => {
  const blobs = JSON.stringify([[{ id: 'a', price: 1 }], { b: '<\\/script>' }]);

  it('accepts a file that hashes to the version it claims', () => {
    const data = readDataFile(dataFileContents(blobs));
    expect(data).not.toBeNull();
    expect(data!.intact).toBe(true);
    expect(JSON.parse(dataFileContents(blobs)).d).toEqual(JSON.parse(blobs));
  });

  it('catches a file whose contents changed under its version', () => {
    const tampered = dataFileContents(blobs).replace('"price":1', '"price":2');
    expect(readDataFile(tampered)!.intact).toBe(false);
  });

  it('reads the version a page asks for', () => {
    expect(readPageDataVersion('var u="data.json?v=0123456789abcdef",v=u.slice(-16)')).toBe('0123456789abcdef');
    expect(readPageDataVersion('<script type="application/json" id="ps-data">[]</script>')).toBeNull();
  });
});

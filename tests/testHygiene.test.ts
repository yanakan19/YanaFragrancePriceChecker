// Rules for the tests themselves, from the failed runs review of 2026-10-06
// (docs/FAILED-RUNS-ANALYSIS.md, class A and the tests failing on the tip).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const TESTS = join(REPO_ROOT, 'tests');
const files = readdirSync(TESTS, { recursive: true, encoding: 'utf8' }).filter((f) => /\.test\.[jt]s$/.test(f));

describe('test hygiene', () => {
  // A page test needs a browser to load the built page; 5 s (vitest's
  // default) timed out with nothing wrong on 2026-10-06.
  it('gives every test time to load a page in a browser, and still ends a hang', () => {
    const t = config.test!;
    expect(t.testTimeout).toBeGreaterThanOrEqual(30_000);
    expect(t.testTimeout).toBeLessThanOrEqual(120_000);
    expect(t.hookTimeout).toBeGreaterThanOrEqual(60_000);
  });

  // #507 to #548: duplicateOfferRows pinned a shop's price for one bottle
  // (139.99, then 150.64) and failed the crawl every time the shop repriced.
  // A test that reads the data the crawl writes checks a rule, never a price.
  it('pins no price in a test that reads the data the crawl writes', () => {
    let checked = 0;
    for (const f of files) {
      const src = readFileSync(join(TESTS, f), 'utf8');
      if (!/from '[^']*\.generated(\.js)?'/.test(src)) continue;
      checked++;
      const pinned = src.split('\n').filter((l) => /\.(toBe|toEqual|toStrictEqual)\(\s*\[?\s*\d+\.\d\d\b/.test(l));
      expect(pinned, f).toEqual([]);
    }
    expect(checked).toBeGreaterThan(10);
  });
});

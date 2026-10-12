// Rules for the tests themselves, from the failed runs review of 2026-10-06
// (docs/FAILED-RUNS-ANALYSIS.md, class A and the tests failing on the tip).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { codeOf } from '../scripts/testSets.js';

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

  // The Safari layout check was blind for three days (9 to 11 October 2026,
  // docs/PIPELINE-FAILURE-MODES.md row 48): a test launched WebKit bare, so
  // it started as a visitor with no country chosen and the "Select your
  // country" pop up covered its first page. Every test browser starts through
  // the shared helpers in scripts/a11y-audit.ts, which choose the country.
  it('launches every test browser through launchChromium or launchWebkit, never bare', () => {
    let checked = 0;
    for (const f of files) {
      const src = codeOf(readFileSync(join(TESTS, f), 'utf8'));
      if (!/playwright/.test(src)) continue;
      checked++;
      expect(src, `${f} launches a browser directly; use launchChromium or launchWebkit from scripts/a11y-audit.ts`).not.toMatch(/\b(chromium|webkit|firefox)\.launch\(/);
    }
    expect(checked).toBeGreaterThan(5);
  });
});

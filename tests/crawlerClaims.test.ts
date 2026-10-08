import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ABOUT, LEGAL_PAGES } from '../demo/legal.js';
import { blocksText } from '../demo/contentPages.js';
import { GUIDE_BODIES } from '../demo/content/guideBodies.js';
import { METHOD_BODY } from '../demo/content/methodBody.js';
import { rrpSaving } from '../demo/msrpComparison.js';
import { RETAILERS } from '../src/config/retailers.js';
import { NOT_A_FRAGRANCE } from '../src/catalogue/fragranceId.js';

/**
 * Four claims about the crawler and the prices that were once wrong on the
 * bot page (/about/bot), the Legal Notice's How it works and the price
 * checking page, and are pinned here so no page can say them again:
 *
 *   1. how far apart the requests are: the harvest waits the longest of the
 *      shop's minRequestGapMs (1500 where unset) and its robots.txt
 *      Crawl-delay, so what holds for every shop is "at least a second"
 *      (the quickest shops are read every 1.2 seconds), never 1.5 seconds;
 *   2. who works out the percentage saving: this site does, from the shop's
 *      previous price and the price on the row, rounded down;
 *   3. a listing whose title says Tester is left out, not kept as a product;
 *   4. the commission is not "small".
 *
 * The delay is read from the registry and the scripts, not typed here, so a
 * change to the code that makes a page untrue fails this file.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** The pages' words with tags and template holes gone, on one line. */
const plain = (html: string): string =>
  html.replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, ' ').trim();

/** The bot page's words: the template of botPageView in demo/app.ts. */
function botPageText(): string {
  const app = read('demo/app.ts');
  const start = app.indexOf('function botPageView(): string {');
  expect(start, 'botPageView is in demo/app.ts').toBeGreaterThan(-1);
  const end = app.indexOf('\n}\n', start);
  expect(end).toBeGreaterThan(start);
  return plain(app.slice(start, end));
}

/** Every page that talks about how the crawler or the prices work, by name. */
function surfaces(): Record<string, string> {
  const legal = (id: string): string => plain(LEGAL_PAGES.find((p) => p.id === id)?.body ?? '');
  return {
    'the bot page': botPageText(),
    'How we check prices': plain(blocksText(METHOD_BODY)),
    'Legal Notice, How it works': legal('how-it-works'),
    'Legal Notice, Affiliate Disclosure': legal('affiliate'),
    'About page cards': plain(ABOUT.how.map((c) => `${c.title}. ${c.body}`).join(' ')),
    'Guide, decants and testers': plain(blocksText(GUIDE_BODIES['decants-and-testers']!)),
  };
}

/** The gap the page promises, in seconds: "at least a second apart" is 1. */
function statedGapSeconds(text: string): number | null {
  const m = /at least (a|one|\d+(?:\.\d+)?) seconds?(?: apart| between)/i.exec(text);
  if (!m) return null;
  return m[1] === 'a' || m[1]!.toLowerCase() === 'one' ? 1 : Number(m[1]);
}

describe('how far apart the crawler keeps its requests', () => {
  // The three places the code sets a floor, read out of the code itself.
  const harvestDefaultMs = Number(/minRequestGapMs \?\? (\d+)/.exec(read('scripts/catalogue-harvest.ts'))?.[1]);
  const priceCheckFloorMs = Number(/const GAP_FLOOR_MS = (\d+);/.exec(read('scripts/price-verify.ts'))?.[1]);
  const registryGapsMs = RETAILERS.filter((r) => r.catalogue).map((r) => r.catalogue!.minRequestGapMs);
  const floorMs = Math.min(harvestDefaultMs, priceCheckFloorMs, ...registryGapsMs);

  it('reads its figures out of the code', () => {
    expect(harvestDefaultMs, 'the harvest default gap').toBeGreaterThan(0);
    expect(priceCheckFloorMs, 'the price check gap floor').toBeGreaterThan(0);
    expect(registryGapsMs.length, 'shops with a gap in the registry').toBeGreaterThan(10);
  });

  it('keeps at least a second between requests at every shop, so "at least a second" is true', () => {
    expect(floorMs, `the quickest gap in the code is ${floorMs}ms`).toBeGreaterThanOrEqual(1000);
  });

  it('waits for a robots.txt Crawl-delay too, as the pages say', () => {
    expect(read('scripts/catalogue-harvest.ts')).toMatch(/\(robots\.crawlDelaySeconds \?\? 0\) \* 1000/);
    expect(read('scripts/price-verify.ts')).toMatch(/\(robots\.crawlDelaySeconds \?\? 0\) \* 1000/);
  });

  it('has the bot page and the price checking page promise no more than the quickest gap', () => {
    const all = surfaces();
    for (const name of ['the bot page', 'How we check prices']) {
      const seconds = statedGapSeconds(all[name]!);
      expect(seconds, `${name} says how far apart the requests are`).not.toBeNull();
      expect(seconds!, `${name} says ${seconds}s, the quickest shop is read every ${floorMs / 1000}s`).toBeLessThanOrEqual(floorMs / 1000);
      expect(seconds, `${name} says "at least a second"`).toBe(1);
    }
  });

  it('never says 1.5 seconds on any page', () => {
    for (const [name, text] of Object.entries(surfaces())) {
      expect(text, name).not.toMatch(/1\.5 seconds|1\.5s\b|one and a half seconds/i);
    }
  });
});

describe('who works out a percentage saving', () => {
  it('is this site: it restates the shop’s previous price against the price shown, rounded down', () => {
    // rrpSavingFor (demo/msrpComparison.ts) is what puts "26% off RRP" on a row.
    expect(rrpSaving(80, 100)?.percentOff).toBe(20);
    expect(rrpSaving(80.4, 100)?.percentOff, '19.6 per cent shows as 19').toBe(19);
    expect(rrpSaving(99.5, 100), 'under one whole percent states no saving').toBeNull();
  });

  it('is said on the pages that explain reductions', () => {
    const all = surfaces();
    for (const name of ['Legal Notice, How it works', 'How we check prices']) {
      const text = all[name]!;
      expect(text, name).toMatch(/previous price[^.]*shop's own figure/);
      expect(text, name).toMatch(/percentage[^.]*worked out/);
      expect(text, name).toMatch(/round(s|ed)? down/);
      expect(text, name).not.toMatch(/percentage saving are the shop|never work one out|percentages? (is|are) (the shop's|set by the shop)/i);
    }
    expect(all['Legal Notice, How it works']).toMatch(/19\.6 per cent shows as 19 per cent, never 20/);
  });
});

describe('Tester listings', () => {
  it('are dropped by the catalogue, as the pages say', () => {
    expect(NOT_A_FRAGRANCE.test('Dior Sauvage Eau de Toilette 100ml Tester')).toBe(true);
    expect(NOT_A_FRAGRANCE.test('Dior Sauvage Eau de Toilette 100ml')).toBe(false);
  });

  it('are described on the pages as left out, never as kept or listed apart', () => {
    const all = surfaces();
    expect(all['How we check prices']).toMatch(/title says Tester is left out/);
    expect(all['Guide, decants and testers']).toMatch(/title says Tester is left out/);
    for (const [name, text] of Object.entries(all)) {
      expect(text, name).not.toMatch(/testers? (is|are|stays?|remains?) (kept|listed|shown|on the site|as its own)/i);
      expect(text, name).not.toMatch(/Tester or Unboxed in its name stays/);
    }
  });
});

describe('the commission', () => {
  it('is never called small anywhere a visitor reads', () => {
    for (const [name, text] of Object.entries(surfaces())) expect(text, name).not.toMatch(/small commission/i);
    const dir = resolve(root, 'demo');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
      (f) => /\.(ts|html)$/.test(f) && !/\.generated\.ts$/.test(f) && !/(^|\/)(index|404)\.html$/.test(f),
    );
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(read(`demo/${f}`), `demo/${f}`).not.toMatch(/small commission/i);
  });
});

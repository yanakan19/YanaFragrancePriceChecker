import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transformSync } from 'esbuild';
import type { Browser } from 'playwright';
import { auditRoute, launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * Owner request, 6 Oct 2026: a brand with no logo shows a square initials
 * tile wherever a brand logo box is shown (the brand page hero and every row
 * of Explore Brands), and a brand with a logo still shows the logo.
 */
function lift(re: RegExp, what: string): string {
  const hit = app.match(re)?.[0];
  if (!hit) throw new Error(`could not find ${what} in demo/app.ts`);
  return hit;
}
const js = transformSync(
  [lift(/function initialsOf\([\s\S]*?\n}\n/, 'initialsOf'), 'return { initialsOf };'].join('\n'),
  { loader: 'ts' },
).code;
const { initialsOf } = new Function(js)() as { initialsOf: (n: string) => string };

describe('brand initials', () => {
  it.each([
    ['Sol de Janeiro', 'SJ'],
    ['The Different Company', 'DC'],
    ['Maison Margiela', 'M'],
    ['Parfums de Marly', 'M'],
    ['Dolce & Gabbana', 'DG'],
    ['Étienne Aigner', 'EA'],
    ['Éric Buffet Parfums', 'EB'],
    ['Tom Ford', 'TF'],
    ['4711', '4'],
    ['Maison', 'M'],
  ])('%s gives %s', (name, want) => {
    expect(initialsOf(name)).toBe(want);
  });
});

describe.skipIf(!built)('brand logo boxes', () => {
  // A fresh browser per test: a 1,000 row page is heavy, and one renderer
  // crash on a busy machine must not take the rest of the file with it.
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
  }, 60_000);

  beforeEach(async () => {
    browser = await launchChromium();
  }, 60_000);

  afterEach(async () => {
    await browser?.close();
  });

  afterAll(() => {
    close();
  });

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`Explore Brands at ${width}px, ${mode}`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addInitScript((m: string) => {
          try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
        }, mode);
        try {
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${port}/brands`, { waitUntil: 'load' });
          await waitForApp(page);
          await page.waitForSelector('.brand-row--mark', { timeout: 20_000 });
          const m = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll<HTMLElement>('.brand-row--mark'));
            const mark = (r: HTMLElement) => r.querySelector(':scope > .monogram, :scope > .org-mark') as HTMLElement | null;
            const bad: string[] = [];
            for (const r of rows) {
              const el = mark(r);
              if (!el) { bad.push(`no mark: ${r.textContent}`); continue; }
              const b = el.getBoundingClientRect();
              if (Math.abs(b.width - b.height) > 1 || b.width < 20) bad.push(`not square: ${r.textContent}`);
              const text = (r.querySelector('.brand-row-name')?.textContent ?? '').trim();
              if (!text) bad.push('no name in text');
              if (el.classList.contains('monogram') && el.getAttribute('aria-hidden') !== 'true') bad.push(`tile not hidden: ${text}`);
            }
            return {
              rows: rows.length,
              tiles: rows.filter((r) => r.querySelector(':scope > .monogram')).length,
              logos: rows.filter((r) => r.querySelector(':scope > .org-mark img')).length,
              bad: bad.slice(0, 5),
              doc: document.documentElement.scrollWidth,
            };
          });
          expect(m.bad).toEqual([]);
          expect(m.tiles, 'a brand without a logo shows the tile').toBeGreaterThan(100);
          expect(m.logos, 'a brand with a logo still shows it').toBeGreaterThan(0);
          expect(m.doc, 'no sideways scroll').toBeLessThanOrEqual(width);
        } finally {
          await context.close();
        }
        const violations = await auditRoute(browser, port, '/brands', mode, width);
        expect(violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).join(' | ')}`)).toEqual([]);
      }, 90_000);
    }
  }

  it('a brand page without a logo shows the initials tile, one with a logo shows it', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/brands/voyages-imaginaires`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForSelector('.org-hero');
      expect(await page.locator('.org-hero > .monogram').innerText()).toBe('VI');
      expect(await page.locator('.org-hero > .monogram').getAttribute('aria-hidden')).toBe('true');
      await page.goto(`http://127.0.0.1:${port}/brands/versace`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForSelector('.org-hero');
      expect(await page.locator('.org-hero > .org-mark img').count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 60_000);
});

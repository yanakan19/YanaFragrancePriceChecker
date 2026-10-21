/**
 * Suggestions under the bar's search box on the built page (demo/searchSuggest.ts),
 * on the UK, US and Indian sites: a brand typed puts that brand first, its
 * product typed after it puts that product first, the combobox pattern works
 * from the keyboard (Down, Enter, Escape) and the list stays on a phone's
 * screen. Names are read off the page's own Most Stocked rail, never written here.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = ['index.html', 'us/index.html', 'in/index.html'].every((f) => existsSync(resolve(root, 'demo', f)));

describe.skipIf(!built)('search suggestions as you type', () => {
  let browser: Browser;
  let server: { port: number; close: () => void };

  beforeAll(async () => {
    server = await startDemoServer();
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  const state = (page: Page) =>
    page.evaluate(`(() => {
      const box = document.getElementById('search');
      const panel = document.getElementById('search-suggest');
      const opts = [...(panel ? panel.querySelectorAll('[role="option"]') : [])];
      const r = panel ? panel.getBoundingClientRect() : null;
      return {
        role: box.getAttribute('role'), expanded: box.getAttribute('aria-expanded'), active: box.getAttribute('aria-activedescendant'),
        open: !!panel && !panel.hidden, value: box.value, right: r ? r.right : 0,
        options: opts.map((o) => ({ id: o.id, brand: o.getAttribute('data-suggest-brand'), frag: o.getAttribute('data-suggest-frag'), label: o.getAttribute('aria-label') || o.textContent.trim(), selected: o.getAttribute('aria-selected') })),
      };
    })()`) as Promise<{
      role: string; expanded: string; active: string | null; open: boolean; value: string; right: number;
      options: { id: string; brand: string | null; frag: string | null; label: string; selected: string }[];
    }>;

  async function typeInto(page: Page, text: string) {
    await page.fill('#search', '');
    await page.click('#search');
    await page.keyboard.type(text, { delay: 20 });
    await page.waitForFunction(`(() => { const p = document.getElementById('search-suggest'); return p && !p.hidden; })()`, null, { timeout: 10_000 });
    await page.waitForTimeout(150);
  }

  for (const [country, path] of [['GB', '/'], ['US', '/us/'], ['IN', '/in/']] as const) {
    it(`${country}: a brand, then the brand and a fragrance's name, each puts the right one first`, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${server.port}${path}`, { waitUntil: 'load' });
        await waitForApp(page);
        const { brand, name } = (await page.evaluate(`(() => {
          const tile = document.querySelector('.pop-rail .tile');
          return { brand: tile.querySelector('[data-brand]').getAttribute('data-brand'), name: tile.querySelector('.phead-name').textContent.trim() };
        })()`)) as { brand: string; name: string };

        await typeInto(page, brand.toLowerCase());
        let s = await state(page);
        expect(s.role).toBe('combobox');
        expect(s.expanded).toBe('true');
        expect(s.options[0]?.brand, 'a brand first').not.toBeNull();
        expect(s.options.map((o) => o.brand)).toContain(brand);
        expect(s.right, 'the list stays on a phone screen').toBeLessThanOrEqual(390);

        await typeInto(page, `${brand} ${name}`.toLowerCase());
        s = await state(page);
        const first = s.options.find((o) => o.frag !== null)!;
        expect(first.label.toLowerCase().startsWith(`${brand} ${name}`.toLowerCase()), `${first.label} for ${brand} ${name}`).toBe(true);
        expect(s.options.findIndex((o) => o.frag !== null), 'no brand above the fragrance it names').toBe(0);

        // The name first and the brand after: the same fragrance first.
        await typeInto(page, `${name} ${brand}`.toLowerCase());
        s = await state(page);
        expect(s.options[0]!.label.toLowerCase().startsWith(`${brand} ${name}`.toLowerCase())).toBe(true);
      } finally {
        await context.close();
      }
    });
  }

  it('works from the keyboard: Down selects, Escape closes and keeps the text, Enter opens the choice', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      const name = (await page.evaluate(`document.querySelector('.pop-rail .phead-name').textContent.trim()`)) as string;
      await typeInto(page, name.toLowerCase());
      await page.keyboard.press('ArrowDown');
      let s = await state(page);
      expect(s.active).toBe(s.options[0]!.id);
      expect(s.options[0]!.selected).toBe('true');
      await page.keyboard.press('ArrowUp');
      s = await state(page);
      expect(s.active, 'Up from the first wraps to the last').toBe(s.options[s.options.length - 1]!.id);

      await page.keyboard.press('Escape');
      s = await state(page);
      expect(s.open).toBe(false);
      expect(s.expanded).toBe('false');
      expect(s.value).toBe(name.toLowerCase());

      await page.keyboard.press('ArrowDown');
      s = await state(page);
      expect(s.open, 'Down opens it again').toBe(true);
      const chosen = s.options[0]!;
      const before = new URL(page.url()).pathname;
      await page.keyboard.press('Enter');
      await page.waitForFunction((p) => location.pathname !== p, before, { timeout: 10_000 });
      s = await state(page);
      expect(s.open).toBe(false);
      if (chosen.frag) expect((await page.textContent('#view h1'))?.trim().length).toBeGreaterThan(0);
      else expect(new URL(page.url()).pathname).toMatch(/\/brands\//);
    } finally {
      await context.close();
    }
  });
});

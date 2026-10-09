import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { BY_POPULARITY } from '../demo/data.js';

/**
 * The note icons on a built product page, in a real browser
 * (docs/NOTES-PAGE-PLAN.md, section F, and the owner's layout of 9 Oct 2026):
 * the pills keep their height and their centred rows at 320, 390 and 1280 in
 * both themes, the icons are 18px then 20px, the home page asks for nothing of
 * it, and a product page with the median 8 notes stays inside the budget.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));
const MODE_KEY = 'pricesniffs.display';
const count = (f: (typeof BY_POPULARITY)[number]) => (f.notes ? new Set([...f.notes.top, ...f.notes.middle, ...f.notes.base]).size : 0);
const median = BY_POPULARITY.find((f) => count(f) === 8)!;
const busy = BY_POPULARITY.find((f) => count(f) >= 20)!;

describe.skipIf(!built)('note icons on the built product page', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  /** Opens a page with the service worker blocked, so the requests seen are the page's own. */
  async function open(path: string, width: number, mode: 'light' | 'dark', seen: { path: string; bytes: number }[] = [], block = false): Promise<Page> {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(
      ([k, v, desktop]: [string, string, boolean]) => {
        try {
          localStorage.setItem(k, v);
          if (desktop) localStorage.setItem('pricesniffs.layout', 'desktop');
        } catch {
          /* storage may be unavailable */
        }
      },
      [MODE_KEY, mode, width >= 1000] as [string, string, boolean],
    );
    if (block) await context.route('**/note-icons/**', (r) => r.abort());
    const page = await context.newPage();
    page.on('response', (r) => {
      const p = new URL(r.url()).pathname;
      if (p.includes('note-icons') || p.includes('/data/note')) {
        r.body().then((b) => seen.push({ path: p, bytes: gzipSync(b).length }), () => seen.push({ path: p, bytes: 0 }));
      }
    });
    page.on('requestfailed', (r) => {
      const p = new URL(r.url()).pathname;
      if (p.includes('note-icons')) seen.push({ path: p, bytes: 0 });
    });
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    return page;
  }

  /** Brings the notes into view and waits for every icon to be in (or to have failed). */
  async function iconsIn(page: Page): Promise<void> {
    const block = await page.waitForSelector('.notes-block', { timeout: 15_000 });
    await block.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-note-ico-slot]') === null, null, { timeout: 15_000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.notes-block img.note-ico')).every((i) => i.complete), null, { timeout: 15_000 });
  }

  /** Sizes and rows of the notes block, and the height of a plain pill in the same row for comparison. */
  const measure = (page: Page) =>
    page.evaluate(() => {
      const rowsOf = (chips: HTMLElement) => {
        const box = chips.getBoundingClientRect();
        const rows = new Map<number, DOMRect[]>();
        for (const c of Array.from(chips.querySelectorAll<HTMLElement>('.note-chip'))) {
          const r = c.getBoundingClientRect();
          rows.set(Math.round(r.top), [...(rows.get(Math.round(r.top)) ?? []), r]);
        }
        return [...rows.values()].map((rs) => ({
          off: Math.abs(Math.min(...rs.map((r) => r.left)) - box.left - (box.right - Math.max(...rs.map((r) => r.right)))),
          wide: rs.some((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5),
        }));
      };
      const lists = Array.from(document.querySelectorAll<HTMLElement>('.notes-block .note-chips'));
      const rows = lists.flatMap(rowsOf);
      const plain = document.createElement('button');
      plain.className = 'note-chip';
      plain.textContent = 'Plain';
      lists[0]!.appendChild(plain);
      const plainHeight = plain.getBoundingClientRect().height;
      plain.remove();
      const chips = Array.from(document.querySelectorAll<HTMLElement>('.notes-block .note-chip'));
      return {
        chips: chips.length,
        boxes: chips.map((c) => {
          const r = c.getBoundingClientRect();
          return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
        }),
        heights: [...new Set(chips.map((c) => Math.round(c.getBoundingClientRect().height * 100) / 100))],
        plainHeight: Math.round(plainHeight * 100) / 100,
        icons: Array.from(document.querySelectorAll<HTMLImageElement>('.notes-block img.note-ico')).map((i) => ({
          px: i.getBoundingClientRect().width,
          alt: i.getAttribute('alt'),
          shown: i.naturalWidth > 0,
          hidden: getComputedStyle(i).visibility === 'hidden',
          opacity: getComputedStyle(i).opacity,
          group: i.classList.contains('is-group'),
        })),
        names: chips.map((c) => (c as HTMLButtonElement).innerText.trim()),
        maxOff: Math.max(...rows.map((r) => r.off)),
        wide: rows.filter((r) => r.wide).length,
        blockOverflow: (() => {
          const b = document.querySelector<HTMLElement>('.notes-block')!;
          return b.scrollWidth - b.clientWidth;
        })(),
      };
    });

  it('asks for no icon and no lookup on the home page', async () => {
    const seen: { path: string; bytes: number }[] = [];
    const page = await open('/', 390, 'light', seen);
    await page.waitForTimeout(1500);
    expect(seen.map((s) => s.path).filter((p) => p.includes('note-icons') || p.includes('noteIcons'))).toEqual([]);
    await page.context().close();
  }, 60_000);

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`keeps the pills' height and centred rows, with ${width >= 390 ? 20 : 18}px icons, at ${width} wide in ${mode}`, async () => {
        const seen: { path: string; bytes: number }[] = [];
        const page = await open(`/fragrance/${median.id}`, width, mode, seen);
        await iconsIn(page);
        const m = await measure(page);
        expect(m.chips).toBe(8);
        expect(m.icons.length).toBe(8);
        for (const i of m.icons) {
          expect(i.px).toBe(width >= 390 ? 20 : 18);
          expect(i.alt).toBe('');
          expect(i.shown).toBe(true);
          expect(i.opacity).toBe(i.group ? '0.7' : '1');
        }
        // Same height as a pill without an icon, at most 2px taller.
        for (const h of m.heights) expect(h - m.plainHeight).toBeLessThanOrEqual(2);
        expect(m.maxOff).toBeLessThanOrEqual(1.5);
        expect(m.wide).toBe(0);
        expect(m.blockOverflow).toBeLessThanOrEqual(0);
        // The budget: one lookup, at most one request per note, under 20 kB gzipped in all.
        await page.waitForTimeout(300);
        const icons = seen.filter((s) => s.path.includes('/note-icons/'));
        expect(seen.filter((s) => s.path.includes('/data/noteIcons.'))).toHaveLength(1);
        expect(seen.filter((s) => s.path.includes('/data/notes.'))).toHaveLength(0);
        expect(icons.length).toBeLessThanOrEqual(8);
        const total = seen.reduce((sum, s) => sum + s.bytes, 0);
        expect(total, `${icons.length} icons and the lookup: ${total} bytes gzipped`).toBeLessThan(20 * 1024);
        await page.context().close();
      }, 60_000);
    }
  }

  it('wraps a product with 20 or more notes into centred rows with nothing wider than the screen at 320', async () => {
    const page = await open(`/fragrance/${busy.id}`, 320, 'dark');
    await iconsIn(page);
    const m = await measure(page);
    expect(m.chips).toBeGreaterThanOrEqual(20);
    expect(m.wide).toBe(0);
    expect(m.maxOff).toBeLessThanOrEqual(1.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.context().close();
  }, 60_000);

  it('keeps every pill its size, border and name when the icons cannot be fetched', async () => {
    const loaded = await open(`/fragrance/${median.id}`, 390, 'light');
    await iconsIn(loaded);
    const a = await measure(loaded);
    await loaded.context().close();
    const blocked = await open(`/fragrance/${median.id}`, 390, 'light', [], true);
    await iconsIn(blocked);
    await blocked.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.notes-block img.note-ico')).every((i) => getComputedStyle(i).visibility === 'hidden'), null, { timeout: 15_000 });
    const b = await measure(blocked);
    expect(b.boxes).toEqual(a.boxes);
    expect(b.names).toEqual(a.names);
    await blocked.context().close();
  }, 90_000);

  for (const mode of ['light', 'dark'] as const) {
    it(`passes axe on the notes block in ${mode}, each pill named by its note alone`, async () => {
      const page = await open(`/fragrance/${median.id}`, 390, mode);
      await iconsIn(page);
      const results = await new AxeBuilder({ page }).include('.notes-block').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      const summary = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`).join('\n');
      expect(results.violations, summary).toEqual([]);
      const named = await page.$$eval('.notes-block .note-chip', (els) => els.map((e) => [e.getAttribute('data-note'), (e as HTMLElement).innerText.trim(), e.getAttribute('aria-label')]));
      for (const [, text, label] of named) {
        expect(label).toBeNull();
        expect(text!.length).toBeGreaterThan(0);
      }
      await page.context().close();
    }, 60_000);
  }
});

describe('the service worker keeps the icons cache first and never precaches them', () => {
  const sw = readFileSync(resolve(root, 'demo/sw.js'), 'utf8');
  it('fills its own icon cache on use only', () => {
    expect(sw).toContain("const ICON_CACHE = 'pricesniffs-icons-v1';");
    const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
    expect(install).not.toMatch(/ICON_CACHE|NOTE_ICON|note-icons/);
  });
});

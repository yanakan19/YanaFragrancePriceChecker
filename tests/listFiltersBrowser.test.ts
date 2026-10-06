import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import { devices, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { BY_POPULARITY, DEALS, type DemoFragrance } from '../demo/data.js';
import { readGender } from '../demo/gender.js';
import { rankedInMostStocked } from '../demo/mostStocked.js';
import { bestDealPerScent, onePerScent } from '../demo/oneScent.js';
import { slugOf } from '../demo/tabFacets.js';
import { volumeBandFor } from '../demo/volumeBands.js';
import { SHEET_ID } from '../demo/filterUi.js';
import { chips, closeFilters, isSheetOpen, openFilters, panelOptions, tick } from './support/filterPanel.js';

/**
 * The filters of every fragrance list on the built page (owner's revamp, 6 Oct
 * 2026): one Filters button, a panel of real checkboxes with a count beside
 * each option, several options at once in a filter, the chosen ones as chips,
 * and all of it in the address. Needs `npm run demo`.
 *
 * Runs in Chromium, at phone and computer sizes. With LAYOUT_BROWSER=webkit
 * (the "Layout check (Safari engine)" workflow) only the WebKit part runs, with
 * iPhone 13 settings; locally that part runs too wherever WebKit is installed.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));
const webkitOnly = process.env.LAYOUT_BROWSER === 'webkit';
const webkitReady = (() => {
  try {
    return existsSync(webkit.executablePath());
  } catch {
    return false;
  }
})();

const MODE_KEY = 'pricesniffs.display';
const CHUNK = 48;

/** The Most Stocked list as the page builds it: one entry per scent. */
const RANKING = onePerScent(BY_POPULARITY.filter(rankedInMostStocked));
const band = (f: DemoFragrance) => volumeBandFor(f.sizeMl, f.giftSet !== null);
/** Who a fragrance is for, as the page reads it (genderOf in demo/app.ts). */
const genderOf = (f: DemoFragrance) => {
  const named = readGender(`${f.brand} ${f.name} ${f.concentration}`);
  return named === 'notStated' && f.gender ? f.gender : named;
};
const tally = <T>(list: readonly T[], key: (x: T) => string | null): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of list) {
    const k = key(x);
    if (k !== null) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

const where = (page: Page): string => new URL(page.url()).pathname + new URL(page.url()).search;
const count = async (page: Page): Promise<number> => Number(await page.textContent('#view .page-head .count'));
const active = (page: Page): Promise<string> =>
  page.evaluate(`(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('data-filter-remove') && 'chip:' + a.dataset.filterRemove + '=' + a.dataset.value || a.className) : ''; })()`) as Promise<string>;

async function newPage(browser: Browser, port: number, path: string, opts: { width?: number; mode?: 'light' | 'dark'; device?: string } = {}): Promise<{ page: Page; ctx: BrowserContext }> {
  const width = opts.width ?? 390;
  const ctx = await browser.newContext(
    opts.device
      ? { ...devices[opts.device]!, reducedMotion: 'reduce' }
      : { viewport: { width, height: width < 600 ? 844 : 900 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' },
  );
  await ctx.addInitScript(
    ([k, v]: [string, string]) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage may be unavailable */
      }
    },
    [MODE_KEY, opts.mode ?? 'dark'] as [string, string],
  );
  // The product photos are not part of these checks and would only slow them.
  await ctx.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
  await waitForApp(page);
  await page.waitForSelector('#view h1');
  await page.waitForTimeout(200);
  return { page, ctx };
}

describe.skipIf(!built || webkitOnly)('the Filters panel on the built site (Chromium)', () => {
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

  const open = (path: string, opts: { width?: number; mode?: 'light' | 'dark' } = {}) => newPage(browser, port, path, opts);

  it('ticks two sizes at once and lists either (OR), narrows by Gender too (AND), and counts every option', async () => {
    const { page, ctx } = await open('/search');
    const sizes = Object.entries(tally(RANKING, band)).sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 2).sort();
    expect(sizes).toHaveLength(2);
    // Before anything is chosen, each size counts the whole list's bottles of that size.
    const offered = await panelOptions(page, 'size');
    expect(Object.fromEntries(offered.map((o) => [o.value, o.count]))).toEqual(tally(RANKING, band));
    for (const s of sizes) await tick(page, 'size', s);
    const either = RANKING.filter((f) => sizes.includes(band(f)!));
    expect(await count(page)).toBe(either.length);
    expect(where(page)).toBe(`/search?size=${sizes.join(',')}`);
    expect(await page.textContent(`#${SHEET_ID} [data-fs-show]`)).toBe(`Show ${either.length.toLocaleString('en-GB')} Fragrances`);
    // A size's own count is not narrowed by the sizes chosen beside it.
    expect(Object.fromEntries((await panelOptions(page, 'size')).map((o) => [o.value, o.count]))).toEqual(tally(RANKING, band));

    await tick(page, 'gender', 'womens');
    const both = either.filter((f) => genderOf(f) === 'womens');
    expect(both.length).toBeGreaterThan(0);
    expect(await count(page)).toBe(both.length);
    expect(where(page)).toBe(`/search?size=${sizes.join(',')}&gender=womens`);
    // Now each size counts the women's bottles of that size.
    expect(Object.fromEntries((await panelOptions(page, 'size')).map((o) => [o.value, o.count]))).toEqual(
      tally(RANKING.filter((f) => genderOf(f) === 'womens'), band),
    );
    await closeFilters(page);
    expect(await chips(page)).toEqual([...sizes.map((s) => `size=${s}`), 'gender=womens']);
    expect(await page.textContent('#view [data-facets-toggle] .facets-badge')).toBe('3');
    await ctx.close();
  }, 120_000);

  it('opens a shared link with several values, an old one value link, and drops what it does not know', async () => {
    const shared = await open('/search?size=70-120,30-70');
    expect(where(shared.page)).toBe('/search?size=30-70,70-120');
    expect(await chips(shared.page)).toEqual(['size=30-70', 'size=70-120']);
    expect(await count(shared.page)).toBe(RANKING.filter((f) => ['30-70', '70-120'].includes(band(f)!)).length);
    expect(await isSheetOpen(shared.page)).toBe(false);
    await shared.ctx.close();

    const old = await open('/search?size=30-70');
    expect(await chips(old.page)).toEqual(['size=30-70']);
    await old.ctx.close();

    const odd = await open('/search?size=30-70,bogus&type=nope&stock=yes');
    expect(where(odd.page)).toBe('/search?size=30-70');
    expect(await chips(odd.page)).toEqual(['size=30-70']);
    await odd.ctx.close();

    const tab = await open('/sets?type=niche');
    expect(await chips(tab.page)).toEqual(['type=niche']);
    await tab.ctx.close();
  }, 120_000);

  it('keeps the filters through a product page and Back, deep in the endless list, without adding history', async () => {
    const { page, ctx } = await open('/search', { width: 390 });
    const length = (await page.evaluate('history.length')) as number;
    await tick(page, 'size', '70-120');
    await tick(page, 'size', '30-70');
    await closeFilters(page);
    expect(await page.evaluate('history.length')).toBe(length);
    const path = where(page);
    const total = await count(page);
    // Far enough down that the list has swapped its first tiles out (keepNearTiles).
    for (let i = 0; i < 60; i++) {
      const loaded = (await page.evaluate(`document.querySelectorAll('#view .tile-grid > li:not(.grid-more)').length`)) as number;
      if (loaded >= CHUNK * 8) break;
      await page.evaluate(`(document.querySelector('#view .tile-grid > .grid-more') || document.documentElement).scrollIntoView({ block: 'end' })`);
      await page.waitForTimeout(120);
    }
    await page.evaluate('window.scrollBy(0, -600)');
    await page.waitForTimeout(400);
    expect((await page.evaluate(`document.querySelectorAll('#view .tile-grid > li.tile-gone').length`)) as number).toBeGreaterThan(0);
    const before = (await page.evaluate(`(() => { const el = [...document.querySelectorAll('#view [data-frag]')].find((e) => e.getBoundingClientRect().top > 120); return { id: el.dataset.frag, top: Math.round(el.getBoundingClientRect().top) }; })()`)) as { id: string; top: number };
    await page.click(`#view [data-frag="${before.id}"]`);
    await page.waitForSelector('.detail-grid');
    await page.goBack();
    await page.waitForSelector('#view .tile-grid');
    await page.waitForTimeout(700);
    expect(where(page)).toBe(path);
    expect(await chips(page)).toEqual(['size=30-70', 'size=70-120']);
    expect(await count(page)).toBe(total);
    const after = (await page.evaluate(`(() => { const el = document.querySelector('#view [data-frag="${before.id}"]'); return el ? Math.round(el.getBoundingClientRect().top) : null; })()`)) as number | null;
    expect(after, 'the tile left from is on screen again').not.toBeNull();
    expect(Math.abs(after! - before.top)).toBeLessThanOrEqual(40);
    await ctx.close();
  }, 180_000);

  it('takes a chip off with one tap, moves focus to the next, and Clear All empties the address', async () => {
    const { page, ctx } = await open('/search?size=30-70,70-120&gender=womens');
    await page.click('#view [data-filter-remove="size"][data-value="30-70"]');
    expect(where(page)).toBe('/search?size=70-120&gender=womens');
    expect(await chips(page)).toEqual(['size=70-120', 'gender=womens']);
    expect(await active(page)).toBe('chip:size=70-120');
    await page.click('#view .filter-chips [data-facets-clear]');
    expect(where(page)).toBe('/search');
    expect(await chips(page)).toEqual([]);
    expect(await count(page)).toBe(RANKING.length);
    expect(await page.evaluate(`document.activeElement.matches('#view [data-facets-toggle]')`)).toBe(true);
    await ctx.close();
  }, 90_000);

  it('works from the keyboard: Enter opens it, Space ticks a box and keeps focus on it, Enter opens a group, Escape closes back to the button', async () => {
    const { page, ctx } = await open('/deals', { width: 1280 });
    await page.focus('#view [data-facets-toggle]');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`#${SHEET_ID}[open]`);
    expect(await active(page)).toBe('ps-filters-title');
    let id = '';
    for (let i = 0; i < 12 && !id.startsWith('fs-') ; i++) {
      await page.keyboard.press('Tab');
      const a = await active(page);
      if (/^fs-[a-z]+-/.test(a) && !a.startsWith('fs-sum-') && !a.startsWith('fs-find-')) id = a;
    }
    expect(id).toMatch(/^fs-/);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect(await page.isChecked(`#${id}`)).toBe(true);
    expect(await active(page)).toBe(id);
    expect(where(page)).toMatch(/^\/deals\?/);
    // Focus never leaves the open panel.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(`!!document.activeElement.closest('#${SHEET_ID}')`)).toBe(true);
    }
    // A shut group opens from its heading.
    const shut = (await page.evaluate(`(() => { const d = document.querySelector('#${SHEET_ID} .fs-group:not([open])'); return d ? d.dataset.fsGroup : null; })()`)) as string | null;
    if (shut) {
      await page.focus(`#fs-sum-${shut}`);
      await page.keyboard.press('Enter');
      expect(await page.evaluate(`document.querySelector('#${SHEET_ID} [data-fs-group="${shut}"]').open`)).toBe(true);
      expect(await active(page)).toBe(`fs-sum-${shut}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(`!document.getElementById('${SHEET_ID}').open`);
    // The dialog's close event, which puts focus back, comes a task after it shuts.
    await page.waitForFunction(`document.activeElement.matches('#view [data-facets-toggle]')`, null, { timeout: 2000 });
    await ctx.close();
  }, 90_000);

  it('names every part for a screen reader', async () => {
    const { page, ctx } = await open('/search?size=30-70');
    expect(await page.getByRole('button', { name: /^Filters\s*,\s*1 chosen$/ }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Remove Size: 30 to 70ml' }).count()).toBe(1);
    await openFilters(page);
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    expect(await dialog.count()).toBe(1);
    expect(await dialog.getByRole('group', { name: 'Size', exact: true }).count()).toBeGreaterThanOrEqual(1);
    expect(await dialog.getByRole('checkbox', { name: /^30 to 70ml/ }).isChecked()).toBe(true);
    expect(await dialog.getByRole('button', { name: 'Close Filters' }).count()).toBe(1);
    // The new count is said out loud after a change.
    await tick(page, 'size', '70-120');
    expect(await page.textContent(`#${SHEET_ID} [data-fs-status]`)).toMatch(/^[\d,]+ Fragrances$/);
    await ctx.close();
  }, 90_000);

  it('gives a long filter its own search box: Brand on Most Stocked', async () => {
    const { page, ctx } = await open('/search');
    await openFilters(page);
    expect(await page.$('#fs-find-brand')).toBeNull();
    await page.click('#fs-sum-brand');
    await page.fill('#fs-find-brand', 'lattafa');
    const shown = (await page.evaluate(`[...document.querySelectorAll('#${SHEET_ID} [data-fs-group="brand"] .fs-opt:not([hidden]) .fs-opt-label')].map((l) => l.textContent)`)) as string[];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((l) => l.toLowerCase().includes('lattafa'))).toBe(true);
    await page.click('#fs-brand-lattafa');
    expect(where(page)).toBe('/search?brand=lattafa');
    expect(await count(page)).toBe(RANKING.filter((f) => slugOf(f.brand) === 'lattafa').length);
    // The words typed are still there, and so is what they found.
    expect(await page.inputValue('#fs-find-brand')).toBe('lattafa');
    await ctx.close();
  }, 90_000);

  it('filters Deals by the shop offering each deal', async () => {
    const deals = bestDealPerScent(DEALS.filter((d) => d.fragrance.photoUrl !== null));
    const [shop, n] = Object.entries(tally(deals, (d) => d.retailerId)).sort((a, b) => b[1] - a[1])[0]!;
    const { page, ctx } = await open('/deals', { width: 1280 });
    await tick(page, 'shop', shop);
    expect(where(page)).toBe(`/deals?shop=${shop}`);
    expect(await page.textContent(`#${SHEET_ID} [data-fs-show]`)).toBe(`Show ${n.toLocaleString('en-GB')} ${n === 1 ? 'Deal' : 'Deals'}`);
    await ctx.close();
  }, 90_000);

  it('puts a shop page\'s In Stock Here, and a note page\'s layer, in the address', async () => {
    const { page, ctx } = await open('/retailers/fragrance-click', { width: 1280 });
    await openFilters(page);
    const labels = (await page.evaluate(`[...document.querySelectorAll('#${SHEET_ID} .fs-opt-label')].map((l) => l.textContent)`)) as string[];
    expect(labels).not.toContain('In Stock');
    expect(await page.$(`#${SHEET_ID} [data-fs-group="shop"]`)).toBeNull();
    if (labels.includes('In Stock Here')) {
      await tick(page, 'stock');
      expect(where(page)).toBe('/retailers/fragrance-click?stock=1');
    }
    await ctx.close();

    const note = await open('/notes/vanilla', { width: 1280 });
    await note.page.click('#view [data-note-layer="top"]');
    expect(where(note.page)).toBe('/notes/vanilla?layer=top');
    await note.page.reload({ waitUntil: 'load' });
    await waitForApp(note.page);
    await note.page.waitForSelector('#view h1');
    expect(await note.page.evaluate(`document.querySelector('#view [data-note-layer="top"]').classList.contains('on')`)).toBe(true);
    await note.ctx.close();
  }, 90_000);

  it('holds the page still behind the panel on a phone and puts the reader back where they were', async () => {
    const { page, ctx } = await open('/search');
    // Down to the controls row, so the place is worth keeping.
    await page.evaluate(`window.scrollTo(0, document.querySelector('#view .controls').getBoundingClientRect().top + scrollY - 80)`);
    await page.waitForTimeout(200);
    const y = (await page.evaluate('scrollY')) as number;
    expect(y).toBeGreaterThan(0);
    await openFilters(page);
    await page.mouse.move(200, 40);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(300);
    expect(await page.evaluate('scrollY')).toBe(y);
    // The panel's own body scrolls.
    await page.mouse.move(200, 600);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    expect((await page.evaluate(`document.querySelector('#${SHEET_ID} .fs-body').scrollTop`)) as number).toBeGreaterThan(0);
    expect(await page.evaluate('scrollY')).toBe(y);
    await tick(page, 'size', '30-70');
    await page.click(`#${SHEET_ID} [data-fs-show]`);
    await page.waitForFunction(`!document.getElementById('${SHEET_ID}').open`);
    expect(await page.evaluate('scrollY')).toBe(y);
    expect(await page.evaluate('getComputedStyle(document.documentElement).overflowY')).not.toBe('hidden');
    await ctx.close();
  }, 90_000);

  for (const mode of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1280]) {
      it(`passes axe with the panel open and a filter chosen, with no sideways scroll: ${width} wide, ${mode}`, async () => {
        for (const path of ['/search?size=30-70', '/sets?kind=gift']) {
          const { page, ctx } = await open(path, { width, mode });
          await openFilters(page);
          await page.waitForTimeout(300);
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
          expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `${path} ${width} ${mode}`).toEqual([]);
          const s = (await page.evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, body: (() => { const b = document.querySelector('#${SHEET_ID} .fs-body'); return b.scrollWidth - b.clientWidth; })() })`)) as { sw: number; cw: number; body: number };
          expect(s.sw, `${path} ${width} ${mode}`).toBeLessThanOrEqual(s.cw);
          expect(s.body, `${path} ${width} ${mode}: the panel`).toBeLessThanOrEqual(0);
          await closeFilters(page);
          const chipsAxe = await new AxeBuilder({ page }).include('#view .filter-chips').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
          expect(chipsAxe.violations.map((v) => v.id), `${path} ${width} ${mode}: chips`).toEqual([]);
          await ctx.close();
        }
      }, 120_000);
    }
  }
});

describe.skipIf(!built || !webkitReady)('the Filters panel in WebKit, with iPhone 13 settings', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await webkit.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  it('opens as a sheet from the bottom, takes several taps, holds the page still and closes on Escape back to the button', async () => {
    const { page, ctx } = await newPage(browser, port, '/search', { device: 'iPhone 13' });
    await page.evaluate(`window.scrollTo(0, document.querySelector('#view .controls').getBoundingClientRect().top + scrollY - 80)`);
    await page.waitForTimeout(200);
    const y = (await page.evaluate('scrollY')) as number;
    await page.tap('#view [data-facets-toggle]');
    await page.waitForSelector(`#${SHEET_ID}[open]`);
    const rect = (await page.evaluate(`(() => { const r = document.getElementById('${SHEET_ID}').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth }; })()`)) as Record<string, number>;
    // A sheet: on the bottom edge, the whole width, short of the top.
    expect(Math.abs(rect.bottom! - rect.vh!)).toBeLessThanOrEqual(1);
    expect(rect.left).toBe(0);
    expect(Math.abs(rect.right! - rect.vw!)).toBeLessThanOrEqual(1);
    expect(rect.top).toBeGreaterThan(40);
    expect(await page.evaluate('getComputedStyle(document.documentElement).overflowY')).toBe('hidden');
    for (const s of ['30-70', '70-120']) {
      await page.tap(`#fs-size-${s}`);
      await page.waitForTimeout(150);
    }
    expect(where(page)).toBe('/search?size=30-70,70-120');
    expect(await page.isChecked('#fs-size-30-70')).toBe(true);
    expect(await page.isChecked('#fs-size-70-120')).toBe(true);
    expect(await count(page)).toBe(RANKING.filter((f) => ['30-70', '70-120'].includes(band(f)!)).length);
    // Every option row is a 44px target at least.
    const small = (await page.evaluate(`[...document.querySelectorAll('#${SHEET_ID} .fs-opt')].filter((o) => o.offsetParent && o.getBoundingClientRect().height < 44).length`)) as number;
    expect(small).toBe(0);
    expect(await page.evaluate('scrollY')).toBe(y);
    await page.keyboard.press('Escape');
    await page.waitForFunction(`!document.getElementById('${SHEET_ID}').open`);
    expect(await page.evaluate('scrollY')).toBe(y);
    expect(await chips(page)).toEqual(['size=30-70', 'size=70-120']);
    await page.waitForFunction(`document.activeElement.matches('#view [data-facets-toggle]')`, null, { timeout: 2000 });
    // A chip comes off with a tap.
    await page.tap('#view [data-filter-remove="size"][data-value="30-70"]');
    expect(where(page)).toBe('/search?size=70-120');
    await ctx.close();
  }, 120_000);

  it('opens on the Sets tab at 390 wide with a shared link\'s choices ticked', async () => {
    const { page, ctx } = await newPage(browser, port, '/sets?kind=gift,bundle', { device: 'iPhone 13' });
    expect(await chips(page)).toEqual(['kind=gift', 'kind=bundle']);
    const kinds = await panelOptions(page, 'kind');
    expect(kinds.filter((o) => o.checked).map((o) => o.value)).toEqual(['gift', 'bundle']);
    const s = (await page.evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`)) as { sw: number; cw: number };
    expect(s.sw).toBeLessThanOrEqual(s.cw);
    await closeFilters(page);
    await ctx.close();
  }, 90_000);
});

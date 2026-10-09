import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The country and currency selector in the top bar (owner's request,
 * 2026-10-05), on the built page: it sits just left of the account button,
 * the bar still fits at every phone width and on a tablet and a desktop in
 * both themes, the menu opens and closes by mouse and keyboard, the two
 * regions that are not available yet cannot be chosen, and nothing is stored.
 * The list's data is tests/regions.test.ts.
 */

type Mode = 'dark' | 'light';

// Trimmed to three on 9 October 2026 (owner decision 3, docs/INTERNATIONAL-PLAN.md).
const NAMES = ['United Kingdom', 'United States', 'India'];
const CODES = ['GBP', 'USD', 'INR'];

describe.skipIf(!built)('the country and currency selector', () => {
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

  async function open(width: number, mode: Mode): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, mode);
    await stubSupabase(context, null, null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForFunction(`document.querySelector('#account-btn').getAttribute('aria-label') !== 'Account menu'`, null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
    return { context, page };
  }

  async function axe(page: Page): Promise<string[]> {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    return r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }

  const focusedId = (page: Page) => page.evaluate(`document.activeElement.id || document.activeElement.getAttribute('data-region')`) as Promise<string>;
  const expanded = (page: Page, id: string) => page.getAttribute(id, 'aria-expanded');

  /** What the page keeps in this browser, and the address: choosing nothing changes none of it. */
  const footprint = (page: Page) =>
    page.evaluate(`JSON.stringify({
      url: location.href,
      cookie: document.cookie,
      local: Object.keys(localStorage).sort().map((k) => k + '=' + localStorage.getItem(k)),
      session: Object.keys(sessionStorage).sort().map((k) => k + '=' + sessionStorage.getItem(k)),
    })`) as Promise<string>;

  for (const width of [320, 360, 375, 390, 768, 1280]) {
    for (const mode of ['dark', 'light'] as const) {
      it(`at ${width}px (${mode}): the bar fits, the selector is left of the account button, the menu opens and closes by mouse and keyboard, axe passes`, async () => {
        const { context, page } = await open(width, mode);
        try {
          // ── the bar ────────────────────────────────────────────────────
          const bar = (await page.evaluate(`(() => {
            const nav = document.querySelector('.nav-items');
            const r = (s) => document.querySelector(s).getBoundingClientRect();
            const words = Array.from(nav.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
            const code = document.querySelector('.region-btn-code');
            return {
              doc: document.documentElement.scrollWidth, vw: innerWidth,
              navScroll: nav.scrollWidth, navClient: nav.clientWidth,
              lines: [...nav.querySelectorAll('button'), document.querySelector('#brand-home')].map((b) => {
                const range = document.createRange();
                range.selectNodeContents(b);
                return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
              }),
              wordTops: words.map((w) => Math.round(w.top)),
              lastWordRight: words[words.length - 1].right,
              navRight: r('.nav-items').right, brandRight: r('#brand-home').right, navLeft: r('.nav-items').left,
              brandScroll: document.querySelector('#brand-home').scrollWidth, brandClient: document.querySelector('#brand-home').clientWidth,
              regionLeft: r('#region-btn').left, regionRight: r('#region-btn').right, regionTop: r('#region-btn').top, regionBottom: r('#region-btn').bottom,
              acctLeft: r('#account-btn').left, acctRight: r('#account-btn').right, acctTop: r('#account-btn').top, acctBottom: r('#account-btn').bottom,
              brandTop: r('#brand-home').top, brandBottom: r('#brand-home').bottom,
              rowRight: r('.bar-row').right, searchTop: r('#search').top,
              codeShown: getComputedStyle(code).display !== 'none',
              flagWidth: document.querySelector('#region-btn .flag').getBoundingClientRect().width,
              label: document.querySelector('#region-btn').getAttribute('aria-label'),
              popup: document.querySelector('#region-btn').getAttribute('aria-haspopup'),
              controls: document.querySelector('#region-btn').getAttribute('aria-controls'),
              chevron: !!document.querySelector('#region-btn svg.ico'),
              tag: document.querySelector('#region-btn').tagName,
            };
          })()`)) as Record<string, number | boolean | string | number[]>;
          const n = (k: string) => bar[k] as number;
          expect(n('doc'), 'no sideways scroll').toBeLessThanOrEqual(n('vw'));
          expect(n('navScroll'), 'all four nav words in view').toBeLessThanOrEqual(n('navClient') + 1);
          expect(n('brandRight'), 'brandmark before the nav').toBeLessThanOrEqual(n('navLeft'));
          expect(n('brandScroll'), 'brandmark not cut off').toBeLessThanOrEqual(n('brandClient') + 1);
          expect(bar.lines, 'no nav word or brandmark wraps').toEqual([1, 1, 1, 1, 1]);
          expect(new Set(bar.wordTops as number[]).size, 'nav words on one row').toBe(1);
          expect(n('lastWordRight'), 'nav words clear of the selector').toBeLessThanOrEqual(n('regionLeft'));
          expect(n('navRight'), 'nav before the selector').toBeLessThanOrEqual(n('regionLeft'));
          expect(n('regionRight'), 'selector immediately left of the account button').toBeLessThanOrEqual(n('acctLeft'));
          expect(n('acctLeft') - n('regionRight'), 'a small gap, not a hole').toBeLessThanOrEqual(24);
          expect(n('regionTop')).toBeLessThan(n('acctBottom'));
          expect(n('regionBottom')).toBeGreaterThan(n('acctTop'));
          expect(Math.abs(n('regionBottom') - n('regionTop') - (n('acctBottom') - n('acctTop'))), 'as tall as the account button').toBeLessThanOrEqual(1);
          expect(Math.abs(n('acctRight') - n('rowRight')), 'account button still at the far right').toBeLessThanOrEqual(1);
          expect(n('searchTop'), 'search below the row').toBeGreaterThanOrEqual(Math.max(n('regionBottom'), n('brandBottom')));
          expect(n('flagWidth'), 'flag is 20px wide').toBeCloseTo(20, 0);

          // A real button, with the right name and menu wiring.
          expect(bar.tag).toBe('BUTTON');
          expect(bar.label).toBe('Region and currency: United Kingdom, GBP');
          expect(bar.popup).toBe('menu');
          expect(bar.controls).toBe('region-menu');
          expect(bar.chevron, 'a chevron').toBe(true);
          expect(await expanded(page, '#region-btn')).toBe('false');
          // The code is drawn on a wide desktop and left to the accessible name below that.
          expect(bar.codeShown, 'GBP drawn only where there is room').toBe(width >= 700 && (await page.evaluate(`document.documentElement.getAttribute('data-layout')`)) === 'desktop');
          expect(await page.isVisible('#region-pop')).toBe(false);

          expect(await axe(page), 'axe with the menu closed').toEqual([]);

          // ── mouse: open ────────────────────────────────────────────────
          const before = await footprint(page);
          await page.click('#region-btn');
          expect(await expanded(page, '#region-btn')).toBe('true');
          expect(await page.isVisible('#region-menu')).toBe(true);
          const items = (await page.evaluate(`Array.from(document.querySelectorAll('#region-menu [role=menuitemradio]')).map((el) => ({
            name: document.getElementById(el.getAttribute('aria-labelledby').split(' ')[0]).textContent.trim(),
            code: document.getElementById(el.getAttribute('aria-labelledby').split(' ')[1]).textContent.trim(),
            checked: el.getAttribute('aria-checked'),
            disabled: el.getAttribute('aria-disabled'),
            tabindex: el.getAttribute('tabindex'),
            note: el.getAttribute('aria-describedby') ? document.getElementById(el.getAttribute('aria-describedby')).textContent.trim() : null,
            text: el.textContent.replace(/\\s+/g, ' ').trim(),
            flag: el.querySelectorAll('svg.flag').length,
            tick: el.querySelectorAll('.region-tick').length,
          }))`)) as { name: string; code: string; checked: string; disabled: string | null; tabindex: string; note: string | null; text: string; flag: number; tick: number }[];
          expect(items.map((i) => i.name)).toEqual(NAMES);
          expect(items.map((i) => i.code)).toEqual(CODES);
          expect(items.map((i) => i.disabled)).toEqual([null, 'true', 'true']);
          expect(items.map((i) => i.checked)).toEqual(['true', 'false', 'false']);
          expect(items.map((i) => i.note)).toEqual([null, 'Coming Soon', 'Coming Soon']);
          expect(items.map((i) => i.text.endsWith('Coming Soon'))).toEqual([false, true, true]);
          expect(items.map((i) => i.tabindex), 'only the choice made is a Tab stop').toEqual(['0', '-1', '-1']);
          expect(items.map((i) => i.flag)).toEqual([1, 1, 1]);
          expect(items.map((i) => i.tick), 'a tick on the current choice only').toEqual([1, 0, 0]);
          // No hyphens or dashes in anything shown.
          for (const i of items) expect(i.text, i.text).not.toMatch(/[-‐-―−]/);

          expect(await page.getAttribute('#region-menu', 'role')).toBe('menu');
          const position = (await page.evaluate(`getComputedStyle(document.querySelector('#region-pop')).position`)) as string;
          expect(position).toBe(width <= 600 ? 'fixed' : 'absolute');
          const pop = (await page.evaluate(`(() => {
            const p = document.querySelector('#region-pop').getBoundingClientRect();
            const b = document.querySelector('#region-btn').getBoundingClientRect();
            return { left: p.left, right: p.right, bottom: p.bottom, btnRight: b.right, vw: innerWidth, vh: innerHeight };
          })()`)) as { left: number; right: number; bottom: number; btnRight: number; vw: number; vh: number };
          if (width <= 600) {
            expect(Math.round(pop.left)).toBe(0);
            expect(Math.round(pop.right)).toBe(pop.vw);
            expect(Math.round(pop.bottom)).toBe(pop.vh);
          } else {
            expect(Math.abs(pop.right - pop.btnRight), 'dropdown lined up with the button').toBeLessThanOrEqual(1);
            expect(pop.left).toBeGreaterThanOrEqual(0);
          }
          expect(await axe(page), 'axe with the menu open').toEqual([]);

          // ── the greyed out regions cannot be chosen ────────────────────
          for (const id of ['US', 'IN']) {
            await page.click(`[data-region="${id}"]`, { force: true });
            expect(await expanded(page, '#region-btn'), `${id} click leaves the menu as it was`).toBe('true');
            expect(await page.getAttribute(`[data-region="${id}"]`, 'aria-checked')).toBe('false');
            expect(await page.getAttribute('[data-region="GB"]', 'aria-checked')).toBe('true');
          }
          // No hover highlight on a greyed out item (where the pointer can hover).
          if (width > 600) {
            const hoverable = await page.evaluate(`matchMedia('(hover: hover) and (pointer: fine)').matches`);
            if (hoverable) {
              const bg = () => page.evaluate(`getComputedStyle(document.querySelector('[data-region="US"]')).backgroundColor`) as Promise<string>;
              await page.mouse.move(2, 400);
              const rest = await bg();
              await page.hover('[data-region="US"]');
              expect(await bg(), 'no hover highlight').toBe(rest);
            }
          }

          // The region choice that is there is the UK: choosing it closes the menu, changes nothing.
          await page.click('[data-region="GB"]');
          expect(await expanded(page, '#region-btn')).toBe('false');
          expect(await page.isVisible('#region-pop')).toBe(false);
          expect(await footprint(page), 'nothing stored, nothing changed').toBe(before);

          // A click outside closes it too.
          await page.click('#region-btn');
          expect(await expanded(page, '#region-btn')).toBe('true');
          const outside = width <= 600 ? { x: Math.round(width / 2), y: 150 } : { x: 8, y: 180 };
          await page.mouse.click(outside.x, outside.y);
          expect(await expanded(page, '#region-btn')).toBe('false');

          // ── keyboard ───────────────────────────────────────────────────
          // Tab reaches it after About and before the account button.
          await page.focus('#nav-about');
          await page.keyboard.press('Tab');
          expect(await focusedId(page)).toBe('region-btn');
          await page.keyboard.press('Tab');
          expect(await focusedId(page)).toBe('account-btn');
          await page.keyboard.press('Shift+Tab');
          expect(await focusedId(page)).toBe('region-btn');

          // Enter opens with focus on the current choice; arrows move through every item.
          await page.keyboard.press('Enter');
          expect(await expanded(page, '#region-btn')).toBe('true');
          expect(await focusedId(page)).toBe('GB');
          await page.keyboard.press('ArrowDown');
          expect(await focusedId(page)).toBe('US');
          await page.keyboard.press('ArrowDown');
          expect(await focusedId(page)).toBe('IN');
          await page.keyboard.press('End');
          expect(await focusedId(page)).toBe('IN');
          await page.keyboard.press('ArrowDown');
          expect(await focusedId(page)).toBe('GB');
          await page.keyboard.press('ArrowUp');
          expect(await focusedId(page)).toBe('IN');
          await page.keyboard.press('Home');
          expect(await focusedId(page)).toBe('GB');

          // Enter or Space on a greyed out item does nothing.
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
          expect(await expanded(page, '#region-btn')).toBe('true');
          await page.keyboard.press('Space');
          expect(await expanded(page, '#region-btn')).toBe('true');
          expect(await page.getAttribute('[data-region="GB"]', 'aria-checked')).toBe('true');

          // Esc closes and hands focus back to the button.
          await page.keyboard.press('Escape');
          expect(await expanded(page, '#region-btn')).toBe('false');
          expect(await focusedId(page)).toBe('region-btn');

          // The menu button pattern: ArrowUp opens on the last item.
          await page.keyboard.press('ArrowUp');
          expect(await expanded(page, '#region-btn')).toBe('true');
          expect(await focusedId(page)).toBe('IN');
          await page.keyboard.press('Escape');

          // Enter on the UK item closes it and nothing changes.
          await page.keyboard.press('ArrowDown');
          expect(await focusedId(page)).toBe('GB');
          await page.keyboard.press('Enter');
          expect(await expanded(page, '#region-btn')).toBe('false');
          expect(await focusedId(page)).toBe('region-btn');
          expect(await footprint(page), 'nothing stored, nothing changed').toBe(before);

          // Tab from the current choice walks on out of the menu, and it closes behind.
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Tab');
          expect(await expanded(page, '#region-btn'), 'tabbing out closes it').toBe('false');
          expect(await focusedId(page)).toBe('account-btn');

          expect(await axe(page), 'axe closed again').toEqual([]);
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }

  for (const width of [390, 1280]) {
    it(`at ${width}px: opening the region menu closes the account menu, and the other way round`, async () => {
      const { context, page } = await open(width, 'dark');
      try {
        const outsideClose = () => page.evaluate(`[document.querySelector('#account-btn').getAttribute('aria-expanded'), document.querySelector('#region-btn').getAttribute('aria-expanded')]`) as Promise<string[]>;
        const visible = () => page.evaluate(`[!document.querySelector('#account-pop').hidden, !document.querySelector('#region-pop').hidden]`) as Promise<boolean[]>;

        // Mouse: account open, then the region button. On a phone the account
        // sheet's backdrop covers the bar, so the button is pressed by script
        // the way a keyboard would reach it.
        await page.click('#account-btn');
        expect(await outsideClose()).toEqual(['true', 'false']);
        await page.evaluate(`document.querySelector('#region-btn').click()`);
        expect(await outsideClose()).toEqual(['false', 'true']);
        expect(await visible()).toEqual([false, true]);
        await page.evaluate(`document.querySelector('#account-btn').click()`);
        expect(await outsideClose()).toEqual(['true', 'false']);
        expect(await visible()).toEqual([true, false]);

        // Keyboard: Esc, then region open and the arrow keys on the account button.
        await page.keyboard.press('Escape');
        await page.focus('#region-btn');
        await page.keyboard.press('Enter');
        expect(await outsideClose()).toEqual(['false', 'true']);
        await page.keyboard.press('Escape');
        await page.focus('#account-btn');
        await page.keyboard.press('Enter');
        expect(await outsideClose()).toEqual(['true', 'false']);
        await page.keyboard.press('Escape');
        await page.focus('#region-btn');
        await page.keyboard.press('Enter');
        await page.evaluate(`document.querySelector('#account-btn').focus()`);
        await page.keyboard.press('ArrowDown');
        expect(await outsideClose()).toEqual(['true', 'false']);
        expect(await visible()).toEqual([true, false]);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  it('the page keeps no region setting: no cookie, no storage key, no change to a price', async () => {
    const { context, page } = await open(390, 'dark');
    try {
      const keysBefore = (await page.evaluate(`Object.keys(localStorage).concat(Object.keys(sessionStorage))`)) as string[];
      const priceBefore = (await page.evaluate(`Array.from(document.querySelectorAll('#view')).map((v) => v.textContent).join('').match(/\\u00a3[0-9.,]+/g)?.slice(0, 20).join(' ') ?? ''`)) as string;
      await page.click('#region-btn');
      for (const id of ['US', 'IN', 'GB']) await page.click(`[data-region="${id}"]`, { force: true });
      await page.waitForTimeout(150);
      const keysAfter = (await page.evaluate(`Object.keys(localStorage).concat(Object.keys(sessionStorage))`)) as string[];
      expect(keysAfter).toEqual(keysBefore);
      expect(await page.evaluate(`document.cookie`)).toBe('');
      const priceAfter = (await page.evaluate(`Array.from(document.querySelectorAll('#view')).map((v) => v.textContent).join('').match(/\\u00a3[0-9.,]+/g)?.slice(0, 20).join(' ') ?? ''`)) as string;
      expect(priceAfter).toBe(priceBefore);
      expect(await page.evaluate(`document.querySelector('#region-btn').getAttribute('aria-label')`)).toBe('Region and currency: United Kingdom, GBP');
    } finally {
      await context.close();
    }
  }, 90_000);
});

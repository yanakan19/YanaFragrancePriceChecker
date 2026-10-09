import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase, type FakeAccount } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * "Select your country" on the built page (docs/INTERNATIONAL-PLAN.md,
 * section 2, "Welcome"; owner request, 9 October 2026).
 *
 * Off today: the UK is the only live region, so the home page opens exactly
 * as before, with no pop-up, nothing stored and no profile request. The
 * ?regionwelcome=preview address opens it with every region as a choice, which
 * is how the rest of this file drives it: a real <dialog>, focus in and back,
 * Escape, the close button and a tap outside, light and dark, 320, 390 and
 * 1280 wide, axe clean; a choice saved in this browser and, signed in only, on
 * the profile; the sign in link opening the existing sign in. The logic and
 * the markup are tests/regionWelcome.test.ts.
 *
 * Last, the UK prices on a few pages still have the shape they always had
 * (tests/ukPricesUnchanged.test.ts holds the formatter to the old code for
 * every price in the data).
 */

type Mode = 'dark' | 'light';

const READER: FakeAccount = {
  email: 'reader@example.com',
  createdAt: '2026-09-20T10:00:00Z',
  wishlist: [],
  priceAlerts: false,
};

describe.skipIf(!built)('Select your country', () => {
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

  async function open(
    route: string,
    opts: { width?: number; mode?: Mode; account?: FakeAccount | null; timezoneId?: string } = {},
  ): Promise<{ context: BrowserContext; page: Page; requests: string[] }> {
    const context = await browser.newContext({ viewport: { width: opts.width ?? 390, height: 844 }, timezoneId: opts.timezoneId ?? 'America/New_York' });
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, opts.mode ?? 'light');
    await stubSupabase(context, opts.account ?? null, null);
    const page = await context.newPage();
    const requests: string[] = [];
    page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    return { context, page, requests };
  }

  const dialogOpen = (page: Page) => page.evaluate(`!!document.querySelector('#region-welcome[open]')`) as Promise<boolean>;
  const stored = (page: Page) => page.evaluate(`localStorage.getItem('pricesniffs.region')`) as Promise<string | null>;
  const focused = (page: Page) =>
    page.evaluate(`(() => { const a = document.activeElement; return a ? (a.getAttribute('data-region-choice') || a.id || a.className || a.tagName) : null; })()`) as Promise<string>;

  async function axe(page: Page): Promise<string[]> {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    return r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }

  it('is off while the UK is the only live region: the home page opens as before', async () => {
    const { context, page, requests } = await open('/', { account: READER });
    try {
      await page.waitForTimeout(1200);
      expect(await dialogOpen(page)).toBe(false);
      expect(await page.evaluate(`document.querySelectorAll('#region-welcome').length`)).toBe(0);
      expect(await stored(page)).toBeNull();
      expect(requests.filter((r) => /profiles\?select=region/.test(r)), 'no profile request for the region').toEqual([]);
      expect(await page.evaluate(`document.querySelectorAll('link[rel="alternate"][hreflang]').length`), 'no hreflang').toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`at ${width}px (${mode}): a real dialog, focus in and back, Escape, axe clean, fits`, async () => {
        const { context, page } = await open('/?regionwelcome=preview', { width, mode });
        try {
          await page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
          const d = (await page.evaluate(`(() => {
            const dlg = document.querySelector('#region-welcome');
            const r = dlg.getBoundingClientRect();
            return {
              tag: dlg.tagName, modal: dlg.matches(':modal'), labelled: document.getElementById(dlg.getAttribute('aria-labelledby')).textContent,
              choices: Array.from(dlg.querySelectorAll('[data-region-choice]')).map((a) => [a.dataset.regionChoice, a.getAttribute('href'), a.textContent.replace(/\\s+/g, ' ').trim()]),
              login: dlg.querySelector('[data-region-welcome-login]').textContent, loginHref: dlg.querySelector('[data-region-welcome-login]').getAttribute('href'),
              left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight,
              scrollW: document.documentElement.scrollWidth,
              minChoice: Math.min(...Array.from(dlg.querySelectorAll('[data-region-choice]')).map((a) => a.getBoundingClientRect().height)),
              close: dlg.querySelector('[data-region-welcome-close]').getBoundingClientRect().width,
            };
          })()`)) as Record<string, unknown> & { choices: string[][]; left: number; right: number; top: number; bottom: number; vw: number; vh: number; scrollW: number; minChoice: number; close: number };
          expect(d.tag).toBe('DIALOG');
          expect(d.modal).toBe(true);
          expect(d.labelled).toBe('Select your country');
          expect(d.choices).toEqual([
            ['GB', '/', 'United Kingdom £ GBP'],
            ['US', '/us/', 'United States $ USD Suggested'],
            ['IN', '/in/', 'India ₹ INR'],
          ]);
          expect(d.login).toBe("or log in, we'll remember your preference");
          expect(d.loginHref).toBe('/account');
          // A small centred card inside the screen, the page readable around it.
          expect(d.left).toBeGreaterThanOrEqual(0);
          expect(d.right).toBeLessThanOrEqual(d.vw);
          expect(d.bottom).toBeLessThanOrEqual(d.vh);
          expect(d.right - d.left).toBeLessThanOrEqual(400);
          expect(d.scrollW, 'no sideways scroll').toBeLessThanOrEqual(d.vw);
          expect(d.minChoice, 'large targets').toBeGreaterThanOrEqual(44);
          expect(d.close).toBeGreaterThanOrEqual(44);
          // Focus starts on the time zone's suggestion (New York: the US).
          expect(await focused(page)).toBe('US');
          expect(await axe(page), 'axe with the pop-up open').toEqual([]);
          // Tab never reaches the page behind (it is inert while the dialog is
          // open): focus is in the dialog, or out in the browser's own bar.
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            const where = await page.evaluate(`document.activeElement === document.body ? 'browser' : document.activeElement.closest('#region-welcome') ? 'dialog' : 'page'`);
            expect(where, `tab ${i}`).not.toBe('page');
          }
          await page.focus('[data-region-choice="GB"]');
          // Escape closes it, saves nothing, and focus leaves the dialog.
          await page.keyboard.press('Escape');
          await page.waitForFunction(`!document.querySelector('#region-welcome')`, null, { timeout: 5_000 });
          expect(await dialogOpen(page)).toBe(false);
          expect(await stored(page)).toBeNull();
          expect(await page.evaluate(`location.pathname`)).toBe('/');
          // Back where it was before the pop-up opened on arrival: the page itself.
          expect(await page.evaluate(`document.activeElement === document.body`)).toBe(true);
          expect(await axe(page), 'axe after closing').toEqual([]);
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }

  it('closes from the close button and from a tap outside, saving nothing', async () => {
    const { context, page } = await open('/?regionwelcome=preview', { width: 1280 });
    try {
      await page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
      await page.click('[data-region-welcome-close]');
      expect(await dialogOpen(page)).toBe(false);
      expect(await stored(page)).toBeNull();
    } finally {
      await context.close();
    }
    const second = await open('/?regionwelcome=preview', { width: 390 });
    try {
      await second.page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
      await second.page.mouse.click(4, 6);
      expect(await dialogOpen(second.page)).toBe(false);
      expect(await stored(second.page)).toBeNull();
    } finally {
      await second.context.close();
    }
  }, 90_000);

  it('choosing the United Kingdom stays on the page and remembers it; signed out, nothing goes to a profile', async () => {
    const { context, page, requests } = await open('/?regionwelcome=preview', { timezoneId: 'Europe/London' });
    try {
      await page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
      expect(await focused(page)).toBe('GB');
      await page.click('[data-region-choice="GB"]');
      await page.waitForFunction(`!document.querySelector('#region-welcome')`, null, { timeout: 5_000 });
      expect(await stored(page)).toBe('GB');
      expect(await page.evaluate(`location.pathname`)).toBe('/');
      expect(requests.filter((r) => r.startsWith('PATCH') && r.includes('/rest/v1/profiles'))).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);

  it('choosing the United States remembers it, saves it on a signed in profile, and opens /us/', async () => {
    const account: FakeAccount = { ...READER, writes: [] };
    const { context, page } = await open('/?regionwelcome=preview', { account });
    try {
      await page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
      await Promise.all([page.waitForURL(/\/us\/$/, { timeout: 10_000 }), page.click('[data-region-choice="US"]')]);
      expect(await stored(page)).toBe('US');
      expect(account.writes).toContain('profiles {"region":"US"}');
    } finally {
      await context.close();
    }
  }, 60_000);

  it('the log in link closes it, saves nothing and opens the existing sign in', async () => {
    const { context, page } = await open('/?regionwelcome=preview');
    try {
      await page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
      await page.click('[data-region-welcome-login]');
      await page.waitForSelector('#auth-signin-form', { timeout: 10_000 });
      expect(await page.evaluate(`location.pathname`)).toBe('/account');
      expect(await dialogOpen(page)).toBe(false);
      expect(await stored(page)).toBeNull();
    } finally {
      await context.close();
    }
  }, 60_000);

  it('UK prices keep their shape on the home page, Deals and a product page: £ and two decimals, no other currency', async () => {
    for (const route of ['/', '/deals', '/fragrance/ean-6290360375687']) {
      const { context, page } = await open(route);
      try {
        await page.waitForTimeout(500);
        const text = (await page.evaluate(`document.querySelector('#view').innerText`)) as string;
        const amounts = text.match(/£\s?[0-9][0-9,.]*/g) ?? [];
        expect(amounts.length, route).toBeGreaterThan(0);
        for (const a of amounts) expect(a, route).toMatch(/^£[0-9]+(\.[0-9]{2,3})?\.?,?$/);
        expect(text, route).not.toMatch(/[$₹]\s?[0-9]/);
      } finally {
        await context.close();
      }
    }
  }, 90_000);
});

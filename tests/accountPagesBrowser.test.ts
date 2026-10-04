import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase, type FakeAccount } from './support/fakeAccount.js';
import { liveCounts } from '../demo/data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The account revamp of 2026-10-04 on the built page: the account menu at
 * the top left (mouse and keyboard, dropdown and phone sheet), the three
 * account pages for a signed in reader, Settings reduced to preferences, and
 * About carrying Contact Us, the legal links and numbers counted from data.
 *
 * Signed in states use tests/support/fakeAccount.ts: the app's own Supabase
 * client runs against a stored session and stubbed answers, so nothing here
 * touches the live project and nothing in the app has a test switch.
 */

const READER: FakeAccount = {
  email: 'reader@example.com',
  createdAt: '2026-09-20T10:00:00Z',
  wishlist: [
    { fragrance_id: 'ean-6290360375687', target_price_gbp: 30, added_at: '2026-10-01T09:00:00Z' },
    { fragrance_id: 'ean-3349668508587', target_price_gbp: null, added_at: '2026-10-03T09:00:00Z' },
  ],
  priceAlerts: true,
};

type Mode = 'dark' | 'light';

describe.skipIf(!built)('the account menu, account pages, Settings and About', () => {
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
    opts: { width?: number; mode?: Mode; account?: FakeAccount | null; signInAs?: FakeAccount } = {},
  ): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ viewport: { width: opts.width ?? 390, height: 844 } });
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, opts.mode ?? 'dark');
    await stubSupabase(context, opts.account ?? null, opts.signInAs ?? null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    // The session check is a stubbed round trip; the button says when it is done.
    await page.waitForFunction(`document.querySelector('#account-btn').getAttribute('aria-label') !== 'Account menu'`, null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
    return { context, page };
  }

  async function axe(page: Page): Promise<string[]> {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    return r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }

  const menuLabels = (page: Page) =>
    page.evaluate(`Array.from(document.querySelectorAll('#account-menu [role=menuitem]')).map((b) => b.textContent.trim())`) as Promise<string[]>;

  for (const width of [320, 390, 1280]) {
    for (const mode of ['dark', 'light'] as const) {
      it(`at ${width}px (${mode}): the bar fits, the menu opens and closes by mouse and keyboard, axe passes`, async () => {
        const { context, page } = await open('/', { width, mode });
        try {
          const bar = (await page.evaluate(`(() => {
            const nav = document.querySelector('.nav-items');
            const r = (s) => document.querySelector(s).getBoundingClientRect();
            return {
              doc: document.documentElement.scrollWidth, vw: innerWidth,
              navScroll: nav.scrollWidth, navClient: nav.clientWidth,
              nav: Array.from(nav.querySelectorAll('button')).map((b) => b.textContent.trim()),
              btnRight: r('#account-btn').right, brandLeft: r('#brand-home').left,
              brandRight: r('#brand-home').right, navLeft: r('.nav-items').left,
              searchRight: r('#search').right, rowTop: r('#account-btn').top, brandTop: r('#brand-home').top,
            };
          })()`)) as {
            doc: number; vw: number; navScroll: number; navClient: number; nav: string[];
            btnRight: number; brandLeft: number; brandRight: number; navLeft: number; searchRight: number;
          };
          expect(bar.doc, 'no sideways scroll').toBeLessThanOrEqual(bar.vw);
          expect(bar.nav).toEqual(['Home', 'Deals', 'Explore', 'About']);
          expect(bar.navScroll, 'all four nav words in view').toBeLessThanOrEqual(bar.navClient + 1);
          expect(bar.btnRight, 'button before the brandmark').toBeLessThanOrEqual(bar.brandLeft);
          expect(bar.brandRight, 'brandmark before the nav').toBeLessThanOrEqual(bar.navLeft);
          expect(bar.searchRight).toBeLessThanOrEqual(bar.vw);
          expect(await page.$('#nav-settings')).toBeNull();

          // Mouse: open, then a click outside closes it.
          await page.click('#account-btn');
          expect(await page.getAttribute('#account-btn', 'aria-expanded')).toBe('true');
          expect(await page.isVisible('#account-menu')).toBe(true);
          expect(await menuLabels(page)).toEqual(['Sign In', 'Create an Account', 'Settings']);
          const sheet = (await page.evaluate(`getComputedStyle(document.querySelector('#account-pop')).position`)) as string;
          expect(sheet).toBe(width <= 600 ? 'fixed' : 'absolute');
          expect(await axe(page), 'axe with the menu open').toEqual([]);
          // Somewhere plain (the hero's empty band), not a tile: a pointer
          // left resting on a tile would audit its hover state mid transition.
          const outside = width <= 600 ? { x: Math.round(width / 2), y: 150 } : { x: width - 40, y: 180 };
          await page.mouse.click(outside.x, outside.y);
          expect(await page.getAttribute('#account-btn', 'aria-expanded')).toBe('false');
          expect(await page.isVisible('#account-pop')).toBe(false);

          // Keyboard: Enter opens on the first item, arrows move, Esc closes
          // and hands focus back to the button.
          await page.focus('#account-btn');
          await page.keyboard.press('Enter');
          const focused = () => page.evaluate(`document.activeElement.textContent.trim()`) as Promise<string>;
          expect(await focused()).toBe('Sign In');
          await page.keyboard.press('ArrowDown');
          expect(await focused()).toBe('Create an Account');
          await page.keyboard.press('End');
          expect(await focused()).toBe('Settings');
          await page.keyboard.press('ArrowDown');
          expect(await focused()).toBe('Sign In');
          await page.keyboard.press('Escape');
          expect(await page.getAttribute('#account-btn', 'aria-expanded')).toBe('false');
          expect(await page.evaluate(`document.activeElement.id`)).toBe('account-btn');

          // Tab from the button walks into the menu, and on out of it.
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Tab');
          expect(await focused()).toBe('Create an Account');
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          expect(await page.getAttribute('#account-btn', 'aria-expanded'), 'tabbing out closes it').toBe('false');

          expect(await axe(page), 'axe with the menu closed').toEqual([]);
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }

  it('signed in: the initial, the five items with the wishlist count, and each page by its own address', async () => {
    const { context, page } = await open('/', { account: READER });
    try {
      expect((await page.textContent('#account-btn'))?.trim()).toBe('R');
      expect(await page.getAttribute('#account-btn', 'aria-label')).toBe('Account menu, signed in as reader@example.com');
      await page.click('#account-btn');
      expect(await menuLabels(page)).toEqual(['View My Profile', 'View My Wishlist (2)', 'My Notifications', 'Settings', 'Sign Out']);

      const visits: [string, string, string, string][] = [
        ['View My Wishlist (2)', '/account/wishlist', 'PriceSniffs: My Wishlist', 'My Wishlist'],
        ['My Notifications', '/account/notifications', 'PriceSniffs: My Notifications', 'My Notifications'],
        ['View My Profile', '/account', 'PriceSniffs: My Profile', 'My Profile'],
        ['Settings', '/settings', 'PriceSniffs: Settings', 'Settings'],
      ];
      for (const [label, path, title, h1] of visits) {
        if (!(await page.isVisible('#account-menu'))) await page.click('#account-btn');
        await page.click(`#account-menu [role=menuitem]:text-is("${label}")`);
        await page.waitForTimeout(150);
        expect(new URL(page.url()).pathname).toBe(path);
        expect(await page.title()).toBe(title);
        expect((await page.textContent('#view h1'))?.trim()).toBe(h1);
        expect(await page.getAttribute('meta[name="robots"]', 'content'), `${path} robots`).toContain('noindex');
      }
    } finally {
      await context.close();
    }
  }, 90_000);

  for (const mode of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      it(`signed in at ${width}px (${mode}): the three account pages render and pass axe`, async () => {
        for (const route of ['/account', '/account/wishlist', '/account/notifications']) {
          const { context, page } = await open(route, { account: READER, mode, width });
          try {
            expect(await page.evaluate(`document.documentElement.scrollWidth`), route).toBeLessThanOrEqual(width);
            expect(await axe(page), route).toEqual([]);
          } finally {
            await context.close();
          }
        }
      }, 120_000);
    }
  }

  it('the profile: signed in as, plan Free, sign in details, data download, sign out and delete', async () => {
    const { context, page } = await open('/account', { account: READER });
    try {
      const text = (await page.textContent('#view'))!;
      expect(text).toContain('reader@example.com');
      expect(text).toContain('Account created 20 September 2026');
      expect(text).toMatch(/Your Plan\s*Free/);
      expect(text).toContain('Premium will add browsing with no ads');
      expect(text).not.toMatch(/£\s?\d/);
      for (const s of ['Change Password', 'Change Email', 'Download My Data', 'Sign Out', 'Delete Account']) expect(text).toContain(s);

      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#acct-download')]);
      expect(download.suggestedFilename()).toMatch(/^pricesniffs-my-data-\d{4}-\d{2}-\d{2}\.json$/);
      const file = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
      expect(file.account.email).toBe('reader@example.com');
      expect(file.account.createdAt).toBe('2026-09-20T10:00:00Z');
      expect(file.wishlist.map((w: { fragranceId: string }) => w.fragranceId)).toEqual(['ean-6290360375687', 'ean-3349668508587']);
      expect(file.wishlist[0].targetPriceGbp).toBe(30);
      expect(file.alerts.priceAlertEmails).toBe(true);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('the wishlist: photo, name, price and shop, saved date, target, sort and remove', async () => {
    const { context, page } = await open('/account/wishlist', { account: READER });
    try {
      const rows = () => page.evaluate(`Array.from(document.querySelectorAll('.wishlist-row')).map((r) => ({
        name: r.querySelector('.shop-row-name').textContent.trim(),
        price: r.querySelector('.wishlist-price').textContent.trim(),
        art: !!r.querySelector('.wishlist-art .art'),
        saved: r.textContent.includes('Saved '),
        target: r.querySelector('[data-wishlist-target]')?.value ?? null,
      }))`) as Promise<{ name: string; price: string; art: boolean; saved: boolean; target: string | null }[]>;
      const first = await rows();
      expect(first).toHaveLength(2);
      // Recently Saved: the 3 Oct save before the 1 Oct one.
      expect(first[1]!.target).toBe('30.00');
      for (const r of first) {
        expect(r.art).toBe(true);
        expect(r.saved).toBe(true);
        expect(r.price).toMatch(/£\d+\.\d{2} (delivered at|at) \S|Sold out everywhere today/);
      }
      await page.selectOption('#wishlist-sort', 'cheapest');
      const sorted = await rows();
      const amount = (s: string) => Number(/£(\d+\.\d{2})/.exec(s)?.[1] ?? Infinity);
      expect(amount(sorted[0]!.price)).toBeLessThanOrEqual(amount(sorted[1]!.price));
      await page.click('.wishlist-row [data-wishlist-remove]');
      await page.waitForTimeout(200);
      expect(await rows()).toHaveLength(1);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('notifications: the free opt in, the move to Premium, and Premium as planned with no price or buy button', async () => {
    const { context, page } = await open('/account/notifications', { account: READER });
    try {
      expect(await page.isChecked('#price-alerts')).toBe(true);
      const text = (await page.textContent('#view'))!;
      expect(text).toContain('Email alerts will move to Premium');
      expect(text).toContain('Coming With Premium');
      for (const s of ['No Ads', 'Email Alerts', 'Push Notifications', 'Alert History']) expect(text).toContain(s);
      expect(text).toContain('Planned, Not on Sale Yet');
      expect((await page.textContent('#view .premium-plan'))!, 'no price for Premium').not.toMatch(/£|\d+(\.\d+)? ?(a|per) (month|year)/i);
      expect(await page.$$eval('#view .premium-plan button, #view .premium-plan a', (els) => els.length)).toBe(0);
      expect(text).not.toMatch(/[A-Za-z]-[A-Za-z]/);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('signed out: each account page asks to sign in, and signing in lands on the page asked for', async () => {
    const { context, page } = await open('/account/notifications', { account: null, signInAs: READER });
    try {
      expect((await page.textContent('#view h1'))?.trim()).toBe('My Notifications');
      expect(await page.$('#auth-signin-form')).not.toBeNull();
      await page.fill('#auth-email', READER.email);
      await page.fill('#auth-password', 'correct horse battery');
      await page.click('#auth-signin-form button[type=submit]');
      await page.waitForSelector('#price-alerts', { timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe('/account/notifications');
      expect((await page.textContent('#view h1'))?.trim()).toBe('My Notifications');
    } finally {
      await context.close();
    }
    for (const route of ['/account', '/account/wishlist']) {
      const signedOut = await open(route, { account: null });
      try {
        expect(await signedOut.page.$('#auth-signin-form'), route).not.toBeNull();
      } finally {
        await signedOut.context.close();
      }
    }
  }, 90_000);

  it('Back from a deep linked wishlist goes up to the profile', async () => {
    const { context, page } = await open('/account/wishlist', { account: READER });
    try {
      await page.click('#view [data-back]');
      await page.waitForTimeout(150);
      expect(new URL(page.url()).pathname).toBe('/account');
    } finally {
      await context.close();
    }
  }, 60_000);

  it('Settings holds only Theme and Layout; About holds Contact Us, the legal links and counted numbers', async () => {
    const { context, page } = await open('/settings');
    try {
      const s = (await page.textContent('#view'))!;
      expect(s).toContain('Theme');
      expect(s).toContain('Layout');
      expect(s).toContain('Your choice is saved on this device');
      expect(await page.$('#view #contact-form')).toBeNull();
      expect(s).not.toContain('Contact Us');
      expect(s).not.toContain('Privacy');
      expect(await page.$('#view [data-page]')).toBeNull();
      expect(await page.$('#view [data-go-account]')).toBeNull();

      await page.click('#nav-about');
      await page.waitForTimeout(150);
      expect(await page.title()).toBe('PriceSniffs: About');
      expect(await page.$('#view #contact-form')).not.toBeNull();
      const legal = await page.$$eval('#view nav[aria-label="Legal"] [data-page]', (els) => els.map((e) => e.getAttribute('data-page')));
      expect(legal).toEqual(expect.arrayContaining(['privacy', 'terms', 'cookies', 'affiliate', 'contact']));
      const a = (await page.textContent('#view'))!;
      for (const s2 of ['How Prices Are Checked', 'Delivery Included', 'Checked Daily', 'No Paid Placements', 'Real Price History',
        'How the Site Makes Money', 'Who Runs It', 'Hi, I am Yanny']) expect(a).toContain(s2);
      expect(await page.$$eval('#view .about-faq details > summary', (els) => els.length)).toBeGreaterThanOrEqual(5);
      expect(await page.getAttribute('#view a[href*="tiktok.com"]', 'href')).toContain('yannysniffs');
      expect(await page.getAttribute('#view a[href*="instagram.com"]', 'href')).toContain('yannysniffs');

      const stats = (await page.$$eval('#view [data-stat]', (els) =>
        Object.fromEntries(els.map((e) => [e.getAttribute('data-stat'), Number(e.querySelector('dd')!.textContent!.replace(/,/g, ''))])),
      )) as Record<string, number>;
      const live = liveCounts();
      expect(stats).toEqual({ shops: live.shops, fragrances: live.fragrances, offers: live.offers });
      expect(live.shops).toBeGreaterThan(0);
      expect(live.offers).toBeGreaterThan(0);
      expect(await axe(page)).toEqual([]);
    } finally {
      await context.close();
    }
  }, 90_000);
});

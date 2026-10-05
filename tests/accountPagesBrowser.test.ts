import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Download, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase, type FakeAccount, type FakePhotoFile } from './support/fakeAccount.js';
import { liveCounts } from '../demo/data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The account revamp of 2026-10-04 on the built page: the account menu at
 * the top right (mouse and keyboard, dropdown and phone sheet), the three
 * account pages for a signed in reader, the profile photo, Settings reduced
 * to preferences, and About carrying Contact Us, the legal links and numbers
 * counted from data.
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

  for (const width of [320, 360, 375, 390, 768, 1280]) {
    for (const mode of ['dark', 'light'] as const) {
      it(`at ${width}px (${mode}): the bar fits with the button at the right, the menu opens and closes by mouse and keyboard, axe passes`, async () => {
        const { context, page } = await open('/', { width, mode });
        try {
          const bar = (await page.evaluate(`(() => {
            const nav = document.querySelector('.nav-items');
            const r = (s) => document.querySelector(s).getBoundingClientRect();
            const words = Array.from(nav.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
            return {
              doc: document.documentElement.scrollWidth, vw: innerWidth,
              navScroll: nav.scrollWidth, navClient: nav.clientWidth,
              nav: Array.from(nav.querySelectorAll('button')).map((b) => b.textContent.trim()),
              lastWordRight: words[words.length - 1].right,
              // Lines of text in each nav word and the brandmark: one each when nothing wrapped.
              lines: [...nav.querySelectorAll('button'), document.querySelector('#brand-home')].map((b) => {
                const range = document.createRange();
                range.selectNodeContents(b);
                return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
              }),
              wordTops: words.map((w) => Math.round(w.top)),
              btnLeft: r('#account-btn').left, btnRight: r('#account-btn').right,
              btnTop: r('#account-btn').top, btnBottom: r('#account-btn').bottom,
              brandLeft: r('#brand-home').left, brandRight: r('#brand-home').right,
              brandTop: r('#brand-home').top, brandBottom: r('#brand-home').bottom,
              brandScroll: document.querySelector('#brand-home').scrollWidth,
              brandClient: document.querySelector('#brand-home').clientWidth,
              navLeft: r('.nav-items').left, navRight: r('.nav-items').right,
              searchLeft: r('#search').left, searchRight: r('#search').right, searchTop: r('#search').top,
              rowRight: r('.bar-row').right,
            };
          })()`)) as { nav: string[]; lines: number[]; wordTops: number[] } & Record<
            | 'doc' | 'vw' | 'navScroll' | 'navClient' | 'lastWordRight' | 'btnLeft' | 'btnRight' | 'btnTop' | 'btnBottom'
            | 'brandLeft' | 'brandRight' | 'brandTop' | 'brandBottom' | 'brandScroll' | 'brandClient'
            | 'navLeft' | 'navRight' | 'searchLeft' | 'searchRight' | 'searchTop' | 'rowRight',
            number
          >;
          expect(bar.doc, 'no sideways scroll').toBeLessThanOrEqual(bar.vw);
          expect(bar.nav).toEqual(['Home', 'Deals', 'Explore', 'About']);
          expect(bar.navScroll, 'all four nav words in view').toBeLessThanOrEqual(bar.navClient + 1);
          expect(bar.brandRight, 'brandmark before the nav').toBeLessThanOrEqual(bar.navLeft);
          expect(bar.lastWordRight, 'nav words clear of the button').toBeLessThanOrEqual(bar.btnLeft);
          expect(bar.navRight, 'nav before the button').toBeLessThanOrEqual(bar.btnLeft);
          expect(Math.abs(bar.btnRight - bar.rowRight), 'button at the far right of the row').toBeLessThanOrEqual(1);
          expect(bar.btnRight).toBeLessThanOrEqual(bar.vw);
          expect(bar.brandScroll, 'brandmark not cut off').toBeLessThanOrEqual(bar.brandClient + 1);
          // One line: nothing wrapped, and the button shares the brandmark's row.
          expect(bar.lines, 'no nav word or brandmark wraps').toEqual([1, 1, 1, 1, 1]);
          expect(new Set(bar.wordTops).size, 'nav words on one row').toBe(1);
          expect(bar.btnTop).toBeLessThan(bar.brandBottom);
          expect(bar.btnBottom).toBeGreaterThan(bar.brandTop);
          expect(bar.searchTop, 'search below the row').toBeGreaterThanOrEqual(Math.max(bar.btnBottom, bar.brandBottom));
          expect(bar.searchLeft).toBeGreaterThanOrEqual(0);
          expect(bar.searchRight).toBeLessThanOrEqual(bar.vw);
          expect(await page.$('#nav-settings')).toBeNull();

          // Keyboard order across the bar: brandmark, the four nav items,
          // the account button, then the quick search.
          await page.focus('#brand-home');
          const order: string[] = ['brand-home'];
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            order.push((await page.evaluate(`document.activeElement.id`)) as string);
          }
          expect(order).toEqual(['brand-home', 'nav-home', 'nav-deals', 'nav-explore', 'nav-about', 'account-btn', 'search']);
          await page.evaluate(`document.activeElement.blur()`);

          // Mouse: open, then a click outside closes it.
          await page.click('#account-btn');
          expect(await page.getAttribute('#account-btn', 'aria-expanded')).toBe('true');
          expect(await page.isVisible('#account-menu')).toBe(true);
          expect(await menuLabels(page)).toEqual(['Sign In', 'Create an Account', 'Settings', 'Suggestions']);
          const sheet = (await page.evaluate(`getComputedStyle(document.querySelector('#account-pop')).position`)) as string;
          expect(sheet).toBe(width <= 600 ? 'fixed' : 'absolute');
          const pop = (await page.evaluate(`(() => {
            const p = document.querySelector('#account-pop').getBoundingClientRect();
            const b = document.querySelector('#account-btn').getBoundingClientRect();
            return { left: p.left, right: p.right, bottom: p.bottom, btnRight: b.right, vw: innerWidth, vh: innerHeight };
          })()`)) as { left: number; right: number; bottom: number; btnRight: number; vw: number; vh: number };
          if (width <= 600) {
            // A sheet across the bottom of the screen.
            expect(Math.round(pop.left)).toBe(0);
            expect(Math.round(pop.right)).toBe(pop.vw);
            expect(Math.round(pop.bottom)).toBe(pop.vh);
          } else {
            // A dropdown lined up with the button's right edge, on screen.
            expect(Math.abs(pop.right - pop.btnRight)).toBeLessThanOrEqual(1);
            expect(pop.left).toBeGreaterThanOrEqual(0);
          }
          expect(await axe(page), 'axe with the menu open').toEqual([]);
          // Somewhere plain (the hero's empty band, or the margin outside the
          // column), not a tile and not the menu, which now hangs from the
          // right: a pointer left resting on a tile would audit its hover
          // state mid transition.
          const outside = width <= 600 ? { x: Math.round(width / 2), y: 150 } : { x: 8, y: 180 };
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
          expect(await focused()).toBe('Suggestions');
          await page.keyboard.press('ArrowDown');
          expect(await focused()).toBe('Sign In');
          await page.keyboard.press('Escape');
          expect(await page.getAttribute('#account-btn', 'aria-expanded')).toBe('false');
          expect(await page.evaluate(`document.activeElement.id`)).toBe('account-btn');

          // Tab from the button walks into the menu, and on out of it.
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Tab');
          expect(await focused()).toBe('Create an Account');
          // Settings, then Suggestions, then out of the menu.
          await page.keyboard.press('Tab');
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
      expect(await menuLabels(page)).toEqual(['View My Profile', 'View My Wishlist (2)', 'My Notifications', 'Settings', 'Suggestions', 'Sign Out']);

      const visits: [string, string, string, string][] = [
        ['View My Wishlist (2)', '/account/wishlist', 'PriceSniffs: My Wishlist', 'My Wishlist'],
        ['My Notifications', '/account/notifications', 'PriceSniffs: My Notifications', 'My Notifications'],
        ['View My Profile', '/account', 'PriceSniffs: My Profile', 'My Profile'],
        ['Settings', '/settings', 'PriceSniffs: Settings', 'Settings'],
        ['Suggestions', '/suggestions', 'PriceSniffs: Suggestions', 'Suggestions'],
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
      // Newest to Oldest Saved: the 3 Oct save before the 1 Oct one.
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

  /* ── the profile photo ─────────────────────────────────────────────────
     Every image here is drawn by the test in the browser; nothing real is
     uploaded, and the "upload" lands in the stub, never in the project. */

  /** A fresh reader with photos switched on (each test mutates its own copy). */
  const photoReader = (file: FakePhotoFile | null, enabled = true): FakeAccount => ({
    ...READER,
    wishlist: [...READER.wishlist],
    photo: { enabled, file },
    writes: [],
  });

  /** Draws a test picture in a blank page and returns its bytes. */
  async function drawImage(type: 'image/png' | 'image/webp' | 'image/jpeg', w: number, h: number): Promise<Buffer> {
    const page = await browser.newPage();
    try {
      const b64 = (await page.evaluate(`(() => {
        const c = document.createElement('canvas');
        c.width = ${w}; c.height = ${h};
        const x = c.getContext('2d');
        // Noise, so the encoder has real work to do and the size is honest.
        const img = x.createImageData(${w}, ${h});
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = (i * 7) % 255; img.data[i + 1] = (i * 13) % 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
        }
        x.putImageData(img, 0, 0);
        x.fillStyle = '#c0392b'; x.fillRect(${Math.floor(w / 2) - 20}, ${Math.floor(h / 2) - 20}, 40, 40);
        return c.toDataURL('${type}', 0.92).split(',')[1];
      })()`)) as string;
      return Buffer.from(b64, 'base64');
    } finally {
      await page.close();
    }
  }

  /** A JPEG with an EXIF block inserted after its start marker, carrying a marker string. */
  function withExif(jpeg: Buffer, marker: string): Buffer {
    const tiffHeader = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0, 0, 0, 0, 0, 0]);
    const payload = Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]), tiffHeader, Buffer.from(marker, 'latin1')]);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, payload, jpeg.subarray(2)]);
  }

  const buttonFace = (page: Page) => page.evaluate(`(() => {
    const b = document.querySelector('#account-btn');
    const img = b.querySelector('img');
    return { img: !!img, loaded: img ? img.complete && img.naturalWidth > 0 : false, text: b.textContent.trim(), photoClass: b.classList.contains('has-photo') };
  })()`) as Promise<{ img: boolean; loaded: boolean; text: string; photoClass: boolean }>;

  const readDownload = async (download: Download) =>
    JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));

  it('photos not switched on yet: no control, a plain line, and the initial', async () => {
    const { context, page } = await open('/account', { account: photoReader(null, false) });
    try {
      await page.waitForSelector('.profile-photo-note', { timeout: 15_000 });
      expect((await page.textContent('.profile-photo'))!.trim()).toContain('Adding a profile photo is not available yet.');
      expect(await page.$('#acct-photo-pick')).toBeNull();
      expect(await page.$('#acct-photo-input')).toBeNull();
      expect((await page.textContent('.profile-photo-letter'))?.trim()).toBe('R');
      expect((await buttonFace(page)).text).toBe('R');
    } finally {
      await context.close();
    }
  }, 60_000);

  for (const mode of ['dark', 'light'] as const) {
    it(`a stored photo (${mode}): shown in the button and at the top of the profile, Change and Remove offered, axe passes`, async () => {
      const file = { contentType: 'image/webp', body: await drawImage('image/webp', 256, 256) };
      for (const width of [320, 390, 1280]) {
        const { context, page } = await open('/account', { account: photoReader(file), mode, width });
        try {
          await page.waitForSelector('#account-btn img', { timeout: 15_000 });
          await page.waitForFunction(`document.querySelector('#account-btn img').complete`);
          const face = await buttonFace(page);
          expect(face.img && face.loaded && face.photoClass, `${width} button photo`).toBe(true);
          expect(await page.getAttribute('#account-btn', 'aria-label')).toBe('Account menu, signed in as reader@example.com');
          expect(await page.getAttribute('#account-btn img', 'alt')).toBe('');
          expect(await page.getAttribute('.profile-photo-img', 'alt')).toBe('Your profile photo');
          expect((await page.textContent('#acct-photo-pick'))?.trim()).toBe('Change Photo');
          expect((await page.textContent('#acct-photo-remove'))?.trim()).toBe('Remove Photo');
          expect(await page.getAttribute('#acct-photo-input', 'accept')).toBe('image/jpeg,image/png,image/webp');
          expect(await page.evaluate(`document.documentElement.scrollWidth`)).toBeLessThanOrEqual(width);
          expect(await axe(page), `${width} axe`).toEqual([]);
          // The menu still opens from a photo button.
          await page.click('#account-btn');
          expect(await menuLabels(page)).toEqual(['View My Profile', 'View My Wishlist (2)', 'My Notifications', 'Settings', 'Suggestions', 'Sign Out']);
        } finally {
          await context.close();
        }
      }
    }, 120_000);
  }

  it('a photo that will not load falls back to the initial, in the button and on the profile', async () => {
    const broken = { contentType: 'image/webp', body: Buffer.from('this is not an image at all') };
    const { context, page } = await open('/account', { account: photoReader(broken) });
    try {
      await page.waitForSelector('#acct-photo-pick', { timeout: 15_000 });
      await page.waitForFunction(`!document.querySelector('#account-btn img') && document.querySelector('#account-btn .acct-letter')`, null, { timeout: 15_000 });
      const face = await buttonFace(page);
      expect(face.img).toBe(false);
      expect(face.text).toBe('R');
      expect(await page.$('.profile-photo-img')).toBeNull();
      expect((await page.textContent('.profile-photo-letter'))?.trim()).toBe('R');
      // The stored photo can still be replaced or removed.
      expect((await page.textContent('#acct-photo-pick'))?.trim()).toBe('Change Photo');
      expect(await axe(page)).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);

  it('Add a Photo: shrinks to a small square WebP with no metadata, shows it, then Remove takes it away', async () => {
    const account = photoReader(null);
    const { context, page } = await open('/account', { account });
    try {
      await page.waitForSelector('#acct-photo-pick', { timeout: 15_000 });
      expect((await page.textContent('#acct-photo-pick'))?.trim()).toBe('Add a Photo');
      expect(await page.$('#acct-photo-remove')).toBeNull();

      const marker = 'PRICESNIFFS_TEST_GPS_51.5N';
      const original = withExif(await drawImage('image/jpeg', 1600, 1000), marker);
      expect(original.includes(Buffer.from(marker))).toBe(true);
      await page.setInputFiles('#acct-photo-input', { name: 'holiday.jpg', mimeType: 'image/jpeg', buffer: original });
      await page.waitForSelector('#acct-photo-remove', { timeout: 15_000 });

      const stored = account.photo!.file!;
      expect(stored.contentType).toBe('image/webp');
      expect(stored.body.length).toBeGreaterThan(0);
      expect(stored.body.length).toBeLessThanOrEqual(100 * 1024);
      expect(stored.body.subarray(0, 4).toString('latin1')).toBe('RIFF');
      expect(stored.body.subarray(8, 12).toString('latin1')).toBe('WEBP');
      // The canvas kept pixels only: no EXIF block and no trace of the marker.
      expect(stored.body.includes(Buffer.from(marker))).toBe(false);
      expect(stored.body.includes(Buffer.from('Exif'))).toBe(false);
      expect(account.writes).toContain(`profiles {"avatar_path":"00000000-0000-4000-8000-000000000001/avatar"}`);
      // A square of at most 256px, decoded back in the page.
      const dims = (await page.evaluate(`(async () => {
        const res = await fetch('data:image/webp;base64,${stored.body.toString('base64')}');
        const bmp = await createImageBitmap(await res.blob());
        return [bmp.width, bmp.height];
      })()`)) as [number, number];
      expect(dims).toEqual([256, 256]);

      await page.waitForSelector('#account-btn img');
      await page.waitForFunction(`document.querySelector('#account-btn img').complete`);
      expect((await buttonFace(page)).loaded).toBe(true);
      expect(await page.$('.profile-photo-img')).not.toBeNull();
      expect((await page.textContent('#acct-photo-pick'))?.trim()).toBe('Change Photo');

      await page.click('#acct-photo-remove');
      await page.waitForSelector('#ps-dialog[open]');
      expect((await page.textContent('#ps-dialog-title'))?.trim()).toBe('Remove Your Photo?');
      await page.click('#ps-dialog button[value=confirm]');
      await page.waitForSelector('#acct-photo-pick:text-is("Add a Photo")', { timeout: 15_000 });
      expect(account.photo!.file).toBeNull();
      expect(account.writes).toContain('profiles {"avatar_path":null}');
      expect((await buttonFace(page)).text).toBe('R');
      expect(await page.$('.profile-photo-img')).toBeNull();
    } finally {
      await context.close();
    }
  }, 90_000);

  it('refuses a file of the wrong kind, too large or unreadable with a pop up, and uploads nothing', async () => {
    const account = photoReader(null);
    const { context, page } = await open('/account', { account });
    try {
      await page.waitForSelector('#acct-photo-pick', { timeout: 15_000 });
      const tryFile = async (name: string, mimeType: string, buffer: Buffer) => {
        await page.setInputFiles('#acct-photo-input', { name, mimeType, buffer });
        await page.waitForSelector('#ps-dialog[open]', { timeout: 15_000 });
        const title = (await page.textContent('#ps-dialog-title'))?.trim();
        await page.click('#ps-dialog button[value=confirm]');
        await page.waitForSelector('#ps-dialog[open]', { state: 'detached', timeout: 2000 }).catch(() => {});
        return title;
      };
      expect(await tryFile('cat.gif', 'image/gif', Buffer.from('GIF89a'))).toBe('Choose a JPEG, PNG or WebP');
      expect(await tryFile('huge.jpg', 'image/jpeg', Buffer.alloc(16 * 1024 * 1024, 1))).toBe('That Photo Is Too Large');
      expect(await tryFile('fake.png', 'image/png', Buffer.from('not really a png'))).toBe('That Photo Could Not Be Read');
      expect(account.photo!.file).toBeNull();
      expect(account.writes!.filter((w) => w.startsWith('storage'))).toEqual([]);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('Download My Data says a photo is stored and carries the file; Delete Account removes the photo first', async () => {
    const file = { contentType: 'image/webp', body: await drawImage('image/webp', 64, 64) };
    const account = photoReader(file);
    const { context, page } = await open('/account', { account });
    try {
      await page.waitForSelector('#account-btn img', { timeout: 15_000 });
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#acct-download')]);
      const data = await readDownload(download);
      expect(data.profilePhoto.stored).toBe(true);
      expect(data.profilePhoto.contentType).toBe('image/webp');
      expect(data.profilePhoto.file).toBe(`data:image/webp;base64,${file.body.toString('base64')}`);

      await page.click('#auth-delete');
      await page.waitForSelector('#ps-dialog[open]');
      expect((await page.textContent('#ps-dialog-msg'))!).toContain('your profile photo');
      await page.click('#ps-dialog button[value=confirm]');
      await page.waitForFunction(`document.querySelector('#ps-dialog-title')?.textContent.trim() === 'Account Deleted'`, null, { timeout: 15_000 });
      expect(account.writes).toEqual([
        'storage remove 00000000-0000-4000-8000-000000000001/avatar',
        'profiles {"avatar_path":null}',
        'rpc delete_own_account',
      ]);
      expect(account.photo!.file).toBeNull();
    } finally {
      await context.close();
    }
  }, 90_000);

  it('Download My Data says null for the photo while photos are not switched on', async () => {
    const { context, page } = await open('/account', { account: photoReader(null, false) });
    try {
      await page.waitForSelector('.profile-photo-note', { timeout: 15_000 });
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#acct-download')]);
      const data = await readDownload(download);
      expect(data.profilePhoto).toEqual({ stored: null, contentType: null, file: null });
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

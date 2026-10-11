import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { liveRegions } from '../src/config/regions.js';
import { stubSupabase, type FakeAccount } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html')) && existsSync(resolve(root, 'demo/us/index.html'));

/**
 * The bug of 10 October 2026, in a real browser: a signed in visitor chooses
 * a country (the country menu, or the Country row on the profile page), the
 * write of that choice to their profile fails (the database answers 500, or
 * the connection drops), and the next page load used to send them back to
 * their old country, because the profile still held the old region and the
 * sign in rule said "the profile wins".
 *
 * Now the choice is saved in this browser first, with a pending marker inside
 * the same `pricesniffs.region` value, and wins over the profile until the
 * profile write succeeds (demo/regionPreference.ts). Never a real Supabase:
 * tests/support/fakeAccount.ts answers every request, and fails the profile
 * writes on demand. The rules are tests/regionPreferencePending.test.ts.
 */

const reader = (extra: Partial<FakeAccount> = {}): FakeAccount => ({
  email: 'reader@example.com',
  createdAt: '2026-09-20T10:00:00Z',
  wishlist: [],
  priceAlerts: false,
  writes: [],
  ...extra,
});

describe.skipIf(!built || liveRegions().length < 2)('a failed save of the country choice never moves the visitor', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium({ countryChosen: null });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  async function open(route: string, opts: { account: FakeAccount | null; stored?: string }): Promise<{ context: BrowserContext; page: Page; alerts: string[] }> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/London' });
    await context.addInitScript((stored: string) => {
      try {
        // Only on the first load: a later page load keeps what the page wrote.
        if (stored && !sessionStorage.getItem('seeded')) localStorage.setItem('pricesniffs.region', stored);
        sessionStorage.setItem('seeded', '1');
      } catch {
        /* fine */
      }
    }, opts.stored ?? '');
    await stubSupabase(context, opts.account, null);
    const page = await context.newPage();
    // Anything the visitor would be shown about a failed save: a browser dialog.
    const alerts: string[] = [];
    page.on('dialog', (d) => {
      alerts.push(d.message());
      void d.dismiss();
    });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    return { context, page, alerts };
  }

  const stored = (page: Page) => page.evaluate(`localStorage.getItem('pricesniffs.region')`) as Promise<string | null>;
  const here = (page: Page) => page.evaluate(`location.pathname`) as Promise<string>;
  const profileReads = (page: Page, work: () => Promise<unknown>) =>
    Promise.all([page.waitForRequest((r) => r.method() === 'GET' && /\/rest\/v1\/profiles\?.*select=region/.test(r.url()), { timeout: 20_000 }), work()]);

  /** A page load of the signed in visitor, and the moment the page has heard from the profile and settled. */
  async function reload(page: Page): Promise<void> {
    await profileReads(page, () => page.reload({ waitUntil: 'load' }));
    await waitForApp(page);
    await page.waitForTimeout(600);
  }

  for (const [how, failRegionWrites] of [['the database answers 500', 'status'], ['the connection drops', 'network']] as const) {
    it(`the country menu, signed in, profile GB, ${how}: the visitor stays on /us/ through reloads and a bare UK home opens /us/`, async () => {
      const account = reader({ region: 'GB', failRegionWrites });
      const { context, page, alerts } = await open('/', { account, stored: 'GB' });
      try {
        await page.waitForSelector('#region-btn', { timeout: 15_000 });
        await page.click('#region-btn');
        await Promise.all([page.waitForURL(/\/us\/$/, { timeout: 30_000 }), page.click('[data-region="US"]')]);
        await waitForApp(page);
        expect(account.writes?.filter((w) => w.includes('region')), 'the save was tried').toContain('profiles {"region":"US"}');
        expect(account.region, 'and it failed: the profile still holds the old country').toBe('GB');
        // The choice is the truth in this browser, marked as not yet on the profile.
        expect(await stored(page)).toMatch(/^US\|pending\|\d+$/);

        // The page hears from the profile on this load (it says GB) and must not go back to it.
        await page.waitForTimeout(800);
        expect(await here(page)).toBe('/us/');
        expect(await stored(page)).toMatch(/^US\|pending\|\d+$/);

        // Reloads of the US home, two of them: still the US, the save tried again each time.
        for (let i = 0; i < 2; i++) {
          await reload(page);
          expect(await here(page), `reload ${i + 1}`).toBe('/us/');
          expect(await page.evaluate(`document.documentElement.lang`)).toBe('en-US');
          expect(await stored(page), `reload ${i + 1}`).toMatch(/^US\|pending\|\d+$/);
        }
        expect(account.writes?.filter((w) => w.includes('region')).length, 'tried again on each load').toBeGreaterThanOrEqual(3);
        expect(account.region).toBe('GB');

        // The bare UK home goes to the country chosen, not the other way round.
        await page.goto(`http://127.0.0.1:${port}/favicon.svg`);
        await Promise.all([page.waitForURL(/\/us\/$/, { timeout: 20_000 }), page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'commit' })]);
        await waitForApp(page);
        expect(await here(page)).toBe('/us/');

        // Nothing was shown about the failed save.
        expect(alerts).toEqual([]);
        expect(await page.evaluate(`document.querySelectorAll('dialog[open], [role="alert"]').length`)).toBe(0);

        // Supabase is back: the next load saves the choice and the marker goes.
        account.failRegionWrites = null;
        await reload(page);
        await page.waitForFunction(`localStorage.getItem('pricesniffs.region') === 'US'`, null, { timeout: 10_000 });
        expect(account.region).toBe('US');
        expect(await here(page)).toBe('/us/');
        // And it holds: one more load, no write at all, still the US.
        const writes = account.writes!.length;
        await reload(page);
        expect(account.writes!.length).toBe(writes);
        expect(await here(page)).toBe('/us/');
        expect(await stored(page)).toBe('US');
      } finally {
        await context.close();
      }
    }, 150_000);
  }

  it('the Country row on the profile page, signed in, the save fails: the visitor lands on /us/ and stays', async () => {
    const account = reader({ region: 'GB', failRegionWrites: 'status' });
    const { context, page } = await open('/account?regionwelcome=preview', { account, stored: 'GB' });
    try {
      await page.waitForSelector('[data-acct-country="US"]', { timeout: 15_000 });
      await Promise.all([page.waitForURL(/\/us\/$/, { timeout: 30_000 }), page.click('[data-acct-country="US"]')]);
      await waitForApp(page);
      expect(account.region).toBe('GB');
      expect(await stored(page)).toMatch(/^US\|pending\|\d+$/);
      await reload(page);
      expect(await here(page)).toBe('/us/');
      expect(await stored(page)).toMatch(/^US\|pending\|\d+$/);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('a settled choice is the plain region, and the profile\'s country still wins over a choice made before signing in', async () => {
    // Saved fine: the plain region, no marker.
    const ok = reader({ region: 'GB' });
    const first = await open('/', { account: ok, stored: 'GB' });
    try {
      await first.page.click('#region-btn');
      await Promise.all([first.page.waitForURL(/\/us\/$/, { timeout: 30_000 }), first.page.click('[data-region="US"]')]);
      await waitForApp(first.page);
      await first.page.waitForFunction(`localStorage.getItem('pricesniffs.region') === 'US'`, null, { timeout: 10_000 });
      expect(ok.region).toBe('US');
    } finally {
      await first.context.close();
    }
    // A choice made in this browser before signing in (no marker) loses to the profile, as before.
    const other = reader({ region: 'IN' });
    const second = await open('/account?regionwelcome=preview', { account: other, stored: 'US' });
    try {
      await second.page.waitForFunction(`localStorage.getItem('pricesniffs.region') === 'IN'`, null, { timeout: 15_000 });
      expect(other.writes?.filter((w) => w.includes('region'))).toEqual([]);
    } finally {
      await second.context.close();
    }
  }, 120_000);

  it('signed out: only the local key is written, no marker, and nothing is sent to any profile', async () => {
    const { context, page } = await open('/', { account: null, stored: 'GB' });
    const profileRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/rest\/v1\/profiles/.test(r.url())) profileRequests.push(`${r.method()} ${r.url()}`);
    });
    try {
      await page.click('#region-btn');
      await Promise.all([page.waitForURL(/\/us\/$/, { timeout: 30_000 }), page.click('[data-region="US"]')]);
      await waitForApp(page);
      await page.waitForTimeout(600);
      expect(await stored(page)).toBe('US');
      expect(profileRequests).toEqual([]);
      expect(await page.evaluate(`Object.keys(localStorage).filter((k) => !k.startsWith('pricesniffs.display'))`)).toEqual(['pricesniffs.region']);
    } finally {
      await context.close();
    }
  }, 90_000);
});

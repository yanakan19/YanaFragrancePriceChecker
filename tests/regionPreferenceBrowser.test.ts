import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page, Route } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { liveRegions } from '../src/config/regions.js';
import { SUPABASE_HOST, stubSupabase, type FakeAccount } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The remembered country on the built page (docs/INTERNATIONAL-PLAN.md,
 * section 2, "Welcome", "Remembered preference: built 9 Oct 2026"): the
 * Country row on the profile page, and the profile and this browser agreeing
 * for a signed in reader.
 *
 * The row shows once a second region is live. While the UK is the only one
 * it is absent and the page asks the profile nothing about a country. The
 * ?regionwelcome=preview address shows it with every region as a choice
 * whatever the switches say, which is how the rest of this file drives it:
 * light and dark, 320, 390 and 1280 wide, axe clean; a choice saved in this
 * browser and on the profile, then that region's home; the profile's country
 * mirrored into this browser; a choice made here before signing in copied to
 * an empty profile; a switch from the country menu on /us/ to the UK whose
 * profile write was refused, or was too slow and cancelled by the page load,
 * kept and written again rather than undone (11 Oct 2026; the rule is
 * tests/regionPreferencePending.test.ts, a 500 and a dropped connection are
 * tests/regionSaveFailedBrowser.test.ts). Never a real Supabase: tests/support/fakeAccount.ts
 * answers every request. The rules themselves are
 * tests/regionPreference.test.ts.
 */

type Mode = 'dark' | 'light';

const reader = (extra: Partial<FakeAccount> = {}): FakeAccount => ({
  email: 'reader@example.com',
  createdAt: '2026-09-20T10:00:00Z',
  wishlist: [],
  priceAlerts: false,
  writes: [],
  ...extra,
});

describe.skipIf(!built)('the Country row and the remembered country', () => {
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

  async function open(
    route: string,
    opts: { width?: number; mode?: Mode; account?: FakeAccount | null; stored?: string } = {},
  ): Promise<{ context: BrowserContext; page: Page; requests: string[] }> {
    const context = await browser.newContext({ viewport: { width: opts.width ?? 390, height: 844 }, timezoneId: 'Europe/London' });
    await context.addInitScript(
      ([m, stored]: [string, string]) => {
        try {
          localStorage.setItem('pricesniffs.display', m);
          // Only on the first load: a later page load keeps what the page wrote.
          if (stored && !sessionStorage.getItem('seeded')) localStorage.setItem('pricesniffs.region', stored);
          sessionStorage.setItem('seeded', '1');
        } catch {
          /* fine */
        }
      },
      [opts.mode ?? 'light', opts.stored ?? ''] as [string, string],
    );
    await stubSupabase(context, opts.account ?? null, null);
    const page = await context.newPage();
    const requests: string[] = [];
    page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    return { context, page, requests };
  }

  const stored = (page: Page) => page.evaluate(`localStorage.getItem('pricesniffs.region')`) as Promise<string | null>;
  /** The stored choice's region, whatever its pending marker says (demo/regionWelcome.ts, readStoredChoice). */
  const storedId = async (page: Page) => (await stored(page))?.split('|')[0] ?? null;
  /** True while the stored choice carries the pending marker: chosen signed in, not yet confirmed by the profile. */
  const pendingMark = async (page: Page) => /^[A-Z]{2}\|pending\|\d+$/.test((await stored(page)) ?? '');
  const pressed = (page: Page) =>
    page.evaluate(`Array.from(document.querySelectorAll('[data-acct-country][aria-pressed="true"]')).map((b) => b.dataset.acctCountry)`) as Promise<string[]>;

  async function axe(page: Page): Promise<string[]> {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    return r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }

  it('shows on the profile only once a second region is live; while the UK is alone, no row and no country request', async () => {
    const { context, page, requests } = await open('/account', { account: reader({ region: 'US' }) });
    try {
      await page.waitForSelector('.profile-photo', { timeout: 15_000 });
      await page.waitForTimeout(800);
      const on = liveRegions().length >= 2;
      expect(await page.evaluate(`document.querySelectorAll('.acct-country').length`)).toBe(on ? 1 : 0);
      if (!on) {
        expect(requests.filter((r) => /profiles\?select=region/.test(r)), 'no profile request for the country').toEqual([]);
        expect(await stored(page)).toBeNull();
      }
    } finally {
      await context.close();
    }
  }, 60_000);

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`at ${width}px (${mode}): three countries drawn like the pop-up, the current one marked, fits, axe clean`, async () => {
        const { context, page } = await open('/account?regionwelcome=preview', { width, mode, account: reader() });
        try {
          await page.waitForSelector('.acct-country', { timeout: 15_000 });
          const d = (await page.evaluate(`(() => {
            const row = document.querySelector('.acct-country');
            const r = row.getBoundingClientRect();
            const buttons = Array.from(row.querySelectorAll('[data-acct-country]'));
            const pressedBtn = row.querySelector('[aria-pressed="true"]');
            const other = row.querySelector('[aria-pressed="false"]');
            return {
              label: document.getElementById(row.getAttribute('aria-labelledby')).textContent,
              choices: buttons.map((b) => [b.dataset.acctCountry, b.textContent.replace(/\\s+/g, ' ').trim(), b.querySelectorAll('svg.flag').length]),
              minHeight: Math.min(...buttons.map((b) => b.getBoundingClientRect().height)),
              left: r.left, right: r.right, vw: innerWidth, scrollW: document.documentElement.scrollWidth,
              overflow: buttons.some((b) => b.scrollWidth > b.clientWidth + 1),
              pressedBg: getComputedStyle(pressedBtn).backgroundColor, otherBg: getComputedStyle(other).backgroundColor,
              tick: !!pressedBtn.querySelector('.acct-country-tick svg'),
              afterPlan: row.previousElementSibling && row.previousElementSibling.getAttribute('aria-label'),
            };
          })()`)) as { label: string; choices: [string, string, number][]; minHeight: number; left: number; right: number; vw: number; scrollW: number; overflow: boolean; pressedBg: string; otherBg: string; tick: boolean; afterPlan: string };
          expect(d.label).toBe('Country');
          expect(d.choices).toEqual([
            ['GB', 'United Kingdom £ GBP', 1],
            ['US', 'United States $ USD', 1],
            ['IN', 'India ₹ INR', 1],
          ]);
          // Nothing saved anywhere: the region the page is in is the one marked.
          expect(await pressed(page)).toEqual(['GB']);
          expect(d.tick).toBe(true);
          expect(d.pressedBg, 'the current choice stands out').not.toBe(d.otherBg);
          expect(d.afterPlan).toBe('Your Plan');
          expect(d.minHeight, 'large targets').toBeGreaterThanOrEqual(44);
          expect(d.left).toBeGreaterThanOrEqual(0);
          expect(d.right).toBeLessThanOrEqual(d.vw);
          expect(d.scrollW, 'no sideways scroll').toBeLessThanOrEqual(d.vw);
          expect(d.overflow, 'no text cut off').toBe(false);
          expect(await axe(page)).toEqual([]);
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }

  it('pressing the United States saves it here and on the profile, then opens /us/', async () => {
    const account = reader();
    const { context, page } = await open('/account?regionwelcome=preview', { account });
    try {
      await page.waitForSelector('[data-acct-country="US"]', { timeout: 15_000 });
      await Promise.all([page.waitForURL(/\/us\/$/, { timeout: 10_000 }), page.click('[data-acct-country="US"]')]);
      expect(await stored(page)).toBe('US');
      expect(account.writes).toContain('profiles {"region":"US"}');
      expect(account.region).toBe('US');
    } finally {
      await context.close();
    }
  }, 60_000);

  it('pressing the country the page is in saves it, stays, keeps it marked and keeps the focus', async () => {
    const account = reader();
    const { context, page } = await open('/account?regionwelcome=preview', { account });
    try {
      await page.waitForSelector('[data-acct-country="GB"]', { timeout: 15_000 });
      await page.focus('[data-acct-country="GB"]');
      await page.keyboard.press('Enter');
      await page.waitForFunction(`localStorage.getItem('pricesniffs.region') === 'GB' && !document.querySelector('[data-acct-country]:disabled')`, null, { timeout: 10_000 });
      expect(account.writes).toContain('profiles {"region":"GB"}');
      expect(await page.evaluate(`location.pathname`)).toBe('/account');
      expect(await pressed(page)).toEqual(['GB']);
      expect(await page.evaluate(`document.activeElement && document.activeElement.dataset.acctCountry`)).toBe('GB');
    } finally {
      await context.close();
    }
  }, 60_000);

  it('a country saved on the profile wins over this browser and is mirrored here', async () => {
    const account = reader({ region: 'IN' });
    const { context, page } = await open('/account?regionwelcome=preview', { account, stored: 'US' });
    try {
      await page.waitForFunction(`document.querySelector('[data-acct-country="IN"][aria-pressed="true"]')`, null, { timeout: 15_000 });
      expect(await stored(page)).toBe('IN');
      expect(account.writes?.filter((w) => w.includes('region'))).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);

  it('a choice made in this browser before signing in is copied to a profile that has none', async () => {
    const account = reader({ region: null });
    const { context, page } = await open('/account?regionwelcome=preview', { account, stored: 'US' });
    try {
      await page.waitForSelector('[data-acct-country="US"][aria-pressed="true"]', { timeout: 15_000 });
      await expect.poll(() => account.writes?.filter((w) => w.includes('region')), { timeout: 10_000 }).toEqual(['profiles {"region":"US"}']);
      expect(await stored(page)).toBe('US');
    } finally {
      await context.close();
    }
  }, 60_000);

  /**
   * Answers the profile's country writes here, ahead of the stub: `answer`
   * gets each in turn (counted from 0) and refuses it, holds it, or passes it
   * on to the stub, which saves it on the account. Answers what was sent.
   */
  async function answerRegionWrites(context: BrowserContext, answer: (route: Route, n: number) => Promise<void>): Promise<string[]> {
    const sent: string[] = [];
    await context.route(`${SUPABASE_HOST}/rest/v1/profiles**`, async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH' || !(req.postData() ?? '').includes('"region"')) return route.fallback();
      sent.push(req.postData() ?? '');
      await answer(route, sent.length - 1);
    });
    return sent;
  }

  /** The country menu on /us/: United Kingdom, then the UK home once it has loaded. */
  async function chooseUkFromMenu(page: Page): Promise<void> {
    await page.click('#region-btn');
    await Promise.all([page.waitForURL((u) => u.pathname === '/', { timeout: 30_000 }), page.click('[data-region="GB"]')]);
    await waitForApp(page);
  }

  /** The bare home page, given time to reconcile and to move if it is going to. */
  async function openBareHome(page: Page): Promise<string> {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(1500);
    return (await page.evaluate(`location.pathname`)) as string;
  }

  it('the US on the profile, the UK chosen on /us/ and the profile write refused: the UK holds, the write is tried again, and lands once accepted', async () => {
    const account = reader({ region: 'US' });
    const { context, page } = await open('/us/', { account, stored: 'US' });
    let refuse = true;
    const sent = await answerRegionWrites(context, (route) =>
      refuse
        ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'permission denied for table profiles' }) })
        : route.fallback(),
    );
    try {
      await chooseUkFromMenu(page);
      // The UK page reads the profile (still the US) and writes the UK to it
      // again, instead of taking the US back into this browser.
      await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
      expect(sent.every((b) => b === '{"region":"GB"}'), sent.join(' ')).toBe(true);
      expect(await storedId(page)).toBe('GB');
      expect(await pendingMark(page)).toBe(true);
      expect(account.region).toBe('US');
      // The bare home page is not sent back to /us/.
      expect(await openBareHome(page)).toBe('/');
      expect(await storedId(page)).toBe('GB');
      // The profile takes writes again: the next page load saves the UK there and drops the mark.
      refuse = false;
      await page.reload({ waitUntil: 'load' });
      await expect.poll(() => account.region, { timeout: 10_000 }).toBe('GB');
      await expect.poll(() => stored(page), { timeout: 10_000 }).toBe('GB');
      expect(account.writes?.filter((w) => w.includes('region'))).toEqual(['profiles {"region":"GB"}']);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('the profile write slower than the choice waits for, and cancelled by the page load: the UK holds and the write from the UK page lands', async () => {
    const account = reader({ region: 'US' });
    const { context, page } = await open('/us/', { account, stored: 'US' });
    const sent = await answerRegionWrites(context, async (route, n) => {
      if (n > 0) return route.fallback();
      // Four seconds, past PROFILE_WAIT_MS: the menu goes on to the UK home
      // without it, and that page load cancels it, so it never lands.
      await new Promise((r) => setTimeout(r, 4000));
      await route.abort().catch(() => undefined);
    });
    try {
      await chooseUkFromMenu(page);
      await expect.poll(() => account.region, { timeout: 15_000 }).toBe('GB');
      // Saved: the marker goes, leaving the plain region.
      await expect.poll(() => stored(page), { timeout: 10_000 }).toBe('GB');
      expect(sent.length).toBeGreaterThanOrEqual(2);
      expect(await openBareHome(page)).toBe('/');
      expect(await stored(page)).toBe('GB');
    } finally {
      await context.close();
    }
  }, 90_000);
});

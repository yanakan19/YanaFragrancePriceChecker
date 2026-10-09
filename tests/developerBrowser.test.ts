import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page, Request } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase, FAKE_USER_ID, SUPABASE_HOST, type FakeAccount } from './support/fakeAccount.js';
import { siteHeadScript, type SiteBuild } from '../scripts/siteBuild.js';
import { slugify } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));
const SHOTS = process.env.DEV_SHOTS ? resolve(process.env.DEV_SHOTS) : null;

// Each test loads the whole site in a fresh browser context.
vi.setConfig({ testTimeout: 90_000 });

/**
 * The developer dashboard and the visitor counter on the built page.
 *
 * The local build is the one every build but the deploy makes: counter off,
 * nothing hidden, and it must be the site exactly as before. The tests that
 * need the counter on, or something hidden, serve the same page with the head
 * script the deploy would write (scripts/siteBuild.ts) put in, and every
 * request to the database is answered by tests/support/fakeAccount.ts or by
 * the test itself. Nothing here reaches the live project.
 */

// Named here rather than read from demo/data.ts: loading the whole catalogue
// into the test process as well as the browser costs gigabytes, and other
// agents' test runs share the machine. tests/accountPagesBrowser.test.ts uses
// the same product.
const PRODUCT = { id: 'ean-6290360375687', slug: 'french_avenue_azzure_aoud_100ml', name: 'Azzure Aoud', brand: 'French Avenue' };
const HIDDEN_BRAND = 'Lattafa';
const HIDDEN_BRAND_PRODUCT = 'lattafa_asad_100ml';

const STATS = {
  series: [
    ['2026-10-01T00:00', 120, 40],
    ['2026-10-02T00:00', 90, 31],
  ],
  countries: [['GB', 180, 60], ['', 30, 11]],
  pages: [['/', 80], [`/${PRODUCT.slug}`, 22]],
  sources: [['google.com', 25], ['tiktok.com', 9]],
  clicks: [[PRODUCT.id, PRODUCT.brand, 'allbeauty', 6], [PRODUCT.id, PRODUCT.brand, 'boots', 2]],
};

function owner(over: Partial<FakeAccount> = {}): FakeAccount {
  return {
    email: 'owner@example.com',
    createdAt: '2026-09-01T10:00:00Z',
    wishlist: [],
    priceAlerts: false,
    writes: [],
    site: { isAdmin: true, stats: STATS, overrides: [{ kind: 'brand', key: 'armaf', state: 'hidden', name: 'Armaf' }] },
    ...over,
  };
}

type Mode = 'dark' | 'light';

describe.skipIf(!built)('the developer dashboard and the visitor counter', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  async function open(
    route: string,
    opts: { width?: number; mode?: Mode; account?: FakeAccount | null; site?: SiteBuild; liveOverrides?: unknown[]; human?: boolean } = {},
  ): Promise<{ context: BrowserContext; page: Page; supabase: Request[]; errors: string[] }> {
    const context = await browser.newContext({
      viewport: { width: opts.width ?? 390, height: 844 },
      // The page's own service worker would answer later loads from its cache,
      // past the rewritten document below.
      serviceWorkers: 'block',
      // A visitor's browser, not an automated one, where the counter is under test.
      ...(opts.human ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' } : {}),
    });
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, opts.mode ?? 'dark');
    if (opts.human) await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    await stubSupabase(context, opts.account ?? null);
    const supabase: Request[] = [];
    context.on('request', (r) => {
      if (r.url().startsWith(SUPABASE_HOST)) supabase.push(r);
    });
    // The two counting functions, as migration 0007 makes them: they add one
    // and answer nothing. (Missing, they answer 404 and the counter stops.)
    await context.route(`${SUPABASE_HOST}/rest/v1/rpc/count_*`, (r) => r.fulfill({ status: 204, body: '' }));
    if (opts.liveOverrides) {
      await context.route(`${SUPABASE_HOST}/rest/v1/site_overrides**`, (r) =>
        r.request().method() === 'GET'
          ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.liveOverrides) })
          : r.fallback(),
      );
    }
    if (opts.site) {
      const script = siteHeadScript(opts.site);
      await context.route(`http://127.0.0.1:${port}/**`, async (r) => {
        if (r.request().resourceType() !== 'document') return r.fallback();
        const res = await r.fetch();
        const html = (await res.text()).replace(
          /(<script>\(function \(\) \{\n  var files = [\s\S]*?<\/script>\n)/,
          (m) => `${m}<script>${script}</script>\n`,
        );
        return r.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html' } });
      });
    }
    const page = await context.newPage();
    const errors: string[] = [];
    // Errors of the page's own making. A resource the sandbox cannot reach (a
    // shop's photo) or one the stub answers as missing is not one.
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(400);
    return { context, page, supabase, errors };
  }

  async function axe(page: Page): Promise<string[]> {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    return r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }

  const h1 = (page: Page) => page.evaluate(`document.querySelector('#view h1')?.textContent.trim() ?? ''`) as Promise<string>;

  it('with no database set up, the built page is the site as before: no script, no counting, no requests', async () => {
    const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
    expect(html).not.toMatch(/window\.__psSite\s*=/);
    const { context, page, supabase, errors } = await open(`/${PRODUCT.slug}`, { human: true });
    try {
      expect(await h1(page)).toContain(PRODUCT.name);
      await page.evaluate(`(() => {
        const a = document.querySelector('a.offer-link[data-shop]');
        a.addEventListener('click', (e) => e.preventDefault());
        a.click();
      })()`);
      await page.click('#nav-deals');
      await page.waitForTimeout(1500);
      const counted = supabase.filter((r) => /rpc\/count_|site_overrides/.test(r.url()));
      expect(counted.map((r) => r.url())).toEqual([]);
      expect(await page.evaluate('typeof window.__psSite')).toBe('undefined');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('with the counter on: a page view, the next page, and a shop click, each without a cookie or an identifier', async () => {
    const { context, page, supabase } = await open('/', { human: true, site: { stats: true, overrides: [], source: 'file' }, liveOverrides: [] });
    try {
      await page.waitForTimeout(3500);
      await page.evaluate(`history.pushState({}, '', '/${PRODUCT.slug}'); dispatchEvent(new PopStateEvent('popstate'))`);
      await page.waitForTimeout(800);
      await page.evaluate(`(() => {
        const a = document.querySelector('a.offer-link[data-shop]');
        a.addEventListener('click', (e) => e.preventDefault());
        a.click();
      })()`);
      await page.waitForTimeout(800);
      const posts = supabase.filter((r) => r.method() === 'POST' && /rpc\/count_/.test(r.url()));
      const bodies = posts.map((r) => ({ fn: r.url().split('/rpc/')[1], body: JSON.parse(r.postData() ?? '{}') as Record<string, unknown>, cookie: r.headers()['cookie'] }));
      const views = bodies.filter((b) => b.fn === 'count_page_view');
      expect(views.length).toBeGreaterThanOrEqual(2);
      expect(views[0]!.body).toEqual({ p_page: '/', p_entry: true, p_referrer: '' });
      expect(views.some((v) => v.body.p_page === `/${PRODUCT.slug}` && v.body.p_entry === false)).toBe(true);
      const click = bodies.find((b) => b.fn === 'count_shop_click')!;
      expect(Object.keys(click.body).sort()).toEqual(['p_brand', 'p_product', 'p_retailer']);
      expect(click.body.p_product).toBe(PRODUCT.id);
      expect(typeof click.body.p_brand === 'string' && click.body.p_brand.length > 0).toBe(true);
      expect(typeof click.body.p_retailer === 'string' && /^[a-z0-9-]+$/.test(click.body.p_retailer)).toBe(true);
      for (const b of bodies) expect(b.cookie).toBeUndefined();
      expect(await page.evaluate('document.cookie')).toBe('');
      const stored = (await page.evaluate('Object.keys(localStorage).concat(Object.keys(sessionStorage))')) as string[];
      // The display choice, and the country the test browser starts with (launchChromium, scripts/a11y-audit.ts).
      expect(stored.filter((k) => !k.startsWith('pricesniffs.display') && k !== 'pricesniffs.region')).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('a brand hidden at the last deploy is off the site from the first paint', async () => {
    const key = slugify(HIDDEN_BRAND);
    const { context, page } = await open(`/brands/${key}`, {
      site: { stats: false, overrides: [{ kind: 'brand', key, state: 'hidden' }], source: 'file' },
    });
    try {
      expect(await h1(page)).toBe('Page Not Found');
      // The search finds none of its products (Lattafa Pride and Lattafa
      // Perfume are brands of their own, with addresses of their own).
      await page.fill('#search', HIDDEN_BRAND);
      await page.waitForTimeout(800);
      const labels = (await page.evaluate(`Array.from(document.querySelectorAll('button[data-frag]')).map((t) => t.getAttribute('aria-label'))`)) as string[];
      expect(labels.filter((l) => /^Lattafa (?!Pride |Perfume )/.test(l)), 'no tile of the hidden brand').toEqual([]);
      // Nor does its product page open.
      await page.goto(`http://127.0.0.1:${port}/${HIDDEN_BRAND_PRODUCT}`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForTimeout(1500);
      expect(await h1(page)).toBe('Page Not Found');
    } finally {
      await context.close();
    }
  });

  it('a shop hidden since the last deploy vanishes on the next page load, from the live list', async () => {
    const { context, page } = await open('/retailers/allbeauty', {
      site: { stats: true, overrides: [], source: 'file' },
      liveOverrides: [{ kind: 'retailer', key: 'allbeauty', state: 'hidden' }],
    });
    try {
      expect(await h1(page)).toBe('Page Not Found');
    } finally {
      await context.close();
    }
  });

  it('signed out, /developer is the ordinary Page Not Found, noindex', async () => {
    const { context, page } = await open('/developer');
    try {
      expect(await h1(page)).toBe('Page Not Found');
      expect(await page.title()).toBe('PriceSniffs: Page not found');
      expect(await page.evaluate(`document.querySelector('meta[name=robots]')?.content ?? ''`)).toContain('noindex');
    } finally {
      await context.close();
    }
  });

  it('signed in but not the owner, it is Page Not Found too', async () => {
    const { context, page } = await open('/developer', { account: owner({ site: { isAdmin: false, stats: STATS } }) });
    try {
      await page.waitForTimeout(300);
      expect(await h1(page)).toBe('Page Not Found');
      expect(await page.title()).toBe('PriceSniffs: Page not found');
    } finally {
      await context.close();
    }
  });

  it('before migration 0007, a signed in account is shown Not Set Up Yet with the exact steps', async () => {
    const { site: _site, ...notSetUp } = owner();
    const { context, page } = await open('/developer', { account: notSetUp });
    try {
      await page.waitForSelector('#dev-setup-h');
      const text = (await page.evaluate(`document.querySelector('#view').textContent`)) as string;
      expect(text).toContain('Not Set Up Yet');
      expect(text).toContain('0007_site_stats.sql');
      expect(text).toContain(`where id = '${FAKE_USER_ID}'`);
    } finally {
      await context.close();
    }
  });

  for (const width of [320, 390, 1280]) {
    for (const mode of ['dark', 'light'] as const) {
      it(`the owner at ${width}px (${mode}): every section, no sideways scroll, axe passes`, async () => {
        const account = owner();
        const { context, page, errors } = await open('/developer', { width, mode, account });
        try {
          await page.waitForSelector('.dev-bar-slot', { timeout: 15_000 });
          expect(await page.title()).toBe('PriceSniffs: Developer');
          const sections = (await page.evaluate(`Array.from(document.querySelectorAll('#view h2')).map((h) => h.textContent.trim())`)) as string[];
          expect(sections).toEqual(['Visitors', 'Shop Clicks', 'Brands', 'Retailers', 'Connections']);
          expect(await page.evaluate('document.querySelectorAll(".dev-bar-slot").length')).toBe(30);
          const scroll = (await page.evaluate('[document.documentElement.scrollWidth, innerWidth]')) as [number, number];
          expect(scroll[0], 'no sideways scroll').toBeLessThanOrEqual(scroll[1]);
          // Nor inside the two lists: every column, the status included, is in view.
          const lists = (await page.evaluate(`Array.from(document.querySelectorAll('.dev-rows-wrap')).map((w) => w.scrollWidth - w.clientWidth)`)) as number[];
          for (const over of lists) expect(over, 'a list wider than its box').toBeLessThanOrEqual(1);
          const text = (await page.evaluate(`document.querySelector('#view').textContent`)) as string;
          expect(text).toContain('United Kingdom (60)');
          expect(text).toContain('google.com');
          expect(text).toContain(PRODUCT.name);
          expect(text).toContain('Not Connected');
          if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `developer-${width}-${mode}.png`), fullPage: true });
          expect(await axe(page)).toEqual([]);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }

  it('the owner switches range and country, and the numbers are asked for again', async () => {
    const account = owner();
    const { context, page } = await open('/developer', { width: 1280, account });
    try {
      await page.waitForSelector('.dev-bar-slot');
      await page.click('[data-dev-range="hour"]');
      await page.waitForFunction('document.querySelectorAll(".dev-bar-slot").length === 24');
      expect(await page.textContent('#dev-range-caption')).toBe('Last 24 hours, by hour');
      await page.selectOption('#dev-country', 'GB');
      await page.waitForTimeout(400);
      const asked = account.writes!.filter((w) => w.startsWith('rpc site_stats')).map((w) => JSON.parse(w.slice('rpc site_stats '.length)) as Record<string, unknown>);
      expect(asked.at(-1)).toMatchObject({ p_unit: 'hour', p_country: 'GB' });
      expect(asked.some((a) => a.p_unit === 'day' && a.p_country === null)).toBe(true);
      await page.hover('.dev-bar-slot:last-child');
      expect(await page.isVisible('.dev-tip')).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('the owner finds a brand, hides it, shows it again, and removes a shop after confirming', async () => {
    const account = owner();
    const { context, page } = await open('/developer', { width: 1280, account });
    try {
      await page.waitForSelector('#dev-q-brand');
      // The brand hidden before this visit is listed with its status.
      await page.selectOption('#dev-status-brand', 'hidden');
      expect(await page.textContent('#dev-table-brand tbody')).toContain('Armaf');
      await page.selectOption('#dev-status-brand', 'all');
      await page.fill('#dev-q-brand', 'lattafa');
      await page.waitForTimeout(200);
      const names = (await page.evaluate(`Array.from(document.querySelectorAll('#dev-table-brand td.name')).map((t) => t.textContent)`)) as string[];
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((n) => n.toLowerCase().includes('lattafa'))).toBe(true);
      await page.check(`#dev-table-brand input[value="lattafa"]`);
      expect(await page.textContent('#dev-bulk-brand .dev-picked')).toBe('1 ticked');
      await page.click('#dev-bulk-brand [data-dev-act="hidden"]');
      await page.waitForFunction(`document.querySelector('#dev-table-brand tr.is-hidden') !== null`);
      expect(account.site!.overrides!.some((o) => o.key === 'lattafa' && o.state === 'hidden')).toBe(true);
      expect(await page.textContent('#dev-bulk-brand .dev-msg')).toContain('Hidden: 1 brand');

      await page.check(`#dev-table-brand input[value="lattafa"]`);
      await page.click('#dev-bulk-brand [data-dev-act="show"]');
      await page.waitForFunction(`document.querySelector('#dev-table-brand tr.is-hidden') === null`);
      expect(account.site!.overrides!.some((o) => o.key === 'lattafa')).toBe(false);

      // Retailers: sort by listings, tick one, Remove asks first.
      await page.click('[data-dev-sort="listings"][data-kind="retailer"]');
      await page.fill('#dev-q-retailer', 'boots');
      await page.waitForTimeout(200);
      await page.check(`#dev-table-retailer input[value="boots"]`);
      await page.click('#dev-bulk-retailer [data-dev-act="removed"]');
      await page.waitForSelector('#ps-dialog[open]');
      expect(await page.textContent('#ps-dialog')).toContain('the crawl stops reading them');
      await page.click('#ps-dialog .ps-dialog-btn.danger');
      await page.waitForFunction(`document.querySelector('#dev-table-retailer tr.is-removed') !== null`);
      expect(account.site!.overrides!.some((o) => o.kind === 'retailer' && o.key === 'boots' && o.state === 'removed')).toBe(true);
    } finally {
      await context.close();
    }
  });
});

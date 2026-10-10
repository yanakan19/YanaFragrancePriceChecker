import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, waitForApp } from '../scripts/a11y-audit.js';
import { RETAILERS } from '../src/config/retailers.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, 'demo');
const built = ['index.html', 'us/index.html', 'in/index.html', 'sw.js'].every((f) => existsSync(resolve(demo, f)));

/**
 * The owner's report of 10 October 2026: on the US site, they switched to the
 * UK with the country menu, and the UK home's Most Stocked rail was the US one;
 * a price there led to a US shop. The cause was the service worker (demo/sw.js):
 * it kept whichever page it last fetched, /us/ included, as the one offline
 * page, and served it at the UK address whenever the network failed to answer
 * for the document. Reproduced here with the real worker, a host like GitHub
 * Pages (cached for 600 seconds, 404.html for unknown addresses) and the
 * destination document's requests dropped: every switch, US to UK, UK to US,
 * India to UK and UK to India, must show the destination country's own shops
 * and currency, online and with the document's request failing.
 */
const COUNTRIES = {
  GB: { path: '/', symbol: '£', shops: new Set(RETAILERS.map((r) => r.name)) },
  US: { path: '/us/', symbol: '$', shops: new Set(REGION_RETAILERS.US.map((s) => s.name)) },
  IN: { path: '/in/', symbol: '₹', shops: new Set(REGION_RETAILERS.IN.map((s) => s.name)) },
} as const;
type Country = keyof typeof COUNTRIES;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};

describe.skipIf(!built)('switching country with the service worker installed', () => {
  let browser: Browser;
  let server: Server;
  let port = 0;
  /** A document address whose requests the host drops (the connection is cut), as a flaky network would. */
  let dropping: string | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const p = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      if (dropping !== null && p === dropping) {
        req.socket.destroy();
        return;
      }
      const f = resolve(demo, `.${p}`);
      let hit = [f, resolve(f, 'index.html'), `${f}.html`].find((c) => c.startsWith(demo) && existsSync(c) && statSync(c).isFile());
      let status = 200;
      if (!hit) {
        hit = resolve(demo, '404.html');
        status = 404;
      }
      res.writeHead(status, { 'Content-Type': MIME[extname(hit)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
      res.end(readFileSync(hit));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
    browser = await launchChromium({ countryChosen: null });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
  });

  const url = (path: string) => `http://127.0.0.1:${port}${path}`;

  async function railOf(page: Page) {
    await waitForApp(page);
    await page.waitForTimeout(300);
    return (await page.evaluate(`({
      path: location.pathname,
      tiles: [...document.querySelectorAll('.pop-rail li .tile')].map((t) => ({
        shop: (t.querySelector('.sold-by span')?.textContent ?? '').trim().replace(/^(from|at) /, ''),
        price: (t.querySelector('.tile-price')?.textContent ?? '').replace(/\\s+/g, ' '),
      })),
    })`)) as { path: string; tiles: { shop: string; price: string }[] };
  }

  function expectCountry(rail: Awaited<ReturnType<typeof railOf>>, to: Country, how: string) {
    const c = COUNTRIES[to];
    expect(rail.path, how).toBe(c.path);
    expect(rail.tiles.length, how).toBe(12);
    for (const t of rail.tiles) {
      expect(c.shops.has(t.shop), `${how}: ${t.shop} on the ${to} rail`).toBe(true);
      expect([...new Set(t.price.match(/[£$₹]/g))], `${how}: ${t.price}`).toEqual([c.symbol]);
    }
  }

  async function switchTo(page: Page, to: Country) {
    await page.click('#region-btn');
    await Promise.all([page.waitForURL((u) => u.pathname === COUNTRIES[to].path, { timeout: 30_000 }), page.click(`[data-region="${to}"]`)]);
  }

  const pairs: [Country, Country][] = [['US', 'GB'], ['GB', 'US'], ['IN', 'GB'], ['GB', 'IN']];
  for (const [from, to] of pairs) {
    it(`${from} to ${to}: the ${to} home shows ${to} shops, online and when the network drops its page`, async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript((id: string) => {
        try {
          if (localStorage.getItem('pricesniffs.region') === null) localStorage.setItem('pricesniffs.region', id);
        } catch { /* storage refused */ }
      }, from);
      const page = await context.newPage();
      try {
        await page.goto(url(COUNTRIES[from].path), { waitUntil: 'load' });
        await waitForApp(page);
        // The worker installed and activated (it registers once the app is idle).
        const active = (await page.evaluate(`(async () => {
          for (let i = 0; i < 300; i++) {
            const r = await navigator.serviceWorker.getRegistration();
            if (r && r.active && r.active.state === 'activated') return true;
            await new Promise((ok) => setTimeout(ok, 100));
          }
          return false;
        })()`)) as boolean;
        expect(active).toBe(true);
        // A second visit to the same page, now through the worker: what the report's visitor had.
        await page.goto(url(COUNTRIES[from].path), { waitUntil: 'load' });
        expectCountry(await railOf(page), from, `${from} before the switch`);

        // The switch with the destination page's requests cut (a dropped connection): the
        // worker answers from its cache. It may show the destination's own page, or none
        // when that country's page was never opened here, never the page just left.
        dropping = COUNTRIES[to].path;
        await page.click('#region-btn');
        // A navigation with no page to show fails (net::ERR_FAILED): that is the no page case.
        await Promise.all([page.waitForURL((u) => u.pathname !== COUNTRIES[from].path, { timeout: 30_000 }).catch(() => undefined), page.click(`[data-region="${to}"]`)]);
        const started = await page.waitForSelector('html[data-app-ready]', { state: 'attached', timeout: 20_000 }).then(() => true, () => false);
        if (to === 'GB') expect(started, 'the UK page is kept from the worker\'s install').toBe(true);
        if (started) expectCountry(await railOf(page), to, `${from} to ${to}, its page's request dropped`);
        else expect(await page.evaluate(`document.querySelectorAll('.pop-rail .tile').length`)).toBe(0);
        dropping = null;

        // Back, then the same switch online.
        // (The visitor's saved choice is put back first, or the bare UK home would send them on.)
        await page.goto(url('/favicon.svg'));
        await page.evaluate(`localStorage.setItem('pricesniffs.region', ${JSON.stringify(from)})`);
        await page.goto(url(COUNTRIES[from].path), { waitUntil: 'load' });
        expectCountry(await railOf(page), from, `${from} again`);
        await page.evaluate(`localStorage.setItem('pricesniffs.region', ${JSON.stringify(from)})`);
        await switchTo(page, to);
        expectCountry(await railOf(page), to, `${from} to ${to}, online`);
        // A rail tile opens the product inside the destination country.
        await page.click('.pop-rail .tile-body');
        await page.waitForFunction(`location.pathname !== ${JSON.stringify(COUNTRIES[to].path)}`, null, { timeout: 10_000 });
        const productPath = (await page.evaluate('location.pathname')) as string;
        if (to !== 'GB') expect(productPath.startsWith(COUNTRIES[to].path)).toBe(true);
        else expect(/^\/(us|in)\//.test(productPath)).toBe(false);
      } finally {
        dropping = null;
        await context.close();
      }
    }, 150_000);
  }
});

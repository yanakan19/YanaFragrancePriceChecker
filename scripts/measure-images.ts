/**
 * Measures the product photos a phone downloads on the pages a reader lands
 * on: how many, how many bytes, and how many were fetched for an image that
 * was not yet on screen.
 *
 *   npm run demo                        # must run first
 *   npm run perf:images                 # the default four pages
 *   npm run perf:images -- /brands/chanel /fragrance/ean-3348900103870
 *   npm run perf:images -- --by-host    # also split each page by image host
 *
 * Unlike scripts/measure-load.ts this has to reach the real retailer CDNs,
 * because every photo is hot-linked from them (docs/IMAGE-PIPELINE.md), so
 * it needs outbound HTTPS (Node's fetch makes the requests; see the route
 * handler below). The figures move a little from run to run with whatever the
 * CDNs answer, and are comparable only between runs made close together.
 *
 * Each page is measured twice:
 *   on load       the app is ready and the network has gone quiet, nothing
 *                 scrolled. "Off screen" counts the photos fetched for an
 *                 <img> whose box lay wholly below the viewport at that point,
 *                 i.e. fetched before the reader could have seen it.
 *   after scroll  three more screens scrolled, then quiet again. Shows the
 *                 lazy photos arriving as they are needed rather than up front.
 *
 * "Bytes" is the response body as the image server sent it (the images are
 * already compressed, so there is no transfer encoding to speak of).
 */
import { chromium, devices, type Page } from 'playwright';
import { existsSync } from 'node:fs';
import { startDemoServer, waitForApp } from './a11y-audit.js';

const PINNED_CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

export const DEFAULT_IMAGE_ROUTES = ['/', '/deals', '/brands/dior', '/fragrance/ean-3348900103870'];

interface Fetched { url: string; bytes: number; type: string }

async function quiet(page: Page, pending: () => number): Promise<void> {
  // Network idle as the page sees it: no image request outstanding for a
  // second. networkidle alone is not enough, because the app keeps a
  // background prefetch going that has nothing to do with photos.
  let still = 0;
  for (let i = 0; i < 300 && still < 10; i++) {
    await page.waitForTimeout(100);
    still = pending() === 0 ? still + 1 : 0;
  }
}

async function measure(route: string, port: number, browser: import('playwright').Browser, byHost: boolean): Promise<string> {
  // Service worker blocked: demo/sw.js answers every request it sees,
  // cross-origin photos included, and a request the worker makes never
  // reaches the route handler below, so the later photos would go uncounted.
  // A first visit has no worker in control yet anyway.
  const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  const page = await context.newPage();
  const fetched: Fetched[] = [];
  let inFlight = 0;
  // Every off-site request is made from Node and handed back to the page,
  // with the browser's own Accept header so format negotiation still happens
  // exactly as it would for the page. Done this way because Node trusts the
  // CA bundle an intercepting proxy needs and a stock Chromium may not; the
  // page still decides what to request and when, which is what is measured.
  await context.route(
    (url) => url.hostname !== '127.0.0.1',
    async (route) => {
      const r = route.request();
      const image = r.resourceType() === 'image';
      if (image) inFlight++;
      try {
        const res = await fetch(r.url(), { headers: { accept: r.headers()['accept'] ?? '*/*', 'user-agent': r.headers()['user-agent'] ?? '' } });
        const body = Buffer.from(await res.arrayBuffer());
        const type = res.headers.get('content-type') ?? '';
        if (image) fetched.push({ url: r.url(), bytes: body.length, type: res.ok ? type : `HTTP ${res.status}` });
        await route.fulfill({ status: res.status, body, headers: { 'content-type': type } });
      } catch {
        if (image) fetched.push({ url: r.url(), bytes: 0, type: 'failed' });
        await route.abort().catch(() => undefined);
      } finally {
        if (image) inFlight--;
      }
    },
  );

  await page.goto(`http://127.0.0.1:${port}${route}`);
  await waitForApp(page);
  await quiet(page, () => inFlight);
  const onLoad = [...fetched];
  // Which fetched photos belong to an <img> wholly below the first screen.
  const offscreen = (await page.evaluate(`(() => {
    const below = new Set();
    for (const img of document.querySelectorAll('img')) {
      const box = img.getBoundingClientRect();
      if (box.top >= innerHeight && img.currentSrc) below.add(img.currentSrc);
    }
    return [...below];
  })()`)) as string[];
  const offscreenSet = new Set(offscreen);
  const offscreenCount = onLoad.filter((f) => offscreenSet.has(f.url)).length;

  for (let i = 0; i < 3; i++) {
    await page.evaluate('scrollBy(0, innerHeight)');
    await page.waitForTimeout(400);
  }
  await quiet(page, () => inFlight);
  const afterScroll = [...fetched];
  await context.close();

  const kb = (xs: Fetched[]): string => `${(xs.reduce((n, f) => n + f.bytes, 0) / 1024).toFixed(0)} kB`;
  const types = [...new Set(onLoad.map((f) => f.type.replace('image/', '')))].sort().join('/');
  let out =
    `${route.padEnd(32)} on load ${String(onLoad.length).padStart(3)} photos ${kb(onLoad).padStart(8)}` +
    ` (${offscreenCount} off screen)   after 3 screens ${String(afterScroll.length).padStart(3)} photos ${kb(afterScroll).padStart(8)}` +
    `   ${types}`;
  if (byHost) {
    const hosts = new Map<string, Fetched[]>();
    for (const f of afterScroll) {
      const h = new URL(f.url).hostname;
      hosts.set(h, [...(hosts.get(h) ?? []), f]);
    }
    for (const [h, xs] of [...hosts].sort((a, b) => b[1].length - a[1].length)) {
      out += `\n    ${h.padEnd(30)} ${String(xs.length).padStart(3)} photos ${kb(xs).padStart(8)}`;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const routes = args.filter((a) => a.startsWith('/'));
  const byHost = args.includes('--by-host');
  const browser = await chromium.launch(existsSync(PINNED_CHROMIUM) ? { executablePath: PINNED_CHROMIUM } : {});
  const server = await startDemoServer();
  try {
    console.log(`${devices['Pixel 7'].viewport.width}x${devices['Pixel 7'].viewport.height} @ ${devices['Pixel 7'].deviceScaleFactor}x (Pixel 7), photos from retailer CDNs only`);
    for (const route of routes.length ? routes : DEFAULT_IMAGE_ROUTES) {
      console.log(await measure(route, server.port, browser, byHost));
    }
  } finally {
    server.close();
    await browser.close();
  }
}

await main();

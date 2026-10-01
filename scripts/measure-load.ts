/**
 * Measures how long the built demo takes to show its first product tiles on a
 * slow phone, and how many bytes it pulls over the wire, on a first and a
 * repeat visit.
 *
 *   npm run demo                       # must run first
 *   npm run perf:load                  # demo/, 3 runs per scenario
 *   npm run perf:load -- --dir some/other/build --runs 5
 *
 * Serves the folder the way GitHub Pages serves pricesniffs.space, because
 * that is what decides both numbers: gzip on text, an ETag on everything,
 * `Cache-Control: max-age=600`, and 404.html (with a 404 status) for any path
 * that is not a file. The browser is the same pinned Chromium the other
 * Playwright scripts use (scripts/a11y-audit.ts), at a phone viewport with
 * the CPU slowed 4x through CDP, which is the setting every load figure in
 * scripts/bundle-demo.ts's header was taken at.
 *
 * Scenarios:
 *   first            a cold browser profile
 *   repeat           a new tab in the same profile once the service worker
 *                    has installed, inside the 10-minute HTTP cache window
 *   repeat-expired   the same, with every HTTP cache entry already stale
 *                    (served with max-age=0), so anything not in the service
 *                    worker's own cache has to be revalidated (an unchanged
 *                    file answers 304, a changed one is downloaded again)
 *   first-4g         the cold visit again on a throttled connection
 *                    (9 Mbps down, 1.5 Mbps up, 60 ms RTT)
 *
 * "Bytes" is what the server actually wrote: compressed body plus headers,
 * every request the page or its service worker made. "By first tiles" counts
 * only the requests that reached the server before the first tile was in the
 * page (same machine, same clock), which is what stood between the visitor
 * and the page; "transferred" adds whatever the page and its worker fetch
 * after that (the price history prefetch, the worker's pre-cache) until 1.5 s
 * after the load event.
 */
import { createServer, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { devices, type Browser } from 'playwright';
import { launchChromium } from './a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt', '.webmanifest']);

interface Served { body: Buffer; gz: Buffer | null; etag: string; mtime: number }

/**
 * Compressed bodies, shared by every server this process starts. Each
 * scenario gets a fresh server, and gzipping the 17 MB catalogue takes the
 * best part of a second, which a host serving from its own cache never
 * charges a visitor; kept per server, it landed inside every measured visit.
 * The uncounted warm-up visit in main() fills it.
 */
const compressed = new Map<string, Served>();

export async function startPagesLikeServer(dir: string): Promise<{
  port: number;
  close: () => void;
  bytes: () => number;
  /** Bytes written for the requests that arrived before `epochMs`. */
  bytesRequestedBefore: (epochMs: number) => number;
  resetBytes: () => void;
  setMaxAge: (seconds: number) => void;
}> {
  const cache = compressed;
  let written = 0;
  let log: { at: number; bytes: number }[] = [];
  let maxAge = 600;
  const load = (file: string): Served => {
    const mtime = statSync(file).mtimeMs;
    const hit = cache.get(file);
    if (hit && hit.mtime === mtime) return hit;
    const body = readFileSync(file);
    const entry: Served = {
      body,
      gz: COMPRESSIBLE.has(extname(file)) ? gzipSync(body, { level: 6 }) : null,
      etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`,
      mtime,
    };
    cache.set(file, entry);
    return entry;
  };
  const send = (res: ServerResponse, at: number, status: number, headers: Record<string, string>, body: Buffer | null): void => {
    res.writeHead(status, headers);
    const bytes = Object.entries(headers).reduce((n, [k, v]) => n + k.length + v.length + 4, 17) + (body?.length ?? 0);
    written += bytes;
    log.push({ at, bytes });
    res.end(body ?? undefined);
  };
  const server = createServer((req, res) => {
    const at = Date.now();
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = resolve(dir, path === '/' || path.endsWith('/') ? `.${path}index.html` : `.${path}`);
    let status = 200;
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      file = resolve(dir, '404.html');
      status = 404;
    }
    const entry = load(file);
    const headers: Record<string, string> = {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': `max-age=${maxAge}`,
      ETag: entry.etag,
      Vary: 'Accept-Encoding',
    };
    if (status === 200 && req.headers['if-none-match'] === entry.etag) {
      send(res, at, 304, headers, null);
      return;
    }
    const gzip = entry.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const body = gzip ? entry.gz! : entry.body;
    if (gzip) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = String(body.length);
    send(res, at, status, headers, req.method === 'HEAD' ? null : body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return {
    port,
    close: () => server.close(),
    bytes: () => written,
    bytesRequestedBefore: (epochMs) => log.filter((e) => e.at < epochMs).reduce((n, e) => n + e.bytes, 0),
    resetBytes: () => { written = 0; log = []; },
    setMaxAge: (s) => { maxAge = s; },
  };
}

/** Records, from inside the page, when the first product tile entered the DOM. */
const FIRST_TILE_PROBE = `
  new MutationObserver(function (_, obs) {
    if (document.querySelector('.tile')) { window.__firstTile = performance.now(); obs.disconnect(); }
  }).observe(document, { childList: true, subtree: true });
`;

interface Sample { tilesMs: number; fcpMs: number; bytes: number; tileBytes: number }

const FOUR_G = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

async function visit(
  context: import('playwright').BrowserContext,
  url: string,
  server: Awaited<ReturnType<typeof startPagesLikeServer>>,
  network?: typeof FOUR_G,
): Promise<Sample> {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', network);
  }
  server.resetBytes();
  await page.goto(url, { waitUntil: 'commit' });
  // Strings, not functions: this file is type-checked without the DOM lib.
  await page.waitForFunction('window.__firstTile !== undefined', null, { timeout: 120_000 });
  const { tilesMs, fcpMs, tileEpochMs } = (await page.evaluate(`({
    tilesMs: window.__firstTile,
    tileEpochMs: performance.timeOrigin + window.__firstTile,
    fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN,
  })`)) as { tilesMs: number; fcpMs: number; tileEpochMs: number };
  const tileBytes = server.bytesRequestedBefore(tileEpochMs);
  // Let anything the page or its worker fetches after first paint land too.
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const bytes = server.bytes();
  await page.close();
  return { tilesMs, fcpMs, bytes, tileBytes };
}

/** Waits until a service worker controls the origin and has finished its own fetching. */
async function settleWorker(context: import('playwright').BrowserContext, url: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(`'serviceWorker' in navigator ? navigator.serviceWorker.ready.then(() => true) : false`);
  await page.waitForTimeout(3000);
  await page.close();
}

async function scenario(browser: Browser, name: string, dir: string): Promise<Sample> {
  const server = await startPagesLikeServer(dir);
  const url = `http://127.0.0.1:${server.port}/`;
  // Born stale: every response must be revalidated on the next visit, which
  // is what coming back after GitHub Pages' 10 minutes looks like.
  if (name === 'repeat-expired') server.setMaxAge(0);
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  await context.addInitScript(FIRST_TILE_PROBE);
  try {
    if (name === 'first') return await visit(context, url, server);
    if (name === 'first-4g') return await visit(context, url, server, FOUR_G);
    await visit(context, url, server);
    await settleWorker(context, url);
    return await visit(context, url, server);
  } finally {
    await context.close();
    server.close();
  }
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dirArg = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : 'demo';
  const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 3;
  const dir = resolve(root, dirArg);
  if (!existsSync(resolve(dir, 'index.html'))) throw new Error(`${dir}/index.html does not exist — run \`npm run demo\` first.`);
  const browser = await launchChromium();
  try {
    console.log(`${dir}, median of ${runs}, Pixel 7 viewport, CPU 4x slower`);
    // One uncounted visit first: the very first page a fresh Chromium loads
    // pays for warming its own caches, which is not the site's cost.
    await scenario(browser, 'first', dir);
    for (const name of ['first', 'repeat', 'repeat-expired', 'first-4g']) {
      const samples: Sample[] = [];
      for (let i = 0; i < runs; i++) samples.push(await scenario(browser, name, dir));
      const tiles = median(samples.map((s) => s.tilesMs));
      const fcp = median(samples.map((s) => s.fcpMs));
      const size = (bytes: number): string => {
        const kb = bytes / 1024;
        return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} kB`;
      };
      console.log(
        `${name.padEnd(15)} first tiles ${(tiles / 1000).toFixed(2)} s   FCP ${(fcp / 1000).toFixed(2)} s   ` +
          `by first tiles ${size(median(samples.map((s) => s.tileBytes)))}   ` +
          `transferred ${size(median(samples.map((s) => s.bytes)))}`,
      );
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

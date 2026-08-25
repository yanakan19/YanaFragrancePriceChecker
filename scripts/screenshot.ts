/**
 * Screenshots the built demo at chosen routes and viewport widths.
 *
 *   npm run demo                       # must run first: builds demo/index.html
 *   npm run screenshot -- /search?q=black%20fri /fragrance/french-avenue-17853
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Two UI changes shipped on 2026-08-25 — the tile-name clamp fix (df0122a) and
 * the two-line delivery note (d35b464) — were reasoned about in markup and CSS
 * and never once looked at, because no agent working on them believed it had a
 * browser. Both commit messages say so in as many words. This script is the
 * thing that was missing: it renders the real built page and writes PNGs, so
 * the next person changing a layout can see the result instead of arguing
 * about it from a stylesheet.
 *
 * ── The executablePath requirement, and why ─────────────────────────────────
 * `npx playwright install` cannot run in this sandbox: it downloads browser
 * archives from playwright.azureedge.net / cdn.playwright.dev, and the egress
 * proxy refuses them. So Playwright's own default `chromium.launch()` finds
 * nothing under ~/.cache/ms-playwright and throws "Executable doesn't exist".
 *
 * A Chromium build is nonetheless already on the image, at
 * `/opt/pw-browsers/chromium` (a symlink to chromium-1194/chrome-linux/chrome,
 * Chromium 141). Passing it as `executablePath` launches and renders normally
 * — the download step is the only blocked part, not the browser. The same
 * constant is already relied on by scripts/generate-og-preview.ts; both fall
 * back to Playwright's default resolution when the path is absent, so this
 * still works on a machine with a normal `playwright install`.
 *
 * Override with CHROMIUM_PATH=/some/other/chrome if the image moves.
 *
 * ── Serving rather than file:// ─────────────────────────────────────────────
 * demo/index.html is a single self-contained document with the bundle inlined,
 * so it opens from disk. But routes are real paths (`/search`, `/fragrance/x`)
 * read out of `location.pathname` by demo/router.ts, and under file:// those
 * paths point at the filesystem root. A four-line static server with an
 * index.html fallback gives the router the URLs it expects. Nothing outbound
 * is fetched, so the proxy is irrelevant here too.
 *
 * ── Options ─────────────────────────────────────────────────────────────────
 *   --widths 1280,1440,1920   viewport widths in CSS px (default those three)
 *   --height 900              viewport height (default 900)
 *   --full                    full-page capture instead of the viewport
 *   --per-row 8               seed the tile density chooser's localStorage key
 *   --layout desktop|mobile   seed the layout toggle's key, instead of letting
 *                             the page decide from pointer capability and width
 *   --mode dark|light|system  seed the display-mode key
 *   --out demo-shots          output directory (default ./screenshots)
 *   --wait 400                extra settle time in ms after load (default 400)
 *   --clip .selector          crop to the first element matching this selector
 *
 * Output files are named <route-slug>@<width>[x<perRow>].png. They are written
 * outside the repo tree by default and are deliberately not committed: a PNG
 * of a page that changes daily is stale the moment it lands, and the catalogue
 * behind these views is rewritten by every harvest.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = resolve(root, 'demo');

/** See the note above: the one Chromium this sandbox has. */
const PINNED_CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

/** localStorage keys, kept in step with demo/app.ts. */
const PER_ROW_KEY = 'pricesniffs.perrow';
const LAYOUT_KEY = 'pricesniffs.layout';
/** MODE_KEY in demo/app.ts: the dark/light/system display mode. */
const MODE_KEY = 'pricesniffs.display';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.xml': 'application/xml', '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

interface Options {
  routes: string[];
  widths: number[];
  height: number;
  full: boolean;
  perRow: number | null;
  layout: string | null;
  mode: string | null;
  out: string;
  wait: number;
  clip: string | null;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    routes: [],
    widths: [1280, 1440, 1920],
    height: 900,
    full: false,
    perRow: null,
    layout: null,
    mode: null,
    out: resolve(root, 'screenshots'),
    wait: 400,
    clip: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--widths': o.widths = next().split(',').map((n) => Number(n.trim())); break;
      case '--height': o.height = Number(next()); break;
      case '--full': o.full = true; break;
      case '--per-row': o.perRow = Number(next()); break;
      case '--layout': o.layout = next(); break;
      case '--mode': o.mode = next(); break;
      case '--out': o.out = resolve(process.cwd(), next()); break;
      case '--wait': o.wait = Number(next()); break;
      case '--clip': o.clip = next(); break;
      default:
        if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
        o.routes.push(arg.startsWith('/') ? arg : `/${arg}`);
    }
  }
  if (o.routes.length === 0) o.routes = ['/'];
  if (o.widths.some((w) => !Number.isFinite(w) || w <= 0)) throw new Error('--widths must be positive numbers');
  return o;
}

/** A filename that still says which route it came from. */
function slugForRoute(route: string): string {
  const s = route.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'home';
}

async function startServer(): Promise<{ port: number; close: () => void }> {
  if (!existsSync(resolve(demoDir, 'index.html'))) {
    throw new Error('demo/index.html does not exist yet — run `npm run demo` first.');
  }
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    const file = resolve(demoDir, path === '/' ? 'index.html' : path.slice(1));
    // Client-side routes are not files. Anything that is not a real asset gets
    // index.html, which is exactly what GitHub Pages does through 404.html.
    const target = file.startsWith(demoDir) && existsSync(file) && extname(file) !== ''
      ? file
      : resolve(demoDir, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { port, close: () => server.close() };
}

export async function launchChromium(): Promise<Browser> {
  return chromium.launch(existsSync(PINNED_CHROMIUM) ? { executablePath: PINNED_CHROMIUM } : {});
}

async function seed(page: Page, o: Options): Promise<void> {
  const entries: Array<[string, string]> = [];
  if (o.perRow !== null) entries.push([PER_ROW_KEY, String(o.perRow)]);
  if (o.layout !== null) entries.push([LAYOUT_KEY, o.layout]);
  if (o.mode !== null) entries.push([MODE_KEY, o.mode]);
  if (entries.length === 0) return;
  // Reached through globalThis rather than `window`: this function's body is
  // serialised and run in the page, but it is type-checked here, and the
  // repo's tsconfig has no DOM lib (it is a Node project). Same dodge as
  // basePath() in demo/router.ts.
  await page.addInitScript((pairs: Array<[string, string]>) => {
    try {
      const store = (globalThis as { localStorage?: { setItem(k: string, v: string): void } }).localStorage;
      if (store) for (const [k, v] of pairs) store.setItem(k, v);
    } catch {
      // Storage can be unavailable; the page has its own fallbacks.
    }
  }, entries);
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const { port, close } = await startServer();
  const browser = await launchChromium();
  try {
    for (const width of o.widths) {
      for (const route of o.routes) {
        const page = await browser.newPage({ viewport: { width, height: o.height } });
        await seed(page, o);
        await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
        await page.waitForTimeout(o.wait);
        const suffix = o.perRow !== null ? `x${o.perRow}` : '';
        const file = resolve(o.out, `${slugForRoute(route)}@${width}${suffix}.png`);
        const target = o.clip ? page.locator(o.clip).first() : page;
        await target.screenshot({ path: file, ...(o.clip ? {} : { fullPage: o.full }) });
        await page.close();
        console.log(`${file}  ${route} @ ${width}px`);
      }
    }
  } finally {
    await browser.close();
    close();
  }
}

// Importable (launchChromium) without running, so a future measurement or
// visual-diff script can reuse the launch rule rather than copying the path.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}

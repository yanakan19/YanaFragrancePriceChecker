/**
 * Runs axe-core against the built demo, route by route, and prints every
 * violation with the elements it applies to.
 *
 *   npm run demo                                   # must run first
 *   npm run a11y -- / /search /legal/privacy       # default: the routes below
 *   npm run a11y -- --mode light /                 # seed the display mode
 *
 * Why a script and not only a test: tests/accessibility.test.ts asserts the
 * absence of serious and critical violations on a handful of routes so the
 * suite stays green and fast. This script is the wider, slower, human-read
 * sweep — every route that matters, every impact level, the selector of each
 * failing node — for the person fixing things rather than the gate that
 * stops a regression landing.
 *
 * Serves demo/ the same way scripts/screenshot.ts does (index.html for every
 * client-side route, exactly as GitHub Pages does through 404.html) and
 * launches the same pinned Chromium, for the same reasons recorded there.
 */
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = resolve(root, 'demo');
const PINNED_CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const MODE_KEY = 'pricesniffs.display';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain',
};

/** The routes a reader actually lands on, one of each kind of page. */
export const DEFAULT_ROUTES = [
  '/',
  '/search',
  '/deals',
  '/retailers',
  '/retailers/fragrance-click',
  '/legal/privacy',
  '/settings',
  '/account',
];

export async function startDemoServer(): Promise<{ port: number; close: () => void }> {
  if (!existsSync(resolve(demoDir, 'index.html'))) {
    throw new Error('demo/index.html does not exist yet — run `npm run demo` first.');
  }
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    const file = resolve(demoDir, path === '/' ? 'index.html' : path.slice(1));
    const target = file.startsWith(demoDir) && existsSync(file) && extname(file) !== '' ? file : resolve(demoDir, 'index.html');
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

export interface Violation {
  id: string;
  impact: string;
  help: string;
  helpUrl: string;
  nodes: string[];
}

/**
 * Audits one route in an already-launched browser. `mode` seeds the display
 * preference so both palettes can be checked; colour contrast is one of the
 * rules axe runs, and the two palettes are different sets of numbers.
 */
export async function auditRoute(
  browser: Browser,
  port: number,
  route: string,
  mode: 'light' | 'dark' | null = null,
): Promise<Violation[]> {
  // @axe-core/playwright insists on a page from an explicit context (it
  // injects its script per context), so this is not the bare newPage() the
  // screenshot script uses.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    if (mode) {
      await context.addInitScript(
        ([k, v]: [string, string]) => {
          try {
            (globalThis as { localStorage?: { setItem(k: string, v: string): void } }).localStorage?.setItem(k, v);
          } catch {
            /* storage may be unavailable; the page has its own fallbacks */
          }
        },
        [MODE_KEY, mode] as [string, string],
      );
    }
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? 'unknown',
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    }));
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let mode: 'light' | 'dark' | null = null;
  const routes: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--mode') {
      const v = argv[++i];
      if (v !== 'light' && v !== 'dark') throw new Error('--mode must be light or dark');
      mode = v;
    } else routes.push(a.startsWith('/') ? a : `/${a}`);
  }
  const list = routes.length ? routes : DEFAULT_ROUTES;

  const { port, close } = await startDemoServer();
  const browser = await launchChromium();
  let total = 0;
  try {
    for (const route of list) {
      const violations = await auditRoute(browser, port, route, mode);
      total += violations.length;
      console.log(`\n${route}${mode ? ` (${mode})` : ''}: ${violations.length === 0 ? 'no violations' : `${violations.length} violation(s)`}`);
      for (const v of violations) {
        console.log(`  [${v.impact}] ${v.id} — ${v.help}`);
        for (const n of v.nodes.slice(0, 6)) console.log(`      ${n}`);
        if (v.nodes.length > 6) console.log(`      … and ${v.nodes.length - 6} more`);
      }
    }
  } finally {
    await browser.close();
    close();
  }
  console.log(`\n${total} violation(s) across ${list.length} route(s).`);
  process.exitCode = total === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}

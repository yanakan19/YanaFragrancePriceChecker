/**
 * Generates demo/og-preview.png straight from the real homepage.
 *
 *   npm run og:preview
 *
 * Must run after `npm run demo`, against the built demo/index.html, served
 * locally — screenshotting the real rendered page rather than hand-drawing an
 * image is the whole point: a hand-made preview drifts from the actual
 * branding the moment the theme changes, and nobody remembers to update it.
 * Output is exactly 1200x630, the size Facebook's and Twitter's card
 * scrapers expect without any cropping on their end.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = resolve(root, 'demo');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

if (!existsSync(resolve(demoDir, 'index.html'))) {
  throw new Error('demo/index.html does not exist yet — run `npm run demo` first.');
}

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]!;
  const file = resolve(demoDir, path === '/' ? 'index.html' : path.slice(1));
  if (!file.startsWith(demoDir) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address() as { port: number };

const pinnedChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(pinnedChromium) ? { executablePath: pinnedChromium } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  // The homepage fetches nothing external and renders from the inlined
  // bundle, but give one frame for the fade-in transition to settle so the
  // captured image is not mid-animation.
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(demoDir, 'og-preview.png') });
  await browser.close();
} finally {
  server.close();
}

console.log('demo/og-preview.png written (1200x630)');

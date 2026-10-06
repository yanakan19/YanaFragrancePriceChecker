/**
 * Generates demo/og-preview.png, the picture a shared link to the site shows
 * (WhatsApp, iMessage, Facebook, X, Slack, Discord and so on).
 *
 *   npm run demo           # build the page first
 *   npm run og:preview     # then rewrite demo/og-preview.png
 *
 * The picture is a real screenshot of the top of the built homepage: the
 * header, the search box, the hero and the first row of the Most Stocked
 * rail, in the light theme. A hand made image drifts from the real branding
 * the moment the design changes; this one is regenerated from the page.
 *
 * Framing: the page is laid out as a 1440 by 756 desktop window and captured
 * at a device scale of 1200 / 1440, so the PNG is exactly 1200 by 630 (the
 * size Facebook and X expect, a 1.91:1 ratio) with the text drawn at that
 * size rather than resampled. A few rules are added for the capture only:
 * animation is stopped (the ticker would otherwise be caught half way and cut
 * a word in two), the gap under the header is tightened a little so the first
 * row of cards ends well inside the frame, and anything transient (a dialog,
 * a toast, a consent banner, an ad frame) is hidden.
 *
 * The image is committed as a source asset, not built at deploy time: it
 * depends on a browser and on the live page, which the deploy build keeps out
 * of its way, and it changes only when the top of the homepage is redesigned.
 * Run this and commit the PNG then. Bump OG_IMAGE_VERSION in demo/head.ts in
 * the same commit: shared link caches (and the browser) key on the address, so
 * a new ?v= is what makes a changed picture show up.
 *
 * Product photos come from the shops' own servers and are not loaded for the
 * capture (the requests are aborted), so the picture is the same on every
 * machine and every day: the cards show the page's own picture placeholder.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoServer, launchChromium, waitForApp } from './a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** The desktop window the page is laid out in before it is scaled down. */
const LAYOUT_WIDTH = 1440;
const LAYOUT_HEIGHT = Math.round((LAYOUT_WIDTH * OG_HEIGHT) / OG_WIDTH);

/** The display mode key (MODE_KEY in demo/app.ts). */
const MODE_KEY = 'pricesniffs.display';

const CAPTURE_CSS = `
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
.intro { margin-top: -36px !important; }
dialog, [role="dialog"], [role="alertdialog"], [role="status"], .toast, .snackbar,
.cookie-banner, .consent, .ad-slot, .ad-frame, ins.adsbygoogle { display: none !important; }
`;

const server = await startDemoServer();
const browser = await launchChromium();
try {
  const context = await browser.newContext({
    viewport: { width: LAYOUT_WIDTH, height: LAYOUT_HEIGHT },
    deviceScaleFactor: OG_WIDTH / LAYOUT_WIDTH,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    `try { localStorage.setItem(${JSON.stringify(MODE_KEY)}, 'light'); } catch (e) {}`,
  );
  // Only the site's own files: no shop photos, no ad or analytics scripts.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    return url.startsWith(`http://127.0.0.1:${server.port}/`) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
  await waitForApp(page);
  await page.addStyleTag({ content: CAPTURE_CSS });
  await page.evaluate('document.fonts ? document.fonts.ready : null');
  await page.waitForTimeout(500);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: LAYOUT_WIDTH, height: LAYOUT_HEIGHT } });
  writeFileSync(resolve(root, 'demo/og-preview.png'), png);
  console.log(`demo/og-preview.png written (${OG_WIDTH}x${OG_HEIGHT}, ${(png.length / 1024).toFixed(0)} kB)`);
  await context.close();
} finally {
  await browser.close();
  server.close();
}

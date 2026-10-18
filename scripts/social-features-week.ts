/**
 * Features of the week post (social/posts/2026-10-17-features-week): captures the real built pages at phone
 * width (390) into shot-N.png, draws the 3:4 slides and the 9:16 video from them. Photos are hotlinked from
 * shops; the browser has no route out here, so each image is fetched with curl and handed to the page.
 *
 *   npx tsx scripts/social-features-week.ts [--shots] [--slides] [--video]   (needs `npm run demo` first)
 *
 * `npm run social:render -- social/posts/2026-10-17-features-week` draws all of it again (make "features-week"):
 * it builds the page if it is missing, takes the shots again from it, then the slides and the video. The shots
 * go in `_shots/` (git ignores it); nothing drawn is committed (docs/DECISIONS.md D28).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { launchChromium, startPagesServer, waitForApp } from './a11y-audit.js';
import { renderVideo } from './social-video-render.js';
import { recordPictures } from './socialPictures.js';
import { renderSmooth, BRAND_FONT_CSS } from './socialRender.js';
import { MARK, slide } from './socialSlides.js';
import { LAUNCH_CSS } from './social-video-launch.js';
import { OUTRO_SCENE, VIDEO_TEMPLATE, brandline, esc, type VideoSpec } from './social-video-template.js';

const ROOT = resolve(import.meta.dirname, '..');
export const DIR = join(ROOT, 'social', 'posts', '2026-10-17-features-week');

export const shotFile = (dir: string, n: string) => join(dir, '_shots', `shot-${n}.png`);

export const FEATURES = [
  { id: 'countries', head: 'Now in the US and India', line: 'Pick your country from the menu.' },
  { id: 'notes', head: 'Notes with icons', line: 'See what each scent is made of.' },
  { id: 'search', head: 'Search that gets it', line: 'Type a brand and a name, like CK Man.' },
  { id: 'deals', head: 'Deals everywhere', line: 'Every country has its own Deals.' },
  { id: 'stocked', head: 'Most Stocked picks', line: 'See what most shops sell.' },
] as const;

/** Waits a moment, then until every image near the screen has loaded (or 40 s). */
async function wait(p: Page, ms = 3500): Promise<void> {
  await p.waitForTimeout(ms);
  await p
    .waitForFunction(
      () => Array.from(document.images).filter((i) => i.getBoundingClientRect().top < innerHeight + 200 && i.getBoundingClientRect().bottom > 0 && i.width > 40).every((i) => i.complete && i.naturalWidth > 0),
      undefined,
      { timeout: 40000 },
    )
    .catch(() => {});
  await p.waitForTimeout(500);
}

export async function shots(dir: string = DIR) {
  mkdirSync(join(dir, '_shots'), { recursive: true });
  const srv = await startPagesServer();
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
  const cache = new Map<string, Buffer>();
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (r) => {
    const u = r.request().url();
    if (!['image', 'fetch'].includes(r.request().resourceType())) return r.abort();
    try {
      if (!cache.has(u)) cache.set(u, (await run('curl', ['-sSfL', '--max-time', '25', u], { maxBuffer: 50e6, encoding: 'buffer' })).stdout);
      const ct = /\.png/.test(u) ? 'image/png' : /\.webp/.test(u) ? 'image/webp' : /\.svg/.test(u) ? 'image/svg+xml' : 'image/jpeg';
      await r.fulfill({ body: cache.get(u)!, contentType: ct, headers: { 'access-control-allow-origin': '*' } });
    } catch (e) {
      console.log('img fail', u.slice(0, 90), String(e).slice(0, 80));
      await r.abort();
    }
  });
  const p = await ctx.newPage();
  const base = `http://127.0.0.1:${srv.port}`;
  const open = async (u: string) => {
    await p.goto(base + u, { waitUntil: 'load' });
    await waitForApp(p);
    await wait(p, 1500);
    await p.getByRole('button', { name: /close|dismiss/i }).first().click({ timeout: 800 }).catch(() => {});
  };
  const out = (n: string) => shotFile(dir, n);
  const scrollShot = async (n: string, y: number) => {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await wait(p);
    await p.screenshot({ path: out(n) });
  };
  // 1 country menu, on the US home page
  await open('/us/');
  await p.locator('button[aria-haspopup]').first().click();
  await wait(p, 800);
  await p.screenshot({ path: out('countries') });
  // 2 notes, a product page
  await open('/search?q=CK%20Man');
  await p.getByText('Calvin Klein Man', { exact: true }).nth(1).click();
  await wait(p);
  await p.getByText('Top', { exact: true }).first().scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -110));
  await wait(p);
  await p.screenshot({ path: out('notes') });
  // 3 search
  await open('/search?q=CK%20Man');
  await wait(p);
  await p.screenshot({ path: out('search') });
  // 4 deals (India)
  await open('/in/deals'); 
  await scrollShot('deals', 380);
  // 5 most stocked (India home)
  await open('/in/');
  await p.getByText('Most Stocked').first().scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -80));
  await wait(p, 5000);
  await p.screenshot({ path: out('stocked') });
  await b.close();
  srv.close();
}

const ADDRESS = 'pricesniffs.space';
const dataUri = (file: string) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
/** The last word in red: one red word a headline at most (DESIGN-SYSTEM.md section 1). */
const redLast = (head: string) => esc(head).replace(/(\S+)$/, '<em>$1</em>');

const SLIDE_CSS = `
  .body { gap: 30px; }
  h1 { font-size: 76px; }
  .sub { font-size: 38px; }
  .phone { width: 359px; height: 700px; border-radius: 44px; overflow: hidden; border: 6px solid var(--card-line);
    box-shadow: 0 10px 30px rgba(10,10,11,0.4); background: var(--card); }
  .phone img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .addr { margin: 0; padding: 22px 52px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 52px; font-weight: 700; }
  .big-mark { width: 300px; height: 300px; }
`;

export function slideHtml(dir: string): string[] {
  const total = FEATURES.length + 1;
  const pages = FEATURES.map((f, i) =>
    slide(
      i + 1,
      total,
      `<h1 data-fit="2,56">${redLast(f.head)}</h1><p class="sub" data-fit="2,30">${esc(f.line)}</p><div class="phone"><img alt="" src="${dataUri(shotFile(dir, f.id))}"></div>`,
      i + 1 === FEATURES.length ? 'One more' : 'Swipe',
      'standard',
      SLIDE_CSS,
    ),
  );
  pages.push(
    slide(
      total,
      total,
      `${MARK('big-mark')}<h1 data-fit="2,56">Try it <em>today</em></h1><p class="sub" data-fit="2,30">Compare perfume prices in the UK, US and India.</p><p class="addr">${ADDRESS}</p>`,
      ADDRESS,
      'standard',
      SLIDE_CSS,
    ),
  );
  return pages;
}

export const FEATURES_VIDEO = {
  file: 'features-video-9x16.mp4',
  spec: {
    id: 'features-week',
    theme: VIDEO_TEMPLATE.launch.theme,
    scenes: [
      { id: 'cover', seconds: 2.4 },
      { id: 'countries', seconds: 2.6, transition: 'dissolve', dip: 0.97 },
      { id: 'notes', seconds: 2.6, transition: 'swipe' },
      { id: 'search', seconds: 2.6, transition: 'dissolve', dip: 0.97 },
      { id: 'deals', seconds: 2.6, transition: 'swipe' },
      { id: 'stocked', seconds: 2.6, transition: 'dissolve', dip: 0.97 },
      OUTRO_SCENE('swipe', 2.6),
    ],
  } as VideoSpec,
  scenes: (dir: string): { id: string; html: string }[] => [
    {
      id: 'cover',
      html: `${brandline()}<h2 class="h xxl" data-fit="3,64">New on<br><em>PriceSniffs</em></h2><p class="fine" data-box>Five things to try this week</p>`,
    },
    ...FEATURES.map((f) => ({
      id: f.id,
      html: `<h2 class="h feat" data-fit="2,48">${redLast(f.head)}</h2><div class="phone" data-box><img alt="" src="${dataUri(shotFile(dir, f.id))}"></div><p class="p feat-line" data-fit="1,28">${esc(f.line)}</p>`,
    })),
    { id: 'outro', html: `<div class="outro">${MARK('outro-mark')}<div class="word">Price<em>Sniffs</em></div><p class="addr" data-box>${ADDRESS}</p></div>` },
  ],
};

const VIDEO_CSS = `${LAUNCH_CSS}
  .stage { gap: 26px; }
  .h.feat { font-size: 64px; letter-spacing: -1px; }
  .feat-line { font-size: 38px; }
  .phone { width: 369px; height: 720px; border-radius: 44px; overflow: hidden; border: 6px solid var(--card-line); background: var(--card); }
  .phone img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
`;

export async function slides(dir: string = DIR) {
  const b = await launchChromium();
  try {
    const pages = slideHtml(dir);
    for (const [i, html] of pages.entries()) await renderSmooth(b, html.replace('<style>', `<style>${BRAND_FONT_CSS}`), 1080, 1440, join(dir, `features-${i + 1}-3x4.png`));
  } finally {
    await b.close();
  }
}

export async function video(dir: string = DIR, keepFrames = false) {
  await renderVideo({ spec: FEATURES_VIDEO.spec, scenes: FEATURES_VIDEO.scenes(dir), outDir: dir, file: FEATURES_VIDEO.file, extraCss: VIDEO_CSS, keepFrames });
}

/** Everything of this post, for `npm run social:render`: builds the page when it is missing, then shots, slides, video. */
export async function drawFeaturesWeek(dir: string = DIR) {
  if (!existsSync(join(ROOT, 'demo', 'index.html'))) execFileSync('npm', ['run', 'demo'], { cwd: ROOT, stdio: 'inherit' });
  await shots(dir);
  await slides(dir);
  await video(dir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  (async () => {
    if (a.includes('--shots')) await shots();
    if (a.includes('--slides')) await slides();
    if (a.includes('--video')) await video(DIR, a.includes('--keep-frames'));
    if (a.includes('--record')) recordPictures(DIR, Object.fromEntries([FEATURES_VIDEO.file, ...FEATURES.map((_, i) => `features-${i + 1}-3x4.png`), 'features-6-3x4.png'].map((f) => [f, { make: 'features-week' as const }])));
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

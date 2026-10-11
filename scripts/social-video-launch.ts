/**
 * Launch videos in the black theme, made from the shared video template
 * (scripts/social-video-template.ts, rules in docs/SOCIAL-MEDIA-PLAN.md
 * section 9): the same still opening, dissolves, swipes of at most half a
 * second, slow zoom, PriceSniffs ending and one second fade as the Deal of the
 * Day and informative videos, but about 10 to 12 seconds long.
 *
 *   npx tsx scripts/social-video-launch.ts                 the US launch video
 *   npx tsx scripts/social-video-launch.ts --video in      the India launch video
 *   npm run social:video:launch
 *
 *   --video us|in       which launch video (default: us)
 *   --date YYYY-MM-DD   the date in the folder name (default: today, UK)
 *   --keep-frames       keep the drawn frames in _frames/ (git ignores them)
 *
 * The video is not committed (docs/DECISIONS.md D28): pictures.json names it by
 * its key here ("launch-video", video "us" or "in"), and
 * `npm run social:render -- <folder>` draws it again from this file's scenes.
 * caption.txt and source.md are written by hand and committed; this script
 * never overwrites them (the one caption rule: social/DESIGN-SYSTEM.md section 5).
 *
 * Every figure on screen is a constant below (LAUNCH_US, LAUNCH_IN) and
 * tests/socialLaunchVideo.test.ts and tests/socialLaunchVideoIn.test.ts hold
 * it to the region's own report (data/regions/<region>/report.json) and shop
 * config. Only the site's own
 * marks, the flag tile, text and shapes are drawn: no shop logos and no bottle
 * photos (docs/DECISIONS.md D24 is still open for US shop images).
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flagSvg } from '../demo/flags.js';
import { renderVideo } from './social-video-render.js';
import { recordPictures } from './socialPictures.js';
import { MARK } from './socialSlides.js';
import { OUTRO_SCENE, VIDEO_TEMPLATE, brandline, esc, type VideoSpec } from './social-video-template.js';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * What the US video says. The counts are rounded down, as on the 9 October
 * carousel (social/posts/2026-10-09-launch-us/source.md), so they stay true as
 * the crawl grows. The shop names are the ones on that carousel's third slide
 * (enabled in src/config/retailers.us.ts and with products in the report on
 * 9 October); six of its eight are shown, the longest names kept short of a
 * crowded screen. No shop that is switched off is named.
 */
export const LAUNCH_US = {
  address: 'pricesniffs.space/us',
  shopsClaim: '20+',
  /** The smallest number of US shops with products the claim needs. */
  minShops: 20,
  productsClaim: '22,000+',
  /** The smallest product count the claim needs. */
  minProducts: 22000,
  /** Display names as in src/config/retailers.us.ts, with the report's ids. */
  shops: [
    { id: 'ulta', name: 'Ulta Beauty' },
    { id: 'bluemercury', name: 'Bluemercury' },
    { id: 'perfumania', name: 'Perfumania' },
    { id: 'luckyscent', name: 'Luckyscent' },
    { id: 'beauty-encounter', name: 'Beauty Encounter' },
    { id: 'ministry-of-scent', name: 'Ministry of Scent' },
  ],
} as const;

/**
 * What the India video says. Same figures as the 9 October carousel
 * (social/posts/2026-10-09-launch-india/source.md), rounded down: "10+" is the
 * shops with products in the report (shopsPriced counts three more that have no
 * listing kept, which are never counted or named), "14,000+" the products. The
 * six names are the first six on that carousel's shops slide (enabled in
 * src/config/retailers.in.ts and with products in the report).
 */
export const LAUNCH_IN = {
  address: 'pricesniffs.space/in',
  shopsClaim: '10+',
  /** The smallest number of Indian shops with products the claim needs. */
  minShops: 10,
  productsClaim: '14,000+',
  /** The smallest product count the claim needs. */
  minProducts: 14000,
  /** Display names as in src/config/retailers.in.ts, with the report's ids. */
  shops: [
    { id: 'nykaa', name: 'Nykaa' },
    { id: 'perfume-palace', name: 'Perfume Palace' },
    { id: 'fridaycharm', name: 'FridayCharm' },
    { id: 'perfume-network', name: 'Perfume Network' },
    { id: 'aar-fragrances', name: 'AAR Fragrances' },
    { id: 'bellavita-india', name: 'Bella Vita Organic' },
  ],
} as const;

export const LAUNCH_CSS = `
  .stage { gap: 44px; }
  .us-flag .flag, .in-flag .flag { display: block; width: 450px; height: 300px; border-radius: 26px; box-shadow: 0 0 0 5px var(--card-line); }
  .beta { display: inline-block; padding: 10px 26px 10px 34px; border: 4px solid var(--accent); border-radius: 999px;
    color: var(--accent); font-size: 38px; font-weight: 700; letter-spacing: 9px; }
  .h.xxl { font-size: 108px; line-height: 1.1; }
  .h.lg { font-size: 92px; line-height: 1.1; }
  .stat { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 30px 30px 34px; border-radius: 32px;
    background: var(--card); border: 2px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .stat b { font-size: 132px; line-height: 1; letter-spacing: -3px; color: var(--accent); white-space: nowrap; }
  .stat span { font-size: 50px; line-height: 1.2; color: var(--card-ink); }
  .fine { font-size: 34px; }
  .names { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .names span { padding: 36px 8px; border-radius: 26px; background: var(--card); border: 2px solid var(--card-line);
    font-size: 40px; font-weight: 700; line-height: 1.15; white-space: nowrap; color: var(--card-ink); box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .at { width: 270px; height: 270px; border-radius: 50%; border: 14px solid var(--accent); display: flex; align-items: center; justify-content: center;
    font-size: 165px; font-weight: 700; line-height: 1; padding-bottom: 14px; color: var(--ink); }
  .addr { margin: 0; padding: 18px 46px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 50px; font-weight: 700; white-space: nowrap; }
`;

/** The US launch video: 11.8 seconds, 354 frames, black theme. */
export const US_LAUNCH_VIDEO = {
  folder: 'launch-us-video',
  file: 'launch-us-9x16.mp4',
  spec: {
    id: 'launch-us',
    theme: VIDEO_TEMPLATE.launch.theme,
    scenes: [
      { id: 'launch', seconds: 2.8 },
      { id: 'compare', seconds: 2.8, transition: 'dissolve' },
      { id: 'shops', seconds: 2.8, transition: 'swipe' },
      { id: 'tag', seconds: 2.6, transition: 'dissolve' },
      OUTRO_SCENE('swipe', 2.6),
    ],
  } as VideoSpec,
  scenes: (): { id: string; html: string }[] => [
    {
      id: 'launch',
      html: `${brandline()}
      <div class="us-flag">${flagSvg('US')}</div>
      <span class="beta" data-box>BETA</span>
      <h1 class="h xxl" data-fit="2,64">We’ve launched<br>in the <em>US</em></h1>`,
    },
    {
      id: 'compare',
      html: `<p class="kicker">PriceSniffs US</p>
      <h2 class="h lg" data-fit="3,60">Compare perfume<br>prices from <em>${LAUNCH_US.shopsClaim}</em><br>US shops</h2>
      <div class="stat" data-box><b>${LAUNCH_US.productsClaim}</b><span>products, in dollars</span></div>
      <p class="fine">Prices before sales tax</p>`,
    },
    {
      id: 'shops',
      html: `<p class="kicker">Shops in the beta</p>
      <h2 class="h lg" data-fit="1,56">Some of the <em>shops</em></h2>
      <div class="names">${LAUNCH_US.shops.map((s) => `<span data-box>${esc(s.name)}</span>`).join('')}</div>
      <p class="fine">And more. This is a beta.</p>`,
    },
    {
      id: 'tag',
      html: `<div class="at" data-box>@</div>
      <h2 class="h xxl" data-fit="3,64">Tag your<br><em>friends</em><br>who’d love this</h2>`,
    },
    {
      id: 'outro',
      html: `<div class="outro">${MARK('outro-mark')}<div class="word">Price<em>Sniffs</em></div><p class="addr" data-box>${LAUNCH_US.address}</p></div>`,
    },
  ],
};

/** The India launch video: 11.8 seconds, the same scenes and timing as the US one. */
export const IN_LAUNCH_VIDEO = {
  folder: 'launch-india-video',
  file: 'launch-india-9x16.mp4',
  spec: { ...US_LAUNCH_VIDEO.spec, id: 'launch-in' } as VideoSpec,
  scenes: (): { id: string; html: string }[] => [
    {
      id: 'launch',
      html: `${brandline()}
      <div class="in-flag">${flagSvg('IN')}</div>
      <span class="beta" data-box>BETA</span>
      <h1 class="h xxl" data-fit="2,64">We’ve launched<br>in <em>India</em></h1>`,
    },
    {
      id: 'compare',
      html: `<p class="kicker">PriceSniffs India</p>
      <h2 class="h lg" data-fit="3,60">Compare perfume<br>prices from <em>${LAUNCH_IN.shopsClaim}</em><br>Indian shops</h2>
      <div class="stat" data-box><b>${LAUNCH_IN.productsClaim}</b><span>products, in rupees</span></div>
      <p class="fine">GST included</p>`,
    },
    {
      id: 'shops',
      html: `<p class="kicker">Shops in the beta</p>
      <h2 class="h lg" data-fit="1,56">Some of the <em>shops</em></h2>
      <div class="names">${LAUNCH_IN.shops.map((s) => `<span data-box>${esc(s.name)}</span>`).join('')}</div>
      <p class="fine">And more. This is a beta.</p>`,
    },
    US_LAUNCH_VIDEO.scenes()[3]!,
    {
      id: 'outro',
      html: `<div class="outro">${MARK('outro-mark')}<div class="word">Price<em>Sniffs</em></div><p class="addr" data-box>${LAUNCH_IN.address}</p></div>`,
    },
  ],
};

export const LAUNCH_VIDEOS = { us: US_LAUNCH_VIDEO, in: IN_LAUNCH_VIDEO } as const;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const date = opt('--date') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const only = opt('--video') ?? 'us';
  if (!(only in LAUNCH_VIDEOS)) throw new Error(`--video must be one of ${Object.keys(LAUNCH_VIDEOS).join(', ')}`);
  for (const [key, v] of Object.entries(LAUNCH_VIDEOS).filter(([k]) => k === only)) {
    const outDir = join(ROOT, 'social', 'posts', `${date}-${v.folder}`);
    mkdirSync(outDir, { recursive: true });
    await renderVideo({ spec: v.spec, scenes: v.scenes(), outDir, file: v.file, extraCss: LAUNCH_CSS, keepFrames: args.includes('--keep-frames') });
    recordPictures(outDir, { [v.file]: { make: 'launch-video', video: key } });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

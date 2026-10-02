/**
 * "What is PriceSniffs?" introduction carousel: four 3:4 feed slides
 * (1080 x 1440) plus the caption. Follows social/DESIGN-SYSTEM.md: it is a
 * one off post, so it uses the INVERTED theme (red background, black icons
 * and type; Deal of the Day keeps the standard black theme). Liberation Sans,
 * no web address on the image ("Link in bio"), no hyphens or dashes, smooth
 * 2x rendering and fit to space.
 *
 *   npx tsx scripts/social-intro-slides.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium } from './a11y-audit.js';
import { FIT_SCRIPT, renderSmooth } from './socialRender.js';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'social', 'posts', '2026-10-02-what-is-pricesniffs');
const W = 1080;
const H = 1440;
const TOTAL = 4;

/** The logo mark in the theme's colours: --mark-ring for the glass, --mark-bottle for the bottle. */
const MARK = (cls: string) =>
  `<svg class="${cls}" viewBox="240 240 610 610" aria-hidden="true"><circle cx="478" cy="478" r="196" fill="none" stroke="var(--mark-ring)" stroke-width="58"/><line x1="636" y1="636" x2="796" y2="796" stroke="var(--mark-ring)" stroke-width="72" stroke-linecap="round"/><g fill="var(--mark-bottle)"><rect x="452" y="366" width="52" height="42" rx="9"/><rect x="463" y="402" width="30" height="26"/><rect x="398" y="422" width="160" height="164" rx="34"/></g></svg>`;

/** A red ring with a white tick: the bullet used on every slide. */
const TICK = `<svg class="tick" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--icon)" stroke-width="7"/><path d="M20 33 l8 8 l16 -17" fill="none" stroke="var(--icon-inner)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * The two social themes (social/DESIGN-SYSTEM.md section 1). STANDARD is the
 * site's own look and is used by Deal of the Day; INVERTED is for one off
 * posts so they stand out in the grid: red background, black icons and type.
 * Black on this red is about 6:1 contrast, so body text stays black; white is
 * kept for large type only ("Sniffs").
 */
const THEMES = {
  standard: `--bg:#0A0A0B; --ink:#F7F7F8; --ink-2:#B9B9C0; --ink-3:#8A8A93; --accent:#FF3B41; --kicker:#FF6A6E;
    --card:#121214; --card-line:#26262B; --icon:#FF3B41; --icon-inner:#F7F7F8; --mark-ring:#FF3B41; --mark-bottle:#F7F7F8;
    --bar:#3A3A40; --bar-best:#4FB47B; --tag-bg:#1E0709; --tag-ink:#FF6A6E; --pill-bg:#FF3B41; --pill-ink:#0A0A0B; --dot:#3A3A40; --dot-on:#FF3B41;
    --card-ink:#F7F7F8; --card-ink-2:#B9B9C0; --card-ink-3:#8A8A93; --row-line:#1E1E22; --row-best:#FF3B41; --bar-rest:#5A5A62;`,
  // Cards are near black so they pop off the red; inside them the standard
  // theme's light type and red ticks come back so they stay readable.
  inverted: `--bg:#FF3B41; --ink:#0A0A0B; --ink-2:rgba(10,10,11,0.78); --ink-3:rgba(10,10,11,0.6); --accent:#FFFFFF; --kicker:#0A0A0B;
    --card:#141416; --card-line:#0A0A0B; --icon:#FF3B41; --icon-inner:#F7F7F8; --mark-ring:#0A0A0B; --mark-bottle:#0A0A0B;
    --bar:#3A3A40; --bar-best:#FF3B41; --tag-bg:#FF3B41; --tag-ink:#0A0A0B; --pill-bg:#0A0A0B; --pill-ink:#FF3B41; --dot:rgba(10,10,11,0.3); --dot-on:#0A0A0B;
    --card-ink:#F7F7F8; --card-ink-2:#B9B9C0; --card-ink-3:#8A8A93; --row-line:#26262B; --row-best:#FF3B41; --bar-rest:#5A5A62;`,
};
const THEME: keyof typeof THEMES = 'inverted';

const CSS = `
  * { box-sizing: border-box; }
  html { ${THEMES[THEME]} }
  html, body { margin: 0; width: ${W}px; height: ${H}px; background: var(--bg); color: var(--ink);
    font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; }
  main { height: 100%; padding: 80px 90px 70px; display: flex; flex-direction: column; align-items: center;
    justify-content: space-between; text-align: center; }
  .brandline { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 44px; letter-spacing: -0.5px; }
  .brandline .mark { width: 58px; height: 58px; flex: none; }
  em { font-style: normal; color: var(--accent); }
  .body { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 34px; }
  .kicker { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: var(--kicker); }
  h1 { margin: 0; width: 100%; font-size: 84px; line-height: 1.1; letter-spacing: -1px; }
  .sub { margin: 0; font-size: 40px; line-height: 1.35; color: var(--ink-2); }
  .list { width: 100%; max-width: 860px; display: flex; flex-direction: column; gap: 30px; text-align: left; }
  .item { display: flex; align-items: center; gap: 28px; padding: 26px 30px; border-radius: 28px;
    background: var(--card); border: 2px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .tick { flex: none; width: 64px; height: 64px; }
  .item p { margin: 0; font-size: 38px; line-height: 1.3; color: var(--card-ink); }
  .item b { display: block; font-size: 42px; margin-bottom: 4px; }
  .item span { color: var(--card-ink-2); font-size: 32px; }
  .big-mark { width: 380px; height: 380px; }
  .foot { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .dots { display: flex; gap: 12px; }
  .dots i { width: 14px; height: 14px; border-radius: 50%; background: var(--dot); }
  .dots i.on { background: var(--dot-on); }
  .swipe { font-size: 30px; font-weight: 700; color: var(--ink-2); }
  .pill { padding: 22px 52px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 46px; font-weight: 700; }
  .rows { width: 100%; max-width: 820px; border-radius: 28px; background: var(--card); border: 2px solid var(--card-line); padding: 10px 0; box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .row { display: flex; align-items: center; justify-content: space-between; padding: 22px 30px; border-bottom: 2px solid var(--row-line); }
  .row:last-child { border-bottom: 0; }
  .row.best { border-left: 6px solid var(--row-best); }
  .shop { display: flex; align-items: center; gap: 16px; }
  .bar { height: 22px; border-radius: 11px; background: var(--bar); }
  .tag { font-size: 20px; font-weight: 700; letter-spacing: 2px; color: var(--tag-ink); background: var(--tag-bg); border-radius: 8px; padding: 6px 10px; }
  .price { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .price .bar { background: var(--bar-best); }
  .row:not(.best) .price .bar { background: var(--bar-rest); }
  .note { font-size: 20px; color: var(--card-ink-3); letter-spacing: 1px; text-transform: uppercase; }
`;

function slide(n: number, inner: string, footRight: string): string {
  const dots = Array.from({ length: TOTAL }, (_, i) => `<i class="${i + 1 === n ? 'on' : ''}"></i>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="social-size" content="${W}x${H}"><style>${CSS}</style></head><body><main>
  <div class="brandline">${MARK('mark')}<span>Price<em>Sniffs</em></span></div>
  <div class="body">${inner}</div>
  <div class="foot"><div class="dots">${dots}</div><span class="swipe">${footRight}</span></div>
</main>${FIT_SCRIPT}</body></html>`;
}

const SLIDES = [
  slide(
    1,
    `${MARK('big-mark')}
     <h1 data-fit="1,40">What is Price<em>Sniffs</em>?</h1>
     <p class="sub">The UK perfume price checker that<br>shows you what you will really pay.</p>`,
    'Swipe to find out &rarr;',
  ),
  slide(
    2,
    `<p class="kicker">What it does</p>
     <h1 data-fit="1,40">Every price, side by side</h1>
     <div class="rows">
       <div class="row best"><div class="shop"><div class="bar" style="width:220px"></div><span class="tag">CHEAPEST</span></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
       <div class="row"><div class="shop"><div class="bar" style="width:260px"></div></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
       <div class="row"><div class="shop"><div class="bar" style="width:190px"></div></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
     </div>
     <div class="list">
       <div class="item">${TICK}<p><b>More than 35 UK shops</b><span>compared for every bottle</span></p></div>
       <div class="item">${TICK}<p><b>Full transparency</b><span>delivery and fees included whenever the shop publishes them</span></p></div>
     </div>`,
    'Swipe &rarr;',
  ),
  slide(
    3,
    `<p class="kicker">Why use it</p>
     <h1 data-fit="1,40">So you don't overpay</h1>
     <div class="list">
       <div class="item">${TICK}<p><b>The real total, first</b><span>cheapest price at the top, delivery and all</span></p></div>
       <div class="item">${TICK}<p><b>Shops we trust</b><span>only resellers we have bought from ourselves</span></p></div>
       <div class="item">${TICK}<p><b>Fresh prices</b><span>checked every 3 hours, no paid placements</span></p></div>
     </div>`,
    'Swipe &rarr;',
  ),
  slide(
    4,
    `<p class="kicker">Want to dig around more?</p>
     <h1 data-fit="1,40">Visit our site</h1>
     ${MARK('big-mark')}
     <span class="pill">Link in bio</span>`,
    '',
  ),
];

const CAPTION = `What is PriceSniffs? 🇬🇧

We built PriceSniffs so you can see what a perfume really costs before you buy it. Search for a bottle and we line up the prices from more than 35 UK shops, cheapest first, with delivery and fees added in whenever the shop publishes them.

Every shop we list is a reseller we have bought from ourselves, and prices are checked every 3 hours. Nobody pays to be shown higher up.

Want to dig around more? The link is in our bio, or go to pricesniffs.space

#perfume #fragrance #perfumedeals #ukdeals #pricesniffs
`;

mkdirSync(DIR, { recursive: true });
const browser = await launchChromium();
for (const [i, html] of SLIDES.entries()) {
  const name = `slide-${i + 1}-3x4`;
  writeFileSync(join(DIR, `${name}.html`), html);
  await renderSmooth(browser, html, W, H, join(DIR, `${name}.png`));
  console.log(`${name}.png`);
}
await browser.close();
writeFileSync(join(DIR, 'caption.txt'), CAPTION);

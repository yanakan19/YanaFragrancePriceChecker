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
import { renderSmooth } from './socialRender.js';
import { H, MARK, TICK, W, slide } from './socialSlides.js';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'social', 'posts', '2026-10-02-what-is-pricesniffs');
const TOTAL = 4;

const SLIDES = [
  slide(
    1,
    TOTAL,
    `${MARK('big-mark')}
     <h1 data-fit="1,40">What is Price<em>Sniffs</em>?</h1>
     <p class="sub">The UK perfume price checker that<br>shows you what you will really pay.</p>`,
    'Swipe to find out &rarr;',
  ),
  slide(
    2,
    TOTAL,
    `<p class="kicker">What it does</p>
     <h1 data-fit="1,40">Every price, side by side</h1>
     <div class="rows">
       <div class="row best"><div class="shop"><div class="bar" style="width:220px"></div><span class="tag">CHEAPEST</span></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
       <div class="row"><div class="shop"><div class="bar" style="width:260px"></div></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
       <div class="row"><div class="shop"><div class="bar" style="width:190px"></div></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
     </div>
     <div class="list">
       <div class="item">${TICK}<p><b>More than 30 UK shops</b><span>compared for every bottle</span></p></div>
       <div class="item">${TICK}<p><b>Full transparency</b><span>delivery and fees included whenever the shop publishes them</span></p></div>
     </div>`,
    'Swipe &rarr;',
  ),
  slide(
    3,
    TOTAL,
    `<p class="kicker">Why use it</p>
     <h1 data-fit="1,40">So you don't overpay</h1>
     <div class="list">
       <div class="item">${TICK}<p><b>The real total, first</b><span>cheapest price at the top, delivery and all</span></p></div>
       <div class="item">${TICK}<p><b>Shops we trust</b><span>only resellers we have bought from ourselves</span></p></div>
       <div class="item">${TICK}<p><b>Fresh prices</b><span>checked daily, no paid placements</span></p></div>
     </div>`,
    'Swipe &rarr;',
  ),
  slide(
    4,
    TOTAL,
    `<p class="kicker">Want to dig around more?</p>
     <h1 data-fit="1,40">Visit our site</h1>
     ${MARK('big-mark')}
     <span class="pill">Link in bio</span>`,
    '',
  ),
];

const CAPTION = `What is PriceSniffs? 🇬🇧

We built PriceSniffs so you can see what a perfume really costs before you buy it. Search for a bottle and we line up the prices from more than 30 UK shops, cheapest first, with delivery and fees added in whenever the shop publishes them.

Every shop we list is a reseller we have bought from ourselves, and prices are checked daily. Nobody pays to be shown higher up.

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

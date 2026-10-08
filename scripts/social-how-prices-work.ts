/**
 * "How our prices work" explainer carousel: six slides, each as a 3:4 feed
 * slide (1080 x 1440) and a 9:16 TikTok slide (1080 x 1920), plus captions.
 * A one off post, so it uses the INVERTED theme like the "What is
 * PriceSniffs?" carousel (social/DESIGN-SYSTEM.md), reel safe so the 9:16
 * version can be cut from the same slide.
 *
 * Every claim is one the site's own How It Works page makes (demo/legal.ts):
 * prices come off each shop's own pages once a day, standard UK delivery is
 * added, the free delivery spend is worked out, a listing with no stated
 * delivery can never be cheapest, older prices show their age and anything
 * over HIDE_OFFER_AFTER_DAYS is hidden, results are ordered by stock then
 * price, savings are the shop's own figures rounded down, and member only
 * rates are never the headline. The worked example on slide 3 is a real
 * offer, checked on the shop's own product page on 4 Oct 2026.
 *
 *   npx tsx scripts/social-how-prices-work.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';
import { recordPictures } from './socialPictures.js';
import { H, H_TIKTOK, MARK, TICK, W, slide, tiktokSlide } from './socialSlides.js';
import { HIDE_OFFER_AFTER_DAYS } from '../src/services/offerAge.js';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'social', 'posts', '2026-10-04-how-prices-work');
const TOTAL = 6;

const EXTRA = `
  .receipt { width: 100%; max-width: 820px; padding: 30px 36px; border-radius: 28px; background: var(--card);
    border: 2px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); color: var(--card-ink); text-align: left; }
  .receipt .s { margin: 0 0 14px; font-size: 36px; font-weight: 700; }
  .line { display: flex; justify-content: space-between; gap: 20px; font-size: 34px; color: var(--card-ink-2); margin: 8px 0; }
  .line.total { color: var(--card-ink); font-weight: 700; font-size: 42px; border-top: 2px solid var(--row-line); padding-top: 14px; margin-top: 14px; }
  .line .plus { color: #FF3B41; font-weight: 700; }
  .fine { margin: 0; font-size: 26px; color: var(--ink-2); }
`;

const item = (title: string, text: string) => `<div class="item">${TICK}<p><b>${title}</b><span>${text}</span></p></div>`;

const SLIDES = [
  `${MARK('big-mark')}
   <h1 data-fit="1,40">How our prices work</h1>
   <p class="sub">Where every price comes from,<br>what is in it and how fresh it is.</p>`,

  `<p class="kicker">Where prices come from</p>
   <h1 data-fit="1,40">Straight from the shop</h1>
   <div class="list">
     ${item('Read off each shop&#39;s own site', 'never typed in by hand')}
     ${item('Only what is on sale', 'a bottle shows up because a shop was selling it when we looked')}
   </div>`,

  `<p class="kicker">Then comes delivery</p>
   <h1 data-fit="1,40">We add it in for you</h1>
   <div class="receipt">
     <p class="s">Les Senteurs, a real example</p>
     <div class="line"><span>Bottle</span><span>£155.00</span></div>
     <div class="line"><span>Standard UK delivery</span><span class="plus">+ £3.95</span></div>
     <div class="line total"><span>The price we show</span><span>£158.95</span></div>
   </div>
   <div class="list">
     ${item('Free delivery spend worked out', 'if your bottle reaches it, delivery is free')}
   </div>
   <p class="fine">Baccarat Rouge 540 35ml, checked 4 Oct 2026</p>`,

  `<p class="kicker">Then we rank them</p>
   <h1 data-fit="1,40">Cheapest means cheapest in total</h1>
   <div class="rows">
     <div class="row best"><div class="shop"><div class="bar" style="width:220px"></div><span class="tag">CHEAPEST</span></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
     <div class="row"><div class="shop"><div class="bar" style="width:260px"></div></div><div class="price"><div class="bar" style="width:150px"></div><span class="note">Incl. delivery</span></div></div>
   </div>
   <div class="list">
     ${item('No delivery charge stated?', 'that shop can never be called cheapest')}
   </div>`,

  `<p class="kicker">How fresh is it</p>
   <h1 data-fit="1,40">Checked every day</h1>
   <div class="list">
     ${item('Once a day', 'at every shop that lets us read its pages')}
     ${item('Older than a day?', 'the listing shows how old it is')}
     ${item(`Older than ${HIDE_OFFER_AFTER_DAYS} days?`, 'we hide it')}
   </div>`,

  `<p class="kicker">And it stays fair</p>
   <h1 data-fit="1,40">Nobody pays to rank higher</h1>
   <div class="list">
     ${item('Ordered by stock, then price', 'commission never moves a listing')}
     ${item('Savings are the shop&#39;s own', 'and percentages round down')}
   </div>
   <span class="pill">Link in bio</span>`,
];

const BODY = `How do our prices work? 🇬🇧

Every price on PriceSniffs is read off the shop's own website, never typed in by hand. We check every shop that lets us read its pages once a day. If a price is more than a day old the listing says so, and after ${HIDE_OFFER_AFTER_DAYS} days we hide it.

Each price includes standard UK delivery, and we work out whether your bottle reaches the shop's spend for free delivery. A real example from today: Baccarat Rouge 540 35ml is £155.00 at Les Senteurs, plus £3.95 delivery, so we show £158.95.

Cheapest means cheapest in total. If a shop does not say what delivery costs, it can never be called cheapest. Results are ordered by stock and then price, and nobody pays to rank higher.`;

const CAPTION = `${BODY}

The link is in our bio, or go to pricesniffs.space

#perfume #fragrance #perfumedeals #ukdeals #pricesniffs
`;

const TIKTOK_CAPTION = `${BODY}

See it for yourself at pricesniffs.space

#perfumetok #fragrancetok #perfumedeals #ukdeals #pricesniffs
`;

mkdirSync(DIR, { recursive: true });
const browser = await launchChromium();
for (const [i, inner] of SLIDES.entries()) {
  const foot = i + 1 === TOTAL ? '' : i === 0 ? 'Swipe to find out &rarr;' : 'Swipe &rarr;';
  const html = slide(i + 1, TOTAL, inner, foot, 'inverted', EXTRA, true);
  writeFileSync(join(DIR, `slide-${i + 1}-3x4.html`), html);
  await renderSmooth(browser, html, W, H, join(DIR, `slide-${i + 1}-3x4.png`));
  await renderSmooth(browser, tiktokSlide(html), W, H_TIKTOK, join(DIR, `slide-${i + 1}-9x16.png`));
  console.log(`slide ${i + 1}`);
}
await browser.close();
writeFileSync(join(DIR, 'caption.txt'), CAPTION);
writeFileSync(join(DIR, 'tiktok-caption.txt'), TIKTOK_CAPTION);
recordPictures(DIR); // the PNGs are not committed (docs/DECISIONS.md D28)

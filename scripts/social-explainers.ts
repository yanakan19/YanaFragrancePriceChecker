/**
 * Five red explainer carousels in the series that began with "How our prices
 * work" (scripts/social-how-prices-work.ts): how the Deal of the Day is
 * picked, reading the price graph, same perfume in a different bottle, how
 * the site makes money, and why a shop might be missing. Each is five
 * slides, rendered as 3:4 feed slides and 9:16 TikTok slides, in the
 * INVERTED theme, reel safe, with a feed caption and a TikTok caption.
 *
 * Every claim is one the site already makes or the code already does:
 *  - Deal of the Day: scripts/social-deal-of-day.ts (dealFor needs an in
 *    stock cheapest offer with delivery stated, measured against the brand's
 *    own price; choose() takes the biggest saving never posted before).
 *  - Graph: demo/priceHistoryChart.ts (delivery added at today's rates,
 *    square points where delivery is not stated, high and low labelled).
 *  - Bottles: grouping by brand, name, strength and size; gift sets only
 *    under the Size filter's Gift Sets option.
 *  - Money: the affiliate page in demo/legal.ts; the shop count is read from
 *    the registry, not typed.
 *  - Missing shops: the registry's own count and the reasons it records.
 *
 *   npx tsx scripts/social-explainers.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';
import { recordPictures } from './socialPictures.js';
import { H, H_TIKTOK, MARK, TICK, W, slide, tiktokSlide } from './socialSlides.js';
import { RETAILERS } from '../src/config/retailers.js';

const ROOT = resolve(import.meta.dirname, '..');
const DATE = '2026-10-04';
const COMMISSIONED = RETAILERS.filter((r) => r.affiliate.status === 'active').length;
const ASSESSED = RETAILERS.length;

const EXTRA = `
  .graph { width: 100%; max-width: 820px; padding: 26px 30px 18px; border-radius: 28px; background: var(--card);
    border: 2px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .graph svg { display: block; width: 100%; height: auto; }
  .fine { margin: 0; font-size: 26px; color: var(--ink-2); }
  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; max-width: 860px; }
  .chip { padding: 16px 26px; border-radius: 999px; background: var(--card); color: var(--card-ink); font-size: 32px; font-weight: 700;
    border: 2px solid var(--card-line); }
`;

const item = (title: string, text: string) => `<div class="item">${TICK}<p><b>${title}</b><span>${text}</span></p></div>`;
const cover = (title: string, sub: string) => `${MARK('big-mark')}<h1 data-fit="1,40">${title}</h1><p class="sub">${sub}</p>`;
const head = (kicker: string, title: string) => `<p class="kicker">${kicker}</p><h1 data-fit="1,40">${title}</h1>`;
const end = (kicker: string, title: string, pill = 'Link in bio') => `${head(kicker, title)}${MARK('big-mark')}<span class="pill">${pill}</span>`;

/** A price line drawn as a shape only: no figures, so nothing on it can be wrong. */
const GRAPH = (square: boolean) => `<div class="graph"><svg viewBox="0 0 760 330" aria-hidden="true">
  <line x1="70" y1="40" x2="740" y2="40" stroke="#3A3A40" stroke-width="2" stroke-dasharray="6 8"/>
  <line x1="70" y1="270" x2="740" y2="270" stroke="#3A3A40" stroke-width="2" stroke-dasharray="6 8"/>
  <text x="0" y="50" fill="#9A9AA3" font-size="26" font-family="Liberation Sans, Arial">High</text>
  <text x="0" y="280" fill="#9A9AA3" font-size="26" font-family="Liberation Sans, Arial">Low</text>
  <polyline points="90,70 200,60 310,120 420,110 530,250 640,200 730,190" fill="none" stroke="#FF3B41" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
  ${[[90, 70], [200, 60], [310, 120], [530, 250], [640, 200], [730, 190]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#FF3B41"/>`).join('')}
  ${square ? '<rect x="406" y="96" width="28" height="28" fill="none" stroke="#F7F7F8" stroke-width="5"/>' : '<circle cx="420" cy="110" r="11" fill="#FF3B41"/>'}
  <line x1="70" y1="305" x2="740" y2="305" stroke="#3A3A40" stroke-width="2"/>
</svg></div>`;

interface Post { dir: string; slides: string[]; body: string; feedTags: string; tiktokTags: string; feedEnd?: string; tiktokEnd?: string }

const POSTS: Post[] = [
  {
    dir: `${DATE}-explainer-deal-of-the-day`,
    slides: [
      cover('How we pick the Deal of the Day', 'One bottle a day,<br>and the rule we follow.'),
      `${head('Step one', 'The biggest saving wins')}<div class="list">
         ${item('Brand&#39;s own price against our cheapest', 'across every bottle we track')}
         ${item('Delivery included', 'the cheapest price is the total you pay')}</div>`,
      `${head('Step two', 'It has to be real')}<div class="list">
         ${item('In stock', 'the cheapest shop must be selling it')}
         ${item('Delivery stated', 'no guessing what it costs to send')}</div>`,
      `${head('Step three', 'Never the same bottle twice')}<div class="list">
         ${item('Every pick is recorded', 'a bottle we have posted is skipped next time')}
         ${item('Time on every post', 'so you know when we checked the price')}</div>`,
      end('Every day', 'A new deal on our page'),
    ],
    body: `How do we pick the Deal of the Day? 🇬🇧

We compare the brand's own price with the cheapest total we can find, delivery included, across every bottle we track. The biggest saving wins.

It has to be real: the cheapest shop must have it in stock and must say what delivery costs. Every pick is recorded, so the same bottle never comes up twice, and the same brand rests for a week, so you see a different house each day. Every post shows when we checked the price. Prices move during the day, so check before you buy.`,
    feedTags: '#perfume #fragrance #perfumedeals #ukdeals #pricesniffs',
    tiktokTags: '#perfumetok #fragrancetok #perfumedeals #ukdeals #pricesniffs',
  },
  {
    dir: `${DATE}-explainer-price-graph`,
    slides: [
      cover('How to read our price graph', 'Every product page shows how<br>its price has moved.'),
      `${head('The line', 'Every point includes delivery')}${GRAPH(false)}<div class="list">
         ${item('The cheapest bottle we saw', 'with that shop&#39;s delivery added at today&#39;s rates')}</div>`,
      `${head('The labels', 'Highest and lowest, marked')}${GRAPH(false)}<div class="list">
         ${item('Room above and below', 'so a small dip is easy to see')}</div>`,
      `${head('Spot a square?', 'Delivery not stated')}${GRAPH(true)}<div class="list">
         ${item('That point is the bottle price only', 'the shop does not say what delivery costs')}</div>`,
      end('Before you buy', 'Check the graph'),
    ],
    body: `How do you read our price graph? 🇬🇧

Every product page on PriceSniffs has a graph of how its price has moved. Each point is the cheapest bottle we saw at that time, with that shop's delivery added at today's rates, so the line shows totals rather than bottle prices.

The highest and lowest prices are labelled down the side. If you spot a square point, that shop does not say what delivery costs, so that point is the bottle price only. Have a look before you buy, and you can see whether today's price is a good one.`,
    feedTags: '#perfume #fragrance #perfumedeals #ukdeals #pricesniffs',
    tiktokTags: '#perfumetok #fragrancetok #perfumedeals #ukdeals #pricesniffs',
  },
  {
    dir: `${DATE}-explainer-same-perfume`,
    slides: [
      cover('Same perfume, different bottle', 'Why one name can mean<br>several products.'),
      `${head('Strength matters', 'Each strength is its own product')}<div class="chips">
         <span class="chip">Eau de Toilette</span><span class="chip">Eau de Parfum</span><span class="chip">Parfum</span></div><div class="list">
         ${item('Listed separately', 'so you never compare one strength with another')}</div>`,
      `${head('Size matters', 'Like for like, always')}<div class="list">
         ${item('50ml against 50ml', 'never a 50ml against a 100ml')}
         ${item('Minis count too', 'a 10ml is its own size of the same perfume')}</div>`,
      `${head('Gift sets', 'They have their own filter')}<div class="list">
         ${item('Choose Gift Sets under Size', 'on search, brand and shop pages')}
         ${item('Never mixed in', 'a set is never compared with a single bottle')}</div>`,
      end('Find your exact bottle', 'Search by name, then filter'),
    ],
    body: `Same perfume, different bottle? 🇬🇧

One name can mean several products. Eau de Toilette, Eau de Parfum and Parfum are different strengths, so we list each one separately and never compare one with another.

Sizes are compared like for like: a 50ml only ever sits next to other 50ml bottles, and minis such as a 10ml count as their own size of the same perfume. Gift sets have their own option under the Size filter and are never compared with a single bottle.`,
    feedTags: '#perfume #fragrance #perfumetips #ukdeals #pricesniffs',
    tiktokTags: '#perfumetok #fragrancetok #perfumetips #ukdeals #pricesniffs',
  },
  {
    dir: `${DATE}-explainer-how-we-make-money`,
    slides: [
      cover('How PriceSniffs makes money', 'Plainly, because you<br>should know.'),
      `${head('Commission', 'Some shops pay us')}<div class="list">
         ${item(`${COMMISSIONED} shops pay commission`, 'when you buy after clicking through from us')}
         ${item('It costs you nothing', 'you pay the shop&#39;s normal price')}</div>`,
      `${head('No surprises', 'Marked before you click')}<div class="list">
         ${item('&ldquo;Affiliate link&rdquo;', 'written on the shop&#39;s row, under its name')}
         ${item('Every other link', 'carries no tracking and earns nothing')}</div>`,
      `${head('What it never does', 'It never changes the order')}<div class="list">
         ${item('Ordered by stock, then price', 'commission shops get no head start')}
         ${item('No paid placements', 'nobody can pay to rank higher')}</div>`,
      end('Still the cheapest first', 'Compare for yourself'),
    ],
    body: `How does PriceSniffs make money? 🇬🇧

${COMMISSIONED} of the shops we list pay us commission when you buy after clicking through from us. It costs you nothing: you pay the shop's normal price.

Those links are marked "Affiliate link" on the shop's row, so you see it before you click, and links to every other shop carry no tracking at all. Commission never changes the order. Results are ordered by stock and then price, and nobody can pay to rank higher.`,
    feedTags: '#perfume #fragrance #perfumedeals #ukdeals #pricesniffs',
    tiktokTags: '#perfumetok #fragrancetok #perfumedeals #ukdeals #pricesniffs',
  },
  {
    dir: `${DATE}-explainer-missing-shop`,
    slides: [
      cover('Why isn&#39;t my favourite shop on here?', 'The honest reasons a shop<br>can be missing.'),
      `${head('So far', `We have looked at ${ASSESSED} shops`)}<div class="list">
         ${item('Each one checked first', 'before it goes on the site')}
         ${item('More are added all the time', 'as we find a way to read them')}</div>`,
      `${head('Reason one', 'Some shops block us')}<div class="list">
         ${item('We respect it', 'if a shop says no, we leave it out')}</div>`,
      `${head('Reason two', 'No total we can stand behind')}<div class="list">
         ${item('No delivery charge published', 'we would have to guess what you pay')}
         ${item('Prices not in pounds', 'we only show what a UK shopper pays')}</div>`,
      end('Know a good shop?', 'Tell us', 'Message us'),
    ],
    body: `Why isn't my favourite shop on PriceSniffs? 🇬🇧

We have looked at ${ASSESSED} shops so far, and each one is checked before it goes on the site. A shop can be missing for a few honest reasons.

Some shops block automated checks, and if a shop says no, we leave it out. Some do not publish what delivery costs, and we will not guess your total. Some only show prices in another currency, and we only show what a UK shopper actually pays.

Know a shop we should look at? Message us or email yannysniffs@gmail.com`,
    feedTags: '#perfume #fragrance #perfumeshops #ukdeals #pricesniffs',
    tiktokTags: '#perfumetok #fragrancetok #perfumeshops #ukdeals #pricesniffs',
    feedEnd: 'pricesniffs.space is linked in our bio.',
    tiktokEnd: 'See which shops we compare at pricesniffs.space',
  },
];

const browser = await launchChromium();
for (const post of POSTS) {
  const dir = join(ROOT, 'social', 'posts', post.dir);
  mkdirSync(dir, { recursive: true });
  for (const [i, inner] of post.slides.entries()) {
    const total = post.slides.length;
    const foot = i + 1 === total ? '' : i === 0 ? 'Swipe to find out &rarr;' : 'Swipe &rarr;';
    const html = slide(i + 1, total, inner, foot, 'inverted', EXTRA, true);
    writeFileSync(join(dir, `slide-${i + 1}-3x4.html`), html);
    await renderSmooth(browser, html, W, H, join(dir, `slide-${i + 1}-3x4.png`));
    await renderSmooth(browser, tiktokSlide(html), W, H_TIKTOK, join(dir, `slide-${i + 1}-9x16.png`));
  }
  writeFileSync(join(dir, 'caption.txt'), `${post.body}\n\n${post.feedEnd ?? 'The link is in our bio, or go to pricesniffs.space'}\n\n${post.feedTags}\n`);
  writeFileSync(join(dir, 'tiktok-caption.txt'), `${post.body}\n\n${post.tiktokEnd ?? 'See it for yourself at pricesniffs.space'}\n\n${post.tiktokTags}\n`);
  recordPictures(dir); // the PNGs are not committed (docs/DECISIONS.md D28)
  console.log(post.dir);
}
await browser.close();

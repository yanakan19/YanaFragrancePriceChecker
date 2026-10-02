/**
 * "How much could you save?" carousel: one real comparison, six 3:4 feed
 * slides plus the caption. A one off post, so it uses the INVERTED theme
 * (social/DESIGN-SYSTEM.md section 1).
 *
 * Every figure is a real price from the site's own data on the date below,
 * read back from each shop's live listing where the shop allows it:
 *   Justmylook   £120.95, free delivery (over £25), live price confirmed 2 Oct 2026
 *   Selfridges   £150.00 plus £6.95 standard delivery (free delivery is for paid
 *                Selfridges+ / Unlocked members only), from the site's last check;
 *                Selfridges blocks automated reads, so confirm by hand before posting.
 * The comparison is the two shops PriceSniffs compares, not every UK shop.
 *
 *   npx tsx scripts/social-savings-example.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';
import { H, MARK, W, slide } from './socialSlides.js';
import { resizedPhotoUrl } from '../demo/photo.js';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'social', 'posts', '2026-10-02-savings-example');
const TOTAL = 6;

const DEAL = {
  name: 'Miss Dior Eau de Parfum 100ml',
  brand: 'Dior',
  photo: 'https://www.justmylook.com/cdn/shop/files/DIOR0043_3c589c3b-ad80-4c66-b419-086d3af769e6.png?v=1758900971&width=3000',
  dear: { shop: 'Selfridges', item: 150, delivery: 6.95, deliveryNote: 'Free delivery is for paid members only' },
  cheap: { shop: 'Justmylook', item: 120.95, delivery: 0, deliveryNote: 'Free delivery over £25' },
  checked: '2 October 2026',
};
const gbp = (n: number) => `£${n.toFixed(2)}`;
const dearTotal = DEAL.dear.item + DEAL.dear.delivery;
const cheapTotal = DEAL.cheap.item + DEAL.cheap.delivery;
const saving = Math.round((dearTotal - cheapTotal) * 100) / 100;
const percent = Math.round((saving / dearTotal) * 100);
const year = Math.round(saving * 12 * 100) / 100;

function photoDataUri(url: string): string {
  const out = execFileSync('curl', ['-sSL', '--max-time', '30', '-w', '\n%{content_type}', resizedPhotoUrl(url, 800) ?? url], { maxBuffer: 64 * 1024 * 1024 });
  const cut = out.lastIndexOf(0x0a);
  return `data:${out.subarray(cut + 1).toString().trim()};base64,${out.subarray(0, cut).toString('base64')}`;
}

const EXTRA = `
  .photo { width: 440px; height: 440px; border-radius: 36px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
  .photo img { width: 86%; height: 86%; object-fit: contain; }
  .who { display: flex; flex-direction: column; gap: 10px; }
  .who .name { margin: 0; font-size: 52px; font-weight: 700; }
  .who .brand { margin: 0; font-size: 30px; letter-spacing: 4px; text-transform: uppercase; color: var(--ink-2); }
  .vs { width: 100%; display: flex; gap: 24px; }
  .shopcard { flex: 1 1 0; min-width: 0; padding: 34px 26px; border-radius: 28px; background: var(--card); border: 3px solid var(--card-line);
    box-shadow: 0 10px 30px rgba(10,10,11,0.25); color: var(--card-ink); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  .shopcard.win { border-color: #F7F7F8; }
  .shopcard .s { margin: 0; font-size: 34px; font-weight: 700; }
  .shopcard .p { margin: 0; font-size: 78px; font-weight: 700; letter-spacing: -1px; }
  .shopcard .l { margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; color: var(--card-ink-3); }
  .shopcard .win-tag { font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #0A0A0B; background: #FF3B41; border-radius: 8px; padding: 6px 12px; }
  .sum { width: 100%; display: flex; flex-direction: column; gap: 24px; }
  .sumcard { padding: 28px 34px; border-radius: 28px; background: var(--card); box-shadow: 0 10px 30px rgba(10,10,11,0.25); color: var(--card-ink); text-align: left; }
  .sumcard.win { outline: 3px solid #F7F7F8; outline-offset: -3px; }
  .sumcard .s { margin: 0 0 14px; font-size: 34px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
  .line { display: flex; justify-content: space-between; font-size: 32px; color: var(--card-ink-2); margin: 6px 0; }
  .line.total { color: var(--card-ink); font-weight: 700; font-size: 40px; border-top: 2px solid var(--row-line); padding-top: 12px; margin-top: 12px; }
  .line .plus { color: #FF3B41; font-weight: 700; }
  .line .free { color: #4FB47B; font-weight: 700; }
  .note2 { margin: 6px 0 0; font-size: 24px; color: var(--card-ink-3); }
  .big { margin: 0; font-size: 200px; font-weight: 700; letter-spacing: -6px; line-height: 1; }
  .big small { font-size: 0.5em; letter-spacing: -2px; }
  .lead { margin: 0; font-size: 46px; font-weight: 700; }
  .fine { margin: 0; font-size: 24px; color: var(--ink-3); }
  .stack { display: flex; flex-direction: column; align-items: center; gap: 22px; }
  .pill { padding: 22px 52px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 46px; font-weight: 700; }
  .badge { display: inline-block; padding: 14px 30px; border-radius: 999px; background: #0A0A0B; color: #F7F7F8; font-size: 40px; font-weight: 700; }
`;
const fine = `<p class="fine">Prices checked ${DEAL.checked}. Prices change, so check before you buy.</p>`;

async function main() {
  const photo = photoDataUri(DEAL.photo);
  const SLIDES = [
    `<p class="kicker">A real example</p>
     <h1 data-fit="1,40">How much could you save?</h1>
     <div class="photo"><img src="${photo}" alt=""></div>
     <div class="who"><p class="name" data-fit="2,34">${DEAL.name}</p><p class="brand">${DEAL.brand}</p></div>`,
    `<p class="kicker">Same bottle, two shops</p>
     <h1 data-fit="1,40">The price on the label</h1>
     <div class="vs">
       <div class="shopcard"><p class="s">${DEAL.dear.shop}</p><p class="p" data-fit="1,40">${gbp(DEAL.dear.item)}</p><p class="l">Bottle price</p></div>
       <div class="shopcard win"><span class="win-tag">CHEAPEST WE FOUND</span><p class="s">${DEAL.cheap.shop}</p><p class="p" data-fit="1,40">${gbp(DEAL.cheap.item)}</p><p class="l">Bottle price</p></div>
     </div>
     <p class="sub">Already ${gbp(DEAL.dear.item - DEAL.cheap.item)} apart. Then comes delivery.</p>
     ${fine}`,
    `<p class="kicker">Then comes delivery</p>
     <h1 data-fit="1,40">We add it in for you</h1>
     <div class="sum">
       <div class="sumcard"><p class="s">${DEAL.dear.shop}</p>
         <div class="line"><span>Bottle</span><span>${gbp(DEAL.dear.item)}</span></div>
         <div class="line"><span>Delivery at checkout</span><span class="plus">+ ${gbp(DEAL.dear.delivery)}</span></div>
         <div class="line total"><span>You pay</span><span>${gbp(dearTotal)}</span></div>
         <p class="note2">${DEAL.dear.deliveryNote}</p></div>
       <div class="sumcard win"><p class="s">${DEAL.cheap.shop}</p>
         <div class="line"><span>Bottle</span><span>${gbp(DEAL.cheap.item)}</span></div>
         <div class="line"><span>Delivery</span><span class="free">Free</span></div>
         <div class="line total"><span>You pay</span><span>${gbp(cheapTotal)}</span></div></div>
     </div>
     <p class="sub">PriceSniffs shows the total before you click.</p>`,
    `<p class="kicker">Your saving on one bottle</p>
     <div class="stack">
       <p class="big">${gbp(saving)}</p>
       <span class="badge">${percent}% less</span>
       <p class="sub">${gbp(dearTotal)} at ${DEAL.dear.shop}<br>${gbp(cheapTotal)} at ${DEAL.cheap.shop}</p>
     </div>
     ${fine}`,
    `<p class="kicker">Buy one a month</p>
     <h1 data-fit="1,40">That's a year of savings</h1>
     <div class="stack">
       <p class="big">${gbp(year).replace('.00', '')}</p>
       <p class="lead">saved over 12 months</p>
       <p class="sub">12 bottles × ${gbp(saving)} saved each</p>
     </div>
     <p class="fine">If you bought this bottle every month at today's prices.<br>Prices change, so check before you buy.</p>`,
    `<p class="kicker">Find your own savings</p>
     <h1 data-fit="1,40">Search any perfume</h1>
     ${MARK('big-mark')}
     <span class="pill">Link in bio</span>`,
  ];
  const caption = `How much could you save? 🇬🇧

A real example from today. ${DEAL.name} by ${DEAL.brand} is ${gbp(DEAL.dear.item)} at ${DEAL.dear.shop}, and their standard delivery adds ${gbp(DEAL.dear.delivery)} at checkout, so you pay ${gbp(dearTotal)}. The same bottle is ${gbp(DEAL.cheap.item)} at ${DEAL.cheap.shop} with free delivery.

That is ${gbp(saving)} saved on one bottle, ${percent}% less. Buy one a month at these prices and it adds up to ${gbp(year).replace('.00', '')} in a year.

We show the total with delivery before you click, for more than 30 UK shops. Prices checked ${DEAL.checked} and they change, so check the link in our bio before you buy.

#perfume #fragrance #missdior #perfumedeals #pricesniffs
`;

  mkdirSync(DIR, { recursive: true });
  const browser = await launchChromium();
  for (const [i, inner] of SLIDES.entries()) {
    const html = slide(i + 1, TOTAL, inner, i + 1 === TOTAL ? '' : i === 0 ? 'Swipe to see &rarr;' : 'Swipe &rarr;', 'inverted', EXTRA, true);
    const name = `slide-${i + 1}-3x4`;
    writeFileSync(join(DIR, `${name}.html`), html.replace(photo, DEAL.photo));
    await renderSmooth(browser, html, W, H, join(DIR, `${name}.png`));
    console.log(`${name}.png`);
  }
  await browser.close();
  writeFileSync(join(DIR, 'caption.txt'), caption);
  console.log(`saving ${gbp(saving)} (${percent}%), year ${gbp(year)}`);
}

await main();

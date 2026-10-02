/**
 * Daily "How much could you save?" carousel (social/DESIGN-SYSTEM.md section
 * 8): one real comparison between a well known shop and the cheapest shop
 * PriceSniffs found for the same bottle, as six 3:4 feed slides plus caption,
 * in the STANDARD (black) theme.
 *
 *   npm run social:savings                     today's example
 *   npm run social:savings -- --id <id>        a chosen perfume
 *   npm run social:savings -- --theme inverted --out <folder name>
 *
 * Rules for a fair example (all from the site's own data and functions):
 *  - the cheap side is the product page's own cheapest offer (bestOffer), in
 *    stock, delivery stated, and the page is sure it is cheapest;
 *  - the dear side is the dearest in stock listing from a WELL_KNOWN shop;
 *  - both prices were checked within MAX_AGE_HOURS; saving at least £5 and 10%;
 *  - where a shop's own product data can be read (Shopify), its live price
 *    must still match, or the example is skipped;
 *  - no perfume repeats within NO_REPEAT_DAYS (social/savings-history.json);
 *  - examples where the well known shop adds delivery are preferred, since
 *    that is the point slide 3 makes.
 * If nothing qualifies, it says so and writes nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { offersFor } from '../demo/catalogue.generated.js';
import { resizedPhotoUrl } from '../demo/photo.js';
import { buildComparison, bestOffer } from '../src/services/priceService.js';
import { cheapestVerdict } from '../src/services/deliveryConfidence.js';
import type { PresentedOffer } from '../src/types/offer.js';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';
import { H, MARK, THEMES, W, slide } from './socialSlides.js';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://pricesniffs.space';
const HISTORY = join(ROOT, 'social', 'savings-history.json');
const TOTAL = 6;
const MAX_AGE_HOURS = 96;
const NO_REPEAT_DAYS = 30;
const WELL_KNOWN = new Set([
  'selfridges', 'john-lewis', 'lookfantastic', 'superdrug', 'allbeauty',
  'harvey-nichols', 'boots', 'the-perfume-shop', 'the-fragrance-shop', 'notino',
]);

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const theme = (opt('--theme') ?? 'standard') as keyof typeof THEMES;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });
const gbp = (n: number) => `£${n.toFixed(2)}`;
const undash = (s: string) => s.replace(/\s*[-‐-―−]\s*/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Example {
  frag: (typeof DEMO_FRAGRANCES)[number];
  dear: PresentedOffer;
  cheap: PresentedOffer;
  saving: number;
  percent: number;
}
interface HistoryEntry { date: string; id: string; dear: string; cheap: string }

function candidates(): Example[] {
  const forced = opt('--id');
  const out: Example[] = [];
  for (const frag of DEMO_FRAGRANCES) {
    if (forced ? frag.id !== forced : !frag.photoUrl || frag.concentration === 'Perfume Oil') continue;
    const rows = buildComparison(offersFor(frag.id), { sortBy: 'delivered' });
    const cheap = bestOffer(rows);
    if (!cheap || cheap.deliveredPriceGbp === null || !cheap.isPurchasable || cheap.ageSeconds > MAX_AGE_HOURS * 3600) continue;
    if (!cheapestVerdict(rows).decided || WELL_KNOWN.has(cheap.retailer.id)) continue;
    const dear = rows
      .filter((r) => WELL_KNOWN.has(r.retailer.id) && r.isPurchasable && r.deliveredPriceGbp !== null && r.ageSeconds <= MAX_AGE_HOURS * 3600)
      .sort((a, b) => b.deliveredPriceGbp! - a.deliveredPriceGbp!)[0];
    if (!dear) continue;
    const saving = Math.round((dear.deliveredPriceGbp! - cheap.deliveredPriceGbp) * 100) / 100;
    const percent = Math.round((saving / dear.deliveredPriceGbp!) * 100);
    if (!forced && (saving < 5 || percent < 10)) continue;
    out.push({ frag, dear, cheap, saving, percent });
  }
  // Delivery added by the well known shop first (slide 3's point), then the biggest saving.
  return out.sort((a, b) => Number((b.dear.delivery.costGbp ?? 0) > 0) - Number((a.dear.delivery.costGbp ?? 0) > 0) || b.saving - a.saving);
}

function curl(url: string, extra: string[] = []): Buffer {
  return execFileSync('curl', ['-sSL', '--max-time', '30', ...extra, url], { maxBuffer: 64 * 1024 * 1024 });
}

/** Shopify shops publish product data at <product url>.js. 'match', 'differs' or 'unreadable'. */
function livePrice(offer: PresentedOffer): { status: 'match' | 'differs' | 'unreadable'; live?: number } {
  try {
    const d = JSON.parse(curl(`${offer.outboundUrl.split('?')[0]}.js`).toString()) as { variants: { price: number; available: boolean }[] };
    const prices = d.variants.filter((v) => v.available).map((v) => v.price / 100);
    if (!prices.length) return { status: 'differs' };
    const near = prices.reduce((a, b) => (Math.abs(b - offer.itemPriceGbp) < Math.abs(a - offer.itemPriceGbp) ? b : a));
    return { status: Math.abs(near - offer.itemPriceGbp) <= 0.5 ? 'match' : 'differs', live: near };
  } catch {
    return { status: 'unreadable' };
  }
}

function siteLinkOk(id: string): boolean {
  try {
    const out = curl(`${SITE}/fragrance/${id}`).toString();
    const file = /data\/catalogue\.[a-f0-9]+\.json/.exec(out)?.[0];
    return Boolean(file) && curl(`${SITE}/${file}`).toString().includes(`"${id}"`);
  } catch {
    return false;
  }
}

function photoDataUri(url: string): string {
  for (const u of [resizedPhotoUrl(url, 800) ?? url, url]) {
    try {
      const out = curl(u, ['-w', '\n%{content_type}']);
      const cut = out.lastIndexOf(0x0a);
      const type = out.subarray(cut + 1).toString().trim();
      if (type.startsWith('image/') && cut > 1000) return `data:${type};base64,${out.subarray(0, cut).toString('base64')}`;
    } catch {
      /* try the original */
    }
  }
  throw new Error(`Could not download the photo: ${url}`);
}

const EXTRA = (t: keyof typeof THEMES) => `
  .photo { width: 440px; height: 440px; border-radius: 36px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
  .photo img { width: 86%; height: 86%; object-fit: contain; }
  .who { width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .who .name { margin: 0; font-size: 52px; font-weight: 700; line-height: 1.12; }
  .who .brand { margin: 0; font-size: 30px; letter-spacing: 4px; text-transform: uppercase; color: var(--ink-2); white-space: nowrap; }
  .vs { width: 100%; display: flex; gap: 24px; }
  .shopcard { flex: 1 1 0; min-width: 0; padding: 34px 26px; border-radius: 28px; background: var(--card); border: 3px solid var(--card-line);
    box-shadow: 0 10px 30px rgba(10,10,11,0.25); color: var(--card-ink); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  .shopcard.win { border-color: ${t === 'standard' ? '#FF3B41' : '#F7F7F8'}; }
  .shopcard .s { margin: 0; width: 100%; font-size: 34px; font-weight: 700; white-space: nowrap; }
  .shopcard .p { margin: 0; width: 100%; font-size: 78px; font-weight: 700; letter-spacing: -1px; white-space: nowrap; }
  .shopcard .l { margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; color: var(--card-ink-3); }
  .win-tag { font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #0A0A0B; background: #FF3B41; border-radius: 8px; padding: 6px 12px; }
  .sum { width: 100%; display: flex; flex-direction: column; gap: 24px; }
  .sumcard { padding: 28px 34px; border-radius: 28px; background: var(--card); border: 3px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); color: var(--card-ink); text-align: left; }
  .sumcard.win { border-color: ${t === 'standard' ? '#FF3B41' : '#F7F7F8'}; }
  .sumcard .s { margin: 0 0 14px; font-size: 34px; font-weight: 700; white-space: nowrap; }
  .line { display: flex; justify-content: space-between; gap: 20px; font-size: 32px; color: var(--card-ink-2); margin: 6px 0; }
  .line.total { color: var(--card-ink); font-weight: 700; font-size: 40px; border-top: 2px solid var(--row-line); padding-top: 12px; margin-top: 12px; }
  .line .plus { color: #FF3B41; font-weight: 700; }
  .line .free { color: #4FB47B; font-weight: 700; }
  .note2 { margin: 6px 0 0; font-size: 24px; color: var(--card-ink-3); }
  .big { margin: 0; width: 100%; white-space: nowrap; font-size: 200px; font-weight: 700; letter-spacing: -6px; line-height: 1.15; ${t === 'standard' ? 'color: #FF3B41;' : ''} }
  .lead { margin: 0; font-size: 46px; font-weight: 700; }
  .fine { margin: 0; font-size: 24px; color: var(--ink-3); }
  .stack { display: flex; flex-direction: column; align-items: center; gap: 22px; }
  .pill { padding: 22px 52px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 46px; font-weight: 700; }
  .badge { display: inline-block; padding: 14px 30px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 40px; font-weight: 700; }
`;

function slides(e: Example, photo: string): string[] {
  const name = esc(undash(`${e.frag.name}${e.frag.sizeMl ? ` ${e.frag.sizeMl}ml` : ''}`));
  const brand = esc(undash(e.frag.brand));
  const dear = esc(undash(e.dear.retailer.name));
  const cheap = esc(undash(e.cheap.retailer.name));
  const dd = e.dear.delivery.costGbp ?? 0;
  const cd = e.cheap.delivery.costGbp ?? 0;
  // Why this shop charges delivery here, from its own recorded terms.
  const ship = e.dear.retailer.shipping;
  const dearMember = dd <= 0 ? ''
    : ship.freeOverGbp !== null ? `<p class="note2">Free delivery only on orders over ${gbp(ship.freeOverGbp).replace('.00', '')}</p>`
    : ship.membershipPerk ? '<p class="note2">Free delivery is for paid members only</p>'
    : '';
  const year = Math.round(e.saving * 12 * 100) / 100;
  const fine = `<p class="fine">Prices checked ${dateLabel}. Prices change, so check before you buy.</p>`;
  const sumLines = (item: number, del: number) =>
    `<div class="line"><span>Bottle</span><span>${gbp(item)}</span></div>
     <div class="line"><span>Delivery${del > 0 ? ' at checkout' : ''}</span>${del > 0 ? `<span class="plus">+ ${gbp(del)}</span>` : '<span class="free">Free</span>'}</div>
     <div class="line total"><span>You pay</span><span>${gbp(item + del)}</span></div>`;
  return [
    `<p class="kicker">A real example</p>
     <h1 data-fit="1,40">How much could you save?</h1>
     <div class="photo"><img src="${photo}" alt=""></div>
     <div class="who"><p class="name" data-fit="2,34">${name}</p><p class="brand" data-fit="1,20">${brand}</p></div>`,
    `<p class="kicker">Same bottle, two shops</p>
     <h1 data-fit="1,40">The price on the label</h1>
     <div class="vs">
       <div class="shopcard"><p class="s" data-fit="1,22">${dear}</p><p class="p" data-fit="1,40">${gbp(e.dear.itemPriceGbp)}</p><p class="l">Bottle price</p></div>
       <div class="shopcard win"><span class="win-tag">CHEAPEST WE FOUND</span><p class="s" data-fit="1,22">${cheap}</p><p class="p" data-fit="1,40">${gbp(e.cheap.itemPriceGbp)}</p><p class="l">Bottle price</p></div>
     </div>
     <p class="sub">${e.dear.itemPriceGbp > e.cheap.itemPriceGbp ? `Already ${gbp(e.dear.itemPriceGbp - e.cheap.itemPriceGbp)} apart. Then comes delivery.` : 'Close on the label. Then comes delivery.'}</p>
     ${fine}`,
    `<p class="kicker">Then comes delivery</p>
     <h1 data-fit="1,40">We add it in for you</h1>
     <div class="sum">
       <div class="sumcard"><p class="s" data-fit="1,22">${dear}</p>${sumLines(e.dear.itemPriceGbp, dd)}${dearMember}</div>
       <div class="sumcard win"><p class="s" data-fit="1,22">${cheap}</p>${sumLines(e.cheap.itemPriceGbp, cd)}</div>
     </div>
     <p class="sub">PriceSniffs shows the total before you click.</p>`,
    `<p class="kicker">Your saving on one bottle</p>
     <div class="stack">
       <p class="big" data-fit="1,80">${gbp(e.saving)}</p>
       <span class="badge">${e.percent}% less</span>
       <p class="sub">${gbp(e.dear.deliveredPriceGbp!)} at ${dear}<br>${gbp(e.cheap.deliveredPriceGbp!)} at ${cheap}</p>
     </div>
     ${fine}`,
    `<p class="kicker">Buy one a month</p>
     <h1 data-fit="1,40">That's a year of savings</h1>
     <div class="stack">
       <p class="big" data-fit="1,80">${gbp(year).replace('.00', '')}</p>
       <p class="lead">saved over 12 months</p>
       <p class="sub">12 bottles × ${gbp(e.saving)} saved each</p>
     </div>
     <p class="fine">If you bought this bottle every month at today's prices.<br>Prices change, so check before you buy.</p>`,
    `<p class="kicker">Find your own savings</p>
     <h1 data-fit="1,40">Search any perfume</h1>
     ${MARK('big-mark')}
     <span class="pill">Link in bio</span>`,
  ];
}

function caption(e: Example, url: string): string {
  const name = undash(`${e.frag.name}${e.frag.sizeMl ? ` ${e.frag.sizeMl}ml` : ''}`);
  const dear = undash(e.dear.retailer.name);
  const cheap = undash(e.cheap.retailer.name);
  const dd = e.dear.delivery.costGbp ?? 0;
  const cd = e.cheap.delivery.costGbp ?? 0;
  const year = Math.round(e.saving * 12 * 100) / 100;
  const tag = undash(e.frag.brand).toLowerCase().replace(/[^a-z0-9]/g, '');
  const dearSentence = dd > 0
    ? `${name} by ${undash(e.frag.brand)} is ${gbp(e.dear.itemPriceGbp)} at ${dear}, and their delivery adds ${gbp(dd)} at checkout, so you pay ${gbp(e.dear.deliveredPriceGbp!)}.`
    : `${name} by ${undash(e.frag.brand)} is ${gbp(e.dear.deliveredPriceGbp!)} at ${dear}, delivered.`;
  const cheapSentence = cd > 0
    ? `The same bottle is ${gbp(e.cheap.itemPriceGbp)} at ${cheap} plus ${gbp(cd)} delivery, ${gbp(e.cheap.deliveredPriceGbp!)} in total.`
    : `The same bottle is ${gbp(e.cheap.itemPriceGbp)} at ${cheap} with free delivery.`;
  return `How much could you save? 🇬🇧

A real example from today. ${dearSentence} ${cheapSentence}

That is ${gbp(e.saving)} saved on one bottle, ${e.percent}% less. Buy one a month at these prices and it adds up to ${gbp(year).replace('.00', '')} in a year.

We show the total with delivery before you click, for more than 30 UK shops. Prices checked ${dateLabel} and they change, so check the link in our bio before you buy, or go to
${url}

#perfume #fragrance #perfumedeals #ukdeals #${tag} #pricesniffs
`;
}

async function main() {
  // One post a day: a rerun on a day that already has one makes nothing.
  if (!opt('--out') && !opt('--id') && existsSync(join(ROOT, 'social', 'posts', `${today}-savings`))) {
    console.log(`Today's savings post already exists (social/posts/${today}-savings). Nothing to do.`);
    process.exitCode = 2;
    return;
  }
  const history: HistoryEntry[] = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : [];
  const recent = new Set(
    history.filter((h) => h.date !== today && (Date.parse(today) - Date.parse(h.date)) / 86_400_000 < NO_REPEAT_DAYS).map((h) => h.id),
  );
  const skipped: string[] = [];
  let chosen: { e: Example; checks: Record<string, unknown> } | null = null;
  for (const e of candidates()) {
    if (!opt('--id') && recent.has(e.frag.id)) continue;
    const cheapLive = livePrice(e.cheap);
    const dearLive = livePrice(e.dear);
    if (cheapLive.status === 'differs' || dearLive.status === 'differs') {
      skipped.push(`${e.frag.id}: live price moved (${e.cheap.retailer.name} ${cheapLive.live ?? '?'}, ${e.dear.retailer.name} ${dearLive.live ?? '?'})`);
      continue;
    }
    if (!siteLinkOk(e.frag.id)) {
      skipped.push(`${e.frag.id}: product link not live on the site`);
      continue;
    }
    chosen = { e, checks: { cheapLive: cheapLive.status, dearLive: dearLive.status } };
    break;
  }
  if (!chosen) {
    console.log(`No new savings example qualifies today.${skipped.length ? `\nSkipped:\n  ${skipped.join('\n  ')}` : ''}`);
    process.exitCode = 2;
    return;
  }
  const { e, checks } = chosen;
  const url = `${SITE}/fragrance/${e.frag.id}`;
  const dir = join(ROOT, 'social', 'posts', opt('--out') ?? `${today}-savings`);
  mkdirSync(dir, { recursive: true });
  const photo = photoDataUri(e.frag.photoUrl!);
  const browser = await launchChromium();
  for (const [i, inner] of slides(e, photo).entries()) {
    const html = slide(i + 1, TOTAL, inner, i + 1 === TOTAL ? '' : i === 0 ? 'Swipe to see &rarr;' : 'Swipe &rarr;', theme, EXTRA(theme));
    writeFileSync(join(dir, `slide-${i + 1}-3x4.html`), html.replace(photo, e.frag.photoUrl!));
    await renderSmooth(browser, html, W, H, join(dir, `slide-${i + 1}-3x4.png`));
  }
  await browser.close();
  writeFileSync(join(dir, 'caption.txt'), caption(e, url));
  const age = (o: PresentedOffer) => Math.round(o.ageSeconds / 3600);
  writeFileSync(join(dir, 'check.json'), JSON.stringify({
    id: e.frag.id, url, saving: e.saving, percent: e.percent,
    dear: { shop: e.dear.retailer.name, item: e.dear.itemPriceGbp, delivery: e.dear.delivery.costGbp, total: e.dear.deliveredPriceGbp, hoursOld: age(e.dear), link: e.dear.outboundUrl, live: checks.dearLive },
    cheap: { shop: e.cheap.retailer.name, item: e.cheap.itemPriceGbp, delivery: e.cheap.delivery.costGbp, total: e.cheap.deliveredPriceGbp, hoursOld: age(e.cheap), link: e.cheap.outboundUrl, live: checks.cheapLive },
    skipped,
  }, null, 2) + '\n');
  if (!opt('--out')) {
    writeFileSync(HISTORY, JSON.stringify([...history.filter((h) => h.date !== today), { date: today, id: e.frag.id, dear: e.dear.retailer.id, cheap: e.cheap.retailer.id }], null, 2) + '\n');
  }
  console.log(`${today}: ${e.frag.brand} ${e.frag.name} ${e.frag.sizeMl ?? ''}ml: ${e.dear.retailer.name} ${gbp(e.dear.deliveredPriceGbp!)} vs ${e.cheap.retailer.name} ${gbp(e.cheap.deliveredPriceGbp!)}, save ${gbp(e.saving)} (${e.percent}%)`);
  console.log(`Live prices: ${e.cheap.retailer.name} ${checks.cheapLive}, ${e.dear.retailer.name} ${checks.dearLive} (unreadable = the shop blocks automated reads; check it by hand)`);
  console.log(`${dir.slice(ROOT.length + 1)}/ written`);
}

await main();

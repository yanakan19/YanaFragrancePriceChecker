/**
 * Deal of the Day post: picks one perfume, builds the post in two vertical
 * sizes (9:16 story, 3:4 feed) plus a caption, checks the product link works
 * on the live site, and records the pick so it is not repeated.
 *
 *   npm run social:deal                    today's post
 *   npm run social:deal -- --id <id>       a chosen perfume
 *   npm run social:deal -- --skip-live-check
 *
 * Output: social/posts/YYYY-MM-DD-deal-of-the-day/ (post-9x16.html/.png,
 * post-3x4.html/.png, caption.txt, check.json). Rules: social/DESIGN-SYSTEM.md.
 *
 * The pick, the prices and the two boxes come from the same functions and data
 * the product page uses, so the post and the page always agree:
 *   MSRP box     = the brand's own current price (houseCeiling), shown only
 *                  where the page itself shows it (pickReferencePrice "house")
 *   Cheapest box = bestOffer's delivered price and shop
 * A perfume qualifies only when the cheapest delivered price is below MSRP,
 * the price is fresh, delivery is stated and the page may call it cheapest.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEMO_FRAGRANCES, type DemoFragrance } from '../demo/data.js';
import { offersFor, CRAWLED_AT } from '../demo/catalogue.generated.js';
import { pickReferencePrice } from '../demo/referencePrice.js';
import { resizedPhotoUrl } from '../demo/photo.js';
import { buildComparison, bestOffer } from '../src/services/priceService.js';
import { cheapestVerdict } from '../src/services/deliveryConfidence.js';
import { cannotCarryBrand } from '../src/config/retailers.js';
import type { PresentedOffer } from '../src/types/offer.js';
import { launchChromium } from './a11y-audit.js';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://pricesniffs.space';
const HISTORY = join(ROOT, 'social', 'deal-of-the-day-history.json');

interface Pick {
  frag: DemoFragrance;
  best: PresentedOffer;
  delivered: number;
  msrp: number;
  percent: number;
}
interface HistoryEntry { date: string; id: string; brand: string }

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD

/** The product page's own MSRP and cheapest boxes, or null if it shows either differently. */
export function dealFor(frag: DemoFragrance): Pick | null {
  if (frag.houseCeiling === null || !frag.photoUrl || frag.concentration === 'Perfume Oil') return null;
  const rows = buildComparison(offersFor(frag.id), { sortBy: 'delivered' });
  const best = bestOffer(rows);
  if (!best || best.deliveredPriceGbp === null || best.stale || !best.isPurchasable) return null;
  if (!cheapestVerdict(rows).decided) return null;
  const ref = pickReferencePrice(
    frag.houseCeiling,
    rows.map((row) => ({
      wasPriceGbp: row.discount?.wasPrice ?? null,
      isHouseOffer: Boolean(row.retailer.singleBrandOnly) && !cannotCarryBrand(row.retailer, frag.brand),
    })),
  );
  if (!ref || ref.tier !== 'house') return null;
  const delivered = best.deliveredPriceGbp;
  if (delivered >= frag.houseCeiling) return null;
  return {
    frag,
    best,
    delivered,
    msrp: frag.houseCeiling,
    percent: Math.round((1 - delivered / frag.houseCeiling) * 100),
  };
}

function choose(history: HistoryEntry[]): Pick {
  const forced = opt('--id');
  if (forced) {
    const frag = DEMO_FRAGRANCES.find((f) => f.id === forced);
    const p = frag && dealFor(frag);
    if (!p) throw new Error(`${forced} does not qualify as a deal today`);
    return p;
  }
  // The top deal of the day that has never been posted before; if the top one
  // has been, the next one down, and so on. A rerun on the same day keeps that
  // day's own pick available.
  const used = new Set(history.filter((h) => h.date !== today).map((h) => h.id));
  const pool = DEMO_FRAGRANCES.map(dealFor).filter((p): p is Pick => p !== null && !used.has(p.frag.id));
  if (!pool.length) throw new Error('No perfume qualifies as a deal today');
  pool.sort((a, b) => b.percent - a.percent || b.msrp - b.delivered - (a.msrp - a.delivered) || a.frag.id.localeCompare(b.frag.id));
  return pool[0]!;
}

const gbp = (n: number) => `£${n.toFixed(2)}`;
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sizeLabel = (ml: number | null) => (ml ? `${ml}ml` : '');
/** Post copy never shows a hyphen or dash (DESIGN-SYSTEM.md 5.1), names included. */
const undash = (s: string) => s.replace(/\s*[-\u2010-\u2015\u2212]\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Downloads through curl so the machine's proxy and certificates apply. */
function curl(url: string, extra: string[] = []): Buffer {
  return execFileSync('curl', ['-sSL', '--max-time', '30', ...extra, url], { maxBuffer: 64 * 1024 * 1024 });
}

function photoDataUri(url: string): string {
  const src = resizedPhotoUrl(url, 800) ?? url;
  for (const u of [src, url]) {
    try {
      const out = execFileSync('curl', ['-sSL', '--max-time', '30', '-w', '\n%{content_type}', u], {
        maxBuffer: 64 * 1024 * 1024,
      });
      const cut = out.lastIndexOf(0x0a);
      const type = out.subarray(cut + 1).toString().trim();
      const body = out.subarray(0, cut);
      if (type.startsWith('image/') && body.length > 1000) return `data:${type};base64,${body.toString('base64')}`;
    } catch {
      /* try the original */
    }
  }
  throw new Error(`Could not download the photo: ${url}`);
}

const UNION_JACK = `<svg class="flag" viewBox="0 0 60 30" aria-label="UK flag"><clipPath id="s"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#s)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>`;

const MARK = `<svg class="mark" viewBox="240 240 610 610" aria-hidden="true"><circle cx="478" cy="478" r="196" fill="none" stroke="#FF3B41" stroke-width="58"/><line x1="636" y1="636" x2="796" y2="796" stroke="#FF3B41" stroke-width="72" stroke-linecap="round"/><g fill="#F7F7F8"><rect x="452" y="366" width="52" height="42" rx="9"/><rect x="463" y="402" width="30" height="26"/><rect x="398" y="422" width="160" height="164" rx="34"/></g></svg>`;

/**
 * Both formats share one layout, top to bottom: wordmark, date, headline,
 * perfume name, brand, photo with the saving badge, MSRP and cheapest boxes,
 * the link sticker mark, the checked time. The 3:4 feed post is the same
 * thing slightly denser (smaller type and gaps), never a different design.
 */
interface Format {
  file: string; w: number; h: number; pad: number; gap: number;
  head: number; name: number; brand: number; date: number; photo: number; badge: number; amount: number;
  headline: (flag: string) => string;
}
const FORMATS: Format[] = [
  // Story: stories cover the top and bottom 250px with their own bars.
  {
    file: 'post-9x16', w: 1080, h: 1920, pad: 250, gap: 28,
    head: 66, name: 58, brand: 32, date: 28, photo: 420, badge: 150, amount: 58,
    headline: (flag) => `And our Deal of the Day<br>today is&hellip; ${flag}`,
  },
  // Feed: no bars to avoid, so the same layout sits tighter.
  {
    file: 'post-3x4', w: 1080, h: 1440, pad: 60, gap: 20,
    head: 60, name: 52, brand: 28, date: 24, photo: 380, badge: 136, amount: 52,
    headline: (flag) => `Deal of the Day ${flag}`,
  },
];

function postHtml(p: Pick, photo: string, dateLabel: string, checked: string, f: Format): string {
  const name = undash(`${p.frag.name}${p.frag.sizeMl ? ` ${sizeLabel(p.frag.sizeMl)}` : ''}`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${f.w}px; height: ${f.h}px; background: #0A0A0B; color: #F7F7F8;
    font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; }
  main { height: 100%; padding: ${f.pad}px 90px; display: flex; flex-direction: column;
    align-items: center; justify-content: space-evenly; text-align: center; }
  .top, .mid, .bottom { display: flex; flex-direction: column; align-items: center; gap: ${f.gap}px; width: 100%; }
  .brandline { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 44px; letter-spacing: -1px; }
  .brandline .mark { width: 58px; height: 58px; flex: none; }
  .brandline em { font-style: normal; color: #FF3B41; }
  .date { margin: 0; padding: 10px 22px; border: 2px solid #3A3A40; border-radius: 999px;
    font-size: ${f.date}px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #B9B9C0; }
  h1 { margin: 0; font-size: ${f.head}px; letter-spacing: -2px; line-height: 1.12; }
  .flag { display: inline-block; vertical-align: -0.06em; width: ${Math.round(f.head * 1.1)}px; height: ${Math.round(f.head * 0.55)}px; border-radius: 6px; }
  .who { display: flex; flex-direction: column; gap: 10px; }
  .name { margin: 0; font-size: ${f.name}px; font-weight: 700; line-height: 1.1; letter-spacing: -1px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .brand { margin: 0; font-size: ${f.brand}px; color: #B9B9C0; letter-spacing: 3px; text-transform: uppercase; }
  .photo { position: relative; width: ${f.photo}px; height: ${f.photo}px; border-radius: 36px; background: #FFFFFF;
    display: flex; align-items: center; justify-content: center; }
  .photo img { width: 86%; height: 86%; object-fit: contain; border-radius: 12px; }
  .badge { position: absolute; top: -${Math.round(f.badge * 0.2)}px; right: -${Math.round(f.badge * 0.42)}px;
    width: ${f.badge}px; height: ${f.badge}px; border-radius: 50%; background: #FF3B41; color: #FFFFFF;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    box-shadow: 0 0 0 8px #0A0A0B; transform: rotate(8deg); }
  .badge b { font-size: ${Math.round(f.badge * 0.34)}px; line-height: 1; letter-spacing: -1px; }
  .badge span { font-size: ${Math.round(f.badge * 0.15)}px; font-weight: 700; letter-spacing: 2px; margin-top: 4px; }
  .boxes { display: flex; gap: 24px; width: 100%; justify-content: center; }
  .box { flex: 0 1 420px; padding: ${f.gap}px 16px; border-radius: 28px; border: 2px solid #FF3B41; background: #1E0709; }
  .box.best { border-color: #4FB47B; background: #14221B; }
  .label { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #FF6A6E; }
  .amount { margin: 8px 0 0; font-size: ${f.amount}px; font-weight: 700; color: #FF6A6E; }
  .from { margin: 6px 0 0; font-size: 26px; color: #B9B9C0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .best .label, .best .amount { color: #4FB47B; }
  /* Where the live link sticker goes: a faint centre crosshair, nothing else. */
  .sticker { position: relative; width: 120px; height: 120px; }
  .sticker::before, .sticker::after { content: ''; position: absolute; background: #3A3A40; }
  .sticker::before { left: 59px; top: 0; width: 2px; height: 120px; }
  .sticker::after { top: 59px; left: 0; height: 2px; width: 120px; }
  .sticker i { position: absolute; left: 44px; top: 44px; width: 32px; height: 32px; border: 2px solid #3A3A40; border-radius: 50%; }
  .checked { margin: 0; font-size: 24px; color: #8A8A93; }
</style></head><body><main>
  <div class="top">
    <div class="brandline">${MARK}<span>Price<em>Sniffs</em></span></div>
    <p class="date">${esc(dateLabel)}</p>
    <h1>${f.headline(UNION_JACK)}</h1>
  </div>
  <div class="mid">
    <div class="who">
      <p class="name">${esc(name)}</p>
      <p class="brand">${esc(undash(p.frag.brand))}</p>
    </div>
    <div class="photo"><img src="${photo}" alt=""><div class="badge"><span>SAVE</span><b>${p.percent}%</b></div></div>
    <div class="boxes">
      <div class="box"><p class="label">MSRP</p><p class="amount">${gbp(p.msrp)}</p><p class="from">Brand's Current Price</p></div>
      <div class="box best"><p class="label">Cheapest price</p><p class="amount">${gbp(p.delivered)}</p><p class="from">from ${esc(undash(p.best.retailer.name))}</p></div>
    </div>
  </div>
  <div class="bottom">
    <div class="sticker" aria-hidden="true"><i></i></div>
    <p class="checked">Price incl. delivery, checked ${esc(checked)}</p>
  </div>
</main></body></html>`;
}

function caption(p: Pick, url: string, checked: string, dateLabel: string): string {
  const name = undash(`${p.frag.name}${p.frag.sizeMl ? ` ${sizeLabel(p.frag.sizeMl)}` : ''}`);
  const brandTag = p.frag.brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `Deal of the Day 🇬🇧 ${dateLabel}

${name} by ${undash(p.frag.brand)} is ${gbp(p.delivered)} delivered from ${undash(p.best.retailer.name)}. The brand's own price is ${gbp(p.msrp)}, so you save ${p.percent}%.

Price checked ${checked}. Prices move during the day, so check the link before you buy.
${url}

#perfume #fragrance #perfumedeals #ukdeals #${brandTag} #pricesniffs
`;
}

/**
 * The post's link must open the product on the live site. GitHub Pages answers
 * every deep link with 404.html, which is the full app (an identical copy of
 * index.html), so the check is that the app is served at that address and the
 * live catalogue contains the perfume, not the bare status code.
 */
function liveCheck(id: string, url: string): { status: number; servesApp: boolean; inLiveData: boolean; ok: boolean } {
  const out = curl(url, ['-w', '\n%{http_code}']).toString();
  const status = Number(out.slice(out.lastIndexOf('\n') + 1).trim());
  const file = /data\/catalogue\.[a-f0-9]+\.json/.exec(out)?.[0];
  const servesApp = (status === 200 || status === 404) && Boolean(file);
  const inLiveData = file ? curl(`${SITE}/${file}`).toString().includes(`"${id}"`) : false;
  return { status, servesApp, inLiveData, ok: servesApp && inLiveData };
}

const fontFace = (file: string, weight: number) =>
  `@font-face{font-family:'Liberation Sans';font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(
    join(ROOT, 'social', 'fonts', file),
  ).toString('base64')}) format('truetype');}`;

async function main() {
  const history: HistoryEntry[] = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : [];
  const p = choose(history);
  const url = `${SITE}/fragrance/${p.frag.id}`;
  const checkedAt = new Date(CRAWLED_AT);
  const checked = `${checkedAt.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} UK, ${checkedAt.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' })}`;
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const check = flag('--skip-live-check') ? null : liveCheck(p.frag.id, url);
  if (check && !check.ok) {
    throw new Error(`Live link check failed for ${url}: ${JSON.stringify(check)}`);
  }

  const dir = join(ROOT, 'social', 'posts', `${today}-deal-of-the-day`);
  mkdirSync(dir, { recursive: true });
  const photo = photoDataUri(p.frag.photoUrl!);
  const css = `<style>${fontFace('LiberationSans-Regular.ttf', 400)}${fontFace('LiberationSans-Bold.ttf', 700)}</style>`;

  const browser = await launchChromium();
  for (const f of FORMATS) {
    const html = postHtml(p, photo, dateLabel, checked, f);
    // The committed HTML keeps the photo's address rather than a 1 MB inline copy.
    writeFileSync(join(dir, `${f.file}.html`), html.replace(photo, p.frag.photoUrl!));
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
    await page.setContent(html.replace('<style>', `${css}<style>`));
    await page.evaluate('document.fonts.ready');
    await page.screenshot({ path: join(dir, `${f.file}.png`), clip: { x: 0, y: 0, width: f.w, height: f.h } });
    await page.close();
  }
  await browser.close();

  writeFileSync(join(dir, 'caption.txt'), caption(p, url, checked, dateLabel));
  writeFileSync(
    join(dir, 'check.json'),
    JSON.stringify({ id: p.frag.id, url, delivered: p.delivered, msrp: p.msrp, shop: p.best.retailer.name, percent: p.percent, pricesCheckedAt: CRAWLED_AT, liveCheck: check }, null, 2) + '\n',
  );
  const next = history.filter((h) => h.date !== today);
  next.push({ date: today, id: p.frag.id, brand: p.frag.brand });
  writeFileSync(HISTORY, JSON.stringify(next, null, 2) + '\n');

  console.log(`${today}: ${p.frag.brand} ${p.frag.name} ${sizeLabel(p.frag.sizeMl)} ${gbp(p.delivered)} at ${p.best.retailer.name}, MSRP ${gbp(p.msrp)} (${p.percent}% less)`);
  console.log(`Link for the sticker: ${url}`);
  console.log(`${dir.slice(ROOT.length + 1)}/ written; live check: ${check ? (check.ok ? 'link opens the product on the live site' : 'FAILED') : 'skipped'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

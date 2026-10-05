/**
 * "Hurry up" Deal of the Day video: a short 9:16 clip (1080 x 1920, about 10
 * seconds) that plays the REAL product page of one perfume, so the UI is the
 * website's own, with a few overlay captions on top.
 *
 *   npx tsx scripts/social-hurry-video.ts --slug <product slug> --out <folder> \
 *     --headline "Our most stocked Dolce & Gabbana" --checked "5 Oct 2026, 18:10 UK"
 *
 * It starts the built site locally (run `npm run demo` first), opens the
 * product page in a 540 x 960 phone window at 2x, and for every frame sets the
 * time, scrolls the page and draws the overlay for that moment, then encodes
 * the frames with ffmpeg (H.264, so TikTok and Instagram accept the file).
 *
 * Every figure on screen is read from the page itself (the RRP box, the
 * Cheapest box, the rows of the shop list), never typed in here. Claims in the
 * captions are checked against those figures before any frame is drawn.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium, startDemoServer } from './a11y-audit.js';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const slug = opt('--slug');
if (!slug) throw new Error('--slug <product slug> is required');
const outDir = resolve(ROOT, opt('--out') ?? 'social/posts/hurry-deal-video');
const headline = opt('--headline') ?? 'Deal of the Day';
const checked = opt('--checked') ?? '';
const SECONDS = 10;
const FPS = 24;

function ffmpegPath(): string {
  const candidates = [process.env.FFMPEG ?? '', 'ffmpeg'];
  try {
    candidates.push(execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim());
  } catch {
    /* no imageio-ffmpeg */
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* try the next */
    }
  }
  throw new Error('No ffmpeg found. Install one (pip install imageio-ffmpeg) or set FFMPEG.');
}

mkdirSync(outDir, { recursive: true });
const framesDir = join(outDir, '_frames');
// Frames already drawn are kept, so a run killed for lack of memory can be
// repeated and only draws what is missing. Delete the folder to start fresh.
mkdirSync(framesDir, { recursive: true });

const server = await startDemoServer();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
// tsx wraps named functions in a __name helper that does not exist in the page.
await context.addInitScript('window.__name = (f) => f;');
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${server.port}/${slug}`);
await page.waitForSelector('ul.offers li', { timeout: 20000 });
await page.waitForTimeout(1500);

// What the page itself says, read before drawing anything.
const facts = await page.evaluate(() => {
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = [...document.querySelectorAll('ul.offers li')].map((li) => text(li));
  return { title: document.title, rows, head: text(document.querySelector('.hero')) };
});
console.log(facts.title);
console.log(facts.head.slice(0, 300));
console.log(facts.rows.slice(0, 4).join('\n'));

// Inject the overlay layer and the time driven scene function.
await page.evaluate(
  ({ headline, checked }) => {
    const css = document.createElement('style');
    css.textContent = `
      #hv { position: fixed; inset: 0; z-index: 99999; pointer-events: none; font-family: inherit; color: #F7F7F8; }
      #hv .scrim { position: absolute; inset: 0; background: rgba(10,10,11,0.9); opacity: 0; }
      #hv .hurry { position: absolute; left: 0; right: 0; top: 34%; text-align: center; opacity: 0; }
      #hv .hurry b { display: block; font-size: 92px; line-height: 1; letter-spacing: -2px; color: #FF3B41; }
      #hv .hurry span { display: block; margin-top: 14px; font-size: 26px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #F7F7F8; }
      #hv .cap { position: absolute; left: 20px; right: 20px; bottom: 40px; padding: 18px 20px; border-radius: 20px; background: #18181B; border: 2px solid #3A3A40; text-align: center; font-size: 23px; font-weight: 700; line-height: 1.25; opacity: 0; }
      #hv .cap em { font-style: normal; color: #FF3B41; }
      #hv .cap small { display: block; margin-top: 6px; font-size: 15px; font-weight: 400; color: #B9B9C0; }
      #hv .deal { position: absolute; left: 24px; right: 24px; top: 26%; padding: 30px 20px 26px; border-radius: 28px; background: #0A0A0B; border: 3px solid #4FB47B; text-align: center; opacity: 0; }
      #hv .deal .rrp { font-size: 24px; font-weight: 700; color: #FF6A6E; text-decoration: line-through; letter-spacing: 1px; }
      #hv .deal .now { margin-top: 6px; font-size: 92px; font-weight: 700; letter-spacing: -2px; color: #4FB47B; line-height: 1.05; }
      #hv .deal .at { margin-top: 6px; font-size: 22px; color: #B9B9C0; }
      #hv .deal .badge { position: absolute; top: -34px; right: -6px; width: 104px; height: 104px; border-radius: 50%; background: #FF3B41; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 0 0 6px #0A0A0B; transform: rotate(8deg); }
      #hv .deal .badge b { font-size: 36px; line-height: 1; }
      #hv .deal .badge i { font-style: normal; font-size: 15px; font-weight: 700; letter-spacing: 2px; }
      #hv .cta { position: absolute; left: 24px; right: 24px; top: 38%; text-align: center; opacity: 0; }
      #hv .cta .site { font-size: 38px; font-weight: 700; letter-spacing: -0.5px; }
      #hv .cta .site em { font-style: normal; color: #FF3B41; }
      #hv .cta .pill { display: inline-block; margin-top: 18px; padding: 12px 30px; border-radius: 999px; background: #18181B; border: 2px solid #3A3A40; font-size: 24px; font-weight: 700; }
      #hv .cta .chk { margin-top: 18px; font-size: 15px; color: #8A8A93; }
      .hv-hl { outline: 3px solid #FF3B41; outline-offset: -3px; border-radius: 6px; }
    `;
    document.head.append(css);
    const layer = document.createElement('div');
    layer.id = 'hv';
    layer.innerHTML = `
      <div class="scrim"></div>
      <div class="hurry"><b>HURRY</b><span>Deal of the Day</span></div>
      <div class="cap"></div>
      <div class="deal"><div class="badge"><i>SAVE</i><b></b></div><div class="rrp"></div><div class="now"></div><div class="at"></div></div>
      <div class="cta"><div class="site">pricesniffs<em>.space</em></div><div class="pill">Link in bio</div><div class="chk"></div></div>`;
    document.body.append(layer);
    (window as unknown as { __hv: Record<string, string> }).__hv = { headline, checked };
  },
  { headline, checked },
);

// Facts the captions rely on, read from the page.
const claims = await page.evaluate(() => {
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
  const money = (s: string | null | undefined) => (s ? num(s) : NaN);
  const heroText = (document.querySelector('.hero')?.textContent ?? '').replace(/\s+/g, ' ');
  const rrp = money(/RRP\s*£([0-9.,]+)/.exec(heroText)?.[1]);
  const best = money(/Cheapest Price\s*£([0-9.,]+)/.exec(heroText)?.[1]);
  const shop = /from ([^]+?)(?:Notes|$)/.exec(heroText)?.[1]?.trim() ?? '';
  const rows = [...document.querySelectorAll('ul.offers li')].map((li) => {
    const t = (li.textContent ?? '').replace(/\s+/g, ' ');
    return { t, price: money(/£([0-9]+\.[0-9]{2})(?!.*£[0-9]+\.[0-9]{2})/.exec(t)?.[1]) };
  });
  const prices = rows.map((r) => r.price).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const shopsText = (document.body.textContent ?? '').match(/Available at \((\d+) Shops?\)/)?.[1];
  return { rrp, best, shop, prices, shops: Number(shopsText ?? rows.length) };
});
console.log(JSON.stringify(claims));
if (!(claims.rrp > claims.best) || !Number.isFinite(claims.best)) throw new Error('The page does not show an RRP above the cheapest price.');
const percent = Math.floor(((claims.rrp - claims.best) / claims.rrp) * 100);
const second = claims.prices[1] ?? NaN;
if (!(second > claims.best)) throw new Error('No second price to compare with.');
const underLine = Math.ceil(second / 5) * 5; // the round number just above the runner up, e.g. 65.70 gives 70? use below
const gbp = (n: number) => `£${n.toFixed(2)}`;
// "Only one shop under £X": X is a round £5 above the cheapest and at or below the runner up.
const roundUp = Math.floor(second / 5) * 5; // 65.70 -> 65
const onlyUnder = roundUp > claims.best ? roundUp : underLine;
const shopsUnder = claims.prices.filter((p) => p < onlyUnder).length;
if (shopsUnder !== 1) throw new Error(`Claim "only one shop under £${onlyUnder}" is not true: ${shopsUnder} shops are.`);

const frames = SECONDS * FPS;
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  if (existsSync(join(framesDir, `${String(f).padStart(4, '0')}.png`))) continue;
  await page.evaluate(
    ({ t, claims, percent, onlyUnder, headline, checked }) => {
      const clamp = (x: number) => Math.max(0, Math.min(1, x));
      const e3 = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
      const fade = (a: number, b: number, c: number, d: number) => clamp((t - a) / (b - a)) * (1 - clamp((t - c) / (d - c)));
      const layer = document.getElementById('hv')!;
      const q = (s: string) => layer.querySelector(s) as HTMLElement;
      const offers = document.querySelector('ul.offers') as HTMLElement;
      const hero = document.querySelector('.hero') as HTMLElement;
      const absTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
      // Page scroll: top of the page, then the product name and boxes, then the shop list.
      const nameTop = Math.max(0, absTop(hero.querySelector('h1, .name, [class*="title"]') as HTMLElement ?? hero) - 150);
      // With a product photo on the page, show photo, name and boxes together;
      // without one, scroll the empty photo frame out of sight.
      const img = hero.querySelector('img') as HTMLImageElement | null;
      const hasPhoto = Boolean(img && img.complete && img.naturalWidth > 0);
      const boxesY = hasPhoto
        ? Math.max(0, absTop(img as HTMLElement) - 140)
        : Math.max(0, hero.getBoundingClientRect().bottom + window.scrollY - 590);
      const listY = Math.max(0, absTop(offers) - 150);
      let y = 0;
      if (t < 1.4) y = 0;
      else if (t < 2.6) y = (boxesY || nameTop) * e3((t - 1.4) / 1.2);
      else if (t < 3.8) y = boxesY || nameTop;
      else if (t < 5.6) y = (boxesY || nameTop) + (listY - (boxesY || nameTop)) * e3((t - 3.8) / 1.8);
      else y = listY;
      window.scrollTo(0, y);

      // Scene A: HURRY.
      q('.scrim').style.opacity = String(0.92 * fade(0, 0.2, 1.1, 1.5));
      const h = q('.hurry');
      h.style.opacity = String(fade(0.05, 0.35, 1.1, 1.5));
      h.style.transform = `scale(${0.7 + 0.3 * e3(t / 0.5)})`;

      // Scene B and C captions.
      const cap = q('.cap');
      let capHtml = '';
      let capOp = 0;
      if (t >= 1.6 && t < 3.9) {
        capHtml = `<em>${headline}</em><small>The brand's RRP against the cheapest price we found</small>`;
        capOp = fade(1.6, 1.9, 3.6, 3.9);
      } else if (t >= 3.9 && t < 7.1) {
        capHtml = `Stocked by <em>${claims.shops} shops</em>, but only <em>one</em> sells it under £${onlyUnder}`;
        capOp = fade(3.9, 4.2, 6.8, 7.1);
      }
      cap.innerHTML = capHtml;
      cap.style.opacity = String(capOp);
      cap.style.transform = `translateY(${(1 - e3((t - (t < 3.9 ? 1.6 : 3.9)) / 0.3)) * 24}px)`;

      // Highlight the cheapest row during the list.
      const first = offers.querySelector('li') as HTMLElement;
      first.classList.toggle('hv-hl', t >= 5.2 && t < 7.1 && Math.floor((t - 5.2) * 3) % 2 === 0);

      // Scene D: the deal card.
      const deal = q('.deal');
      const dOp = fade(7.2, 7.5, 8.9, 9.1);
      deal.style.opacity = String(dOp);
      deal.style.transform = `scale(${0.85 + 0.15 * e3((t - 7.2) / 0.35)})`;
      (deal.querySelector('.badge b') as HTMLElement).textContent = `${percent}%`;
      (deal.querySelector('.rrp') as HTMLElement).textContent = `RRP £${claims.rrp.toFixed(2)}`;
      (deal.querySelector('.now') as HTMLElement).textContent = `£${claims.best.toFixed(2)}`;
      (deal.querySelector('.at') as HTMLElement).textContent = `at ${claims.shop}, delivery included`;
      // Scrim behind the deal card and the CTA, so the page does not fight the text.
      const scrimExtra = Math.max(fade(7.1, 7.4, 8.9, 9.1) * 0.82, clamp((t - 9.0) / 0.2) * 0.97);
      if (t > 1.5) q('.scrim').style.opacity = String(scrimExtra);

      // Scene E: call to action.
      const cta = q('.cta');
      cta.style.opacity = String(clamp((t - 9.05) / 0.25));
      (cta.querySelector('.chk') as HTMLElement).textContent = checked ? `Price checked ${checked}. Prices move, so be quick.` : 'Prices move, so be quick.';
    },
    { t, claims, percent, onlyUnder, headline, checked },
  );
  await page.waitForTimeout(30);
  await page.screenshot({ path: join(framesDir, `${String(f).padStart(4, '0')}.png`) });
  if (f % 48 === 0) console.log(`frame ${f}/${frames}`);
}
await browser.close();
server.close();
void ease;

const out = join(outDir, 'hurry-deal-9x16.mp4');
execFileSync(
  ffmpegPath(),
  ['-y', '-framerate', String(FPS), '-i', join(framesDir, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
rmSync(framesDir, { recursive: true, force: true });
console.log(`written ${out}: ${SECONDS}s, ${percent}% off, only one shop under £${onlyUnder}`);
void gbp;

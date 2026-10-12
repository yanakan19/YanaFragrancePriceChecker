/**
 * Guess the Fragrance pictures (docs/GUESS-THE-FRAGRANCE-PLAN.md section 6): the
 * HTML of the puzzle and the reveal in both sizes, and the alt text. Pure (no
 * catalogue), so the layout test loads it cheaply.
 */
import { FIT_SCRIPT } from './socialRender.js';
import { MARK } from './socialSlides.js';
import { planBlock, type BlockPlan, type MaskWord, type PuzzleText } from './social-guess-mask.js';

export type Tier = 'top' | 'middle' | 'base';
const TIERS: Tier[] = ['top', 'middle', 'base'];
/** The site's own wording for the middle tier is Heart; the approved picture says HEART. */
export const TIER_LABEL: Record<Tier, string> = { top: 'Top', middle: 'Heart', base: 'Base' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Post copy never shows a hyphen or dash (social/DESIGN-SYSTEM.md 5.1). */
const undash = (s: string) => s.replace(/\s*[-\u2010-\u2015\u2212]\s*/g, ' ').replace(/\s+/g, ' ').trim();

/* ── the pictures ────────────────────────────────────────────────────────── */

export type Kind = 'plain' | 'tall' | 'square';
export interface Format { file: string; w: number; h: number; kind: Kind }
export const FORMATS: Format[] = [
  { file: '3x4', w: 1080, h: 1440, kind: 'plain' },
  { file: '9x16', w: 1080, h: 1920, kind: 'tall' },
  { file: '1x1', w: 1080, h: 1080, kind: 'square' },
];
export interface Box { l: number; r: number; t: number; b: number }
/**
 * Where every box of a picture must stay (docs/GUESS-THE-FRAGRANCE-PLAN.md 1.2
 * and section 6; social/DESIGN-SYSTEM.md section 4):
 *   plain  (3:4)   the layout's own margins, 72 at the sides, 52 above and below
 *   tall   (9:16)  TikTok's box: x 110 to 970, y 380 to 1460 (clear of its tabs,
 *                  its caption and buttons, and its icons down the right)
 *   square (1:1)   x 135 to 945, y 90 to 990: Instagram's grid shows a square as
 *                  its middle 810 pixels, so nothing sits nearer the sides
 */
export const SAFE: Record<Kind, Box> = {
  plain: { l: 72, r: 1008, t: 52, b: 1388 },
  tall: { l: 110, r: 970, t: 380, b: 1460 },
  square: { l: 135, r: 945, t: 90, b: 990 },
};
/** The 9:16 picture is the 3:4 layout's 936 px wide content block, scaled to fill the TikTok box's 860 px width, in a block as tall as the box. */
/** The least room between two blocks of the 9:16 and the 1:1 (the 3:4 has its own margins): the note tiles and gaps shrink with --k until every gap is at least this. */
const MIN_GAP = 20;
const TALL_CONTENT_W = 1080 - 2 * 72;
export const TALL_SCALE = (SAFE.tall.r - SAFE.tall.l) / TALL_CONTENT_W;
/** When even the smallest tiles do not fit, the whole 9:16 block is drawn a little smaller (never below this: 26 px text stays 20.8 px). */
const TALL_SCALE_FLOOR = 0.8;

const BASE_CSS = `
  * { box-sizing: border-box; }
  html { --mark-ring:#FF3B41; --mark-bottle:#F7F7F8; --bg:#0A0A0B; --ink:#F7F7F8; --ink-2:#B9B9C0; --ink-3:#8A8A93; --red:#FF3B41; --kicker:#FF6A6E; --card:#121214; --line:#26262B; --tile:#18181B; }
  html, body { margin: 0; width: 1080px; background: var(--bg); color: var(--ink); font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; }
  main { width: 1080px; height: 1440px; padding: 52px 72px 52px; display: flex; flex-direction: column; justify-content: space-between; }
  .logo { display: flex; justify-content: flex-end; align-items: center; gap: 14px; font-weight: 700; font-size: 44px; letter-spacing: -0.5px; line-height: 1; }
  .logo .mark { width: 58px; height: 58px; flex: none; }
  .logo em { font-style: normal; color: var(--red); }
  .head { text-align: center; }
  .kicker { margin: 0 0 6px; font-size: 30px; font-weight: 700; letter-spacing: 7px; text-transform: uppercase; color: var(--kicker); }
  h1 { margin: 0; font-size: 94px; line-height: 1.08; letter-spacing: -1.5px; white-space: nowrap; }
  h1 em { font-style: normal; color: var(--red); }
  .foot { display: flex; justify-content: space-between; align-items: baseline; font-size: 32px; line-height: 1.2; }
  .cta { margin: 0; font-weight: 700; }
  .site { margin: 0; color: var(--ink-2); }
`;

const TALL_CSS = `html { --s: ${TALL_SCALE}; } html, body { height: 1920px; }
  main { position: absolute; left: calc(${SAFE.tall.l}px + (${SAFE.tall.r - SAFE.tall.l}px - ${TALL_CONTENT_W}px * var(--s)) / 2); top: ${SAFE.tall.t}px; width: ${TALL_CONTENT_W}px; height: calc(${SAFE.tall.b - SAFE.tall.t}px / var(--s)); padding: 0; gap: ${MIN_GAP}px; transform: scale(var(--s)); transform-origin: 0 0; }
  .photo { width: calc(400px * var(--k, 1)); height: calc(400px * var(--k, 1)); }`;
const PLAIN_CSS = `html, body { height: 1440px; }`;
/**
 * The square (1:1, 1080 x 1080): the same elements in the box x 135 to 945,
 * y 90 to 990 (810 x 900), laid out at their own sizes, not scaled. The note
 * tiles and gaps shrink with --k as in the other pictures, but only as far
 * as the rule in FIT_PAGE (never below 0.5), and no text is below 20 px.
 */
const SQUARE_CSS = `html, body { height: 1080px; }
  main { position: absolute; left: ${SAFE.square.l}px; top: ${SAFE.square.t}px; width: ${SAFE.square.r - SAFE.square.l}px; height: ${SAFE.square.b - SAFE.square.t}px; padding: 0; gap: ${MIN_GAP}px; }
  .logo { font-size: 40px; gap: 12px; }
  .logo .mark { width: 50px; height: 50px; }
  .kicker { margin: 0 0 2px; font-size: 22px; letter-spacing: 6px; }
  h1 { font-size: 76px; letter-spacing: -1px; }
  .foot { font-size: 28px; }
  .words { column-gap: 20px; row-gap: 10px; }
  .lab { font-size: 20px; letter-spacing: 4px; }
  .pill { padding: 4px 16px; font-size: 22px; }
  .pillrow { margin-bottom: calc(-4px * var(--k, 1)); }
  .notes { gap: calc(10px * var(--k, 1)); }
  .box { border-radius: 28px; padding: calc(10px * var(--k, 1)) 10px calc(8px * var(--k, 1)); }
  .tier { margin: 0 0 calc(4px * var(--k, 1)) 12px; font-size: 20px; letter-spacing: 5px; }
  .n { width: 194px; gap: calc(4px * var(--k, 1)); }
  .tile { width: calc(64px * var(--k, 1)); height: calc(64px * var(--k, 1)); border-radius: 18px; }
  .tile img { width: calc(46px * var(--k, 1)); height: calc(46px * var(--k, 1)); }
  .nm { font-size: 21px; line-height: 1.1; }
  .stage { gap: 18px; }
  .duo { width: 100%; display: flex; align-items: center; gap: 28px; }
  .duo .photo { flex: none; width: calc(372px * var(--k, 1)); height: calc(372px * var(--k, 1)); border-radius: 28px; }
  .duo .who { flex: 1; min-width: 0; gap: 10px; }
  .house { font-size: 24px; letter-spacing: 4px; }
  .answer { font-size: 60px; }
  .pills { flex-wrap: wrap; }
  .pills p { padding: 6px 18px; font-size: 24px; }
  .price { padding: 14px 16px; border-radius: 24px; }
  .price .l { font-size: 22px; letter-spacing: 4px; }
  .price .amt { margin-top: 4px; font-size: 68px; }
  .price .from { margin-top: 4px; font-size: 30px; }
  .price .fine { margin-top: 6px; font-size: 22px; }`;

const formatCss = (f: Format) => (f.kind === 'tall' ? TALL_CSS : f.kind === 'square' ? SQUARE_CSS : PLAIN_CSS);

/** A hidden letter is a drawn bar, never a character (plan 1.5). */
const cellHtml = (c: MaskWord[number]) => ('blank' in c ? '<i></i>' : `<b>${esc(c.t)}</b>`);
export const wordHtml = (w: MaskWord) => `<span class="w">${w.map(cellHtml).join('')}</span>`;

const CAP_HALF = 0.358;

/** The blanks' room. The square has 810 px across, so its words column is narrower, its labels smaller and its sizes may go lower (40, not 48). */
export interface Geo { labelPx: number; labelSpacing: number; colGap: number; wordsW: number; sizes: number[]; minSize: number; houseH: number; nameH: number; /** Tried first: fewer, smaller lines, which leave room for twelve notes. */ tight?: { houseH: number; nameH: number } }
const GEO: Record<'wide' | 'square', Geo> = {
  wide: { labelPx: 24, labelSpacing: 5, colGap: 26, wordsW: 696, sizes: [88, 80, 72, 64, 56, 48], minSize: 44, houseH: 150, nameH: 214 },
  square: { labelPx: 20, labelSpacing: 4, colGap: 20, wordsW: 628, sizes: [68, 64, 60, 56, 52, 48, 44, 40], minSize: 36, houseH: 120, nameH: 180, tight: { houseH: 72, nameH: 128 } },
};
export const geoOf = (f?: Format): Geo => GEO[f?.kind === 'square' ? 'square' : 'wide'];

/** How the house and the name are laid out in picture `f` (the 3:4 when omitted), or null when they do not fit (then the puzzle is not eligible). */
export function layoutOf(text: PuzzleText, f?: Format): { house: BlockPlan; name: BlockPlan } | null {
  const g = geoOf(f);
  for (const h of [g.tight, { houseH: g.houseH, nameH: g.nameH }]) {
    if (!h) continue;
    const house = planBlock(text.houseWords, g.wordsW, g.sizes, 2, h.houseH);
    const name = planBlock(text.nameWords, g.wordsW, g.sizes, 3, h.nameH);
    if (house && name) return { house, name };
  }
  return null;
}

export function blockHtml(label: string, plan: BlockPlan, spoken: string, g: Geo): string {
  const top = -(CAP_HALF * (plan.size - g.labelPx)).toFixed(1);
  const lines = plan.lines.map((l) => `<div class="ln">${l.map(wordHtml).join('')}</div>`).join('');
  return `<span class="lab" style="top:${top}px">${label}</span><div class="blk" role="img" aria-label="${esc(spoken)}" data-w="${g.wordsW}" data-lab="${g.labelPx}" data-min="${g.minSize}" style="font-size:${plan.size}px">${lines}</div>`;
}

export interface PuzzleView {
  house: MaskWord[];
  name: MaskWord[];
  concentration: string;
  notes: { tier: Tier; name: string; src: string; group: boolean }[];
}

const PUZZLE_CSS = `
  .words { display: grid; grid-template-columns: max-content max-content; column-gap: 26px; row-gap: 18px; justify-content: center; align-items: baseline; }
  .lab { justify-self: end; position: relative; font-size: 24px; font-weight: 400; letter-spacing: 5px; text-transform: uppercase; color: var(--ink-3); }
  .blk { font-weight: 700; line-height: 1.12; }
  .ln { display: flex; gap: 0.5em; white-space: nowrap; }
  .ln + .ln { margin-top: 0.04em; }
  .w { display: inline-flex; align-items: baseline; }
  .w b { font-weight: 700; }
  .w i { display: inline-block; width: 0.5em; height: 0; position: relative; }
  .w i::after { content: ''; position: absolute; left: 15%; right: 15%; top: 0.045em; height: max(6px, 0.09em); border-radius: 99px; background: var(--ink-2); }
  .notes { display: flex; flex-direction: column; gap: calc(16px * var(--k, 1)); }
  .pillrow { display: flex; justify-content: flex-end; margin-bottom: calc(-6px * var(--k, 1)); }
  .pill { margin: 0; padding: 6px 18px; border-radius: 999px; background: var(--red); color: #0A0A0B; font-size: 26px; font-weight: 700; line-height: 1.2; }
  .box { border: 2px solid var(--line); background: var(--card); border-radius: 36px; padding: calc(18px * var(--k, 1)) 14px calc(16px * var(--k, 1)); }
  .tier { margin: 0 0 calc(8px * var(--k, 1)) 14px; font-size: 26px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: var(--kicker); line-height: 1.1; }
  .row { display: flex; justify-content: center; }
  .n { width: 226px; display: flex; flex-direction: column; align-items: center; gap: calc(8px * var(--k, 1)); }
  .tile { width: calc(112px * var(--k, 1)); height: calc(112px * var(--k, 1)); border-radius: 26px; background: var(--tile); border: 2px solid var(--line); display: flex; align-items: center; justify-content: center; }
  .tile img { width: calc(78px * var(--k, 1)); height: calc(78px * var(--k, 1)); display: block; }
  .tile img.g { opacity: 0.7; }
  .nm { margin: 0; width: 100%; padding: 0 4px; text-align: center; font-size: 26px; font-weight: 700; line-height: 1.15; color: var(--ink); overflow-wrap: break-word; }
`;

/**
 * FIT_SCRIPT only notices an overflow of main's own box; the bottom padding is
 * where the footer must stay, so this goes on shrinking the tiles and gaps
 * (--k, the same variable) until the footer's bottom edge is above it.
 */
const FIT_PAGE = `<script>
(() => {
  const foot = document.querySelector('.foot');
  const main = document.querySelector('main');
  const root = document.documentElement;
  const limit = () => main.clientHeight - parseFloat(getComputedStyle(main).paddingBottom);
  const fits = () => !foot || foot.offsetTop + foot.offsetHeight <= limit();
  let k = parseFloat(root.style.getPropertyValue('--k') || '1');
  const shrink = (to) => { while (!fits() && k > to) { k = Math.round((k - 0.02) * 100) / 100; root.style.setProperty('--k', String(k)); } };
  // The 9:16 block is a scaled copy of the 3:4 layout: tiles shrink to 0.7, then the block itself to ${TALL_SCALE_FLOOR}, then the tiles to 0.5.
  const tall = getComputedStyle(root).getPropertyValue('--s').trim();
  if (tall) {
    shrink(0.7);
    let s = parseFloat(tall);
    while (!fits() && s > ${TALL_SCALE_FLOOR}) { s = Math.round((s - 0.005) * 1000) / 1000; root.style.setProperty('--s', String(s)); }
  }
  shrink(0.5);
})();
</script>`;

const FIT_BLOCKS = `<script>
(() => {
  const main = document.querySelector('main');
  const scale = main.getBoundingClientRect().width / main.offsetWidth;
  for (const b of document.querySelectorAll('.blk')) {
    const max = Number(b.dataset.w);
    let s = parseFloat(b.style.fontSize);
    while (b.getBoundingClientRect().width / scale > max && s > Number(b.dataset.min || 44)) { s -= 1; b.style.fontSize = s + 'px'; }
    const lab = b.previousElementSibling;
    if (lab) lab.style.top = (-0.358 * (s - Number(b.dataset.lab))) + 'px';
  }
})();
</script>`;

function spoken(words: readonly MaskWord[], what: string): string {
  const parts = words.map((w) => {
    const hidden = w.filter((c) => 'blank' in c).length;
    const shown = w.filter((c): c is { t: string } => 't' in c).map((c) => c.t).join('');
    return hidden === 0 ? `${shown} (shown in full)` : `starts with ${w.find((c): c is { t: string } => 't' in c)?.t ?? ''}, ${hidden + 1} letters`;
  });
  return `${what}: ${words.length} word${words.length === 1 ? '' : 's'}; ${parts.join('; ')}`;
}

export function puzzleHtml(view: PuzzleView, layout: { house: BlockPlan; name: BlockPlan }, f: Format): string {
  const g = geoOf(f);
  const rows = TIERS.map((tier) => {
    const list = view.notes.filter((n) => n.tier === tier);
    if (!list.length) return '';
    const items = list
      .map((n) => `<div class="n"><div class="tile"><img class="${n.group ? 'g' : 'o'}" src="${n.src}" alt=""></div><p class="nm" data-fit="2,20">${esc(n.name)}</p></div>`)
      .join('');
    return { tier, html: `<div class="box"><p class="tier">${TIER_LABEL[tier]}</p><div class="row">${items}</div></div>` };
  }).filter((r): r is { tier: Tier; html: string } => r !== '');
  const first = rows[0]?.html ?? '';
  const rest = rows.slice(1).map((r) => r.html).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Guess the Fragrance</title><meta name="social-size" content="${f.w}x${f.h}"><style>${BASE_CSS}${PUZZLE_CSS}${formatCss(f)}</style></head><body><main>
  <div class="logo"><span>Price<em>Sniffs</em></span>${MARK('mark')}</div>
  <div class="head">${f.kind === 'square' ? '' : `<p class="kicker">Today's puzzle</p>`}<h1 data-fit="1,60">Guess the <em>Fragrance</em></h1></div>
  <div class="words">${blockHtml('House', layout.house, spoken(view.house, 'House'), g)}${blockHtml('Fragrance', layout.name, spoken(view.name, 'Fragrance'), g)}</div>
  <div class="notes"><div class="pillrow"><p class="pill">${esc(view.concentration)}</p></div>${first}${rest}</div>
  <div class="foot"><p class="cta">Comment your guess.</p><p class="site">pricesniffs.space</p></div>
</main>${FIT_BLOCKS}${FIT_SCRIPT}${FIT_PAGE}</body></html>`;
}

/* ── the reveal picture ──────────────────────────────────────────────────── */

export interface RevealView {
  brand: string;
  name: string;
  concentration: string;
  size: string;
  photo: string | null;
  /** null with --no-price. */
  price: { amount: string; shop: string; checked: string } | null;
}

const REVEAL_CSS = `
  .stage { display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; }
  .who { width: 100%; display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .house { margin: 0; width: 100%; font-size: 36px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: var(--ink-2); white-space: nowrap; }
  .answer { margin: 0; width: 100%; font-size: 92px; font-weight: 700; line-height: 1.08; letter-spacing: -1px; overflow-wrap: break-word; }
  .pills { display: flex; gap: 14px; justify-content: center; }
  .pills p { margin: 0; padding: 8px 22px; border-radius: 999px; font-size: 28px; font-weight: 700; line-height: 1.2; }
  .pills .a { background: var(--red); color: #0A0A0B; }
  .pills .b { border: 2px solid #3A3A40; color: var(--ink-2); }
  .photo { width: 400px; height: 400px; border-radius: 36px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
  .photo img { width: 86%; height: 86%; object-fit: contain; }
  .price { width: 100%; padding: 22px 20px; border-radius: 28px; border: 2px solid #4FB47B; background: #14221B; text-align: center; }
  .price .l { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #4FB47B; }
  .price .amt { margin: 6px 0 0; font-size: 84px; font-weight: 700; line-height: 1.05; color: #4FB47B; }
  .price .from { margin: 6px 0 0; font-size: 34px; font-weight: 700; color: var(--ink); white-space: nowrap; }
  .price .fine { margin: 8px 0 0; font-size: 26px; color: var(--ink-2); white-space: nowrap; }
  .price.none { border-color: #3A3A40; background: var(--card); }
  .price.none .amt { font-size: 44px; color: var(--ink); }
`;

export function revealHtml(v: RevealView, f: Format): string {
  const price = v.price
    ? `<div class="price"><p class="l">Cheapest price</p><p class="amt" data-fit="1,50">${esc(v.price.amount)}</p><p class="from" data-fit="1,24">from ${esc(undash(v.price.shop))}</p><p class="fine" data-fit="1,20">Price includes delivery, checked ${esc(v.price.checked)}</p></div>`
    : `<div class="price none"><p class="l">Today's price</p><p class="amt" data-fit="1,30">See it at pricesniffs.space</p></div>`;
  const pills = `<div class="pills"><p class="a">${esc(v.concentration)}</p>${v.size ? `<p class="b">${esc(v.size)}</p>` : ''}</div>`;
  const photo = v.photo ? `<div class="photo"><img src="${esc(v.photo)}" alt=""></div>` : '';
  const who = `<div class="who"><p class="house" data-fit="${f.kind === 'square' ? '1,20' : '1,24'}">${esc(undash(v.brand))}</p><p class="answer" data-fit="${f.kind === 'square' ? '3,34' : '2,48'}">${esc(undash(v.name))}</p>${f.kind === 'square' ? pills : ''}</div>`;
  const stage = f.kind === 'square'
    ? `<div class="stage"><div class="duo">${photo}${who}</div>${price}</div>`
    : `<div class="stage">
    ${who}
    ${pills}
    ${photo}
    ${price}
  </div>`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>The answer</title><meta name="social-size" content="${f.w}x${f.h}"><style>${BASE_CSS}${REVEAL_CSS}${formatCss(f)}</style></head><body><main>
  <div class="logo"><span>Price<em>Sniffs</em></span>${MARK('mark')}</div>
  <div class="head"><p class="kicker">The answer</p><h1 data-fit="1,60">Guess the <em>Fragrance</em></h1></div>
  ${stage}
  <div class="foot"><p class="cta">Did you get it?</p><p class="site">pricesniffs.space</p></div>
</main>${FIT_SCRIPT}${FIT_PAGE}</body></html>`;
}

/* ── captions, alt text, check.json ──────────────────────────────────────── */

export function altText(view: PuzzleView): string {
  const tiers = TIERS.map((t) => {
    const names = view.notes.filter((n) => n.tier === t).map((n) => n.name);
    return names.length ? `${TIER_LABEL[t]} notes: ${names.join(', ')}.` : '';
  }).filter(Boolean);
  return `A black picture titled Guess the Fragrance, a perfume puzzle. ${spoken(view.house, 'House')}. ${spoken(view.name, 'Fragrance')}. Strength: ${view.concentration}. ${tiers.join(' ')} Comment your guess.\n`;
}


/**
 * Guess the Fragrance VIDEOS (docs/GUESS-THE-FRAGRANCE-PLAN.md section 6): a 10 second 9:16 video of the
 * puzzle and a 10 second 9:16 video of the reveal, made from the shared video template
 * (scripts/social-video-template.ts) and drawn by its renderer (scripts/social-video-render.ts).
 *
 *   npm run social:guess -- --video             the puzzle video, beside the puzzle pictures
 *   npm run social:guess -- --reveal --video    the reveal video, beside the reveal pictures
 *
 * The owner's rules, as built: the video opens on a still; scenes join by a dissolve (0.5 s) during which both scenes
 * zoom out together to 97% and back (a slight zoom, which never leaves the safe box); no scene zooms slowly, because the puzzle scenes are the 9:16 picture itself; the end is the PriceSniffs mark
 * with the address, held 1.2 s, then a 1 s fade to the background. Black theme, exactly 10 seconds (300 frames).
 *
 * Puzzle video (guess-video-9x16.mp4), drawn from guess-9x16.html beside it:
 *   0.0  the puzzle exactly as the 9:16 picture, full layout, motionless until 3.0
 *   3.0  dissolve to the same layout with the notes revealing tier by tier: Top at 3.9, Heart at 4.3, Base
 *        at 4.7, every note of a tier fading in and rising 8 px over 0.5 s; the dashed House and Fragrance
 *        lines never change
 *   7.3  dissolve to "Comment your guess.", the PriceSniffs mark and the address, held to 9.0, faded by 10.0
 * Reveal video (reveal-video-9x16.mp4), drawn from check.json beside it:
 *   0.0  "The answer": House and Fragrance as dashes, still until 1.0, then one 0.5 s dissolve to the letters
 *   2.7  dissolve to the bottle photo, the strength and the size
 *   4.8  dissolve to the cheapest price, the shop, the delivery note and "Prices change, so check before you buy."
 *   7.3  dissolve to the PriceSniffs mark and the address, held to 9.0, faded by 10.0
 *
 * Nothing about the answer is in a puzzle video: it is made from guess-9x16.html alone, which holds the
 * dashes, the notes and the strength (tests/guessFragranceVideo.test.ts holds it to check.json's answer).
 * Pictures and videos are never committed (docs/DECISIONS.md D28): pictures.json names the video as
 * make "guess-video", video "puzzle" or "reveal", and `npm run social:render -- <folder>` draws it again.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { BRAND_FONT_CSS } from './socialRender.js';
import { MARK } from './socialSlides.js';
import { photoDataUri } from './socialPictures.js';
import { renderVideo, type RenderReport } from './social-video-render.js';
import { TALL_SCALE, geoOf, layoutOf, wordHtml, type Tier } from './social-guess-html.js';
import { maskPhrase, tidyName, type MaskWord, type PuzzleText } from './social-guess-mask.js';
import {
  OUTRO_SCENE,
  VIDEO_TEMPLATE as T,
  checkedLabel,
  easeInOutSine,
  esc,
  gbp,
  undash,
  type VideoSpec,
} from './social-video-template.js';

export const PUZZLE_VIDEO_FILE = 'guess-video-9x16.mp4';
export const REVEAL_VIDEO_FILE = 'reveal-video-9x16.mp4';
export const ADDRESS = 'pricesniffs.space';

/* ── the timelines ──────────────────────────────────────────────────────── */

const dip = T.guess.dip;
/** Every scene: no slow zoom (the puzzle is a whole picture); a dissolve shrinks both scenes together by 3% at its middle and back. */
const still = { zoom: 1 } as const;
const dissolved = { zoom: 1, dip } as const;
const end = (seconds: number) => ({ ...OUTRO_SCENE('dissolve', seconds), ...dissolved });

/** Scenes start at 0.0, 3.0, 7.3 and end at 3.5, 7.8, 10.0 (a dissolve of 0.5 s overlaps the end of the scene before). */
export const GUESS_PUZZLE_VIDEO: VideoSpec = {
  id: 'guess-puzzle',
  theme: T.guess.theme,
  scenes: [
    { id: 'puzzle', seconds: 3.5, ...still },
    { id: 'notes', seconds: 4.8, transition: 'dissolve', ...dissolved },
    end(2.7),
  ],
};

/** Scenes start at 0.0, 2.7, 4.8, 7.3 and end at 3.2, 5.3, 7.8, 10.0. */
export const GUESS_REVEAL_VIDEO: VideoSpec = {
  id: 'guess-reveal',
  theme: T.guess.theme,
  scenes: [
    { id: 'answer', seconds: 3.2, ...still },
    { id: 'bottle', seconds: 2.6, transition: 'dissolve', ...dissolved },
    { id: 'price', seconds: 3.0, transition: 'dissolve', ...dissolved },
    end(2.7),
  ],
};

/* ── what the scenes animate inside themselves ──────────────────────────── */

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const progress = (t: number, from: number, seconds: number) => round6(easeInOutSine((t - from) / seconds));

/** The notes reveal: the Top notes at `first`, the Heart notes `step` later, the Base notes `step` after those. */
export const NOTES_REVEAL = { first: 3.9, step: 0.4, seconds: 0.5, risePx: 8 } as const;
export const TIER_ORDER: readonly Tier[] = ['top', 'middle', 'base'];

/** How far in each tier's notes are at time t (0 = hidden and 8 px low, 1 = shown). */
export function tierProgress(t: number): Record<Tier, number> {
  const at = (i: number) => progress(t, NOTES_REVEAL.first + i * NOTES_REVEAL.step, NOTES_REVEAL.seconds);
  return { top: at(0), middle: at(1), base: at(2) };
}

/** The reveal's letters: the dashes dissolve to the letters once, from `from`, over `seconds`. */
export const ANSWER_FILL = { from: 1.0, seconds: 0.5 } as const;
export const fillProgress = (t: number) => progress(t, ANSWER_FILL.from, ANSWER_FILL.seconds);

export const puzzleExtra = (t: number) => ({ tiers: tierProgress(t) });
export const revealExtra = (t: number) => ({ fill: fillProgress(t) });

/* ── the look ───────────────────────────────────────────────────────────── */

const S = TALL_SCALE;
const px = (n: number) => `${Math.round(n * S * 100) / 100}px`;

/** The blanks, as the puzzle picture draws them, at the 9:16 picture's scale. */
const WORDS_CSS = `
  .words { display: grid; grid-template-columns: max-content max-content; column-gap: ${px(26)}; row-gap: ${px(18)}; justify-content: center; align-items: center; margin-top: 10px; }
  .lab { justify-self: end; font-size: ${px(24)}; font-weight: 400; letter-spacing: ${px(5)}; text-transform: uppercase; color: var(--ink-3); }
  .cellbox { display: grid; }
  .blk { grid-area: 1 / 1; align-self: center; justify-self: start; font-weight: 700; line-height: 1.12; }
  .blk.full { opacity: 0; }
  .ln { display: flex; gap: 0.5em; white-space: nowrap; }
  .ln + .ln { margin-top: 0.04em; }
  .w { display: inline-flex; align-items: baseline; }
  .w b { font-weight: 700; }
  .w i { display: inline-block; width: 0.5em; height: 0; position: relative; }
  .w i::after { content: ''; position: absolute; left: 15%; right: 15%; top: 0.045em; height: max(${px(6)}, 0.09em); border-radius: 99px; background: var(--ink-2); }`;

export const GUESS_VIDEO_CSS = `
  .stage { padding: 0; gap: 0; }
  /* The puzzle scenes are the whole 9:16 picture, edge to edge, in a frame of its own. */
  #scene-puzzle .stage, #scene-notes .stage { left: 0; top: 0; width: ${T.width}px; height: ${T.height}px; display: block; }
  .pic { display: block; width: ${T.width}px; height: ${T.height}px; border: 0; background: var(--bg); }
  /* A reveal scene: the corner logo flush top right of the safe box, the rest centred below it. */
  .col { width: 100%; height: 100%; display: flex; flex-direction: column; }
  .corner { display: flex; justify-content: flex-end; align-items: center; gap: 14px; font-weight: 700; font-size: 50px; letter-spacing: -0.5px; line-height: 1; }
  .corner .mark { width: 62px; height: 62px; flex: none; }
  .mid { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; text-align: center; }
  .mid .h { font-size: 86px; letter-spacing: -1.5px; white-space: nowrap; }
  .mid h2.h { white-space: normal; }
  .mid .kicker { letter-spacing: 6px; }
  .mid .photo { width: 500px; height: 500px; margin: 0; }
  .pills { display: flex; gap: 16px; justify-content: center; }
  .pills p { margin: 0; padding: 10px 28px; border-radius: 999px; font-size: 40px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
  .pills .a { background: var(--accent); color: #0A0A0B; }
  .pills .b { border: 2px solid #3A3A40; color: var(--ink-2); }
  .mid .box { padding: 40px 20px 40px; }
  .mid .box .label { font-size: 36px; }
  .mid .box .amount { font-size: 160px; margin-top: 10px; }
  .mid .box .from { font-size: 46px; margin-top: 10px; }
  .mid .fine { font-size: 32px; }
  .mid .p { font-size: 54px; text-wrap: balance; }
  .mid h2.h { text-wrap: balance; }
  .mid .strong { color: var(--ink); font-weight: 700; }
  .mid .box.none { border-color: #3A3A40; background: var(--card); }
  .mid .box.none .amount { font-size: 64px; color: var(--ink); }
  .end { width: 100%; align-items: center; }
  .end .cta { margin: 0; width: 100%; font-size: 84px; font-weight: 700; line-height: 1.1; letter-spacing: -1.5px; text-align: center; white-space: nowrap; }
  .addr { margin: 0; padding: 18px 46px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 50px; font-weight: 700; white-space: nowrap; }
  ${WORDS_CSS}
`;

const corner = () => `<div class="corner"><span>Price<em>Sniffs</em></span>${MARK('mark')}</div>`;
const endCard = (cta: boolean) =>
  `<div class="outro end">${cta ? '<p class="cta" data-fit="1,56">Comment your guess.</p>' : ''}${MARK('outro-mark')}<div class="word">Price<em>Sniffs</em></div><p class="addr" data-box>${ADDRESS}</p></div>`;

/* ── the puzzle video's scenes ──────────────────────────────────────────── */

/** The picture, as it is drawn on its own, with the brand font its own page needs (renderSmooth does the same). */
const framed = (pictureHtml: string) => pictureHtml.replace('<head>', `<head><style>${BRAND_FONT_CSS}</style>`);

const NOTES_SCRIPT = `<script>
(() => {
  const key = { Top: 'top', Heart: 'middle', Base: 'base' };
  window.__extra = (x) => {
    if (!x) return;
    const doc = document.getElementById('pic-notes').contentDocument;
    const main = doc.querySelector('main');
    const scale = main.getBoundingClientRect().width / main.offsetWidth;
    for (const box of doc.querySelectorAll('.box')) {
      const p = x.tiers[key[box.querySelector('.tier').textContent.trim()]];
      for (const n of box.querySelectorAll('.n')) {
        n.style.opacity = String(p);
        n.style.transform = 'translateY(' + (${NOTES_REVEAL.risePx} * (1 - p) / scale) + 'px)';
      }
    }
  };
})();
</script>`;

/** The scenes of the puzzle video from the 9:16 puzzle picture's HTML (guess-9x16.html). */
export function puzzleScenes(pictureHtml: string): { id: string; html: string }[] {
  const doc = framed(pictureHtml);
  const frame = (id: string) => `<iframe class="pic" id="${id}" data-bleed srcdoc="${esc(doc)}"></iframe>`;
  return [
    { id: 'puzzle', html: frame('pic-puzzle') },
    { id: 'notes', html: `${frame('pic-notes')}${NOTES_SCRIPT}` },
    { id: 'outro', html: endCard(true) },
  ];
}

/**
 * Words and boxes of the two picture scenes that are outside the safe box, in the picture's own frame (the
 * renderer's check cannot see inside an iframe). Run with the notes both hidden (8 px low) and shown.
 */
export async function pictureSceneProblems(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const shown of [false, true]) {
    await page.evaluate(`window.__extra({ tiers: { top: ${shown ? 1 : 0}, middle: ${shown ? 1 : 0}, base: ${shown ? 1 : 0} } })`);
    out.push(
      ...((await page.evaluate(`((args) => {
        const { safe, tol } = args;
        const bad = [];
        for (const id of ['pic-puzzle', 'pic-notes']) {
          const doc = document.getElementById(id).contentDocument;
          const found = [];
          for (const el of doc.body.querySelectorAll('*')) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style') continue;
            if (el.closest('svg') && tag !== 'svg') continue;
            if (['img', 'svg'].includes(tag) || ['box', 'tile', 'pill'].some((c) => el.classList.contains(c))) {
              const b = el.getBoundingClientRect();
              if (b.width > 0 && b.height > 0) found.push({ what: tag + (typeof el.className === 'string' && el.className ? '.' + el.className : ''), l: b.left, r: b.right, t: b.top, b: b.bottom });
            }
            for (const n of el.childNodes) {
              if (n.nodeType !== 3 || !n.textContent.trim()) continue;
              const range = doc.createRange();
              range.selectNodeContents(n);
              for (const b of range.getClientRects()) found.push({ what: 'text "' + n.textContent.trim().slice(0, 32) + '"', l: b.left, r: b.right, t: b.top, b: b.bottom });
            }
          }
          for (const f of found) {
            if (f.l < safe.left - tol || f.r > safe.right + tol || f.t < safe.top - tol || f.b > safe.bottom + tol) {
              bad.push(id + ' (notes ${shown ? 'shown' : 'hidden'}): ' + f.what + ' at x ' + Math.round(f.l) + ' to ' + Math.round(f.r) + ', y ' + Math.round(f.t) + ' to ' + Math.round(f.b) + ' is outside the safe box');
            }
          }
        }
        return bad;
      })(${JSON.stringify({ safe: T.safe, tol: 0.5 })})`)) as string[]),
    );
  }
  return out;
}

/* ── the reveal video's scenes ──────────────────────────────────────────── */

/** What the reveal video shows (the figures are the reveal picture's, from its check.json). */
export interface RevealVideoData {
  brand: string;
  name: string;
  concentration: string;
  /** "100ml", or empty. */
  size: string;
  /** The bottle photo as a data: address, or null for a reveal made with --no-photo. */
  photo: string | null;
  /** null for a reveal made with --no-price. */
  price: { amount: string; shop: string; checked: string } | null;
}

/** The part of the reveal's check.json the video is drawn from (scripts/social-guess-fragrance.ts writes it). */
export interface RevealRecord {
  brand: string;
  name: string;
  concentration: string;
  size: string;
  delivered: number | null;
  shop: string | null;
  pricesCheckedAt: string | null;
  priceShown?: boolean;
  photo: string | null;
  photoShown?: boolean;
}

export function revealVideoFromRecord(r: RevealRecord, photo: string | null): RevealVideoData {
  const priced = r.priceShown !== false && r.delivered !== null && r.shop !== null && r.pricesCheckedAt !== null;
  return {
    brand: r.brand,
    name: r.name,
    concentration: r.concentration,
    size: r.size,
    photo,
    price: priced ? { amount: gbp(r.delivered!), shop: r.shop!, checked: checkedLabel(new Date(r.pricesCheckedAt!)) } : null,
  };
}

const FIT_WORDS = `<script>
window.__ready = () => {
  for (const b of document.querySelectorAll('.blk')) {
    let s = parseFloat(b.style.fontSize);
    while (b.getBoundingClientRect().width > Number(b.dataset.w) && s > Number(b.dataset.min)) { s -= 0.5; b.style.fontSize = s + 'px'; }
  }
};
window.__extra = (x) => {
  if (!x) return;
  for (const e of document.querySelectorAll('.blk.mask')) e.style.opacity = String(1 - x.fill);
  for (const e of document.querySelectorAll('.blk.full')) e.style.opacity = String(x.fill);
};
</script>`;

/** One row of the answer scene: the label, the dashes and, over them, the same words in full. */
function answerRow(label: string, raw: string, plan: { size: number; lines: MaskWord[][] }): string {
  const g = geoOf();
  const full = tidyName(raw).split(' ');
  let next = 0;
  const lines = (render: (w: MaskWord, i: number) => string) =>
    plan.lines.map((l) => `<div class="ln">${l.map((w) => render(w, next++)).join('')}</div>`).join('');
  const attrs = `data-w="${Math.round(g.wordsW * S * 100) / 100}" data-min="${Math.round(g.minSize * S * 100) / 100}" style="font-size:${Math.round(plan.size * S * 100) / 100}px"`;
  const mask = `<div class="blk mask" ${attrs} aria-hidden="true">${lines((w) => wordHtml(w))}</div>`;
  next = 0;
  const letters = `<div class="blk full" ${attrs}>${lines((_w, i) => `<span class="w"><b>${esc(full[i] ?? '')}</b></span>`)}</div>`;
  return `<span class="lab">${label}</span><div class="cellbox">${mask}${letters}</div>`;
}

/** The scenes of the reveal video. Every word comes from the caller (the reveal's check.json), never from here. */
export function revealScenes(d: RevealVideoData): { id: string; html: string }[] {
  const text: PuzzleText = { ok: true, houseWords: maskPhrase(d.brand), nameWords: maskPhrase(d.name), answerName: d.name, hidden: 0 };
  const layout = layoutOf(text);
  if (!layout) throw new Error(`${d.brand} ${d.name} does not fit the blank layout at 48px or more; shorten the name with --name`);
  const brand = undash(d.brand);
  const name = undash(d.name);
  const label = `${name}${d.size ? ` ${undash(d.size)}` : ''}`;
  const photo = d.photo ? `<div class="photo" data-box><img src="${esc(d.photo)}" alt=""></div>` : '';
  const pills = `<div class="pills"><p class="a" data-box>${esc(d.concentration)}</p>${d.size ? `<p class="b" data-box>${esc(d.size)}</p>` : ''}</div>`;
  const price = d.price
    ? `<div class="box best" data-box><p class="label">Cheapest price</p><p class="amount" data-fit="1,60">${esc(d.price.amount)}</p><p class="from" data-fit="1,22">from ${esc(undash(d.price.shop))}</p></div>
      <p class="fine" data-fit="2,24">Price includes delivery, checked ${esc(d.price.checked)}</p>`
    : `<div class="box none" data-box><p class="label">Today's price</p><p class="amount" data-fit="1,30">See it at ${ADDRESS}</p></div>`;
  return [
    {
      id: 'answer',
      html: `<div class="col">${corner()}<div class="mid">
      <p class="kicker">The answer</p>
      <h1 class="h" data-fit="1,56">Guess the <em>Fragrance</em></h1>
      <div class="words">${answerRow('House', d.brand, layout.house)}${answerRow('Fragrance', d.name, layout.name)}</div>
      </div></div>${FIT_WORDS}`,
    },
    {
      id: 'bottle',
      html: `<div class="col">${corner()}<div class="mid">
      <p class="kicker grey" data-fit="1,22">${esc(brand)}</p>
      <h2 class="h" data-fit="2,44">${esc(name)}</h2>
      ${photo}
      ${pills}
      </div></div>`,
    },
    {
      id: 'price',
      html: `<div class="col">${corner()}<div class="mid">
      <p class="kicker grey" data-fit="2,24">${esc(label)}</p>
      ${price}
      <p class="p strong">Prices change, so check before you buy.</p>
      </div></div>`,
    },
    { id: 'outro', html: endCard(false) },
  ];
}

/* ── drawing ────────────────────────────────────────────────────────────── */

/** Draws the puzzle video of a puzzle folder (guess-9x16.html in `dir`) into `outDir`. */
export async function drawPuzzleVideo(dir: string, outDir: string = dir, log?: (line: string) => void): Promise<RenderReport> {
  const file = join(dir, 'guess-9x16.html');
  if (!existsSync(file)) throw new Error(`${file} is missing: the puzzle video is drawn from the 9:16 puzzle picture's HTML`);
  return renderVideo({
    spec: GUESS_PUZZLE_VIDEO,
    scenes: puzzleScenes(readFileSync(file, 'utf8')),
    outDir,
    file: PUZZLE_VIDEO_FILE,
    extraCss: GUESS_VIDEO_CSS,
    extra: puzzleExtra,
    check: pictureSceneProblems,
    ...(log ? { log } : {}),
  });
}

/** Draws the reveal video of a reveal folder (check.json in `dir`) into `outDir`. The photo is downloaded again, as the picture's is. */
export async function drawRevealVideo(dir: string, outDir: string = dir, log?: (line: string) => void): Promise<RenderReport> {
  const record = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')) as RevealRecord;
  const photo = record.photo && record.photoShown !== false ? photoDataUri(record.photo) : null;
  return renderVideo({
    spec: GUESS_REVEAL_VIDEO,
    scenes: revealScenes(revealVideoFromRecord(record, photo)),
    outDir,
    file: REVEAL_VIDEO_FILE,
    extraCss: GUESS_VIDEO_CSS,
    extra: revealExtra,
    ...(log ? { log } : {}),
  });
}

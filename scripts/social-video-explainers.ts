/**
 * Two informative videos in the red explainer theme, made from the shared
 * video template (scripts/social-video-template.ts, rules in
 * docs/SOCIAL-MEDIA-PLAN.md section 9): the same transitions, the same
 * PriceSniffs ending and one second fade as the Deal of the Day video, but as
 * long as the content needs (20 to 30 seconds).
 *
 *   npx tsx scripts/social-video-explainers.ts                  both
 *   npx tsx scripts/social-video-explainers.ts --only strengths
 *   npx tsx scripts/social-video-explainers.ts --only notes
 *   npm run social:video:explainers
 *
 *   --date YYYY-MM-DD   the date in the folder name (default: today, UK)
 *   --keep-frames       keep the drawn frames in _frames/ (git ignores them)
 *
 * The videos are not committed (docs/DECISIONS.md D28): pictures.json names
 * each one by its key here, and `npm run social:render -- <folder>` draws it
 * again from this file's scenes.
 *
 * Every claim is one the site's own guides make (demo/content/guideBodies.ts:
 * "perfume-strengths-explained" and "perfume-notes-explained").
 * tests/socialVideoTemplate.test.ts holds the figures and the key phrases to
 * the guide's text, so the videos cannot drift from the site unnoticed.
 * Strengths are shown as the guide shows them: a rule of thumb, with no law
 * behind it. Longevity is shown only as the guide states it (more oil usually
 * lasts longer), never as hours.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderVideo } from './social-video-render.js';
import { recordPictures } from './socialPictures.js';
import { MARK } from './socialSlides.js';
import { OUTRO_SCENE, VIDEO_TEMPLATE, esc, outroHtml, type VideoSpec } from './social-video-template.js';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'pricesniffs.space';

/* ── the facts, as the guides state them ───────────────────────────────── */

export interface Strength {
  /** What the guide calls it. */
  name: string;
  abbr: string;
  /** Per cent of fragrance oil, "roughly lo to hi per cent" in the guide. */
  lo: number;
  hi: number;
  /** 1 (shortest) to 4 (longest): the order the guide gives, more oil usually lasts longer. */
  lasts: 1 | 2 | 3 | 4;
  lastsWord: string;
  /** When to choose it, from the guide's "Picking One" and each strength's own line. */
  choose: string;
}

export const STRENGTHS: readonly Strength[] = [
  { name: 'Eau de Cologne', abbr: 'EDC', lo: 2, hi: 5, lasts: 1, lastsWord: 'Shortest', choose: 'Hot days, the office or a first try' },
  { name: 'Eau de Toilette', abbr: 'EDT', lo: 5, hi: 15, lasts: 2, lastsWord: 'Moderate', choose: 'Daytime and warm weather' },
  { name: 'Eau de Parfum', abbr: 'EDP', lo: 15, hi: 20, lasts: 3, lastsWord: 'Long', choose: 'Evenings, colder months or a long day' },
  { name: 'Parfum or Extrait', abbr: 'Extrait de Parfum', lo: 20, hi: 30, lasts: 4, lastsWord: 'Longest', choose: 'Special occasions, or a touch of scent' },
];

/** The scale the track draws: the top of the strongest range. */
const SCALE_MAX = Math.max(...STRENGTHS.map((s) => s.hi));

export type Layer = 'top' | 'middle' | 'base';
export interface NoteLayer {
  layer: Layer;
  kicker: string;
  title: string;
  examples: string[];
  text: string;
}
export const LAYERS: readonly NoteLayer[] = [
  {
    layer: 'top',
    kicker: 'Top notes',
    title: 'The first impression',
    examples: ['Citrus', 'Fresh herbs', 'Some fruit'],
    text: 'Light and quick. They fade first, often within the first half hour.',
  },
  {
    layer: 'middle',
    kicker: 'Middle notes',
    title: 'The heart',
    examples: ['Flowers', 'Spices', 'Green notes'],
    text: 'The character of the scent. It appears as the top fades and lasts a few hours.',
  },
  {
    layer: 'base',
    kicker: 'Base notes',
    title: 'What stays',
    examples: ['Woods', 'Resins', 'Musk', 'Amber', 'Vanilla'],
    text: 'Heavy and slow. They last longest and can linger on clothes into the next day.',
  },
];

/* ── pieces ────────────────────────────────────────────────────────────── */

const TICK = `<svg class="tick" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--icon)" stroke-width="7"/><path d="M20 33 l8 8 l16 -17" fill="none" stroke="var(--icon-inner)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const tickItem = (text: string) => `<div class="item" data-box>${TICK}<p data-fit="3,30">${esc(text)}</p></div>`;
const FONT = `font-family="Liberation Sans, Arial, sans-serif"`;

export const EXPLAINER_CSS = `
  .abbr { margin: -6px 0 0; width: 100%; font-size: 50px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: var(--accent); }
  .card.range-card { padding: 28px 36px 24px; }
  .card .label { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: var(--card-ink-2); }
  .card .range { margin: 4px 0 10px; font-size: 128px; font-weight: 700; letter-spacing: -3px; line-height: 1.02; color: var(--card-ink); white-space: nowrap; }
  .card .track { display: block; width: 100%; height: auto; }
  .card .lasts { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; padding-top: 20px; border-top: 2px solid var(--card-line); }
  .card .lasts .word { font-size: 44px; font-weight: 700; color: var(--card-ink); }
  .card .pips { display: flex; gap: 12px; }
  .card .pips i { width: 34px; height: 34px; border-radius: 50%; background: #3A3A40; }
  .card .pips i.on { background: #FF3B41; }
  .pick { width: 100%; display: flex; flex-direction: column; gap: 8px; }
  .pick .label { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: var(--ink-2); }
  .pick .text { margin: 0; font-size: 50px; font-weight: 700; line-height: 1.15; color: var(--ink); }
  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; width: 100%; }
  .chip { padding: 14px 30px; border-radius: 999px; background: var(--card); color: var(--card-ink); border: 2px solid var(--card-line); font-size: 42px; font-weight: 700; }
  .item { width: 100%; display: flex; align-items: center; gap: 26px; padding: 26px 30px; border-radius: 28px; background: var(--card);
    border: 2px solid var(--card-line); text-align: left; box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .item .tick { flex: none; width: 60px; height: 60px; }
  .item p { margin: 0; font-size: 40px; line-height: 1.25; color: var(--card-ink); }
  .list { width: 100%; display: flex; flex-direction: column; gap: 26px; }
  .layer-icon, .pyramid, .timeline, .ladder { display: block; height: auto; }
  .layer-icon { width: 190px; }
  .cover-mark { width: 230px; height: 230px; }
  .h.xxl { font-size: 120px; line-height: 1.04; }
  .card .pyramid, .card .timeline, .card .ladder { width: 100%; }
`;

/** One band of the pyramid: the apex band is a triangle, the others trapezoids. */
function pyramidBands(apexY: number, baseY: number, cx: number, halfBase: number, cuts: [number, number, number, number]) {
  const half = (y: number) => ((y - apexY) / (baseY - apexY)) * halfBase;
  const band = (y1: number, y2: number) =>
    `${cx - half(y1)},${y1} ${cx + half(y1)},${y1} ${cx + half(y2)},${y2} ${cx - half(y2)},${y2}`;
  return { top: band(cuts[0], cuts[1]), middle: band(cuts[1] + 10, cuts[2]), base: band(cuts[2] + 10, cuts[3]), half };
}

/** The three layers as a pyramid with labels, for the card. */
function pyramidCard(): string {
  const b = pyramidBands(10, 390, 230, 230, [10, 140, 270, 390]);
  const label = (y: number, text: string, fill: string) =>
    `<text x="230" y="${y}" text-anchor="middle" ${FONT} font-weight="700" font-size="34" letter-spacing="2" fill="${fill}">${text}</text>`;
  const side = (y: number, text: string) => `<text x="500" y="${y}" ${FONT} font-size="34" fill="#F7F7F8">${text}</text>`;
  return `<div class="card" data-box><svg class="pyramid" viewBox="0 0 800 400" aria-hidden="true">
    <polygon points="${b.top}" fill="#FF9A9D"/><polygon points="${b.middle}" fill="#FF3B41"/><polygon points="${b.base}" fill="#B02329"/>
    ${label(110, 'TOP', '#0A0A0B')}${label(218, 'MIDDLE', '#F7F7F8')}${label(348, 'BASE', '#F7F7F8')}
    ${side(108, 'First impression')}${side(222, 'The heart')}${side(352, 'What stays')}
  </svg></div>`;
}

/** A small pyramid with one layer picked out, for the top of a layer scene (drawn straight on the red). */
function layerIcon(layer: Layer): string {
  const b = pyramidBands(6, 150, 100, 96, [6, 54, 100, 150]);
  const fill = (l: Layer) => `fill="#0A0A0B" fill-opacity="${l === layer ? 1 : 0.2}"`;
  return `<svg class="layer-icon" viewBox="0 0 200 156" aria-hidden="true">
    <polygon points="${b.top}" ${fill('top')}/><polygon points="${b.middle}" ${fill('middle')}/><polygon points="${b.base}" ${fill('base')}/></svg>`;
}

/** The four strengths as steps going up: more oil to the right. */
function ladderCard(): string {
  const bars = STRENGTHS.map((s, i) => {
    const h = 70 + i * 62;
    const x = 20 + i * 190;
    return `<rect x="${x}" y="${300 - h}" width="150" height="${h}" rx="14" fill="#FF3B41"/>
      <text x="${x + 75}" y="346" text-anchor="middle" ${FONT} font-weight="700" font-size="34" fill="#F7F7F8">${s.abbr === 'Extrait de Parfum' ? 'Parfum' : s.abbr}</text>`;
  }).join('');
  return `<div class="card" data-box><svg class="ladder" viewBox="0 0 780 372" aria-hidden="true">${bars}</svg></div>`;
}

/** Fragrance oil on a 0 to SCALE_MAX per cent track, the strength's range lit. */
function track(lo: number, hi: number): string {
  const W = 700;
  const x1 = (W * lo) / SCALE_MAX;
  const x2 = (W * hi) / SCALE_MAX;
  return `<svg class="track" viewBox="0 0 ${W} 62" aria-hidden="true">
    <rect x="0" y="6" width="${W}" height="24" rx="12" fill="#3A3A40"/>
    <rect x="${x1}" y="6" width="${x2 - x1}" height="24" rx="12" fill="#FF3B41"/>
    <text x="0" y="58" ${FONT} font-size="28" fill="#B9B9C0">0%</text>
    <text x="${W}" y="58" text-anchor="end" ${FONT} font-size="28" fill="#B9B9C0">${SCALE_MAX}%</text></svg>`;
}

/** The three layers on a time line: where each is strongest. Schematic, and says so. */
function timelineCard(): string {
  const lane = (id: string, y: number, x1: number, x2: number, text: string, fadeFrom: number) =>
    `<defs><linearGradient id="g${id}" x1="${x1}" x2="${x2}" y1="0" y2="0" gradientUnits="userSpaceOnUse">
       <stop offset="0" stop-color="#FF3B41"/><stop offset="${fadeFrom}" stop-color="#FF3B41"/><stop offset="1" stop-color="#FF3B41" stop-opacity="0.08"/></linearGradient></defs>
     <rect x="${x1}" y="${y}" width="${x2 - x1}" height="66" rx="16" fill="url(#g${id})"/>
     <text x="${x1 + 24}" y="${y + 45}" ${FONT} font-weight="700" font-size="36" fill="#F7F7F8">${text}</text>`;
  const tick = (x: number, text: string, anchor: 'start' | 'middle' | 'end') =>
    `<line x1="${x}" y1="22" x2="${x}" y2="318" stroke="#3A3A40" stroke-width="2" stroke-dasharray="6 8"/>
     <text x="${x}" y="364" text-anchor="${anchor}" ${FONT} font-size="28" fill="#B9B9C0">${text}</text>`;
  return `<div class="card" data-box><svg class="timeline" viewBox="0 0 740 384" aria-hidden="true">
    ${tick(2, 'First spray', 'start')}${tick(262, '30 minutes', 'middle')}${tick(505, 'A few hours', 'middle')}${tick(738, 'Next day', 'end')}
    <line x1="0" y1="322" x2="740" y2="322" stroke="#8A8A93" stroke-width="3"/>
    ${lane('t', 40, 2, 285, 'Top', 0.55)}
    ${lane('m', 126, 170, 540, 'Middle', 0.7)}
    ${lane('b', 212, 350, 738, 'Base', 0.82)}
  </svg></div>`;
}

const cover = (title: string, sub: string) => `${MARK('cover-mark')}
  <h1 class="h xxl" data-fit="3,64">${title}</h1><p class="p">${esc(sub)}</p>`;

/* ── Perfume strengths explained ───────────────────────────────────────── */

const strengthScene = (s: Strength, i: number) => ({
  id: `strength-${i + 1}`,
  html: `<p class="kicker">Strength ${i + 1} of ${STRENGTHS.length}</p>
    <h2 class="h" data-fit="1,52">${esc(s.name)}</h2>
    <p class="abbr" data-fit="1,30">${esc(s.abbr)}</p>
    <div class="card range-card" data-box>
      <p class="label">Perfume oil</p>
      <p class="range">${s.lo} to ${s.hi}%</p>
      ${track(s.lo, s.hi)}
      <div class="lasts"><span class="word">Lasts: ${s.lastsWord}</span><span class="pips">${[1, 2, 3, 4].map((n) => `<i class="${n <= s.lasts ? 'on' : ''}"></i>`).join('')}</span></div>
    </div>
    <div class="pick"><p class="label">Choose it for</p><p class="text" data-fit="2,34">${esc(s.choose)}</p></div>`,
});

export const STRENGTHS_VIDEO = {
  folder: 'explainer-video-perfume-strengths',
  file: 'perfume-strengths-9x16.mp4',
  spec: {
    id: 'perfume-strengths',
    theme: VIDEO_TEMPLATE.informative.theme,
    scenes: [
      { id: 'cover', seconds: 3.4 },
      { id: 'idea', seconds: 3.8, transition: 'swipe' },
      { id: 'strength-1', seconds: 3.8, transition: 'dissolve' },
      { id: 'strength-2', seconds: 3.8, transition: 'swipe' },
      { id: 'strength-3', seconds: 3.8, transition: 'dissolve' },
      { id: 'strength-4', seconds: 3.8, transition: 'swipe' },
      { id: 'rule', seconds: 3.8, transition: 'dissolve' },
      OUTRO_SCENE('swipe', 2.8),
    ],
  } as VideoSpec,
  scenes: (): { id: string; html: string }[] => [
    { id: 'cover', html: cover('Perfume strengths <em>explained</em>', 'EDC, EDT, EDP and Parfum') },
    {
      id: 'idea',
      html: `<p class="kicker">The idea</p>
        <h2 class="h" data-fit="2,60">How much oil is in the bottle</h2>
        <p class="p">More oil usually means a scent that lasts longer.</p>
        ${ladderCard()}`,
    },
    ...STRENGTHS.map(strengthScene),
    {
      id: 'rule',
      html: `<p class="kicker">Good to know</p>
        <h2 class="h" data-fit="2,60">A rule of thumb, not a rule</h2>
        <div class="list">${tickItem('No law fixes the figures. Each house decides what goes on the box.')}${tickItem('An EDT and an EDP of one name can smell different.')}</div>`,
    },
    { id: 'outro', html: outroHtml() },
  ],
  caption: `Perfume strengths explained 🇬🇧

EDC, EDT, EDP and Parfum are all about how much perfume oil is in the bottle. Roughly, Eau de Cologne is 2 to 5 per cent, Eau de Toilette 5 to 15, Eau de Parfum 15 to 20 and Parfum or Extrait 20 to 30. More oil usually means a scent that lasts longer, and a higher price for the same size.

Those figures are a rule of thumb. No law fixes them, so one house's EDT can last longer than another's EDP. Our guide has more on choosing a strength for the weather and the occasion.

The link is in our bio, or go to ${SITE}/guides/perfume-strengths-explained`,
};

/* ── What are perfume notes? ───────────────────────────────────────────── */

const layerScene = (l: NoteLayer) => ({
  id: `layer-${l.layer}`,
  html: `${layerIcon(l.layer)}
    <p class="kicker">${esc(l.kicker)}</p>
    <h2 class="h" data-fit="1,52">${esc(l.title)}</h2>
    <div class="chips">${l.examples.map((e) => `<span class="chip" data-box>${esc(e)}</span>`).join('')}</div>
    <p class="p" data-fit="4,34">${esc(l.text)}</p>`,
});

export const NOTES_VIDEO = {
  folder: 'explainer-video-perfume-notes',
  file: 'perfume-notes-9x16.mp4',
  spec: {
    id: 'perfume-notes',
    theme: VIDEO_TEMPLATE.informative.theme,
    scenes: [
      { id: 'cover', seconds: 3.4 },
      { id: 'layers', seconds: 4.0, transition: 'swipe' },
      { id: 'layer-top', seconds: 3.8, transition: 'dissolve' },
      { id: 'layer-middle', seconds: 3.8, transition: 'swipe' },
      { id: 'layer-base', seconds: 3.8, transition: 'dissolve' },
      { id: 'unfold', seconds: 4.2, transition: 'swipe' },
      { id: 'tip', seconds: 3.8, transition: 'dissolve' },
      OUTRO_SCENE('swipe', 2.8),
    ],
  } as VideoSpec,
  scenes: (): { id: string; html: string }[] => [
    { id: 'cover', html: cover('What are perfume <em>notes?</em>', 'Top, middle and base') },
    {
      id: 'layers',
      html: `<p class="kicker">Three layers, one scent</p>
        <h2 class="h" data-fit="2,60">A perfume is built in layers</h2>
        <p class="p" data-fit="3,34">A note is a scent you can name, like bergamot, rose or vanilla.</p>
        ${pyramidCard()}`,
    },
    ...LAYERS.map(layerScene),
    {
      id: 'unfold',
      html: `<p class="kicker">Over time</p>
        <h2 class="h" data-fit="2,60">How a scent unfolds</h2>
        ${timelineCard()}
        <p class="fine">Roughly. Your skin and the weather change it.</p>`,
    },
    {
      id: 'tip',
      html: `<p class="kicker">Before you buy</p>
        <h2 class="h" data-fit="2,60">Notes are a map, not a promise</h2>
        <div class="list">${tickItem('A notes list is a guide, not a recipe.')}${tickItem('Skin and weather change how it wears.')}${tickItem('Try a small amount first.')}</div>`,
    },
    { id: 'outro', html: outroHtml() },
  ],
  caption: `What are perfume notes? 🇬🇧

Perfumers split a fragrance into 3 layers: "top", "middle" and "base" notes. Top notes are what you smell first, such as citrus and fresh herbs, with bergamot the classic example, and they often fade within the first 30 minutes. Middle notes, the heart, appear as the top fades and last a few hours: think rose and jasmine. Base notes like woods, musk, amber and vanilla last longest and can linger on clothes into the next day.

A notes list is a guide, not a recipe. Your skin and the weather change how a scent wears, and a 10ml or 30ml bottle is a cheaper way to try one before you commit to 100ml. Our guide to how notes work is on the site.

The link is in our bio, or go to ${SITE}/guides/perfume-notes-explained`,
};

export const EXPLAINER_VIDEOS = { strengths: STRENGTHS_VIDEO, notes: NOTES_VIDEO } as const;

const FEED_TAGS = '#perfume #fragrance #perfumetips #ukdeals #pricesniffs';
const TIKTOK_TAGS = '#perfumetok #fragrancetok #perfumetips #ukdeals #pricesniffs';

/** The caption as posted to the feed, and the TikTok one (address instead of "link in bio", TikTok's tags). */
export function captions(v: { caption: string }): { feed: string; tiktok: string } {
  const feed = `${v.caption}\n\n${FEED_TAGS}\n`;
  const tiktok = `${v.caption.replace('The link is in our bio, or go to ', 'See it at ')}\n\n${TIKTOK_TAGS}\n`;
  return { feed, tiktok };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const date = opt('--date') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const only = opt('--only');
  const picked = Object.entries(EXPLAINER_VIDEOS).filter(([key]) => !only || key === only);
  if (!picked.length) throw new Error(`--only takes ${Object.keys(EXPLAINER_VIDEOS).join(' or ')}`);
  for (const [key, v] of picked) {
    const outDir = join(ROOT, 'social', 'posts', `${date}-${v.folder}`);
    mkdirSync(outDir, { recursive: true });
    const report = await renderVideo({ spec: v.spec, scenes: v.scenes(), outDir, file: v.file, extraCss: EXPLAINER_CSS, keepFrames: args.includes('--keep-frames') });
    const c = captions(v);
    writeFileSync(join(outDir, 'caption.txt'), c.feed);
    writeFileSync(join(outDir, 'tiktok-caption.txt'), c.tiktok);
    writeFileSync(
      join(outDir, 'source.md'),
      `# Source

\`${v.file}\` is drawn by \`scripts/social-video-explainers.ts\` from the shared video template
(\`scripts/social-video-template.ts\`; rules in \`docs/SOCIAL-MEDIA-PLAN.md\` section 9). Every claim is one the
site's own guide makes (\`demo/content/guideBodies.ts\`); \`tests/socialVideoTemplate.test.ts\` holds the figures
to that text. Length ${report.facts.seconds.toFixed(2)} seconds, ${report.facts.frames} frames.
The video is not committed (docs/DECISIONS.md D28). Draw it again with
\`npm run social:render -- social/posts/${date}-${v.folder}\`. The command that first made it:

    npx tsx scripts/social-video-explainers.ts --only ${key} --date ${date}
`,
    );
    recordPictures(outDir, { [v.file]: { make: 'explainer-video', video: key } });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}


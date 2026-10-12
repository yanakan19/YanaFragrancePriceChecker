import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { layoutProblems, loadPage, pageHtml } from '../scripts/social-video-render.js';
import { FORMATS, layoutOf, puzzleHtml, type PuzzleView } from '../scripts/social-guess-html.js';
import { hiddenAnswerWords, planPuzzleText } from '../scripts/social-guess-mask.js';
import {
  ANSWER_FILL,
  GUESS_PUZZLE_VIDEO,
  GUESS_REVEAL_VIDEO,
  GUESS_VIDEO_CSS,
  NOTES_REVEAL,
  fillProgress,
  pictureSceneProblems,
  puzzleExtra,
  puzzleScenes,
  revealExtra,
  revealScenes,
  tierProgress,
  type RevealVideoData,
} from '../scripts/social-video-guess.js';
import { VIDEO_TEMPLATE as T, buildTimeline, frameState, timelineProblems, type FrameState, type VideoSpec } from '../scripts/social-video-template.js';

// The Guess the Fragrance videos (docs/GUESS-THE-FRAGRANCE-PLAN.md section 6): a 10 second puzzle video and a
// 10 second reveal video. Held here: the owner's timing rules (a still start, no transition over half a second,
// the PriceSniffs ending and its one second fade, ten seconds in all), the words inside the safe box in every
// scene, the answer never in a puzzle video, and the same frames from two renders.
const FPS = T.fps;
const VIDEOS: [string, VideoSpec, (t: number) => unknown][] = [
  ['puzzle', GUESS_PUZZLE_VIDEO, puzzleExtra],
  ['reveal', GUESS_REVEAL_VIDEO, revealExtra],
];
const frameTimes = (total: number) => Array.from({ length: Math.round(total * FPS) }, (_, i) => i / FPS);

describe.each(VIDEOS)('%s video: the timing rules', (_name, spec, extra) => {
  const tl = buildTimeline(spec);
  const key = (t: number) => JSON.stringify({ l: frameState(tl, t).layers, v: frameState(tl, t).veil, x: extra(t) });

  it('obeys every rule the template checks and lasts 10 seconds, plus or minus one frame', () => {
    expect(timelineProblems(tl)).toEqual([]);
    expect(Math.abs(tl.total - T.guess.totalSeconds)).toBeLessThanOrEqual(1 / FPS + 1e-9);
    expect(tl.frames).toBe(300);
    expect(spec.theme).toBe('standard');
    expect(tl.scenes[tl.scenes.length - 1]!.id).toBe('outro');
  });

  it('opens on a still: every frame before the first transition is identical, and the first has no animation', () => {
    const firstTransition = tl.transitions[0]!.start;
    expect(firstTransition).toBeGreaterThanOrEqual(1);
    const first = frameState(tl, 0);
    expect(first.layers.filter((l) => l.visible).map((l) => l.id)).toEqual([tl.scenes[0]!.id]);
    expect(first.layers[0]!.scale).toBe(1);
    expect(first.layers[0]!.x).toBe(0);
    expect(first.veil).toBe(0);
    // Nothing at all changes until the first change: at least a second, and for the puzzle the whole of its first 3 seconds.
    const changed = frameTimes(tl.total).find((t) => key(t) !== key(0))!;
    expect(changed).toBeGreaterThanOrEqual(_name === 'puzzle' ? 3 - 1e-9 : 1 - 1e-9);
    expect(changed).toBeLessThanOrEqual(firstTransition + 1 / FPS);
  });

  it('joins scenes by dissolves of at most half a second, measured from the frames', () => {
    expect(tl.transitions.length).toBe(tl.scenes.length - 1);
    for (const tr of tl.transitions) {
      expect(tr.seconds, `${tr.kind} into ${tr.to}`).toBeLessThanOrEqual(0.5);
      const incoming = (t: number) => frameState(tl, t).layers.find((l) => l.id === tr.to)!;
      if (tr.kind === 'swipe') {
        expect(incoming(tr.end).x).toBe(0);
      } else {
        expect(incoming(tr.start).opacity).toBe(0);
        expect(incoming(tr.end).opacity).toBe(1);
        // The slight zoom: both scenes shrink together mid dissolve and are full size again at both ends.
        const mid = (tr.start + tr.end) / 2;
        const out = (t: number) => frameState(tl, t).layers.find((l) => l.id === tr.from)!;
        expect(incoming(mid).scale).toBeCloseTo(T.guess.dip, 4);
        expect(out(mid).scale).toBeCloseTo(T.guess.dip, 4);
        expect(incoming(tr.start).scale).toBe(1);
        expect(incoming(tr.end).scale).toBe(1);
      }
    }
    // Outside a transition nothing slides, fades or zooms.
    for (const t of frameTimes(tl.total)) {
      if (tl.transitions.some((tr) => t >= tr.start - 1e-9 && t <= tr.end + 1e-9)) continue;
      for (const l of frameState(tl, t).layers.filter((l) => l.visible)) {
        expect([l.x, l.opacity, l.scale], `${l.id} at ${t}`).toEqual([0, 1, 1]);
      }
    }
  });

  it('never zooms in past full size or slides: nothing can leave the safe box in a transition', () => {
    for (const t of frameTimes(tl.total)) {
      for (const l of frameState(tl, t).layers.filter((l) => l.visible)) {
        expect(l.scale, `${l.id} at ${t}`).toBeLessThanOrEqual(1);
        expect(l.scale, `${l.id} at ${t}`).toBeGreaterThanOrEqual(0.95);
        expect(l.x, `${l.id} at ${t}`).toBe(0);
      }
    }
  });

  it('ends on the PriceSniffs mark alone, held at least 1.2 s, then a one second fade to the background', () => {
    const outro = tl.scenes[tl.scenes.length - 1]!;
    expect(tl.fadeStart).toBeCloseTo(tl.total - 1, 6);
    const holdFrom = outro.start + outro.arrives;
    expect(tl.fadeStart - holdFrom).toBeGreaterThanOrEqual(T.outro.minHoldSeconds - 1e-9);
    for (const t of frameTimes(tl.total).filter((x) => x >= holdFrom && x <= tl.fadeStart)) {
      const st: FrameState = frameState(tl, t);
      expect(st.layers.filter((l) => l.visible).map((l) => l.id)).toEqual(['outro']);
      expect(st.veil).toBe(0);
    }
    expect(frameState(tl, tl.fadeStart).veil).toBe(0);
    expect(frameState(tl, tl.total - 1 / FPS).veil).toBeGreaterThan(0.99);
    expect(frameState(tl, tl.total).veil).toBe(1);
  });
});

describe('the notes reveal and the answer dissolve', () => {
  it('shows no note before the Top notes start, then Top, Heart and Base 0.4 s apart, then all', () => {
    expect(NOTES_REVEAL.step).toBe(0.4);
    expect(NOTES_REVEAL.risePx).toBe(8);
    const tl = buildTimeline(GUESS_PUZZLE_VIDEO);
    const notes = tl.scenes.find((s) => s.id === 'notes')!;
    expect(NOTES_REVEAL.first).toBeGreaterThanOrEqual(notes.start + notes.arrives);
    for (const t of frameTimes(tl.total).filter((x) => x < NOTES_REVEAL.first)) expect(tierProgress(t)).toEqual({ top: 0, middle: 0, base: 0 });
    for (const t of frameTimes(tl.total)) {
      const p = tierProgress(t);
      expect(p.top).toBeGreaterThanOrEqual(p.middle);
      expect(p.middle).toBeGreaterThanOrEqual(p.base);
    }
    expect(tierProgress(NOTES_REVEAL.first + 0.1).middle).toBe(0);
    expect(tierProgress(NOTES_REVEAL.first + 0.4 + 0.1).base).toBe(0);
    expect(tierProgress(NOTES_REVEAL.first + 0.4 + 0.1).middle).toBeGreaterThan(0);
    expect(tierProgress(NOTES_REVEAL.first + 2 * 0.4 + NOTES_REVEAL.seconds)).toEqual({ top: 1, middle: 1, base: 1 });
    // All shown well before the scene is left, so the notes can be read.
    expect(notes.end - (notes.arrives === 0 ? 0 : 0.5) - (NOTES_REVEAL.first + 0.8 + NOTES_REVEAL.seconds)).toBeGreaterThanOrEqual(1.5);
  });

  it('dissolves the dashes to the letters once, after the opening still, and holds them before the next scene', () => {
    const tl = buildTimeline(GUESS_REVEAL_VIDEO);
    expect(ANSWER_FILL.seconds).toBeLessThanOrEqual(0.5);
    expect(ANSWER_FILL.from).toBeGreaterThanOrEqual(T.openingStillSeconds);
    expect(fillProgress(0)).toBe(0);
    expect(fillProgress(ANSWER_FILL.from + ANSWER_FILL.seconds)).toBe(1);
    let previous = 0;
    for (const t of frameTimes(tl.total)) {
      const f = fillProgress(t);
      expect(f).toBeGreaterThanOrEqual(previous);
      previous = f;
    }
    expect(tl.transitions[0]!.start - (ANSWER_FILL.from + ANSWER_FILL.seconds)).toBeGreaterThanOrEqual(1);
  });
});

/* ── pictures and videos in a browser ─────────────────────────────────── */

const ICON = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#D9363E"/></svg>').toString('base64');
const note = (tier: 'top' | 'middle' | 'base', name: string) => ({ tier, name, src: ICON, group: false });
const FULL = [
  ...['Apple', 'Blackcurrant', 'Pineapple', 'Italian Bergamot'].map((n) => note('top', n)),
  ...['Rose', 'Dry Birch', 'Moroccan Jasmine', 'Patchouli'].map((n) => note('middle', n)),
  ...['Oakmoss', 'Musk', 'Ambergris', 'Vanilla'].map((n) => note('base', n)),
];
const LONGEST = [
  ...['Orange Flower Heart Absolute', 'Abstract White Floral Accord', 'Hexamethylindanopyran', 'Reggio Di Calabria Bergamot'].map((n) => note('top', n)),
  ...['Blooming Rose Souffle Accord', 'Yellow Mandarin Italy Orpur', 'Jasmine Samac Absolut India', 'Accord Bergamot Italy Orpur'].map((n) => note('middle', n)),
  ...['Intoxicating Patchouli Heart', 'Mediterranean Fruity Basket', 'New Caledonian Sandalwood', 'Lily Of The Valley'].map((n) => note('base', n)),
];
const TALL = FORMATS.find((f) => f.kind === 'tall')!;

function puzzle(brand: string, name: string, notes: PuzzleView['notes']) {
  const text = planPuzzleText(brand, name);
  if (!text.ok) throw new Error(text.reason);
  const view: PuzzleView = { house: text.houseWords, name: text.nameWords, concentration: 'Eau de Parfum', notes };
  return { brand, name, html: puzzleHtml(view, layoutOf(text)!, TALL) };
}
const PUZZLES = {
  typical: puzzle('Creed', 'Aventus', FULL),
  threeWordHouse: puzzle('Jean Paul Gaultier', 'Le Male', FULL),
  longestNotes: puzzle('Pierre Guillaume Paris', 'Numbered Collection 11.1 Indian Wood', LONGEST),
  twoTiers: puzzle('Dior', 'Sauvage', [...FULL.slice(0, 4), ...FULL.slice(8)]),
};

const PHOTO = 'data:image/png;base64,' + Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64');
const REVEALS: Record<string, RevealVideoData> = {
  typical: { brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', size: '100ml', photo: PHOTO, price: { amount: '£259.00', shop: 'Perfumoi', checked: '10:14 UK, 12 Oct 2026' } },
  longest: {
    brand: 'Maison Francis Kurkdjian',
    name: 'Baccarat Rouge 540 Extrait de Parfum Intense',
    concentration: 'Extrait de Parfum',
    size: '200ml',
    photo: PHOTO,
    price: { amount: '£1,259.00', shop: 'The Perfume Shop and Beauty Boutique Online', checked: '10:14 UK, 12 Oct 2026' },
  },
  sixWordName: { brand: 'Jean Paul Gaultier', name: 'Abcde Fghij Klmno Pqrst Uvwx Yz', concentration: 'Eau de Cologne', size: '30ml', photo: PHOTO, price: { amount: '£9.99', shop: 'Fragrance Click', checked: '10:14 UK, 12 Oct 2026' } },
  noPhotoNoPrice: { brand: 'Dior', name: 'Sauvage', concentration: 'Parfum', size: '', photo: null, price: null },
};

let browser: Browser;
beforeAll(async () => {
  browser = await launchChromium();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

describe('the puzzle video: every word inside the safe box in every scene', () => {
  for (const [name, p] of Object.entries(PUZZLES)) {
    it(`${name}: the picture scenes (notes hidden and shown) and the end card`, async () => {
      const bad = await layoutProblems(browser, GUESS_PUZZLE_VIDEO, puzzleScenes(p.html), GUESS_VIDEO_CSS, pictureSceneProblems);
      expect(bad).toEqual([]);
    }, 60_000);
  }

  it('keeps the footer of the picture scenes on or above y 1460', async () => {
    const page = await loadPage(browser, pageHtml(GUESS_PUZZLE_VIDEO, puzzleScenes(PUZZLES.longestNotes.html), GUESS_VIDEO_CSS));
    try {
      const bottoms = (await page.evaluate(`['pic-puzzle', 'pic-notes'].map((id) => {
        const foot = document.getElementById(id).contentDocument.querySelector('.foot');
        return Math.max(...[...foot.children].map((c) => c.getBoundingClientRect().bottom));
      })`)) as number[];
      for (const b of bottoms) expect(b).toBeLessThanOrEqual(T.safe.bottom + 0.5);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('would catch a word outside the box', async () => {
    const moved = PUZZLES.typical.html.replace('</style>', '.foot{position:relative;top:40px}</style>');
    const bad = await layoutProblems(browser, GUESS_PUZZLE_VIDEO, puzzleScenes(moved), GUESS_VIDEO_CSS, pictureSceneProblems);
    expect(bad.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('the reveal video: every word inside the safe box in every scene', () => {
  for (const [name, data] of Object.entries(REVEALS)) {
    it(name, async () => {
      expect(await layoutProblems(browser, GUESS_REVEAL_VIDEO, revealScenes(data), GUESS_VIDEO_CSS)).toEqual([]);
    }, 60_000);
  }

  it('says the answer, the strength and size, the price, the shop, the delivery note, the warning and the address', () => {
    const html = revealScenes(REVEALS.typical!).map((s) => s.html).join(' ');
    const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').split(/<[^>]+>/).map((t) => t.trim()).filter(Boolean).join(' | ');
    for (const piece of ['The answer', 'Guess the', 'Fragrance', 'Aventus', 'Creed', 'Eau de Parfum', '100ml', 'Cheapest price', '£259.00', 'from Perfumoi', 'Price includes delivery, checked 10:14 UK, 12 Oct 2026', 'Prices change, so check before you buy.', 'pricesniffs.space']) {
      expect(text, piece).toContain(piece);
    }
    expect(text).not.toMatch(/[-‐-―−]/);
    expect(html).toContain('<img src="data:image/png');
  });

  it('draws the dashes and the letters of one answer in the same place: the same first letters, the same lines', () => {
    const html = revealScenes(REVEALS.longest!)[0]!.html;
    const masks = [...html.matchAll(/<div class="blk mask"[^>]*>([\s\S]*?)<\/div><div class="blk full"[^>]*>([\s\S]*?)<\/div><\/div>/g)];
    expect(masks).toHaveLength(2);
    for (const m of masks) {
      expect((m[1]!.match(/class="ln"/g) ?? []).length).toBe((m[2]!.match(/class="ln"/g) ?? []).length);
    }
  });
});

describe('the puzzle video never shows the answer', () => {
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /** Every text node and attribute value on the page and inside every frame of it, as a viewer's tools could read them. */
  async function everything(page: Page): Promise<string> {
    return (await page.evaluate(`(() => {
      const out = [];
      const walk = (doc) => {
        for (const el of doc.querySelectorAll('*')) {
          for (const a of el.attributes) if (!/^(style|class|data:)/.test(a.value) && a.name !== 'srcdoc' && !a.value.startsWith('data:')) out.push(a.name + '=' + a.value);
          if (el.tagName === 'IFRAME' && el.contentDocument) walk(el.contentDocument);
          if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') for (const n of el.childNodes) if (n.nodeType === 3) out.push(n.textContent);
        }
        out.push(doc.title);
      };
      walk(document);
      return out.join(' ');
    })()`)) as string;
  }

  for (const [name, p] of Object.entries(PUZZLES)) {
    it(`${name}: no word of the house or the name on any scene, in text or in any attribute`, async () => {
      const page = await loadPage(browser, pageHtml(GUESS_PUZZLE_VIDEO, puzzleScenes(p.html), GUESS_VIDEO_CSS));
      try {
        const seen: string[] = [];
        for (const t of [0, 3.25, 4.1, 5.5, 8.5, 9.6]) {
          const tl = buildTimeline(GUESS_PUZZLE_VIDEO);
          const st = { ...frameState(tl, t), extra: puzzleExtra(t) };
          await page.evaluate(`window.__apply(${JSON.stringify(st)})`);
          seen.push(await everything(page));
        }
        const text = ` ${norm(seen.join(' '))} `;
        const answer = hiddenAnswerWords(p.brand, p.name);
        expect(answer.length).toBeGreaterThan(0);
        for (const w of answer) expect(text, w).not.toContain(` ${w} `);
        for (const w of norm(`${p.brand} ${p.name}`).split(' ').filter((x) => x.length >= 5)) expect(text, w).not.toContain(w);
      } finally {
        await page.close();
      }
    }, 60_000);
  }

  // A puzzle folder is committed only when posting; when there is one, its answer is held to the same rule.
  const POSTS = new URL('../social/posts/', import.meta.url).pathname;
  const folders = readdirSync(POSTS).filter((n) => /-guess-fragrance-\d+$/.test(n) && statSync(join(POSTS, n)).isDirectory());
  for (const folder of folders) {
    it(`${folder}: the video's page holds no word of check.json's answer`, () => {
      const dir = join(POSTS, folder);
      if (!existsSync(join(dir, 'guess-9x16.html')) || !existsSync(join(dir, 'check.json'))) return;
      const check = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')) as { answer: { brand: string; name: string } };
      const page = puzzleScenes(readFileSync(join(dir, 'guess-9x16.html'), 'utf8')).map((s) => s.html).join(' ');
      const unescaped = page.replace(/data:[^"')\s]+/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const visible = norm(unescaped.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
      for (const w of hiddenAnswerWords(check.answer.brand, check.answer.name)) expect(` ${visible} `, w).not.toContain(` ${w} `);
    });
  }
});

describe('determinism', () => {
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

  async function frames(spec: VideoSpec, scenes: { id: string; html: string }[], extra: (t: number) => unknown, times: number[]): Promise<string[]> {
    const tl = buildTimeline(spec);
    const page = await loadPage(browser, pageHtml(spec, scenes, GUESS_VIDEO_CSS));
    try {
      const out: string[] = [];
      for (const t of times) {
        await page.evaluate(`window.__apply(${JSON.stringify({ ...frameState(tl, t), extra: extra(t) })})`);
        out.push(hash(await page.screenshot({ type: 'png' })));
      }
      return out;
    } finally {
      await page.close();
    }
  }

  it('draws the same puzzle frames twice, from two page loads', async () => {
    const times = [0, 1.5, 3.25, 4.0, 4.4, 5.5, 7.5, 8.4, 9.5, 9.9];
    const scenes = puzzleScenes(PUZZLES.typical.html);
    const a = await frames(GUESS_PUZZLE_VIDEO, scenes, puzzleExtra, times);
    const b = await frames(GUESS_PUZZLE_VIDEO, scenes, puzzleExtra, times);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(8);
  }, 120_000);

  it('draws the same reveal frames twice, from two page loads', async () => {
    const times = [0, 1.2, 1.4, 2.0, 3.0, 4.0, 5.0, 6.5, 8.4, 9.5];
    const scenes = revealScenes(REVEALS.typical!);
    const a = await frames(GUESS_REVEAL_VIDEO, scenes, revealExtra, times);
    const b = await frames(GUESS_REVEAL_VIDEO, scenes, revealExtra, times);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(8);
  }, 120_000);

  it('moves the notes by transform and opacity only, 8 px, and leaves the dashed lines alone', async () => {
    const tl = buildTimeline(GUESS_PUZZLE_VIDEO);
    const page = await loadPage(browser, pageHtml(GUESS_PUZZLE_VIDEO, puzzleScenes(PUZZLES.typical.html), GUESS_VIDEO_CSS));
    try {
      const read = async (t: number) => {
        await page.evaluate(`window.__apply(${JSON.stringify({ ...frameState(tl, t), extra: puzzleExtra(t) })})`);
        return (await page.evaluate(`(() => {
          const doc = document.getElementById('pic-notes').contentDocument;
          return {
            notes: [...doc.querySelectorAll('.n')].map((n) => ({ tier: n.closest('.box').querySelector('.tier').textContent, style: n.getAttribute('style'), top: n.getBoundingClientRect().top })),
            words: doc.querySelector('.words').outerHTML,
            wordsBox: JSON.stringify(doc.querySelector('.words').getBoundingClientRect()),
          };
        })()`)) as { notes: { tier: string; style: string | null; top: number }[]; words: string; wordsBox: string };
      };
      const before = await read(3.6);
      const mid = await read(NOTES_REVEAL.first + 0.25);
      const after = await read(6);
      for (const n of before.notes) expect(n.style).toMatch(/^opacity: 0; transform: translateY\(/);
      // Mid way, only Top has begun, and it has risen part of the 8 px.
      expect(mid.notes.filter((n) => n.tier === 'Top').every((n) => Number(/opacity: ([\d.]+)/.exec(n.style!)![1]) > 0)).toBe(true);
      expect(mid.notes.filter((n) => n.tier !== 'Top').every((n) => /opacity: 0;/.test(n.style!))).toBe(true);
      for (const n of after.notes) expect(n.style).toMatch(/^opacity: 1; transform: translateY\(0px\)/);
      // 8 px low while hidden (the picture's own scale makes it a little less in its own units).
      const hiddenTop = before.notes[0]!.top - after.notes[0]!.top;
      expect(hiddenTop).toBeCloseTo(8, 0);
      // The House and Fragrance lines never change.
      expect(mid.words).toBe(before.words);
      expect(after.words).toBe(before.words);
      expect(after.wordsBox).toBe(before.wordsBox);
    } finally {
      await page.close();
    }
  }, 60_000);
});

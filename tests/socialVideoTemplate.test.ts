import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { GUIDE_BODIES } from '../demo/content/guideBodies.js';
import { layoutProblems } from '../scripts/social-video-render.js';
import { EXPLAINER_CSS, EXPLAINER_VIDEOS, LAYERS, STRENGTHS, captions } from '../scripts/social-video-explainers.js';
import {
  DEAL_VIDEO,
  VIDEO_TEMPLATE as T,
  buildTimeline,
  dealScenes,
  frameState,
  timelineProblems,
  type DealVideoData,
  type VideoSpec,
} from '../scripts/social-video-template.js';

// The owner's rules for every Deal of the Day video (2026-10-08), held here so
// a change to the template cannot quietly break them. The numbers live in ONE
// place, VIDEO_TEMPLATE in scripts/social-video-template.ts, and this test
// reads them from there. docs/SOCIAL-MEDIA-PLAN.md section 9 says them in words.
//
//   - exactly 10 seconds
//   - dissolves and a slow zoom in between the scenes
//   - no swipe longer than half a second
//   - the first moment is a still: nothing moves
//   - it ends on "PriceSniffs", then a one second fade out to the background
//   - text inside the safe margins for TikTok and Instagram
// The informative videos use the same transitions and ending, 20 to 30 seconds.

const FPS = T.fps;
const frameTimes = (total: number) => Array.from({ length: Math.round(total * FPS) }, (_, i) => i / FPS);
const VIDEOS: [string, VideoSpec][] = [
  ['deal of the day', DEAL_VIDEO],
  ['perfume strengths', EXPLAINER_VIDEOS.strengths.spec],
  ['perfume notes', EXPLAINER_VIDEOS.notes.spec],
];

describe('video template config', () => {
  it('is vertical 9:16, 1080 x 1920, at a whole number of frames a second', () => {
    expect(T.width).toBe(1080);
    expect(T.height).toBe(1920);
    expect(Number.isInteger(T.fps)).toBe(true);
  });

  it('keeps every transition within half a second, swipes included', () => {
    expect(T.transitions.maxSeconds).toBeLessThanOrEqual(0.5);
    expect(T.transitions.swipeSeconds).toBeGreaterThan(0);
    expect(T.transitions.swipeSeconds).toBeLessThanOrEqual(0.5);
    expect(T.transitions.dissolveSeconds).toBeGreaterThan(0);
    expect(T.transitions.dissolveSeconds).toBeLessThanOrEqual(0.5);
  });

  it('fades out for one second at the end and opens on a still', () => {
    expect(T.outro.fadeOutSeconds).toBe(1);
    expect(T.openingStillSeconds).toBeGreaterThan(0);
    expect(T.zoom.to).toBeGreaterThan(1);
    expect(T.deal.totalSeconds).toBe(10);
  });

  it('keeps the safe box inside the frame and clear of the platform bars', () => {
    // The TikTok photo version's box (social/DESIGN-SYSTEM.md section 4).
    expect(T.safe).toEqual({ left: 110, right: 970, top: 380, bottom: 1460 });
    expect(T.safe.right).toBeLessThanOrEqual(T.width - 90);
    expect(T.safe.top).toBeGreaterThanOrEqual(250);
    expect(T.safe.bottom).toBeLessThanOrEqual(T.height - 250);
  });
});

describe.each(VIDEOS)('%s video timeline', (_name, spec) => {
  const tl = buildTimeline(spec);

  it('obeys every rule the template checks', () => {
    expect(timelineProblems(tl)).toEqual([]);
  });

  it('is a whole number of frames, ends on the PriceSniffs scene and uses only dissolves and swipes', () => {
    expect(Number.isInteger(Math.round(tl.total * FPS * 1000) / 1000)).toBe(true);
    expect(tl.scenes[tl.scenes.length - 1]!.id).toBe('outro');
    expect(tl.transitions.length).toBe(tl.scenes.length - 1);
    for (const t of tl.transitions) expect(['dissolve', 'swipe']).toContain(t.kind);
    expect(tl.transitions.some((t) => t.kind === 'swipe')).toBe(true);
    expect(tl.transitions.some((t) => t.kind === 'dissolve')).toBe(true);
  });

  it('has no transition over half a second, measured from the frames themselves', () => {
    for (const tr of tl.transitions) {
      expect(tr.seconds, `${tr.kind} into ${tr.to}`).toBeLessThanOrEqual(0.5);
      const incoming = (t: number) => frameState(tl, t).layers.find((l) => l.id === tr.to)!;
      if (tr.kind === 'swipe') {
        expect(incoming(tr.start).x).toBe(T.width);
        expect(incoming(tr.end).x).toBe(0);
        expect(incoming(tr.end - 1 / FPS).x).toBeGreaterThan(0);
      } else {
        expect(incoming(tr.start).opacity).toBe(0);
        expect(incoming(tr.end).opacity).toBe(1);
      }
    }
    // Nothing slides or fades except inside a transition.
    for (const t of frameTimes(tl.total)) {
      const inside = tl.transitions.some((tr) => t >= tr.start - 1e-9 && t <= tr.end + 1e-9);
      if (inside) continue;
      for (const l of frameState(tl, t).layers.filter((l) => l.visible)) {
        expect(l.x, `${l.id} at ${t}`).toBe(0);
        expect(l.opacity, `${l.id} at ${t}`).toBe(1);
      }
    }
  });

  it('opens on a still: the first frames are identical and nothing moves for the opening seconds', () => {
    const first = frameState(tl, 0);
    const key = (s: ReturnType<typeof frameState>) => JSON.stringify({ l: s.layers, v: s.veil });
    expect(first.veil).toBe(0);
    expect(first.layers.filter((l) => l.visible).map((l) => l.id)).toEqual([tl.scenes[0]!.id]);
    for (const t of frameTimes(T.openingStillSeconds).filter((x) => x < T.openingStillSeconds)) {
      expect(key(frameState(tl, t)), `frame at ${t}s`).toBe(key(first));
    }
    expect(first.layers[0]!.scale).toBe(1);
    // ...and then the slow zoom begins.
    expect(frameState(tl, T.openingStillSeconds + 0.5).layers[0]!.scale).toBeGreaterThan(1);
  });

  it('zooms in slowly: never out, never past the configured zoom, never faster than 4 per cent a second', () => {
    for (const scene of tl.scenes) {
      let previous = 1;
      for (const t of frameTimes(tl.total).filter((x) => x >= scene.start && x < scene.end)) {
        const scale = frameState(tl, t).layers.find((l) => l.id === scene.id)!.scale;
        expect(scale).toBeGreaterThanOrEqual(previous - 1e-9);
        expect(scale).toBeLessThanOrEqual(T.zoom.to + 1e-9);
        expect((scale - previous) * FPS).toBeLessThan(0.04);
        previous = scale;
      }
    }
  });

  it('ends with PriceSniffs on its own, held, then a one second fade to the background', () => {
    const outro = tl.scenes[tl.scenes.length - 1]!;
    expect(tl.fadeStart).toBeCloseTo(tl.total - 1, 6);
    const holdFrom = outro.start + outro.arrives;
    expect(tl.fadeStart - holdFrom).toBeGreaterThanOrEqual(T.outro.minHoldSeconds - 1e-9);
    // On screen alone, fully opaque and still, from the end of its swipe to the start of the fade.
    for (const t of frameTimes(tl.total).filter((x) => x >= holdFrom && x <= tl.fadeStart)) {
      const state = frameState(tl, t);
      expect(state.layers.filter((l) => l.visible).map((l) => l.id)).toEqual(['outro']);
      expect(state.layers.find((l) => l.id === 'outro')!.opacity).toBe(1);
      expect(state.veil).toBe(0);
    }
    // The fade: nothing at the start, a smooth rise, the background by the last frame.
    expect(frameState(tl, tl.fadeStart).veil).toBe(0);
    expect(frameState(tl, tl.fadeStart + 1 / FPS).veil).toBeGreaterThan(0);
    expect(frameState(tl, tl.total).veil).toBe(1);
    expect(frameState(tl, tl.total - 1 / FPS).veil).toBeGreaterThan(0.99);
    let previous = 0;
    for (const t of frameTimes(tl.total).filter((x) => x >= tl.fadeStart)) {
      const v = frameState(tl, t).veil;
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });
});

describe('video lengths', () => {
  it('a Deal of the Day video is exactly 10 seconds, 300 frames', () => {
    const tl = buildTimeline(DEAL_VIDEO);
    expect(tl.total).toBe(10);
    expect(tl.frames).toBe(300);
    expect(DEAL_VIDEO.theme).toBe(T.deal.theme);
  });

  it('the informative videos run 20 to 30 seconds, in the red explainer theme', () => {
    for (const v of Object.values(EXPLAINER_VIDEOS)) {
      const tl = buildTimeline(v.spec);
      expect(tl.total).toBeGreaterThanOrEqual(T.informative.minSeconds);
      expect(tl.total).toBeLessThanOrEqual(T.informative.maxSeconds);
      expect(v.spec.theme).toBe('inverted');
    }
  });

  it('breaks a rule when a swipe is stretched past half a second', () => {
    const slow = { ...T, transitions: { ...T.transitions, swipeSeconds: 0.6 } } as unknown as typeof T;
    expect(timelineProblems(buildTimeline(DEAL_VIDEO, slow), slow).join(' ')).toMatch(/swipe into/);
  });
});

/* ── the words ─────────────────────────────────────────────────────────── */

const DASHES = /[-‐-―−]/;
const noUrls = (s: string) => s.replace(/https?:\/\/\S+/g, '').replace(/pricesniffs\.space\/\S+/g, '');

/** What a viewer reads in a scene: text outside the style, script and svg, plus an svg's own <text>. */
function visibleWords(html: string): string[] {
  const svgText = [...html.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''));
  const body = html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .split(/<[^>]+>/)
    .map((t) => t.replace(/&amp;/g, '&').trim())
    .filter(Boolean);
  return [...body, ...svgText.map((t) => t.trim())].filter(Boolean);
}

const DEAL: DealVideoData = {
  name: 'Yaa-Umree Eau-de-Parfum',
  sizeMl: 100,
  brand: 'Zimaya – Afnan',
  photo: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>').toString('base64'),
  shop: 'Perfume-Click',
  delivered: 18.85,
  msrp: 45,
  percent: 58,
  dateLabel: 'Thursday, 8 October 2026',
  checked: '02:23 UK, 8 Oct 2026',
};

describe('video copy', () => {
  it('has no hyphens or dashes in anything a viewer reads (social/DESIGN-SYSTEM.md section 5)', () => {
    const scenes = [
      ...dealScenes(DEAL),
      ...EXPLAINER_VIDEOS.strengths.scenes(),
      ...EXPLAINER_VIDEOS.notes.scenes(),
    ];
    for (const s of scenes) {
      expect(visibleWords(s.html).filter((w) => DASHES.test(w)), s.id).toEqual([]);
    }
  });

  it('shows the deal exactly as given: shop, size, both prices, the saving and the date, with delivery and the time checked', () => {
    const words = dealScenes(DEAL).flatMap((s) => visibleWords(s.html)).join(' | ');
    for (const piece of ['£18.85', '£45.00', '58%', 'Perfume Click', '100ml', 'Thursday, 8 October 2026', '02:23 UK, 8 Oct 2026', 'MSRP', 'Cheapest price', 'Prices move during the day', 'check before you buy', 'includes delivery']) {
      expect(words, piece).toContain(piece);
    }
    expect(dealScenes(DEAL).map((s) => s.id)).toEqual(DEAL_VIDEO.scenes.map((s) => s.id));
  });

  it('writes captions with no dashes and at most five hashtags, TikTok versions naming the address', () => {
    for (const v of Object.values(EXPLAINER_VIDEOS)) {
      const c = captions(v);
      for (const text of [c.feed, c.tiktok]) {
        expect(noUrls(text).split('\n').filter((l) => DASHES.test(l))).toEqual([]);
        expect((noUrls(text).match(/#[\p{L}\p{N}_]+/gu) ?? []).length).toBeLessThanOrEqual(5);
      }
      expect(c.feed).toContain('The link is in our bio');
      expect(c.tiktok).not.toContain('in our bio');
      expect(c.tiktok).toContain('pricesniffs.space/guides/');
    }
  });
});

describe('the informative videos match the site guides', () => {
  const text = (slug: string) =>
    GUIDE_BODIES[slug]!.flatMap((b) => (Array.isArray(b.x) ? b.x : [b.x])).join(' ').replace(/\s+/g, ' ');
  const strengths = text('perfume-strengths-explained');
  const notes = text('perfume-notes-explained');

  it('uses the guide\'s own concentration ranges, in the guide\'s order of strength', () => {
    for (const s of STRENGTHS) expect(strengths, s.name).toContain(`roughly ${s.lo} to ${s.hi} per cent`);
    expect(STRENGTHS.map((s) => s.lasts)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < STRENGTHS.length; i++) expect(STRENGTHS[i]!.lo).toBeGreaterThanOrEqual(STRENGTHS[i - 1]!.hi);
    expect(strengths).toContain('lasts longer');
    expect(strengths).toContain('No law fixes them');
    expect(strengths).toContain('one house’s EDT can last longer than another’s EDP');
    expect(strengths).toContain('how much perfume oil is blended');
  });

  it('says what the guide says about when to choose each strength', () => {
    expect(strengths).toContain('For hot days, the office or a first try, an EDT or an EDC is a gentle start.');
    expect(strengths).toContain('often chosen for daytime and warm weather');
    expect(strengths).toContain('For evenings, colder months or a long day, many people prefer an EDP.');
    expect(strengths).toContain('For special occasions, or if you like to wear only a touch, try a Parfum or an Extrait.');
    expect(strengths).toContain('Light and brief');
  });

  it('uses the guide\'s three layers, their examples and how long each lasts', () => {
    expect(LAYERS.map((l) => l.layer)).toEqual(['top', 'middle', 'base']);
    expect(notes).toContain('often within the first half hour');
    expect(notes).toContain('stays for a few hours');
    expect(notes).toContain('linger on clothes into the next day');
    for (const word of ['citrus', 'fresh herbs', 'fruit', 'Flowers, spices and green notes', 'woods, resins, musk, amber']) {
      expect(notes.toLowerCase(), word).toContain(word.toLowerCase());
    }
    expect(notes).toContain('A notes list is a guide, not a recipe.');
    expect(notes).toContain('skin and the weather');
    expect(notes).toContain('trying a small amount first is often wise');
    expect(text('compare-perfume-prices-per-ml')).toContain('A 10ml or 30ml bottle is a cheaper way to try before committing to 100ml');
  });
});

/* ── the layout, in a real browser ─────────────────────────────────────── */

describe('video layout stays inside the safe box', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('keeps the informative videos inside it, even at the end of every zoom', async () => {
    for (const v of Object.values(EXPLAINER_VIDEOS)) {
      expect(await layoutProblems(browser, v.spec, v.scenes(), EXPLAINER_CSS), v.spec.id).toEqual([]);
    }
  }, 60_000);

  it('keeps a Deal of the Day video inside it for a normal deal and for extreme data', async () => {
    const cases: DealVideoData[] = [
      DEAL,
      {
        ...DEAL,
        name: 'Private Key To My Success Extrait De Parfum Intense Nuit',
        brand: 'Maison Francis Kurkdjian Parfums International Collection',
        shop: 'The Fragrance Shop Outlet And Clearance Store Online',
        delivered: 1234.56,
        msrp: 9999.99,
        percent: 88,
        dateLabel: 'Wednesday, 30 September 2026',
        checked: '23:59 UK, 30 Sep 2026',
      },
      { ...DEAL, name: 'Supercalifragilisticexpialidociousfragrancewithoutanyspaces', brand: 'Abcdefghijklmnopqrstuvwxyzabcdef', shop: 'MyBeauty.Boutique.International' },
    ];
    for (const d of cases) expect(await layoutProblems(browser, DEAL_VIDEO, dealScenes(d)), d.name).toEqual([]);
  }, 60_000);

  it('refuses a name too long to show whole, rather than cut it short (the deal script has --name to shorten it)', async () => {
    const absurd = { ...DEAL, name: 'Private Key To My Success Extrait De Parfum Limited Collector Edition Intense Absolu Nuit Noire Special Reserve' };
    expect((await layoutProblems(browser, DEAL_VIDEO, dealScenes(absurd))).join(' ')).toMatch(/text was cut short/);
  }, 60_000);

  it('notices text outside the safe box (so the check can fail)', async () => {
    const bad = await layoutProblems(browser, DEAL_VIDEO, [
      ...dealScenes(DEAL).slice(0, 3),
      { id: 'outro', html: '<p style="font-size:60px;white-space:nowrap;margin:0">A line far too long to fit inside the safe margins of a phone screen</p>' },
    ]);
    expect(bad.join(' ')).toMatch(/outside the safe box/);
  }, 60_000);
});

/* ── the videos that are committed ─────────────────────────────────────── */

const POSTS = new URL('../social/posts/', import.meta.url).pathname;

/** The container's own length, read from the movie header (no ffprobe on the build machines). */
function mp4Seconds(file: string): number {
  const buf = readFileSync(file);
  const at = buf.indexOf('mvhd');
  if (at < 0) throw new Error(`${file} has no movie header`);
  const base = at + 4;
  expect(buf[base], 'movie header version').toBe(0);
  const timescale = buf.readUInt32BE(base + 12);
  return buf.readUInt32BE(base + 16) / timescale;
}

describe('committed template videos', () => {
  // Since 2026-10-08 (docs/DECISIONS.md D28) the videos are not committed: these run only on a
  // folder where `npm run social:render` has drawn the file. tests/socialPictures.test.ts holds
  // the length and size recorded in each post's pictures.json to the same rules.
  const folders = existsSync(POSTS) ? readdirSync(POSTS).filter((n) => statSync(join(POSTS, n)).isDirectory()) : [];
  const deals = folders.filter((n) => /-deal-video-/.test(n));
  const explainers = folders.filter((n) => /-explainer-video-/.test(n));

  for (const folder of deals) {
    const file = join(POSTS, folder, 'deal-video-9x16.mp4');
    it.runIf(existsSync(file))(`${folder} is exactly 10 seconds and under ${T.encode.maxMegabytes} MB`, () => {
      expect(mp4Seconds(file)).toBeCloseTo(10, 2);
      expect(statSync(file).size).toBeLessThan(T.encode.maxMegabytes * 1024 * 1024);
    });
  }
  for (const folder of explainers) {
    for (const f of readdirSync(join(POSTS, folder)).filter((n) => n.endsWith('-9x16.mp4'))) {
      it(`${folder}/${f} runs 20 to 30 seconds and is under ${T.encode.maxMegabytes} MB`, () => {
        const seconds = mp4Seconds(join(POSTS, folder, f));
        expect(seconds).toBeGreaterThanOrEqual(T.informative.minSeconds);
        expect(seconds).toBeLessThanOrEqual(T.informative.maxSeconds);
        expect(statSync(join(POSTS, folder, f)).size).toBeLessThan(T.encode.maxMegabytes * 1024 * 1024);
      });
    }
  }
});

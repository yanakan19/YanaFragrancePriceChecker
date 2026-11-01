import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { pageHtml } from '../scripts/social-video-render.js';
import { launchCss } from '../scripts/social-video-launch.js';
import { CA_SITES_VIDEO, IN_SITES_VIDEO, PUNCH, SITES_CA, SITES_IN, SITES_US, SITES_VIDEOS, TAG_LINE, US_SITES_VIDEO, punchAt } from '../scripts/social-video-launch-sites.js';
import { VIDEO_TEMPLATE as T, buildTimeline, timelineProblems } from '../scripts/social-video-template.js';

// Owner request, 1 November 2026: three different 10 second launch videos, "we've now got US, India and
// Canada sites" (the US one at /us, India /in, Canada /ca), each with one caption. This file holds what
// needs no crawled data: the words, the layout, the length, the captions and that the three really differ.
// The figures (shops, products, prices) are held to the regions' own data by
// tests/socialLaunchVideosSitesData.test.ts, which runs in the crawl.
const POSTS = join(REPO_ROOT, 'social', 'posts');
const DASHES = /[-‐-―−]/;
const words = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .split(/<[^>]+>/)
    .map((t) => t.replace(/&amp;/g, '&').trim())
    .filter(Boolean);

const VIDEOS = [
  { key: 'us2', video: US_SITES_VIDEO, folder: '2026-11-01-launch-us-2', hook: 'WE’RE NOW IN THE US', opening: 'now-us', address: 'pricesniffs.space/us', hashtag: '#perfumeusa', accent: SITES_US.accent, tax: 'Prices before sales tax' },
  { key: 'in2', video: IN_SITES_VIDEO, folder: '2026-11-01-launch-india-2', hook: 'NOW IN INDIA', opening: 'now-in', address: 'pricesniffs.space/in', hashtag: '#perfumeindia', accent: SITES_IN.accent, tax: 'GST included' },
  { key: 'ca', video: CA_SITES_VIDEO, folder: '2026-11-01-launch-canada', hook: 'HELLO, CANADA', opening: 'hello-ca', address: 'pricesniffs.space/ca', hashtag: '#perfumecanada', accent: SITES_CA.accent, tax: 'Prices before tax' },
] as const;

const text = (v: (typeof VIDEOS)[number]) => v.video.scenes().flatMap((s) => words(s.html));

for (const v of VIDEOS) {
  describe(`launch video ${v.key}: what it says`, () => {
    const onScreen = text(v);
    const joined = onScreen.join(' | ');
    const scenes = v.video.scenes();

    it('ends on the PriceSniffs mark with its own address, and says the owner\'s line', () => {
      expect(scenes[scenes.length - 1]!.id).toBe('outro');
      expect(scenes[scenes.length - 1]!.html).toContain(v.address);
      expect(scenes.map((s) => s.id)).toEqual(v.video.spec.scenes.map((s) => s.id));
      expect(joined).toMatch(/We’ve now got/);
      expect(joined).toContain('Canada');
      expect(joined).toContain(TAG_LINE);
      expect(joined).toContain(v.tax);
    });

    it('has no hyphens or dashes, no "beta" and no link in bio in anything a viewer reads', () => {
      expect(onScreen.filter((w) => DASHES.test(w))).toEqual([]);
      expect(joined).not.toMatch(/beta/i);
      expect(joined).not.toMatch(/\bbio\b/i);
    });

    it('draws no pictures to load: the flag tiles, the site marks, text and shapes only', () => {
      for (const s of scenes) expect(s.html, s.id).not.toMatch(/<img\b|url\(|data:image|https?:\/\//);
    });

    it('is exactly 10 seconds, 300 frames, in the black theme, obeying every template rule', () => {
      const tl = buildTimeline(v.video.spec);
      expect(timelineProblems(tl)).toEqual([]);
      expect(tl.total).toBe(10);
      expect(tl.frames).toBe(300);
      expect(v.video.spec.theme).toBe(T.launch.theme);
    });

    it('opens on a huge capital letter hook, with a short line under it, in the first scene', () => {
      expect(scenes[0]!.id).toBe(v.opening);
      const first = words(scenes[0]!.html);
      expect(first.join(' ').replace(/\s+/g, ' ')).toContain(v.hook);
      expect(scenes[0]!.html).toMatch(/class="hook"/);
      expect(scenes[0]!.html).toMatch(/class="sub"/);
    });

    it('lands the hook with a punch of at most 0.5 s that starts after the still first frame, and rests otherwise', () => {
      const extra = (v.video as { extra?: (t: number) => unknown }).extra;
      expect(extra).toBe(punchAt);
      expect(PUNCH.start).toBe(T.openingStillSeconds);
      expect(PUNCH.seconds).toBeLessThanOrEqual(T.transitions.maxSeconds);
      expect(extra!(0)).toBeNull();
      expect(extra!(PUNCH.start)).toBeNull();
      expect(extra!(PUNCH.start + PUNCH.seconds)).toBeNull();
      expect(extra!(PUNCH.start + PUNCH.seconds / 2)).toEqual({ s: 0.5 });
      const lastFrame = Math.floor((PUNCH.start + PUNCH.seconds) * T.fps - 1e-9);
      expect(lastFrame / T.fps).toBeLessThan(buildTimeline(v.video.spec).scenes[1]!.start);
      expect(scenes[0]!.html).toContain('window.__extra');
    });

    it('keeps its accent colour for its own page styles', () => {
      expect(launchCss(v.key)).toContain(`--accent: ${v.accent}`);
    });
  });

  describe(`launch video ${v.key}: the one caption`, () => {
    const caption = readFileSync(join(POSTS, v.folder, 'caption.txt'), 'utf8').trim();
    it('asks viewers to tag their friends and gives its address once, nothing else', () => {
      expect(caption).toMatch(/Tag your friends who'd love to use our site\./);
      expect(caption.match(/pricesniffs\.space/g)).toHaveLength(1);
      expect(caption).toContain(v.address);
      expect(caption).toContain(v.hashtag);
      expect(caption).toMatch(/US, India and Canada sites/);
    });
    it('names the figures of its video, rounded as the video rounds them', () => {
      const region = v.key === 'us2' ? SITES_US : v.key === 'in2' ? SITES_IN : SITES_CA;
      expect(caption).toContain(region.shopsClaim);
      expect(caption).toContain(region.productsClaim);
    });
  });
}

describe('the three openings are different', () => {
  it('have different hooks, shapes and punches', () => {
    const html = VIDEOS.map((v) => v.video.scenes()[0]!.html);
    expect(new Set(VIDEOS.map((v) => v.hook)).size).toBe(3);
    expect(new Set(html.map((h) => h.match(/window\.__extra=[\s\S]*$/)![0])).size).toBe(3);
    expect(html[0]).toContain('id="us-flash"');
    expect(html[1]).toContain('class="tri"');
    expect(html[2]).toContain('class="sweep"');
  });
  it('lead the captions: the US caption starts with the hook, the others share its first words', () => {
    const first = (f: string) => readFileSync(join(POSTS, f, 'caption.txt'), 'utf8').trim();
    expect(first('2026-11-01-launch-us-2')).toMatch(/^We're now in the US!/);
    expect(first('2026-11-01-launch-canada')).toMatch(/^Hello, Canada!/);
    expect(first('2026-11-01-launch-india-2')).toMatch(/^Why pay full MRP\?/);
  });
});

describe('the three launch videos are different videos, not one with the country swapped', () => {
  const all = VIDEOS.map((v) => ({ v, scenes: v.video.scenes() }));
  it('have different accents, opening scenes, scene orders and transitions', () => {
    expect(new Set(VIDEOS.map((v) => v.accent)).size).toBe(3);
    expect(new Set(all.map((a) => a.scenes[0]!.id)).size).toBe(3);
    expect(new Set(all.map((a) => a.scenes.map((s) => s.id).join('>'))).size).toBe(3);
    expect(new Set(VIDEOS.map((v) => v.video.spec.scenes.map((s) => s.transition ?? '').join('>'))).size).toBeGreaterThanOrEqual(2);
    expect(new Set(VIDEOS.map((v) => buildTimeline(v.video.spec).scenes.map((s) => s.start).join(','))).size).toBe(3);
  });
  it('show different products and different shops', () => {
    const products = [...SITES_US.examples, ...SITES_IN.examples, SITES_CA.ladder].map((e) => `${e.brand} ${e.name} ${e.concentration} ${e.sizeMl}`);
    expect(new Set(products).size).toBe(products.length);
    const shops = [
      ...SITES_US.examples.flatMap((e) => [e.highShop, e.lowShop]),
      ...SITES_IN.examples.map((e) => e.shop),
      ...SITES_CA.ladder.rungs.map((r) => r.shop),
    ];
    // India's two examples share one shop; every other shop is named by one video only.
    expect(new Set(shops).size).toBe(shops.length - 1);
  });
  it('use different headlines and captions word for word', () => {
    const headlines = all.map((a) => words(a.scenes[0]!.html).join(' '));
    expect(new Set(headlines).size).toBe(3);
    const captions = VIDEOS.map((v) => readFileSync(join(POSTS, v.folder, 'caption.txt'), 'utf8').trim());
    expect(new Set(captions.map((c) => c.split('.')[0])).size).toBe(3);
  });
  it('are registered under the keys the renderer and pictures.json use', () => {
    expect(Object.keys(SITES_VIDEOS).sort()).toEqual(['ca', 'in2', 'us2']);
    for (const v of VIDEOS) {
      const rec = JSON.parse(readFileSync(join(POSTS, v.folder, 'pictures.json'), 'utf8')) as { pictures: { file: string; make: string; video: string; seconds: number }[] };
      expect(rec.pictures).toHaveLength(1);
      expect(rec.pictures[0]).toMatchObject({ file: v.video.file, make: 'launch-video', video: v.key, seconds: 10 });
    }
  });
});

describe('launch videos us2, in2 and ca: the layout, in a real browser', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  for (const v of VIDEOS) {
    it(`${v.key}: keeps every card, price and address inside its own box and every headline whole`, async () => {
      const page = await browser.newPage({ viewport: { width: T.width, height: T.height } });
      try {
        await page.setContent(pageHtml(v.video.spec, v.video.scenes(), launchCss(v.key)));
        await page.evaluate('document.fonts.ready');
        const problems = (await page.evaluate(`(() => {
          const out = [];
          for (const el of document.querySelectorAll('.tagrow, .tagrow b, .stat b, .chips span, .row, .rung .top, .vs span, .big, .addr, .stamp, .pair, .pair p, .mrpstamp, .hook, .sub')) {
            if (el.scrollWidth > el.clientWidth + 1) out.push(el.textContent + ' is wider than its box');
          }
          for (const el of document.querySelectorAll('[data-fit]')) {
            if (el.dataset.clamped) out.push(el.textContent + ' was cut short');
          }
          for (const el of document.querySelectorAll('.hook')) {
            if (parseFloat(getComputedStyle(el).fontSize) < 140) out.push(el.textContent + ' is smaller than 140px, not a hook');
          }
          return out;
        })()`)) as string[];
        expect(problems).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  }
});

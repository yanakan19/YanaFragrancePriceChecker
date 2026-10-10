import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { pageHtml } from '../scripts/social-video-render.js';
import { LAUNCH_CSS, LAUNCH_US, US_LAUNCH_VIDEO } from '../scripts/social-video-launch.js';
import { VIDEO_TEMPLATE as T, buildTimeline } from '../scripts/social-video-template.js';
import { US_RETAILERS } from '../src/config/retailers.us.js';

// The US launch video (owner request, 10 October 2026): a short video saying
// PriceSniffs has launched in the US too, with a call to tag friends, and one
// caption for every platform. Every figure on screen is held here to the US
// region's own report and shop config, so the video cannot claim more than the
// site has. The template rules (timeline, still opening, fade, safe box) are
// held for this video by tests/socialVideoTemplate.test.ts.
const FOLDER = join(REPO_ROOT, 'social', 'posts', '2026-10-10-launch-us-video');
const DASHES = /[-‐-―−]/;

interface UsReport {
  products: number;
  shopsPriced: number;
  shops: { id: string; products: number }[];
}
const report = JSON.parse(readFileSync(join(REPO_ROOT, 'data', 'regions', 'us', 'report.json'), 'utf8')) as UsReport;

const scenes = US_LAUNCH_VIDEO.scenes();
/** What a viewer reads: text outside style, script and svg. */
const words = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .split(/<[^>]+>/)
    .map((t) => t.replace(/&amp;/g, '&').trim())
    .filter(Boolean);
const onScreen = scenes.flatMap((s) => words(s.html));

describe('US launch video: what it says', () => {
  it('has the five scenes asked for, ending on the PriceSniffs mark with the address', () => {
    expect(scenes.map((s) => s.id)).toEqual(['launch', 'compare', 'shops', 'tag', 'outro']);
    const text = onScreen.join(' | ');
    for (const piece of ['BETA', 'We’ve launched', 'in the', 'US', 'Compare perfume', 'prices from', '20+', 'US shops', '22,000+', 'products, in dollars', 'Tag your', 'friends', 'who’d love this', 'pricesniffs.space/us']) {
      expect(text, piece).toContain(piece);
    }
    expect(scenes[scenes.length - 1]!.html).toContain('pricesniffs.space/us');
  });

  it('uses the US flag tile and the site marks only: no shop logos, no bottle photos, no pictures at all', () => {
    for (const s of scenes) expect(s.html, s.id).not.toMatch(/<img\b|url\(|data:image|https?:\/\//);
    expect(scenes[0]!.html).toContain('<svg class="flag"');
  });

  it('has no hyphens or dashes in anything a viewer reads', () => {
    expect(onScreen.filter((w) => DASHES.test(w))).toEqual([]);
  });

  it('keeps the shop count and the product count to the figures the carousel used, rounded down', () => {
    expect(LAUNCH_US.shopsClaim).toBe('20+');
    expect(LAUNCH_US.productsClaim).toBe('22,000+');
    expect(LAUNCH_US.minShops).toBe(20);
    expect(LAUNCH_US.minProducts).toBe(22000);
  });
});

describe('US launch video: every claim is true of the US site', () => {
  it('compares at least the shops it claims, and lists at least the products it claims', () => {
    expect(report.shops.filter((s) => s.products > 0).length).toBeGreaterThanOrEqual(LAUNCH_US.minShops);
    expect(report.products).toBeGreaterThanOrEqual(LAUNCH_US.minProducts);
  });

  it('names only US shops that are switched on and have products in the report, spelt as the config spells them', () => {
    expect(LAUNCH_US.shops.length).toBeGreaterThanOrEqual(3);
    for (const shop of LAUNCH_US.shops) {
      const config = US_RETAILERS.find((r) => r.id === shop.id);
      expect(config, `${shop.id} is not in src/config/retailers.us.ts`).toBeDefined();
      expect(config!.enabled, `${shop.name} is switched off`).toBe(true);
      expect(config!.name).toBe(shop.name);
      expect(report.shops.find((r) => r.id === shop.id)?.products ?? 0, `${shop.name} has no products in the report`).toBeGreaterThan(0);
      expect(onScreen, shop.name).toContain(shop.name);
    }
    for (const off of US_RETAILERS.filter((r) => !r.enabled)) expect(onScreen.join(' | '), off.name).not.toContain(off.name);
  });

  it('says prices are in dollars before sales tax, and that it is a beta', () => {
    const text = onScreen.join(' | ');
    expect(text).toContain('in dollars');
    expect(text).toContain('Prices before sales tax');
    expect(text).toContain('BETA');
    expect(text).toContain('This is a beta.');
  });
});

describe('US launch video: the one caption', () => {
  const caption = readFileSync(join(FOLDER, 'caption.txt'), 'utf8').trim();
  it('asks viewers to tag their friends and gives the US address once', () => {
    expect(caption).toMatch(/Tag your friends who'd love to use our site\./);
    expect(caption.match(/pricesniffs\.space\/us/g)).toHaveLength(1);
    expect(caption).not.toMatch(/pricesniffs\.space(?!\/us)/);
  });
  it('carries the same figures as the video, and the four hashtags asked for', () => {
    expect(caption).toContain(LAUNCH_US.shopsClaim);
    expect(caption).toContain(LAUNCH_US.productsClaim);
    expect(caption).toContain('before sales tax');
    for (const tag of ['#perfume', '#fragrance', '#pricesniffs', '#perfumeusa']) expect(caption).toContain(tag);
  });
});

describe('US launch video: the layout, in a real browser', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('keeps every shop name inside its own card and every headline whole', async () => {
    const page = await browser.newPage({ viewport: { width: T.width, height: T.height } });
    try {
      await page.setContent(pageHtml(US_LAUNCH_VIDEO.spec, scenes, LAUNCH_CSS));
      await page.evaluate('document.fonts.ready');
      const problems = (await page.evaluate(`(() => {
        const out = [];
        for (const el of document.querySelectorAll('.names span, .stat b, .addr')) {
          if (el.scrollWidth > el.clientWidth + 1) out.push(el.textContent + ' is wider than its box');
        }
        for (const el of document.querySelectorAll('[data-fit]')) {
          if (el.dataset.clamped) out.push(el.textContent + ' was cut short');
        }
        return out;
      })()`)) as string[];
      expect(problems).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('runs for as long as the owner asked, at 30 frames a second', () => {
    const tl = buildTimeline(US_LAUNCH_VIDEO.spec);
    expect(tl.total).toBeGreaterThanOrEqual(10);
    expect(tl.total).toBeLessThanOrEqual(12);
    expect(Number.isInteger(tl.frames)).toBe(true);
  });
});

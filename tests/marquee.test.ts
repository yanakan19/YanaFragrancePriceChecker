import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { MARQUEE_COPIES, SMALL_WORDS, fragrancesPhrase, marqueeHtml, marqueePhrases } from '../demo/marquee.js';
import { shopsPhrase } from '../demo/head.js';
import { RETAILERS } from '../src/config/retailers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = /[-‐‑‒–—―−﹘﹣－]/;

/**
 * The scrolling word banner under the home page's hero (demo/marquee.ts).
 * Its phrases are claims, so what is tested first is that the two carrying
 * numbers stay strictly true however the counts move.
 */
describe('the marquee phrases', () => {
  const phrases = marqueePhrases(20_839, shopsPhrase(35));

  it('rounds the fragrance count down, so "+" always means more than', () => {
    expect(fragrancesPhrase(20_839)).toBe('20,000+');
    expect(fragrancesPhrase(15_000)).toBe('14,000+');
    expect(fragrancesPhrase(15_001)).toBe('15,000+');
    expect(fragrancesPhrase(4_321)).toBe('4,300+');
    expect(fragrancesPhrase(57)).toBe('50+');
    expect(fragrancesPhrase(7)).toBe('7');
    for (const n of [11, 999, 1001, 9_999, 10_001, 20_839, 123_456]) {
      const stated = Number(fragrancesPhrase(n).replace(/[,+]/g, ''));
      expect(stated, String(n)).toBeLessThan(n);
    }
  });

  it('states shop coverage with the rounding the rest of the site uses', () => {
    expect(phrases[0]).toBe('20,000+ Fragrances Tracked');
    expect(phrases[1]).toBe('More Than 30 UK Shops');
    expect(marqueePhrases(100, shopsPhrase(8))[1]).toBe('8 UK Shops');
  });

  it('is six short Title Case phrases with no hyphens or dashes', () => {
    expect(phrases).toHaveLength(6);
    for (const p of phrases) {
      expect(p, p).not.toMatch(DASH);
      expect(p.length, p).toBeLessThanOrEqual(32);
      // The site's Title Case: every word capitalised but the small words,
      // which stay lowercase unless first.
      p.split(' ').forEach((word, i) => {
        const want = i > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word[0]!.toLowerCase() : word[0]!.toUpperCase();
        expect(word[0], p).toBe(want);
      });
    }
  });

  it('writes the six four times, every copy after the first hidden from screen readers', () => {
    expect(MARQUEE_COPIES).toBe(4);
    const html = marqueeHtml(phrases);
    expect(html.match(/class="marquee-item"/g)).toHaveLength(6 * MARQUEE_COPIES);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(6 * (MARQUEE_COPIES - 1));
  });
});

/**
 * The stylesheet's side of the owner's rules of 2026-10-04: no pause of any
 * kind, one line, the full width of the window, the reduced motion fallback
 * kept. Read from the template, so it holds without a browser.
 */
describe('the marquee stylesheet', () => {
  const css = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
  const block = css.slice(css.indexOf('/* ── marquee'), css.indexOf('/* ── popular rail'));

  it('has no pause of any kind', () => {
    expect(block).not.toMatch(/animation-play-state/);
    expect(block).not.toMatch(/\.marquee[^{]*:(hover|focus|focus-within|active)/);
  });

  it('scrolls by exactly one copy of the phrases out of MARQUEE_COPIES', () => {
    expect(block).toContain(`translateX(-${100 / MARQUEE_COPIES}%)`);
    expect(block).toMatch(/animation: marquee-scroll var\(--pm-duration\) linear infinite/);
  });

  it('never wraps and never shrinks an item', () => {
    expect(block).toMatch(/\.marquee-track \{[^}]*flex-wrap: nowrap/);
    expect(block).toMatch(/\.marquee-item \{[^}]*flex: none/);
    expect(block).toMatch(/\.marquee-item \{[^}]*white-space: nowrap/);
  });

  it('is as wide as the window, less the scrollbar, whatever column it sits in', () => {
    expect(block).toMatch(/width: calc\(100vw - var\(--sbw, 0px\)\)/);
  });

  it('keeps the reduced motion fallback: no movement, wrapping, one copy', () => {
    const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/animation: none/);
    expect(reduced).toMatch(/flex-wrap: wrap/);
    expect(reduced).toMatch(/\.marquee-item\[aria-hidden="true"\] \{ display: none; \}/);
  });

  it('is told the scrollbar width by the app, never left to guess', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    expect(app).toMatch(/setProperty\('--sbw'/);
  });
});

/**
 * How many fragrances the built page carries, read from the catalogue data
 * file it loads (the one demo/index.html names) rather than by importing
 * demo/data.ts, whose 30MB module is more than a test run can always spare.
 * The fragrance entries are the arrays of objects carrying a concentration
 * and an EAN field and no house; the house products the file also holds are
 * not counted, exactly as DEMO_FRAGRANCES does not count them.
 */
function builtFragranceCount(): number {
  const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  const file = /"(data\/catalogue\.[0-9a-f]+\.json)"/.exec(html)![1]!;
  const blobs = JSON.parse(readFileSync(resolve(root, 'demo', file), 'utf8')) as unknown[];
  let count = 0;
  for (const blob of blobs) {
    if (!Array.isArray(blob) || blob.length === 0) continue;
    const first = blob[0] as Record<string, unknown> | null;
    if (first && typeof first === 'object' && 'concentration' in first && 'ean' in first && !('house' in first)) {
      count += blob.length;
    }
  }
  return count;
}

const built = existsSync(resolve(root, 'demo/index.html'));

describe.skipIf(!built)('the marquee on the built home page', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    it(`renders under the hero with six phrases and three hidden copies of them (${reducedMotion} motion)`, async () => {
      const context = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion });
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
        await waitForApp(page);
        // A string, not a function: the tests compile without the DOM
        // library, as tests/priceHistoryLazyBrowser.test.ts does.
        const got = (await page.evaluate(`(() => {
          const m = document.querySelector('.marquee');
          const items = m ? [...m.querySelectorAll('.marquee-item')] : [];
          const track = m && m.querySelector('.marquee-track');
          return {
            after: Boolean(m && m.previousElementSibling && m.previousElementSibling.classList.contains('intro')),
            shown: items.filter((i) => !i.hasAttribute('aria-hidden')).map((i) => i.textContent),
            hidden: items.filter((i) => i.getAttribute('aria-hidden') === 'true').map((i) => i.textContent),
            displayed: items.filter((i) => getComputedStyle(i).display !== 'none').length,
            animation: track ? getComputedStyle(track).animationName : null,
            pageWidth: document.documentElement.scrollWidth,
          };
        })()`)) as {
          after: boolean;
          shown: string[];
          hidden: string[];
          displayed: number;
          animation: string | null;
          pageWidth: number;
        };
        const count = builtFragranceCount();
        expect(count).toBeGreaterThan(0);
        expect(got.after).toBe(true);
        expect(got.shown).toHaveLength(6);
        // The fragrance count, from the catalogue as built. The data file holds
        // every full chunk of 500; a last chunk small enough is left inline in
        // the bundle (scripts/dataFiles.ts moves only literals over a byte
        // threshold), so the page may count up to 499 more than the file.
        const allowed = new Set<string>();
        for (let extra = 0; extra < 500; extra++) allowed.add(`${fragrancesPhrase(count + extra)} Fragrances Tracked`);
        expect(allowed.has(got.shown[0]!), `${got.shown[0]} against ${count} in the data file`).toBe(true);
        // Shop coverage, never more than the shops switched on.
        const shops = /^(?:More Than )?(\d+) UK Shops$/.exec(got.shown[1]!);
        expect(shops, got.shown[1]).not.toBeNull();
        expect(Number(shops![1])).toBeLessThan(RETAILERS.filter((r) => r.enabled).length);
        expect(got.shown.slice(2)).toEqual(marqueePhrases(count, '').slice(2));
        // The hidden copies: the same six, in the same order, three times.
        expect(got.hidden).toEqual([...got.shown, ...got.shown, ...got.shown]);
        expect(got.pageWidth).toBe(375);
        if (reducedMotion === 'reduce') {
          expect(got.animation).toBe('none');
          expect(got.displayed).toBe(6);
        } else {
          expect(got.animation).toBe('marquee-scroll');
          expect(got.displayed).toBe(6 * MARQUEE_COPIES);
        }
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});

interface BandReading {
  left: number;
  right: number;
  clientWidth: number;
  scrollWidth: number;
  scrollX: number;
  lines: number;
  visible: number;
  filled: boolean;
  transform: string;
}

/** Read in the page, as a string: the tests compile without the DOM library. */
const READ_BAND = `(() => {
  const m = document.querySelector('.marquee');
  const box = m.getBoundingClientRect();
  const items = [...m.querySelectorAll('.marquee-item')];
  const root = document.documentElement;
  return {
    left: box.left, right: box.right, clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth, scrollX: window.scrollX,
    lines: new Set(items.map((i) => Math.round(i.getBoundingClientRect().top))).size,
    visible: items.filter((i) => { const r = i.getBoundingClientRect(); return r.right > 0 && r.left < root.clientWidth; }).length,
    filled: items[items.length - 1].getBoundingClientRect().right >= root.clientWidth,
    transform: getComputedStyle(m.querySelector('.marquee-track')).transform,
  };
})()`;

/**
 * In a real browser, at the widths the owner named, in both palettes and in
 * the narrow and the desktop layout: the band is the full width of the page
 * (to the scrollbar's edge, never past it), the page never scrolls sideways,
 * the words stay on one line, they are moving, and resting the pointer on the
 * band does not stop them.
 */
describe.skipIf(!built)('the marquee across screen widths', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  const WIDTHS = [320, 375, 390, 768, 1024, 1440];
  for (const mode of ['dark', 'light'] as const) {
    for (const layout of ['narrow', 'wide'] as const) {
      it(`spans the page, on one line and moving, at every width (${mode}, ${layout} layout)`, async () => {
        for (const width of WIDTHS) {
          const context = await browser.newContext({ viewport: { width, height: 800 } });
          try {
            await context.addInitScript(`try { localStorage.setItem('pricesniffs.display', '${mode}'); } catch (e) {}`);
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
            await waitForApp(page);
            // The layout is chosen from the device; forcing it sets the same
            // attribute the app sets, so the stylesheet cannot tell.
            await page.evaluate(`document.documentElement.setAttribute('data-layout', '${layout === 'narrow' ? 'mobile' : 'desktop'}')`);
            await page.evaluate('window.scrollTo(3000, 0)');
            const first = (await page.evaluate(READ_BAND)) as BandReading;
            const where = `${mode} ${layout} ${width}`;
            expect(first.left, where).toBeCloseTo(0, 0);
            expect(first.right, where).toBeCloseTo(first.clientWidth, 0);
            expect(first.scrollWidth, where).toBe(first.clientWidth);
            expect(first.scrollX, where).toBe(0);
            expect(first.lines, where).toBe(1);
            expect(first.filled, where).toBe(true);
            // Several phrases at once, where there is room for them.
            if (width >= 1024) expect(first.visible, where).toBeGreaterThanOrEqual(4);
            // Moving, and not stopped by the pointer resting on it.
            await page.hover('.marquee');
            await page.waitForTimeout(700);
            const second = (await page.evaluate(READ_BAND)) as BandReading;
            expect(second.transform, where).not.toBe(first.transform);
            const state = await page.evaluate(`getComputedStyle(document.querySelector('.marquee-track')).animationPlayState`);
            expect(state, where).toBe('running');
          } finally {
            await context.close();
          }
        }
      }, 120_000);
    }
  }

  it('under reduced motion stops, wraps, and is still the full width', async () => {
    for (const width of [375, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
        await waitForApp(page);
        const got = (await page.evaluate(`(() => {
          const m = document.querySelector('.marquee');
          const box = m.getBoundingClientRect();
          const items = [...m.querySelectorAll('.marquee-item')].filter((i) => getComputedStyle(i).display !== 'none');
          const track = m.querySelector('.marquee-track');
          return {
            left: box.left, right: box.right, clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            animation: getComputedStyle(track).animationName, wrap: getComputedStyle(track).flexWrap,
            shown: items.length,
          };
        })()`)) as { left: number; right: number; clientWidth: number; scrollWidth: number; animation: string; wrap: string; shown: number };
        expect(got.animation, String(width)).toBe('none');
        expect(got.wrap, String(width)).toBe('wrap');
        expect(got.shown, String(width)).toBe(6);
        expect(got.left, String(width)).toBeCloseTo(0, 0);
        expect(got.right, String(width)).toBeCloseTo(got.clientWidth, 0);
        expect(got.scrollWidth, String(width)).toBe(got.clientWidth);
      } finally {
        await context.close();
      }
    }
  }, 60_000);
});

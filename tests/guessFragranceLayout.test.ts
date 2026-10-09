import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { BRAND_FONT_CSS } from '../scripts/socialRender.js';
import { AA_TEXT, contrastBetween } from '../demo/contrast.js';
import { FORMATS, layoutOf, puzzleHtml, revealHtml, type PuzzleView } from '../scripts/social-guess-html.js';
import { planPuzzleText, maskPhrase } from '../scripts/social-guess-mask.js';

// The puzzle and reveal pictures survive the worst cases (plan 3.4): a three
// word house, a six word name of 32 letters, two note tiers, three full tiers,
// long note names. Nothing may leave the picture or the margins, the logo sits
// flush top right, no text is below the minimum and every text and bar has
// enough contrast against its background.
const ICON = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#D9363E"/></svg>').toString('base64');
const note = (tier: 'top' | 'middle' | 'base', name: string) => ({ tier, name, src: ICON, group: false });
const FULL = [
  ...['Apple', 'Blackcurrant', 'Pineapple', 'Italian Bergamot'].map((n) => note('top', n)),
  ...['Rose', 'Dry Birch', 'Moroccan Jasmine', 'Patchouli'].map((n) => note('middle', n)),
  ...['Oakmoss', 'Musk', 'Ambergris', 'Vanilla'].map((n) => note('base', n)),
];
const LONG_NOTES = [
  ...['Calabrian Bergamot Zest', 'Sicilian Mandarin Peel', 'Pink Pepper Berries', 'Grapefruit Blossom'].map((n) => note('top', n)),
  ...['Turkish Rose Absolute Petals', 'Jasmine Sambac Flower', 'Orange Blossom Water', 'Iris Pallida Root'].map((n) => note('middle', n)),
  ...['Madagascar Vanilla Bean', 'Ambroxan Crystals', 'Cashmere Woods', 'Tonka Bean Absolute'].map((n) => note('base', n)),
];

function view(brand: string, name: string, notes: PuzzleView['notes']): { v: PuzzleView; text: NonNullable<ReturnType<typeof planOk>> } {
  const text = planOk(brand, name)!;
  return { v: { house: text.houseWords, name: text.nameWords, concentration: 'Extrait de Parfum', notes }, text };
}
function planOk(brand: string, name: string) {
  const p = planPuzzleText(brand, name);
  return p.ok ? p : null;
}

const CASES = {
  typical: view('Creed', 'Aventus', FULL),
  threeWordHouse: view('Jean Paul Gaultier', 'Le Male', FULL),
  sixWordName: view('Dior', 'Abcde Fghij Klmno Pqrst Uvwx Yz', FULL),
  maisonFrancis: view('Maison Francis Kurkdjian', 'Baccarat Rouge 540', FULL),
  twoTiers: view('Dior', 'Sauvage', [...FULL.slice(0, 4), ...FULL.slice(8)]),
  longNotes: view('Lancome', 'La Vie Est Belle', LONG_NOTES),
  fiveNotes: view('Dior', 'Sauvage', [...FULL.slice(0, 3), ...FULL.slice(4, 6)]),
};

let browser: Browser;
beforeAll(async () => {
  browser = await launchChromium();
});
afterAll(async () => {
  await browser?.close();
});

interface Box { cls: string; l: number; r: number; t: number; b: number }
interface Measured { boxes: Box[]; logo: Box; groups: Box[]; texts: { text: string; size: number; color: string; bg: string }[]; bars: { color: string; bg: string }[]; scale: number; h1Lines: number; scrollOk: boolean }

async function measure(html: string, w: number, h: number): Promise<Measured> {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html.replace('<head>', `<head><style>${BRAND_FONT_CSS}</style>`));
  await page.evaluate('document.fonts.ready');
  const r = (await page.evaluate(`(() => {
    const rect = (e) => { const b = e.getBoundingClientRect(); return { cls: e.className || e.tagName, l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    const leaves = [...document.querySelectorAll('main *')].filter((e) => !e.closest('svg') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0);
    const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') return c; } return 'rgb(10, 10, 11)'; };
    const textEls = leaves.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const h1 = document.querySelector('h1');
    return {
      boxes: leaves.map(rect),
      logo: rect(document.querySelector('.logo svg, .logo .mark')),
      groups: ['.logo', '.head', '.words, .stage', '.notes', '.foot'].map((s) => document.querySelector(s)).filter(Boolean).map(rect),
      texts: textEls.map((e) => { const cs = getComputedStyle(e); return { text: e.textContent.trim(), size: parseFloat(cs.fontSize) * (document.body.dataset.s ? 1 : 1), color: cs.color, bg: bgOf(e) }; }),
      bars: [...document.querySelectorAll('.w i')].map((i) => ({ color: getComputedStyle(i, '::after').backgroundColor, bg: bgOf(i) })),
      scale: 1,
      h1Lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)),
      scrollOk: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  })()`)) as Measured;
  await page.close();
  return r;
}

const SAFE_3X4 = { l: 72 - 1, r: 1080 - 72 + 1, t: 40, b: 1440 - 40 };
// The 9:16 picture is the 3:4 layout scaled by 0.86 inside the Story and TikTok friendly middle.
const SAFE_9X16 = { l: 110, r: 970, t: 280, b: 1640 };

describe('the puzzle picture on the worst cases', () => {
  for (const [name, c] of Object.entries(CASES)) {
    const layout = layoutOf(c.text);
    it(`${name}: the blanks fit`, () => {
      expect(layout, 'the layout must fit at 48px or more').not.toBeNull();
    });
    for (const f of FORMATS) {
      it(`${name} ${f.file}: inside the safe box, logo flush top right, no overlap, legible`, async () => {
        const m = await measure(puzzleHtml(c.v, layout!, f), f.w, f.h);
        const safe = f.h === 1440 ? SAFE_3X4 : SAFE_9X16;
        for (const b of m.boxes) {
          expect(b.l, `${b.cls} left`).toBeGreaterThanOrEqual(safe.l - 2);
          expect(b.r, `${b.cls} right`).toBeLessThanOrEqual(safe.r + 2);
          expect(b.t, `${b.cls} top`).toBeGreaterThanOrEqual(safe.t - 2);
          expect(b.b, `${b.cls} bottom`).toBeLessThanOrEqual(safe.b + 2);
        }
        // The mark is the right most thing in the first row, flush with the right edge of the content.
        const right = Math.max(...m.boxes.map((b) => b.r));
        expect(m.logo.r).toBeGreaterThanOrEqual(right - 12);
        const top = Math.min(...m.boxes.map((b) => b.t));
        expect(m.logo.t).toBeLessThanOrEqual(top + 12);
        expect(m.h1Lines).toBe(1);
        expect(m.scrollOk).toBe(true);
        // Blocks do not overlap one another.
        const g = [...m.groups].sort((a, b) => a.t - b.t);
        for (let i = 1; i < g.length; i++) expect(g[i]!.t, `block ${i} starts below block ${i - 1}`).toBeGreaterThanOrEqual(g[i - 1]!.b - 1);
        // Minimum sizes and contrast (the 9:16 is scaled 0.86, so 20px becomes 17px: the floor is checked on the 3:4 source).
        for (const t of m.texts) {
          expect(t.size, t.text).toBeGreaterThanOrEqual(20);
          const ratio = contrastBetween(t.color, t.bg);
          expect(ratio, `${t.text} ${t.color} on ${t.bg}`).not.toBeNull();
          expect(ratio!, `${t.text} ${t.color} on ${t.bg}`).toBeGreaterThanOrEqual(AA_TEXT);
        }
        for (const bar of m.bars) expect(contrastBetween(bar.color, bar.bg)!).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('the reveal picture on long data', () => {
  const view = {
    brand: 'Maison Francis Kurkdjian Parfums International Collection',
    name: 'Private Key To My Success Extrait De Parfum Limited Collector Edition Intense Absolu Nuit',
    concentration: 'Extrait de Parfum',
    size: '100ml',
    photo: ICON,
    price: { amount: '£1,234.56', shop: 'The Fragrance Shop Outlet And Clearance Store Online', checked: '14:53 UK, 9 Oct 2026' },
  };
  for (const f of FORMATS) {
    it(`${f.file}: inside the safe box, one line title, legible`, async () => {
      const m = await measure(revealHtml(view, f), f.w, f.h);
      const safe = f.h === 1440 ? SAFE_3X4 : SAFE_9X16;
      for (const b of m.boxes) {
        expect(b.l, `${b.cls} left`).toBeGreaterThanOrEqual(safe.l - 2);
        expect(b.r, `${b.cls} right`).toBeLessThanOrEqual(safe.r + 2);
        expect(b.b, `${b.cls} bottom`).toBeLessThanOrEqual(safe.b + 2);
      }
      expect(m.h1Lines).toBe(1);
      for (const t of m.texts) expect(contrastBetween(t.color, t.bg)!, t.text).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
  it('has no price box text without a price', () => {
    const html = revealHtml({ ...view, price: null, photo: null }, FORMATS[0]!);
    expect(html).toContain('See it at pricesniffs.space');
    expect(html).not.toContain('Cheapest price');
  });
});

describe('the sample helpers', () => {
  it('maskPhrase and layoutOf agree on a one word name', () => {
    expect(maskPhrase('Aventus')).toHaveLength(1);
    expect(layoutOf(planOk('Creed', 'Aventus')!)).not.toBeNull();
  });
});

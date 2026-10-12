import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { BRAND_FONT_CSS } from '../scripts/socialRender.js';
import { AA_TEXT, contrastBetween } from '../demo/contrast.js';
import { FORMATS, SAFE, layoutOf, puzzleHtml, revealHtml, type Format, type PuzzleView } from '../scripts/social-guess-html.js';
import { planPuzzleText, maskPhrase } from '../scripts/social-guess-mask.js';

// The puzzle and reveal pictures survive the worst cases (plan 3.4): a three
// word house, a six word name of 32 letters, two note tiers, three full tiers,
// long note names. Nothing may leave the picture or the margins, the logo sits
// flush top right, no text is below the minimum and every text and bar has
// enough contrast against its background. All three pictures (3:4, 9:16 and
// 1:1) are held to their safe box (SAFE in social-guess-html.ts): the 9:16's is
// TikTok's, y 380 to 1460, so its footer is above y 1460; the 1:1's is
// x 135 to 945, y 90 to 990.
const ICON = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#D9363E"/></svg>').toString('base64');
const note = (tier: 'top' | 'middle' | 'base', name: string) => ({ tier, name, src: ICON, group: false });
const FULL = [
  ...['Apple', 'Blackcurrant', 'Pineapple', 'Italian Bergamot'].map((n) => note('top', n)),
  ...['Rose', 'Dry Birch', 'Moroccan Jasmine', 'Patchouli'].map((n) => note('middle', n)),
  ...['Oakmoss', 'Musk', 'Ambergris', 'Vanilla'].map((n) => note('base', n)),
];
const LONGEST_NOTES = [
  ...['Orange Flower Heart Absolute', 'Abstract White Floral Accord', 'Hexamethylindanopyran', 'Reggio Di Calabria Bergamot'].map((n) => note('top', n)),
  ...['Blooming Rose Souffle Accord', 'Yellow Mandarin Italy Orpur', 'Jasmine Samac Absolut India', 'Accord Bergamot Italy Orpur'].map((n) => note('middle', n)),
  ...['Intoxicating Patchouli Heart', 'Mediterranean Fruity Basket', 'New Caledonian Sandalwood', 'Lily Of The Valley'].map((n) => note('base', n)),
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
  // 12 notes, the 12 longest names a puzzle can show (28 characters, 4 words at most: cleanNotes), one long single word, and the
  // widest blanks of any catalogue product (a three word house and a name that wraps to two lines at the lowest size).
  longestNotes: view('Pierre Guillaume Paris', 'Numbered Collection 11.1 Indian Wood', LONGEST_NOTES),
  longestNotesPlainName: view('Creed', 'Aventus', LONGEST_NOTES),
  threeLineName: view('Bon Parfumeur', '401 cedar plum marmalade vanilla', FULL),
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
interface Measured {
  boxes: Box[];
  /** Pairs of elements that hold text of their own and overlap although neither is inside the other. */
  clashes: string[];
  logo: Box;
  groups: Box[];
  foot: Box[];
  texts: { text: string; size: number; color: string; bg: string }[];
  bars: { color: string; bg: string }[];
  scale: number;
  tiles: number[];
  h1Lines: number;
  h1Fits: boolean;
  scrollOk: boolean;
  clamped: string[];
}

async function measure(html: string, w: number, h: number): Promise<Measured> {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html.replace('<head>', `<head><style>${BRAND_FONT_CSS}</style>`));
  await page.evaluate('document.fonts.ready');
  const r = (await page.evaluate(`(() => {
    const rect = (e) => { const b = e.getBoundingClientRect(); return { cls: String(e.className || e.tagName), l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    const leaves = [...document.querySelectorAll('main *')].filter((e) => !e.closest('svg') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0);
    const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') return c; } return 'rgb(10, 10, 11)'; };
    const textEls = leaves.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const h1 = document.querySelector('h1');
    const main = document.querySelector('main');
    const scale = main.getBoundingClientRect().width / main.offsetWidth;
    return {
      boxes: leaves.map(rect),
      clashes: (() => {
        const out = [];
        const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        for (let i = 0; i < textEls.length; i++) for (let j = i + 1; j < textEls.length; j++) {
          const a = textEls[i], b = textEls[j];
          if (a.contains(b) || b.contains(a)) continue;
          if (ov(a.getBoundingClientRect(), b.getBoundingClientRect())) out.push(String(a.className || a.tagName) + ' "' + a.textContent.trim().slice(0, 20) + '" and ' + String(b.className || b.tagName) + ' "' + b.textContent.trim().slice(0, 20) + '"');
        }
        return out;
      })(),
      logo: rect(document.querySelector('.logo svg, .logo .mark')),
      groups: ['.logo', '.head', '.words, .stage', '.notes', '.foot'].map((s) => document.querySelector(s)).filter(Boolean).map(rect),
      foot: [...document.querySelectorAll('.foot, .cta, .site')].map(rect),
      texts: textEls.map((e) => { const cs = getComputedStyle(e); return { text: e.textContent.trim(), size: parseFloat(cs.fontSize) * scale, color: cs.color, bg: bgOf(e) }; }),
      bars: [...document.querySelectorAll('.w i')].map((i) => ({ color: getComputedStyle(i, '::after').backgroundColor, bg: bgOf(i) })),
      scale,
      tiles: [...document.querySelectorAll('.tile')].map((t) => t.offsetWidth * scale),
      h1Lines: Math.round(h1.getBoundingClientRect().height / scale / parseFloat(getComputedStyle(h1).lineHeight)),
      h1Fits: h1.scrollWidth <= h1.clientWidth + 1,
      scrollOk: document.documentElement.scrollWidth <= window.innerWidth + 1,
      clamped: [...document.querySelectorAll('[data-clamped]')].map((e) => e.textContent.trim()),
    };
  })()`)) as Measured;
  await page.close();
  return r;
}

const TOL = 1.5;
const inside = (b: Box, safe: { l: number; r: number; t: number; b: number }, what: string) => {
  expect(b.l, `${what} ${b.cls} left`).toBeGreaterThanOrEqual(safe.l - TOL);
  expect(b.r, `${what} ${b.cls} right`).toBeLessThanOrEqual(safe.r + TOL);
  expect(b.t, `${what} ${b.cls} top`).toBeGreaterThanOrEqual(safe.t - TOL);
  expect(b.b, `${what} ${b.cls} bottom`).toBeLessThanOrEqual(safe.b + TOL);
};
/** Everything every picture must satisfy, whatever its shape. */
function commonRules(m: Measured, f: Format, what: string) {
  const safe = SAFE[f.kind];
  for (const b of m.boxes) inside(b, safe, what);
  for (const b of m.foot) inside(b, safe, `${what} footer`);
  expect(m.h1Lines, `${what} title lines`).toBe(1);
  expect(m.h1Fits, `${what} title fits its box`).toBe(true);
  expect(m.scrollOk).toBe(true);
  // The mark is the right most thing in the first row, flush with the right edge of the content.
  const right = Math.max(...m.boxes.map((b) => b.r));
  expect(m.logo.r).toBeGreaterThanOrEqual(right - 12);
  const top = Math.min(...m.boxes.map((b) => b.t));
  expect(m.logo.t).toBeLessThanOrEqual(top + 12);
  // Blocks do not overlap one another, and no two pieces of text touch.
  const g = [...m.groups].sort((a, b) => a.t - b.t);
  for (let i = 1; i < g.length; i++) expect(g[i]!.t, `${what} block ${i} starts below block ${i - 1}`).toBeGreaterThanOrEqual(g[i - 1]!.b - 1);
  expect(m.clashes, `${what} overlapping text`).toEqual([]);
  // Minimum sizes (as drawn: the 9:16 is scaled) and contrast.
  for (const t of m.texts) {
    expect(t.size, `${what} ${t.text}`).toBeGreaterThanOrEqual(20);
    const ratio = contrastBetween(t.color, t.bg);
    expect(ratio, `${t.text} ${t.color} on ${t.bg}`).not.toBeNull();
    expect(ratio!, `${t.text} ${t.color} on ${t.bg}`).toBeGreaterThanOrEqual(AA_TEXT);
  }
  for (const bar of m.bars) expect(contrastBetween(bar.color, bar.bg)!).toBeGreaterThanOrEqual(3);
}

describe('the safe boxes', () => {
  it('are TikTok\'s box for the 9:16 and the grid safe square for the 1:1, as the design system says', () => {
    expect(SAFE.tall).toEqual({ l: 110, r: 970, t: 380, b: 1460 });
    expect(SAFE.square).toEqual({ l: 135, r: 945, t: 90, b: 990 });
  });
  it('the formats are 1080 x 1440, 1080 x 1920 and 1080 x 1080, in the file names 3x4, 9x16 and 1x1', () => {
    expect(FORMATS.map((f) => [f.file, f.w, f.h])).toEqual([['3x4', 1080, 1440], ['9x16', 1080, 1920], ['1x1', 1080, 1080]]);
  });
});

describe('the puzzle picture on the worst cases', () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: the blanks fit every shape`, () => {
      for (const f of FORMATS) expect(layoutOf(c.text, f), `${f.file}: the layout must fit at 40px or more`).not.toBeNull();
      expect(layoutOf(c.text), 'the 3:4 (the pick rule) fits at 48px or more').not.toBeNull();
    });
    for (const f of FORMATS) {
      it(`${name} ${f.file}: inside the safe box, logo flush top right, title on one line, no overlap, legible`, async () => {
        const layout = layoutOf(c.text, f)!;
        const m = await measure(puzzleHtml(c.v, layout, f), f.w, f.h);
        commonRules(m, f, `${name} ${f.file}`);
        if (f.kind === 'tall') {
          // The footer, every word of it, is above TikTok's caption line.
          for (const b of m.foot) expect(b.b, `footer ${b.cls} bottom is above y 1460`).toBeLessThanOrEqual(1460 + 0.5);
        }
        // The icon tiles may shrink to fit twelve notes (the --k rule) but never below 40 px as drawn, and no name is cut.
        const floor = f.kind === 'plain' ? 56 : 40;
        for (const t of m.tiles) expect(t, `${name} ${f.file} tile`).toBeGreaterThanOrEqual(floor);
        expect(m.clamped, 'nothing is cut with an ellipsis').toEqual([]);
      });
    }
  }
  it('the square has no small red line (it makes room for twelve notes); the others keep it', () => {
    const layout = (f: Format) => layoutOf(CASES.typical.text, f)!;
    for (const f of FORMATS) {
      expect(puzzleHtml(CASES.typical.v, layout(f), f).includes("Today's puzzle"), f.file).toBe(f.kind !== 'square');
    }
  });
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
  const usual = { ...view, brand: 'Estée Lauder', name: 'White Linen', size: '60ml', price: { amount: '£29.95', shop: 'Fragrance Click', checked: '14:53 UK, 9 Oct 2026' } };
  const cases = { long: view, usual, noPhoto: { ...usual, photo: null }, noPrice: { ...usual, price: null }, noSize: { ...usual, size: '' } };
  for (const [name, v] of Object.entries(cases)) {
    for (const f of FORMATS) {
      it(`${name} ${f.file}: inside the safe box, one line title, no overlap, legible`, async () => {
        const m = await measure(revealHtml(v, f), f.w, f.h);
        commonRules(m, f, `reveal ${name} ${f.file}`);
        if (f.kind === 'tall') for (const b of m.foot) expect(b.b, `footer ${b.cls} bottom is above y 1460`).toBeLessThanOrEqual(1460 + 0.5);
        if (name === 'usual') expect(m.clamped, 'a usual name is never cut').toEqual([]);
      });
    }
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
  it('the square plans its blanks in a narrower words column than the 3:4', () => {
    const t = planOk('Pierre Guillaume Paris', 'Numbered Collection 11.1 Indian Wood')!;
    const wide = layoutOf(t, FORMATS[0])!;
    const square = layoutOf(t, FORMATS[2])!;
    expect(Math.max(square.house.size, square.name.size)).toBeLessThanOrEqual(68);
    expect(wide.name.size).toBeGreaterThanOrEqual(square.name.size);
  });
});

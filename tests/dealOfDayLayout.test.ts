import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '../scripts/a11y-audit.js';
import { BRAND_FONT_CSS } from '../scripts/socialRender.js';
import { FORMATS, postHtml, notesHtml, type Pick } from '../scripts/social-deal-of-day.js';

// The Deal of the Day pictures must survive extreme data (social/DESIGN-SYSTEM.md
// section 7): very long names, brands, shop names and note lists shrink to fit
// their line limits, and nothing leaves the picture or crosses the margins.
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>').toString('base64');

const pick = (name: string, brand: string, shop: string): Pick =>
  ({
    frag: { id: 'x', name, brand, sizeMl: 100, photoUrl: PHOTO },
    best: { retailer: { name: shop } },
    delivered: 1234.56,
    msrp: 9999.99,
    percent: 88,
  }) as unknown as Pick;

const CASES = {
  normal: pick('Yaa Umree', 'Zimaya', 'Perfume Click'),
  long: pick(
    'Private Key To My Success Extrait De Parfum Limited Collector Edition Intense Absolu Nuit',
    'Maison Francis Kurkdjian Parfums International Collection',
    'The Fragrance Shop Outlet And Clearance Store Online',
  ),
  unbroken: pick('Supercalifragilisticexpialidociousfragrancewithoutanyspaces', 'Abcdefghijklmnopqrstuvwxyzabcdef', 'MyBeauty.Boutique.International'),
};

const longNotes = {
  notes: {
    top: ['Bergamot', 'Pink Pepper', 'Mandarin Orange', 'Grapefruit Zest', 'Cardamom Seed', 'Lemon', 'Neroli', 'Elemi'],
    middle: ['Turkish Rose Absolute', 'Jasmine Sambac', 'Orange Blossom', 'Iris Pallida', 'Violet Leaf', 'Geranium'],
    base: ['Madagascar Vanilla', 'Ambroxan', 'Cashmere Wood', 'Patchouli Heart', 'White Musk', 'Tonka Bean', 'Oud'],
    source: 'A Very Long Retailer Name That Goes On And On',
    from: 'own' as const,
  },
  reasons: [],
};

let browser: Browser;
beforeAll(async () => {
  browser = await launchChromium();
});
afterAll(async () => {
  await browser?.close();
});

async function measure(html: string, w: number, h: number) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html.replace('<head>', `<head><style>${BRAND_FONT_CSS}</style>`));
  await page.evaluate('document.fonts.ready');
  const r = (await page.evaluate(`(() => {
    const main = document.querySelector('main');
    const boxes = [...document.querySelectorAll('main *')].filter((e) => !e.closest('.badge') && !e.closest('svg'))
      .map((e) => { const b = e.getBoundingClientRect(); return { cls: e.className && e.className.baseVal === undefined ? e.className : e.tagName, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; })
      .filter((b) => b.w > 0);
    const h1 = document.querySelector('h1');
    const name = document.querySelector('.name');
    const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    return { overflow: main.scrollHeight > main.clientHeight + 1, boxes, h1Lines: lines(h1), nameLines: lines(name) };
  })()`)) as { overflow: boolean; boxes: { cls: string; l: number; r: number; t: number; b: number }[]; h1Lines: number; nameLines: number };
  await page.close();
  return r;
}

describe('Deal of the Day layout with extreme data', () => {
  for (const [label, p] of Object.entries(CASES)) {
    for (const f of FORMATS) {
      it(`${f.file}: ${label} fits`, async () => {
        const m = await measure(postHtml(p, PHOTO, 'Wednesday, 30 September 2026', '23:59 UK, 30 Sept 2026', f), f.w, f.h);
        expect(m.overflow).toBe(false);
        expect(m.h1Lines).toBe(1);
        expect(m.nameLines).toBeLessThanOrEqual(2);
        const outside = m.boxes.filter((b) => b.l < 89 || b.r > f.w - 89 || b.t < f.pad - 1 || b.b > f.h - f.pad + 1);
        expect(outside).toEqual([]);
      }, 30_000);
    }
    it(`notes-3x4: ${label} with a long note list fits`, async () => {
      const m = await measure(notesHtml(p, 'Wednesday, 30 September 2026', longNotes, { reading: 'womens' }), 1080, 1440);
      expect(m.overflow).toBe(false);
      expect(m.h1Lines).toBe(1);
      expect(m.nameLines).toBeLessThanOrEqual(2);
      const outside = m.boxes.filter((b) => b.l < 89 || b.r > 1080 - 89 || b.t < 59 || b.b > 1440 - 59);
      expect(outside).toEqual([]);
    }, 30_000);
  }
});

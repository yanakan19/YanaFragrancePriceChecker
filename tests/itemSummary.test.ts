import { describe, expect, it } from 'vitest';
import { itemSummary } from '../demo/itemSummary.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { isOil, isSet } from '../demo/productKind.js';

/** Hyphens and every dash, as tests/changelog.test.ts. */
const DASH = /[-‐‑‒–—―−﹘﹣－]/;

type Fields = Parameters<typeof itemSummary>[0];
const set = (giftSet: Fields['giftSet'], concentration = 'Eau de Parfum'): Fields => ({ concentration, sizeMl: null, giftSet });
const oil = (concentration: string, sizeMl: number | null): Fields => ({ concentration, sizeMl, giftSet: null });

/**
 * The one or two plain sentences at the top of a set's and an oil's own page
 * (demo/itemSummary.ts): read only from fields the record already carries.
 */
describe('what a set is', () => {
  it('says what kind of set, how many items and the main bottle, from the fields', () => {
    expect(itemSummary(set({ contents: ['a', 'b', 'c'], title: 't', items: 3, mainMl: 100 }))).toBe(
      'This is a gift set of 3 items with a 100ml main bottle.',
    );
    expect(itemSummary(set({ contents: null, title: 't', mini: true, items: 5 }))).toBe('This is a miniature or discovery set of 5 items.');
    expect(itemSummary(set({ contents: null, title: 't', bundle: true, mainMl: 50 }))).toBe(
      'This is a bundle of full size bottles with a 50ml main bottle.',
    );
  });

  it('mentions only what the shops stated: no size, no count, nothing invented', () => {
    expect(itemSummary(set({ contents: null, title: 'Some Set' }))).toBe('This is a gift set.');
    expect(itemSummary(set({ contents: null, title: 't', items: 1 }))).toBe('This is a gift set of 1 item.');
    expect(itemSummary(set({ contents: null, title: 't', items: 0, mainMl: 0 }))).toBe('This is a gift set.');
  });

  it('names what else is in the box, only from the box letters it knows', () => {
    expect(itemSummary(set({ contents: null, title: 't', box: 'bw' }))).toBe(
      'This is a gift set. As the shops list it, the box also holds a body product and a wash.',
    );
    expect(itemSummary(set({ contents: null, title: 't', box: 'bdw' }))).toContain('a body product, a deodorant and a wash');
    expect(itemSummary(set({ contents: null, title: 't', box: 'z' }))).toBe('This is a gift set.');
  });
});

describe('what an oil is', () => {
  it('says perfume oil or attar, the size, and the site rule about comparing', () => {
    expect(itemSummary(oil('Perfume Oil', 12))).toBe('This is a perfume oil of 12ml. It is compared only with the same oil at other shops, never with a spray.');
    expect(itemSummary(oil('Attar', 6))).toContain('This is an attar of 6ml.');
    expect(itemSummary(oil('Perfume Oil', null))).toMatch(/^This is a perfume oil\. It is compared/);
  });
});

describe('a bottle', () => {
  it('has no summary: the page already says all it needs to', () => {
    expect(itemSummary({ concentration: 'Eau de Parfum', sizeMl: 100, giftSet: null })).toBeNull();
  });
});

describe('every set and oil in the catalogue', () => {
  const items = DEMO_FRAGRANCES.filter((f) => isSet(f) || isOil(f));

  it('has a summary of one or two sentences, with nothing left over', () => {
    expect(items.length).toBeGreaterThan(100);
    for (const f of items) {
      const text = itemSummary(f);
      expect(text, f.id).not.toBeNull();
      expect(text!, f.id).toMatch(/^This is /);
      expect(text!, f.id).not.toMatch(/undefined|null|NaN|\[object|\s{2}/);
      expect(DASH.test(text!), `${f.id}: ${text}`).toBe(false);
      expect(text!.split(/(?<=\.) /).length, f.id).toBeLessThanOrEqual(3);
      expect(text!.length, f.id).toBeLessThan(220);
    }
  });

  it('never states a size or a count the record does not hold', () => {
    for (const f of items) {
      const text = itemSummary(f)!;
      if (f.giftSet) {
        expect(/\d+ items?/.test(text), f.id).toBe(f.giftSet.items !== undefined && f.giftSet.items > 0);
        expect(text.includes('main bottle'), f.id).toBe(f.giftSet.mainMl !== undefined && f.giftSet.mainMl > 0);
      } else {
        expect(/of [\d.]+ml/.test(text), f.id).toBe(f.sizeMl !== null && f.sizeMl > 0);
      }
    }
  });
});

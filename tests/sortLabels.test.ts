import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRAND_SORT_OPTIONS, BROWSE_SORT_OPTIONS, DEAL_SORT_OPTIONS, LIST_SORT_OPTIONS, NOTE_SORT_OPTIONS, SORT_LEAD,
} from '../demo/listSort.js';
import { WISHLIST_SORTS, wishlistSortsFor } from '../src/services/accountMenu.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Owner's rule, 2026-10-04: every sort control says that it is a sort, in the
 * closed state too ("Sort By:"), and every option names both ends of its
 * order ("Best to Worst Saving", "Highest to Lowest Price").
 *
 * The option lists are checked here as data. That each control really draws
 * "Sort By:" in front of them is checked on the built page in
 * tests/sortLabelsBrowser.test.ts, and that no control is built any other
 * way is the source check at the bottom.
 */
const CONTROLS: Record<string, { label: string }[]> = {
  'search, brand, note and shop pages, Most Stocked, Gift Sets (browse)': BROWSE_SORT_OPTIONS,
  'brand, note and shop detail lists': LIST_SORT_OPTIONS,
  'Explore Brands': BRAND_SORT_OPTIONS,
  'Explore Notes': NOTE_SORT_OPTIONS,
  'Deals': DEAL_SORT_OPTIONS,
  'wishlist, without a change to rank': WISHLIST_SORTS,
  'wishlist, with a change to rank': wishlistSortsFor(true),
};

describe('every sort option names both ends of its order', () => {
  it('opens with the fixed words Sort By:', () => {
    expect(SORT_LEAD).toBe('Sort By:');
  });

  for (const [control, options] of Object.entries(CONTROLS)) {
    describe(control, () => {
      it('has at least two options', () => {
        expect(options.length).toBeGreaterThanOrEqual(2);
      });

      for (const { label } of options) {
        it(`"${SORT_LEAD} ${label}" reads as one sentence, start to end`, () => {
          const words = label.split(' ');
          // One "to", with something on each side of it: the two ends.
          expect(words.filter((w) => w === 'to'), label).toHaveLength(1);
          const at = words.indexOf('to');
          expect(at, `${label}: something before "to"`).toBeGreaterThan(0);
          expect(words.length - at - 1, `${label}: something after "to"`).toBeGreaterThan(0);
          // Title Case: every word but "to" starts with a capital.
          for (const w of words) if (w !== 'to') expect(w, label).toMatch(/^[A-Z]/);
          // No hyphens or dashes of any kind.
          expect(label).not.toMatch(/[-‐-―−]/);
          // The prefix is the control's fixed label, never inside an option, or it would read twice.
          expect(label.startsWith('Sort')).toBe(false);
        });
      }

      it('has no two options with the same words', () => {
        const labels = options.map((o) => o.label);
        expect(new Set(labels).size).toBe(labels.length);
      });
    });
  }

  it('keeps the owner\'s own examples', () => {
    expect(DEAL_SORT_OPTIONS.map((o) => o.label)).toContain('Best to Worst Saving');
    expect(LIST_SORT_OPTIONS.map((o) => o.label)).toContain('Highest to Lowest Price');
    expect(BROWSE_SORT_OPTIONS[0]!.label).toBe('Most to Least Stocked');
    expect(wishlistSortsFor(true).map((o) => o.label)).toEqual([
      'Newest to Oldest Saved', 'Lowest to Highest Price', 'Biggest to Smallest Drop',
    ]);
  });

  it('keeps every value, so no URL or saved state changes', () => {
    expect(LIST_SORT_OPTIONS.map((o) => o.value)).toEqual(['az', 'za', 'price-low', 'price-high', 'size-low', 'size-high']);
    expect(BROWSE_SORT_OPTIONS.map((o) => o.value)).toEqual(['stocked', ...LIST_SORT_OPTIONS.map((o) => o.value)]);
    expect(BRAND_SORT_OPTIONS.map((o) => o.value)).toEqual(['az', 'za']);
    expect(DEAL_SORT_OPTIONS.map((o) => o.value)).toEqual(['discount', 'lowest', 'highest']);
    expect(NOTE_SORT_OPTIONS.map((o) => o.value)).toEqual(['common', 'az']);
    expect(wishlistSortsFor(true).map((o) => o.id)).toEqual(['recent', 'cheapest', 'drop']);
  });
});

describe('every sort control is built the one way', () => {
  const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');

  it('draws every select whose id ends in -sort through sortControl', () => {
    // A sort built with the bare control() would have no "Sort By:" in front of it.
    expect(app.match(/\bcontrol\(\s*'[a-z-]*sort'/g) ?? []).toEqual([]);
    const built = [...app.matchAll(/\bsortControl\(\s*'([a-z-]+)'/g)].map((m) => m[1]!);
    expect(built.sort()).toEqual([
      'brand-sort', 'browse-sort', 'deal-sort', 'note-sort', 'wishlist-sort',
    ]);
    // The three fragrance list pages share listSortControl, one id each.
    expect([...app.matchAll(/\blistSortControl\(\s*'([a-z-]+)'/g)].map((m) => m[1]!).sort()).toEqual([
      'brand-detail-sort', 'note-detail-sort', 'retailer-detail-sort',
    ]);
  });
});

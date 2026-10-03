import { describe, expect, it } from 'vitest';
import { GIFT_SET_BAND, VOLUME_BANDS, volumeBandFor, volumeOptions, type VolumeBand } from '../demo/volumeBands.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';

/**
 * The Volume facet's whole job is deciding what happens at a shared boundary
 * — 15, 30, 70 and 120ml are each the top of one band and the bottom of the
 * next — so that is what these tests are mostly about. The rule is inclusive
 * lower bound, exclusive upper bound, the same rule the Price facet's
 * priceBandFor uses next to this one in the same panel: a size sitting
 * exactly on a boundary belongs to the *higher* band.
 */

describe('volumeBandFor: every boundary goes to the higher band', () => {
  it.each<[number, VolumeBand]>([
    [15, '15-30'],
    [30, '30-70'],
    [70, '70-120'],
    [120, '120+'],
  ])('%sml lands in %s, not the band below it', (sizeMl, expected) => {
    expect(volumeBandFor(sizeMl)).toBe(expected);
  });
});

describe('volumeBandFor: zero and a value inside each band', () => {
  it.each<[number, VolumeBand]>([
    [0, '0-15'],
    [5, '0-15'],
    [14, '0-15'],
    [20, '15-30'],
    [29, '15-30'],
    [50, '30-70'],
    [69, '30-70'],
    [100, '70-120'],
    [119, '70-120'],
    [150, '120+'],
    [2218, '120+'], // the largest sizeMl in the live catalogue
  ])('%sml lands in %s', (sizeMl, expected) => {
    expect(volumeBandFor(sizeMl)).toBe(expected);
  });
});

describe('volumeBandFor: just under a boundary stays in the lower band', () => {
  // The complement of the "boundary goes up" tests above: one millilitre
  // short of a boundary must still read as the band below it, or the
  // boundary rule would not mean anything.
  it.each<[number, VolumeBand]>([
    [14.9, '0-15'],
    [29.9, '15-30'],
    [69.9, '30-70'],
    [119.9, '70-120'],
  ])('%sml lands in %s', (sizeMl, expected) => {
    expect(volumeBandFor(sizeMl)).toBe(expected);
  });
});

/**
 * A product whose own title states two conflicting sizes (see sizeConflict
 * in src/catalogue/fragranceId.ts and CatalogueEntry.sizeMl's own comment)
 * carries `sizeMl: null` by the time it reaches this facet. Banding it into
 * any of the five ranges above would be exactly the "state what we don't
 * know" mistake the Volume facet otherwise refuses to make, so it belongs to
 * none of them.
 */
describe('volumeBandFor: a size the title cannot state as one number', () => {
  it('returns null rather than guessing a band', () => {
    expect(volumeBandFor(null)).toBeNull();
  });
});

describe('VOLUME_BANDS: shape and house style', () => {
  it('covers five bands, narrowest to widest, with no gap or overlap', () => {
    expect(VOLUME_BANDS.map((b) => b.id)).toEqual(['0-15', '15-30', '30-70', '70-120', '120+']);
    for (let i = 1; i < VOLUME_BANDS.length; i++) {
      expect(VOLUME_BANDS[i]!.min).toBe(VOLUME_BANDS[i - 1]!.max);
    }
    expect(VOLUME_BANDS[0]!.min).toBe(0);
    expect(VOLUME_BANDS.at(-1)!.max).toBeNull();
  });

  // The wording the owner specified, in the site's Title Case (2026-10-03:
  // small words such as "and" stay lowercase) and with "to" for the range,
  // since no visible text on the site carries a hyphen or dash. The same
  // "Under X" / "X and Over" phrasing PRICE_BANDS uses for its open ended
  // bands.
  it('labels match the specified wording exactly', () => {
    expect(VOLUME_BANDS.map((b) => b.label)).toEqual([
      'Under 15ml',
      '15 to 30ml',
      '30 to 70ml',
      '70 to 120ml',
      '120ml and Over',
    ]);
  });
});

describe('gift sets: their own option under Volume (owner, 2026-10-03)', () => {
  it('files a gift set under Gift Sets and never in a size band', () => {
    expect(volumeBandFor(null, true)).toBe('gift-set');
    // Even a size, were one ever set on a gift set, does not put it in a band.
    expect(volumeBandFor(100, true)).toBe('gift-set');
    expect(volumeBandFor(100, false)).toBe('70-120');
  });

  it('lists Gift Sets after the five size bands, only when something has it', () => {
    const counts = new Map<VolumeBand, number>([['gift-set', 3], ['70-120', 9], ['0-15', 2]]);
    expect(volumeOptions(counts)).toEqual([
      { value: '0-15', label: 'Under 15ml', count: 2 },
      { value: '70-120', label: '70 to 120ml', count: 9 },
      { value: 'gift-set', label: GIFT_SET_BAND.label, count: 3 },
    ]);
    expect(volumeOptions(new Map<VolumeBand, number>([['30-70', 1]])).map((o) => o.value)).toEqual(['30-70']);
  });

  it('puts every gift set in the shipped catalogue under Gift Sets, and no single bottle', () => {
    const sets = CATALOGUE.filter((p) => p.giftSet);
    expect(sets.length).toBeGreaterThan(0);
    for (const p of sets) {
      expect(p.sizeMl).toBeNull();
      expect(volumeBandFor(p.sizeMl, true)).toBe('gift-set');
    }
    for (const p of CATALOGUE.filter((q) => !q.giftSet)) expect(volumeBandFor(p.sizeMl, false)).not.toBe('gift-set');
  });
});

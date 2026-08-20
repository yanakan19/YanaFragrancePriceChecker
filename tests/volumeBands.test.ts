import { describe, expect, it } from 'vitest';
import { VOLUME_BANDS, volumeBandFor, type VolumeBand } from '../demo/volumeBands.js';

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

describe('VOLUME_BANDS: shape and house style', () => {
  it('covers five bands, narrowest to widest, with no gap or overlap', () => {
    expect(VOLUME_BANDS.map((b) => b.id)).toEqual(['0-15', '15-30', '30-70', '70-120', '120+']);
    for (let i = 1; i < VOLUME_BANDS.length; i++) {
      expect(VOLUME_BANDS[i]!.min).toBe(VOLUME_BANDS[i - 1]!.max);
    }
    expect(VOLUME_BANDS[0]!.min).toBe(0);
    expect(VOLUME_BANDS.at(-1)!.max).toBeNull();
  });

  // Matches the label wording the owner specified, word for word, and the
  // same "Under X" / "X And Over" phrasing PRICE_BANDS already uses for its
  // own open ended bands.
  it('labels match the specified wording exactly', () => {
    expect(VOLUME_BANDS.map((b) => b.label)).toEqual([
      'Under 15ml',
      '15 - 30ml',
      '30 - 70ml',
      '70 - 120ml',
      '120ml And Over',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  MIN_TILE_PX,
  PER_ROW_CHOICES,
  PER_ROW_DEFAULT,
  clampPerRow,
  gridWidthFor,
  perRowChoicesFor,
  tileWidthFor,
} from '../demo/tileDensity.js';

/**
 * These pin the arithmetic against the numbers actually in
 * demo/template.html: --gutter (16px, 28px from 900px up) and .tile-grid's
 * 16px gap. The filters open above the grid, so nothing else takes width from
 * it. If one of those moves in the stylesheet and not here, a test below fails
 * rather than the grid quietly going back to clipping names.
 */

describe('PER_ROW_CHOICES', () => {
  it('still offers the four counts the chooser has always offered', () => {
    expect([...PER_ROW_CHOICES]).toEqual([3, 5, 8, 10]);
  });

  it('defaults to a count that is in the list', () => {
    expect(PER_ROW_CHOICES as readonly number[]).toContain(PER_ROW_DEFAULT);
  });

  // The minimum is the stylesheet's own figure, quoted in two of its comments.
  // Changing it here without changing it there would give the same question
  // two answers.
  it("uses the stylesheet's own 148px minimum tile", () => {
    expect(MIN_TILE_PX).toBe(148);
  });
});

describe('gridWidthFor', () => {
  it('takes the narrow gutter below 900px and the wide one at or above it', () => {
    expect(gridWidthFor(880)).toBe(880 - 2 * 16);
    expect(gridWidthFor(900)).toBe(900 - 2 * 28);
  });

  it('gives the grid the whole width between the gutters, filters or not', () => {
    expect(gridWidthFor(1099)).toBe(1099 - 2 * 28);
    expect(gridWidthFor(1366)).toBe(1366 - 2 * 28);
  });

  it('never reports a negative width', () => {
    expect(gridWidthFor(0)).toBe(0);
    expect(gridWidthFor(20)).toBe(0);
  });
});

describe('tileWidthFor', () => {
  it('spends the gaps between tiles, not beside them', () => {
    // Three tiles have two gaps, so a 1000px grid at 3 per row is
    // (1000 - 32) / 3.
    expect(tileWidthFor(1000, 3)).toBeCloseTo(322.666, 2);
  });

  it('reports the widths the module header tabulates', () => {
    // Same figures as the table in demo/tileDensity.ts, so the header cannot
    // drift away from the code it is describing.
    const at = (vw: number) => [3, 5, 8, 10].map((n) => Math.round(tileWidthFor(gridWidthFor(vw), n)));
    expect(at(1280)).toEqual([397, 232, 139, 108]);
    expect(at(1366)).toEqual([426, 249, 150, 117]);
    expect(at(1440)).toEqual([451, 264, 159, 124]);
    expect(at(1600)).toEqual([504, 296, 179, 140]);
    expect(at(1920)).toEqual([611, 360, 219, 172]);
    expect(at(2560)).toEqual([824, 488, 299, 236]);
  });
});

describe('perRowChoicesFor', () => {
  it('is always a prefix of the offered counts, because tiles only get narrower', () => {
    for (const width of [200, 600, 948, 1108, 1588, 2228, 4000]) {
      const choices = perRowChoicesFor(width);
      expect(choices).toEqual([...PER_ROW_CHOICES].slice(0, choices.length));
    }
  });

  // The one exception is the fallback below, where nothing fits and the
  // smallest count is offered anyway, so those widths are excluded here.
  it('never offers a count that would produce a tile under the minimum', () => {
    for (const width of [600, 948, 1108, 1268, 1588, 2228, 4000]) {
      expect(tileWidthFor(width, PER_ROW_CHOICES[0])).toBeGreaterThanOrEqual(MIN_TILE_PX);
      for (const n of perRowChoicesFor(width)) {
        expect(tileWidthFor(width, n)).toBeGreaterThanOrEqual(MIN_TILE_PX);
      }
    }
  });

  // The bug this module exists for. A 1440px laptop has a 1384px grid, where
  // ten columns is a 124px tile; a 1280px one makes eight a 139px tile.
  it('drops 10 per row on a 1440px window, and 8 as well on a 1280px one', () => {
    expect(perRowChoicesFor(gridWidthFor(1440))).toEqual([3, 5, 8]);
    expect(perRowChoicesFor(gridWidthFor(1280))).toEqual([3, 5]);
  });

  it('lets 8 in from 1366 and 10 in from 1920', () => {
    expect(perRowChoicesFor(gridWidthFor(1366))).toEqual([3, 5, 8]);
    expect(perRowChoicesFor(gridWidthFor(1920))).toEqual([3, 5, 8, 10]);
  });

  it('keeps the smallest count even in a window too narrow to honour it', () => {
    expect(perRowChoicesFor(0)).toEqual([3]);
    expect(perRowChoicesFor(100)).toEqual([3]);
  });
});

describe('clampPerRow', () => {
  it('leaves a count the window can carry alone', () => {
    expect(clampPerRow(5, gridWidthFor(1440))).toBe(5);
    expect(clampPerRow(10, gridWidthFor(2560))).toBe(10);
  });

  it('falls back to the widest count that fits, not to the default', () => {
    // A reader who chose 10 on a big monitor gets 8 or 5 on a laptop, not 3.
    expect(clampPerRow(10, gridWidthFor(1440))).toBe(8);
    expect(clampPerRow(10, gridWidthFor(1280))).toBe(5);
  });

  it('returns a count that is itself offered, for every choice and width', () => {
    for (const width of [0, 400, 948, 1108, 1268, 1588, 2228]) {
      for (const n of PER_ROW_CHOICES) {
        expect(perRowChoicesFor(width)).toContain(clampPerRow(n, width));
      }
    }
  });

  it('does not raise a count the reader deliberately lowered', () => {
    expect(clampPerRow(3, gridWidthFor(2560))).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { bottleScaleStyle, BOTTLE_SCALE_TARGET, type SilhouetteBox } from '../src/catalogue/bottleScale.js';

/** A silhouette centred in the file, with the given height fraction. */
function centredBox(shf: number, swf = 0.4): SilhouetteBox {
  return { sxf: (1 - swf) / 2, syf: (1 - shf) / 2, swf, shf };
}

describe('bottleScaleStyle', () => {
  it('is null for every verdict that is not bottle-only — boxed', () => {
    // Al Nashama in docs/IMAGE-SCALE-PLAN.md §3's worked table: a real
    // silhouette (bottle + carton) that would otherwise scale, but must not —
    // see §4 for why forcing a boxed photo's group-height to the bottle
    // target is actively wrong.
    expect(bottleScaleStyle(centredBox(0.835), 1200, 1200, 'boxed')).toBeNull();
  });

  it('is null for every verdict that is not bottle-only — unsure', () => {
    expect(bottleScaleStyle(centredBox(0.6), 1000, 1000, 'unsure')).toBeNull();
  });

  it('is null with no verdict at all (an unswept or unresolved photo)', () => {
    expect(bottleScaleStyle(centredBox(0.6), 1000, 1000, undefined)).toBeNull();
  });

  it('is null when bottle-only but no box was ever persisted', () => {
    // Every entry pre-dating the backfill, an evicted cache file, or a photo
    // whose stored URL never resolved into the verdict map at all.
    expect(bottleScaleStyle(undefined, 1000, 1000, 'bottle-only')).toBeNull();
  });

  it('is null when the file dimensions are missing or non-positive', () => {
    expect(bottleScaleStyle(centredBox(0.6), 0, 0, 'bottle-only')).toBeNull();
    expect(bottleScaleStyle(centredBox(0.6), -1, 100, 'bottle-only')).toBeNull();
    expect(bottleScaleStyle(centredBox(0.6), Number.NaN, 100, 'bottle-only')).toBeNull();
  });

  it('scales a square, centred, undersized silhouette up to the target', () => {
    // fH = 0.5 on a square file: k = 0.8 / 0.5 = 1.6 exactly, no letterbox
    // correction, silhouette already centred so no shift.
    const style = bottleScaleStyle(centredBox(0.5), 1000, 1000, 'bottle-only');
    expect(style).toBe('translate(0%,0%) scale(1.6);transform-origin:50% 50%');
  });

  it('scales a square, centred, oversized silhouette down to the target', () => {
    // fH = 1.0 (fills the frame, like Sauvage in the plan): k = 0.8/1 = 0.8.
    const style = bottleScaleStyle(centredBox(1.0, 0.9), 1000, 1000, 'bottle-only');
    expect(style).toBe('translate(0%,0%) scale(0.8);transform-origin:50% 50%');
  });

  it('recentres an off-centre square silhouette', () => {
    // Silhouette's own box: x in [0.1, 0.5] (cx=0.3), y in [0.2, 0.7] (cy=0.45,
    // shf=0.5 so k stays 1.6). tx = (0.5-0.3)*100 = 20, ty = (0.5-0.45)*100 = 5.
    const box: SilhouetteBox = { sxf: 0.1, syf: 0.2, swf: 0.4, shf: 0.5 };
    const style = bottleScaleStyle(box, 1000, 1000, 'bottle-only');
    expect(style).toBe('translate(20%,5%) scale(1.6);transform-origin:30% 45%');
  });

  it('honours a custom target', () => {
    // fH=0.5, target=0.6: k = 0.6/0.5 = 1.2.
    const style = bottleScaleStyle(centredBox(0.5), 1000, 1000, 'bottle-only', 0.6);
    expect(style).toBe('translate(0%,0%) scale(1.2);transform-origin:50% 50%');
  });

  it('applies the letterbox correction for a portrait file', () => {
    // 500x1000 portrait file (ratio w/h = 0.5). Silhouette in FILE fractions:
    // shf=0.5 (fills half the file's height) — contain fills the tile's
    // height with this file, so fHTile = shf = 0.5 unchanged, k = 1.6.
    // Silhouette centred in the file (cxFile=cyFile=0.5) maps to element-x
    // 0.5 too (the portrait correction is (1-ratio)/2 + cxFile*ratio =
    // (1-0.5)/2 + 0.5*0.5 = 0.25+0.25 = 0.5), so still no shift on either
    // axis despite the file being letterboxed left/right in the tile.
    const style = bottleScaleStyle(centredBox(0.5), 500, 1000, 'bottle-only');
    expect(style).toBe('translate(0%,0%) scale(1.6);transform-origin:50% 50%');
  });

  it('shifts a portrait silhouette that sits off-centre horizontally, in element space', () => {
    // 500x1000 portrait, ratio=0.5. Silhouette hugs the file's left edge:
    // sxf=0, swf=0.4 -> cxFile=0.2. Element-space cx = (1-0.5)/2 + 0.2*0.5 =
    // 0.25 + 0.10 = 0.35 (the letterbox margin pulls it toward the tile's own
    // centre, not the file's). tx = (0.5-0.35)*100 = 15.
    const box: SilhouetteBox = { sxf: 0, syf: 0.25, swf: 0.4, shf: 0.5 };
    const style = bottleScaleStyle(box, 500, 1000, 'bottle-only');
    expect(style).toBe('translate(15%,0%) scale(1.6);transform-origin:35% 50%');
  });

  it('applies the letterbox correction for a landscape file', () => {
    // 1000x500 landscape file (ratio h/w = 0.5). fHTile = shf * 0.5.
    // shf=1.0 (fills the file's own height) -> fHTile = 0.5 -> k = 1.6.
    const box = centredBox(1.0, 0.4);
    const style = bottleScaleStyle(box, 1000, 500, 'bottle-only');
    expect(style).toBe('translate(0%,0%) scale(1.6);transform-origin:50% 50%');
  });

  it('is null when the silhouette height in tile-space is below the trust floor', () => {
    // shf=0.1 on a square file: fHTile=0.1 < MIN_TRUSTED_TILE_FRACTION (0.2).
    expect(bottleScaleStyle(centredBox(0.1), 1000, 1000, 'bottle-only')).toBeNull();
  });

  it('is null when the implied k would exceed the upper clamp bound', () => {
    // shf=0.2 (just at the trust floor): k = 0.8/0.2 = 4 > MAX_K (2.5).
    expect(bottleScaleStyle(centredBox(0.2), 1000, 1000, 'bottle-only')).toBeNull();
  });

  it('is null when the implied k would fall below the lower clamp bound', () => {
    // fH so large that k = target/fH < 0.5: with target=0.8 that needs
    // fH > 1.6, impossible on a real silhouette, so drive it via a small
    // target instead — target=0.1, fH=0.9: k = 0.1/0.9 = 0.111 < MIN_K (0.5).
    expect(bottleScaleStyle(centredBox(0.9), 1000, 1000, 'bottle-only', 0.1)).toBeNull();
  });

  it('emits nothing when the transform is within the identity tolerance', () => {
    // fH = 0.78: k = 0.8/0.78 = 1.0256 — within |k-1| <= 0.08 — and centred,
    // so both the scale and the shift are inside the "already even enough"
    // band and the whole transform is suppressed.
    expect(bottleScaleStyle(centredBox(0.78), 1000, 1000, 'bottle-only')).toBeNull();
  });

  it('does emit once the scale drifts just past the identity tolerance', () => {
    // fH chosen so k = 1 + 0.08 + a hair: 0.8 / fH = 1.081 -> fH ≈ 0.7401.
    const style = bottleScaleStyle(centredBox(0.7401), 1000, 1000, 'bottle-only');
    expect(style).not.toBeNull();
  });

  it('emits nothing when k is near-identity but the shift alone exceeds tolerance', () => {
    // fH=0.8 keeps k exactly 1, but push the silhouette 5% off-centre on x —
    // past the 3% shift tolerance — so the transform must still be emitted.
    const box: SilhouetteBox = { sxf: 0.45, syf: 0.3, swf: 0.4, shf: 0.8 };
    const style = bottleScaleStyle(box, 1000, 1000, 'bottle-only');
    expect(style).not.toBeNull();
    expect(style).toContain('scale(1)');
  });

  it('defaults its target to BOTTLE_SCALE_TARGET (0.80)', () => {
    expect(BOTTLE_SCALE_TARGET).toBe(0.8);
    const withDefault = bottleScaleStyle(centredBox(0.5), 1000, 1000, 'bottle-only');
    const withExplicit = bottleScaleStyle(centredBox(0.5), 1000, 1000, 'bottle-only', 0.8);
    expect(withDefault).toBe(withExplicit);
  });
});

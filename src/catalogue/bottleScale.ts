import type { ImageBoxVerdict } from './pickImage.js';

/**
 * Evens the bottle's own apparent size across the product grid — see
 * docs/IMAGE-SCALE-PLAN.md for why this exists and the arithmetic below.
 *
 * THE PROBLEM. Retailer photos frame the bottle at wildly different scales:
 * some fill the frame edge to edge, some sit tiny in a sea of white
 * (measured on 1,200 displayed bottle-only photos: silhouette height ÷ tile
 * height ran from 0.29 to 1.00, spread p95-p5 = 0.425). Every tile is the
 * same square, but the bottle inside it is not, so the grid reads as ragged.
 *
 * THE FIX. `bottleScaleStyle` turns the silhouette bounding box scripts/
 * image-box-classify.py already measures (and used to discard) into a CSS
 * `transform: translate()/scale()` that zooms and recentres the tile's own
 * *view* of the photo so the bottle's silhouette occupies a consistent
 * fraction (`target`, default 0.80 — the measured median) of the tile's
 * height. Nothing about the photo itself changes: this transforms the
 * `<img>` element inside the `.art` tile, which already clips to a square
 * with `overflow: hidden` (demo/template.html) — the same class of operation
 * `object-fit: contain` already performs on every product photo, and the
 * same "style our own container, never the source" boundary demo/photo.ts's
 * own header draws for the white tile behind a transparent-less JPEG.
 *
 * WHY BUILD TIME, NOT THE BROWSER. Every photo here is hot-linked from a
 * retailer's own server, so a canvas read of it in the browser is
 * cross-origin and taints — there is no way to measure a silhouette's
 * position client-side. The box has to be computed once, in this project's
 * own build, from the file already sitting in .image-box-cache/, and shipped
 * as a plain number a template can drop into an inline style. That is
 * exactly what data/image-box-verdicts.json's optional sxf/syf/swf/shf
 * fields (scripts/image-box-classify.py, scripts/image-box-check.ts) are
 * for, and this module is the only place that turns them into CSS.
 *
 * WHY ONLY `bottle-only`. A boxed photo's silhouette is the bottle *and* its
 * retail carton, so its height is the group's height, not the bottle's —
 * scaling that to a uniform "bottle" height scales the wrong object. Proven
 * on Abraaj Brackish in the plan (aspect 1.22): forcing its group's height to
 * 0.80 gives k=1.31 and jams the box against both edges of the tile. An
 * `unsure` verdict is, by the classifier's own definition, a silhouette this
 * project already declined to trust as evidence of either shape — scaling it
 * would be trusting a measurement the rest of the codebase treats as "not
 * evidence" (see pickImage.ts's isUnsure). So both render with no transform
 * at all, byte-identical to today, exactly like a photo with no verdict, no
 * persisted box, or a box this function does not trust (see below) — this is
 * a correctness fallback, not a temporary gap, mirroring the image-size
 * floor and the logo monogram fallback that shipped before it.
 */

/**
 * The silhouette's bounding box, as fractions of the FILE's own width/height
 * (not the tile's) — sxf/syf/swf/shf on a data/image-box-verdicts.json entry.
 * Fractions rather than pixels so the box applies unchanged to the upgraded,
 * higher-resolution URL actually displayed (see pickImage.ts's
 * upgradeImageResolution and its own note on why this project keys images by
 * the pre-upgrade stored URL throughout).
 */
export interface SilhouetteBox {
  readonly sxf: number;
  readonly syf: number;
  readonly swf: number;
  readonly shf: number;
}

/** The measured median tile fraction (docs/IMAGE-SCALE-PLAN.md §2, §3). */
export const BOTTLE_SCALE_TARGET = 0.8;

/**
 * `k` is never trusted outside this range — a photo whose own math would
 * need to scale it more than this to reach `target` is a measurement to
 * doubt (a near-white silhouette measured too small, say), not a bottle to
 * actually zoom that far. See docs/IMAGE-SCALE-PLAN.md §4, point 4: on the
 * plan's own 1,200-photo sample only 1 photo ever reaches this bound, and it
 * is exactly that degenerate case.
 */
const MIN_K = 0.5;
const MAX_K = 2.5;

/**
 * Below this, the measured silhouette height is not trusted at all (an
 * empty or near-empty threshold pass) — see docs/IMAGE-SCALE-PLAN.md §4,
 * point 4. In practice this is subsumed by the k-range check above (a
 * silhouette this small always asks for k far past MAX_K), but it is kept as
 * an explicit, named condition rather than an accident of the other one.
 */
const MIN_TRUSTED_TILE_FRACTION = 0.2;

/**
 * A transform this close to doing nothing is emitted as nothing —
 * docs/IMAGE-SCALE-PLAN.md §4, point 5. Measured on the plan's 1,200-photo
 * sample: 16% of bottle-only photos already sit within these bounds, and
 * suppressing their transform there trims real page weight (§5) for a
 * change nobody would see.
 */
const IDENTITY_K_TOLERANCE = 0.08;
const IDENTITY_SHIFT_TOLERANCE_PCT = 3;

/** Rounds to one decimal place — plenty for a percentage nobody reads raw. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Builds the inline-style transform for one bottle-only photo, or `null`
 * when this photo must render exactly as it does today.
 *
 * `null` whenever ANY of (docs/IMAGE-SCALE-PLAN.md §4):
 *   1. `verdict` is not `bottle-only` (boxed, unsure, unswept, or no verdict
 *      at all — the caller passes `undefined` for the last two);
 *   2. `box` is not persisted (every entry pre-dating the backfill, an
 *      evicted cache file, or a photo the classifier could not bound at
 *      all);
 *   3. `fileWidth`/`fileHeight` are not known or not positive (the same
 *      "unmeasured" case `box` above already implies in practice, but
 *      checked explicitly rather than divided by zero);
 *   4. the silhouette's height, corrected into tile-space, is under
 *      `MIN_TRUSTED_TILE_FRACTION`, or the scale factor it implies falls
 *      outside `[MIN_K, MAX_K]` — a measurement not to be trusted, not a
 *      photo to zoom to the edge of the clamp;
 *   5. the resulting transform is within `IDENTITY_K_TOLERANCE` /
 *      `IDENTITY_SHIFT_TOLERANCE_PCT` of doing nothing.
 *
 * THE MATH (docs/IMAGE-SCALE-PLAN.md §3). The tile is square and the `<img>`
 * inside it is styled `object-fit: contain`, so for a square or portrait
 * file the silhouette's own height fraction (`box.shf`) IS its height
 * fraction of the tile — contain never shrinks a portrait file's height, it
 * only letterboxes its sides. For a landscape file, contain shrinks the
 * whole image to fit the tile's width, so the silhouette's tile-height
 * fraction is `box.shf * (fileHeight / fileWidth)`.
 *
 * The silhouette's centre, similarly, sits at `(sxf + swf/2, syf + shf/2)`
 * in FILE fractions, but the transform is applied to the `<img>` ELEMENT,
 * which is the square tile, not the (possibly non-square) file — so a
 * portrait or landscape file's centre has to be re-expressed in the
 * element's own square coordinate space, accounting for the letterbox
 * margin `object-fit: contain` adds on the sides it does not fill.
 */
export function bottleScaleStyle(
  box: SilhouetteBox | undefined,
  fileWidth: number,
  fileHeight: number,
  verdict: ImageBoxVerdict | undefined,
  target: number = BOTTLE_SCALE_TARGET,
): string | null {
  if (verdict !== 'bottle-only') return null;
  if (!box) return null;
  if (!Number.isFinite(fileWidth) || !Number.isFinite(fileHeight) || fileWidth <= 0 || fileHeight <= 0) return null;

  const cxFile = box.sxf + box.swf / 2;
  const cyFile = box.syf + box.shf / 2;

  let fHTile = box.shf;
  let cx = cxFile;
  let cy = cyFile;

  if (fileWidth > fileHeight) {
    // Landscape: contain binds on width, letterboxing top and bottom. The
    // whole image (and the silhouette inside it) is shrunk vertically by
    // fileHeight/fileWidth relative to filling the tile, and the letterboxed
    // margin above it is half of what that shrink leaves over.
    const ratio = fileHeight / fileWidth;
    fHTile = box.shf * ratio;
    cy = (1 - ratio) / 2 + cyFile * ratio;
  } else if (fileHeight > fileWidth) {
    // Portrait: contain binds on height (fHTile = box.shf, unchanged), and
    // instead letterboxes the sides — the same correction, on x.
    const ratio = fileWidth / fileHeight;
    cx = (1 - ratio) / 2 + cxFile * ratio;
  }
  // Square files take neither branch: the element and the file coincide, so
  // no letterbox correction is needed on either axis.

  if (fHTile < MIN_TRUSTED_TILE_FRACTION) return null;

  const k = target / fHTile;
  if (k < MIN_K || k > MAX_K) return null;

  const tx = (0.5 - cx) * 100;
  const ty = (0.5 - cy) * 100;

  if (Math.abs(k - 1) <= IDENTITY_K_TOLERANCE && Math.abs(tx) <= IDENTITY_SHIFT_TOLERANCE_PCT && Math.abs(ty) <= IDENTITY_SHIFT_TOLERANCE_PCT) {
    // Already even enough — emitting an inline style that does nothing would
    // only cost page weight. See docs/IMAGE-SCALE-PLAN.md §4, point 5.
    return null;
  }

  const kRounded = Math.round(k * 1000) / 1000;
  const originX = round1(cx * 100);
  const originY = round1(cy * 100);
  const txRounded = round1(tx);
  const tyRounded = round1(ty);

  return `translate(${txRounded}%,${tyRounded}%) scale(${kRounded});transform-origin:${originX}% ${originY}%`;
}

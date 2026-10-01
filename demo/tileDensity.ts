/**
 * How many tiles the desktop grid may be asked to put in one row, and why the
 * answer depends on the width of the window rather than being a fixed list.
 *
 * ── The bug this exists to close ────────────────────────────────────────────
 * The per-row chooser offered 3, 5, 8 and 10 at every desktop width. Ten was
 * never a viable count on a normal laptop: a product name is drawn inside a
 * two-line `-webkit-line-clamp` box (`.phead-name` in demo/template.html) that
 * gets whatever horizontal room the tile has left, so squeezing the tile
 * squeezes the name until only its first word or two survive. A search for
 * "black fri" at 10 per row rendered three *different* French Avenue products
 * — "Vulcan Black Friday" in Eau de Parfum, "Vulcan Black Friday" in Extrait
 * and "Vulcan Black Friday Edition" — as three cards all reading
 * "Vulcan Black...". Nothing on the card said which was which.
 *
 * That is not a cosmetic clip. Measured over demo/catalogue.generated.ts as it
 * stood on 2026-08-25 (14,754 products, 698 brands), if a tile can show only
 * the first two words of a name then 4,718 products share their brand, their
 * visible name, their size *and* their concentration with at least one other
 * product — 1,540 groups of cards a reader cannot tell apart. 763 of those
 * products are genuinely duplicate records (identical brand, full name, size
 * and concentration), so 3,955 of them — 26.8% of the catalogue — are made
 * indistinguishable purely by the clipping. At three visible words it is 2,266
 * products (1,503 beyond the unavoidable duplicates); at five, 873 (110
 * beyond). Full script and output are quoted in the commit that added this
 * file.
 *
 * ── Why a width rule and not just "drop 10" ─────────────────────────────────
 * Because 10 is fine on a 27 inch monitor and 8 is already broken on a laptop.
 * The tile width each count produces is plain arithmetic over numbers that are
 * already in demo/template.html, and it is worth writing out. Since
 * 2026-10-01 the filters open above the grid on every list view rather than
 * floating in a 248px column beside it, so the grid has the full width
 * between the gutters:
 *
 *   viewport   tile width at 3 / 5 / 8 / 10 per row
 *   1280       397 / 232 / 139 / 108      offers 3, 5
 *   1366       426 / 249 / 150 / 117      offers 3, 5, 8
 *   1440       451 / 264 / 159 / 124      offers 3, 5, 8
 *   1600       504 / 296 / 179 / 140      offers 3, 5, 8
 *   1920       611 / 360 / 219 / 172      offers 3, 5, 8, 10
 *   2560       824 / 488 / 299 / 236      offers 3, 5, 8, 10
 *
 * A 96px tile is 70px of content once the 13px padding either side is taken
 * off, and the name shares that with a size, a concentration and the gap
 * between them. There is no wrapping or clamping strategy that rescues it.
 *
 * The table with the old facet column was checked against a real render in
 * Chromium to the pixel; the figures above are the same arithmetic without
 * that column. perRowControl() drops a chooser with a single option, so on a
 * window too narrow for more than 3 the control is absent rather than stuck.
 *
 * MIN_TILE_PX is 148 because that is the number the stylesheet already names
 * as a tile's minimum, in the `.tile-grid` comment ("auto-fill/minmax(148px)
 * landed on two at every width the narrow layout actually reaches").
 * Adopting a different minimum here would have quietly given the stylesheet
 * two answers to the same question.
 *
 * ── What is deliberately not modelled ───────────────────────────────────────
 * The scrollbar. A classic overlay-less scrollbar takes 15-17px off the
 * viewport width that `window.innerWidth` still reports, which makes every
 * figure above optimistic by about that much. Guessing a value per platform
 * would be inventing data; the effect is to keep a count on the list slightly
 * longer than it strictly deserves, never to drop one that would have worked.
 *
 * Kept out of demo/app.ts for the same reason demo/volumeBands.ts and
 * demo/listSort.ts are: app.ts calls `init()` at module scope, so a Node test
 * cannot import it. Arithmetic with this many boundary cases should have
 * tests.
 */

/** The column counts the chooser may offer, smallest first. */
export const PER_ROW_CHOICES = [3, 5, 8, 10] as const;

/** The count a reader who has never touched the chooser gets. */
export const PER_ROW_DEFAULT = 5;

/**
 * The narrowest tile the grid is allowed to produce, in CSS pixels.
 *
 * See the module note above: this is the stylesheet's own long-standing figure
 * for a tile's minimum width, not a new one invented here.
 */
export const MIN_TILE_PX = 148;

/** `--gutter` in demo/template.html: 16px, and 28px from 900px up. */
const GUTTER_NARROW = 16;
const GUTTER_WIDE = 28;
const GUTTER_BREAKPOINT = 900;

/** `.tile-grid`'s own `gap`. */
const GRID_GAP = 16;

/**
 * How much horizontal room the tile grid actually has, given the window.
 *
 * Mirrors the stylesheet rather than measuring the DOM: the chooser is built
 * as part of a view's HTML string, before that string is in the document, so
 * there is nothing to measure yet at the moment the decision has to be made.
 */
export function gridWidthFor(viewportWidth: number): number {
  const gutter = viewportWidth >= GUTTER_BREAKPOINT ? GUTTER_WIDE : GUTTER_NARROW;
  return Math.max(0, viewportWidth - 2 * gutter);
}

/** The width one tile ends up with, at a given count, in a grid this wide. */
export function tileWidthFor(gridWidth: number, perRow: number): number {
  return (gridWidth - GRID_GAP * (perRow - 1)) / perRow;
}

/**
 * The counts worth offering in a grid this wide, smallest first.
 *
 * Tile width falls as the count rises, so the answer is always a prefix of
 * PER_ROW_CHOICES. The smallest choice is kept even when the window is too
 * narrow to honour it: a chooser with nothing in it would be a worse answer
 * than a chooser offering the one layout that comes closest.
 */
export function perRowChoicesFor(gridWidth: number): number[] {
  const fits = PER_ROW_CHOICES.filter((n) => tileWidthFor(gridWidth, n) >= MIN_TILE_PX);
  return fits.length > 0 ? fits : [PER_ROW_CHOICES[0]];
}

/**
 * The count to actually render with, given what the reader last chose.
 *
 * Their choice is not overwritten anywhere — it stays in state and in
 * localStorage — so a reader who picked 10 on a wide monitor, then dragged the
 * window narrow, gets 10 back when they drag it wide again. This only decides
 * what is drawn right now.
 */
export function clampPerRow(perRow: number, gridWidth: number): number {
  const choices = perRowChoicesFor(gridWidth);
  return choices.includes(perRow) ? perRow : Math.max(...choices);
}

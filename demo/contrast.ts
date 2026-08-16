/**
 * Contrast, computed rather than asserted.
 *
 * This project writes measured contrast ratios into comments — the monogram
 * lightness note in demo/template.html turns on 360 of them, and the gender
 * mark tokens carry a table of eight. A number in a comment is exactly the
 * kind of claim that is true when written and silently false a month later,
 * which is what tests/registry.test.ts already exists to stop happening to
 * the retailer counts.
 *
 * So the arithmetic lives here, in one DOM-free file: the design system page
 * calls it to print live ratios for whichever theme is on screen, and
 * tests/contrast.test.ts calls it to hold the documented figures to the
 * actual token values. One implementation, so the page and the test can never
 * disagree about what a ratio is.
 *
 * WCAG 2.1, relative luminance and the (L1 + 0.05) / (L2 + 0.05) ratio. AA
 * asks 4.5:1 of body text and 3:1 of a graphic or large text.
 */

/** Red, green, blue in 0-255, and alpha in 0-1. */
export type Rgba = [number, number, number, number];

/**
 * Reads a colour the browser has already resolved.
 *
 * A token in this stylesheet may be written as a hex, an `rgba()` or an
 * `hsl()`, and the page reads them back through `getComputedStyle`, which
 * hands every one of them over in the same `rgb(r, g, b)` or
 * `rgb(r g b / a)` form. Accepting a bare `#rrggbb` too is what lets a test
 * pass the literal value out of template.html without a browser in the room.
 *
 * Returns null rather than a guess for anything it does not recognise, so a
 * caller can leave a row blank instead of printing a wrong number.
 */
export function parseColour(value: string): Rgba | null {
  const text = value.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1]!;
    const full = digits.length === 3 ? digits.replace(/./g, (c) => c + c) : digits;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      1,
    ];
  }

  // Both the legacy comma form and the modern space form, with or without an
  // alpha. Percentages are not accepted: nothing in this stylesheet uses them
  // and quietly mis-reading one as 0-255 would be worse than reporting
  // nothing.
  const numbers = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (!numbers) return null;
  const parts = numbers[1]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.some((p) => p.endsWith('%')) || parts.some((p) => Number.isNaN(Number(p)))) {
    return null;
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts[3] === undefined ? 1 : Number(parts[3])];
}

/** WCAG relative luminance. Alpha is ignored: a ratio needs two solid colours. */
export function relativeLuminance([r, g, b]: Rgba): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The ratio between two colours, always at least 1 and at most 21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The same thing from two strings, or null if either could not be read. */
export function contrastBetween(foreground: string, background: string): number | null {
  const fg = parseColour(foreground);
  const bg = parseColour(background);
  return fg && bg ? contrastRatio(fg, bg) : null;
}

/** The AA threshold for body text. Graphics and large text may sit at 3. */
export const AA_TEXT = 4.5;

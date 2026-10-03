/**
 * Money helpers.
 *
 * Prices are held as numbers in GBP. That is fine for comparison and display at
 * these magnitudes, but every arithmetic result is snapped back to pence so
 * that float drift never reaches the UI as £62.949999999999996.
 */

/** Round to the nearest penny. */
export function roundPence(gbp: number): number {
  return Math.round((gbp + Number.EPSILON) * 100) / 100;
}

/**
 * `partGbp` as a whole percent of `ofGbp`, rounded down, worked in whole
 * pence so float drift cannot cost a point: 29 / 100 * 100 is
 * 28.999999999999996 in floating point, and flooring that printed "28% off"
 * on a 29% saving. Both inputs are snapped to pence first; `ofGbp` must be
 * above zero (callers check, and get NaN otherwise rather than Infinity).
 */
export function wholePercentDown(partGbp: number, ofGbp: number): number {
  const part = Math.round(roundPence(partGbp) * 100);
  const of = Math.round(roundPence(ofGbp) * 100);
  if (!(of > 0)) return Number.NaN;
  return Math.floor((part * 100) / of);
}

/** Format for display, always with two decimal places. */
export function formatGbp(gbp: number): string {
  return `£${roundPence(gbp).toFixed(2)}`;
}

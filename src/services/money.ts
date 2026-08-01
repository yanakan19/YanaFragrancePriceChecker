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

/** Format for display, always with two decimal places. */
export function formatGbp(gbp: number): string {
  return `£${roundPence(gbp).toFixed(2)}`;
}

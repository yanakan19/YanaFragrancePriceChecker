/**
 * Money helpers.
 *
 * Prices are held as numbers in GBP. That is fine for comparison and display at
 * these magnitudes, but every arithmetic result is snapped back to pence so
 * that float drift never reaches the UI as £62.949999999999996.
 */

import { DEFAULT_REGION, activeRegion, type RegionConfig, type RegionId } from '../config/regions.js';

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

const numberFormats = new Map<RegionId, Intl.NumberFormat>();

function numberFormat(region: RegionConfig): Intl.NumberFormat {
  let f = numberFormats.get(region.id);
  if (!f) {
    f = new Intl.NumberFormat(region.locale, {
      minimumFractionDigits: region.money.fractionDigits,
      maximumFractionDigits: region.money.fractionDigits,
      useGrouping: region.money.grouping,
    });
    numberFormats.set(region.id, f);
  }
  return f;
}

/**
 * The one money formatter: an amount in the region's currency, written the
 * region's way. For the UK this is exactly what the site has always printed,
 * `£` and two decimals with no thousands separator (£62.95, £1299.00),
 * snapped to the penny first; tests/ukPricesUnchanged.test.ts holds every
 * price in the catalogue, the deals and the price history to that. The US
 * gets $1,299.00 and India whole rupees with Indian grouping, ₹1,23,450.
 *
 * Every price the page, the share text and the alert emails print goes
 * through here (or formatMoneyShort below). tests/moneyGuard.test.ts fails on
 * a new hard coded `£` in what they print.
 */
export function formatMoney(amount: number, region: RegionConfig = activeRegion()): string {
  const snapped = region.money.fractionDigits === 0 ? Math.round(amount) : roundPence(amount);
  // Not a finite amount: written as toFixed always wrote it ("NaN"), never Intl's "∞".
  if (!Number.isFinite(snapped)) return `${region.currencySymbol}${String(snapped)}`;
  // `+ 0` turns a negative zero (a refund of a fraction of a penny) into 0,
  // which toFixed always printed as "0.00" and Intl would print as "-0.00".
  return `${region.currencySymbol}${numberFormat(region).format(snapped + 0)}`;
}

/**
 * Money as a shop states it in a sentence: no decimals for a whole amount
 * (£25, $35), the region's usual form otherwise (£3.95). Used for delivery
 * thresholds and price band labels.
 */
export function formatMoneyShort(amount: number, region: RegionConfig = activeRegion()): string {
  if (Number.isInteger(amount)) {
    return `${region.currencySymbol}${region.money.grouping ? amount.toLocaleString(region.locale) : String(amount)}`;
  }
  return formatMoney(amount, region);
}

/**
 * A small unit price at a set number of decimals, for "£0.80 per ml" and
 * "£0.045 per ml". Not snapped to the penny: the extra place is the point.
 * The UK prints exactly what toFixed always printed.
 */
export function formatMoneyFine(amount: number, decimals: number, region: RegionConfig = activeRegion()): string {
  const n = region.money.grouping
    ? amount.toLocaleString(region.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : amount.toFixed(decimals);
  return `${region.currencySymbol}${n}`;
}

/** The region's currency symbol on its own, for a field label such as "at or below £". */
export function currencySymbol(region: RegionConfig = activeRegion()): string {
  return region.currencySymbol;
}

/**
 * Format a sterling amount for display, always with two decimal places.
 * Kept for the public API (src/index.ts, the README); the same as
 * formatMoney for the UK.
 */
export function formatGbp(gbp: number): string {
  return formatMoney(gbp, DEFAULT_REGION);
}

import { roundPence, wholePercentDown } from '../src/services/money.js';
import type { DiscountDisplay } from '../src/types/offer.js';

/**
 * Every comparison this site prints between a price and a reference price —
 * "12% below MSRP", "30% above MSRP", "26% off RRP" — and the one rule they
 * all keep: the price compared is the price the reader is shown beside it.
 *
 * ── The report that set the rule (3 Oct 2026) ───────────────────────────────
 *
 * A Manchester Ouds perfume: MSRP box £30.00, Cheapest box £32.50 from
 * Perfume Click. Perfume Click's row read "£32.50, Incl. £2.95 delivery",
 * tagged Cheapest, with "1% below MSRP" in sale green. £32.50 is above £30.
 * The row's big number had become the delivered total on 1 Oct ("Kept to two
 * lines" in demo/app.ts's offerRow note) while this file still compared the
 * item price, £29.55, so the label described a number the row no longer
 * printed. Perfumeo's £28.99 with free delivery read "3% below MSRP", which
 * was right only because its two figures are the same.
 *
 * The earlier rule here was "item price only, never delivered", argued on the
 * grounds that the house's own price has its own delivery on top. That
 * argument holds only while the row prints the item price, which it no longer
 * does. What a reader can check is the figure in front of them, so that is
 * what every comparison now uses:
 *
 *   - a row whose shop states its delivery cost prints the delivered total,
 *     so its MSRP and RRP comparisons use the delivered total;
 *   - a row whose shop states no delivery cost prints the item price under
 *     "Delivery not included" / "+ delivery", so its comparisons use the item
 *     price, and nothing in the label claims delivery is in it.
 *
 * `shownPrice` is that one decision, and every caller goes through it.
 *
 * ── RRP: why the shop's own claim is compared on the same footing ───────────
 *
 * A shop's RRP is the shop's claim about the bottle's price, without postage,
 * so comparing it with the item price is defensible in the abstract. But the
 * row puts "RRP £39.99" struck through directly beside the figure it prints,
 * and a reader does the arithmetic on those two numbers: £39.99 struck through
 * beside £32.50 labelled "26% off RRP" (worked from a £29.55 item price) does
 * not add up on the page. Comparing the shown figure can only understate a
 * shop's own saving, never overstate it, which is the safe direction for a
 * pricing claim. Where the shown figure is not below the RRP at all, no
 * saving is printed; an "above RRP" label is never printed, because the RRP is
 * the shop's own figure and the shop's own item price is below it. Today's
 * Deals uses the same figure, so a deal tile and the product page it opens
 * state the same percentage.
 *
 * ── The arithmetic rules ─────────────────────────────────────────────────────
 *
 *   - Direction comes from the exact gap in pence, never from a rounded
 *     percentage, so £30.10 against £30 can only ever be "above" (or, as here,
 *     too small to state), never "0% below".
 *   - The percentage is always relative to the reference price, in both
 *     directions, and floored, worked in whole pence (wholePercentDown): it
 *     understates a saving and understates a mark up alike.
 *   - Anything under one whole percent is not printed at all, rather than
 *     printed as "0%". Returning null is the single guarantee that a zero can
 *     never appear.
 *   - Exactly one direction, or none, per comparison.
 *
 * Lives in its own module rather than in demo/app.ts so it can be unit tested
 * directly: app.ts calls init() at import time, so nothing in it is importable
 * from a plain Node test. Same reason as demo/deliveryFacts.ts.
 */

/** The two figures a presented offer carries, as much as this file needs. */
export interface PricedRow {
  itemPriceGbp: number;
  /** Null when the shop states no delivery cost. Never the item price. */
  deliveredPriceGbp: number | null;
}

/** The figure a row, tile or box prints, and whether delivery is in it. */
export interface ShownPrice {
  amountGbp: number;
  /** True when the figure includes a stated delivery cost (even a free one). */
  delivered: boolean;
}

/**
 * The price a reader is shown for one offer: the delivered total where the
 * shop states its delivery cost, the item price where it does not. The same
 * expression offerRow, the wrong price report and the offer ordering already
 * print (`deliveredPriceGbp ?? itemPriceGbp`), named once so a comparison can
 * never be handed the other figure.
 */
export function shownPrice(row: PricedRow): ShownPrice {
  return row.deliveredPriceGbp === null
    ? { amountGbp: row.itemPriceGbp, delivered: false }
    : { amountGbp: row.deliveredPriceGbp, delivered: true };
}

export interface MsrpComparison {
  /** Which side of the house's own price the shown figure sits on. Never both. */
  direction: 'below' | 'above';
  /** Whole percent against the house's price, floored. Always >= 1. */
  percent: number;
}

/**
 * Which side of the fragrance house's own price `shownPriceGbp` sits on, and
 * by how much. Pass the figure the reader is shown (`shownPrice(row)`), not
 * the item price of a row that prints a delivered total.
 */
export function msrpComparison(
  shownPriceGbp: number,
  houseCeilingGbp: number,
): MsrpComparison | null {
  if (!Number.isFinite(shownPriceGbp) || !Number.isFinite(houseCeilingGbp)) return null;
  // A ceiling of zero or less is not a price to compare against.
  if (houseCeilingGbp <= 0) return null;

  const gap = roundPence(shownPriceGbp - houseCeilingGbp);
  if (Math.abs(gap) < 0.01) return null;

  const percent = wholePercentDown(Math.abs(gap), houseCeilingGbp);
  if (!(percent >= 1)) return null;

  return { direction: gap < 0 ? 'below' : 'above', percent };
}

/** The row's own words for the comparison, e.g. "12% below MSRP". */
export function msrpComparisonLabel(c: MsrpComparison): string {
  return `${c.percent}% ${c.direction} MSRP`;
}

/**
 * The saving against a shop's stated RRP, worked from the figure shown, or
 * null when there is no whole percent saving to state. Same floor and same
 * one percent minimum as `buildDiscount`, whose `wasPrice` this reads.
 */
export function rrpSaving(
  shownPriceGbp: number,
  wasPriceGbp: number,
): { savingGbp: number; percentOff: number } | null {
  if (!Number.isFinite(shownPriceGbp) || !Number.isFinite(wasPriceGbp) || wasPriceGbp <= 0) return null;
  const saving = roundPence(wasPriceGbp - shownPriceGbp);
  if (saving < 0.01) return null;
  const percentOff = wholePercentDown(saving, wasPriceGbp);
  if (!(percentOff >= 1)) return null;
  return { savingGbp: saving, percentOff };
}

/**
 * The RRP strikethrough one row may print: the shop's corroborated
 * `discount` (already filtered by src/catalogue/wasPriceCredibility.ts),
 * restated against the row's shown figure. Null when the shop has no RRP or
 * when the shown figure is not a whole percent below it.
 */
export function rrpSavingFor(row: PricedRow & { discount: DiscountDisplay | null }): DiscountDisplay | null {
  const d = row.discount;
  if (!d) return null;
  const shown = shownPrice(row).amountGbp;
  const s = rrpSaving(shown, d.wasPrice);
  if (!s) return null;
  return { ...d, nowPrice: roundPence(shown), savingGbp: s.savingGbp, percentOff: s.percentOff };
}

/** The row's words for an RRP saving, e.g. "26% off RRP". */
export function rrpSavingLabel(d: { percentOff: number }): string {
  return `${d.percentOff}% off RRP`;
}

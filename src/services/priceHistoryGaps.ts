import { getRetailer } from '../config/retailers.js';
import { formatGbp } from './money.js';

/**
 * Wording for a fragrance detail page's price history block when there is no
 * buyable line to draw — fewer than two prices a reader could actually have
 * paid, the bar demo/app.ts's chart has always required (see its own
 * priceHistoryChart comment) and which scripts/build-price-history.ts now
 * enforces at the source via listingAvailability.ts's isAvailableListing.
 *
 * ── Why three different sentences, not one ──────────────────────────────────
 * A blank space where a chart used to be reads as broken, not as an answer.
 * But a single generic "no history" sentence would be dishonest for most of
 * the fragrances it covers, because it collapses three genuinely different
 * facts into one:
 *
 *   'never'      Nobody has recorded a price for this at all, buyable or
 *                not. This is the plain "we have no data" case.
 *   'sold-out'   We recorded prices for this — real ones, from a real live
 *                snapshot — but every single one of them was for a listing
 *                confirmed out of stock at the time. There is data; none of
 *                it was ever a price anyone could have paid.
 *   'not-enough' There is exactly one buyable price on record. That is one
 *                reading, not a trend — a single dot has nothing to draw a
 *                line between — but it is real, so it is named rather than
 *                hidden behind a "no data" sentence that would understate
 *                what is actually known.
 *   'same-day'   Not a build time reason at all — computed in demo/app.ts's
 *                priceHistoryChart, the one case where a fragrance clears
 *                the two real point bar yet still has nothing to draw: every
 *                real reading happened to land on the same calendar day (a
 *                price that changed twice in one day, never again since),
 *                so the calendar axis the chart is built on cannot place two
 *                distinct days to draw a line between. Measured against the
 *                live catalogue on 2026-08-26: 17 of 5,455 chartable
 *                fragrances hit this.
 *
 * 'sold-out' and 'not-enough' each carry the real figures behind them (a
 * date range for the former, a price/retailer/date for the latter) so the
 * page states an honest fact instead of only an absence — see
 * scripts/build-price-history.ts for exactly how each is derived from the
 * replayed git history, and why no other information can be shown here: the
 * hard rule this whole feature exists to enforce is that a price nobody
 * could actually pay is never drawn as though it were one, and a sentence
 * naming an out of stock listing's actual price would break that rule just
 * as much as plotting it would.
 */
export type PriceHistoryGap =
  | { reason: 'never' }
  | { reason: 'sold-out'; firstAt: string; lastAt: string }
  | { reason: 'not-enough'; priceGbp: number; retailerId: string; at: string }
  | { reason: 'same-day'; priceGbp: number; retailerId: string; at: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "6 Aug" in UTC, deliberately not the reader's own timezone: this text
 *  names a day something was or was not on record, not a live event, so it
 *  needs to be the same sentence for every reader rather than drifting a
 *  day near midnight depending on where they are. */
function shortDateUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Falls back to the raw id on an unresolvable retailer rather than
 *  throwing — the same fallback demo/app.ts's own chart tooltip already
 *  uses for the identical lookup. */
function retailerName(id: string): string {
  return getRetailer(id)?.name ?? id;
}

export function priceHistoryGapMessage(gap: PriceHistoryGap): string {
  switch (gap.reason) {
    case 'never':
      return 'No price has been recorded for this fragrance yet.';
    case 'sold-out':
      return `Every price recorded for this, ${shortDateUtc(gap.firstAt)} to ${shortDateUtc(gap.lastAt)}, was for a listing marked out of stock. None of them could actually be bought, so there is no line to draw.`;
    case 'not-enough':
      return `The only price recorded for this that could actually be paid is ${formatGbp(gap.priceGbp)} at ${retailerName(gap.retailerId)}, on ${shortDateUtc(gap.at)}. That is one reading, not a trend, so there is no line to draw yet.`;
    case 'same-day':
      return `Every price recorded for this that could actually be paid was read on the same day, ${shortDateUtc(gap.at)}, so there is no day by day trend to draw yet. The latest was ${formatGbp(gap.priceGbp)} at ${retailerName(gap.retailerId)}.`;
  }
}

import type { Retailer } from '../src/types/retailer.js';
import { formatGbp } from '../src/services/money.js';

/**
 * Plain-English delivery facts for one retailer, in the order a shopper
 * would want them: standard cost (or the honest reason there isn't one),
 * how sure we are of that, the free-delivery threshold if any, the delivery
 * window, and a membership perk if the shop has one.
 *
 * Extracted out of demo/app.ts so it can be unit tested directly — app.ts
 * pulls in the whole DOM-touching harness at import time (it calls `init()`
 * at the bottom of the file the moment it loads), so nothing in it can be
 * imported from a plain Node test, the same reason demo/trustpilotWidget.ts,
 * demo/volumeBands.ts and demo/listSort.ts already live in their own
 * modules. Originally written for, and still used by, retailerView()'s
 * per-shop delivery panel; brandView() reuses it unchanged for a brand's
 * own UK storefront so "delivery not stated" reads identically wherever it
 * appears rather than inventing a second wording for the same fact.
 */
export function deliveryLines(r: Retailer): string[] {
  const s = r.shipping;
  const lines: string[] = [];
  lines.push(
    s.standardGbp === null
      ? // Two different facts wear the same null, and the line said the
        // stronger of them for both. "This shop does not publish a standard
        // delivery cost" is a claim about the shop, and it is only ours to
        // make once someone has read their delivery page and found none —
        // which is what standardRateNotPublished records. Without it all we
        // can say is that we do not have the figure.
        s.standardRateNotPublished
        ? 'Delivery not stated. This shop publishes no standard delivery cost, so its prices here are item prices only and it is never ranked as cheapest'
        : 'Delivery not stated. We have not established this shop’s standard delivery cost, so its prices here are item prices only and it is never ranked as cheapest'
      : s.standardGbp === 0
        ? 'Free standard delivery on every order'
        : `Standard delivery ${formatGbp(s.standardGbp)}`,
  );
  // Which of these figures has actually been read off the shop's own delivery
  // page, said once per shop rather than repeated against every number.
  lines.push(
    s.confidence === 'confirmed'
      ? s.source
        ? `Read from this shop’s own delivery page on ${s.source.readAt}`
        : 'Confirmed against this shop’s own delivery page'
      : 'Not yet confirmed with the shop. These delivery terms came from research, not from their own delivery page',
  );
  if (s.freeOverGbp !== null && s.freeOverGbp > 0) {
    lines.push(`Free once you spend ${formatGbp(s.freeOverGbp)}`);
  } else if (s.freeOverGbp === null) {
    lines.push('No spend based free delivery');
  }
  const [lo, hi] = s.estimatedDays;
  lines.push(lo === hi ? `Arrives in about ${lo} working days` : `Arrives in about ${lo} to ${hi} working days`);
  if (s.membershipPerk) {
    lines.push(`${s.membershipPerk.scheme}: ${s.membershipPerk.description}`);
  }
  return lines;
}

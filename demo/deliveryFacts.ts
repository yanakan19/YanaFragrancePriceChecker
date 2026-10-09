import type { Retailer } from '../src/types/retailer.js';
import { formatMoney, formatMoneyShort } from '../src/services/money.js';
import { localWords } from '../src/services/regionText.js';

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
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "2026-10-03" as "3 October 2026". The ISO form put hyphens into a line a
 * reader sees, which this site's copy never uses. Parsed by hand rather than
 * through Date so the day cannot shift with the viewer's time zone; anything
 * that is not a plain ISO date is returned unchanged.
 */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** A charge under a pound as a shop writes it, 99p, and any other as sterling. */
function formatPence(gbp: number): string {
  return gbp < 1 ? `${Math.round(gbp * 100)}p` : formatMoney(gbp);
}

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
        : `Standard delivery ${formatMoney(s.standardGbp)}`,
  );
  // Which of these figures has actually been read off the shop's own delivery
  // page, said once per shop rather than repeated against every number.
  // A basket check names itself rather than borrowing the delivery page's
  // wording: it is what the shop actually charged at its own checkout, and
  // for a shop like Riiffs, which answers every automated read with a
  // captcha, no delivery page was ever read at all.
  lines.push(
    s.confidence === 'confirmed'
      ? s.basketCheck
        ? `Checked by hand in this shop’s own basket on ${longDate(s.basketCheck.readAt)}`
        : s.source
          ? `Read from this shop’s own delivery page on ${longDate(s.source.readAt)}`
          : 'Confirmed against this shop’s own delivery page'
      : 'Not yet confirmed with the shop. These delivery terms came from research, not from their own delivery page',
  );
  if (s.freeOverGbp !== null && s.freeOverGbp > 0) {
    lines.push(`Free once you spend ${formatMoney(s.freeOverGbp)}`);
  } else if (s.freeOverGbp === null) {
    lines.push('No spend based free delivery');
  }
  // A cheaper paid rate above a spend (Debenhams: 99p on orders over £30). Said
  // as the shop says it, "over" when the spend itself does not qualify.
  if (s.cheaperRateOver) {
    const c = s.cheaperRateOver;
    lines.push(
      `Delivery drops to ${formatPence(c.costGbp)} on orders ${c.inclusive ? 'of' : 'over'} ${formatMoneyShort(c.overGbp)}${c.inclusive ? ' or more' : ''}, and is not free`,
    );
  }
  const [lo, hi] = s.estimatedDays;
  // [0, 0] is a region shop that states no delivery window (src/config/regionShops.ts); no UK shop has it.
  if (hi > 0) lines.push(lo === hi ? `Arrives in about ${lo} working days` : `Arrives in about ${lo} to ${hi} working days`);
  if (s.membershipPerk) {
    lines.push(`${s.membershipPerk.scheme}: ${s.membershipPerk.description}`);
  }
  if (s.minimumOrderGbp) {
    lines.push(`Minimum order ${formatMoney(s.minimumOrderGbp)}, so a cheaper bottle cannot be ordered on its own`);
  }
  // The US says shipping and MSRP (src/services/regionText.ts); the UK's lines come back unchanged.
  return lines.map((l) => localWords(l));
}

/**
 * The same fact in fewer words, for the shop page's compact facts row, where
 * "this shop's own delivery page" and "its prices here are item prices only"
 * would otherwise be said in full against every line. Nothing is dropped:
 * what was read, when, and what an unstated delivery cost means all stay.
 * Lines this does not know are returned unchanged.
 */
export function compactDeliveryLine(line: string): string {
  return line
    .replace(/^(Delivery|Shipping) not stated\. This shop publishes no standard (delivery|shipping) cost, so its prices here are item prices only and it is never ranked as cheapest$/, '$1 not stated (the shop publishes no standard cost): item prices only, never ranked cheapest')
    .replace(/^(Delivery|Shipping) not stated\. We have not established this shop’s standard (delivery|shipping) cost, so its prices here are item prices only and it is never ranked as cheapest$/, '$1 not stated (not established by us): item prices only, never ranked cheapest')
    .replace(/^Read from this shop’s own (delivery|shipping) page on /, 'Read from its $1 page on ')
    .replace(/^Checked by hand in this shop’s own basket on /, 'Checked in its own basket on ')
    .replace(/^Confirmed against this shop’s own (delivery|shipping) page$/, 'Confirmed with its $1 page')
    .replace(/^Not yet confirmed with the shop\. These (delivery|shipping) terms came from research, not from their own (delivery|shipping) page$/, 'Not yet confirmed with the shop: terms come from research')
    .replace(/, so a cheaper bottle cannot be ordered on its own$/, ', so one cheap bottle cannot be ordered alone');
}

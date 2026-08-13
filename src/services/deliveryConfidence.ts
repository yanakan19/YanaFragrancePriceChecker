import type { PresentedOffer } from '../types/offer.js';
import { roundPence } from './money.js';
import { purchasableOffers } from './priceService.js';

/**
 * Whether the site is entitled to call a listing "Cheapest".
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * The headline figure here is a delivered price, item plus delivery, and it is
 * the default sort key. So the delivery figure is not a footnote: it picks the
 * winner. Most of those figures carry `shipping.confidence: 'unverified'` —
 * sourced indirectly, never read off that shop's own delivery page — and until
 * now the presentation layer did not use that field at all. An unverified
 * £2.99 was rendered exactly like a confirmed £3.99, and the row it produced
 * was labelled "Cheapest" with exactly the same confidence.
 *
 * Measured across the real harvested catalogue with
 * `npm run shipping:confidence` on 2026-08-13: 68% of live listings came from
 * a shop whose delivery rule is unverified, and 69% of the shops we were
 * labelling "Cheapest" were winning on one. This is not an edge case to
 * footnote; it is most of the site.
 *
 * ── What this module does about it ───────────────────────────────────────────
 * It does not change any price. Every delivered price on screen still includes
 * delivery, because excluding it would be worse: delivery genuinely ranges from
 * £0 to £5.95 across these shops, and a comparison that drops it ranks by a
 * number nobody pays. What changes is the *superlative*. "Cheapest" is a claim
 * about an ordering, and this decides whether the ordering survives the
 * uncertainty in the figures that produced it.
 *
 * ── The bound, and what it does not cover ────────────────────────────────────
 * An unverified rule is treated as uncertain about *whether it applies*: the
 * delivered price could be as low as the item price alone (the shop may not
 * charge, or may have a free-delivery threshold we never read) and as high as
 * the item price plus that shop's own recorded standard rate. Those two ends
 * are the only figures in the registry; widening past them would mean inventing
 * a number, which is the one thing this codebase will not do.
 *
 * So the bound does not cover the case where the recorded rate is itself too
 * low — an unverified £2.99 that is really £4.99. Nothing here can bound that,
 * and pretending otherwise would be a different invented number. That case is
 * handled the other way, by marking every unverified figure as unconfirmed
 * where it is displayed, so a reader is told which numbers have been read off
 * the shop's page and which have not.
 */

/**
 * The span a delivered price could honestly occupy, given how well its delivery
 * rule is established.
 *
 * A confirmed rule collapses to a point: low and high are the same number.
 * `null` when the shop states no delivery cost at all — there is no delivered
 * price to bound, and such a row is already barred from winning (`bestOffer`).
 */
export interface DeliveredPriceRange {
  lowGbp: number;
  highGbp: number;
  /** True when the two ends differ, i.e. an unverified rule is in play. */
  uncertain: boolean;
}

export function deliveredPriceRange(offer: PresentedOffer): DeliveredPriceRange | null {
  const cost = offer.delivery.costGbp;
  if (cost === null) return null;

  const point = roundPence(offer.itemPriceGbp + cost);
  if (offer.delivery.confirmed) {
    return { lowGbp: point, highGbp: point, uncertain: false };
  }

  // `standardGbp` is null only when `costGbp` is null, which returned above —
  // but the fallback keeps this total rather than resting on that coupling.
  const standard = offer.retailer.shipping.standardGbp ?? cost;
  const highGbp = roundPence(offer.itemPriceGbp + Math.max(cost, standard));
  const lowGbp = roundPence(offer.itemPriceGbp);
  return { lowGbp, highGbp, uncertain: highGbp > lowGbp };
}

export type CheapestReason =
  /** Nothing buyable, so there is no winner to describe. */
  | 'no-offers'
  /** The winner states no delivery cost. Already handled as its own case. */
  | 'delivery-unstated'
  /** Only one comparable offer: no ordering to get wrong. */
  | 'sole-offer'
  /** The winner holds regardless of how the unverified figures resolve. */
  | 'clear'
  /** An unverified delivery figure is what puts this row first. */
  | 'within-unverified-delivery';

export interface CheapestVerdict {
  /** The row `bestOffer` picked. Unchanged by any of this. */
  offer: PresentedOffer | null;
  /** The row it has to beat, when there is one. */
  runnerUp: PresentedOffer | null;
  /**
   * Whether the site may call `offer` the cheapest. False does not mean the row
   * is wrong or dear — it means the evidence does not settle the question, and
   * the copy must say something weaker than "Cheapest".
   */
  decided: boolean;
  reason: CheapestReason;
  /** Delivered-price gap to the runner up, or null when there isn't one. */
  marginGbp: number | null;
  /**
   * How far the two rows' possible delivered prices overlap once the unverified
   * components are allowed to move. Zero when they do not overlap.
   */
  overlapGbp: number;
}

/**
 * Decide whether the leading row can honestly be called the cheapest.
 *
 * The test is an interval one: the winner keeps the label only when its
 * delivered price, read at its worst, is still no higher than the runner up's
 * read at its best. Anything else and the two rows' possible prices overlap,
 * which is precisely the situation where the site does not know which is
 * cheaper and must not say that it does.
 *
 * Only the top two rows are compared. If the winner survives the runner up it
 * survives everything below, because the sort has already put them in order and
 * every lower row's low end is at least the runner up's item price.
 */
export function cheapestVerdict(rows: readonly PresentedOffer[]): CheapestVerdict {
  const buyable = purchasableOffers(rows);
  const comparable = buyable.filter((r) => r.deliveredPriceGbp !== null);

  const empty = { runnerUp: null, marginGbp: null, overlapGbp: 0 } as const;

  if (buyable.length === 0) {
    return { offer: null, ...empty, decided: false, reason: 'no-offers' };
  }
  if (comparable.length === 0) {
    // Every buyable row has an unstated delivery cost. `bestOffer` still names
    // one so the reader learns who has it, and the UI already labels that as an
    // item price rather than a delivered one.
    return { offer: buyable[0]!, ...empty, decided: false, reason: 'delivery-unstated' };
  }

  const best = comparable[0]!;
  if (comparable.length === 1) {
    return { offer: best, ...empty, decided: true, reason: 'sole-offer' };
  }

  const runnerUp = comparable[1]!;
  const bestRange = deliveredPriceRange(best)!;
  const rivalRange = deliveredPriceRange(runnerUp)!;
  const marginGbp = roundPence(runnerUp.deliveredPriceGbp! - best.deliveredPriceGbp!);
  const overlapGbp = roundPence(Math.max(0, bestRange.highGbp - rivalRange.lowGbp));

  return {
    offer: best,
    runnerUp,
    decided: overlapGbp === 0,
    reason: overlapGbp === 0 ? 'clear' : 'within-unverified-delivery',
    marginGbp,
    overlapGbp,
  };
}

/**
 * One line saying why the winner is not being called cheapest, for the reader
 * rather than for a log. Null when the label stands, or when the reason is one
 * the UI already words for itself.
 */
export function tooCloseToCallNote(verdict: CheapestVerdict): string | null {
  if (verdict.reason !== 'within-unverified-delivery') return null;
  const rival = verdict.runnerUp!;
  const unconfirmed = [verdict.offer!, rival]
    .filter((o) => !o.delivery.confirmed)
    .map((o) => o.retailer.name);
  const who =
    unconfirmed.length === 2
      ? `${unconfirmed[0]} and ${unconfirmed[1]}`
      : (unconfirmed[0] ?? rival.retailer.name);
  return (
    `Too close to call: ${verdict.marginGbp === null ? 'the gap' : `the ${gbp(verdict.marginGbp)} gap`} to ` +
    `${rival.retailer.name} is smaller than the delivery charge we have not yet confirmed with ${who}.`
  );
}

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

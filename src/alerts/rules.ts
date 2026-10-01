/**
 * Price drop alerts (queue item 4.1): when does a saved fragrance count as
 * "cheaper", and what does the sender remember afterwards.
 *
 * Pure: no network, no clock, no database. scripts/price-alerts.ts feeds it
 * today's prices and the stored history; src/alerts/run.ts acts on the answer.
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 * The price compared is the one the product page headlines: the cheapest
 * delivered price (`bestOffer` over `buildComparison(..., 'delivered')`). An
 * item with no buyable offer, or whose best offer has no stated delivery cost,
 * has no comparable price today and is skipped without touching its history.
 *
 * Each wishlist item carries a baseline: the last price we emailed about, or
 * the price we recorded the first time we saw it. Today's price triggers an
 * email when either
 *
 *   - it is below the baseline by at least 5% or £2, whichever is larger, or
 *   - the reader set a target and today's price is at or below it, having
 *     been above it at the baseline (or there being no baseline yet).
 *
 * The baseline only moves when an email goes out (to the price emailed) or on
 * first sighting. It does not follow the price up: a bottle that bounces
 * between £50 and £55 every other day would otherwise email every other day.
 * The cost is that after a rise, the next email waits until the price is
 * clearly below the last one we told the reader about, which is the promise
 * the account page makes ("gets cheaper").
 */
import { roundPence } from '../services/money.js';

/** Fractional drop that counts, on its own. */
export const DROP_FRACTION = 0.05;
/** Smallest drop in pounds that counts, whatever the percentage says. */
export const DROP_MIN_GBP = 2;

/** How far below `baseline` a price must fall to count as a drop. */
export function dropThreshold(baseline: number): number {
  return roundPence(Math.max(baseline * DROP_FRACTION, DROP_MIN_GBP));
}

export type AlertReason = 'drop' | 'target';

export interface ItemInput {
  /** Today's cheapest delivered price, or null when there is none to compare. */
  current: number | null;
  /** The stored baseline, or null when the sender has never seen this item. */
  baseline: number | null;
  /** The reader's own target, or null when they did not set one. */
  target: number | null;
}

export interface ItemVerdict {
  /** Why to email about this item, or null for no email. */
  alert: AlertReason | null;
  /**
   * What to store as the new baseline, or null to leave it alone.
   * `onSend` is written only once the email has gone; `now` is written
   * whatever happens (first sighting).
   */
  write: { price: number; when: 'now' | 'onSend' } | null;
}

export function evaluateItem({ current, baseline, target }: ItemInput): ItemVerdict {
  if (current === null || !Number.isFinite(current) || current < 0) return { alert: null, write: null };
  const price = roundPence(current);
  const atTarget = target !== null && price <= roundPence(target);

  if (baseline === null) {
    // First sighting. Nothing to have dropped from, so only a target that is
    // already met is worth an email.
    return atTarget
      ? { alert: 'target', write: { price, when: 'onSend' } }
      : { alert: null, write: { price, when: 'now' } };
  }

  const crossedTarget = atTarget && roundPence(baseline) > roundPence(target!);
  const dropped = roundPence(baseline - price) >= dropThreshold(baseline);
  if (crossedTarget) return { alert: 'target', write: { price, when: 'onSend' } };
  if (dropped) return { alert: 'drop', write: { price, when: 'onSend' } };
  return { alert: null, write: null };
}

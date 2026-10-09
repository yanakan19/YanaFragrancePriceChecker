/**
 * What a region's Today's Deals add to the UK's rules (the US and India,
 * docs/INTERNATIONAL-PLAN.md, "Deals on the US and India sites").
 *
 * The rule is the UK's, run by the same code with the region's currency and
 * money formatter:
 *   - bottles only (no sets, no oils), buyable offers only (in stock or low
 *     stock), never a single house's own shop;
 *   - a saving is worked from the price the product page prints (src/services/
 *     dealCandidates.ts, the UK's function, called as is);
 *   - the reference price is the shop's own, as published, in the region's
 *     currency, and it counts only when the other shops corroborate it
 *     (src/catalogue/wasPriceCredibility.ts: a reference nothing can check, or
 *     one the market refutes, is withheld, so it can never make a deal);
 *   - a reference equal to or below the price is no reference, and under one
 *     whole per cent is no deal (src/services/discount.ts).
 * The one addition, region only, and it can only take a deal away, never add
 * one: where the shop's own recorded prices for the bottle moved in the last
 * 30 days, the price now must be below the highest of them. A price that has
 * just gone UP, or sits at the top of its own recent range, is not a deal even
 * against a reference. With no recorded movement the history says nothing and
 * the UK rule decides alone. The UK has no such check (it never infers
 * anything from history); it is stated here so the beta cannot print a "deal"
 * the shop's own price record contradicts.
 */

/** Below this many deals a region's Deals tab says so instead of reading as a full list. */
export const REGION_MIN_DEALS = 6;

/** How far back a shop's own recorded prices count. */
export const DEAL_HISTORY_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Whether a shop's own price history allows `price` to be called a deal.
 * `series` is the shop's recorded prices for the bottle, [day, price] in date
 * order, a point added only when the price changed (appendRegionHistory).
 */
export function historyAllowsDeal(
  series: readonly (readonly [string, number])[] | undefined,
  price: number,
  nowMs: number,
): boolean {
  if (!series || series.length < 2) return true;
  const cutoff = nowMs - DEAL_HISTORY_DAYS * DAY_MS;
  // The price in force at the start of the window, then every change inside it.
  let inForce: number | null = null;
  const prices: number[] = [];
  for (const [day, p] of series) {
    const t = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(t) || !(p > 0)) continue;
    if (t < cutoff) inForce = p;
    else prices.push(p);
  }
  if (inForce !== null) prices.push(inForce);
  if (new Set(prices).size < 2) return true;
  return price < Math.max(...prices);
}

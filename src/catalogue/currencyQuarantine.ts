import { CURRENCY_UNCONFIRMED } from '../config/retailers.js';
import type { StoredListing } from './types.js';

/**
 * The lock that makes a currency quarantine survive the next routine run.
 *
 * ── The hole this closes ────────────────────────────────────────────────────
 * On 2026-08-13, commit 86c4660 cleared 8,104 Escentual prices after finding
 * the shop's whole list was on a scale nobody had checked. Commit 5c32130 — an
 * ordinary scheduled harvest, ninety minutes later — put all 8,104 back. No
 * one overrode anything and nothing failed: the harvest crawled the shop,
 * found figures, and wrote them, because clearing a snapshot is a fact about a
 * file and the harvest reads its instructions from the registry. A deliberate
 * decision expressed only as an absence of data lasts exactly until the next
 * thing that produces data.
 *
 * That was patched for Escentual by teaching the Shopify route to refuse a
 * non-sterling storefront. It is a good fix and it is not this one: it guards
 * one retrieval route for one failure mode, and there are seven other places
 * that write a snapshot (the Awin feed ingest, the feed catalogue run, the
 * storefront reprice, price-verify, two repair scripts, the generic crawl).
 * Any of them can put a price back.
 *
 * ── Where the decision lives instead ────────────────────────────────────────
 * CURRENCY_UNCONFIRMED in src/config/retailers.ts is the project's standing
 * declaration of which shops' currency is not established. It already stops
 * such a shop being *enabled*. This makes it stop the prices too: while an id
 * is on that list, no active listing of that retailer may carry a figure in
 * priceGbp or wasPriceGbp, whoever is writing and by whatever route.
 *
 * It throws rather than quietly dropping the offending rows. A silent drop
 * turns "this shop's prices are wrong" into "this shop yielded nothing", which
 * is the exact confusion that let 5c32130 look like a normal harvest — and a
 * caller that has just spent ten minutes crawling deserves to be told its
 * result is being refused, not to have it disappear.
 *
 * ── What is deliberately still allowed ──────────────────────────────────────
 * Delisted rows keep their prices. That figure is a record of what was charged
 * while the row was on sale, nothing published reads it, and rewriting history
 * to fix the present is its own kind of lie — the same line `quarantinePrices`
 * already draws. `nativePrice` is likewise untouched: it is the salvaged
 * figure under a currency label that says what it really is, which is the
 * honest home for exactly these numbers.
 */

export interface QuarantineViolation {
  url: string;
  field: 'priceGbp' | 'wasPriceGbp';
  amount: number;
}

/** How many violations to name in a thrown message before summarising the rest. */
const MAX_NAMED = 3;

/**
 * Active listings carrying a sterling figure they are not entitled to.
 *
 * `quarantined` is injectable so this can be tested against a fixed list
 * rather than against whatever the live registry happens to say today.
 */
export function findQuarantineViolations(
  retailerId: string,
  listings: readonly StoredListing[],
  quarantined: ReadonlyMap<string, string> = CURRENCY_UNCONFIRMED,
): QuarantineViolation[] {
  if (!quarantined.has(retailerId)) return [];

  const violations: QuarantineViolation[] = [];
  for (const listing of listings) {
    if (listing.status !== 'active') continue;
    if (listing.priceGbp !== null) {
      violations.push({ url: listing.url, field: 'priceGbp', amount: listing.priceGbp });
    }
    if (listing.wasPriceGbp !== null && listing.wasPriceGbp !== undefined) {
      violations.push({ url: listing.url, field: 'wasPriceGbp', amount: listing.wasPriceGbp });
    }
  }
  return violations;
}

/**
 * Throw unless every active listing of a currency-quarantined retailer has had
 * its sterling figures cleared. A no-op for every retailer not on the list,
 * which is all but a handful of them.
 */
export function assertNoQuarantinedGbpPrices(
  retailerId: string,
  listings: readonly StoredListing[],
  quarantined: ReadonlyMap<string, string> = CURRENCY_UNCONFIRMED,
): void {
  const violations = findQuarantineViolations(retailerId, listings, quarantined);
  if (violations.length === 0) return;

  const named = violations
    .slice(0, MAX_NAMED)
    .map((v) => `${v.url} ${v.field}=${v.amount}`)
    .join('; ');
  const rest = violations.length > MAX_NAMED ? ` (and ${violations.length - MAX_NAMED} more)` : '';

  throw new Error(
    `Refusing to write ${violations.length} sterling price(s) for "${retailerId}": that id is in ` +
      'CURRENCY_UNCONFIRMED in src/config/retailers.ts, which says nobody has established what ' +
      `currency this shop charges in. Reason on file: ${quarantined.get(retailerId)} ` +
      `First offender(s): ${named}${rest}. ` +
      'Run the figures through quarantinePrices (src/catalogue/priceQuarantine.ts) so they are kept ' +
      'as nativePrice under a currency label that is true, or establish the currency and remove the ' +
      'id from CURRENCY_UNCONFIRMED. Removing the id to make this message go away is the failure ' +
      'this check exists to prevent: a scheduled harvest silently undid exactly this quarantine on ' +
      '2026-08-13 (86c4660 cleared 8,104 Escentual prices, 5c32130 put all 8,104 back 90 minutes later).',
  );
}

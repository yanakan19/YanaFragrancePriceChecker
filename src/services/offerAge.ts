/**
 * How old a captured price can be before the site stops showing it at all.
 *
 * ONE constant and ONE rule, applied everywhere the site shows or counts a
 * price: product pages, lists, Search, Explore, Deals, Most Stocked, the
 * Cheapest tag, the shop pages and the Shops list, brand pages, the sitemap,
 * the counts in the scrolling banner, price alerts. An offer whose price was
 * last confirmed more than this many days ago is not shown, and a product
 * with no offer left inside it is not a page at all.
 *
 * History of the number (owner's decisions):
 *   - 2026-10-03: hide after 21 days. Until then there was also a second,
 *     softer line at 10 days that only decided "Cheapest"
 *     and then only the price graph's hollow points. That second line is
 *     gone: two thresholds meant two rules to explain, and the owner's
 *     instruction of 2026-10-04 is a single one.
 *   - 2026-10-04: seven days. Every listing of every shop that answers us is
 *     re-read daily (see .github/workflows/catalogue-daily.yml), so a price
 *     more than a week old belongs to a shop that has stopped answering, and
 *     it is no longer evidence of what that shop charges today.
 *
 * What "not shown" means, everywhere: the offer is dropped before it is
 * presented (`buildComparison`), so it is in no price list, no "Cheapest", no
 * deal, saving or Deal of the Day pick; it is dropped from the generated
 * catalogue at build time (scripts/build-demo-catalogue.ts), so it is not
 * counted towards its shop's listing count either; and a shop left with none
 * disappears from the Shops page and from "Not available at" lists, which
 * already key on that count being above zero. Nothing is deleted from
 * data/catalogue/: a shop whose harvest recovers reappears on the next build.
 *
 * This file imports nothing on purpose, so the rule can be read from a build
 * script, the demo bundle or a test without pulling in the pricing engine.
 */
export const HIDE_OFFER_AFTER_DAYS = 7;

const HIDE_OFFER_AFTER_MS = HIDE_OFFER_AFTER_DAYS * 24 * 60 * 60 * 1000;

/**
 * Whether a captured price is too old to show at all, see
 * `HIDE_OFFER_AFTER_DAYS`. An unparseable timestamp is not treated as old.
 */
export function isTooOldToShow(fetchedAt: string, now: Date = new Date()): boolean {
  const fetchedMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedMs)) return false;
  return now.getTime() - fetchedMs > HIDE_OFFER_AFTER_MS;
}

/**
 * Snapshots "Today's Deals" onto a fixed 6-hourly cadence.
 *
 *   npm run deals:build
 *
 * Every other generated view rebuilds on every hourly harvest, because a
 * price that just changed should show as changed immediately. Deals are
 * different on purpose: a reader browsing the deals page for ten minutes
 * should not watch the list quietly reshuffle mid-visit because an unrelated
 * hourly tick landed. So this writes its own file, on its own schedule
 * (00:00, 06:00, 12:00, 18:00 UTC — see catalogue-daily.yml's gate), and
 * demo/data.ts resolves it into full Deal records rather than computing
 * deals live on every build the way it used to.
 *
 * Only a fragrance id and the numbers are written here, never the fragrance
 * record itself — demo/data.ts already holds the full DEMO_FRAGRANCES array
 * once, so writing it a second time into this file would bundle every
 * discounted fragrance's brand, name, notes and everything else twice. The
 * first version of this file did exactly that and doubled the shipped
 * bundle from ~4mb to ~6.4mb for zero benefit; this is the fix.
 *
 * The deal logic: every fragrance whose cheapest *buyable* offer carries a
 * genuine reduction against the merchant's own stated reference price,
 * deepest saving first. The buyable test is the one thing here that does not
 * date back to demo/data.ts's original version — without it 509 of 2,385
 * deals in the previous snapshot were offers the shop had marked out of
 * stock, i.e. a fifth of the page was advertising savings on bottles nobody
 * could buy. See BUYABLE below. Imports
 * DEMO_FRAGRANCES from demo/data.ts rather than reimplementing the
 * CATALOGUE -> DemoFragrance mapping a second time here — the same
 * don't-duplicate-the-matching-logic rule scripts/build-price-history.ts
 * already follows for isFragrance/fragranceId.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { CRAWLED } from '../demo/catalogue.generated.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { StockState } from '../src/types/offer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface RawDeal {
  fragranceId: string;
  price: number;
  wasPrice: number;
  percentOff: number;
  retailerId: string;
}

/**
 * Stock states a deal may be built from.
 *
 * A deal is an active recommendation to go and buy something, so it has to be
 * something a reader can actually buy right now. This is an allowlist rather
 * than a "not outOfStock" test on purpose: preOrder is not buyable yet, and
 * unknown means the harvest could not establish stock at all — advertising a
 * saving on either would be claiming something that has not been established,
 * the same reason a retailer with no stated delivery cost never ranks as
 * cheapest. Only inStock and lowStock survive; lowStock is still in stock.
 *
 * Today the harvest only ever emits inStock and outOfStock, so preOrder and
 * unknown cost nothing to exclude — but they are the states that would
 * silently leak through a negated test if an adapter started emitting them.
 */
const BUYABLE: ReadonlySet<StockState> = new Set<StockState>(['inStock', 'lowStock']);

/**
 * Brand-direct storefronts (`retailer.singleBrandOnly`) are kept off Today's
 * Deals, the same call retailersPanel() in demo/app.ts already makes for the
 * Retailers directory and demo/data.ts's rankableShopCount now makes for the
 * Most Stocked rail: a house discounting its own line is not the kind of
 * market comparison this page exists to surface, and it still gets shown in
 * full on the fragrance's own page and the brand's own page either way. A
 * genuine discount from any other shop on the same fragrance is unaffected —
 * this only ever removes a brand-direct shop's own offer from consideration,
 * never the fragrance itself.
 */
const SINGLE_BRAND_ONLY_IDS = new Set(
  RETAILERS.filter((r) => r.singleBrandOnly).map((r) => r.id),
);

/**
 * `perfume-click` was excluded from here 2026-08-25 to 2026-08-26 on a report
 * that its RRPs were misleading. That premise was then measured, not assumed:
 * comparing its stated RRP against the RRP other shops publish for the same
 * bottle, one ratio per (product, other shop) pair, n=2,472, the median ratio
 * was 1.000 (p25 0.977, p75 1.051) — Perfume Click's reference prices agree
 * with the rest of the market. It produced 51.4% of the deals pool not by
 * inventing numbers but by *publishing* RRP on most of its catalogue where
 * most shops publish none, and an RRP sits well above street price
 * market-wide (see
 * src/catalogue/wasPriceCredibility.ts) — a problem with what a strikethrough
 * means everywhere, not a Perfume Click problem. The exclusion is removed
 * accordingly; the general fix for the market-wide RRP-inflation problem is
 * the corroboration requirement in wasPriceCredibility.ts and its use in
 * scripts/build-demo-catalogue.ts, which now withholds any reference price —
 * from any shop — that the rest of the market cannot corroborate.
 */

/**
 * Nothing below judges a reference price, and that is deliberate: a deal is
 * ranked on `wasPrice`, and `wasPrice` has already been withheld by
 * scripts/build-demo-catalogue.ts on every claim the evidence refuted or could
 * not reach. A deal resting on a refuted RRP is unreachable from here rather
 * than filtered out here, which is the stronger arrangement — one place
 * decides what a reference price may mean, and every consumer of it inherits
 * that decision without having to know the check exists.
 *
 * That began carrying real weight on 2026-08-26, when wasPriceCredibility.ts
 * gained test zero: a reference price above what the fragrance house itself
 * charges for the identical bottle is refuted however many retailers repeat
 * it. Of the previous snapshot's 1,464 deals, 97 were on a fragrance whose own
 * house is also stocked here and 72 of those advertised a saving against a
 * figure the house's own pricing contradicts — Armaf Club De Nuit Intense Man
 * EDT 105ml at "65% off RRP £69" while armaf.uk sells it at £37.99, and 71
 * more. The snapshot after it is 1,413 deals, of which 0 do. The Armaf product
 * is still here, at 6% off against FragranceHub's RRP £29.95, because £29.95
 * is under the house's own price and so is not a figure the house contradicts.
 * tests/dealsBrandDirect.test.ts asserts that property over the shipped file.
 */
const deals: RawDeal[] = DEMO_FRAGRANCES.flatMap((fragrance) => {
  const reduced = (CRAWLED[fragrance.id] ?? [])
    .filter(
      (o) =>
        BUYABLE.has(o.stock) &&
        o.wasPrice !== null &&
        o.wasPrice > o.price &&
        !SINGLE_BRAND_ONLY_IDS.has(o.retailerId),
    )
    .sort((a, b) => a.price - b.price);
  const best = reduced[0];
  if (!best || best.wasPrice === null) return [];
  return [{
    fragranceId: fragrance.id,
    price: best.price,
    wasPrice: best.wasPrice,
    percentOff: Math.floor((1 - best.price / best.wasPrice) * 100),
    retailerId: best.retailerId,
  }];
}).filter((d) => d.percentOff > 0);

const generatedAt = new Date().toISOString();

const body = `// Generated by scripts/build-deals.ts. Do not edit by hand.
//
// Refreshed at most every 6 hours (00:00, 06:00, 12:00, 18:00 UTC) — see
// that script's own header comment for why deals move on a fixed schedule
// instead of every hourly price tick. Deliberately stores a fragrance id
// rather than the fragrance record itself — demo/data.ts resolves it
// against DEMO_FRAGRANCES, which already holds that record once.

export interface RawDeal {
  fragranceId: string;
  price: number;
  wasPrice: number;
  percentOff: number;
  retailerId: string;
}

/** When this snapshot was last taken. */
export const DEALS_GENERATED_AT = ${JSON.stringify(generatedAt)};

export const DEALS_RAW: RawDeal[] = ${JSON.stringify(deals, null, 2)};
`;

writeFileSync(resolve(root, 'demo/deals.generated.ts'), body);

console.log(`demo/deals.generated.ts written: ${deals.length} deals, snapshot at ${generatedAt}`);

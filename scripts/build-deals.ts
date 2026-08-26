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
import { buildHouseAnchor } from '../src/services/discount.js';
import type { StockState } from '../src/types/offer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface RawDeal {
  fragranceId: string;
  price: number;
  wasPrice: number;
  percentOff: number;
  retailerId: string;
  /**
   * Whose figure `wasPrice` is, so the page can attribute it correctly.
   *
   *   'retailer' — the shop's own stated reference price, the same figure
   *     this field has always held, kept because the market corroborated it
   *     (wasPriceCredibility.ts).
   *   'house'    — not this shop's claim at all: the highest figure the
   *     fragrance's own manufacturer publishes for it
   *     (CatalogueEntry.houseCeiling). `houseName` carries who that is.
   *
   * See demo/app.ts's houseAnchorFor for why the two must never render with
   * the same label.
   */
  kind: 'retailer' | 'house';
  /** The manufacturer's name when kind is 'house', null otherwise — always
   *  present as a key, one shape for every reader to test against. */
  houseName: string | null;
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
 * Nothing below judges a *retailer's* reference price, and that is
 * deliberate: a deal ranked on a shop's `wasPrice` inherits withholding from
 * scripts/build-demo-catalogue.ts on every claim the evidence refuted or
 * could not reach. A deal resting on a refuted RRP is unreachable from here
 * rather than filtered out here, which is the stronger arrangement — one
 * place decides what a reference price may mean, and every consumer of it
 * inherits that decision without having to know the check exists.
 *
 * That began carrying real weight on 2026-08-26, when wasPriceCredibility.ts
 * gained test zero: a reference price above what the fragrance house itself
 * charges for the identical bottle is refuted however many retailers repeat
 * it. Of the previous snapshot's 1,464 deals, 97 were on a fragrance whose own
 * house is also stocked here and 72 of those advertised a saving against a
 * figure the house's own pricing contradicts — Armaf Club De Nuit Intense Man
 * EDT 105ml at "65% off RRP £69" while armaf.uk sells it at £37.99, and 71
 * more. The snapshot after it is 1,413 deals, of which 0 do.
 *
 * What test zero's withholding cannot do is *supply* a deal — it only ever
 * removes a shop's own claim, per src/types/offer.ts's own rule that
 * `wasPrice` means the retailer's, never a figure this project invented for
 * it. So every offer this check reaches that undercuts its own house — 852
 * products carry `CatalogueEntry.houseCeiling`, and a size-matched retailer
 * offer sits below it 325 times, measured 2026-08-26 — was, until now,
 * invisible here: Perfume Click's £23.80 on the Armaf bottle above is a real
 * ~37% saving against what Armaf itself charges, and no `wasPrice` published
 * that fact for build-deals.ts to rank on.
 *
 * `houseAnchorDeal` below is that missing candidate: a genuine saving against
 * `fragrance.houseCeiling` rather than against any shop's own claim, using
 * `buildHouseAnchor` — the exact function demo/app.ts's offerRow uses to
 * render the fragrance's own page — so a deal here and the figure the
 * fragrance's own detail page shows can never drift apart. It is checked
 * *before* the shop's own `wasPrice`, not beside it: measured 2026-08-26, 72
 * of those 325 house-anchor-eligible offers also carry a kept, corroborated
 * retailer RRP (FragranceHub's £29.95 on the same Armaf bottle, under
 * armaf.uk's own £37.99), and demo/app.ts's offerRow resolves that overlap by
 * always preferring the house's figure — the stronger evidence of the two,
 * per test zero's own ordering. This mirrors that choice rather than
 * introducing a second one: whichever reference price the fragrance's own
 * page would actually show for an offer is the one a deal built from that
 * offer states too.
 *
 * Measured end to end, old logic against new logic over the identical
 * 2026-08-26 harvest so the comparison isolates this change alone rather than
 * the ordinary hour-to-hour price drift: 1,414 deals before, 1,502 after. Of
 * the 134 house-anchored deals in the new snapshot, 88 are fragrances that
 * carried no deal at all before — the market-tail case this exists for, a
 * genuine saving against the manufacturer with no retailer RRP to rank on —
 * and 46 replace what was a retailer-RRP deal on the same fragrance a moment
 * ago, per the priority rule above (88 + 46 = 134; the net gain is exactly
 * the 88 brand-new ones, since a replacement does not change the count).
 *
 * tests/dealsBrandDirect.test.ts's "never out-claim the fragrance house" test
 * still holds automatically here: a house-anchored deal's `wasPrice` field
 * *is* `fragrance.houseCeiling`, so it can never exceed it.
 */
function houseAnchorDeal(
  fragrance: (typeof DEMO_FRAGRANCES)[number],
  offer: { price: number; retailerId: string },
): RawDeal | null {
  if (fragrance.houseCeiling === null) return null;
  const anchor = buildHouseAnchor(offer.price, fragrance.houseCeiling, fragrance.brand);
  if (!anchor) return null;
  return {
    fragranceId: fragrance.id,
    price: offer.price,
    wasPrice: anchor.housePriceGbp,
    percentOff: anchor.percentOff,
    retailerId: offer.retailerId,
    kind: 'house',
    houseName: anchor.houseName,
  };
}

const deals: RawDeal[] = DEMO_FRAGRANCES.flatMap((fragrance) => {
  const candidates: RawDeal[] = [];
  for (const o of CRAWLED[fragrance.id] ?? []) {
    if (!BUYABLE.has(o.stock) || SINGLE_BRAND_ONLY_IDS.has(o.retailerId)) continue;

    const houseDeal = houseAnchorDeal(fragrance, o);
    if (houseDeal) {
      candidates.push(houseDeal);
      continue;
    }

    if (o.wasPrice !== null && o.wasPrice > o.price) {
      candidates.push({
        fragranceId: fragrance.id,
        price: o.price,
        wasPrice: o.wasPrice,
        percentOff: Math.floor((1 - o.price / o.wasPrice) * 100),
        retailerId: o.retailerId,
        kind: 'retailer',
        houseName: null,
      });
    }
  }

  // The cheapest qualifying offer wins, same rule as before test zero: a deal
  // names the cheapest buyable way to get a genuine saving, not the deepest
  // percentage.
  candidates.sort((a, b) => a.price - b.price);
  return candidates[0] ? [candidates[0]] : [];
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
  /**
   * Whose figure \`wasPrice\` is: the shop's own corroborated reference price
   * ('retailer'), or the fragrance's own manufacturer's price ('house') — see
   * this script's own header comment. demo/data.ts and demo/app.ts render the
   * two differently so a house figure is never attributed to the shop.
   */
  kind: 'retailer' | 'house';
  /** The manufacturer's name, set only when kind is 'house'. */
  houseName: string | null;
}

/** When this snapshot was last taken. */
export const DEALS_GENERATED_AT = ${JSON.stringify(generatedAt)};

export const DEALS_RAW: RawDeal[] = ${JSON.stringify(deals, null, 2)};
`;

writeFileSync(resolve(root, 'demo/deals.generated.ts'), body);

{
  const houseDeals = deals.filter((d) => d.kind === 'house').length;
  console.log(
    `demo/deals.generated.ts written: ${deals.length} deals (${houseDeals} house-anchored, ` +
      `${deals.length - houseDeals} against a retailer's own RRP), snapshot at ${generatedAt}`,
  );
}

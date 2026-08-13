/**
 * How much of the comparison rests on a delivery figure nobody has verified.
 *
 * The site's headline number is a delivered price — item price plus delivery —
 * and it is the default sort key, so the delivery figure decides which shop the
 * site calls "Cheapest". Most of those figures currently carry
 * `shipping.confidence: 'unverified'`. This script measures what that actually
 * costs, against the real harvested catalogue rather than an assumption, so the
 * presentation decision can be proportionate to the evidence.
 *
 * Three numbers, and they answer different questions:
 *
 *   1. how many live listings come from a shop whose delivery cost is
 *      unverified, or not stated at all;
 *   2. how often the shop we label "Cheapest" is one whose own delivery figure
 *      is unverified;
 *   3. how often the *gap* between first and second place is smaller than an
 *      unverified delivery component in play. That is the one that matters: if
 *      the winner leads by 80p and 80p of somebody's delivered price is an
 *      unverified assertion, the site does not actually know which shop is
 *      cheaper, and "Cheapest" is a claim it cannot support.
 *
 * Nothing here fetches anything or writes anything. Run:
 *   npm run shipping:confidence
 */
import { CATALOGUE, CRAWLED, offersFor } from '../demo/catalogue.generated.js';
import { buildComparison, purchasableOffers } from '../src/services/priceService.js';
import { cheapestVerdict, deliveredPriceRange } from '../src/services/deliveryConfidence.js';
import { RETAILERS } from '../src/config/retailers.js';

const enabled = RETAILERS.filter((r) => r.enabled);
const unverified = enabled.filter((r) => r.shipping.confidence === 'unverified');
const unstated = enabled.filter((r) => r.shipping.standardGbp === null);

const gbp = (n: number) => `£${n.toFixed(2)}`;
const pct = (n: number, of: number) => (of === 0 ? 'n/a' : `${((n / of) * 100).toFixed(1)}%`);

console.log('── registry ────────────────────────────────────────────────────');
console.log(`${RETAILERS.length} retailers, ${enabled.length} enabled`);
console.log(`  delivery confidence 'unverified': ${unverified.length}`);
console.log(`    ${unverified.map((r) => r.id).join(', ')}`);
console.log(`  standardGbp null (no rate stated): ${unstated.length}`);
console.log(`    ${unstated.map((r) => r.id).join(', ')}`);

// ── listing counts ───────────────────────────────────────────────────────────
const enabledIds = new Set(enabled.map((r) => r.id));
const unverifiedIds = new Set(unverified.map((r) => r.id));
const unstatedIds = new Set(unstated.map((r) => r.id));

let listings = 0;
let listingsUnverified = 0;
let listingsUnstated = 0;
for (const rows of Object.values(CRAWLED)) {
  for (const o of rows) {
    if (!enabledIds.has(o.retailerId)) continue;
    listings++;
    if (unverifiedIds.has(o.retailerId)) listingsUnverified++;
    if (unstatedIds.has(o.retailerId)) listingsUnstated++;
  }
}

console.log('\n── live listings ───────────────────────────────────────────────');
console.log(`${listings} listings from enabled retailers`);
console.log(`  delivery cost unverified: ${listingsUnverified} (${pct(listingsUnverified, listings)})`);
console.log(`  delivery cost not stated at all: ${listingsUnstated} (${pct(listingsUnstated, listings)})`);

// ── how often the winner is decided by an unverified figure ──────────────────
let withComparable = 0;
let winnerUnverified = 0;
let contested = 0;
let marginUnderRisk = 0;
let flipsOnItemPrice = 0;
let freeClaimUnverified = 0;
let undecided = 0;
const examples: string[] = [];

for (const frag of CATALOGUE) {
  const rows = buildComparison(offersFor(frag.id), { sortBy: 'delivered' });
  // Only rows that can be compared at all: buyable, with a delivered price.
  // A shop with no stated delivery cost is already barred from winning by
  // bestOffer, so it cannot be the subject of this measurement.
  const comparable = purchasableOffers(rows).filter((r) => r.deliveredPriceGbp !== null);
  if (comparable.length === 0) continue;
  withComparable++;
  const best = comparable[0]!;
  if (!best.delivery.confirmed) winnerUnverified++;
  if (comparable.length < 2) continue;
  contested++;

  const second = comparable[1]!;
  const margin = second.deliveredPriceGbp! - best.deliveredPriceGbp!;

  // What is at stake if an unverified rule is wrong.
  //
  // The exposed amount is that retailer's standard rate, not the cost this
  // basket happened to land on, because an unverified rule can be wrong in
  // either direction: we may be charging £2.99 the shop does not charge, or
  // waiving it on a free-over threshold we never read. Either way the
  // delivered price can move by up to the standard rate, so that is the amount
  // by which the gap between first and second could close.
  //
  // A shop whose unverified rule says "always free" (standardGbp 0) scores 0
  // here. That is not a claim it is safe — it is that the error is unbounded
  // and therefore unquantifiable, so it is counted separately below rather
  // than folded in with a number we cannot justify.
  const exposure = (r: (typeof comparable)[number]) =>
    r.delivery.confirmed ? 0 : r.retailer.shipping.standardGbp ?? 0;
  const risk = Math.max(exposure(best), exposure(second));

  // The rule the site actually ships: an unverified delivery figure widens a
  // row's possible delivered price, and the winner keeps the "Cheapest" label
  // only when its worst reading still beats the runner up's best one.
  if (!cheapestVerdict(rows).decided) undecided++;

  if (risk > 0 && margin < risk) {
    marginUnderRisk++;
    if (examples.length < 10) {
      const tag = (r: (typeof comparable)[number]) =>
        `${r.retailer.name} ${gbp(r.deliveredPriceGbp!)} = ${gbp(r.itemPriceGbp)} + ${gbp(
          r.delivery.costGbp ?? 0,
        )} ${r.delivery.confirmed ? 'confirmed' : 'UNVERIFIED'}`;
      examples.push(
        `${frag.brand} ${frag.name} ${frag.sizeMl}ml — margin ${gbp(margin)}, exposure ${gbp(risk)}\n` +
          `      1st ${tag(best)}\n      2nd ${tag(second)}`,
      );
    }
  }

  // The starkest version of the same question: an unverified delivery figure is
  // the only reason this shop is first, because on item price alone the runner
  // up is cheaper.
  if ((!best.delivery.confirmed || !second.delivery.confirmed) && second.itemPriceGbp < best.itemPriceGbp) {
    flipsOnItemPrice++;
  }

  // Winner rides on an unverified free-delivery claim: either "always free" or
  // "free over a threshold", neither read off the shop's own page. If that
  // claim is wrong the delivered price rises by an amount nobody has bounded.
  if (!best.delivery.confirmed && best.delivery.isFree) freeClaimUnverified++;
}

console.log('\n── the "Cheapest" label ────────────────────────────────────────');
console.log(`${withComparable} products have at least one buyable, comparable offer`);
console.log(
  `  winner's own delivery figure is unverified: ${winnerUnverified} (${pct(winnerUnverified, withComparable)})`,
);
console.log(`${contested} products have two or more comparable offers (a real contest)`);
console.log(
  `  gap to second place smaller than an unverified delivery figure in play: ${marginUnderRisk} (${pct(
    marginUnderRisk,
    contested,
  )})`,
);
console.log(
  `  winner would lose on item price alone: ${flipsOnItemPrice} (${pct(flipsOnItemPrice, contested)})`,
);
console.log(
  `  winner wins on an unverified free-delivery claim: ${freeClaimUnverified} (${pct(
    freeClaimUnverified,
    contested,
  )})`,
);
console.log(
  `  SHIPPED RULE — "Cheapest" withheld, ranges overlap: ${undecided} (${pct(undecided, contested)})`,
);

if (examples.length > 0) {
  console.log('\n── examples ────────────────────────────────────────────────────');
  for (const e of examples) console.log('  ' + e);
}

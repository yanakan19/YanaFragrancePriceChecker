# ScentDay — price comparison core

Retailer registry and offer-presentation layer for the ScentDay UK fragrance
price comparison site.

This is Phase 1 groundwork: the twelve-retailer registry, shipping rules, and the
logic that turns a captured offer into a comparison row you can trust. There is
no fetching layer yet — that is the Phase 0 spike (JSON-LD vs managed scraper per
domain), and `adapter` is `'unknown'` on every retailer until it lands.

```bash
npm install
npm test                      # 71 tests
npm run typecheck
npm run affiliate:status      # what's still unmonetised, and the next step
npm run shipping:staleness    # which delivery rules need confirming
```

## The idea

Every retailer here is a legitimate UK stockist and every one is fine to send a
customer to. There is no `trusted` flag — see [D1](docs/DECISIONS.md#d1--there-is-no-trusted-flag)
for why the old one was dropped rather than renamed.

What actually separates a good listing from a bad one is whether we tell the
truth about it:

- **The genuine price**, as charged right now.
- **The retailer's own was/now and discount %**, when there is a real promotion —
  never a figure we derived, never rounded up, never a countdown we invented.
- **The delivery cost that will appear at checkout**, including whether this
  order clears that retailer's free-delivery threshold.
- **The stock state**, with explicitly out-of-stock listings grouped at the
  bottom rather than mixed in.

Those are enforced in `src/services/`, not left to whoever builds the UI.

## Usage

```ts
import { buildComparison, bestOffer, formatGbp } from './src/index.js';

const rows = buildComparison(capturedOffers, { sortBy: 'delivered' });

for (const row of rows) {
  console.log(
    row.retailer.name,
    formatGbp(row.deliveredPriceGbp),
    row.delivery.isFree ? 'free delivery' : formatGbp(row.delivery.costGbp),
    row.discount ? `${row.discount.percentOff}% off` : '',
    row.isPurchasable ? '' : 'out of stock',
  );
}
```

`buildComparison` returns rows already ordered — buyable first, then by delivered
price. `purchasableOffers` / `outOfStockOffers` split them into the two visual
groups; `bestOffer` returns the cheapest row a customer can actually buy from.

## Why delivered price is the default sort

Shipping regularly exceeds the price gap on fragrance, and thresholds across the
registry run from £25 to £300.

The regression test for this: **Boots at £24.99 has the cheapest item price in
the table and the most expensive delivered price** — it misses its own £25 free
delivery threshold by a penny, so it lands £2.95 above a £26 listing that ships
free. Sorting on item price would have put it first.

## Layout

```
src/
  types/retailer.ts        Registry types + why there's no trust flag
  types/offer.ts           Raw and presented offer shapes
  config/retailers.ts      ← the registry
  config/tiktokSellers.ts  TikTok beta, isolated and off by default
  services/
    priceService.ts        Comparison assembly, ordering, grouping
    shipping.ts            Delivery resolution and thresholds
    discount.ts            Was/now/% and countdown eligibility
    affiliate.ts           Outbound links + the setup reminder
    money.ts               Pence rounding, GBP formatting
docs/
  DECISIONS.md             What was decided, why, and what's still open
  AFFILIATE_SETUP.md       How to set the programmes up when you're ready
```

## Data quality caveat

**All twelve shipping rules are marked `unverified`.** They were sourced from
search results, not read off each retailer's delivery page, and delivery terms
change without notice. A stale free-delivery threshold produces a wrong delivered
price, which is the most damaging error this app can make — it is invisible to
the user and looks authoritative.

`DeliveryDisplay.confirmed` is `false` for all of them; surface that caveat in
the UI until they have been checked. Selfridges is the worst case: sources
disagree on whether free delivery starts at £100 or £150.

## Affiliate

Nothing is monetised. Every link resolves to the plain retailer URL, which is
correct and clickable, just unpaid. Boots, LOOKFANTASTIC and Superdrug are
confirmed Awin merchants; the other nine need researching.

When you are ready, [`docs/AFFILIATE_SETUP.md`](docs/AFFILIATE_SETUP.md) has the
process. The one thing worth applying early: **apply after the site is live**, as
Awin rejects applications pointing at holding pages, and re-applying after a
rejection is harder than applying once at the right moment.

## Next

Phase 0 spike, before more app code: test a plain `fetch` + JSON-LD parse against
all twelve domains. If `schema.org/Product` covers eight of them, that path is
~50ms and free and a managed scraper becomes the fallback for the awkward four
rather than the default — which roughly halves the running cost of the whole
project.

Then Phase 1: the matcher and its ~200 hand-labelled title test set. Nothing else
should be built until that clears 95%.

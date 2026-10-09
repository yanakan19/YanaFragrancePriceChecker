# PriceSniffs

Fragrance price comparison, live at **[pricesniffs.space](https://pricesniffs.space)**:
the same bottle across many shops, compared on the price you actually pay with
delivery included.

- **Three regions.** The UK at `/` (the main site, 63 live shops of 87 in the
  registry in the build of 9 October 2026), and the USA at `/us/` and India at
  `/in/` (public beta since 9 October 2026; 20 and 10 shops). Plan:
  [docs/INTERNATIONAL-PLAN.md](docs/INTERNATIONAL-PLAN.md).
- **The crawls** (`.github/workflows/catalogue-daily.yml` for the UK, several
  times a day; `catalogue-us.yml` and `catalogue-in.yml` once a day) harvest
  each shop's own listings, rebuild the catalogue and commit it.
- **The site** (`demo/`) is built from that catalogue at deploy time and
  published to GitHub Pages (`deploy-pages.yml`).
- **Accounts and wishlists** run on Supabase (`supabase/`); the iOS and
  Android apps are thin shells in `apps/`.

## Before you push: the live branch

`claude/scentday-retailer-registry-h92tth` is live: Pages deploys from it and
the crawls push to it all day. Read **[CLAUDE.md](CLAUDE.md)** first: the
generated files manifest (`scripts/generated-files.txt`), the deploy files
that are never committed, the append only memory files, the changelog rules,
staging by name and never force pushing.

## Build and test

```bash
npm ci
npm run demo        # build the page, its data files, sitemaps and route pages (gitignored)
npx tsc --noEmit    # typecheck
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/<file>.test.ts
```

Run tests by file or in small groups (about 20 files at a time) with the
single fork pool shown: the whole suite in one process needs more memory than
a small machine has. `npm test` runs everything and builds the page first when
it is missing or stale; run `npm run demo` once before running a page test
directly. Because the page fetches its data files, serve `demo/` over HTTP to
look at it (`npm run screenshot` and the Playwright scripts do).

Other commands worth knowing: `npm run affiliate:status` (what is still
unmonetised), `npm run shipping:staleness` (delivery rules due a re-check),
`npm run rebuild` (the generated catalogue modules, when you changed what
they are built from; see `CLAUDE.md`).

## Where things are

```
demo/               the website's source: app.ts, template.html, router, sw.js,
                    and the rebuilt *.generated.ts modules; the built page is
                    not committed (built at deploy time)
src/                the pricing rules and catalogue logic the site bundles
                    (services/, catalogue/, config/retailers.ts = the registry)
scripts/            harvest, crawl, build, deploy and report scripts (`npm run …`);
                    scripts/oneoff/ holds hand-run analyses and backfills
data/               shop snapshots, region data and reports the crawls commit
tests/              the vitest suite; tests/fixtures/ holds small cuts
fixtures/           larger saved shop pages the tests and fixture crawl read
social/             social posts (text and sources; pictures are not committed)
apps/               the iOS and Android app shells
supabase/           accounts and wishlist database
docs/               guides, plans, decisions and reports: start at docs/README.md
.github/workflows/  the crawls, the deploy and the checks that run on GitHub
```

All guides, plans and reports are indexed in **[docs/README.md](docs/README.md)**.
Steps only the owner can take (including the environment cache fix and the
commit signing key that used to be described here) are in
[docs/OWNER-STEPS.md](docs/OWNER-STEPS.md) and
[docs/DECISIONS.md](docs/DECISIONS.md) (D10, D12, D16, D17, D19).

## The idea

Every retailer here is a legitimate stockist and every one is fine to send a
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

## Data quality

Delivery terms carry the date they were read from the shop's own delivery
page, shown beside them in the app. Entries still marked `unverified` in
`src/config/retailers.ts` were sourced indirectly and need confirming;
`npm run shipping:staleness` lists those and any due a re-check. A shop that
publishes no standard rate shows "delivery not stated" and is never ranked as
the cheapest. Every "was £X" a shop claims is checked against the other shops
selling the same bottle before a discount is shown; see
`src/catalogue/wasPriceCredibility.ts`.

## Affiliate

The programmes that are live and monetised carry `status: 'active'` in
`src/config/retailers.ts` (`npm run affiliate:status` lists them). Every
other link goes to the plain retailer URL. Setting up more
is in [docs/AFFILIATE_SETUP.md](docs/AFFILIATE_SETUP.md); the TikTok Shop
route is in [docs/TIKTOK-SHOP-PLAN.md](docs/TIKTOK-SHOP-PLAN.md).

## What's next

[docs/FEATURE-ROADMAP.md](docs/FEATURE-ROADMAP.md) and
[docs/README.md](docs/README.md) list the plans; the iOS and Android apps are
in [docs/MOBILE-APPS.md](docs/MOBILE-APPS.md).

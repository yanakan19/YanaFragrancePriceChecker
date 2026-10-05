# The fragrance database

How PriceSniffs knows what each shop sells, how that updates daily, and where the
NEW badge comes from.

## Two questions, two tables

The catalogue and the price comparison answer different questions, and keeping
them apart is what makes the rest work.

- **What does this shop sell?** That is a `listing`: one row per product per
  shop, carrying the shop's own title, SKU, URL and EAN. A listing exists
  whether or not we have managed to price it or match it yet.
- **What does it cost right now?** That is an `offer`, hanging off a listing.

A listing can be new, delisted or unmatched independently of its price. If the
two were one table, a product that briefly went out of stock would look like a
new arrival when it came back.

## The shape

```
brands ──< fragrances ──< variants ──< listings >── retailers
                                          │
                                          ├── offers        (current price)
                                          ├── price_history (append only)
                                          └── match_queue   (awaiting review)
```

`src/catalogue/schema.sql` is the real definition. The JSON store in
`src/catalogue/store.ts` mirrors it exactly while the project has no database,
so moving to Postgres replaces one file and nothing above it.

The important separations:

- **`fragrances` against `variants`.** Sauvage 100ml and Sauvage 60ml are one
  fragrance and two variants. Prices only ever compare within a variant.
- **`variants.condition`.** A tester, a gift set and a refill are not comparable
  with a sealed bottle and must never share a price table.
- **`listings.variant_id` is nullable.** A listing we cannot confidently match
  sits unmatched rather than being forced into the wrong comparison.

## What each shop lists under fragrance

Every retailer carries a `catalogue` block in `src/config/retailers.ts` naming
the sections that actually enumerate its fragrance range. Shops divide it
differently: Notino splits women, men and niche; Boots and John Lewis have one
tree; Selfridges buries fragrance inside beauty. Each section records its URL
template, which catalogue tier it maps to, and a politeness delay.

> The section URLs are a first pass and have **not** been confirmed against the
> live sites, because this environment cannot reach retail domains. Check each
> one before the first live crawl. A wrong URL is not dangerous, it just yields
> nothing, and the run report will show a shop returning zero listings.

## The daily crawl

`npm run catalogue` walks every configured section, parses each page, and
reconciles the result against yesterday.

Parsing is JSON-LD first, which is the Phase 0 bet from the plan: most UK retail
pages embed a `schema.org/Product` block with price, availability, image and
often a GTIN. Where that holds it costs roughly fifty milliseconds and nothing
per page, and a managed scraper is only needed for the awkward minority.
`src/catalogue/jsonld.ts` handles the shapes real sites emit rather than the
ones the specification implies: `@graph` wrappers, `ItemList` pages, offers as
arrays, prices like `"£232.50"`, and availability with or without the
schema.org prefix.

Four rules in `reconcile()` carry most of the weight:

1. **The first crawl of a shop is a baseline.** Everything it finds is recorded
   but marked ineligible for the badge. Otherwise launch day flags an entire
   catalogue as new, which tells a reader nothing and teaches them to ignore the
   badge for good.
2. **`firstSeenAt` never moves.** A product that vanishes for a fortnight and
   returns is not new. It gets `relistedAt` instead.
3. **A partial crawl delists nothing.** Absence is only evidence when the crawl
   actually finished. A network wobble halfway through must never delist half a
   shop.
4. **A failed crawl writes nothing.** Saving an empty catalogue would delist
   everything, then flag it all new on recovery.

## Old addresses of merged products

When two products turn out to be one bottle, one record absorbs the other and
the absorbed id leaves the catalogue. Its address now opens the product that
holds it, and the address bar is rewritten to that product's.

- The build (`scripts/build-demo-catalogue.ts`) works the map out from its own
  merge decisions, nothing by hand: what `findDuplicateGroups` absorbed, the
  other ids of every listing that joined a product (its SKU form where the
  product is keyed on a barcode), an earlier SKU of a Shopify variant a live
  product holds now (`lineageKey`), and a hidden listing that is plainly the
  same bottle as one live product. `src/catalogue/idAliases.ts` settles them.
- Only an id that was a page before the build (in the last catalogue) is
  published, so the file is the size of the real problem. An id that is a page
  again, or one whose product is gone, is dropped.
- `data/id-aliases.json` is the memory between builds (a `rebuild` file in
  `scripts/generated-files.txt`): an alias made once is kept, and when its
  target is folded again it is moved on to the new holder.
- The page reads it from `demo/dormant.generated.ts` (`ID_ALIASES`), the lazy
  file fetched only for an address that is not in the catalogue, so the first
  load does not grow. The unknown address is kept off search engines until the
  file says where it went, then the address and canonical become the
  survivor's, and no old address is in the sitemap.
- `data/product-slugs.json` is the same kind of memory for product addresses
  (`/BRAND_NAME_VOLUME`, docs/PRODUCT-URLS.md): every product id ever given a
  slug, never reassigned and never deleted, also a `rebuild` file. A slug is
  written on each catalogue and dormant entry, and the slug of a product folded
  into another is an alias of the survivor (`SLUG_ALIASES`, in the same lazy
  file as `ID_ALIASES`).
- To start the file afresh from what earlier builds published, run
  `scripts/id-alias-seed.sh <dir>` (reads the branch's history) and then
  `npm run catalogue:demo -- --seed-ids <dir>/ids.txt --seed-aliases <dir>/aliases.tsv`.

## The NEW badge

A listing shows NEW next to a shop's name when all three hold:

- first seen within the last seven days (`NEW_WINDOW_DAYS`),
- eligible, meaning it did not arrive in that shop's baseline crawl,
- still listed.

It is **per shop**, deliberately. Notino adding Khamrah is news about Notino and
says nothing about whether Boots has carried it for two years.

## Running it

```bash
npm run catalogue:fixtures   # build saved pages to crawl against
npm run catalogue -- --source=fixtures --fixtures=fixtures/catalogue/day1
npm run catalogue -- --source=fixtures --fixtures=fixtures/catalogue/day2
npm run catalogue:demo       # turn snapshots into the app's data
npm run demo                 # rebuild the page

npm run catalogue -- --source=live    # the real thing
```

Snapshots land in `data/catalogue/<retailer>.json`, one file per shop so a bad
run for one cannot corrupt the rest.

### What was actually run

Both fixture days, from a clean baseline. Day one ingested 25 listings across
six shops and flagged **zero** as new, which is the baseline guard working. Day
two found five genuine additions and one product that had sold through:

```
Allbeauty     5 listings  1 new  1 gone
Notino UK     7 listings  2 new
Boots         6 listings  1 new
Superdrug     4 listings  1 new
```

The prices in the app come from that run. Nothing is typed by hand any more:
`demo/catalogue.generated.ts` is pipeline output, joined to fragrances on EAN,
and the badges are computed from `firstSeenAt`.

**The crawl has never run against a live shop.** This environment's network
policy rejects all twelve retail domains at the proxy, so the figures currently
shown came from saved pages. Pointing it at `--source=live` where the network is
open replaces every number with a real one and no other code changes.

## Scheduling

`.github/workflows/catalogue-daily.yml` runs at 06:00 UTC daily and commits the
snapshots, so the diff is the audit trail of what each shop changed overnight.
It runs the test suite **before** crawling: broken reconciliation logic corrupts
`firstSeenAt` for every listing, and no later run can repair that, so the badge
would be wrong for a week.

## Still to build

- **Matching.** `variant_id` is populated only by exact EAN today. Titles need
  the brand, line, concentration and size parsing described in the plan, with a
  confidence threshold and a review queue. That is Phase 1 and nothing else
  should be built until it clears 95 per cent on a hand labelled test set.
- **Adapters for shops with no JSON-LD.** `adapter` is `unknown` on all twelve
  until the live spike says otherwise. Expect Boots and John Lewis to need more
  than a plain fetch.
- **Price history.** The table exists in the schema and the crawl does not write
  it yet. Flash deal detection needs about thirty days of it before it can say
  anything.
- **Confirming the section URLs**, per the warning above.

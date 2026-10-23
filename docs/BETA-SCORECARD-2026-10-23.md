# Beta scorecard: US, India and Canada, 23 October 2026

Owner request: for each beta country (`/us/`, `/in/`, `/ca/`), a scorecard against the criteria for leaving
beta, measured today, with the gaps and the cheapest fix for each. Measure and write only: nothing in the
code, the workflows or the data was changed to produce it.

## What "leave beta" is measured against

The plan has no single "leave beta" rule. The criteria are the five checks of `docs/INTERNATIONAL-PLAN.md`
section 7 ("What to measure before committing to the US"): (1) overlap, **at least a quarter of products
with two or more shops**; (2) match rate; (3) demand; (4) cost; (5) money, at least three shops or feeds
approved on an affiliate network. The owner waived the quarter bar for the US and India on 9 October 2026
(D30), and decision 6 deferred affiliate sign ups, so those two bars are the ones every beta fails or
skips. Only the quarter has a number in the plan. Where the plan gives no number, the **target column below
is my proposal** and is marked "(proposed)". The Canada beta is the same shape (22 October).

## How each number was measured

Measured on 23 Oct 2026 about 08:30 UTC from the committed region data (`data/regions/<us|in|ca>/`: US
built 22 Oct 13:57 UTC, India 23 Oct 00:08, Canada 22 Oct 17:45) and the shop registry
(`src/config/retailers.<us|in|ca>.ts`). Products are rebuilt with the crawl's own call
(`readRegionInputs` and `regionProducts` in `scripts/regionSite.ts`) so every figure matches the committed
`report.json` (checked: products, two or more shops, independent share, three or more shops).

- **Independent shops.** A shop's `catalogueGroup` counts once, as on 9 Oct (`sourceOf` in
  `src/catalogue/regionCatalogue.ts`). Only the US has a group: **Perfumania, Fragrance Outlet and
  Fragrance Market** (`perfumania-catalogue`). India and Canada have none, so their raw and independent
  figures are equal. 9 Oct: US 26.5% raw, 9.2% independent; India 12.9%.
- **Median gap** = (dearest minus cheapest) / cheapest over products with two or more independent
  shops (`report.json` uses all products with two or more offers; the US figure differs, see table).
- **Duplicates** = products sharing `duplicateKey` (`src/catalogue/duplicateKey.ts`: brand alias, name core,
  size, strength), the yardstick `scripts/find-duplicates.ts` uses.
- **Name noise**, from `scripts/oneoff/name-noise-report.ts` (pipe tails) plus three counts of my own: a
  trailing gender tag such as "(W)" or "(M)", promotional words, names over 70 characters. "Own brand
  repeated inside the name" is counted too but is mostly legitimate ("Burberry by Burberry"), so it is not
  used for pass or fail.
- **Eau de Cologne beside other strengths**: an Eau de Cologne product whose name, brand and size also exist
  as another stated strength (`strengthBlindKey`). Eau de Cologne is a strength of its own (owner decision 20 Oct).
- **Photos**: a product has a photo if it has a UK photo or any offer carries the shop's own `imageUrl`.
- **Freshness**: age of each shop's snapshot `updatedAt`; runs from `gh api` for the three workflows,
  last 7 days.
- **Demand**: aggregate totals from `site_page_views` (the query of `docs/OWNER-STEPS.md` 8d, grouped; no
  row-level data read). It counts since 5 Oct.
- Figures that are estimates (not re-measured after a change) say "estimate".

## Headline

| | US `/us/` | India `/in/` | Canada `/ca/` |
| --- | --- | --- | --- |
| Products shown | 20,468 | 15,340 | 26,608 |
| Shops with prices (of enabled) | 20 of 22 | 10 of 13 | 10 of 10 |
| 2+ independent shops (bar 25%) | **13.1%** (raw 31.5%) | **16.5%** | **23.9%** |
| Gap to the bar, in products | about 2,400 | about 1,300 | about 300 |
| 3+ independent shops | 568 (2.8%) | 728 (4.7%) | 2,177 (8.2%) |
| Daily crawl, last 7 days | 7 of 7 green | 7 of 7 green | 1 run (manual) green, no scheduled run yet |
| Could leave beta | not soon | not soon | first |

## 1. Comparison

| Criterion | US | India | Canada | Target | Result |
| --- | --- | --- | --- | --- | --- |
| Products with 2+ shops, raw | 6,482 (31.5%) | 2,555 (16.5%) | 6,355 (23.9%) | n/a | n/a |
| Products with 2+ **independent** shops | 2,702 (**13.1%**) | 2,555 (**16.5%**) | 6,355 (**23.9%**) | at least 25% | US fail, India fail, Canada fail by 1.1 points |
| Same, both offers in stock (stricter, informational) | 1,152 (5.6%) | 1,737 (11.3%) | 2,445 (9.2%) | n/a | n/a |
| Products with 3+ independent shops | 568 (2.8%) | 728 (4.7%) | 2,177 (8.2%) | none set | n/a |
| Median gap, cheapest to dearest (independent) | 20.1% | 17.3% | 22.4% | none set | n/a (comparison is worth having) |
| Median gap in `report.json` | 32.5% | 17.3% | 22.4% | | |

The US raw figure (31.5%) is inflated by the sister shops: Perfumania, Fragrance Outlet and Fragrance
Market each have 91 to 96% of their products shared with another shop, mostly each other. Since 9 Oct
the US independent share rose from 9.2% to 13.1% and India's from 12.9% to 16.5%.

**Cheapest fixes (comparison)**

| Country | Fix | Expected effect | Effort | Who |
| --- | --- | --- | --- | --- |
| Canada | Read the strength from the shop's product type for Maximum Fragrance, Parfum Exquis and H Parfums (set the existing flag, `strengthOfFlaggedShopType` in `src/catalogue/regionCatalogue.ts`, three registry lines). Their titles name no strength, so 8,278 products sit as "Not stated" and do not meet the same bottle at other shops | Resolves about 6,200 of their listings (688 + 3,118 + 2,422 measured). Needs only about 300 more products to pass; likely enough, to be re-measured | small, under one session | agent |
| Canada | Strip the trailing "(M)", "(W)", "(U)" tag from Fragrance Canada names (4,571 products, 17.2%) so they meet the same bottle elsewhere; 92 duplicate groups (187 products) would shrink | Adds a few dozen to a few hundred shared products, to be re-measured | small | agent |
| Canada | Probe Rexall, Jean Coutu, Well.ca product pages (robots.txt allows `*`; the plan's next step) | adds a mainstream shop; unknown yield | 1 session | agent |
| India | Let Nykaa (1,649 listings read of 3,069 sitemap addresses; 751 not re-seen) and AAR Fragrances (2,255, 1,586 not re-seen) finish: both stop on their time budget but read up to 1,000 unseen pages a run | rises on its own over the next days; re-measure on 26 Oct | none | agent, check |
| India | Fix Perfume Network's page 7 of `products.json` answering HTTP 503 (1,902 listings read; a slower gap or a retry) | small | small | agent |
| India | A second research round for multi brand Indian shops that allow the bot. The 9 Oct list has none left: Tira and Ajio are walled, Tata CLiQ and Kama Ayurveda are client rendered, Myntra did not answer, Purplle serves the runner a bot check (D23, not worked around) | needed to pass: +1,280 products | 1 session to find, 1 to wire | agent, then owner if a network is needed |
| US | Wire Dillard's: readable (about 1,700 fragrance pages, JSON-LD in USD) but the shared reader returns one unsized listing a page; needs a reader of its `offers[]` | adds a designer department store; yield not measured | 1 session | agent |
| US | Raise the time budget for Ulta (703 pages kept, stopped early, about 2,812 addresses), The Perfume Spot (182 listings not re-seen) and Luckyscent | more rows from shops that already share 27% to 28% of their products; the crawl is 42 minutes of an 80 minute cap | small | agent |
| US | The big discounters (FragranceNet, FragranceX, Perfume.com, Macy's and the rest) refused the bot: they come only with affiliate feeds (decision 6, Awin US, CJ, Rakuten, Impact) | the only route to the quarter | weeks | owner |

## 2. Matching

| Criterion | US | India | Canada | Target | Result |
| --- | --- | --- | --- | --- | --- |
| Listings with a trusted barcode (`report.json`) | 19.9% | 1.2% | 25.4% | none set; plan only asks for the rate | n/a |
| Products with a barcode id | 6,040 (29.5%) | 229 (1.5%) | 5,732 (21.5%) | | |
| Products matching a UK product by barcode | 2,034 (9.9%) | 104 (0.7%) | 1,701 (6.4%) | | |
| Products with a UK match, barcode or name (UK photo) | 4,948 (24.2%) | 2,169 (14.1%) | 4,645 (17.5%) | | |
| Duplicate looking products (same brand, name core, size, strength) | 62 in 30 groups (0.3%) | 32 in 16 groups (0.2%) | 187 in 92 groups (0.7%) | at most 1% (proposed) | all pass |

Which shops carry barcodes: US Ulta 99.9%, Beauty Encounter 88%, The Perfume Spot 84%, Luckyscent 36%, the
rest 0%. India Nykaa 14.7% only (its sku is its own id, not a barcode, per the plan). Canada
Maximum Fragrance 96.7%, the other nine 0%. Indian matching depends on names alone.

**Cheapest fixes**: none needed for duplicates. India's barcode gap cannot be closed cheaply (the shops do not
publish them); reading Nykaa's barcode where it is on the page is a small fix (agent, small) but moves
1,649 listings at most.

## 3. Data quality

| Criterion | US | India | Canada | Target | Result |
| --- | --- | --- | --- | --- | --- |
| Products with "Not stated" strength | 1,662 (**8.1%**) | 703 (**4.6%**) | 8,278 (**31.1%**) | at most 5% (proposed) | US fail, India pass, Canada fail |
| Eau de Cologne products | 644 (3.1%) | 126 (0.8%) | 599 (2.3%) | n/a | |
| Eau de Cologne beside another stated strength, same name and size | 27 (4.2% of the EDC products) | 4 | 26 | none | pass (a small review list) |
| "Not stated" beside a stated twin | 23 | 0 | 317 | | |
| Names with a pipe tail | 167 (0.8%) | 38 (0.2%) | 6 | at most 1% (proposed) | pass |
| Names with promotional words | 4 | 4 | 38 | | pass |
| Names with a trailing "(W)", "(M)", "(U)" | 1 | 1 | **4,571 (17.2%)** | at most 1% (proposed) | Canada fail |
| Names over 70 characters | 312 (1.5%) | 68 (0.4%) | 123 (0.5%) | | pass |
| Own brand repeated inside the name (mostly legitimate) | 688 | 369 | 470 | not scored | |
| Products with no photo (no UK photo, no shop photo) | 83 (0.4%) | 628 (4.1%) | 1,144 (4.3%) | at most 1% (proposed) | US pass, India and Canada fail |

Where the "Not stated" comes from. US: Luckyscent 856 of its 1,320 products, Sol de Janeiro 240 of 243
(body mists), the three sister shops 220 each (already read from the product type). India: Nykaa 227, Fridaycharm
163, BellaVita 113, Wild Stone 86. Canada: Maximum Fragrance 4,725, Parfum Exquis 2,687, H Parfums 650,
Perfume Online 299. Photos: India 628 of 628 are AAR Fragrances (its Open Graph reader keeps no picture; 0% of
its listings have one); Canada 1,135 of 1,144 are Maximum Fragrance (19.3% of its listings carry no image);
US 73 of 83 are La Belle Perfumes.

**Cheapest fixes (data quality)**

| Country | Fix | Effort | Who |
| --- | --- | --- | --- |
| Canada | Product type strength for the three shops above, as under Comparison (cuts Not stated from 31% towards about 10% by estimate) | small | agent |
| Canada | Strip "(M)", "(W)", "(U)" from names in the region name step | small | agent |
| Canada | Maximum Fragrance without an image on 1,135 products: accept (UK photo fallback by name already fills 4,645) or read its page's `og:image` | small | agent |
| India | AAR Fragrances: have `readOgProductPage` (`src/catalogue/regionHarvest.ts`) also keep `og:image` as `imageUrl` (its `imageBasis` is already set) | small | agent |
| India | Reviewed strengths for BellaVita and Wild Stone ("Not stated" 113 and 86) | small | agent |
| US | Luckyscent "Not stated" 856: read the strength from the product page (`src/catalogue/productPageStrength.ts` pattern) | 1 session | agent |
| US | Review the 27 Eau de Cologne pairs | small | agent |

## 4. Freshness

All three crawls read every shop in one run, so a shop's age is its run's age (23 Oct 08:30 UTC):
US 19.3 hours (13:14 UTC run), India 9.0 hours, Canada 15.3 hours. `staleAfterDays` is 7, so no price is
stale. Target (proposed): every shop's prices under 48 hours old and the last 7 days of runs green.

| | US | India | Canada |
| --- | --- | --- | --- |
| Runs, last 7 days (`gh api`) | 7 of 7 success, 42 to 70 minutes | 7 of 7 success, about 43 minutes | 1 run (manual, 22 Oct 17:12 UTC), success, 12.7 minutes |
| Schedule | 07:52 UTC; runs start 11:46 to 15:01 UTC | 20:22 UTC; runs start 22:24 to 23:46 UTC | 05:27 UTC; **no scheduled run has fired yet** (08:25 UTC now) |
| Shops that stopped on their time budget | Luckyscent, Ulta, The Perfume Spot | Nykaa, AAR Fragrances, Perfume Network | none |
| Shops with 0 listings | Boy Smells, Imaginary Authors | Bombay Perfumery, Gulab Singh Johrimal, Pilgrim | none |
| Result | pass | pass | pass for data, **unproven for the schedule** |

GitHub starts the US schedule 4 to 7 hours late most days; that is the platform, and the data is still
under a day old. **Fix**: check on 24 Oct that Canada's first scheduled run is green (owner or agent, none
to do). Shops reading 0 listings: single house shops, low value; leave.

## 5. Delivery terms known

Counted over shops with listings. "Confirmed" is a figure read off the shop's page with the sentence
quoted; "any figure" also counts an unverified free over threshold. Target (proposed): at least 80%
confirmed.

| | US | India | Canada |
| --- | --- | --- | --- |
| Shops with listings | 20 | 10 | 10 |
| Confirmed | 8 (40%) | 3 (30%) | 3 (30%) |
| Any figure | 11 (55%) | 3 | 3 |
| Both a fee and a free over figure | 5 | 3 | 0 |
| Result | fail | fail | fail |

**Fix**: one session reading each shop's shipping page as PriceSniffsBot (robots.txt first), quoting the
sentence, for 12 US, 7 India and 7 Canada shops. Fragrance Outlet's and MicroPerfumes' shipping policy
pages are disallowed and stay unread. Agent, 1 session per country. Canada's plan already records "six
shops where none was found cheaply".

## 6. Shop logos

| | US | India | Canada |
| --- | --- | --- | --- |
| Shops with a logo (of those with listings) | 5 of 20 (Aedes, Beautyhabit, D.S. & Durga, Ellis Brooklyn, Ministry of Scent) | 5 of 10 (BellaVita, Perfume Network, Perfume Palace, Ustraa, Wild Stone) | 0 of 10 |
| Target (proposed) | all | all | all |
| Result | fail | fail | fail |

**Fix**: run `scripts/logo-probe.ts` (the 13 Oct pass, `docs/LOGOS-PLAN.md` section 10) for the 15 US, 5 India
and 10 Canada shops without one; only what the shop's own site declares, hot linked. Agent, under 1 session
for all three. Cosmetic: initials show meanwhile.

## 7. Demand

Totals only, from `site_page_views` since 5 Oct 2026 (the query is the one in `docs/OWNER-STEPS.md` 8d, with
`country` and, for the folders, `page like '/us/%'`):

| | Views | Visits |
| --- | --- | --- |
| UK site (all other pages) | 463 | 75 |
| `/ca/` pages (22 to 23 Oct) | 13 | 0 |
| `/us/` pages (8 to 22 Oct) | 12 | 0 |
| `/in/` pages (8 Oct only) | 5 | 0 |

By visitor country: GB 442 views and 59 visits, US 10 and 7, Canada 8 and 2, India none. Demand is
negligible in all three; the plan sets no number. Target (proposed): 100 visits a week from the country.
No country passes. This is a Google indexing and promotion question, not a data one. Search Console
impressions per folder (owner, below) is the better measure; the plan asks for four to eight weeks of them.
The welcome pop-up has been off since 13 Oct, so no visitor is prompted to choose a country.

## 8. Owner side items (`docs/OWNER-STEPS.md` 10 and "Canada beta")

| Item | US | India | Canada |
| --- | --- | --- | --- |
| Legal review of the regional legal pages before any money (decision 8) | open | open; also whether the 18 or over tick needs a stored record (DPDP) | open; questions for the lawyer: Quebec Bill 96 French notice, PIPEDA and Law 25, CASL for price alert emails, the Competition Bureau's affiliate wording |
| Affiliate approvals (plan wants at least three) | none; deferred by decision 6 (Awin US, CJ, Rakuten, Impact, Skimlinks) | none; deferred (Indian networks) | none; deferred (Canadian independents direct; Sephora Canada and L'Occitane on FlexOffers, Lancome on Impact, Estee Lauder on Rakuten, not checked with the networks) |
| Search Console property for the folder | step 0 in section 10 not recorded as done; submit `sitemap.xml` (an index of four) | same | optional URL prefix property `https://pricesniffs.space/ca/` not recorded as done |
| Supabase migration for the saved country | 0009 done and checked 9 Oct | same | **0011 applied 23 Oct** (in the project's migration history) |
| Welcome pop-up | off since 13 Oct while the AdSense review is open | same | same |

## Per country: ranked list to leave beta

**Canada (nearest)**

1. Product type strength for Maximum Fragrance, Parfum Exquis, H Parfums (agent, small): the likely route over 25%, and Not stated falls from 31%.
2. Strip "(M)/(W)/(U)" tags from Fragrance Canada names (agent, small).
3. See the first scheduled crawl green on 24 Oct, then keep a week of green runs (check, none).
4. Re-measure: independent share at least 25% (agent, minutes).
5. Delivery terms for the 7 shops with none, and shop logos for all 10 (agent, 1 session).
6. Legal review including Quebec (owner, with the lawyer). Required before money; not required to drop the "Beta" label.
7. Search Console property (owner, 10 minutes) and a month of impressions.
8. Affiliate approvals (owner), only if money is wanted.

**India**

1. Let Nykaa and AAR finish reading (nothing to do; re-measure on 26 Oct) and fix Perfume Network's 503 (agent, small).
2. AAR image (628 products, 4.1%), BellaVita and Wild Stone strengths (agent, small).
3. Second research round for two or three more multi brand shops that allow the bot (agent, 1 to 2 sessions). Needed: 1,280 more shared products.
4. Delivery terms for 7 shops and logos for 5 (agent).
5. Legal review including DPDP (owner); Search Console property; Indian networks (owner, later).

**United States**

1. Raise the budgets of Ulta, The Perfume Spot and Luckyscent; wire Dillard's (agent, 1 to 2 sessions): the top two moves available without the owner, but together unlikely to add 2,400 independent products.
2. Affiliate feeds from the big discounters (owner, weeks): the only route to the quarter.
3. Luckyscent strengths (856) and the 27 Eau de Cologne pairs (agent).
4. Delivery terms for 12 shops and logos for 15 (agent, 1 session each).
5. Legal review (owner); Search Console property; a month of impressions.

## Overall recommendation

**Canada can leave beta first.** It is 1.1 points under the quarter, its remaining data problems (strength
read from the product type, one tag in names) are one session of agent work, and it has no affiliate or
partial crawl problems. Realistic timing: the agent items could be done and re-measured by about 26 October,
and with a week of green scheduled crawls Canada could drop the "Beta" label **from about 30 October**.
Honest caveat: the quarter bar is a weak proof here, because the shops are nine Shopify stores with
overlapping catalogues, and demand (13 views, 0 visits) is untested; the owner's legal review (Quebec) is
the real gate for money, not for the label.

**India second**, probably 2 to 4 weeks: it needs about 1,300 more shared products, from the finishing
Nykaa and AAR crawls and two or three new shops that still have to be found. **The US last**: 13.1% against
a quarter, and the shops that would close the gap refuse the bot; it needs the affiliate feeds the owner has
deferred, so a realistic date follows the owner's decision to sign up (a month or more after).

Top three fixes: **Canada** (1) product type strength on three shops, (2) strip tags from Fragrance Canada,
(3) delivery terms and logos. **India** (1) let Nykaa and AAR finish and re-measure, (2) a second shop
research round, (3) AAR image and Perfume Network 503. **US** (1) Dillard's reader and bigger budgets for
Ulta, Perfume Spot and Luckyscent, (2) affiliate feeds (owner), (3) Luckyscent strengths.

Measurement scripts are not committed (scratchpad only); they call `readRegionInputs`, `regionProducts`,
`duplicateKey` and `strengthBlindKey` and are reproducible from the lines above.

## Outcome 23 to 24 Oct

Work done on 23 Oct 2026 against the fix lists above, one task at a time, each pushed with its Deploy green. Re-measured the same
way as the scorecard (`readRegionInputs` and the region catalogue build over the committed region data, UK photos by the region
build's own match; the same script reproduces the scorecard's US, India and Canada figures to within a product). Canada is measured on the
23 Oct 12:07 UTC crawl, **the US on the 23 Oct 12:54 UTC crawl (its first with Dillard's, the longer budgets and Luckyscent's strengths; green, 57 minutes)**.
**India is still the 22 Oct 23:27 UTC crawl: the 20:22 UTC run had not started when this was written, so none of the India changes is in its numbers**;
re-measure India on 24 Oct and the others on 26 Oct. Where a delivery or logo count moved after my own work, another session's commit of 19:36 UTC
(delivery terms for five shops, a Dillard's logo) is in the count and is named so.

| | US `/us/` | India `/in/` | Canada `/ca/` |
| --- | --- | --- | --- |
| 2+ independent shops (bar 25%) | **13.8%** (3,071 of 22,259), was 13.1% | 16.6% (2,554 of 15,341), not yet re-crawled | **23.7%** (6,303 of 26,603), was 23.9% |
| 3+ independent shops | 718, was 568 | 728, not yet re-crawled | 2,212 (was 2,177) |
| "Not stated" strength (bar 5%) | **4.2%** (932), was 8.1% | 4.6% (703), not yet re-crawled | **17.1%** (4,554), was 31.1% |
| Names with a trailing "(M)", "(W)", "(U)" | 1 | 1 | **19** (was 4,571), the tag stays only where it tells two bottles apart |
| Products with no photo | 0.4% (82), was 83 | 4.1% (627 of 628, not yet re-crawled) | 4.1% (1,099), was 4.3% |
| Delivery terms confirmed (shops with listings) | 9 of 21, was 8 of 20 (Dillard's is now priced and unread; the other session's delivery commit is in this count) | 5 of 10, was 3 of 10 (from the other session's delivery commit, not from my work) | **8 of 10**, was 3 of 10 |
| Shop logos (shops with listings) | 6 of 21, was 5 of 20 (Dillard's, the other session) | 5 of 10, unchanged | **6 of 10**, was 0 of 10 |
| Shops with prices | 21 (Dillard's added) | 10 | 10 |

What the US crawl did: Dillard's 1,252 listings kept (one per size, 1,000 pages read in 40 minutes), Luckyscent 2,339 kept (866 before; 2,101
seconds, 1,168 pages), Ulta 924 (703), The Perfume Spot 540 (262). The US stayed far from the quarter, as the scorecard said: the sister shops
and the big discounters are what is missing.

**Estimate for India (a harvest of the three new shops alone, read and discarded, not committed):** Scentido, Maison des Parfums and Scentira
took the region from 15,340 to 18,266 products and from 16.5% to 17.8% at two or more shops; Nykaa and AAR now run 55 minutes instead of 40 and
AAR's pages carry their `og:image`, so the 628 products without a photo fill over the next runs.

### Task 1, Canada

- **The scheduled crawl did fire.** GitHub started the 05:27 UTC tick at 10:22 UTC (run 39938628435, green), five hours late; the scorecard
  was written at 08:30, before it. Nothing in the workflow was wrong (active, cron valid, no guard skip). One extra manual run on 23 Oct
  12:04 UTC after the fixes, green.
- **Strength from the product type** (`strengthFromProductType`, `strengthOfShopType`): on for Maximum Fragrance and Parfum Exquis.
  **Not on for H Parfums**: its type is "Parfum" on 712 of 714 products, a category (it sits on "Rouge Smoking Extrait" and on products whose
  page says eau de parfum), so reading it as a strength would have labelled the whole shop wrongly. Eau de Cologne stays its own strength;
  a bare "Cologne" or "Perfume & Cologne" type is a category. "Not stated" fell from 31.1% to 17.1%. **Honest cost: the share at two or
  more shops fell 0.2 points (23.9% to 23.7%)**, because 135 bottles that used to meet through "Not stated" now carry a strength that the
  shops state differently (Maximum Fragrance's type against another shop's title); the bar of 25% is still about 340 products away.
- **Audience tags** (`stripAudienceTags`): a closing "(M)", "(W)", "(U)", "(Men)", "(Women)", "(Unisex)" is taken off the display name unless
  another product of the same brand, strength and size has the same name without it (then the tag is what tells them apart and stays).
  The match name already ignored the tag, so this changes what is shown, not which shops meet. The region data has no audience field.
- **Delivery**: five shops read from their own policy pages (Perfume Online, Fragrance Canada, Fragrance Online Co, Parfum Exquis,
  Niche Essence), sentences quoted. Perfume Factory (an empty shipping policy) and Perfume Plus (a script drawn page) stay unverified.
- **Logos**: six shops (Discount Fragrances, Fragrance Canada, Maximum Fragrance, Perfume Factory, H Parfums, Parfum Exquis); four stay on
  initials with a reason each (`docs/LOGOS-PLAN.md` section 11). The test that refused a logo address containing "google" now judges the host and
  folder, because Parfum Exquis names its own file `for_google2.png`.

### Task 2, India

- Nykaa and AAR Fragrances: 40 to 55 minutes each at the same 2 second gap, 1,400 new pages a run; the India crawl's harvest limit is 64
  minutes in a 90 minute job (70 minute step). `tests/regionHarvest.test.ts` now holds the margins for the US and India workflows.
- AAR: `readOgProductPage` keeps `og:image` (https only), and a stored listing with no picture is read once more after the due pages.
- Perfume Network: the 503 was the shop's, on its last page (a request from here a few minutes later answered 200). The shared Shopify walk
  now asks a failing page four times in all (waits of 15, 45 and 90 seconds, longer where `Retry-After` asks, up to 120 seconds), then leaves
  that page out and reads the rest, and a second failing page ends the walk; a walk with a page left out is not marked complete.
- Research round: found by search and read as PriceSniffsBot (robots.txt first): Scentido, Maison des Parfums (mdpindia.com), Scentira added
  (Shopify, INR, robots allow `/products.json`). Passed over: Belvish (every product carries the vendor "Belvish", no house), Perfumers Club (one
  house, 46 products), Perfume Hut and Karat Bros (not Shopify, no product data), Perfumery.co.in (own blends), Perfume Culture and Splash
  Fragrance (the connection was refused at the TLS handshake from here; not worked around).

### Task 3, US

- **Dillard's** is on: robots.txt allows `/p/` and the sitemap; each page lists every size as an offer of one AggregateOffer with the size only in
  the offer's checkout address, now read per size (`offersFromAggregate`). A dry run read 8 pages into 9 listings in 22 seconds. Its shipping
  page is script drawn and stays unread.
- Ulta 40 to 55 minutes, The Perfume Spot 12 to 25, Luckyscent 12 to 35, same gaps; US harvest limit 64 minutes in a 90 minute job.
- **Luckyscent strengths**: its pages print "Concentration" beside "Extrait" (or Eau de Parfum and so on) in the product facts, not in the
  structured data; read off the page the walk fetches anyway (`strengthFromPageField`), put into a title that states none.

### Task 4, UK red runs

- The runs that failed (#1664, #1673, #1683, #1692, #1700, the full crawls, three to four hours apart) failed in the data tests, not in a crawl step.
  #1664 had four failing files (`fragranceLinks`, `fragranticaGender`, `fragranticaLinkData`, `sameFragranceNames`: the new products of that night
  before their link data); from #1683 on only `sameFragranceNames` stayed red: "Amouage | Guidance 46 Extrait Unisex | Guidance 46".
- Root cause in `audienceFamilyKey` (`src/catalogue/audienceNames.ts`): the strength was blanked before the name was cut, so a name carrying
  the strength word ("Extrait") fell into a family of its own, away from the gendered sibling "Guidance 46 Woman"; the family then read as
  unisex only and the guard saw an unmerged pair. The key now keeps the strength while it cuts the name and blanks it after. Replayed the
  catalogue with and without the change: the build record and every memory file are identical, so no generated file needed to be committed. The guard
  itself is untouched. Rule test added in `tests/sameFragranceNames.test.ts`.
- **A second red cause, found by the check**: the first full crawl after the fix (#1700, 23 Oct 15:05 UTC) failed in a different file,
  `tests/contentPages.test.ts`: another session's site review had retitled a guide "Comparing Perfume Prices per ml" (lower case unit, on purpose,
  commit 53b47e0c) and the Title Case check had no place for "per" or a unit symbol. The check now lets `per` and `ml`, `cl`, `oz`, `g`, `kg` stay
  lower case and still catches any other lower case word (rule test in the same file); the heading was left as written.
- **Green**: the next full crawl, #1711 (started 19:15 UTC, all of guard, prepare, houses, both sweeps and crawl succeeded, 20:39 UTC). Runs #1664, #1673,
  #1683, #1692 and #1700 were the red full ones, each failing in the `crawl` job after the data had been committed; the guard only runs in between
  were green throughout. Only the logs of #1664, #1683 and #1700 were read; #1673 and #1692 were not read one by one.
- The `Tests` workflow was red on three of my pushes at "Install Chromium for the browser tests" (the Ubuntu apt mirror was too slow; the step timed out at 10 minutes), not at a test; the run on the later push is separate.

# Sets and Oils: plan

Status: built, phases 0 to 10 (6 Oct 2026); see "Build record, phases 7 to 10" at the
end. Written 2026-10-05 against `8bcea068` (v3.74.0) on
`claude/scentday-retailer-registry-h92tth`.

This plans the proper home for gift sets, bundles and perfume oils on
pricesniffs.space without touching the main perfume comparison.

## Owner decisions this plan follows

1. The Explore section has exactly these tabs, in this order: **Brands,
   Retailers, Notes, Oils, Sets**. Oils and Sets are two separate tabs. There is
   no open question about one tab or two.
2. The section is called "Sets and Oils", not "Gift Sets". **Sets** covers gift
   sets AND bundles of two or more full products sold together (the owner's
   example: "Liquid Brun and Vulcan Feu Bundle - Dusk Till Dawn Set").
3. Where the two are named together in words (a search banner, a brand page
   link row, the About text) the phrase is "Sets and Oils". The tab labels are
   "Oils" and "Sets".
4. This reverses the 2026-10-04 decision that gift sets are only an option under
   Size, with no page of their own (`tests/giftSetFilter.test.ts` records it).
   The owner has now decided otherwise; `/gift-sets` becomes a way in to `/sets`.

## Summary

- Sets and oils are already separated from bottles in the data: 2,548 products
  carry a `set-` id and a `giftSet` record, 375 are `Perfume Oil`. Nothing merges
  them with a bottle today (0 shared ids, 0 shared barcodes, measured).
- The problems are not about separation. They are: no place to browse them, the
  set contents list is thin (only 47.7% of sets have two or more clearly
  labelled items), the same set at two shops is joined for only 3.0% of sets,
  oils crowd the cheap end of every price sort, and a set or oil can still turn
  up in the middle of a bottle search with no clear label.
- The plan adds two Explore tabs (`/oils`, `/sets`) first, using today's data,
  then improves the data behind them in small steps, then wires them into the
  rest of the site. The main comparison keeps its ids, its matching, its counts
  and its page weight.
- Eleven phases, each one agent, each with acceptance tests (section 5). Phase 0
  adds guard tests before anything changes.
- Twelve questions for the owner (section 6). The two that change the most:
  whether sets and oils leave the main Search results (recommended yes, with an
  "also in Sets and Oils" line), and what to do with Ortigia's "Perfume Oil"
  listings that its shop files as scented body oil.

## 1. What exists today and its problems

### 1.1 How this was measured

All figures were measured on 2026-10-05, from the built catalogue
(`demo/catalogue.generated.ts`: 26,290 products, 26,321,758 bytes of products
plus offers as JSON), from the 42 enabled shops' stored listings in
`data/catalogue/` (71,552 active listings with a price), and from the built
page for load time. Ten shops are off the site; the registry has 42 enabled
shops and every one of them has at least one offer. The crawl pushes several
times a day, so every number drifts. Phase 0 turns the measurements into a
repeatable report (`npm run sets-oils:report`) so that each later phase can
show before and after on the same footing.

Two kinds of count are used and kept apart: a **product** is one catalogue
entry (one page); a **listing** or **offer** is one shop's row.

### 1.2 Sets today

**How a set is identified** (`src/catalogue/giftSet.ts`, owner's decision of
2026-10-03). A listing is a set when both hold:

1. it says it is one: title words (gift set, coffret, set, wardrobe, bundle,
   "N pcs", "3x10ml", "pack of 2", discovery collection or kit), a fragrance
   joined to a companion ("EDT & Body Wash", "+ Deo Spray"), two Kayali scents
   joined by "+", or the shop's own category (Kayali "Bundles", The Beauty Store
   "Gift Set"), or its description calling it a gift set with a wash in it;
2. it holds a fragrance: a strength word in the title, or a shop that sells only
   fragrance.

Candles, empty bottles, atomisers, testers, samples, decants, unscented and
skincare products never count (`NEVER_IN_A_SET`). "Set Sail" and "with coffret"
are not sets.

**How it is kept apart from bottles.**

| Mechanism | Where | Effect |
|---|---|---|
| `set-` id prefix: `set-ean-<barcode>` or `set-<normalised title>` | `giftSetId` | A set carrying its headline bottle's barcode can never fold into that bottle. 2,548 ids start `set-`, 2,548 products carry `giftSet`, 0 mismatches. |
| `sizeMl` is null | build | Size keyed matching (`findDuplicateGroups`, house ceilings, reference prices) never pairs a set with anything. |
| Size filter option "Gift Sets" | `demo/volumeBands.ts` | A set is in no size band, only its own option (2,548). |
| Left out of Most Stocked | `demo/mostStocked.ts` | Together with oils: 2,923 products left out of 26,290. |
| No house price | build | Sets never get a `houseCeiling` (0 of 2,548). |
| Tile and page say "Gift Set" where a size would be | `sizeLabel`, `giftSetBlock` | One line: "Gift set prices are compared only with this same set, never with a single bottle." |

**How it is named.** The shop's title less a leading brand (`giftSetName`), kept
whole because sizes and strengths are the contents. Two shops are the same set
only if they share a trustworthy barcode (`set-ean-`) or an identical normalised
title (`set-<title>`).

**The data.**

| | Measured |
|---|---|
| Products | 2,548 (9.7% of 26,290); 2,628 offers; raw 2,645 listings |
| Shops with any set | 34 of 42 |
| Four shops hold two thirds | perfume-click 569, mybeauty-boutique 435, the-beauty-store-uk 428, perfume-direct 306 offers = 1,738 of 2,628 (66.1%) |
| Seven shops hold 82.7% | those four plus beautybase 165, escentual 160, fragrance-click 111 |
| Shops where sets are a big part of the catalogue | escentric-molecules 31 of 65 offers (47.7%), home-bargains 20 of 60 (33.3%), kayali 31 of 168 (18.5%), fragrance-click 111 of 756 (14.7%), the-beauty-store-uk 428 of 3,067 (14.0%), john-lewis 63 of 479 (13.2%) |
| Brands with a set | 281 of 1,015; Rabanne 166 of its 427 products (38.9%), Versace 83 of 233 (35.6%); 44 brands hold only sets and oils |
| Photo | 1,359 of 2,548 (53.3%); bottles 51.1% |
| An in stock offer | 1,907 (74.8%) |
| Lowest price, bands | under 25 pounds: 520; 25 to 50: 654; 50 to 100: 997; 100 to 200: 326; 200 and over: 51 (median 55 pounds) |
| Id kind | barcode 824 (32.3%), title 1,724 (67.7%) |
| Reference (was) prices | 0 of 2,628 set offers carry one |

**Comparable across shops** (the same set at 2 or more shops):

| | Products | Share |
|---|---|---|
| One shop only | 2,471 | 97.0% |
| Two shops | 75 | 2.9% |
| Three or four shops | 2 | 0.1% |
| Total at 2 or more | 77 | 3.0% |

For bottles the same figure is 34.2% (7,988 of 23,367). Of the 77 sets that do
match, 60 match on a barcode and 17 on an identical title. Pairs that match are
almost always the same few shops: beautybase with perfume-click (33),
mybeauty-boutique with the-beauty-store-uk (15), fragrance-click with
perfume-click (10).

**Contents.** `giftSetContents` reads the title only:

| | Products | Share of 2,548 |
|---|---|---|
| Has a contents list | 2,018 | 79.2% |
| None (the page prints the shop's title) | 530 | 20.8% |
| List holds exactly one item | 384 | 15.1% |
| List holds an item with no name ("50ml") | 408 | 16.0% |
| Only "N pieces" | 84 | 3.3% |
| Two or more labelled items, none bare, no "N pieces" | 1,216 | 47.7% |

Where the list is missing, by shop (offers): escentual 153, fragrance-click 61,
john-lewis 38, justmylook 33, scentstore 29, perfume-direct 21,
the-beauty-store-uk 20. Perfume Click, the largest set shop, has no
description in our harvest for any of its set listings (569 of 569), so its
contents can only come from the title. Across all 2,645 set listings 1,985 (75.0%) have a
description, and 1,123 (42.5%) use words such as "contains" or "includes";
Kayali's reads "THIS SET CONTAINS: 0.34 oz / 10 ml ... Eau de Parfum . 0.53 oz /
15 g ... Lip Balm". None of that is read today.

What the lists say, for the 2,018 that have one: a lotion, cream or balm in 562,
a wash or shower gel in 465, a deodorant in 131, two or more fragrance lines in 483,
only a piece count in 84.

**Problems**

- S1. No place to browse sets except a Size option inside a mixed list.
- S2. Joined at 3.0%. A loose test (same brand, same scent words, same sizes in
  the title) finds 233 groups, 505 set products, in which up to 272 would fold
  away. A hand read of the first 14 groups found 9 clearly the same set and 5 that
  need the contents to decide (the same 50ml set at 54, 83 and 108 pounds; a
  "with Body Lotion" set whose lotion size is not stated). So the real gain is
  large but a loose key is not safe. A number in the name must count: "Mini
  Collection 1" and "Mini Collection 2" (both 5 x 10ml) fell into one group under
  the loose test, which ignored digits.
- S3. The owner's own example is split three ways. "Dusk Till Dawn Set EDP
  2x100ml" at french-avenue (50 pounds), "Dusk Till Dawn Perfume Gift Set" at
  emirates-oud (54.99) and "Liquid Brun and Vulcan Feu Bundle - Dusk Till Dawn
  Set EDP 100ml" at fragrancehub (52.99) are three ids, three shops, no
  comparison. Nothing in the current rules can link them: the bundle title names
  the set it is.
- S4. Bundles are in, but their contents are wrong or missing. 33 sets carry
  "bundle" in the name (7 shops), 30 listings carry a Bundle(s) shop category; 23
  of the 33 have no contents list and the other 10 have two or more items. Four
  fragrancehub French Avenue bundles show the shop's title only. One of them,
  "Liquid Brun and Azzure Aoud ... Bundle", has brand "Unbranded" (7 sets are
  unbranded) because its title never names the house.
- S5. 77 sets hold two or more full size (30ml and over) fragrance bottles in
  their parsed contents (counting "3 x 30ml" as three, and leaving out body
  sprays, mists, lotions and the like). Today nothing marks a bundle of full
  bottles apart from a box with a travel spray in it.
- S6. Parse quality shows on the page: "250ml Perfume" and a bare "300ml" for a
  Turab Al Dhahab set that holds a perfume mist and an air freshener; "50ml,
  10ml" for Kayali's Eden Duo; and 84 sets whose whole contents list is a piece
  count ("3 pieces") with nothing said about what the pieces are.
- S7. About 129 listings that look like fragrance sets (a loose keyword test over
  the listings the catalogue rejects) are not in the catalogue at all. The set
  test needs a strength word in the title and these titles have none ("Fragrance
  Gift Set"). A hand read shows a mix. Real fragrance sets: John Lewis (28, for
  example "Versace Pour Femme Miniature Fragrance Gift Set, 4 x 5ml"), Cult Beauty
  (10 duos and collections), Just My Look (3), Avon (5 "Perfume Duo"). Sample sets,
  an owner question (question 8): Les Senteurs (7, for example "Discovery Set 7 x
  1.5ml Extrait Sample"). Not fragrance sets: Al Haramain's 14 twelve piece empty
  bottle packs, Home Bargains' Lynx body spray sets, candles. This needs a reviewed
  rule, not a wider regex.
- S8. Nicchia Luxury pages carry a bottle and a set on one page: 25 product
  pages hold both (for example Delina Eau de Parfum 75ml and "Delina Eau de
  Parfum 3x10 ml Travel Set + Case"). They are correctly two products, but it
  means "one page is one product" cannot be a rule.
- S9. A set in the bottle list is easy to mistake for the bottle: a search for
  "bleu de chanel" returns one result and it is a set.

### 1.3 Oils today

**How an oil is identified** (`src/catalogue/productName.ts`,
`CONCENTRATION_OIL`): only the explicit phrases "concentrated perfume oil",
"perfume oil", "perfumed oil", "fragrance oil" make a listing a `Perfume Oil`.
The bare word "oil" never does (a comment in that file counts 643 harvested titles
with it, and they are body, face, lip, hair and cleansing oil). "Attar" is not in the list, because two
houses are called Attar and sell sprays; it falls into a weaker tier. Result:
**378 products have strength `Perfume Oil`: 375 oils and 3 that are sets.**

**How it is handled.**

| Where | What happens |
|---|---|
| Most Stocked | Left out (owner, 2026-08-20), by `concentration !== 'Perfume Oil'`. |
| Deal of the Day post, savings posts | `social-deal-of-day.ts` and `social-savings.ts` skip `Perfume Oil` by name. |
| Deals page | Not left out. 6 of 3,047 deals are oils (0.2%). No rule decides this. |
| Concentration filter | Its own option "Perfume Oil". |
| Size filter | Sits in the size bands with minis: 267 of the 2,127 products under 15ml are oils (12.6%), 73 of 582 in 15 to 30ml. |
| Price sort | Lowest to Highest Price: 24 of the 50 cheapest products on the site are oils, 39 of the first 100. |
| Search | Mixed in. A search for "yara" returns 26: 5 sets, 8 oils. A search for "oil" returns 5,610, because "Toilette" contains "oil"; only 375 are oils. |

**The data.**

| | Measured |
|---|---|
| Products | 375 (1.4%); 433 offers, 18 shops; plus 15 Attar (Nicchia: Xerjoff, Tiziana Terenzi; 304 to 2,559 pounds), no photo |
| Brands | 28; Al Haramain 222, Al Rehab 27, Orientica 21, Lattafa 15, Ard Al Zaafaran 13, Khadlaj 8, Malin + Goetz 8, Unifrom 8, Armaf 6 |
| Biggest sellers | al-haramain 210 offers (48.5%), perfumeo 43, emirates-oud 40, beautybase 40, niche-beauty-uk 23, cult-beauty-global 21, mybeauty-boutique 20 |
| Kayali | sells no oil (168 offers: 31 sets, no oil or roll on in any listing or category) |
| Photo | 314 of 375 (83.7%) |
| An in stock offer | 271 (72.3%) |
| Comparable across shops | 43 of 375 at 2 or more shops (11.5%); 332 / 33 / 7 / 1 / 2 products at 1 / 2 / 3 / 4 / 5 shops |
| Barcode | 55 of 433 listings (12.7%), so oils mostly match on name and size |
| Price | median lowest price 12 pounds (bottles 45.80, sets 55). 286 under 25 pounds (76.3%). Median per ml: oils 0.96, bottles 0.90 |
| Same scent as a spray | 67 oils (17.9%) share brand and name with a non-oil product |
| Several sizes | 302 distinct brand and name; 31 names come in more than one size |

Sizes (ml): 3: 44, 6: 89, 7: 6, 7.5: 1, 9: 2, 10: 43, 12: 82, 15: 31, 16: 1, 18: 5,
20: 20, 24: 10, 25: 6, 30: 15, 35: 14, 40: 1, 60: 1, 75: 1, 100: 3. That is 133
at 6ml or less, 134 from 7 to 12ml, 57 from 15 to 20ml, 46 from 24 to 40ml and 5
over 40ml.

What the 433 oil listings say about themselves: roll on or roller in the title
or description 78 (18.0%; 63 in the title); alcohol free (or "non alcoholic") 39
(9.0%; 3 in the title, 38 in the description); dropper 5; "concentrated" 120
(27.7%). No listing states a strength as a percentage (the 6 percent figures are
"100% genuine" or an alcohol volume). So **there is no oil strength to filter on**,
and the plan does not invent one.

**Problems**

- O1. No place to browse oils; they are a Concentration option and, by size, a
  slice of the minis.
- O2. They crowd the cheap end of every price sort and the small end of the size
  facet.
- O3. 36 genuine oil listings are lost, found by keyword and read by hand (so
  there may be more). The fragrance test needs a strength word it knows and these
  have "Perfumed Oil", "Roll-On Oil" or only "Perfume Oil" with no readable size:
  - beautybase "Perfumed Oil 15ml Roll-On" and "12ml Bottle" (Al Haramain 8, Ahsan 1): 9
  - debenhams Al Rehab "6ml Roll-On Oil" (4) and "Eclipse Oud Deep Smoky Perfume
    Oil" with no size: 5
  - al-haramain "Red African Perfume Oil 12" and "24" (a bare number, no ml): 2
  - mybeauty-boutique and perfume-click Armaf "Club De Nuit Intense Concentrated
    Perfumed Oil 18ml": 2
  - the-beauty-store-uk Lattafa "Yara Moi 0.67 Concentrated Perfume Oil" (size in
    oz, no unit): 1
  - space-nk Malin + Goetz Strawberry and Dark Rum "Perfume Oil" with no size: 2
  - nicchia-luxury-uk, Ortigia "Perfume Oil roll-on 10 ml" (10) and "Perfume Oil
    100 ml" (4), and Tauer "Attar Perfume Oil 5 ml" (1): 15. The shop files them
    as "Olio corpo profumato" (scented body oil), which the catalogue rejects by
    category (`BODY_PRODUCT_TYPE`). The titles say Perfume Oil. This is an owner
    call (question 2). Six Casa Amalfi "Scented Oil Roll On 10 ml" at 22 pounds
    sit in the same category and are not counted.
- O4. A few oils are filed as bottles. "Al Rehab Rose Roll-On Oil" and "Khadlaj
  Hareem Al Sultan Gold Concentrated Oil" have strength `Not stated` because the
  title says only "Oil". Blood Concept's three "Dropper" 40ml products (two are
  named "Oil Dropper") are filed as `Parfum` or `Eau de Parfum`; whether they are
  oils needs a look at the shop.
- O5. 19 rollerball or roll on products (Chloe by Chloe Rollerball, Gucci
  Memoire d'une Odeur Rollerball, four Sarah Jessica Parker rollerballs and so
  on) are sold as Eau de Parfum or Eau de Toilette in a roller, which is what
  their titles and strengths say. They are bottles, not oils, and stay bottles
  (question 3), but a roll on filter on Oils must not pick them up.
- O6. One scented body oil sits in the bottle list: Maison Francis Kurkdjian "Satin
  Mood Scented Body Oil" 70ml, 2 shops, strength `Not stated`.

### 1.4 Every surface they touch today

| Surface | Today | Effect |
|---|---|---|
| Quick Search and /search | Sets and oils listed with bottles; set tile size line reads "Gift Set", oil tile reads "Perfume Oil" | S9, O1; "yara" is half sets and oils |
| Brand page | Mixed | Rabanne's page is 38.9% sets; Al Haramain's is 51.5% sets and oils (251 of 487) |
| Retailer page and its count | Mixed | Al Haramain: 210 of 407 listings are oils (51.6%) |
| Notes page | Mixed | 760 of the 10,815 products that list notes are sets (573) or oils (187): 7.0% |
| Most Stocked (home rail, See All) | Excluded | The on page note says only "Oils are not listed here"; it does not say sets are left out too |
| Deals | Sets cannot appear (no reference price on any set offer: not a rule); 6 oils do | Needs an explicit rule |
| Home banner and counts | the marquee ("26,000+ Fragrances Tracked"), "Search 26,290 Fragrances", the meta description, the Notes note ("N of 26,290 fragrances list them") | Include 2,923 sets and oils (11.1%) |
| Price history, wishlist, price alerts | Work by product id | Unchanged if ids are kept |
| Sitemap | All 26,290 product pages, 2,548 set pages included | Unchanged |
| Page weight | Sets are 8.7% of the catalogue and offers data (2,287,416 bytes); oils 1.3% (341,713). A set entry averages 526 bytes, a bottle 376 | See 4.3 |

## 2. The proposed shopper experience

### 2.1 Principles

1. A set or an oil is never shown as a bottle, and a bottle is never shown as a
   set or an oil. Every tile and page says what it is in words.
2. Nothing existing moves until the new tabs work. Phases 1 to 7 change no number
   on any existing page, except the few named moves in Phase 2 (oils recovered,
   a handful of misfiled products moved); the one place where results leave an
   existing list (Search) is its own owner gated phase, Phase 8.
3. Never state what the shop did not. Where contents, format or a flag is
   unknown it says "Not stated", the way Gender and Concentration already do.
4. Same wording rules as the rest of the site: no hyphens or dashes in reader
   facing text, Title Case labels, "Any ..." first in each dropdown, every sort
   opens "Sort By:" and every option names both ends.
5. Reuse before building: the tile, the filter panel (`listControls`, `facets`),
   `chunked` windowing (48 per chunk), the per row chooser, `productArt`.

### 2.2 Explore tabs and routes

| Tab | Label | Route | View | Notes |
|---|---|---|---|---|
| 1 | Brands | `/brands` | explore, tab `brands` | unchanged |
| 2 | Retailers | `/retailers` | explore, tab `retailers` | unchanged |
| 3 | Notes | `/notes` | explore, tab `notes` | unchanged |
| 4 | Oils | `/oils` | explore, tab `oils` | new |
| 5 | Sets | `/sets` | explore, tab `sets` | new |

Code: `ExploreTab` gains `'oils' | 'sets'`; `TABS` in `demo/app.ts` gets two
entries in that order; `RouteName` and `LIST_ROUTES` in `demo/router.ts` gain
`oils` and `sets`; `routeToPath`, `applyRoute` and `currentRoute` follow the
brands, retailers, notes pattern. `/gift-sets` stays as an alias, now to `/sets`
instead of `/search?size=gift-set`; it is rewritten to `/sets` once drawn, like
every alias. Page titles and descriptions come from `demo/head.ts` (a title of
the form "PriceSniffs: Sets" and one sentence on what a set is and that sets are
compared only with the same set); both routes are listed in the sitemap by
`scripts/build-sitemap.ts`, which is intended and so the one case where
`demo/sitemap.xml` is committed with the phase. The existing `/gift-sets` test
that says it is "not in the sitemap" stays true.

Product pages stay at `/fragrance/<id>` for sets and oils: ids do not change, so
every bookmark, wishlist entry, price alert and price history line keeps working.
There is no `/sets/<id>`.

Like every list today, tab filters live in memory, not in the address. The tabs
accept `?q=`, `?brand=` and `?size=` on the way in (for the links in 2.6), then
the address is rewritten to the plain tab path, the same way `/gift-sets` is.
(Question 9 asks whether filters should become shareable.)

### 2.3 Sets tab

**What a set tile shows.** The standard tile with three changes: the size line
reads "Set" (or "Bundle" for a bundle), under the name a one or two line contents
summary replaces the size ("100ml Eau de Parfum, 100ml Shower Gel, 10ml Travel
Spray"), and where there is no photo (46.7% of sets) the contents summary and the
set name take the space, so a photoless tile is useful rather than a blank mark.
Where no contents are known the line is the shop's own title, labelled as such.

**Heading and count.** "Sets" with a count, the same as Brands. A one sentence
note: "Gift sets, miniature and discovery sets, and bundles of full size bottles.
A set is compared only with the same set at another shop, never with a single
bottle."

**Filters.** The panel is the existing one (`facets`, one value per dropdown, an
option only where it would return something). It keeps Concentration, Gender,
Price, Brand Type and In Stock; its Size becomes Main Bottle; On Sale stays but is
never offered here because no set has a reference price. New to the panel: Kind,
In the Box, Brand and Shop.

| Filter | Options | Data it needs | Count today |
|---|---|---|---|
| Kind | Gift Set, Bundle of Full Bottles, Miniature or Discovery Set | `bundle` flag, item sizes (P3) | 33 bundle named, 77 with two or more full size bottles; overlap unmeasured |
| In the Box | With Body Lotion, Cream or Balm; With Shower Gel or Body Wash; With Deodorant; Two or More Fragrances; Contents Not Stated | item kinds (P3) | 562; 465; 131; 483; 530 |
| Main Bottle | Under 15ml, 15 to 30ml, 30 to 70ml, 70 to 120ml, 120ml and Over | the largest fragrance item (P3) | 136; 52; 472; 664; 107. 1,117 sets (43.8%) have no readable main bottle and sit in no band, as a null size does today |
| Brand (new) | brands that have a set, with counts | in the data already | 281 brands; Rabanne 166 first |
| Price | the five existing bands | in the data already | see 1.2 |
| In Stock | checkbox | in the data already | 1,907 |
| Shop (new) | retailers, with counts | in the data already | 34 shops |
| Value | "Cheaper than the bottle alone" | headline bottle link (P7) | at most 302 sets can ever answer this; held back, question 5 |

Not offered: On Sale. No set offer carries a reference price (0 of 2,628), so the
checkbox would be empty and the panel's own rule hides an empty option. Sort,
filters and scroll are part of the tab's remembered list state, so Back to the tab
brings them back as it does for every list today (`rememberListState`).

**Value against the bottle alone, only where honest.** A set's page may say:
"At Perfume Click this set is 63.30 pounds. The 100ml bottle alone is 64.65
pounds at the same shop." Both prices are that one shop's, so shop differences
cancel. It is shown only when the set's main bottle (size and strength) is
exactly one catalogue bottle and that bottle is sold by a shop that also sells the
set. Measured: 430 sets (16.9%) have one unambiguous headline bottle (126 more
are ambiguous), and 302 (11.9%) have it at a shop that also sells the set. It is
stated as two prices, never as a percentage and never as "you save", because it
can go the other way: One Eau de Toilette 100ml with a 150ml deodorant at
beautybase is 29.95 pounds against 25 for the bottle alone, and Divine 100ml at
perfume-click is 95.90 against 87.10. It is a link between two pages, never a
merge.

**Sort By** (new list `SET_SORT_OPTIONS` in `demo/listSort.ts`, each option names
both ends, checked by `tests/sortLabels.test.ts`):

| Label | Value | Note |
|---|---|---|
| Most to Least Stocked (default) | `stocked` | today's popularity order; the 77 sets at two or more shops lead |
| A to Z / Z to A | `az` / `za` | |
| Lowest to Highest Price / Highest to Lowest Price | `price-low` / `price-high` | |
| Smallest to Largest Main Bottle / Largest to Smallest Main Bottle | `size-low` / `size-high` | no readable main bottle sorts last in either direction, the rule `sortFragrances` already follows for a null size |
| Most to Fewest Items | `items-high` | sets with unknown contents last |

**Not collapsed to one tile per scent.** `onePerScent` deliberately keeps sets
apart (a set has no size, its key keeps it from folding), and 166 Rabanne sets
are 166 different boxes. The list is flat, windowed 48 at a time like every
other list.

### 2.4 Oils tab

**What an oil tile shows.** The standard tile; the size line is the size ("12ml"),
the strength line "Perfume Oil" (or "Attar"), and a small "Roll On" or "Alcohol
Free" tag only where the shop said so. A price per ml line ("0.80 pounds per ml",
the cheapest shop's item price over the size), because that is the one honest
comparison inside oils and the reason oils were left out of Most Stocked.

**Filters.** The existing panel again: it keeps Price, Gender, Brand Type and In
Stock (Concentration is dropped, every oil is one strength); its Size becomes oil
size bands. New to the panel: Format, Alcohol Free, Brand and Shop.

| Filter | Options | Data | Count today |
|---|---|---|---|
| Size | Under 7ml, 7 to 13ml, 13 to 21ml, 21 to 45ml, 45ml and Over | `sizeMl` | 133; 134; 57; 46; 5. The same lower bound inclusive, upper bound exclusive rule as the main Size filter (`volumeBandFor`). Boundaries sit in one table and a test prints the counts |
| Format (new) | Roll On, Dropper, each "as the shop states it" | `oil.format` (P2) | roll on: 78 of 433 listings (18.0%) say so; dropper: 5. Product counts come with P2 |
| Alcohol Free (new) | checkbox, "as the shop states it" | `oil.alcoholFree` (P2) | 39 of 433 listings (9.0%) |
| Brand (new) | brands with an oil | in the data already | 28 |
| Price | the five bands | in the data already | 286 under 25 pounds |
| In Stock | checkbox | in the data already | 271 |
| Shop (new) | retailers | in the data already | 18 |

Only a shop's positive statement sets a flag. Silence is never read as "contains
alcohol" or "is a bottle". Dropper is offered as an option only while it returns
something, which the panel's own rule already does. There is no strength filter
(1.3). Rollerball sprays are not oils (O5): the format is read from oil listings
only.

**Sort By** (`OIL_SORT_OPTIONS`): Most to Least Stocked (default), A to Z, Z to A,
Lowest to Highest Price, Highest to Lowest Price, Smallest to Largest Size,
Largest to Smallest Size, **Lowest to Highest Price per ml**. The last is the
only per ml sort on the site and exists only here.

### 2.5 Product pages

Both stay on the existing product page (`fragranceDetail`); only the facts block
differs. Everything below the facts, the offers table, price history, wishlist and
alert, is unchanged.

**A set.**

- Heading carries the tag "Set" or "Bundle" where a bottle shows its size.
- "In this set" becomes a list, one line per item with a size, a kind and a count
  ("100ml Eau de Toilette", "10ml Travel Spray", "100ml Shower Gel"), replacing
  the one sentence `giftSetBlock` prints today. Where contents are unknown:
  "As the shop lists it:" and the title, as now.
- The line "Compared only with this same set, never with a single bottle" stays.
- Each offer row shows the shop's own title for the set (collapsed under the row).
  Once matching is looser than an identical title (P4) this is how a shopper can
  see for themselves that the two are the same set.
- The headline bottle line (value above), a link "The 100ml bottle alone" and
  links to other sets of the same scent. All links.

**An oil.**

- Heading carries the size and "Perfume Oil" (or "Attar").
- Facts: format and alcohol free, each with "as <shop> describes it" and
  nothing where unstated; the price per ml at the cheapest shop; "Other sizes"
  (the existing variants control; 31 oil names come in several sizes).
- A link "The spray version" where brand and name match a non-oil product (67 of
  375 today). A link, never a merge.

### 2.6 How they appear, or stay out

| Surface | Proposal | Why |
|---|---|---|
| Most Stocked (rail, See All) | Unchanged. Fix the on page note to say sets and oils are both left out. | Already excludes 2,923 |
| Deals | Unchanged page; add an explicit rule that excludes sets and oils, with a test. | Today 0 sets by luck (no reference price) and 6 oils by absence of a rule |
| Home | Unchanged. No section for either (question 7). | Owner's 2026-10-04 decision on the home page is kept |
| Quick Search and /search | Phase 8, owner gated: bottles only in the result list, and above it one line, "5 Sets and 8 Oils also match: See Sets, See Oils" (the counts for "yara"), each opening its tab with the query carried. Intent words (oil, attar, roll on, set, gift, bundle, coffret, duo, trio) show that group first. Until then, unchanged. | S9, "yara" is half sets and oils; "oil" must be a word match, not a substring ("Toilette") |
| Brand page | A line under the heading: "Rabanne also has 166 sets", linking to `/sets?brand=rabanne`; the list itself stays as it is until the Search decision, then holds bottles with the same line for oils. | The page is 38.9% sets today |
| Retailer page | Same line: "Perfume Click: 569 sets, 11 oils". | |
| Notes page | Bottles first; sets and oils flagged by tag; not removed in this plan. | 7.0% of entries |
| Concentration filter's "Perfume Oil" and Size filter's "Gift Sets" | Stay until Search leaves them out, then are removed because they would be empty. | |
| Counts and banners | Phases 1 to 7 leave every number as it is. Phase 8 adds one `COUNTS` object (bottles 23,367, sets 2,548, oils 375, summing to the 26,290 the banner prints today) so no page can disagree with another. The banner either keeps 26,290 and says "Products" or says "Fragrances" and means bottles; the owner chooses (question 6). | An unlabelled change in a headline count is the thing to avoid |
| Social posts | Both posts get a shared rule that skips sets and oils, with a test. Today `social-savings.ts` has no set rule. | Sets become more visible |
| Sitemap | `/oils` and `/sets` added; product pages unchanged | |

### 2.7 Mobile and desktop

- **Tab row.** `.subnav` is already a sideways scrolling row that "never pushes the
  bar taller", with `flex: none` buttons, so five tabs cannot break the layout.
  Whether all five fit without scrolling at 390px is not measured yet. Acceptance
  (Phase 1) measures it: at 390px all five labels visible, or the row scrolls with
  the current tab scrolled into view and a hint that more follows; at 360px the
  same.
- **Lists.** Two tiles per row on narrow screens, the reader's chosen per
  row count on desktop, the same windowing and eager first row as every list
  (`gridEagerCount`). Ads follow the existing placement rule.
- **Controls.** The existing controls row: "Sort By:" dropdown, a Filters toggle
  with a badge, the panel under it. On desktop the panel sits open in a row; on
  mobile it is the toggle.
- **Contents on a tile.** Two lines, then an ellipsis, on mobile; three on desktop.
  The full list is on the page.
- **Product page.** The contents list is a plain list under the heading on both
  layouts; the value line sits above the offers table.

## 3. Data and matching work

### 3.1 Oils

New module `src/catalogue/perfumeOil.ts`, the one place that says what an oil is
and reads its facts:

- `isPerfumeOil(listing)`: today's `CONCENTRATION_OIL`, plus the lost kinds in O3
  that carry an explicit oil phrase ("perfumed oil", "roll on oil", "perfume oil")
  and a readable size, plus Attar sold as an oil. Never the bare word "oil".
  Never a listing whose shop category says body, hair, face, bath, candle, home.
- `oilFormat(listing)`: `roll-on` | `dropper` | null, from "roll on", "roll-on",
  "roller" (but not "rollerball" or "eau de rollerball", which are sprays, O5),
  "dropper" in the title, else the description.
- `oilAlcoholFree(listing)`: true only on "alcohol free", "non alcoholic" or
  "without alcohol" in the title or description; otherwise null, never false.
- Sizes: `sizeMl` is read as today. A bare number after "Perfume Oil" with no unit
  ("Red African Perfume Oil 12") is read only where the shop's own variant title
  gives the unit; otherwise the listing stays out and is on a short reviewed list
  with the reason. An oz size ("0.67") is converted only where the unit is
  present. Nothing is guessed.
- The catalogue entry gains `oil?: { format, alcoholFree }`, present only on an
  oil (the `giftSet` pattern: omitted for every other product, so the file grows
  by oils alone).
- Ortigia and Casa Amalfi stay out until the owner decides (question 2).

### 3.2 Set contents

Replace the string list with structure, keeping the strings for display:

```
giftSet: {
  contents: string[] | null,      // unchanged, for display and old data
  title: string,
  items?: { count: number | null, ml: number | null, kind: 'fragrance' | 'travel' | 'wash' | 'body' | 'deo' | 'other', label: string }[],
  mainMl?: number,                // largest fragrance item that is not a travel size
  kinds?: string[],               // for the In the Box filter
  bundle?: boolean,
}
```

Sources, in order, each marked on the record so the page can say where it came
from: (1) the title, as today, with the faults fixed (S6): a bare size takes its
item from the nearest item word either side; "Perfume Mist" and "Air Freshener"
are items; "N Piece" is checked against the items found; (2) the shop's
description where it has a contents list ("THIS SET CONTAINS", "Set includes",
"comprises": 1,123 of 2,645 set listings use such words, Kayali's among them);
(3) a matched set's other shop, only on a trustworthy barcode match, labelled
"as <shop> lists it". A count is stated only when the text states it. "Duo",
"Trio" and "Twin" state two and three; scent names joined by "and" or "," with
one size are two or more bottles at that size each ("Liquid Brun and Amber Empire
EDP 100ml Bundle": two named scents). Where the text does not say, the count is
null.

**Bundles.** A set is a **bundle** when any of: the shop's category is Bundle or
Bundles (30 listings), the title says bundle, duo, trio or twin (33 names say
bundle; 66 say bundle, duo, trio, twin or pair), or the items hold two or more
full size fragrance bottles of different scents. Bundles are sets (the owner's
decision) and are told apart from gift sets by the Kind filter only. They never
enter the single bottle path, because the `set-` id and a null size already
prevent it. The one new rule is that a bundle title that contains another set's
name ("... Bundle - Dusk Till Dawn Set") is a link candidate for P4, not a merge.

### 3.3 Matching the same set across shops

Today's two tiers stay exactly as they are: a trustworthy barcode (`set-ean-`),
else an identical normalised title (`set-<title>`). A third tier is added, strictly
conservative, and recorded through the existing id alias file
(`data/id-aliases.json`; 132 of its lines already name a `set-` id, so the machinery
and the page redirects exist):

A set is matched across shops only when **all** hold:

1. same canonical brand;
2. the same scent words once set words, strength words and size words are removed,
   **and every number in the name equal** ("Collection 1" is not "Collection 2",
   "No. 5" is not "No. 3");
3. the same full contents signature: the sorted list of (count, ml, kind) over
   every item, so "50ml EDP + 10ml EDP" equals "50ml Eau de Parfum + 10ml Travel
   Spray" only when both read to the same signature, never on a main bottle size
   alone;
4. strengths equal where both state one;
5. no two different trustworthy barcodes in the group;
6. a price spread inside a bound taken from the 77 matches that exist today
   (median max over min 1.12, 90th percentile 1.33, maximum 2.31 across them). A
   candidate group beyond the bound goes to a review file, not to the page.

Sets with no contents (3.4) are never matched by tier 3. The loose test in S2
is an upper bound on what tier 3 can gain (up to 272 sets folding into others,
before the contents and price tests cut it down); the phase reports the real
number and commits the groups it merged and the groups it refused as fixtures.

A matched group never mixes kinds: every member has `giftSet`; a bottle, an oil
and a set are never candidates for one another (4.1).

Where the rules cannot prove two sets are the same but a person can see it (the
Dusk Till Dawn trio, S3), a link is the answer, not a merge: question 12 asks
whether a small hand reviewed link list is acceptable, since `idAliases.ts` is
proudly "nothing in it is a hand list".

### 3.4 When a shop's set has no contents

530 sets (20.8%) have none. The rule, in order:

1. Try the title, then the description, then a barcode matched sibling (3.2).
2. If still unknown, the page and tile show the shop's own title, labelled "As the
   shop lists it", exactly as today. Nothing is invented and no count is shown.
3. The set is filed under "Contents Not Stated" in the In the Box filter and under
   no Main Bottle band; it is never hidden from the list, only from the filters that
   need a fact it lacks (the Gender and Concentration filters already do this with
   "Not stated").
4. It matches across shops only on a trustworthy barcode or an identical title
   (tiers 1 and 2).
5. The phase report lists the no contents sets by shop, so a shop with a pattern
   (escentual 153, fragrance-click 61: their titles repeat "Gift Set 50ml" with no
   other item) can be fixed at the source rule rather than set by set.

### 3.5 Headline bottle link

At build time, for a set with a `mainMl`, find the single non-oil, non-set product
with the same canonical brand, scent words, strength and size. Exactly one: store
its id as `giftSet.bottleId`. Zero or several: nothing (126 are ambiguous today).
The page then reads the same shop prices from the existing offers. No new network
or file; one short id on about 430 sets.

### 3.6 Missing sets

S7: a reviewed allowlist rule for fragrance sets whose title has no strength word
(John Lewis "Fragrance Gift Set", Cult Beauty duos), by shop and pattern, not a
widening of `SET_TITLE`, with the false positives (empty bottle packs, home
fragrance, body spray sets) in the test as titles that must stay out. Whether
sample and discovery sets of 1.5ml count is question 8.

### 3.7 Data shape and weight

New fields exist on sets and oils only. The growth is not known until Phase 3
builds it; that phase prints the byte change and checks it against the limit in
4.3.

## 4. Guardrails so the main comparison is untouched

### 4.1 No set or oil ever merges with a bottle

Held at four points, with one test each, on the real catalogue:

1. **Namespace.** Every `giftSet` product has a `set-` id and every `set-` id has
   `giftSet`. Measured today: 2,548 and 2,548, 0 mismatches, 0 duplicate ids.
2. **Barcodes.** No barcode appears on a set and any other kind, nor on an oil and a
   bottle. Measured today: 0 and 0.
3. **Strength.** An oil's match key includes `Perfume Oil` (`matchKey` in
   `productMatch.ts` carries the strength), so it can meet only another oil. The
   one place that ignores strength, `concentrationBlindKey`, only lets a house's
   own storefront settle a disputed strength; Phase 2 proves it re-strengths no
   oil and no bottle. The oil rules never change a bottle's strength; the phase
   report shows the bottle id set before and after identical.
4. **Variants.** The build asserts that no stored listing (shop and SKU) feeds two
   products. The assertion is on the listing, not the page address: 25 Nicchia
   pages legitimately carry a bottle variant and a set variant, and one affiliate
   click address is shared by everything.

New code never loosens a bottle matching rule. All new matching (3.3) is inside
the `set-` namespace and runs on sets only.

### 4.2 Counts, banners and lists stay as they are or are labelled clearly

- No existing count changes in Phases 1 to 7, apart from Phase 2's named moves, each
  listed in that phase's test. The test: the product count, the
  bottle count (23,367 on today's data, a number the test recomputes rather than
  hard codes), the Most Stocked count and the Deals count are each read before and
  after the phase and must be equal, except where a phase says it adds oils or sets
  and says by how many.
- One `COUNTS` object (Phase 8) is the only source of "N fragrances", "N sets", "N
  oils"; a test fails if a page string builds one of those from
  `DEMO_FRAGRANCES.length` directly.
- A tab's own count is the tab's own list length, like Brands.
- The Most Stocked note names both exclusions.

### 4.3 The performance budget holds

Measured baseline on 2026-10-05 (`npm run perf:load -- --runs 3`, median of 3,
Pixel 7 viewport, CPU 4x slower, the built page at `8bcea068`):

| Scenario | First tiles | FCP | Bytes by first tiles | Transferred |
|---|---|---|---|---|
| first visit | 2.20 s | 0.20 s | 3.22 MB | 4.45 MB |
| repeat | 2.22 s | 0.16 s | 0.0 kB | 0.0 kB |
| repeat, cache expired | 2.21 s | 0.16 s | 0.1 kB | 0.1 kB |
| first visit, 4G | 4.25 s | 0.22 s | 3.22 MB | 4.45 MB |

Proposed limits (chosen, not measured; the owner may move them): after any phase,
first visit first tiles no more than 2.31 s (5% over) and bytes by first tiles no
more than 3.28 MB (2% over). The catalogue and offers JSON may grow by no more
than 300 KB across the whole plan (1.1%). Design choices that keep to it:

- The tabs list from the data already shipped. No new eager file and no new
  request on first load.
- Sets and oils tabs render one chunk of 48 tiles and window the rest, using the
  existing `chunked` path, so a tab paints no more tiles than the home page's
  Most Stocked list does.
- Tab facets are computed over 2,548 sets or 375 oils, not 26,290 products,
  through the existing `facetAttrs` cache.
- New fields are on sets and oils only and are short ids and small numbers; the
  contents strings stay as they are, with no second copy of the title.
- If a phase breaks the limit, Phase 10's fallback moves the sets' heavy fields
  (items, bottle id) to a lazy file the way the price history and dormant products
  already load (`LAZY_DATA_MODULES`), fetched only when a set page or the Sets tab
  opens. That alone would take 8.7% (2.29 MB raw) out of first load, so it is also
  the lever if the owner wants a lighter page.

## 5. Phased build steps

Every phase is sized for one agent and one commit. Rules for all of them, from
`CLAUDE.md`: stage files by name, never `git add -A`; fetch and merge the branch
just before pushing, never force push; do not edit generated files by hand; a phase
that changes anything the page shows (`demo/*.ts`, `src/`, catalogue code) runs
`npm run rebuild`, then `git checkout -- demo/sitemap.xml` unless it meant to
change it, and commits the rebuilt files with the change; a phase that changes only
tests, scripts or docs leaves the generated files out. Each phase adds a changelog
entry in `demo/changelog.ts` only if a shopper can see the change (title 45
characters or fewer, up to three points of 50 or fewer, no dashes). After each
phase run the full tests and `npm run perf:load -- --runs 3` and compare with 4.3.

**Phase 0. Report and guard tests. No visible change. No rebuild.**
- Add `scripts/sets-oils-report.ts` and a `sets-oils:report` line in `package.json`: prints the
  figures in section 1 (counts by kind and shop, photos, shops per product,
  contents quality, bundle counts, oil sizes and flags, lost oil and set
  candidates) from the built catalogue and `data/catalogue/`. Prints only; writes no
  file.
- Add `tests/setsOilsGuardrails.test.ts`: the four checks in 4.1 on the real
  catalogue; Most Stocked excludes every set and oil (and `rankedInMostStocked`
  count equals products minus sets minus oils); `DEALS` holds no set; both social
  scripts skip a set and an oil (a synthetic fragrance for each); the build
  assertion in 4.1 (4).
- Fix `social-savings.ts` and `social-deal-of-day.ts` to skip sets and oils by an
  explicit rule.
- Acceptance: the report reproduces 26,290 / 2,548 / 375 / 23,367 and the
  per shop tables on the same data; the guard tests pass on today's catalogue; a
  deliberately broken fixture (a set given a bottle's id) makes each guard fail.

**Phase 1. The tabs, on today's data.** Delivers the owner's request first.
- Router: `oils`, `sets` routes; `/gift-sets` alias to `/sets`; head titles and
  descriptions; sitemap lines; `ExploreTab`, `TABS`, `exploreView`, `applyRoute`,
  `currentRoute`, `fallbackBackRoute` (Back from a product opened from a tab
  returns to that tab).
- Two panels reusing `fragranceList`, `listControls` and today's facets (Concentration
  on Sets only, Gender, Price, Brand Type, In Stock; no new fact and no Size, which
  is meaningless for a set and replaced in Phases 5 and 6), a heading with count and
  note, sort by Most to Least Stocked, A to Z, Z to A, price both ways
  (`SET_SORT_OPTIONS`, `OIL_SORT_OPTIONS` start with these). The tab's sort and
  filters join the remembered list state.
- Update `tests/navAndExplore.test.ts` (the tab list is now Brands, Retailers,
  Notes, Oils, Sets, and no search box), `tests/giftSetFilter.test.ts` (alias now
  to `/sets`), `tests/sortLabels.test.ts` (the two new lists are checked).
- Rebuild: page and sitemap (intended).
- Acceptance: at 390px and 1366px `/oils` and `/sets` draw, the subnav lists the five
  tabs in order with the current one marked and all five visible without scrolling
  at 390px; `/sets` heading count equals `giftSet !== null` products (2,548 today)
  and `/oils` equals oil products (375); no tile in either is a bottle; every
  tile opens `/fragrance/<id>` and Back returns to the tab with its sort, filters and
  scroll as left; `/gift-sets` lands on
  `/sets` and is rewritten; the existing a11y audit (`npm run a11y`) passes on both
  routes; Phase 0 guards and the count equality test in 4.2 pass; load figures
  inside 4.3.

**Phase 2. Oil rules.** `src/catalogue/perfumeOil.ts` (3.1); `oil` field on the
entry; recover the oils that need no owner decision; bottle misfiles in O4 move to
oils; the body oil in O6 leaves the catalogue; tests with the named titles in O3.
- Rebuild: catalogue, deals, history, page.
- Acceptance: every title named in O3 outside the Ortigia and Casa Amalfi group
  either enters as an oil with its right size or is on the reviewed "cannot read a
  size" list with a reason; oil products rise by at most the number named and the
  report shows the exact change; **the bottle id set is identical before and
  after** (modulo the O4 and O6 moves, each named in the test); no rollerball is an
  oil; `oilAlcoholFree` is true only for stated cases (a test with the 3 title and
  38 description listings as examples) and null elsewhere, never false.

**Phase 3. Set contents v2.** `giftSet.items`, `mainMl`, `kinds`, `bundle` (3.2),
description reading, parse fixes from S6.
- Rebuild: catalogue and page.
- Acceptance: a table test of at least 40 real titles from this document with the
  expected items; sets with a bare item fall from 408; sets with two or more
  labelled items rise from 1,216 and none falls; no set loses a contents list it has
  today; the 33 bundle named sets and the 30 Bundle(s) category listings are all
  `bundle`; the French Avenue examples read as bundles with a count only where the
  title states one; set `tests/giftSet.test.ts` cases unchanged except named ones;
  catalogue growth printed and within 4.3.

**Phase 4. Set matching, third tier.** (3.3) with review file and alias entries.
- Rebuild: catalogue (ids and aliases) and page.
- Acceptance: sets at two or more shops rise from 77 (the new number is reported,
  not promised); no merged group has two different trustworthy barcodes, two
  different main sizes, two different numbers in the name, or two different
  signatures; every old `set-` id answers (alias test: open each retired id and land
  on its survivor); no set or oil in a group with a bottle (4.1); the group list and
  the refused list are committed as fixtures and a test pins both; a hand read of 30
  merged groups by the agent is recorded in the pull request text.

**Phase 5. Sets filters, sort and tile.** Kind, In the Box, Main Bottle, Brand and
Shop filters (with Contents Not Stated), Smallest to Largest Main Bottle and Most to Fewest
Items sorts, contents line on the tile, photoless tile layout.
- Rebuild: page.
- Acceptance: each filter option's count equals the number of sets that pass it
  (test recomputes from the catalogue); an option with no sets is absent; the
  Main Bottle counts equal 136 / 52 / 472 / 664 / 107 on the data of Phase 3 (or the
  report's new figures), Brand lists 281 brands and Shop 34 shops on today's data;
  Back to the tab restores sort, filters and scroll; unknown sorts last in both directions; `sortLabels` passes;
  a filter change on the Sets tab is timed on the 4x slowed browser the same way
  as on the main list and is no slower than it (record both numbers); desktop and mobile
  screenshots (`npm run screenshot`) attached.

**Phase 6. Oils filters, sort and tile.** Size bands, Format (Roll On, Dropper),
Alcohol Free, Brand and Shop filters, price per ml line and sort.
- Rebuild: page.
- Acceptance: Size band counts equal 133 / 134 / 57 / 46 / 5 on today's sizes (or the
  report's after Phase 2); per ml sort puts the lowest price per ml first and never
  uses a size of null; Brand lists 28 brands and Shop 18 shops on today's data;
  Format and Alcohol Free count only listings that state them, and a test shows an oil with neither stays in the unfiltered list and in no
  flagged result; `sortLabels` passes.

**Phase 7. Product pages.** Set contents list, bundle tag, per offer shop title,
headline bottle line and links (3.5), sibling set links; oil facts, per ml, spray
link.
- Rebuild: catalogue (`bottleId`) and page.
- Acceptance: the value line renders only for sets with exactly one headline bottle
  and a shared shop, and renders both prices with the shop's name, with no percentage
  and no "save"; a set where the bottle is dearer and one where the set is dearer
  are both in the test; a set with no contents shows "As the shop lists it" and no
  list; a bottle's page is byte for byte unchanged (a snapshot test of three bottle
  pages); oils with no spray sibling show no link.

**Phase 8. Cross links and counts. Owner gated: question 1 (Search) and question 6
(banner).**
- Brand and retailer lines linking to the tabs; `COUNTS`; the Most Stocked note;
  the Deals rule from Phase 0 now also in `build-deals.ts`; and, if approved,
  sets and oils out of the Search list with the "also match" line and intent words.
- Rebuild: page.
- Acceptance: a test over the built page that no string builds a count from
  `DEMO_FRAGRANCES.length` directly and that the three counts sum to the total;
  Search for "yara" lists bottles only with the line "5 Sets and 8 Oils also match"
  (numbers recomputed); a search for "oil" matches words, not "Toilette"; a search
  for "bleu de chanel" says one set matches and shows no bottle result; every set
  and oil is still reachable by tab, brand and retailer; bottle ranking and counts
  in every existing list are unchanged apart from the removals, each named.

**Phase 9. Missing sets.** The reviewed rule in 3.6 and the owner's answer to
question 8.
- Rebuild: catalogue and page.
- Acceptance: each listing in S7 marked "real" is now a set; each marked "not a
  fragrance set" (empty bottles, candles, body spray sets) is still out; set count
  rises by the number reported; nothing existing changes id.

**Phase 10. Budget check, and the lazy fallback if needed.** Run the full
`perf:load`, compare with 4.3. If inside the limits, record the numbers in this
file's end note and stop. If not, move the sets' heavy fields to a lazy file.
- Acceptance: figures inside 4.3; if the lazy file was added, `/sets` and a set
  page still draw, the home page's first load no longer holds those fields, and
  `tests/priceHistoryLazy.test.ts`'s pattern is followed for it.

## 6. Open questions for the owner

1. **Search.** Should sets and oils leave the main Search result list, with a line
   above it ("5 Sets and 8 Oils also match")? Recommended: yes, in Phase 8, after
   the tabs exist. Today "yara" returns 26: 13 are sets or oils. The alternative is
   to leave them mixed with clearer tags.
2. **Ortigia and Casa Amalfi.** Nicchia Luxury files 14 Ortigia "Perfume Oil" (10 of
   10ml roll on, 4 of 100ml at 46 pounds), Tauer's "Attar Perfume Oil" and 6 Casa
   Amalfi "Scented Oil Roll On" under "Olio corpo profumato", scented body oil. The
   titles say Perfume Oil. Recommended: the 10ml roll ons and the Tauer attar are
   oils; the 100ml and the Casa Amalfi ones are body oils and stay out. Your call.
3. **Rollerballs.** 19 rollerball products sold as Eau de Parfum or Eau de Toilette
   (Chloe by Chloe Rollerball, Gucci, Sarah Jessica Parker and others) are in the
   bottle list. Recommended: they stay bottles; the Format filter is for oils only.
4. **Kind names.** Gift Set, Bundle of Full Bottles, Miniature or Discovery Set. OK, or
   other words?
5. **Value against the bottle.** Show it as two prices at the same shop on the set's
   page (recommended, 302 sets today). Do you also want a Value filter or sort on the
   tab? It could cover 12% of sets at most.
6. **The banner and counts.** Today 26,290 "Fragrances Tracked" includes 2,923 sets and
   oils. Keep the number and call it "Products", or keep "Fragrances" and show
   23,367? Recommended: "Products", with the three counts on the About page.
7. **Home page.** Still no section for sets or oils (your 2026-10-04 decision),
   Explore only?
8. **Sample sets.** Les Senteurs' "Discovery Set 7 x 1.5ml Extrait Sample" and similar
   are samples today and stay out. Should discovery sets of 1.5ml vials count as
   Sets? And the John Lewis and Cult Beauty fragrance sets with no strength word
   (S7): add them? Recommended: yes to the sets, no to vials.
9. **Shareable filters.** No filter is in an address today and the plan keeps it so.
   Should the new tabs be the first lists whose filters are shareable?
10. **Attar.** 15 Xerjoff and Tiziana Terenzi attars (304 to 2,559 pounds) have no
    photo. Recommended: they are in Oils, labelled Attar.
11. **Photoless sets.** 46.7% have no photo. Recommended: show the contents in the tile's
    space (2.3). OK?
12. **Hand reviewed links.** For sets the rules cannot prove are the same but a person
    can (the Dusk Till Dawn trio): allow a short reviewed list of links (not merges),
    or accept that some stay apart? The alias file is deliberately not a hand list.

## Appendix: reproducing the figures

Every number in sections 1 and 4.3 came from three sources: the built catalogue
(`demo/catalogue.generated.ts`, products and offers), the 42 enabled shops' stored
listings (`data/catalogue/*.json`, filtered by `RETAILERS` enabled, `status ===
'active'` and a price) run through `isCatalogueListing`, `isGiftSet` and
`concentrationOfStoredListing`, and `npm run perf:load -- --runs 3`. The Phase 0
report script is the repeatable form; until it exists a number here is a snapshot,
not a promise.

The hand read figures (S2's 9 of 14, S7's real versus not, O3's 36) are a person's
reading of a keyword search and are labelled so; Phase 2, 4 and 9 replace each with a
tested figure.

## Build record, phases 7 to 10 (6 Oct 2026)

What was built after phase 6, and what was decided where the plan left a choice. Figures
are from the build of that day and drift with every crawl.

**Phase 7, product pages.** A set's page lists its contents one item to a line, says
Bundle or Gift set in its note, names each shop's own title beside its price where two
shops or more sell it, and links to more sets of the same scent. Where the set's main
bottle is exactly one catalogue bottle (`giftSet.bottleId`, `src/catalogue/setLinks.ts`:
same brand, scent words, strength and size, the audience agreeing) and one shop sells
both in stock, it prints that shop's two prices with a link to the bottle, never a
percentage or a saving. An oil's page states its format and alcohol free only as a shop
describes it, its price per ml, other sizes, and a link to the spray of the same scent
(`oil.sprayId`). 820 sets carry a headline bottle (about 410 have a shop selling both:
about 90 cheaper than the bottle, about 270 dearer), 1,157 a scent group, 97 oils a spray.
The page of a bottle holds none of it (`tests/setPageBrowser.test.ts`).

**Phase 8, cross links, counts and Search.** Owner gates taken as the plan recommends,
because the owner was away: question 1 yes (sets and oils leave every bottle list on the
search page, a brand's page and a shop's page, and a line above says how many also match
and opens the tab with the same words, brand or shop), question 6 "Products" (the banner
says "N+ Products Tracked", the Search button and the page description count bottles, the
About page gives products, fragrances, sets and oils). `demo/counts.ts` is the only
source of those numbers, and a test fails if a page builds one from
`DEMO_FRAGRANCES.length`. The words oil, attar, roll on, set, gift, bundle, coffret, duo
and trio name a kind and match whole words only (`demo/searchIntent.ts`): "oil" finds 407
products, not the 5,748 that contain the letters (Toilette). Deals has an explicit rule
that only a bottle is a deal (6 oil deals left the page). Notes pages still list sets and
oils, flagged by the tile's own line, as the plan says.

**Phase 9, fragrance sets with no strength word.** `src/catalogue/unnamedSets.ts` is a
reviewed list, one rule per shop (John Lewis, Cult Beauty, LookFantastic, Just My Look,
Avon, Emirates Oud, Armaf, Al Haramain, IBRAQ at its shop and Manchester Ouds, Nicchia,
Les Senteurs, Escentric Molecules, The Fragrance Counter, Fragrance Hub, ScentStore and
Space NK). Question 8 as recommended: yes to the sets, no to vials (2.5ml or less). Sets
2,505 to 2,726 (+221). Nothing that was a page changed id; one Kayali duo id is folded by
set matching into the Kayali set and its old address answers.

**Phase 10, the budget check.** Two measurements, the second the one that attributes.

- File weight (section 4.3's 300 KB across the plan): the fields the plan added to the
  catalogue and offers JSON are 165 KB raw (0.5% of the 33.2 MB file), 36 KB gzipped.
  `tests/setsOilsWeight.test.ts` holds it under 300 KB.
- Load (`npm run perf:load -- --runs 5`, Pixel 7, CPU 4x slower, on a machine shared with
  other work, so run to run spread is about 0.3 s). The page just before phase 7
  (`843a689c`) against the build with phases 7 to 9, back to back, twice:

  | | first tiles | bytes by first tiles | transferred |
  |---|---|---|---|
  | before phase 7 | 4.46 s, 4.28 s | 4.27 MB | 5.67 MB |
  | with phases 7 to 9 | 4.80 s, 4.44 s | 4.32 MB | 5.74 MB |

  Phases 7 to 9 add 1.2% to the bytes (limit 2%) and 4 to 8% to the first tiles time on
  that machine, against a limit of 5% and a noise of the same size.

- The absolute limits of section 4.3 (2.31 s, 3.28 MB) were taken on 5 Oct against a
  26.3 MB catalogue file. The file is now 33.2 MB for 26,971 products and a first visit
  is 4.3 MB by the first tiles. That growth was there before phase 7 (the table above
  starts at 4.27 MB) and is not the plan's: what grew it is outside the Sets and Oils work. The lazy file
  of section 4.3 would take the sets' data (8.7% of the file, about 0.35 MB gzipped) out of
  the first load and would not by itself return to 3.28 MB, so it was not built. It is the
  lever if the owner wants a lighter first visit; the price history and the products with no
  current prices already load that way (`LAZY_DATA_MODULES` in `scripts/dataFiles.ts`), but the
  search, brand and shop lines, the Notes pages and Deals read sets today, so each would wait
  for the file.

Owner decisions taken for the owner (change them by asking): Search leaves sets and oils
out (1); the banner says Products (6); sets of vials stay out, miniature and travel sets
count (8).

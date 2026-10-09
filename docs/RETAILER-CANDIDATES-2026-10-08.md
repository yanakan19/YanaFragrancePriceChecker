# UK fragrance retailer candidates, 2026-10-08

Written 2026-10-08. The registry held 74 shops (42 enabled) when this search began; it holds 84 (52 enabled) now. The aim: find UK
fragrance retailers and resellers that are not in it, that sell perfume in sterling with UK delivery,
and add the ones that can be read now by a route D23 allows.

The hard lines (docs/DECISIONS.md D23) held throughout: every request was made as PriceSniffsBot and
nothing else, robots.txt was read first and obeyed, no browser user agent, no fingerprint, no captcha
solving, nothing done to get past a bot challenge. A shop that answered the bot with a refusal, a
challenge or silence is listed as blocked and was left alone.

## How each shop was checked

1. WebSearch (standard mode) to name the candidate and find its own domain.
2. `curl` as PriceSniffsBot over HTTP/1.1 (what the crawler's own client speaks), 1.5 s between
   requests: `/robots.txt`, then the home page, then for a Shopify shop `/products.json?limit=250`
   and `/meta.json`, for any other shop its sitemap and two or three product pages.
3. The repo's own parsers on what came back (`parseRobots`, `parseListings`, `parseShopifyProducts`,
   `isCatalogueListing`), so "readable" means the pipeline can really use it.
4. For Shopify shops, page 1 of `/products.json` was read at the origin and with `?country=GB`, to catch
   a shop that quotes a US caller a different price list (the Les Senteurs trap). None of the six shops
   added differed in a single price.

Affiliate columns come from the networks' own merchant pages where one could be read (Awin), and
otherwise from third party directories (affi.io, affsignal, FlexOffers, shopper.com), which disagree
with each other and are marked "directory only". None of it has been applied to.

## The table

Platform "custom" means a bespoke or unidentified storefront. "Readable" is the verdict from the check
above on 2026-10-08. Bytes are as received after decompression.

### Added to the registry today

| # | Shop | Domain | Sells | Platform | Affiliate | robots.txt | Readable now? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Fenwick | fenwick.co.uk | Independent department store; perfume from Acqua di Parma, Amouage, Diptyque, Jo Malone London, Tom Ford, Dior, Gucci | Shopify | Partnerize 2% and Sale Gains (directory only) | 200, 3,620 B, Shopify stock file, products.json allowed | Yes. `/products.json` 200, 100 pages of 250 (25,000 of 25,001 products), GBP at rate 1; 1,032 are perfume by product type; 3 of 100 pages answered 503 once and 200 on a retry |
| 2 | Opulensi | opulensi.com | Arabian houses (Lattafa, Anfar, Ard Al Zaafaran, Sapil, Maison Alhambra, Afnan, Ajmal); Leicester | Shopify | Awin 123248, "Opulensi Perfumes Lattafa Sapil Anfar" (read on Awin) | 200, 3,771 B, stock file, allowed | Yes. 541 products, 509 type Perfume, GBP, 554 priced variants |
| 3 | The Perfume Closet | theperfumecloset.co.uk | Arabian houses (Lattafa, Ajmal, Reef, Al Haramain) and some designer; Birmingham shop | Shopify | None found | 200, 3,656 B, stock file, allowed | Yes. 724 products, GBP, 1,067 priced variants; vendor is the shop, brand is in the title |
| 4 | Perfumoi | perfumoi.co.uk | Designer fragrance at discount, a few Arabian lines | Shopify | None found | 200, 3,624 B, stock file, allowed | Yes. 354 products, GBP, 464 priced variants, all typed by strength |
| 5 | Saad Fragrance | saadfragrance.com | Arabian houses (Lattafa, Azhrance, Ahmed Al Maghribi, Escalo, Ard Al Zaafaran) | Shopify | None found | 200, 3,636 B, stock file, allowed | Yes. 156 products, GBP; a third of titles name no strength or no size |
| 6 | Sainte Cellier | saintecellier.com | Independent niche houses (Les Indémodables, Marissa Zappas, Aromag, Neela Vermeire, Frassaï); London | Shopify | None found | 200, 3,636 B, stock file, allowed | Yes. 261 products, GBP, 268 perfume variants after its sample sets, 2ml samples and discovery boxes are left out; titles are scent names with the strength only in the product type |
| 7 | Liberty London | libertylondon.com | Department store; niche and designer fragrance (Byredo, Le Labo, Comme des Garçons, Guerlain) | Salesforce Commerce Cloud | Partnerize, by the shop's own page: daily feed, 30 day cookie | 200, 2,933 B, 52 rules, product pages and sitemap allowed | Yes. `sitemap_0-product.xml` 9.2 MB, 37,068 URLs (18,534 UK, 18,534 US); 1,667 UK perfume pages on the route; a product page (508 KB) carries JSON-LD Product in GBP (Odeur 53 EDT 200ml 135) |
| 8 | PerfumeUK | perfumeuk.co.uk | Designer discounter | custom | Sale Gains, Paid On Results, BlueAff (directory only) | 200, 113 B, crawl delay 1 | Yes. One sitemap of 1,291 URLs, 1,137 on the route; a product page (37 KB) has JSON-LD Product with GBP, SKU and gtin13 (Dolce & Gabbana K EDT 50ml 42) |
| 9 | Rasasi UK Store | rasasistore.co.uk | Rasasi only; calls itself the official UK store | custom (React, server rendered) | None found | 200, 629 B, allowed | Yes. 27 product pages, all priced; the structured data names the scent alone, so the strength and size are read from the page title |
| 10 | Direct Cosmetics | directcosmetics.com | Discount beauty, 1,491 fragrance pages, often unboxed or tester stock | custom | Not checked | 200, 1,290 B, crawl delay 2 for the bot | Yes. Six fragrance sitemaps; a product page (650 KB) has JSON-LD Product in GBP, spelt with capital letters ("Offers", "SKU"), which the reader now accepts |

### Readable now, not added in this pass

| # | Shop | Domain | Sells | Platform | Affiliate | robots.txt | Readable now? | Why not added |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | Mankind | mankind.co.uk | Men's grooming (THG) with a fragrance range | custom | Network unconfirmed (FlexOffers listing only) | 200, 5,529 B, product pages allowed | Yes. One gzip product sitemap of 2,773 URLs, written 2026-09-03, with about 100 fragrance pages; a page (213 KB) has JSON-LD with a GBP price (Juicy Couture EDP 50ml 55) | A small shelf on a month old sitemap; worth a route if the range grows |
| 12 | Perfumes Club UK | perfumesclub.co.uk | Large discounter (Spanish group) | custom | FlexOffers listing at 0% (unreliable); Webgains, Skimlinks (directory only) | 200, 3,273 B, 79 rules, crawl delay 1 | Yes. 22,892 URLs in `sitemap-G.xml`; a page (418 KB) has JSON-LD price (Dolce & Gabbana Intense 67.52) | JSON-LD name is the scent alone ("INTENSE"), the page title adds only the brand, and no size is named in the markup, so a listing cannot be sized |
| 13 | Matalan | matalan.co.uk | Fashion retailer with a small fragrance shelf | custom (same platform as Mankind) | Not checked | 200, 5,413 B | Yes. 21,393 product URLs, about 107 fragrance; JSON-LD prices (Jimmy Choo EDT 30) | Fragrance is half a percent of the range |
| 14 | Perfume Plus Direct | perfumeplusdirect.co.uk | Discount designer fragrance | Magento | FlexOffers and BlueAff open, MyLead closed (directory only) | 200, 355 B | Partly. Home page 146 KB with prices; `/sitemap.xml` is a 404 | Needs a category walk |
| 15 | Ormonde Jayne | ormondejayne.com | One niche house, own shop | Shopify | None found | 200, 3,632 B, stock file | Yes. 113 products, GBP | A house storefront: belongs in `src/config/houses.ts` |
| 16 | Jo Loves | joloves.com | One house, candles and fragrance | Shopify | Not checked | 200, 3,628 B, stock file | Yes. 207 products, GBP | Already a house in `src/config/houses.ts` |
| 17 | Molton Brown UK | moltonbrown.co.uk | One house, fragrance and bath | custom | UK affiliate page exists, network not named | 200, 871 B | Yes. A category page (581 KB) holds 23 listings in JSON-LD (Re-charge Black Pepper EDP 30ml 70) | A house storefront |
| 18 | Perfumes of Arabia London | perfumesofarabialondon.com | Own Arabian inspired brand, oils | Shopify | Tradetracker (campaign 38612, per its page) | 404 (none) | Yes. 102 products, GBP | Own brand oils, not other houses' bottles |
| 19 | The Fragrance Store | thefragrancestore.uk | Decants of niche houses, a few full bottles | Shopify | None found | 200, 3,650 B, stock file | Yes. 156 products, GBP | Titles carry no strength word; none of 441 variants passes the catalogue's fragrance test |
| 20 | Scent Samples UK | scentsamples.uk.com | 1 to 20 ml samples only | Shopify | None found | 200, 3,644 B, stock file | Yes. 1,532 products, GBP, 7,087 variants from 1 ml to 20 ml | No full bottles |
| 21 | Welzo | welzo.com | Health and household marketplace with some perfume | Shopify | Not checked | 200, 3,296 B, stock file | Yes. 19,763 products; none of the first 1,000 is perfume | Fragrance is a tiny share |
| 22 | Fragrance Samples UK | fragrancesamplesuk.com | Samples | Magento | None found | 200, 1,647 B | No usable sitemap (`/sitemap.xml` 404) | Samples only |

### Blocked, or needs an affiliate feed

For these the owner can apply to the network named and use the feed, which is the better data anyway.
Nothing was worked around.

| # | Shop | Domain | Network | What the bot got | Verdict |
| --- | --- | --- | --- | --- | --- |
| 23 | Pharmacy2U Shop (was Chemist Direct) | chemistdirect.co.uk | Awin 2102, 5% (2.5% with a voucher), 30 day cookie, read on Awin and on the shop's own page | robots.txt HTTP 403, 5,636 B, Cloudflare "Just a moment..." | Blocked. Apply on Awin and use the feed |
| 24 | Argos | argos.co.uk | CJ Affiliate (directory only) | HTTP 403 "Access Denied" on robots.txt and the home page | Blocked. Perfume gift sets only |
| 25 | Feelunique | feelunique.com | Awin plausible, UK listing unclear; FlexOffers (directory only) | HTTP 403 "Access Denied" | Blocked |
| 26 | Flannels | flannels.com | Rakuten open; FlexOffers; Awin closed (directory only) | No answer: HTTP/2 stream error, then 25 s timeout over HTTP/1.1 | Unreadable. robots.txt never served, so nothing may be fetched |
| 27 | ASOS | asos.com | Not checked | Same as Flannels | Unreadable |
| 28 | Jo Malone London UK | jomalone.co.uk | Rakuten (one directory sidebar only) | HTTP 403 "Access Denied" | Blocked. A house |
| 29 | TK Maxx | tkmaxx.com | Not checked | robots.txt 200 with a 10 s crawl delay; the home page is a "Something went wrong" bot wall | Blocked |
| 30 | Wilko | wilko.com | Not checked | robots.txt HTTP 403, Cloudflare challenge | Blocked |
| 31 | Frasers | frasers.com | Not checked | No answer | Unreadable |
| 32 | Well Pharmacy | well.pharmacy | Not checked | No answer | Unreadable |
| 33 | Penhaligon's | penhaligons.com | FlexOffers, 30 day cookie (directory only) | robots.txt 200; product pages are a 26 KB app shell with no price in the markup, sitemaps point at a per country API | Not readable by page. A house |
| 34 | Al Jazeera Perfumes UK | uk.aljazeeraperfumes.com | Awin 128425 (profile read) | robots.txt 200 (127 B); the home page is a 6.9 KB client rendered shell, its sitemap names the Qatar site | Not readable by page. Apply on Awin and use the feed if it offers one |
| 35 | Strawberrynet | strawberrynet.com | Not checked | robots.txt 200, but the home page lands on `/en-US` in dollars | No UK sterling store from here |
| 36 | Nearstore | nearstore.com | Not checked | Shopify, `/meta.json` USD and US, 9,601 products; `/en-uk` pages are a converted view | Not a UK shop |
| 37 | Vanity Stock | vanitystock.com | Not checked | `/en-gb` home page loads, `/products.json` is a 404 behind a Cloudflare page | Not readable |
| 38 | Beautyspin | beautyspin.co.uk | Not checked | Redirects to Notino UK, which is already in the registry | Duplicate |
| 39 | Chemist4U | chemist-4-u.com | Not checked | 200, but one fragrance-looking URL in 2,052 | No fragrance range |

### Left out on purpose

| Shop | Why |
| --- | --- |
| ScentUK (scentuk.com), Martin Lion (martinlion.uk), Arabian-Perfumes.co.uk, Perfume Parlour (Leicester) | Sell their own "inspired by" scents. A dupe is not the product this site compares (the same reason Aldi's Lacura was left out in August). Perfume Parlour also resells genuine Arabian houses and could be revisited |
| Scent and Sensibility, Dan's Decants | No answer from the domain tried, or no such business found |
| Pulse of Perfumery (Knutsford), Royal Perfumery (Chester) | Shops first; no online ordering found |
| Burgins Perfumery (York) | Closed in 2017 |

## What was added, and what each entry stands on

Ten shops, all `enabled: true` after a dry run from this sandbox read real priced listings. Six are on the
Shopify route (`shopifyStorefront: true`, `adapter: 'unknown'`) with a `catalogue` block whose section is the
shop's own collection page. Four are read through their sitemap and the Product block on each page, on a
pinned `sitemapRoute` with `requireGbp`, so a price the page does not label sterling is never kept; none
of the four has a listing page that is paged by an address its robots.txt permits, so they carry
`catalogue: null`.

| Shop | Route | Priced listings read (sandbox) | Pass the catalogue's fragrance test | Delivery, from the shop's own page, 2026-10-08 |
| --- | --- | --- | --- | --- |
| Fenwick | `/products.json`, 4 product types of 25,000 products | 1,054 | 892 (644 in stock) | £5 standard, free over £100, 3 working days (product page panel) |
| Opulensi | `/products.json` | 554 | 495 (222) | Free over £30, 1 to 5 working days, charge below it not published |
| The Perfume Closet | `/products.json` | 1,067 | 836 (277) | Options named (standard 3 days, first class 1 to 2), no price printed |
| Perfumoi | `/products.json` | 464 | 445 (319) | Free next day on every UK order |
| Saad Fragrance | `/products.json` | 156 | 114 (76) | Free on every order, 3 to 4 working days |
| Sainte Cellier | `/products.json`, perfume types, no samples | 268 | 260 (184) | Not read: the shipping terms sit under `/policies/`, which robots.txt disallows. Recorded as unverified |
| Liberty London | sitemap, 1,667 UK perfume pages | 100 of 1,667 | n/a (read per page) | £5.95 standard, free over £100, 3 to 5 working days (product page panel) |
| PerfumeUK | sitemap, 1,137 product pages | 112 of 1,137 (6 minute local ceiling) | n/a | Free on every UK order, 2 to 4 working days |
| Rasasi UK Store | sitemap, 27 product pages, title parts | 27 of 27 | 27 of 27 | Free on every order, 2 to 4 working days |
| Direct Cosmetics | sitemap, 6 fragrance sitemaps, 1,491 pages | 96 of 1,491 (6 minute local ceiling) | n/a | £2.95 standard, 3 to 5 working days; the free delivery over £35 needs a code and is not applied |

Proved from a GitHub runner, as PriceSniffsBot, robots.txt first, free tier, no errors for any of the ten.
Two shops had their own one shop dispatch (`harvest_shop`): Fenwick (run 37723837125, commit 7d9e58b3: 100
pages, 1,054 listings priced, 752 in stock) and Liberty London (run 37727829201, commit 007b3fe5: 100 of 1,663
pages priced). Each dispatch takes about 50 minutes of the crawl's concurrency group (tests, houses, rebuild),
and the other eight were read by the full sweep of commit 874377da at 06:03Z, 90 minutes after they were
pushed, with the same code and the same report fields, so they were not dispatched one by one: Opulensi 554
priced (249 in stock), The Perfume Closet 1,067 (377), Perfumoi 464 (330), Saad Fragrance 156 (106),
Sainte Cellier 268 (188), PerfumeUK 150 of 1,137 pages (93), Rasasi UK Store 27 of 27 (23), Direct Cosmetics
100 of 1,491 (100). `npm run rebuild` on the merged tree changed only timestamps in two generated files,
so none is committed: the crawl's own rebuild already carries all ten shops.

Sitemap shops fill in over several runs (about 42 never read pages a run, more where the route sets
`discoveryPages`), so their counts on the site grow for a day or two.

Photos stay off for all ten. Product photos show only for shops the owner's decision of 2026-10-05 (D24)
covers, and `tests/imageBasisDecision.test.ts` fails if the basis is added without it. See the owner steps.

Three fixes in shared code came out of reading these shops, each with tests:

- `crawlViaShopifyProducts` asks a page that answered HTTP 5xx once more after 15 s. Fenwick's perfume
  sits late in a 100 page feed, so a walk that stopped at the first 503 would miss most of it.
- A `shopifyVariantRule` that only filters product types no longer puts "Default Title" or a "0"
  placeholder into the title it builds. Two new rule fields, `excludeTitle` and `minVariantMl`, keep
  Sainte Cellier's discovery boxes and 2ml samples out.
- The JSON-LD reader accepts the capitalised property names Direct Cosmetics writes ("Offers", "SKU",
  "Brand"), which it did not see at all before. Only a fixed list of keys is renamed, and only when the
  right spelling is absent.

## Owner steps

Applications, with the network, so they can be made when convenient:

| Network | Shops |
| --- | --- |
| Awin | Opulensi (merchant 123248, in the registry as `awinPending`); Pharmacy2U Shop / Chemist Direct (2102, blocked to the bot); Al Jazeera Perfumes UK (128425, a client rendered site) |
| Partnerize | Liberty London (30 day cookie, daily feed, confirmed on its own UK page, recorded in the registry); Fenwick (2%, per directories only) |
| CJ Affiliate | Argos (blocked to the bot) |
| Rakuten | Flannels (blocked to the bot); Jo Malone London (unconfirmed) |
| Sale Gains, Paid On Results, BlueAff | PerfumeUK |
| FlexOffers | Perfume Plus Direct, Mankind, Perfumes Club UK (all directory only) |
| Tradetracker | Perfumes of Arabia London |

Decisions and checks:

1. Photos. Say whether D24 covers these ten shops. If yes, one `imageBasis` line per shop with the decision
   comment above it.
2. Sainte Cellier's delivery price. Its pages say "calculated at checkout" and the terms page is
   disallowed to the bot. A basket check by hand would settle it.
3. Opulensi and The Perfume Closet print no price for standard delivery. A basket check would let them
   rank on delivered price. Direct Cosmetics' free delivery over £35 needs a code (FREESHIP35) and excludes
   sale items; a basket check would say whether it should be applied.
5. Rasasi UK Store calls itself the official UK store but its contact address is a trading company's; if
   Rasasi does not stand behind it, set `enabled: false`.
4. Perfumoi's "free next day delivery" is worded "currently". Worth re-reading on the next delivery
   recheck, as is Saad Fragrance's (a one person company formed in 2024).

## Round 2, UK (2026-10-09)

A second search for UK fragrance retailers that are not in the registry (87 entries now, 62 enabled; 81 and 56
when this round began, Glossier UK having been added the same day by the USA and India search). Same method and same hard lines as above (docs/DECISIONS.md D23): WebSearch in standard
mode to name each candidate and find its own domain, then `curl` as PriceSniffsBot over HTTP/1.1 with 1.5 s between
requests: `/robots.txt` first, then the home page, then `/products.json?limit=250`. For every Shopify shop the
whole `/products.json` feed was walked and run through the repo's own `parseShopifyProducts`, `isCatalogueListing`
and `parseRobots`, and page 1 was read at the origin and with `?country=GB` (no price differed at any of the six
shops added). Directories (scentverdict.com, affi.io, FlexOffers, TopCashback) and Awin merchant pages gave the
names and the affiliate column; the directories disagree with each other, so "directory only" marks a claim no
network page confirmed. A shop qualifies only with prices in sterling and its standard UK delivery terms read from
its own page with the date checked; a shop whose terms sit only under `/policies/` (disallowed to the bot) is
listed as not added, not added with a guess.

### Added to the registry on 2026-10-09

| # | Shop | Domain | Sells | Platform | Affiliate | robots.txt | Live check, 2026-10-09 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Rowlands Pharmacy | shop.rowlandspharmacy.co.uk | Pharmacy chain's online shop; 76 designer perfume and aftershave among 1,609 products | Shopify | None found | 200, 3,676 B, Shopify's newer stock file; products.json and the shipping policy allowed | `/products.json` 200, 7 pages; GBP, country GB; 76 Fragrance variants priced (69 pass the catalogue test, 64 in stock); delivery £3.50, free from £30 |
| 2 | LloydsPharmacy | lloydspharmacy.com | Pharmacy chain's online shop; Tom Ford, Burberry, Dior, YSL, Armani among 5,997 products | Shopify | None found | 200, 3,640 B, newer stock file, allowed | `/products.json` 200, 24 pages; GBP; Fragrance 325, Aftershave 3, Perfume 5; 333 variants priced; delivery £2.99 Evri, free from £30 |
| 3 | Beauté Boulevard | beaute-boulevard.co.uk | London luxury perfume and beauty; designer, Creed, Montale, Arabic | Shopify | Awin 126643 (read on the merchant profile; 30 day cookie, UK) | 200, 376 B, collections and products allowed, `/search` disallowed | `/products.json` 200, 11 pages, 2,624 products; GBP; 4,065 variants priced (2,280 pass); free delivery on every UK order |
| 4 | Scent Warehouse | scentwarehouse.co.uk | Salford discount designer perfume (Calvin Klein, Burberry, Davidoff, Cacharel) | Shopify | None found | 200, 3,650 B, newer stock file, allowed | `/products.json` 200, 10 pages, 2,346 products; GBP; 2,345 variants priced (1,771 pass); £2.99 under £20, free over |
| 5 | Roullier White | roullierwhite.com | East Dulwich homeware and lifestyle shop with a niche perfume shelf (Tocca, Wolf Brothers, Carthusia) | Shopify | None found | 200, 3,652 B, newer stock file, allowed | `/products.json` 200, 4 pages, 852 products; GBP; Perfume 247; 252 bottle variants priced after 2ml samples are left out (217 pass); £6.75, free over £175 |
| 6 | Scented | scent-ed.com | Glasgow niche perfumery filed by scent family (Imaginary Authors, Trudon, Arquiste, Comme des Garçons) | Shopify | None found | 200, 3,632 B, newer stock file, allowed | `/products.json` 200, 2 pages, 377 products; GBP; Perfume 270; 325 bottle variants priced (310 pass); £5 under £50, free over |

### Found and not added

| # | Shop | Domain | Sells | Platform | Affiliate | robots.txt | Live check | Why not added |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | Beevora | beevora.co.uk | Birmingham, Arabian houses (Lattafa, Maison Asrar, French Avenue, Riiffs) | Shopify | None found | 200, 2,059 B; the first group names `*` with an empty Disallow, a later group disallows `/policies/` | `/products.json` 200, 1,905 products, GBP, 1,814 pass the catalogue test | Delivery terms are only under `/policies/shipping-policy` (disallowed); the page says "Free UK delivery over £50" and nothing else. A company directory dates the business to 2026. Ready to add once a basket check gives the rate |
| 8 | Aromique | aromique.co.uk | Birmingham, Arabian houses (Lattafa, Khadlaj, Reef, Fragrance World, Ahmed Al Maghribi) | Shopify | None found | 200, 3,626 B, stock file, `/policies/` disallowed | `/products.json` 200, 1,368 products, GBP, 1,097 pass | Same: delivery only under `/policies/`; banner "Free UK delivery on orders over £50" |
| 9 | Aurique | aurique.co.uk | Birmingham, designer and Arabic perfume; 132 products | WooCommerce | None found | 200, 319 B, allowed | Product sitemap 132 URLs; product pages carry names with size and strength | Its delivery page prints no rate ("displayed at checkout") and no days; the JSON-LD names an unrelated company ("Kick Nutrition") |
| 10 | 50 ml UK | 50-ml.co.uk | Milan group's UK niche store, 300+ houses | Magento | None found | 200, 639 B, `/catalog/` and checkout disallowed | `uksitemap_products.xml` 11,133 URLs; product JSON-LD says GBP | Prices look converted from euros (a Penhaligon's set at £90.30); a converted price is not accepted. Free delivery over £90 per its markup. Owner to confirm it prices in sterling |
| 11 | Sultan Pasha Attars | sultanpashaattars.com | London perfumer's own attars | Shopify | None found | 200, 3,650 B, stock | 39 products, GBP | One maker's own house (belongs in `src/config/houses.ts`); titles carry no strength or bottle size, 0 of 149 variants pass |
| 12 | Scent Salim | scentsalim.com | Leeds maker, own-brand oud oils and a workshop | Shopify | None found | 200, 3,624 B, stock | 229 products, GBP | Own brand, not other houses' bottles |
| 13 | House of Fragrances | thehouseoffragrances.co.uk | Birmingham, Arabian houses and "inspired by" lines | Shopify | None found | 200, 3,672 B, stock | 75 products, GBP | Titles read "(Inspired by Dior Sauvage)"; 1 of 76 listings passes the catalogue test and the rest would mislead a match |
| 14 | The Decant Den | thedecantden.co.uk | Birmingham, 3 ml and 8 ml decants | Shopify | None found | 200, 3,634 B, stock | 62 products, GBP | Samples only |
| 15 | The Scent UK | thescent.uk | 1 ml to 10 ml decants | Shopify | None found | 200, 190 B | 36 products, GBP | Samples only |
| 16 | Scentality | scentality.co.uk | Leatherhead, decants and travel atomisers | Shopify | None found | 200, 3,632 B, stock | 6 products, GBP | Too small, decants |
| 17 | Sir Gordon Bennett | sirgordonbennett.com | Stratford-upon-Avon gift shop with some British houses (Wales Perfumery, Sarah Ireland) | Shopify | None found | 200, 3,648 B, stock | 1,392 products, GBP; 52 fragrance variants | Every fragrance variant is out of stock |
| 18 | Aston & Fincher | astonandfincher.co.uk | Barber trade supplier | Shopify | None found | 200, 3,668 B, stock | 7,500 products, GBP | 17 barber colognes only, which the catalogue excludes |
| 19 | The Body Shop UK | thebodyshop.com | Brand store; body mists, 9 eau de toilette in the first 250 products | Shopify | Not checked | 200, 3,644 B, stock | `/products.json` 200, GBP | A house storefront with little perfume |
| 20 | Floral Street | floralstreet.com | One British house, own shop | Shopify | Not checked | 200, 3,626 B, stock | 137 products, GBP | A house storefront: belongs in `src/config/houses.ts` |
| 21 | Cocooncenter UK | cocooncenter.co.uk | French online beauty group, UK site | custom | Not checked | 200, 3,925 B, a long list of blocked bots; category pages allowed | Category page 200, 457 KB, JSON-LD is a breadcrumb only; no sterling price in the markup | No price in a readable form |
| 22 | Super Fragrances | superfragrances.co.uk | Fragrance seller (directory listing) | custom | Not checked | 200, 982 B | Home 200, 482 KB; no `/products.json` | Not examined beyond robots and the home page |
| 23 | Zalando UK | zalando.co.uk | Fashion marketplace with a beauty shelf | custom (app) | Not checked | 200, 644 B | Home 200, 574 KB; no fragrance category found | A fashion platform, not a fragrance shop |
| 24 | Poundland | poundland.co.uk | Discount variety store | Shopify | Not checked | 200, 3,646 B, stock | 250 products, GBP | No perfume bottles in the first 250 products |

### Duplicate, blocked, unreachable or not UK

| # | Shop | Domain | What the bot got | Verdict |
| --- | --- | --- | --- | --- |
| 25 | Perfume Price | perfumeprice.co.uk | 301 to pacoperfumerias.co.uk | The same business as Paco Perfumerias UK, already in the registry (`paco-perfumerias-uk`). Its Awin programme is 21605 (up to 5%, 30 days) |
| 26 | Net-a-Porter | net-a-porter.com | HTTP 403 on robots.txt and the home page | Blocked |
| 27 | Jarrold | jarrold.co.uk | HTTP 525 (TLS handshake failure at the edge) | Unreadable |
| 28 | Planets Perfumery | planetsperfumery.com | Shopify, `/meta.json` USD, Sacramento | Not a UK shop |
| 29 | Indigo Perfumery | indigoperfumery.com | Shopify, `/meta.json` USD, Ohio | Not a UK shop |
| 30 | The Perfume Stylist | theperfumestylist.com | 200, 8 ml refillable sprays; no `/products.json` | Samples and refills only |
| 31 | Arabian Oud UK | uk.arabianoud.com | 200; robots.txt 89 B; no `/products.json` | A house's own storefront, not other houses' bottles |
| 32 | Swiss Arabian Perfumes UK | arabianperfumes.uk | HTTP 404 on every address | No live shop at the address a company directory gave |
| 33 | The English Shaving Company | theenglishshavingcompany.com | 200, custom, no feed | Grooming; aftershave only |
| 34 | Perfume Parlour, Dan's Decants, Angela Flanders, Brummells of London, Floris, Waitrose, Fragrance Zone, Grand Beauty Outlet, The Fragrance Vault | various | No connection from the sandbox on the domains tried (no robots.txt served), or a parked domain | Unreadable here; nothing was fetched. Perfume Parlour sells its own dupes as well (see round 1) |

### What was added, and what each entry stands on

Six shops, all `enabled: true` after a dry run from this sandbox (`npm run harvest -- --shop=<id> --dry-run`) read
real priced listings in sterling. All six are on the Shopify route (`shopifyStorefront: true`, `adapter: 'unknown'`)
with a `catalogue` block whose section is the shop's own `/collections/all`.

| Shop | Rule | Priced listings (sandbox) | Pass the catalogue's fragrance test | Delivery, from the shop's own page, 2026-10-09 |
| --- | --- | --- | --- | --- |
| Rowlands Pharmacy | product type `Fragrance` of 1,609 products | 76 | 69 (57 in stock) | £3.50 standard, free from £30, 3 to 5 working days (`/policies/shipping-policy`, allowed to the bot) |
| LloydsPharmacy | types `Fragrance`, `Aftershave`, `Perfume` of 5,997 products; gift sets left out | 333 | 303 (about 177 in stock) | £2.99 Evri standard, free from £30, 2 to 3 working days (`/pages/delivery-information`) |
| Beauté Boulevard | none; the catalogue test sorts out skincare | 4,065 | 2,280 (1,797 in stock) | Free on every UK order, Royal Mail 48 tracked, 2 to 3 working days (`/pages/shipping-returns-policy`) |
| Scent Warehouse | none; no product types | 2,345 | 1,771 (1,411 in stock) | £2.99 under £20, free from £20 (Evri standard), 2 to 5 working days (`/pages/delivery-information-shipping-policy`) |
| Roullier White | type `Perfume` of 852 products; `sizeOption` leaves out the 2ml samples | 252 | 217 (139 in stock) | £6.75 mainland, free over £175, 1 to 2 working days (`/pages/delivery-returns`) |
| Scented | type `Perfume` of 377 products; `sizeOption` leaves out samples and refills; `excludeTitle` leaves out four "Brume" mists (one a pillow mist); `fragranceOnlyCatalogue` | 325 | 310 (266 in stock) | £5 under £50, free from £50, Royal Mail 48 tracked, 2 to 4 days (`/policies/shipping-policy`, allowed to the bot) |

Photos stay off for all six (`imageBasis` unset until the owner extends D24). No trustpilotUrl is set: the
Trustpilot pages for these domains answer the bot with a "Verifying Connection" challenge (HTTP 403) and
WebSearch found no page for any of the six domains (Rowlands' page is for its high street site). Trustpilot was
not pressed further.

Two things worth knowing about the shared code, neither changed: a `fragranceOnlyCatalogue` shop drops a listing
whose title already names a size and whose option adds it again ("Zagorsk Eau de Toilette 50ml 50ml": 15 of
Scented's 325 variants), and Beauté Boulevard's variant titles repeat the size ("... 100ml Spray Eau de Parfum
100ml Spray"), which the catalogue still reads.

### Owner steps (Round 2)

| Network | Shops |
| --- | --- |
| Awin | Beauté Boulevard (merchant 126643, UK, 30 day cookie; in the registry as `awinPending`). Perfume Price is Paco Perfumerias UK (21605), already tracked |
| Rakuten, Impact | The Fragrance Shop (Rakuten 43488 on its own page; Impact per directory), blocked to the bot, so a feed would be the way in |
| Tradedoubler, Rakuten | The Perfume Shop (Tradedoubler exclusive from 2018 per its blog; Rakuten per directory), blocked to the bot |
| Webgains | Fragrance Direct (exclusive since 2024 per its page, retired from the registry as a holding page) |
| TradeTracker | Perfume Plus Direct (open per directory), Perfumes of Arabia London (campaign 38612) |
| No programme found | Rowlands Pharmacy, LloydsPharmacy, Scent Warehouse, Roullier White, Scented, Beevora, Aromique, Aurique |

Checks only the owner can make:

1. Beevora and Aromique are the two biggest shops found and not added: both read 1,000 or more catalogue listings
   in sterling, but their delivery terms are under `/policies/`, which their robots.txt disallows. A basket check
   of the standard rate and days for each would let both go in with one registry entry apiece (the Shopify route is
   already proved). Beevora's shop is new (2026 per a directory).
2. 50 ml UK: confirm whether the shop sets sterling prices of its own or converts euro prices (D23 does not accept
   a conversion). If its pounds are its own, its 11,133 product pages can be read through the sitemap and JSON-LD.
3. Photos: the six new shops need a D24 ruling like the ten before them.
4. Roullier White does not accept returns of perfume (sold as comestibles) and sells 2ml decants instead; no
   action, but worth a line if the site ever shows return terms.

# UK fragrance retailer candidates, 2026-10-08

Written 2026-10-08. The registry held 74 shops (42 enabled) when this search began. The aim: find UK
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

### Readable now, not added in this pass

| # | Shop | Domain | Sells | Platform | Affiliate | robots.txt | Readable now? | Why not added |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | Liberty London | libertylondon.com | Department store; niche and designer fragrance | Salesforce Commerce Cloud | Partnerize per its own UK page (an older snapshot said Rakuten); 30 day cookie, daily feed | 200, 2,933 B, 52 rules, product sitemap allowed | Yes. `sitemap_0-product.xml` 9.2 MB, 37,068 URLs; a product page (508 KB) carries JSON-LD Product with GBP (Odeur 53 EDT 200ml 135) | Needs a pinned sitemap route like John Lewis, and 500 KB pages mean a slow fill |
| 8 | PerfumeUK | perfumeuk.co.uk | Designer discounter | custom | Sale Gains, Paid On Results, BlueAff (directory only) | 200, 113 B, crawl delay 1 | Yes. One sitemap of 1,291 URLs; a product page (37 KB) has JSON-LD Product with GBP price, SKU and gtin13 (Dolce & Gabbana K EDT 50ml 42) | Not yet routed |
| 9 | Mankind | mankind.co.uk | Men's grooming (THG) with a fragrance range | custom | Network unconfirmed (FlexOffers listing only) | 200, 5,529 B, product sitemaps allowed | Yes. 2,773 product URLs in one gzip sitemap; a page (213 KB) has JSON-LD with a GBP price (Juicy Couture EDP 50ml 55) | Not yet routed; fragrance is about 100 of the 2,773 |
| 10 | Rasasi UK Store | rasasistore.co.uk | Rasasi only, the shop calls itself the official UK store | custom (React, server rendered) | None found | 200, 629 B, allowed | Yes. Sitemap of 64 URLs, about 25 products; a page (90 KB) has JSON-LD with a price (Hawas Ice 100ml 29.99) | Single brand and 25 products |
| 11 | Perfumes Club UK | perfumesclub.co.uk | Large discounter (Spanish group) | custom | FlexOffers listing at 0% (unreliable); Webgains, Skimlinks (directory only) | 200, 3,273 B, 79 rules, crawl delay 1 | Yes. 22,892 URLs in `sitemap-G.xml`; a page (418 KB) has JSON-LD price (Dolce & Gabbana Intense 67.52) | JSON-LD name is the product name alone, no brand or strength |
| 12 | Matalan | matalan.co.uk | Fashion retailer with a small fragrance shelf | custom (same platform as Mankind) | Not checked | 200, 5,413 B | Yes. 21,393 product URLs, about 107 fragrance; JSON-LD prices (Jimmy Choo EDT 30) | Fragrance is half a percent of the range |
| 13 | Direct Cosmetics | directcosmetics.com | Discount beauty with six fragrance sitemaps | custom | Not checked | 200, 1,290 B, crawl delay 2 | Partly. Dedicated `sitemap-products_fragrances-c35-1..6.xml`; a product page (673 KB) parses to a listing with no price | Price is not in the JSON-LD; needs a reader |
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

Every entry is on the Shopify route (`shopifyStorefront: true`, `adapter: 'unknown'`) with a `catalogue`
block whose section is the shop's own collection page. All six are `enabled: true` after a dry run from
this sandbox read real priced listings:

| Shop | Priced variants read | Pass the catalogue's fragrance test | In stock | Delivery, from the shop's own page, 2026-10-08 |
| --- | --- | --- | --- | --- |
| Fenwick | 1,054 | 892 | 644 | £5 standard, free over £100, 3 working days (product page panel) |
| Opulensi | 554 | 495 | 222 | Free over £30, 1 to 5 working days, charge below it not published |
| The Perfume Closet | 1,067 | 836 | 277 | Options named (standard 3 days, first class 1 to 2), no price printed |
| Perfumoi | 464 | 445 | 319 | Free next day on every UK order |
| Saad Fragrance | 156 | 114 | 76 | Free on every order, 3 to 4 working days |
| Sainte Cellier | 268 | 260 | 184 | Not read: the shipping terms sit under `/policies/`, which robots.txt disallows. Recorded as unverified |

Photos stay off for all six. Product photos show only for shops the owner's decision of 2026-10-05
(D24) covers, and `tests/imageBasisDecision.test.ts` fails if the basis is added without it. See the
owner steps.

Two fixes in shared code came out of reading these shops, both with tests:

- `crawlViaShopifyProducts` asks a page that answered HTTP 5xx once more after 15 s. Fenwick's perfume
  sits late in a 100 page feed, so a walk that stopped at the first 503 would miss most of it.
- A `shopifyVariantRule` that only filters product types no longer puts "Default Title" or a "0"
  placeholder into the title it builds.

## Owner steps

Applications, with the network, so they can be made when convenient:

| Network | Shops |
| --- | --- |
| Awin | Opulensi (merchant 123248, in the registry as `awinPending`); Pharmacy2U Shop / Chemist Direct (2102, blocked to the bot); Al Jazeera Perfumes UK (128425, a client rendered site) |
| Partnerize | Fenwick (2%, per directories); Liberty London (30 day cookie, daily feed, per its own UK page) |
| CJ Affiliate | Argos (blocked to the bot) |
| Rakuten | Flannels (blocked to the bot); Jo Malone London (unconfirmed) |
| Sale Gains, Paid On Results, BlueAff | PerfumeUK |
| FlexOffers | Perfume Plus Direct, Mankind, Perfumes Club UK (all directory only) |
| Tradetracker | Perfumes of Arabia London |

Decisions and checks:

1. Photos. Say whether D24 covers these shops. If yes, one `imageBasis` line per shop with the decision
   comment above it.
2. Sainte Cellier's delivery price. Its pages say "calculated at checkout" and the terms page is
   disallowed to the bot. A basket check by hand would settle it.
3. Opulensi and The Perfume Closet print no price for standard delivery. A basket check would let them
   rank on delivered price.
4. Perfumoi's "free next day delivery" is worded "currently". Worth re-reading on the next delivery
   recheck, as is Saad Fragrance's (a one person company formed in 2024).

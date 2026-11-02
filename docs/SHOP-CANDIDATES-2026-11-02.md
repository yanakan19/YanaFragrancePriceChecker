# Shop candidates, 2 November 2026 (research only)

Owner request: "other sites that can be scraped for their prices". Nothing in the code, registries, workflows
or data was changed. Every request was made as `PriceSniffsBot/0.2`, `robots.txt` first (parsed with the
standard `robotparser` for the group of `PriceSniffsBot`, falling back to `*`), 2 s gaps, at most 5 requests
per host, no evasion. Fragrantica was never touched. "Gain" is a sample of the first 50 titles of the
candidate matched (same brand and name tokens plus size, or EAN) against the committed snapshots of that
country: `none` = new product (single shop, no comparison gain), `one` = our catalogue has it at one shop
(becomes 2+: the gain), `2+` = it adds a third or later shop. The first 250 products of a Shopify shop are
alphabetical or by date, so the sample is rough.

## UK (section written first at the owner's request)

The UK registry already holds 87 enabled shops and the 8 and 9 Oct rounds
(`docs/RETAILER-CANDIDATES-2026-10-08.md`) took most of the readable independents, so few new names are left.

| Rank | Shop | robots.txt for PriceSniffsBot | Platform | Products | Barcodes | Gain in sample (none / one / 2+) | Effort | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | P-Eleven (p-eleven.com, London) | 200, 3,678 B, Shopify stock file, `/products.json` allowed (`/policies/` not read) | Shopify, GBP (`/meta.json` GB) | 20,423 in all (skin and body included); about 135 of the first 250 have product type `Fragrance > ...`, niche and designer (Xerjoff, Santa Maria Novella, Police) | No (sku is its own code, e.g. P833234) | fragrance only: 0 / **17** / 33 | S: the existing Shopify walker, filter on product type `Fragrance` so skincare is skipped; the product count means a longer walk (about 82 pages of 250) | **add now** |
| 2 | Soghaat (soghaat.co.uk, Huddersfield) | 200, 4,295 B, custom Shopify file: only `/collections/*sort_by*`, `+`, filter URLs disallowed; products.json and sitemap allowed | Shopify, GBP | 2,613 published (page 3 still full) | **Yes: variant sku is an EAN-13** (243 of 250 variants) | 18 / **10** / 22 | S: Shopify walker | **add now** (Arabian houses: Lattafa, Ajmal, Swiss Arabian, Ahmed Al Maghribi, Osma) |
| 3 | Perfumes Club UK (perfumesclub.co.uk) | 200, 3,657 B, `Crawl-delay: 1`, product pages and sitemap allowed | custom | 22,892 URLs in `sitemap-G.xml` (8 Oct) | JSON-LD price and SKU; barcode not checked | not sampled (needs page reads) | M: sitemap and JSON-LD reader exists but 22.9k pages needs a cap and a rotating cursor | maybe (large discounter; spend crawl minutes only with a per run cap) |
| 4 | Perfume Plus Direct (perfumeplusdirect.co.uk) | 200, 355 B, allows `/` and sitemap | Magento | home lists prices; `/sitemap.xml` 404 (8 Oct) | not checked | not sampled | M to L: category walk, no sitemap | maybe |
| 5 | Mankind (mankind.co.uk) | 200, 5,529 B, product pages allowed | custom (THG) | about 100 fragrance pages of 2,773 | JSON-LD only | not sampled | S, small yield | skip (fragrance is a small shelf) |
| 6 | Swiss Arabian UK (swissarabian.co.uk) | 200, 2,676 B, allowed | house site | one house | n/a | n/a | S | skip (single house; belongs in `houses.ts`, not a price comparison) |

Already in the registry, so not probed: Allbeauty (Cheap Smells trades as Allbeauty), Beauty Base, Parfumdreams
UK, Perfume Direct, Perfume Click, Fragrance Click, Direct Cosmetics, Opulensi, The Perfume Closet, Oud
Arabian, Emirates Oud, Manchester Ouds, Armaf UK, Al Haramain, Riiffs, Zimaya, French Avenue.

**Refused, closed or unreadable (UK):**

| Shop | Why |
| --- | --- |
| Perfume Emporium UK (perfumeemporium.co.uk / www) | robots.txt 200, 70 B: `User-agent: *` then `Disallow: /`. Refused by robots; also refused in the US round |
| Fragrance Direct (fragrancedirect.co.uk) | robots.txt 404; the home page (200) is a "We're making some changes" page, `noindex`, pointing to its sister site Allbeauty (already in). Closed for now |
| Boots, Superdrug, The Perfume Shop, The Fragrance Shop, Selfridges and others | Already in the registry as `enabled: false` (refused or marketplace) |
| Cosmetics Direct, Amaan Perfumes, Mynoor, Ahmed Al Maghribi UK, Lattafa UK, Half Price Perfumes, Aromatics | No answer at the guessed domain (DNS, TLS or connection failure) or no such shop found with one search; not pursued |

## United States (2+ independent shops share 13.1%)

Gain is measured against `data/regions/us/catalogue/`. The big discounters are still walled, and re-checked
today: FragranceNet home 403 (26 KB page), FragranceX home 403, Perfume.com robots 403, Scentbird home 403
(Cloudflare "Just a moment"), FragranceBuy robots 403. The robots files of FragranceNet, Jomashop and
Scentbird would allow the bot; the wall decides, so they stay on the refused list (feeds only).

| Rank | Shop | robots.txt for PriceSniffsBot | Platform | Products | Barcodes | Gain in sample (none / one / 2+) | Effort | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PerfumesAmerica (perfumesamerica.com, Edison NJ) | 200, 3,713 B, Shopify stock file, products.json allowed | Shopify, USD (`/meta.json` US) | 8,024 | No (sku not numeric) | 41 / **5** / 4 (gift sets included) | S: Shopify walker, size and strength sit in the title ("1.7 oz EDP Spray") | **add now** |
| 2 | Triple Traders (tripletraders.com, Bensenville IL) | 200, 3,701 B, stock file | Shopify, USD | 6,585 (Arabian and designer, first page all perfume) | No (sku empty) | 42 / **5** / 3 | S: title carries "100ml/3.4oz" | **add now** |
| 3 | Perfumes4All (perfumes4all.com) | 200, 3,698 B, stock file | Shopify, USD | 25,001 | No | 47 / **3** / 0 | S, but 100 pages a run | maybe (big, low overlap in the first page; cap the walk) |
| 4 | Sensa Beauty (sensabeauty.com) | 200, 3,693 B, stock file | Shopify, USD | about 270 on page 1 | No | titles carry no brand: 0 matched | S | skip (a house-style reseller; brand only in `vendor`) |
| 5 | Luxury Perfumes (luxuryperfume.com, Los Angeles) | 200, 3,703 B | Shopify, USD | not counted | No | 50 / 0 / 0 (discontinued and lot items) | S | skip (liquidation lots, vials; no overlap) |
| 6 | SB Fragrances (sbfragrances.com, Garland TX) | 200, 769 B | not Shopify (products.json 404); hand made 16 KB sitemap | roughly 150 URLs | not checked | not sampled | M | skip (tiny) |
| 7 | HottPerfume (hottperfume.com) | 200, 1,674 B | not Shopify (products.json 404) | not counted | not checked | not sampled | M | skip for now |

**Refused or unreadable (US):**

| Shop | Why |
| --- | --- |
| FragranceNet, FragranceX | home page 403 for the bot today (robots.txt itself allows); feeds only |
| Perfume.com, FragranceBuy | robots.txt 403 |
| Scentbird | home page 403, Cloudflare challenge; robots.txt allows. Subscription decants anyway |
| Perfumeworldwide (Ronkonkoma NY) | `/products.json` 401, so the catalogue is not public; not worked around |
| Perfume Emporium | robots `Disallow: /` for `*` |
| Jomashop | already registered, `enabled: false`: product pages carry no price in markup |
| Big Discount Fragrances | `/` answers 301, `/products.json` 404, not Shopify; not pursued |
| Sephora, Macy's, Nordstrom Rack, TJ Maxx, Walmart, Belk, Kohl's | refused in the 8 and 9 Oct rounds (not re-probed) |
| Notino (www.notino.com) | home 200 but it is the EU storefront, not a US price list; skip |

## India (2+ shops share 16.5%)

| Rank | Shop | robots.txt for PriceSniffsBot | Platform | Products | Barcodes | Gain in sample (none / one / 2+) | Effort | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Scentopia (scentopiaperfumes.com) | 200, 3,723 B, stock file | Shopify, INR (`/meta.json` IN) | 1,439 | No (sku empty) | 11 / **25** / 14 | S: Shopify walker; the title starts "Scentopia Perfumes" in `vendor` only after our prefixing, strength and "100ML" sit in the title | **add now** (half of the sample becomes a second shop) |
| 2 | All Arabic (allarabic.in) | 200, 6,864 B, no rule for `PriceSniffsBot` | Shopify, INR | 704 | No (own sku, e.g. AAPRHIF037) | 27 / **6** / 17 | S; must skip titles ending "(Partial)" (decants) | **add now** |
| 3 | Perfumebay (perfumebay.in) | 200, 3,683 B | Shopify, INR | 32, own house, prices 8,400 and up | No | 0 matched | S | skip (single house) |
| 4 | Ajmal India (in.ajmal.com) | 200, 1,171 B | not probed beyond robots | one house | n/a | n/a | S | skip (single house) |
| 5 | Scentopia's older domain scentopia.in | robots 66 B, products.json 124 B (not a catalogue) | n/a | n/a | n/a | n/a | n/a | skip |

**Refused or not usable (India):** Tata CLiQ (robots 1,033 B allows, but client rendered, as on 9 Oct), Tira, Ajio, Skinn,
Shoppers Stop, Lifestyle, Boddess, Perfume and More (403 on 9 Oct), Perfume Station (`Disallow: /`), Nykaa Man (product page 403),
Jiomart (robots 403), Flipkart and Amazon.in (marketplaces, D29), Myntra (no answer), Smytten (trial samples), Desi Perfumes
(inspired scents, not the original bottles), Parcos, Ravish, Villain and Reliance Digital (no domain that answers or no perfume catalogue
at the guessed address). Purplle stays `enabled: false` (bot check).

## Canada (2+ independent shops share 23.9%, bar 25%)

Rexall, Jean Coutu and Well.ca were probed as the plan asked. Request counts stayed within 5 per host.

| Rank | Shop | robots.txt for PriceSniffsBot | Platform | Products | Barcodes | Gain in sample (none / one / 2+) | Effort | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | My Royal Musk (myroyalmusk.com) | 200, 2,366 B, stock file | Shopify, CAD (`/meta.json` CA) | 1,863 | partial: 135 of 259 variants have a numeric sku | 37 / **11** / 2 | S: Shopify walker, Arabian houses (Arabiyat, Armaf, Lattafa) | **add now** |
| 2 | Fragrance365 (fragrance365.ca) | 200, 3,691 B, stock file | Shopify, CAD | 12,289 | No (own sku) | 47 / **2** / 1 (size is in the variant title, not the product title) | S, but 50 pages a run; the variant title carries "50mL - Eau de Parfum" | maybe (low overlap; big) |
| 3 | Well.ca | 200, 1,876 B, `User-agent: *` Disallow list is `/cgi-bin/`, cart, login and similar; named bots only are blocked | custom (server rendered), `sitemap_wellca_index.xml` | fragrance category `fragrances_614.html` lists `$` prices in HTML; no JSON-LD on the listing | not checked | not sampled | M to L: a listing walker, no products.json | maybe (a drugstore style shelf; fragrance share small) |
| 4 | Rexall | 200, 212 B: `Allow: /`, `Crawl-delay: 5`, `Disallow: /search` | custom | n/a | n/a | n/a | n/a | **refused**: the home page answers the bot with an Incapsula challenge script (`_Incapsula_Resource`, 212 B), not a page |
| 5 | Jean Coutu | 200, 1,221 B, `*` allows product pages, disallows `*filter=*`, `*sortOrder=*`, `page=` | custom | n/a | n/a | n/a | n/a | **refused**: home 200 but the fragrance category page answers 403 ("Erreur", 17 KB); no sitemap named in robots |
| 6 | Pharmaprix, Shoppers, Sephora CA, Holt Renfrew and the rest | refused on 22 Oct | | | | | | refused (not re-probed) |

Best Buy Canada lists Lattafa and Armaf from third party sellers: a marketplace, skipped (D29).

## Ranked top 8 to add overall (balanced by country)

UK top 2 (the owner asked for the UK first): **1 P-Eleven, 2 Soghaat.** UK has only two clear adds because 87 shops are in
already; Perfumes Club and Perfume Plus Direct are the UK maybes.

| # | Shop | Country | Verdict | Why |
| --- | --- | --- | --- | --- |
| 1 | Scentopia | India | add now | 25 of 50 sampled titles already at one Indian shop: the single biggest comparison gain found |
| 2 | P-Eleven | UK | add now | niche and designer, 17 of 50 at one UK shop; filter to Fragrance types |
| 3 | PerfumesAmerica | US | add now | independent US discounter, 8,024 products, 5 of 50 become 2 shops and 4 more join a third |
| 4 | Soghaat | UK | add now | Arabian houses with EAN-13 as sku (best matching quality), 10 of 50 at one shop |
| 5 | My Royal Musk | Canada | add now | 11 of 50 at one shop; Canada is 1.1 points from the bar |
| 6 | All Arabic | India | add now | 6 of 50 at one shop, 17 of 50 already at 2+ so it adds depth; exclude "(Partial)" |
| 7 | Triple Traders | US | add now | 5 of 50 at one shop, 3 at 2+; Arabian plus designer |
| 8 | Fragrance365 | Canada | maybe | 12,289 products, but only 3 of 50 matched; add if the time budget allows a capped walk |

Rough effect on the 2+ shop share if each lands as the sample suggests (extrapolation from the first 250 titles, so
treat as a range, and not subtracting overlap between the new shops): India 16.5% to about 19 to 21% (Scentopia about
700 products, All Arabic about 90); Canada 23.9% to about 25 to 26% (My Royal Musk about 400 products), enough to cross
the 25% bar; US 13.1% to about 14 to 16% (PerfumesAmerica about 800, Triple Traders about 650); UK: P-Eleven plus Soghaat
move a few hundred single shop products to two.

## Crawl time impact

All eight are Shopify `products.json` readers, 250 products a page at the registry gap of 2 s: Scentopia 6 pages
(about 15 s), All Arabic 3, My Royal Musk 8, Soghaat 11 (about 25 s), Triple Traders 27 (about 1 min), PerfumesAmerica
33 (about 1.2 min), P-Eleven 82 (about 3 min, then the fragrance filter keeps a few thousand), Fragrance365 50 (about
2 min). UK: P-Eleven and Soghaat add about 4 minutes to a 61 to 78 minute crawl of the 120 minute limit: put them in the
lighter of the two parallel groups (`src/catalogue/harvestGroups.ts`; group 0 is the one offered the paid tier, so
prefer group 1 if it is the shorter) and keep each Shopify shop on its own host, one group. US (42 to 70 minutes) gains
about 2 to 3 minutes, India (about 43) 0.5 minute, Canada (12.7) 3 minutes: no change of schedule is needed anywhere.
Perfumes4All (100 pages) and Perfumes Club UK (22.9k pages) are the only candidates that would need a per run cap.

Method note: the match script counted a title as the same product when brand and name tokens (minus strength words) were
equal or 80% similar and the size in ml agreed, or the EAN matched; it is a rough count, not the site's own matcher.

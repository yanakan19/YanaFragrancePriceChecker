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

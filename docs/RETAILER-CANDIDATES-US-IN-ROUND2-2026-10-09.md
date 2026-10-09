# USA and India retailer candidates, round 2, 2026-10-09

Written 2026-10-09. Research only: no registry or code change. It extends
`docs/RETAILER-CANDIDATES-USA-INDIA-2026-10-09.md` (round 1: 54 shops, nearly all single house or dollar/rupee
shops that were refused) and feeds the US and India test crawl. The question this round: **which native US
(USD) and Indian (INR) multi brand shops can PriceSniffsBot actually read, by which route, and which fields
carry brand, size, price, barcode and stock.**

Rules held (D23, D29, owner decisions in `docs/INTERNATIONAL-PLAN.md`): PriceSniffsBot only, `robots.txt` first
and obeyed, stop at a refusal or challenge, 1.5 s between requests, no affiliate feeds, marketplaces out, prices
in the shop's own currency. About 65 domains were looked at (roughly 39 US and 27 India, counting each name
once; the round 1 refusals were not repeated except where asked).

## Result in one table

| | Readable multi brand now | Readable but not wanted | Blocked or challenged | No catalogue or no answer |
| --- | --- | --- | --- | --- |
| USA | 15: Ulta, Dillard's, Beauty Encounter, Fragrance Outlet, Fragrance Market, MicroPerfumes (retail bottles), The Perfume Spot, Parfums Raffy, Ministry of Scent, La Belle Perfumes, Luxury Perfumes Inc, eCosmetics, Beverly Hills Perfumery, plus two thin beauty shops (Credo, Violet Grey) | 3: Scent Split and Decant House (decants), The Fragrance Shop US (inspired by oils) | 9: Target (price API disallowed), Walmart, Belk, Kohl's (and so Sephora at Kohl's), TJ Maxx, Nordstrom Rack, Macy's Backstage (inside macys.com, refused in round 1), JCPenney, Perfume Center of America | 8: Ross, Perfume Plus, Big Discount Fragrances, Perfume World Wide, Perfume Boutique, Parfum1, Space NK US, Costco and Sam's (not probed past the home page) |
| India | 7: Nykaa (and Nykaa Luxe, same domain), Purplle (partly), Perfume Palace, FridayCharm, Perfume Network, AAR Fragrances, Perfume Booth (fragile) | 4: Sugandh Lok (incense), Smytten (trial samples), Perfumery.co.in (one artisan house), Ajmal (Gulf shell) | Tira, Nykaa Man (product pages), Amazon.in, Flipkart (terms), Ajio, Shoppers Stop, Lifestyle, Boddess, Perfume and More, Perfume Station (robots `Disallow: /`), Myntra (no answer) | fnb.in, Beauty Bebo, Perfume Culture, Tata 1mg; Perfumed Paris and Perfume2Order (robots not usable, not probed) |

The two weaknesses round 1 predicted hold: the big US department stores are walled (only Dillard's and Ulta
answered), and India has no designer discounter. India does have real multi brand coverage in Nykaa plus four
Shopify shops that sell mostly Arabian and niche houses.

## How each shop was checked

1. `curl --http1.1` with the registry's exact user agent
   (`PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)`), 1.5 s between
   every request, 25 s timeout, up to 3 redirects.
2. `/robots.txt` first. Every file served was run through the repo's own `parseRobots` / `isAllowed`
   (`src/catalogue/robots.ts`, copied to a scratch file and run with Node 22) against each path the probe then
   asked for. A page the parser says is disallowed was not fetched, with the two slips listed next.
3. Home page: status, bytes, platform marker (`cdn.shopify.com`, `Shopify.currency`), challenge markers, JSON-LD
   count, currency strings.
4. The route to listings: `products.json?limit=250` for Shopify, the sitemap for others, then one product page
   for JSON-LD or embedded state.
5. WebSearch (standard mode) to find names and, for Amazon.in and Flipkart, to read what the terms say (third
   party quotation, marked as such). **WebFetch was not used**, because it does not send the bot's user agent.

### Two slips, disclosed

- **Wrong user agent, one request.** My first call to `perfumania.com/robots.txt` was made with curl using
  `-A x` while I was checking the toolchain. It returned 301; nothing from it was used. Perfumania was already
  covered in round 1.
- **Two requests to a path robots.txt disallows.** A scripting error ran `/policies/shipping-policy` on
  `fragranceoutlet.com` and `microperfumes.com` although Shopify's stock `robots.txt` disallows `/policies/` for
  both (the repo's parser said DISALLOWED; the script did not stop on it). Both returned 200. I deleted the
  saved files and **nothing from those two pages is used below**. The fix was a gated fetch that skips any path
  the parser disallows; every later request went through it. Delivery terms for those two shops are therefore
  taken only from the banner text on the home page, which is allowed.

## USA

All prices are USD before sales tax. Shopify `Shopify.currency` was `{"active":"USD","rate":"1.0"}` at the origin
for every Shopify shop below (a real USD price list, nothing converted). Every US shop here ships inside the US;
none was checked for UK or other delivery, which is not the question.

### Readable now, multi brand (best first)

| # | Shop | Domain | Platform | Robots | Live check (2026-10-09) | Route and fields | Size of catalogue | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Ulta Beauty** | ulta.com | custom (Next style) | 200, 2,293 B. No `User-agent: *` group at all (named bots only), so PriceSniffsBot has no rule against it. Sitemaps listed | Home 200, 1,474,368 B. Product page 200, 1,449,268 B | `/sitemap/index.xml` (200, 1,812 B) lists `/sitemap/p.xml`, which lists 29 shards `/sitemap/p-0.xml` to `p-28.xml` (shard 0: 2,000 URLs of the form `/p/<slug>-<id>?sku=<sku>`). Each product page carries JSON-LD `Product`: `brand` (string), `name`, `sku`, `offers.price` (string, "104.00"), `offers.priceCurrency` USD, `offers.availability`, `gtin12` (UPC, on at least the 4.2 oz variant), `Size` ("4.2 oz"), plus a `ProductGroup` with `hasVariant[]` (sku, size, gtin12, url). One request per size (`?sku=`) | About 58,000 sku URLs across all of beauty (29 x 2,000). Fragrance share not counted: the fragrance URLs have to be picked by name tokens (`eau-de-`, `parfum`, `cologne`) or by the `discover/fragrance.xml` and category sitemaps | Heavy: about 1.4 MB per page. The sitemap does not say which URLs are fragrance, so a test crawl should start from a category page or a short list. Free delivery threshold and the terms page were not read |
| 2 | **Dillard's** | dillards.com | custom | 200, 493 B. `Disallow: /webapp/wcs/stores/servlet/` (with one Allow), `/*?*orderBy=*`, `/*?*exclude=*`; `/p/...` paths are allowed | Home 200, 352,383 B. Product page 200, 189,872 B, no challenge | `/sitemap/sitemap.xml` lists `sitemap_beauty_1.xml` (200, 1,816,835 B, 4,797 `/p/` URLs, about 1,716 with fragrance words in the slug) and `sitemap_chanel_1.xml` (82 products). Product page JSON-LD `Product`: `brand.name`, `name`, `offers` as an `AggregateOffer` (`lowPrice`, `highPrice`) holding `offers[]`, one per size, each with `itemOffered.mpn` (EAN 13 left padded with zeros, e.g. `003145891255300`), `itemOffered.sku`, `itemOffered.offers.price`, `priceCurrency` USD, `availability`. **Size is not a field**: it appears only inside `checkoutPageURLTemplate` (`...field2=Size:3.4 oz. Eau De Parfum Spray`) | About 1,700 fragrance product pages | A true department store, so it adds the designer lines (Chanel N°5 3.4 oz was $190 in the markup). Sizes per product page, so far fewer requests per bottle than Ulta |
| 3 | **Beauty Encounter** | beautyencounter.com | Shopify | 200, 3,644 B; `/products.json` allowed, `/cart.js` and `/recommendations/products` disallowed. The file also says agents "should use UCP/MCP" for catalogue and checkout (a request, not a Disallow, and not used here) | `/products.json?limit=250` 200, 928,686 B, 250 products, 107 vendors in that page | `products[]`: `vendor` (the house, e.g. Versace), `title` (includes size and type: "Versace Dylan Blush Pink for Women 3.4 oz Eau de Parfum Spray"), `product_type` ("Fragrance\|Women\|Perfumes"), `variants[]` with `title` (size and concentration), `price` (string), `compare_at_price` (list price), `available` (boolean), **`sku` = the UPC or EAN (475 of 524 sampled variants have a 12 or 13 digit sku)**, JSON-LD also carries `gtin`. No `barcode` field and no stock count in the public feed | About 5,630 products (6 product sitemaps: five of 1,000 and 630 in the last) | Best match key of the Shopify shops. Mixes testers, minis, sample vials and gift sets, filtered by `product_type`. Delivery from its own shipping page (robots allows it): free Standard Ground on orders of $35 or more to the 48 contiguous states |
| 4 | **Fragrance Outlet** | fragranceoutlet.com | Shopify | 200, 6,790 B. `/policies/`, `/search`, `/cart` etc. disallowed; `/products.json` allowed. Several AI bots named | `/products.json?limit=250` 200, 525,493 B, 250 products, 68 vendors | `vendor` = house, `title` ("Ana Abiyed Coral Perfume"), `product_type` ("Eau de Parfum" 192 of 250), `variants[].title` ("2.0 oz."), `price`, `compare_at_price` (on 237 of 250), `available`. `sku` is an internal 10 digit number (1000013690), **not a barcode**. JSON-LD on the product page: `brand.name`, `AggregateOffer` USD, no gtin | About 4,780 (5 product sitemaps) | Designer and Arabian discounter, about 100 US stores. Delivery: banner "$ more to earn free shipping" only; threshold in the cart, not read (its policy page is robots disallowed) |
| 5 | **Fragrance Market** | fragrancemarket.com | Shopify | 200, 7,088 B (Shopify stock, `/products.json` allowed) | `/products.json?limit=250` 200, 463,224 B; home 200, 2,239,088 B | Same shape as Fragrance Outlet: `vendor`, `variants[].title` "3.4 oz.", `price`, `compare_at_price` (246 of 250), `available`, internal 10 digit `sku` | About 4,529 | Discount designer and Arabian (Rasasi, Riiffs, Rayhaan) |
| 6 | **MicroPerfumes** | microperfumes.com | Shopify | 200, 4,366 B (stock) | `/products.json?limit=250` 200, 571,416 B, 65 vendors | One product per format: "1 Million Elixir Parfum - Retail Bottle", "...- Travel Spray", "...- Sample Vial". `variants[0].title` "Retail Bottle - 30 ml (1.0 fl oz)", `price` 63.00, `compare_at_price` on all, `available`. `sku` "mp-9706.030" (internal) | About 1,690 (1,000 + 690) | **Only the "Retail Bottle" products are comparable**; travel sprays and vials need dropping by title. Banner: "Fast & Free U.S. Shipping Over $69" (home page text) |
| 7 | **The Perfume Spot** | theperfumespot.com | BigCommerce | 200, 1,674 B (account, cart, checkout, search paths only) | Home 200, 398,166 B (a Cloudflare script is present but the content served); product page 200, 408,845 B | `/xmlsitemap.php` (200, 827 B) lists `xmlsitemap.php?type=products&page=1` (200, 1,131,326 B, **9,019 URLs**; page 2 gives 404). Each product page: JSON-LD `Product` with `name` (includes size: "Athenais by Parfums de Marly, 2.5 oz Eau De Parfum Spray for Women"), `sku`, **`gtin14` ("03700578509536")**, `brand.name`, `offers.price` ("266.56"), `priceCurrency` USD, `availability`, `priceValidUntil` | 9,019 | Best structured data of the non Shopify shops (barcode, brand, size, stock) but one request and about 400 KB per bottle, so a full read is 9,000 requests |
| 8 | **Parfums Raffy** | parfumsraffy.com | Shopify | 200, 3,632 B (stock plus agent hints) | `/products.json?limit=250` 200, 764,410 B | **`vendor` is always "Parfums Raffy"**: the house is only in `title` ("Essential Parfums Bois Imperial"). Variants `title` "100 mL \| 3.4 oz Eau de Parfum Spray", also "2.0 mL Spray Sample", "10 mL"; `price`, `compare_at_price`, `available`; `sku` is shared by all variants of a product | About 1,640 | Designer and niche (Acqua di Parma, Amouage, Creed, Chanel, Byredo on its brand list). Delivery from its own page (robots allows): Standard free on $75 or more (West Coast 2 to 5, East Coast 5 to 10 business days); Economy Standard under $75 is $7.95 |
| 9 | **Ministry of Scent** | ministryofscent.com | Shopify | 200, 3,636 B | `/products.json?limit=250` 200, 1,283,978 B | `vendor` = house (Villa Erbatium, Arielle Shoshana), `product_type` ("Eau de Parfum" 140 of 250, "Sample Set" 30), variants "50ml Eau de Parfum", "2ml Spray Sample"; `price`, `available` (many out of stock) | About 1,390 | Niche indies, San Francisco |
| 10 | **La Belle Perfumes** | labelleperfumes.com | Shopify | 200, 5,686 B | Home 200 (first try timed out, second 403,334 B); `/products.json?limit=250` 200, 863,660 B | `vendor` = house (MARC JACOBS, ARMAF), size in `title` ("... 1.7 oz TESTER for women"), single variant "Default Title", `price`, `compare_at_price`, `available`; internal sku | About 5,000 to 6,000 (six product sitemaps) | Miami, "wholesale since 1985": includes testers and unboxed items. Retail terms not read |
| 11 | **Luxury Perfumes Inc** | luxuryperfume.com | Shopify | 200, 3,636 B | `/products.json?limit=250` 200, 914,063 B; home 199,018 B | `vendor` is "Luxury Perfumes Inc." (not the house, which is in `title`: "KENZO WORLD BY KENZO"); variant `title` "Eau De Parfum for Women" or "3.4 Oz Eau de Toilette for Women." ; `price`; many "DISCONTINUED", "unboxed", vial lots | About 7,500 | Noisy; needs a strong filter. Low priority |
| 12 | **eCosmetics** | ecosmetics.com | WooCommerce | 200, 226 B (only wp-admin, cart, checkout and `?wc-ajax=`) | Home 200, 304,086 B | WooCommerce Store API, which robots does not disallow: `/wp-json/wc/store/v1/products?per_page=100&page=N&category=fragrance` (200, 18,819 B for 3 products; header `x-wp-total: 44807`). Fields: `name`, `sku`, `prices.price` in **minor units** ("12400" = $124.00, `currency_minor_unit` 2), `prices.currency_code` USD, `categories[]`, `attributes[].terms` (sizes), `variations[]` ids, `is_in_stock`. Variable products show a range; a variation's own price is at `/wp-json/wc/store/v1/products/<variation id>` | 44,807 in the fragrance category (includes candles and home) | Unreliable on the list: one variable product showed `price` 9500 under a `regular_price` of 10781, so read variation records. `brands[]` was empty on the sample. A different, more intrusive style of route than a sitemap; flag for the owner |
| 13 | **Beverly Hills Perfumery** | beverlyhillsperfumery.com | Wix Stores | 200, 503 B (`Allow: /`) | Home 200, 2,228,998 B | `/store-products-sitemap.xml` (200, 921,980 B, 2,164 URLs of the form `/product-page/<slug>`). JSON-LD `Product`: `name`, `brand.name`, `offers.price` ("290"), USD, `availability`. **No size and no gtin** in the markup | 2,164 | Niche boutique. Without a size it cannot be matched safely |
| 14 | Credo Beauty and Violet Grey | credobeauty.com, violetgrey.com | Shopify | 200 (stock; Violet Grey also carries agent hints) | `/products.json?limit=250` 200, 1,513,660 B and 1,687,952 B | Same Shopify fields. Fragrance is a small part (Credo: 24 of the first 250 are `fragrance, fragrances, eau de parfum`; Violet Grey: 25 "Fragrance") and Violet Grey variants carry no size | Large beauty catalogues | Readable, low yield for fragrance |

Further notes for these:

- **The Shopify public feed has no `barcode` field and no stock quantity** on any of the shops above (checked on
  all 250 products of each first page). Only Beauty Encounter's `sku` is a barcode; everywhere else the match
  to a product id will rest on brand, name and size, with the US test crawl's matcher.
- `products.json` pagination was exercised for page 1 only (`limit=250`); `page=2` and later are the standard
  Shopify parameters but were not requested here.
- Ulta, Dillard's and The Perfume Spot terms pages were not read; they should be before enabling.

### Readable but not wanted

| Shop | Domain | What it is | Check | Verdict |
| --- | --- | --- | --- | --- |
| Scent Split | scentsplit.com | Decants and samples (1 ml, 2 ml glass spray) beside the full bottle ("78ml in Manufacturer's bottle") | Robots 200, 6,212 B; `/products.json` 200, 1,165,494 B, USD; 11 product sitemaps (about 10,000+); the sitemap shard URLs came back under `/en-ca/` | **Out (decants).** Its full bottle variants could be used, but 1,224 variants in 250 products are mostly 1 ml and 2 ml |
| Decant House | decanthouse.com | Decants | Robots 200, 3,343 B; home 200, 29,638 B, not Shopify | **Out (decants)**, not probed further |
| The Fragrance Shop US | thefragranceshop.com | Perfume oils sold as "Le Labo Hinoki **type** for men & women", "Kayali **type**": inspired by oils, vendor "Kayali type", plus a "Private Label Formulation Fee" product | Robots 200, 5,469 B; `/products.json` 200, 3,178,976 B | **Out (inspired by).** Not the UK The Fragrance Shop; the dupe rule of 2026-10-08 applies |

### Blocked or challenged (stopped)

| Shop | Domain | Evidence | Verdict |
| --- | --- | --- | --- |
| Target | target.com | Robots 200, 3,226 B; sitemaps readable (`sitemap_pdp-index.xml.gz` 200, 9,081 B). Product page 200, 346,446 B but **no price in it**: no JSON-LD, price comes from `redsky.target.com`, whose robots.txt (200, 41 B) is `User-agent: *` `Disallow: /` | **Blocked in effect (price API disallowed)** |
| Walmart | walmart.com | Robots 200, 3,584 B; home 200. A product page (`/ip/...`) answered 200 but redirected to `/blocked?...` titled "Robot or human?" (PerimeterX, 15,195 B). "First party offers only" could not be tested | **Blocked (challenge on product pages)** |
| Belk | belk.com | Robots 200, 2,949 B; home 403, 4,000 B "Access to this page has been denied" (PerimeterX) | **Blocked** |
| Kohl's (and Sephora at Kohl's) | kohls.com | Robots 403, 381 B | **Blocked.** Sephora at Kohl's is inside kohls.com, so also out |
| TJ Maxx (and Marshalls, same group) | tjmaxx.tjx.com | Robots 200, 2,939 B; home 200 but "Access Denied", 5,140 B | **Blocked** |
| Nordstrom Rack | nordstromrack.com | Robots 200, 1,322 B; home 200, 253,130 B with an empty `<title>` and a script challenge shell | **Blocked (challenge)** |
| Macy's Backstage | inside macys.com | `backstage.com` is an unrelated site (403). Macy's was refused in round 1 | **Blocked (as Macy's)** |
| JCPenney | jcpenney.com | `jcpenney.com/robots.txt` 301 to www; `www.jcpenney.com` timed out at 20 s, twice | **No answer** |
| Perfume Center of America | perfumecenterofamerica.com | TLS handshake error (`tlsv1 alert internal error`) on both hosts | **No answer** |
| Perfume Boutique, Parfum1, Space NK US | perfumeboutique.com, parfum1.com, us.spacenk.com | No answer (connection failed) | **No answer** |

### No catalogue, closed, or not probed

| Shop | Domain | Evidence | Verdict |
| --- | --- | --- | --- |
| Ross | rossstores.com | Corporate WordPress site, robots 128 B, no online store | No catalogue |
| Perfume Plus | perfumeplus.com | Robots 66 B (`Allow: /`); home is a 114 B redirect to `/lander` (parked) | No catalogue |
| Big Discount Fragrances | bigdiscountfragrances.com | Home 200, 13,930 B titled with a casino advertisement: the domain has been taken over | No catalogue (do not use) |
| Perfume World Wide | perfumeworldwide.com | Home redirects to `/password` (storefront password page) | Closed |
| Costco, Sam's Club | costco.com, samsclub.com | Robots 200 (3,997 B and 448 B); home 200 (3,260,271 B, 473,836 B). Membership clubs; product pages and whether prices show without a login were **not probed** | Not probed |
| Strawberrynet US, Saks OFF 5TH | us.strawberrynet.com, saksoff5th.com | Strawberrynet robots 404 (no rules), not probed further; Saks OFF 5TH's `/robots.txt` answered with an HTML page, not rules (Saks was refused in round 1) | Not probed |
| FragranceBuy | fragrancebuy.ca | Robots 403, 4,551 B (a Canadian shop anyway) | Blocked |

## India

All prices INR. India's tax model (GST included in the price, MRP as the reference) was not checked on any
shop in this pass; where a field is called "MRP" below it is the shop's own `mrp` or `compare_at_price` and its
meaning is not confirmed.

### Readable now, multi brand (best first)

| # | Shop | Domain | Platform | Robots | Live check (2026-10-09) | Route and fields | Size of catalogue | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Nykaa** (includes Nykaa Luxe, which is `/luxe/...` on the same domain) | nykaa.com | custom (React) | 200, 487 B. `Disallow: /search/`, `/catalog/`, `/blog/` and a few more; product, category and sitemap paths allowed | Home 200 (round 1: 622,703 B). Product page `/ajmal-carbon-eau-de-parfum/p/349769` 200, 209,280 B. Category page `/fragrance/perfumes/c/2051` 200, 466,134 B | `/sitemap-v2/sitemap-index.xml` (200, 564 B) lists `sitemap-products-index.xml` (200, 755 B), which lists 7 product shards (`sitemap-products-1.xml` ...). Product page JSON-LD `Product`: `brand` (string), `name`, **`sku` and `mpn` = the barcode** (6293708700035), `offers.price` (1050), `priceCurrency` INR, `availability`. The page's `dataLayer` / `window.__PRELOADED_STATE__` adds `mrp` (1500), `offerPrice` (1050), `packSize` ("100ml"), `brandName`, `inStock`, `discount`. Luxe items (Dior, Lancôme) appear in the same shape | 7 shards; the matching Nykaa Man shard held 50,000 URLs, so the order of 300,000 products across all of beauty (shard size for nykaa.com not measured) | The anchor, as round 1 said. `/products.json` returned 503 in round 1 and was not retried. Terms of use not read. Heavy page (about 200 KB) but sizes and prices come from one request |
| 2 | **Purplle** (partly readable) | purplle.com | custom | 200, 1,106 B. `Disallow: /search*`, `/listing/`, `/product/productfeed/`, `/webservice/`, `/pd/*` and others; `/product/` and `/collections/` allowed | Home 200, 318,577 B. Collection page `/collections/perfumes-1` 200, 316,252 B. Product pages 200, 345,737 B and 373,220 B | Collection pages embed `window.__INITIAL_STATE__` with 27 products each: `id`, `slug`, `brand_id`, **`price` (MRP) and `offer_price`**, `stock_status`, and `multiple_variants[].items[]` with `option_display_value` ("15 ml", "50 ml"), each with its own `offer_price` and `stock_status`. Product pages carry JSON-LD `Product` with `offers.price`, `sku`, `brand.name`, **but in the two pages read (both sold out) `price` was "0" and `availability` SoldOut**. `/collections/perfumes-1?page=2` returned exactly the same bytes as page 1 (316,252 B, identical): paging is not by that parameter | Not countable here; sitemap index at `/sitemap.xml` lists product groups (`/sitemap/products/product-brands.xml` ...) not read | Mass market Indian and D2C brands (Engage, Plum, Renee, Pilgrim, Bella Vita, Biotique), almost no designer. A full read needs the category listings or the sitemaps' product URLs, not the collection paging |
| 3 | **Perfume Palace** | perfumepalace.in | Shopify | 200, 3,632 B (stock) | `Shopify.currency` INR rate 1.0; `/products.json?limit=250` 200, 1,009,738 B, 250 products | `vendor` = house (Khadlaj), `title` includes size ("Khadlaj Qarar Extrait De Parfum 60ml For Men & Women"), `product_type` (Eau De Parfum / Extrait / perfume oil), `price` (4999.00), `compare_at_price` (196 of 250), `available`, internal `sku` ("RNAlShaghafMaraya"), no barcode | About 7,700 (8 product sitemaps) | Arabian and niche leaning. Delivery and GST wording not read |
| 4 | **FridayCharm** | fridaycharm.com | Shopify | 200, 3,642 B | INR rate 1.0; `/products.json?limit=250` 200, **2,472,309 B** for 250 products | `vendor` = house (Swiss Arabian, Maison Francis Kurkdjian, Mancera), variants "70ml", "120ml", `price` 42500.00, `compare_at_price` (245 of 250), `available`; `product_type` "G-CAT-Middle Eastern", "Designer Perfumes", "G-CAT-NICHE"; `sku` like "Khadlaj-Muse-EDP-U-100ml" (no barcode) | About 6,800 (7 product sitemaps; one collection said 1,593) | Mumbai. Mix of designer, niche, Arabian |
| 5 | **Perfume Network** | perfumenetwork.in | Shopify | 200, 3,652 B | INR rate 1.0; `/products.json?limit=250` 200, 794,649 B | `vendor` = house (Rayhaan, Tom Ford), `title` ("Rayhaan Jungle Vibe Eau de Parfum"), variants "100ml", `price` 2350.00, `compare_at_price` (155 of 250), `available`; `sku` null. A search snippet showed Tom Ford at ₹25,840 against MRP ₹30,400 "inclusive of all taxes" | About 1,700 (1,000 + 699) | One of the few with real designer and niche (Tom Ford, Maison Margiela) in India. 146 of 250 first page items out of stock |
| 6 | **AAR Fragrances** | aarfragrances.com | custom | 200, 78 B (`Disallow:` empty, so everything allowed) | Home 200, 193,308 B; product page 200, 146,346 B | `/sitemap.xml` (200, 1,199,356 B) lists **4,386** `/product/<slug>` URLs. **No JSON-LD.** Price from `<meta property="og:price:amount" content="₹2,389.00">` and `product:price:currency` "Rupee"; title and brand in `og:title` ("Buy Ahmed Al Maghribi Mystique Pink EDP 100ml"); stock from the visible "Add to cart" / "Out of Stock" text. Size is only in the title | 4,386 | Arabian and some designer (Gucci Flora). Thin markup, so fragile |
| 7 | **Perfume Booth** (fragile) | perfumebooth.com | headless Shopify on Next.js | 200, 586 B. `Disallow: /*?*` (**no query strings**, so `products.json?limit=` is disallowed) | Home 200, 697,196 B; `/products.json` (no query) answers 200 with an HTML app shell, not JSON | `/sitemap.xml` (200, 64,085 B) lists 326 URLs, of which about 250 are `/products/<handle>`. No product JSON-LD; the page's Next.js flight payload carries `handle`, `amount "4312.0"`, `currencyCode "INR"`, `availableForSale`. Needs a parser for that payload | About 250 listed | Arabian and Indian niche (Al Haramain, Arabiyat Prestige). Works only as a payload scrape; lowest priority |

### Readable but not wanted

| Shop | Domain | Check | Verdict |
| --- | --- | --- | --- |
| Sugandh Lok | sugandhlok.com | Shopify INR, `/products.json` 200, 731,574 B, 181 products: **incense** (agarbatti 105, dhoop 21, cones 12) | Out (not fragrance) |
| Smytten | smytten.com | Robots 200, 176 B; home 200, 46,316 B: free trial samples | Out (samples) |
| Perfumery.co.in | perfumery.co.in | Robots 24 B (allow all); home 200, 18,865 B: "Niche and Artisanal Blends" | Out (one artisan house) |
| Ajmal | ajmalperfume.com redirects to ajmal.com | `/robots.txt` answered with the 15,064 B home page (no rules); Gulf focused, no INR or GBP in the shell (as round 1) | Out (single house, no Indian price list found) |

### Blocked, marketplace or refused (stopped)

| Shop | Domain | Evidence | Verdict |
| --- | --- | --- | --- |
| Tira | tirabeauty.com | Robots 200, 2,073 B, **allows all and names GPTBot, ClaudeBot and others**, but home 403 "Access Denied", 368 B (round 1 saw 372 B) | **Blocked** (re-checked: still a wall despite the open robots file) |
| Nykaa Man | nykaaman.com | Robots 200, 343 B; sitemap index and product sitemaps readable (`sitemap-products-1.xml` 200, 7,766,788 B, 50,000 URLs, 7 shards). Product page `/bvlgari-pour-homme-eau-de-parfum/p/14326645` **403 "Access Denied", 439 B** | **Blocked at the product page.** Nykaa Man's listing URLs are a subset of Nykaa's; use nykaa.com |
| Amazon.in | amazon.in | Robots 200, 9,320 B. The generic group disallows only a list of account, cart and review paths, so `/dp/` and `/s?k=` are not disallowed by robots. The first content request (`/gp/help/customer/display.html?nodeId=200545940`, the Conditions of Use) came back **403, 870 B**, so I stopped. Terms, per a third party copy of Amazon's conditions: the licence "excludes any use of data mining, robots, or similar data gathering and extraction tools" (not read on amazon.in itself, because the page was refused) | **Marketplace (D29) and refused.** Nothing was gone round |
| Flipkart | flipkart.com | Robots 200, 3,111 B: product, listing and sitemap paths are not disallowed for generic agents; only seller, review, cart and facet parameter paths are. Home 200, 1,342,926 B. `/pages/terms` returned a generic SEO page, not the terms. A third party quotation of Flipkart's terms says the Platform may not be accessed with a "deep link", "page scrape", "robot", "spider" or automatic device | **Marketplace (D29). Robots permits, terms (as quoted, not read from Flipkart's own page) forbid automated access.** No route |
| Myntra | myntra.com | Robots: no answer at 20 s (round 1: no answer at 25 s) | Marketplace, no answer |
| Ajio | ajio.com | Robots 403, 380 B | Marketplace, blocked |
| Shoppers Stop | shoppersstop.com | Robots 403, **9 B** | Blocked |
| Lifestyle | lifestylestores.com | Robots 403, 5,201 B | Blocked |
| Boddess | boddess.com | Robots 403, 919 B | Blocked |
| Perfume and More | perfumeandmore.in | Robots 403, 4,920 B | Blocked |
| Perfume Station | perfumestation.in | Robots 200, 70 B, **`User-agent: *` `Disallow: /`** | Refused by robots |

### No catalogue or no answer

| Shop | Domain | Evidence | Verdict |
| --- | --- | --- | --- |
| fnb.in (Fragrance and Beauty) | fnb.in | `/robots.txt` returned a "Contact Us" HTML form page titled fnb.in | No catalogue (placeholder page) |
| Beauty Bebo | beautybebo.com | Home redirects to HugeDomains: "BeautyBebo.com is for sale" | No catalogue |
| Perfume Culture | perfumeculture.in | No answer on both hosts (connection failed) | No answer |
| Tata 1mg | 1mg.com | Robots 200, 1,260 B; home 200, 452,882 B, **no mention of perfume or fragrance** in the home page | No catalogue |
| Perfumed Paris, Perfume2Order | perfumedparis.in, perfume2order.com | Perfumed Paris `/robots.txt/` returned a 183,719 B HTML page, Perfume2Order returned 404; neither was probed further | Not probed |
| Perfume Hub India | not found | WebSearch found no store of that name; no domain was guessed | Not found |
| Tata CLiQ, Myntra | (round 1) | Marketplaces | Out |

## For the test crawl

The routes, in the order a test crawl should try them. "Fields" are the ones present in the feed or markup; a
blank means absent.

| Order | Shop | Country | Route | Brand | Size | Price | Barcode | Stock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Beauty Encounter | US | `/products.json?limit=250&page=N` | `vendor` | `variants[].title` and `title` | `variants[].price`, `compare_at_price` | `variants[].sku` (UPC or EAN) | `available` |
| 2 | Fragrance Outlet | US | `/products.json?limit=250&page=N` | `vendor` | `variants[].title` | same | none (internal sku) | `available` |
| 3 | Fragrance Market | US | same | `vendor` | same | same | none | `available` |
| 4 | MicroPerfumes | US | same, keep "Retail Bottle" products only | `vendor` | `variants[0].title` | same | none | `available` |
| 5 | Parfums Raffy | US | same | in `title` (vendor is the shop) | `variants[].title` | same | none | `available` |
| 6 | Ministry of Scent, La Belle Perfumes | US | same | `vendor` (La Belle: also `title`) | `variants[].title` or `title` | same | none | `available` |
| 7 | Ulta | US | sitemap `p-N.xml` then page JSON-LD | `brand` | `Size` | `offers.price` | `gtin12` | `offers.availability` |
| 8 | Dillard's | US | `sitemap_beauty_1.xml` then page JSON-LD | `brand.name` | only in `checkoutPageURLTemplate` | `offers.offers[].itemOffered.offers.price` | `itemOffered.mpn` (EAN 13, zero padded) | `availability` |
| 9 | The Perfume Spot | US | `xmlsitemap.php?type=products&page=1` then page JSON-LD | `brand.name` | in `name` | `offers.price` | `gtin14` | `availability` |
| 10 | Nykaa | IN | sitemap-v2 products index then page JSON-LD and `dataLayer` | `brand`, `brandName` | `packSize` | `offers.price`, `offerPrice`, `mrp` | `sku` and `mpn` | `availability`, `inStock` |
| 11 | Perfume Palace, FridayCharm, Perfume Network | IN | `/products.json?limit=250&page=N` | `vendor` | `title` / `variants[].title` | `price`, `compare_at_price` | none | `available` |
| 12 | Purplle | IN | category listing `window.__INITIAL_STATE__` | `brand_id` only (name in `title`) | `option_display_value` | `offer_price`, `price` | none | `stock_status` |
| 13 | AAR Fragrances | IN | sitemap then `og:price:amount` | in title | in title | `og:price:amount` | none | page text |

Build notes:

- **Shopify shops, shared code.** The existing Shopify reader works for items 1 to 6 and 11. Two things differ
  from the UK shops: sizes may be in **ounces** (the UK reader already converts) and the **house is sometimes
  not the `vendor`** (Parfums Raffy and Luxury Perfumes Inc), so brand needs the title parse.
- **Only Beauty Encounter, Ulta, Dillard's, The Perfume Spot and Nykaa carry a barcode.** The rest will rely
  on name matching until a barcode source exists.
- **Cost.** A Shopify page is 250 products per request (about 0.5 to 2.5 MB). The JSON-LD shops are one product
  per request at about 150 KB to 1.5 MB: The Perfume Spot is 9,019 pages at roughly 400 KB each, Ulta about
  1.4 MB per size. Fragrance only subsets are needed for both.
- **Which of the two US department stores adds the most**: Dillard's (designer, Chanel) and Ulta (the big US beauty
  chain). Both answer the bot and carry barcodes.
- **Walls move.** Nykaa answered on product pages while Nykaa Man (same group) refused them, and Walmart passed on
  the home page and challenged on the product page. Check a **product page**, not only the home page, before
  trusting a shop.

## Open items and owner steps

1. **Terms of use.** Not read for Ulta, Dillard's, The Perfume Spot, Nykaa, Purplle or any Shopify shop. D23 only
   requires robots.txt, but a read of each shop's terms for a "no automated access" line should come before
   enabling any of them.
2. **Amazon.in and Flipkart.** Recorded plainly: Amazon.in refused the bot at the first content page and its
   terms (via a third party copy) exclude data gathering tools; Flipkart's robots.txt would permit the paths but
   its terms, as quoted by a third party, forbid page scraping. Neither is a marketplace the owner has allowed
   (D29). Nothing was worked round.
3. **eCosmetics.** The only route is WooCommerce's public Store API. Robots does not disallow `/wp-json/`, but it
   is an application interface rather than a page, so the owner may want to rule on it.
4. **Retail Bottle filter** for MicroPerfumes and the tester and gift set handling at La Belle, Beauty Encounter
   and Fragrance Outlet need rules in the test crawl.
5. **Not probed:** Costco, Sam's Club (membership pricing), Strawberrynet US, Saks OFF 5TH, Perfumed Paris,
   Perfume2Order; also the rest of the Shopify `page=N` series, delivery terms for every Indian shop, and India's
   GST / MRP presentation.

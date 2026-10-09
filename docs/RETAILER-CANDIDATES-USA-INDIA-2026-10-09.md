# USA and India fragrance retailer candidates, 2026-10-09

Written 2026-10-09. The aim: find fragrance retailers and brand stores in the USA and India that ship to
the UK, and add the ones that meet the site's rule: a real price in GBP stated by the shop itself, UK
delivery terms on the shop's own page, and a landed cost (import VAT and duty) that the site can state
honestly. Marketplaces are left out as in D29 and the supermarket rule. UK domains were left to the UK
pass that ran at the same time.

Result: 54 shops looked at (30 USA, 24 India). **1 add now** (Glossier UK), **1 add later**
(Le Labo), **52 no**. No Indian shop quotes sterling at all.

The hard lines (docs/DECISIONS.md D23) held: every request to a shop was made as PriceSniffsBot and nothing
else, robots.txt was read first, and a shop that answered with a refusal or a challenge was left alone
(no further request after a refused robots.txt). Delivery and duty pages were read with the same
rule where the shop allows it, and otherwise from what a web search returned of the page, which is marked
"search snippet" below. Those are leads, not readings.

## How each shop was checked

1. WebSearch (standard mode) for names, then the shop's own domain.
2. `curl` as PriceSniffsBot over HTTP/1.1, 1.5 s between requests: `/robots.txt` first, then the home
   page, then `/products.json?limit=5`. Stopped after robots.txt if it was refused.
3. Currency, the part that decides this pass. For a Shopify shop the home page was read at the origin and
   with `?country=GB`, and `Shopify.currency` compared. **`{"active":"GBP","rate":"0.766851785"}` is
   Shopify Markets converting a dollar list at its live rate, not a sterling price list.** Five shops
   did exactly that (the same rate, to nine places). A price list kept in pounds reads `"rate":"1.0"`. For
   one converting shop the products feed was also read with `country=GB`: Imaginary Authors 115 USD becomes
   89 (115 x 0.7669 = 88.2, rounded up) and Beautyhabit 30 USD becomes 23.01 (30 x 0.7669 exactly).
4. The repo's own `parseRobots` / `isAllowed` on every robots.txt that was served.

"Readable" below means the pipeline could use it. Bytes are as received.

## What decided most of it

- **Currency.** Of 30 USA shops only one quotes pounds itself (Glossier UK). Twelve answer with a bot wall
  (HTTP 403 or a challenge page on robots.txt or the home page), nine quote dollars only, six show a pound
  figure that is a conversion (five Shopify Markets shops and Nordstrom through eShopWorld), one is a UK
  domain left to the UK pass, and one (Le Labo) has a GBP list we could not reach. Of 24 Indian shops,
  every one that answered quotes rupees (Rose Moore defaults to dollars and Kannauj Attar adds them); none
  quotes pounds.
- **Landed cost.** Where a US shop does ship to the UK it generally sends from the US, so UK import VAT
  and duty arise. The shops that say so put it on the buyer: Jomashop ("most international orders are
  subject to customs duty and tax ... the sole responsibility of the customer", search snippet), FragranceNet
  ("not included in our prices", search snippet), Twisted Lily (its policy says collected at checkout, its
  FAQ says paid on arrival). Nordstrom takes duties and taxes at checkout through eShopWorld and shows
  "your currency", which is a conversion. UK rule of thumb, not read from HMRC here: VAT on a consignment of
  £135 or less is charged by the seller at the sale, and above £135 VAT and duty are charged at the border.
  The registry has `shipping.notes` for a landed cost note but nothing in the offer row shows it, so a shop
  whose price is not the landed price is recorded as no.
- **Perfume is a dangerous good** (alcohol, flammable). Nordstrom: "beauty items, hazardous materials ...
  may also have international shipping restrictions". Twisted Lily: orders to the UK with an item total of
  £135 or less are "currently restricted due to UK customs regulations" (search snippet). Glossier: "fragrance
  is considered a Dangerous Good", so next day delivery of a liquid is mainland UK only.

## USA

Platform "custom" means a bespoke or unidentified storefront. Affiliate is "not checked" unless a column
says otherwise: none of these were applied to.

| # | Shop | Domain | Sells | Platform | GBP price and UK delivery from the shop | Duties and VAT for a UK buyer | robots.txt | Live check (2026-10-09) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Glossier UK** | uk.glossier.com | Glossier You eau de parfum range, plus skincare and make-up | Shopify | **Yes.** `/meta.json` says London, GB, GBP; `Shopify.currency` GBP rate 1.0; Glossier You 50 ml £70 (US shop $82). Delivery £4, free over £30, 3 to 5 business days, from its own help centre | Help centre: "If your order is subject to duties, taxes, or related fees, you'll be charged at checkout (you won't need to pay anything extra when your package is delivered)." Royal Mail UK delivery. Does not say the price includes VAT | 200, 3,628 B, stock file, products and `/products.json` allowed | `/products.json` 200, 1,132,937 B, 135 products, 391 variants, GBP; same prices with `?country=GB`; 5 product pages carry JSON-LD priceCurrency GBP; dry run 26 priced listings, 12 bottles pass the catalogue's test | **Add now** (see below) |
| 2 | Le Labo | lelabofragrances.com | One niche house, own shop (Estée Lauder) | custom | A GBP list exists for GB (the page script holds `GBPcountries` GB, GG, IM, JE), but a US caller gets dollars; no sterling address reached | Not read | 200, 322 B, disallows `/front/`, `/icat/` and a few more | Home 200, 341,451 B; `/products.json` 404; `lelabofragrances.co.uk` and `uk.lelabofragrances.com` did not answer | **Add later** (needs a route to the GB list and a UK delivery page) |
| 3 | FragranceNet | fragrancenet.com | Large US discounter | custom | USD. Has a UK locale link (`?locale=en_UK`) | "Customs policies and import duties vary ... not included in our prices" (search snippet); shipping page says VAT charged at checkout | 200, 449 B | Home 403, 20,799 B bot wall; UK locale also 403 | No (wall, dollars, duties on delivery) |
| 4 | FragranceX | fragrancex.com | Large US discounter | custom | Not reached | Not read | 403, 5,609 B challenge | Stopped | No (blocked) |
| 5 | Jomashop | jomashop.com | Watches, with a fragrance department | custom (Magento) | USD only; international cost "calculated during checkout" (search snippet) | Customer pays duties and tax "in addition", paid on import; prepaid duty only for "select countries" (search snippet, help page refused our fetch) | 200, 720 B | Home 200, 84,749 B; `/products.json` 404 | No (dollars, duties on top) |
| 6 | Perfume.com | perfume.com | US discounter | custom | Not reached | Not read | 403, 5,606 B challenge | Stopped | No (blocked) |
| 7 | Perfumania | perfumania.com | US chain, discount designer | Shopify | USD; `?country=GB` stays USD. Its pages say it does not ship internationally (search snippet) | n/a | 200, 7,904 B | `/products.json` 200, USD | No (US only, dollars) |
| 8 | Nordstrom | nordstrom.com | Department store with a fragrance floor | custom | Prices "in your currency" through eShopWorld (ESW), a conversion; no sterling list read; UK shipping price "calculated at checkout" | "These charges are paid at checkout and the order total is guaranteed by ESW" (own International Orders page, read 2026-10-09); beauty and hazardous items may be restricted | 200, 2,685 B, `/api/` disallowed | Home 200, 256,053 B; `/products.json` 404 | No (converted, geo selected) |
| 9 | Neiman Marcus | neimanmarcus.com | Department store | custom | Not reached | Not read | 403, 776 B | Stopped | No (blocked) |
| 10 | Saks Fifth Avenue | saksfifthavenue.com | Department store | custom | Not reached | Not read | 403, 779 B | Stopped | No (blocked) |
| 11 | Bloomingdale's | bloomingdales.com | Department store | custom | Not reached | Not read | 403, 12,237 B | Stopped | No (blocked) |
| 12 | Macy's | macys.com | Department store | custom | Not reached | Not read | 403, 9,901 B | Stopped | No (blocked) |
| 13 | Sephora US | sephora.com | Beauty chain (Sephora UK is a separate UK site) | custom | Not reached | Not read | 403, 383 B | Stopped | No (blocked) |
| 14 | Luckyscent | luckyscent.com | Niche perfume, Los Angeles and New York | custom | USD; ships by US Post to "most countries"; international orders processed every 7 to 10 days (search snippet) | Customs page is a heading only on our read; not stated | 200, 4,998 B, 4 sitemaps | Home 200, 291,196 B; `/products.json` 404 | No (dollars) |
| 15 | Aedes | aedes.com | Niche perfume, New York | Shopify | USD; `?country=GB` stays USD (GB is not a market) | Not stated for the UK | 200, 5,518 B | `/products.json` 200, 22,966 B | No (dollars) |
| 16 | Twisted Lily | twistedlily.com | Niche perfume, Brooklyn | Shopify | USD; `?country=GB` stays USD. UPS $55, free over $500, 2 to 6 weeks (search snippet) | Policy says included at checkout, FAQ says paid on arrival; UK orders of £135 or less "currently restricted" (search snippet) | 200, 3,628 B | `/products.json` 200, 5,658 B | No (dollars, contradictory duties) |
| 17 | Scentbird | scentbird.com | Perfume subscription | custom | Not reached | Not read | 200, 3,068 B | Home 403, 5,557 B | No (wall, subscription) |
| 18 | Phlur | phlur.com | Fragrance house | Shopify | Not reached | Not read | 200, 3,604 B | Home 403, 5,527 B | No (wall) |
| 19 | D.S. & Durga | dsanddurga.com | Niche house, own shop | Shopify | `?country=GB` gives GBP at rate 0.766851785: a conversion | Not read | 200, 3,632 B | `/products.json` 200, USD base | US only: added to the US site in USD, 9 Oct 2026; not UK (converted) |
| 20 | Imaginary Authors | imaginaryauthors.com | Niche house, own shop | Shopify | GBP at 0.766851785; 115 USD shown as 89 | Not read | 200, 3,648 B | `/products.json` 200 | US only: added to the US site in USD, 9 Oct 2026; not UK (converted) |
| 21 | Beautyhabit | beautyhabit.com | Niche beauty, multi brand | Shopify | GBP at 0.766851785; 30 USD shown as 23.01 | Not read | 200, 3,638 B | `/products.json` 200 | US only: added to the US site in USD, 9 Oct 2026; not UK (converted) |
| 22 | Maison Louis Marie | maisonlouismarie.com | Niche house, own shop | Shopify | GBP at 0.766851785 | Not read | 200, 3,640 B | Home 200, USD at origin | US only: added to the US site in USD, 9 Oct 2026; not UK (converted) |
| 23 | Ellis Brooklyn | ellisbrooklyn.com | Fragrance house, own shop | Shopify | GBP at 0.766851785 | Not read | 200, 3,644 B | Home 200, USD at origin | US only: added to the US site in USD, 9 Oct 2026; not UK (converted) |
| 24 | Indigo Perfumery | indigoperfumery.com | Niche perfume, Chicago | Shopify | USD; `?country=GB` stays USD | Not stated | 200, 3,636 B | `/products.json` 200, 28,464 B | No (dollars) |
| 25 | Bluemercury | bluemercury.com | Beauty chain, Macy's group | Shopify | USD; `?country=GB` stays USD | Not stated | 200, 5,775 B | `/products.json` 200 | No (dollars) |
| 26 | Boy Smells | boysmells.com | Fragrance and candles | Shopify | USD; `?country=GB` stays USD | Not stated | 200, 3,618 B | Home 200 | No (dollars) |
| 27 | Sol de Janeiro | soldejaneiro.com | Body mists and fragrance | Shopify | USD; `?country=GB` stays USD; its UK shop is on another domain that did not answer | Not stated | 200, 3,626 B | `/products.json` 200, 9,365 B | No (dollars) |
| 28 | Victoria's Secret | victoriassecret.com | Fragrance and lingerie | custom | `/us/` is dollars. A UK shop exists at victoriassecret.co.uk (robots 200, 9,185 B): a UK domain, left to the UK pass | n/a | 200, 2,953 B | `/products.json` 404 | No (UK shop left to the UK pass) |
| 29 | Abercrombie & Fitch | abercrombie.com | Clothing with a fragrance range | custom | `/shop/uk` lands on the US shop in USD | Not read | 404 (its robots file is at an odd address) | Home 3,038 B challenge page | No (challenge) |
| 30 | Perfume Emporium | perfumeemporium.com | US discounter | custom | Not reached | Not read | 403, 5,618 B | Stopped | No (blocked) |

## India

Every Indian shop that answered quotes rupees. Where the storefront is Shopify, `?country=GB` was asked and
the currency stayed INR, so the United Kingdom is not a market of the shop's store. Two shops (marked)
had no address that answered. Affiliate was not checked for any.

| # | Shop | Domain | Sells | Platform | GBP price and UK delivery from the shop | Duties and VAT for a UK buyer | robots.txt | Live check (2026-10-09) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | Nykaa | nykaa.com | Largest Indian beauty retailer | custom | Rupees only (₹). Its own shipping policy (search snippet) named Nepal as the one foreign destination; the UK is served only by forwarders | Forwarder pages only | 200, 487 B | Home 200, 622,703 B; `/products.json` 503 | No (rupees) |
| 32 | Tira | tirabeauty.com | Reliance beauty retailer | custom | Not reached | Not read | 200, 2,034 B | Home 403, 372 B wall | No (wall) |
| 33 | Purplle | purplle.com | Indian beauty marketplace style store | custom | No sterling or UK mention in the home page | Not read | 200, 1,106 B | Home 200, 320,495 B | No (not a sterling shop) |
| 34 | Myntra | myntra.com | Fashion marketplace with fragrance | custom | Not reached | Not read | No answer in 25 s | Stopped | No (marketplace, no answer) |
| 35 | Ajio | ajio.com | Fashion marketplace with fragrance | custom | Not reached | Not read | 403, 380 B | Stopped | No (marketplace, blocked) |
| 36 | Tata CLiQ | tatacliq.com | Marketplace | custom | Not reached | Not read | 200, 1,034 B | Home 200, 13,988 B client rendered shell | No (marketplace) |
| 37 | Gulab Singh Johrimal | gulabsinghjohrimal.com (to .co.in) | Oldest Indian perfumer, attars | custom | Rupees (`"currency":"INR"`) | Not read | 404 on `.com` (no rules) | Home 200, 522,740 B at `.co.in`; `/products.json` 404 | No (rupees) |
| 38 | Kama Ayurveda | kamaayurveda.com | Ayurvedic beauty with a fragrance line | custom (Angular app, prices from `api.kamaayurveda.com`) | Currency not visible in the markup | Third party UK listings of it say duties are extra (search snippet) | 200, 2,568 B | Home 200, 15,354 B shell | No (client rendered, currency unknown) |
| 39 | Forest Essentials | forestessentials.com | Ayurvedic luxury beauty | custom | Not reached; UK sales are through a Covent Garden shop and resellers | Not read | Connection reset | Stopped | No (no answer) |
| 40 | Bombay Perfumery | bombayperfumery.com | Indian niche house, Mumbai | Shopify | INR; `?country=GB` stays INR | Not read | 200, 3,660 B | `/products.json` 200, 23,763 B | No (rupees) |
| 41 | Skinn by Titan | skinn.in | Titan's fragrance brand | custom | Not reached | Not read | 200, 200 B | Home 403, 4,544 B | No (wall) |
| 42 | BellaVita Organic | bellavitaorganic.com | Indian perfume and body care | Shopify | INR; `?country=GB` stays INR. Its UK arm, bellavitaluxury.uk, is already in the registry | Not read | 200, 36,432 B | `/products.json` 200, 20,037 B | No (rupees; UK arm already listed) |
| 43 | Kannauj Attar | kannaujattar.com | Attars and perfumes | WooCommerce | USD and INR on the page (153 mentions of USD), no GBP; "Quick International Shipping" widget | Not read | 200, 24 B | Home 200, 645,730 B | No (dollars and rupees) |
| 44 | Wild Stone | wildstone.in | Men's deodorants and perfume | Shopify | INR; `?country=GB` stays INR | Not read | 200, 3,632 B | Home 200, 591,252 B | No (rupees) |
| 45 | Naso Profumi | nasoprofumi.com | Indian niche house, Lucknow | Shopify | INR; `?country=GB` is recognised as a country but the price stays INR | Not read | 200, 3,644 B | Home 200, 916,016 B | No (rupees) |
| 46 | Pilgrim | discoverpilgrim.com | Skincare with fragrance | Shopify | INR | Not read | 200, 6,076 B | Home 200, 1,679,757 B | No (rupees) |
| 47 | The Man Company | themancompany.com | Men's grooming and fragrance | custom | INR (USD appears 6 times, no GBP) | Not read | 200, 7,359 B | Home 200, 1,968,663 B | No (rupees) |
| 48 | Ustraa | ustraa.com | Men's grooming and fragrance | custom | INR | Not read | 200, 1,603 B | Home 200, 651,981 B | No (rupees) |
| 49 | Mirah Belle | mirahbelle.com | Indian perfume house | custom | INR | Not read | 200, 4,323 B | Home 200, 716,143 B | No (rupees) |
| 50 | Rose Moore | rosemoore.com | Indian perfume house | custom (hosted store) | Default dollars; its multi currency list names GBP, a converted view | Not read | 200, 1,508 B | Home 200, 306,085 B | US only: added to the US site in USD, 9 Oct 2026; not UK (converted) |
| 51 | Ajmal | ajmal.com (from ajmalperfume.com) | Arabian house of Indian origin, Dubai based | custom | Gulf focused; no GBP in the 15 KB shell | Third party UK listings only | `/robots.txt` answered with the home page (15,064 B) | Home 200, 15,064 B | No (Gulf site, no sterling) |
| 52 | Kimirica | kimirica.com | Indian soaps and fragrance | custom | No currency found in the home page | Not read | 200, 170 B | Home 200, 90,324 B | No (currency not established) |
| 53 | Fogg | foggscent.com (guessed) | Mass market deodorants | unknown | Domain guessed; no answer | Not read | No answer | Stopped | No (no answer) |
| 54 | Mitti Attar | mittiattar.com (guessed) | Attars | unknown | Domain guessed; no answer | Not read | No answer | Stopped | No (no answer) |

### Left out on purpose

| Shop | Why |
| --- | --- |
| Amazon, Flipkart, eBay | Marketplaces (D29 and the supermarket rule). Search results for Indian attars on eBay quote sterling, but the seller sets it and the item is sent from India |
| Dossier (dossier.co) | Sells "inspired by" scents. A dupe is not the product this site compares (the 2026-10-08 rule for ScentUK and Lacura) |
| Victoria's Secret UK (victoriassecret.co.uk) | A US brand on a UK domain. Left to the UK pass |
| Rasasi, Al Haramain | Already in the registry as UK stores |

## Added: Glossier UK

Enabled after a dry run read real priced listings. It meets each condition the brief set:

| Condition | Evidence |
| --- | --- |
| robots.txt permits our bot | `uk.glossier.com/robots.txt`, 200, 3,628 B, Shopify's stock file; `/products/`, `/collections/` and `/products.json` are not disallowed. `helpuk.glossier.com/robots.txt` (257 B) allows the help centre |
| A permitted route reads real priced listings | `/products.json` (135 products, 391 variants). Reading only the shop's own "Fragrance" type gives 26 priced listings; 12 of them are bottles of eau de parfum that pass the catalogue's test (50 ml, 100 ml, 8 ml of You, Doux, Soie, Fleur, Rêve). Sets, candles, body mists and the solid perfume are dropped for lack of a stated bottle size |
| Price in GBP stated by the shop | `/meta.json`: city London, country GB, currency GBP. `Shopify.currency` GBP, rate 1.0; every product page read carries JSON-LD `priceCurrency` GBP. Not a conversion: Glossier You 50 ml is £70 here and $82 on glossier.com (82 x 0.7669 would be about £63) |
| UK delivery terms from the shop's own page, dated | helpuk.glossier.com/en-US, 2026-10-09: "Standard: (£4 or free for orders over £30, after promotions) 3-5 business days"; "UK Expedited: (£7) 1-2 business days"; the banner says "Free shipping on orders over £30" |
| Landed cost stated | Same page: "Will I be charged VAT & Duties? Yep! If your order is subject to duties, taxes, or related fees, you'll be charged at checkout (you won't need to pay anything extra when your package is delivered)." It is a UK shop on a sterling list with Royal Mail UK delivery, so import VAT and duty do not arise for a UK order; what the pages do not say is that the £ price includes VAT. The registry notes that in `shipping.notes` and the entry comment |

The strength: the titles name none ("Glossier You Doux 50 ml"), but all five scent pages say Eau de Parfum
and the SKUs begin `EDP-`, so the entry carries `fragranceTypeIsEauDeParfum` (as Beauty Pie does) and not
`fragranceOnlyCatalogue` (the shop sells skincare). `singleBrandOnly: 'Glossier'` makes the page say it is one
house's own shop. The photos were held off (D24 did not cover it) until the owner said yes on 9 Oct 2026 and the affiliate stays unapplied.

Directories disagree on its programme (Impact, FlexOffers, Shopify Collabs, Skimlinks); none was found on a
network's own page.

Proof so far is the sandbox dry run (`npm run harvest -- --shop=glossier-uk --dry-run`, as PriceSniffsBot,
robots.txt first: 26 priced listings, all GBP, 12 bottles pass the catalogue's test). **No runner proof yet.**
A full crawl (run 851) was in progress when this was pushed, and a one shop dispatch holds the crawl's
concurrency group, so none was made; the next scheduled sweep reads the shop with the same code. Look for
"Glossier UK" in `data/harvest-report.json` after it, and set `enabled: false` if it reads nothing.

## Findings that apply to the next pass

- A Shopify shop that answers `?country=GB` with `"rate":"0.766851785"` is converting dollars, whatever the
  badge says. Check `rate` before trusting a pound sign. It cost five of the US candidates.
- An Indian Shopify shop that answers `?country=GB` with INR does not sell in the UK market at all.
- The shops that really quote pounds are the ones with their own UK store (a `uk.` subdomain with
  `/meta.json` country GB), as Glossier, Kayali and Zimaya do. A search for "brand + UK store" is a better
  route than the brand's global site.
- Wall rate: 12 of 30 US shops and 3 of 24 Indian shops refused the bot at robots.txt or the home page
  (two more Indian shops did not answer at all). The big US department stores all do.

## Owner steps

1. **Glossier UK, one basket check.** Put a bottle in the basket on uk.glossier.com for a UK address and read
   the total. If the checkout adds VAT or duty to the £70, set `enabled: false` in the entry (a one line change).
   The help centre says nothing is due on delivery, so none is expected.
2. **Photos.** Say whether D24 covers Glossier UK; if so, one `imageBasis` line.
3. **Shopify Markets conversions.** Five US shops (D.S. & Durga, Imaginary Authors, Beautyhabit, Maison Louis
   Marie, Ellis Brooklyn) show a live converted pound figure and ship from the US. They are recorded as no, in
   line with D29. The owner accepted a live conversion for Nicchia Luxury on 2026-10-03, so if the same
   standard is wanted here, say so; the five are on the US site in USD (9 Oct 2026) and would reach the UK site only after a basket check shows pounds charged; the open question is landed cost, because a
   US dispatch to the UK attracts import charges that the site's delivered price would not show.
4. **A landed cost note in the offer row.** The registry has `shipping.notes`, but no offer row displays it.
   If the owner wants US shops that charge duty on top, the site needs a field and a visible line first.
5. **Le Labo.** Needs a UK address that serves its GBP list, or the owner's word on a basket check.
6. **Affiliate.** Glossier UK: check glossier.com/pages/affiliates and the network dashboards; nothing applied.

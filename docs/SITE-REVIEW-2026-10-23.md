# Site review, 23 Oct 2026

The owner's whole site formatting review (23 Oct 2026), page by page, on all
four sites (UK `/`, US `/us/`, India `/in/`, Canada `/ca/`). Every page was
looked at in screenshots at 390 and 1280 wide, light and dark, before and
after each change (`launchChromium`, `scripts/a11y-audit.ts`
`startPagesServer`). The UK is the reference: the other three sites are drawn
by the same code and styles, and `tests/homeSections.test.ts` holds the four
home pages to one structure.

## Running list

| Page | Issue | Fix | Commit |
| --- | --- | --- | --- |
| Home, all four | Most Stocked centred in a 1068px column, the guides button at the page's left edge, the update history in a 640px column of its own | One `.home-block` column for every section under the banner, so all start on one left edge | step 1 |
| Home, US, India, Canada | No Most Popular row (their shops publish no review counts), so the four homes had different sections | The row on every site: by shop reviews where shops publish them (UK), else the next houses by how many shops stock them, labelled "By how many shops stock it" (`nextMostStockedRail`, demo/mostPopular.ts) | step 1 |
| Home, US, India, Canada | A "Prices checked daily. Last checked ..." line under the hero that the UK does not have | Removed, as on the UK home (the banner says it) | step 1 |
| Tiles, everywhere | Rank discs 1, 2, 3 on the photo's corner, with ribbon tails | A plain disc in the tile's top left corner, level with the brand pill, which keeps clear of it | step 1 |
| Tiles, everywhere | Shop names cut short: "from Maximum Fra...", "at Discount Fragran..." | The whole name, on two lines where needed | step 1 |
| Tiles, US and Canada | "Shipping Not Stated" in bold small caps type, prices in a row at different heights | Regular weight, muted; every price in a row keeps the note's room, so prices line up | step 1 |
| Product page | Price history dates printed over each other at 390 ("18 Oc23 Oct") | A date label too close to the last one is dropped | step 1 |
| Product page | "Not Available" list: a line could start with a comma | Each name keeps its comma | step 1 |
| Product page | "Available at (4 Shops)" | "Available at 4 Shops" | step 1 |
| Note page | "Often found with" tiles: a lone last tile centred under the row | Small tiles start at the left edge | step 1 |
| Note, shop and brand lists | Counts without separators ("4431 Fragrances", "Top · 4365"), "2618 Fragrances Here" | "4,431 Fragrances", "Top · 4,365" | step 1 |
| Brands | A break per digit ("1", "2", "3", "4"), one brand under each | One "0 to 9" break | step 1 |
| Sign in | Sign In and Sign Up tabs squeezed ("Sign Up" on two lines), the button left aligned under centred links | Tabs as wide as the form, button full width | step 1 |
| Settings | "Use System Setting" wrapped on two lines at 390 | "System" | step 1 |
| Footer, every page | Two left aligned rows of eight links, a long commission line | One centred row: About, How it works, Contact, Legal; "Some links earn us a commission. It never changes the order." | step 1 |
| About | Link row mixed underlined links and plain buttons | One style; Design System moved here from the footer | step 1 |
| Home | "Read our Guides and Methods" in a rounded bordered box with an arrow | A quiet text link, "Guides and how we check prices", underlined on hover | step 2 |
| Product, brand and shop pages | Official Site, Fragrantica, Open Brand Website and Reviews on Trustpilot as bordered pills | Plain links with their external icon; "Brand Website" | step 2 |
| Product page | RRP and Cheapest Price in red and green bordered boxes | The same two tinted panels without the border | step 2 |
| About | The opening text, six numbers and four cards each in a bordered box | Text and numbers on the page, numbers split by hairlines, cards as plain columns | step 2 |
| Legal Notice | Contents as six bordered pills | A row of text links | step 2 |
| Guides | Every guide a bordered card that lifted on hover | A list: title link and line, hairline between | step 2 |
| Guides, oils sort | "Prices Per Ml", "Lowest to Highest Per Ml" | "per ml" | step 2 |
| Home | Update history a long column (up to twelve points a day, under group headings) that scrolled inside a box | A row of days that scrolls sideways and snaps a day at a time, about four across on a desktop and one and a half on a phone; each day shows at most five points, its `highlights` or its first points (demo/changelog.ts `homeHighlights`, held by tests/changelog.test.ts) | step 3 |
| Home, lists | Tapping See All or a tile froze the page with no feedback: 1.55 s and 4.9 s of input delay on a phone at 4x CPU slowdown | The press paints first, the next page is drawn in the next task (`afterPaint`) | step 4 |
| Search box | Each key waited for a whole results render: 2.3 s input delay | The letter paints at once; results follow once typing pauses for 120 ms, one render per run of keys | step 4 |
| Every photo | Photos popped in as they arrived | They fade in (220 ms, the site's easing) inside a well that already holds their square; off under reduced motion | step 4 |
| Links on a phone | The browser's grey tap flash, no press state on plain links | Tap flash off; every plain link dims for the press | step 4 |

## Smoothness, measured

A Pixel 5 profile in the pinned Chromium, CPU slowed 4x through CDP, served
as GitHub Pages serves the site (`startPagesServer`), median of three runs.
First tiles: when the first tile or offer row is in the page. CLS: layout
shift over the load and three seconds after. Input delay: the longest
interaction (Event Timing) for the action named.

| Page and action | First tiles before | after | CLS before | after | Input delay before | after |
| --- | --- | --- | --- | --- | --- | --- |
| Home, tap See All | 336 ms | 316 ms | 0.000 | 0.000 | 1,552 ms | 48 ms |
| Home, tap the first tile | 339 ms | 333 ms | 0.000 | 0.000 | 4,896 ms | 48 ms |
| Search, type "dior sau" | 8,136 ms | 8,423 ms | 0.000 | 0.000 | 2,272 ms | 1,168 ms |
| Product, tap This Year | 14,217 ms | 13,888 ms | 0.000 | 0.000 | 80 ms | 88 ms |

The search page's first tiles and the product page's wait on the whole
catalogue file (17 MB) at a 4x slowed CPU on this machine; neither moved
beyond run to run noise. Search typing still costs one results render
(about 1 s at 4x) when a pause in typing lets it run; making that render
itself incremental is the next step.
| US, India, Canada | "Beta" pill and line under the header, "(Beta)" in the country menu, "in beta" in the home page description, the About static text and the legal pages, "Not many deals yet in the beta." | All gone: the `beta` flag is out of `src/config/regions.ts`, the menu names each country plainly; a region with few deals says "Only a few deals so far." | step 5 |
| Notes, all four | The regions' Notes pages carried no hreflang alternates while in beta | The four Notes pages and their group pages name each other (43 fixed pages with alternates per sitemap, was 26) | step 5 |
| About, US, India, Canada | "It compares UK shops", "Established UK shops ... in pounds", and an affiliate card that is untrue there | The four cards in the country's terms: its shops and currency, shipping, its tax note, and "No US shop pays us anything today" | step 5 |
| Footer, US, India, Canada | "Some links earn us a commission" where no shop pays anything | "No shop pays for its place in the results." | step 5 |
| Legal, US and India | "The US pages show no shop's product photographs for now" (they do, from the shop or the matching UK product) | Says where a picture comes from, as Canada's does; "Last updated 23 October 2026" | step 5 |

## Copy changes

| Where | Before | After |
| --- | --- | --- |
| Footer | About, How We Check Prices, Guides, How the Bot Works, Contact, Legal Notice, Privacy, Design System | About, How it works, Contact, Legal |
| Footer | Some shop links earn us a commission, at no cost to you. It never changes the order of results. | Some links earn us a commission. It never changes the order. |
| Deals | Savings are against the shop's own published RRP, or the maker's own price where the maker sells it here. Prices include delivery where the shop states it. One deal per perfume, at its best size. | Savings against the shop's RRP, or the maker's own price. Delivery included where stated. One deal per perfume. |
| Most Stocked list | Ranked by how many of our N shops stock each one, then by brand and name. A brand's own store does not count. One line per perfume ... not how well it sells. | By how many of our N shops stock it (brand stores not counted), then A to Z. One line per perfume. Sets and oils are under Explore. |
| Most Popular note | By reviews at the shops we compare | By shop reviews |
| 404 | There is nothing at /x. It may be a fragrance or a shop we no longer list. Try one of these. | Nothing at /x. It may be a fragrance or shop we no longer list. |
| Guides | Where do our prices come from? Read how we check prices. | Read how we check prices. For shops: how our bot works. |
| Sign in | Forgot Your Password | Forgot Password |

## Missing information

Counted on 23 Oct 2026 from the built site (UK: `demo/data.ts`, the
registry in `src/config/retailers.ts`; US, India, Canada:
`data/regions/<r>/catalogue.json` and `src/config/regionShops.ts`), ranked by
how visible the gap is. For a research agent to fill next; where it comes
from is the file or pipeline that would carry the fix.

| Rank | What is missing | Count | Where a visitor sees it | Where it comes from |
| --- | --- | --- | --- | --- |
| 1 | US, India and Canada shops with no standard delivery cost on record, so their tiles say "Shipping Not Stated" and they are never ranked cheapest | US 16 of 21 shops with listings, India 7 of 10, Canada 10 of 10 | Every tile and offer row of those shops; the Canada home's Most Stocked row shows the note on four of six tiles | `delivery` in `src/config/retailers.us.ts`, `retailers.in.ts`, `retailers.ca.ts` (the beta agent's files) |
| 2 | Region shops with no delivery window | US 18 of 21, India 10 of 10, Canada 6 of 10 | Shop pages ("Arrives in about ...") | same files, `delivery.estimatedDays` |
| 3 | Region shops with no logo (initials shown) | US 16 of 21 (Perfumania, Luckyscent, Twisted Lily, Indigo Perfumery, Bluemercury, Maison Louis Marie, Sol de Janeiro, Beauty Encounter, Fragrance Outlet, Fragrance Market, MicroPerfumes, Parfums Raffy, La Belle Perfumes, Ulta Beauty, The Perfume Spot, Dillard's); India 5 of 10 (Nykaa, FridayCharm, AAR Fragrances, Naso Profumi, The Man Company); Canada 4 of 10 (PerfumeOnline.ca, Fragrance Online Co., Niche Essence, Perfume Plus) | Shops list, shop pages, offer rows | `logo` / `squareLogo` in the region registries; `scripts/logo-probe.ts` |
| 4 | Region products with no photo at all | US 83 (0.4%), India 628 (4.1%, all AAR Fragrances), Canada 1,144 (4.3%, mostly Maximum Fragrance) | Tiles and product pages show the empty well | docs/BETA-SCORECARD-2026-10-23.md section on photos; the shop readers' `imageUrl` |
| 5 | No review counts from any US, Indian or Canadian shop | all three countries | The Most Popular row ranks by how many shops stock a bottle there, not by reviews (labelled) | the region readers keep `rating: null` (`scripts/regionSite.ts`); a shop's JSON-LD `aggregateRating` would give it |
| 6 | UK products with no notes | 19,860 of 34,270 listed (58%); none of the top 100 | Product pages have no notes block; note pages and filters miss them | the shops' own descriptions (`src/catalogue`), Fragrantica pages once linked |
| 7 | UK products with no Fragrantica page of their own (the link opens a search) | 33,151 of 34,270 (only 1,119 have a checked page) | "Search Fragrantica" on product pages | `data/fragrance-links.json` (`npm run links:resolve`) |
| 8 | UK products with no link to the brand's own page | 9,983 of 34,270 (24,287 have one) | No "Official Site" link | `demo/brandSites.ts`, `data/fragrance-links.json` |
| 9 | UK products with no photo | 983 of 34,270 (2.9%); none of the top 100 | Empty well on tiles and product pages; some shops send a "No image available" picture of their own (Niche Beauty UK), which shows as if it were a photo | `npm run photos:coverage`, `scripts/better-photos.ts` |
| 10 | UK shops with no standard delivery cost | 5 of 62 (Niche Beauty UK, Space NK, Opulensi, The Perfume Closet, Sainte Cellier) | "Delivery Not Stated" on their prices | `shipping` in `src/config/retailers.ts`; `npm run shipping:discover` |
| 11 | UK shops with no logo | 8 of 62 (Beauty Pie, PerfumeUK, Liberty London, Rasasi UK Store, Glossier UK, Beauté Boulevard, Roullier White, Scented) | Shops list and shop pages show initials | `logo` in `src/config/retailers.ts`; `scripts/logo-probe.ts` |
| 12 | UK brands with no logo | 1,038 of 1,252 brands (214 have one) | Brands list and brand pages show initials | `demo/brandLogos.ts` |
| 13 | Legal Notice: no postal address, no ICO registration decision | 2 facts | Legal Notice, "Who Runs This Site" | owner (docs/OWNER-STEPS.md) |
| 14 | Two shop counts that disagree: the Legal Notice says prices come from "63 shops", About says "62 shops with current prices" | 1 | Legal Notice and About | the Legal Notice counts enabled shops, About counts shops with a current listing; one wording should say which |

## Not done here, and why

- Region product, brand and shop pages are still not prerendered, so the
  region sitemaps list their 43 fixed pages only. The UK's 36,307 pages use
  481 MB of the 700 MB deploy budget; the regions' 64,000 products at the
  UK's 12 kB a page would not fit. Their 2,600 brand and 41 shop pages
  (about 40 MB) would, and are the next step for Search Console
  (`scripts/build-leaf-pages.ts` renders UK pages only today).
- The guides are written for UK buyers and are shown unchanged on the region
  sites.
- The welcome pop up is left as it is (owner decision pending, AdSense).

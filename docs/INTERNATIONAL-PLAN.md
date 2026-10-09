# PriceSniffs for the USA and India: plan

Written 2026-10-09. **Plan only: nothing here is built.** Owner request: native US and Indian
versions of PriceSniffs (prices in USD and INR from shops that sell in those countries on their
own local delivery terms), a country menu at the top of the home screen that switches between
UK, US and India, and possibly a different domain or address per country.

Read for this plan: `docs/RETAILER-CANDIDATES-USA-INDIA-2026-10-09.md` (54 shops checked
today), `src/config/retailers.ts` and `src/types/retailer.ts`, `docs/DECISIONS.md` (D23, D24,
D29), `docs/DEPLOYMENT.md`, `docs/ROUTING-PLAN.md`, `docs/PRODUCT-URLS.md`,
`docs/TRACKING-AND-STORAGE-STRATEGY.md`, `docs/ADVERTISING-PLAN.md`, `docs/AFFILIATE_SETUP.md`,
`docs/LEGAL.md`, `docs/SUPABASE-SETUP.md`, the workflows, and the crawl runs of 1 to 9 October
read from the GitHub API.

## Decisions in one table

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | One codebase or separate sites | **One codebase, one repository, a region config.** Separate deployments only later, and only of the built output |
| 2 | Addresses | **Subfolders now**: UK stays at the root exactly as it is (`/creed_aventus_100ml`), the US at `/us/...`, India at `/in/...`. No `/uk/` prefix, so no UK address moves |
| 3 | Domains | Later, per region, once the region earns it: Cloudflare (free) in front of the domains, mapping `pricesniffs.in/x` to `/in/x`, with 301s from the subfolder |
| 4 | First country | **USA**, as a hidden beta with 5 to 10 shops, then public "Beta" |
| 5 | Location | Suggest, never redirect. A one line bar from the browser's time zone, no request and no storage until the visitor chooses |
| 6 | Product identity | Shared: the same barcode id (`ean-...`) in every region. Offers, prices, history, deals, slugs and aliases are per region |
| 7 | Price honesty | US: price before sales tax, labelled; India: price includes GST, MRP shown as the reference |

## 0. What exists today

- **The menu is already live, UK only.** `src/services/regions.ts` (`REGIONS`: GB available; US,
  DE, IN, FR, IT greyed out "Coming Soon"), drawn by `fillRegionMenu` in `demo/app.ts`, flags in
  `demo/flags.ts`, tests `tests/regions.test.ts` and `tests/regionSelectorBrowser.test.ts`.
  Choosing does nothing: no storage, no cookie, no price change. Changelog v3.88.0 (5 Oct).
- **The `country-selector` branch has nothing extra.** Its two commits (1a0df932, eda0e9e7)
  predate the history rewrite of 6 October, so git finds no merge base, but every file it
  touched is byte for byte the same on the live branch (checked: `regions.ts`, `flags.ts` and
  both tests). It can be deleted.
- **No other region code exists.** Everything assumes pounds: `currency: 'GBP'` is a literal
  type on `Retailer`; delivery is `standardGbp`, `freeOverGbp`, `minimumOrderGbp`; listings carry
  `priceGbp` and `wasPriceGbp`; wishlists `target_price_gbp`; alerts `last_price_gbp`. Measured
  today outside generated files: `£` on 802 lines in 72 files, `Gbp` on 974 lines in 79 files,
  `GBP` on 443 lines in 38 files, `en-GB` on 82 lines in 28 files. This is the main cost of
  Phase 0.
- **Things that already help:** `cleanBarcode` (`src/catalogue/barcode.ts`) turns a 12 digit UPC
  into its EAN-13 form, so a US barcode and a UK barcode for the same bottle give the same id.
  `src/catalogue/ounceSizes.ts` maps US ounce sizes to the nominal bottle (3.4 oz is 100 ml).
  The visit counter (`0007_site_stats.sql`) already records each visit's country from
  Cloudflare's `CF-IPCountry` header at Supabase, so US and Indian traffic can be counted today.
- Small thing found: `OZ_TO_ML` in `src/catalogue/fragranceId.ts` is 29.5735, the US fluid
  ounce, but its comment says "the imperial fluid ounce". The value is right for US shops; the
  comment should be corrected in Phase 0.

## 1. Architecture

### One codebase with a region config

Separate deployments of separate code would double every fix (matching, naming, slugs, the
crawl guards in `docs/PIPELINE-FAILURE-MODES.md`) and drift within weeks. The differences
between countries are data, not logic, so they go in one config:

```ts
// src/config/regions.ts (replaces the static list in src/services/regions.ts)
interface RegionConfig {
  id: 'GB' | 'US' | 'IN';
  pathPrefix: '' | 'us' | 'in';        // UK at the root, unchanged
  label: 'UK' | 'US' | 'India';
  currency: 'GBP' | 'USD' | 'INR';
  locale: 'en-GB' | 'en-US' | 'en-IN'; // Intl formatting: $1,299.00, ₹1,23,450
  hreflang: 'en-GB' | 'en-US' | 'en-IN';
  sizes: 'ml' | 'floz-and-ml';         // US shows "3.4 fl oz (100 ml)"
  taxModel: 'vat-included' | 'sales-tax-at-checkout' | 'gst-included-mrp';
  words: { delivery: 'delivery' | 'shipping'; postcode: 'postcode' | 'ZIP code' | 'PIN code' };
  referencePriceName: 'RRP' | 'MSRP' | 'MRP';
  legal: LegalVariant;                 // disclosure, privacy and terms text per region
  ads: { slots: AdSlots; personalised: boolean };
  status: 'live' | 'beta-hidden' | 'beta' | 'off';
}
```

- **Retailer**: a new `region` field (default `'GB'`, so no UK entry changes), and `currency`
  widened from `'GBP'` to the region's currency. The registry test asserts `currency` equals the
  region's currency; the existing currency guard (`CURRENCY_UNCONFIRMED`,
  `currencyQuarantine.ts`, `requireGbp`) becomes "require the region's currency". A US shop that
  answers in pounds, or an Indian shop that answers in dollars, is refused the same way.
- **Money**: one formatter (`formatMoney(amount, region)`) on `Intl.NumberFormat`, replacing the
  `£` literals. Delivery fields get neutral names (`standard`, `freeOver`, `minimumOrder`) in the
  region's currency, by a mechanical rename.
- **Stored snapshots keep their field names.** The price history replays every version of
  `data/catalogue/*.json` in git history, so renaming `priceGbp` in UK snapshots would break the
  replay of old commits. UK snapshots stay as they are; US and Indian snapshots write `price`
  and `wasPrice` with a `currency` on the file; one accessor reads both.

### What is shared and what is per region

| Thing | Shared | Per region | Why |
| --- | --- | --- | --- |
| Product identity (`ean-<13 digits>`, gift set ids, matching, naming, strength rules) | Yes | | A bottle is the same bottle everywhere; UPC already normalised |
| Brand names, brand logos, note icons, notes (`fragranceLinks`), set contents | Yes | | Facts about the product, not the shop |
| Shops, offers, prices, delivery, stock | | Yes | A shop sells in one country |
| Catalogue (`demo/catalogue.generated.ts`) | | Yes: `demo/catalogue.us.generated.ts`, `demo/catalogue.in.generated.ts` | Only products with an offer in that region. The `.us.` naming keeps every file under the `demo/*.generated.ts` rules in CLAUDE.md |
| Price history and its checkpoint | | Yes: `demo/priceHistory.us.generated.ts`, `data/price-history-checkpoint.us.json` | Replay reads only that region's snapshot folder, so the UK replay is untouched |
| Deals (`deals.generated.ts`) | | Yes | Deals rest on that region's prices and reference price |
| Product addresses (`data/product-slugs.json`) | | Yes: `data/product-slugs.us.json` | See below |
| Merged ids (`data/id-aliases.json`) | | Yes: `data/id-aliases.us.json` | Each region's build writes only its own memory |
| Photos (D24) | | Yes | D24 is per shop: a photo is shown beside a link to the shop that published it. A UK shop's photo on a US page, with no link to that shop, is outside D24. Each US shop needs its own `imageBasis` decision (owner) |

**Addresses per region.** A product sold in both countries reuses its UK slug in the US
(`/creed_aventus_100ml` and `/us/creed_aventus_100ml`): the US build reads the UK file read
only. A product new to the US is given a slug by the same rules in the US file, avoiding every
slug in both files. Each region's build writes only its own file, so the crawls never write the
same path (which is what lets them run in separate concurrency groups, section 3). The two
files are append only, exactly as `docs/PRODUCT-URLS.md` section 3 says for the UK file. The
country menu links by product id, never by slug text, so even a rare slug that differs between
regions still links correctly. **Nothing in `data/product-slugs.json` or `data/id-aliases.json`
changes, and no UK address moves.**

**Deals, notes, sets and oils.** Notes, the note pages and set contents are shared facts; each
region's note page lists only products with an offer there. Sets: US shops say "gift set" and
"value set" like UK shops; Indian shops say "combo" and "pack of 3", which `giftSet.ts` needs
taught before India. Oils and attars are a large Indian category (the `Attar` and `Perfume Oil`
strengths already exist), so the Oils tab matters more in India. Deals and the reference price
comparison (`msrpComparison.ts`) use the region's own reference: MSRP in the US, MRP in India
(printed on every pack by law, so it is a strong reference).

**Matching.** US titles use ounces ("3.4 oz EDP Spray for Men"); the ounce table already exists
but is applied only where a shop states the size in ml or the barcode agrees, which is the right
rule and will leave some US only listings unsized. Indian titles mostly state ml. Expect a
naming pass per region after the first dry run, as the UK had.

## 2. Addresses and domains

| | Subfolders `pricesniffs.space/us/` | Subdomains `us.pricesniffs.space` | Country domains `pricesniffs.in`, `.com` |
| --- | --- | --- | --- |
| GitHub Pages | One site, works today | One custom domain per Pages site, so a second repository (built output pushed to it) or a CDN in front | Same as subdomains |
| DNS and HTTPS | Nothing new | A CNAME per subdomain; Pages issues each certificate | Register each domain; `.in` is open to anyone; **`.us` requires a US nexus** (a US citizen, resident or organisation), so a UK sole trader cannot hold it; `.com` availability unknown |
| Search engines | Shares the domain's standing; hreflang ties the versions | Treated as separate sites, start from zero | Strongest local signal (`.in`), start from zero |
| AdSense | Covered by the `pricesniffs.space` approval (under review now) | Each must be added as a site | Each must be added and reviewed; own `ads.txt` |
| Supabase sign in | Same origin: one session, no change to redirect URLs | Separate session per origin, extra redirect URLs | Same as subdomains |
| Visitor storage | One `localStorage` | Separate per origin | Separate per origin |
| Effort | Lowest | Medium | Highest |

**Recommendation: subfolders now.** The path after the prefix is the same in every region, so
moving a region to its own domain later is a prefix swap with 301s, not a redesign.

**Path to domains later** (Phase 3, only when a region's traffic justifies it):

1. Owner registers the domain (`pricesniffs.in`; for the US, `pricesniffs.com` if free,
   otherwise stay on `/us/`).
2. Move `pricesniffs.space` DNS to Cloudflare (free), proxied in front of Pages. A small
   Worker maps `pricesniffs.in/<path>` to the origin's `/in/<path>` and answers
   `pricesniffs.space/in/<path>` with a 301 to the new domain. Pages keeps one site and one
   build. The Worker can also read the visitor's country for the suggestion bar.
3. Alternative without Cloudflare: a second repository per domain whose Pages site receives the
   region's built folder from the main deploy (a deploy key with write access to that repository
   only). More moving parts, no 301 from the old subfolder (Pages cannot redirect), so the CDN
   route is better.

### How the build and routing change

- `npm run demo` builds every region whose status is not `off` into one artifact: `demo/`
  (UK, as now), `demo/us/`, `demo/in/`, each with its own `data/` files. `build-route-pages.ts`
  writes `demo/us/index.html` and the fixed addresses under it, so `/us/`, `/us/deals` and the
  like answer 200. Product addresses under `/us/` get the same 404 status with the app as UK
  product addresses do today (`docs/PRODUCT-URLS.md` section 7), which hurts a new region more
  than an old one; see "Search" below.
- `matchRoute` in `demo/router.ts` strips an optional first segment `us` or `in`, then matches as
  now. `us`, `in` and `uk` join `RESERVED_WORDS` in `src/catalogue/productSlug.ts` (they have
  no underscore, so no slug can equal them anyway). `/uk/<anything>` redirects to `/<anything>`.
- The service worker and `/account` callbacks need nothing: one origin.
- Each region's generated and deploy paths are added to `scripts/generated-files.txt` and
  `.gitignore` in the same commit (CLAUDE.md rule 4); `scripts/deploy-decision.mjs` counts the
  region folders as page changing.

### Canonical, hreflang and sitemaps

- Each page's canonical is itself in its own region (`/us/creed_aventus_100ml` is canonical for
  the US page). Never canonicalise one region to another: the prices differ.
- hreflang alternates only where the product exists in the other region: `en-GB` (root),
  `en-US` (`/us/`), `en-IN` (`/in/`), and `x-default` pointing at the UK page. Put them in the
  sitemap (`xhtml:link`), which crawlers read whatever the page's status, and in the head
  (`demo/head.ts`).
- `sitemap.xml` becomes a sitemap index naming `sitemap-gb.xml`, `sitemap-us.xml`,
  `sitemap-in.xml` (each under the 50,000 address limit; the UK has 27,646). `robots.txt` names
  the index.
- A region in `beta-hidden` gets `noindex` and stays out of the sitemap.

### The menu: switching and remembering

- **On a product page:** if the product has an offer in the chosen region, go to that region's
  address for it; else the same section there (a brand page if the brand is sold there, the
  Deals tab, and so on); else the region's home. The lookup is a small id to slug map per other
  region, shipped in the lazy file like `SLUG_ALIASES`, so the first load does not grow.
- Switching is a full page load (each region has its own data files).
- **Remembering:** the choice is stored in `localStorage` (`pricesniffs.region`) only when the
  visitor picks a region, consistent with the site's no cookie stance; the cookies page lists the
  key. A visitor who chose the US and later opens the UK home is taken to `/us/`; a deep link (a
  shared product address) is never redirected, it shows a slim bar "You are seeing UK prices.
  See US prices" instead. Crawlers have no stored choice, so they always see the page they asked
  for.
- **Suggesting by location:** GitHub Pages has no geo header. Options, cheapest first:
  1. **The browser's time zone** (`Intl.DateTimeFormat().resolvedOptions().timeZone`:
     `America/...` suggests the US, `Asia/Kolkata` suggests India). No request, no storage,
     right for most visitors. **Recommended now.**
  2. The visit counter already sends a request to Supabase on page load, and Supabase's
     Cloudflare edge adds `CF-IPCountry`; `count_page_view` could return the country it read.
     No IP is seen or kept, but the privacy notice must say the answer is used for the
     suggestion.
  3. Cloudflare in front of the site (Phase 3) gives the country for free in a Worker.

  Suggest only, never redirect automatically: an automatic redirect hides the UK pages from a
  US crawler and annoys a UK visitor abroad.

### Welcome: "Select your country" (owner request, 9 Oct 2026)

The owner wants addresses like `pricesniffs.space/in` and `/us`, and a visitor who opens the
bare `pricesniffs.space` greeted by a pop-up that asks them to pick a country, with a line of
link text underneath: "or log in, we'll remember your preference".

- **When it shows:** only on the bare home page (`/`), only when no country has been chosen
  (nothing in `localStorage` and, for a signed in visitor, nothing on the profile), and only
  once a second country is live. Until then there is one choice, so it stays off (built in
  Phase 0, switched on with the US beta). Never on a deep link (a product, brand, notes or
  guides page): those keep the slim "You are seeing UK prices. See US prices" bar above.
- **What it holds:** the title "Select your country", one large button per live country
  (United Kingdom, United States, India, each with its flag and currency: £, $, ₹), the time
  zone suggestion marked "Suggested" (section above), and underneath the link text "or log
  in, we'll remember your preference", which opens the existing sign in.
- **What the choice does:** United Kingdom stays on `/` (no UK address moves); United States
  goes to `/us/`; India to `/in/`. The choice is saved in `localStorage` (`pricesniffs.region`)
  and, for a signed in visitor, on the profile (a `region` column on `profiles`, one small
  Supabase migration), so it follows them to another device. A saved choice skips the pop-up
  next time; the country menu at the top changes it at any time.
- **Closing it** (Escape, the close button or a tap outside) means "stay on the UK site" for
  this visit only and saves nothing, so it asks again next visit until a choice is made.
- **Search engines and the AdSense review:** a full screen pop-up on arrival can count as an
  intrusive interstitial. So it is a small centred dialog that leaves the page readable behind
  it, the home page's content is in the HTML underneath, and crawlers (no stored choice, no
  JavaScript run in most cases) see the UK home as now. While the AdSense review is open, keep
  it off (it is off anyway until the US beta).
- **Accessibility:** a real dialog (`<dialog>`), focus moves into it and back, Escape closes
  it, the buttons are links (`<a href="/us/">`) so they work without the script, light and
  dark, 320 to 1280 wide.

### Search

The UK product addresses already answer 404 with the app (one HTML file for the whole site). A
new region starting from zero feels that more. An optional track, not needed for the beta: split
the inlined script out of `index.html` into one hashed file, then write a small HTML shell per
product address (a few KB each, the app loaded from the shared file), so every product address
answers 200. About 27,000 UK shells at 5 KB is about 135 MB, inside Pages' 1 GB site limit.

## 3. Data pipeline

### Crawl time and Actions minutes, measured

Full UK sweeps on 6 to 8 October (18 runs of `catalogue-daily.yml`): **63 to 92 minutes, median
about 77**, about six a day, so about **460 runner minutes a day**, plus 48 half hourly ticks
that skip in under a minute. The repository is public, so standard runner minutes cost nothing;
the limits that matter are the 20 concurrent jobs of the free plan and GitHub's unreliable cron
(the reason the outside scheduler dispatches a tick every half hour, `docs/OWNER-STEPS.md`).

Estimates per region (not measured):

| Region stage | Shops | Listings (estimate) | Minutes per sweep | Sweeps a day | Runner minutes a day |
| --- | --- | --- | --- | --- | --- |
| UK today (measured) | 56 enabled | 84,644 stored | 63 to 92 | about 6 | about 460 |
| US beta | 5 to 10, mostly Shopify `products.json` | 15,000 to 25,000 | 10 to 25 | 4 | 40 to 100 |
| India beta | 5 to 8 | 10,000 to 15,000 | 10 to 25 | 4 | 40 to 100 |
| A region at UK scale | 50 | 80,000 | 60 to 90 | 6 | about 450 |

### Repository size

From `docs/TRACKING-AND-STORAGE-STRATEGY.md`: the UK crawl and data add **5.0 MB a day** since
6 October for 84,644 listings, about 60 bytes per listing per day; the repository projects to
about 2.6 to 3.9 GB after a year depending on the owner's choices.

| Region stage | MB a day | GB a year |
| --- | --- | --- |
| US beta (20,000 listings) | about 1.2 | about 0.45 |
| India beta (12,000 listings) | about 0.7 | about 0.26 |
| One region at UK scale | about 5 | about 1.8 |

Two betas fit in the repository. A second region at UK scale would push the repository past
GitHub's 5 GB guidance within the year. **Tripwire:** when a region's data passes 2 MB a day, or
the repository passes 2 GB, move that region's snapshots and price history to its own data
repository (the crawl commits there, the deploy checks it out). The layout below makes that a
move of one folder.

### Layout, schedules and concurrency

- Snapshots: `data/regions/us/catalogue/*.json`, `data/regions/in/catalogue/*.json`. **Not under
  `data/catalogue/`**, because the UK replay reads every version of that folder.
- One workflow per region (`catalogue-us.yml`, `catalogue-in.yml`), each in its own concurrency
  group (`catalogue-us`, `catalogue-in`) and on its own offset schedule. This is allowed by
  `tests/workflowRules.test.ts` only because each commits paths no other workflow commits: its
  snapshots, its `demo/*.us.generated.ts`, its slug, alias and checkpoint files. A region workflow
  must never commit `data/product-slugs.json`, `data/id-aliases.json` or any UK path; the test
  will fail if it does, which is the guard. All push through `scripts/commit-and-push.sh`, whose
  rebase retry already handles two workflows pushing disjoint files to the branch.
- Shared files written from all regions' catalogues (the fragrance links and notes of
  `fragrance-links-daily.yml`) stay with the one workflow that writes them today, in the
  `catalogue` group; it learns to read the region catalogues.
- `harvest-one-shop.yml` takes the region from the shop's registry entry and holds that region's
  group, so a US one shop dispatch never blocks the UK crawl.
- `price-alerts.yml` reads each region's catalogue for that region's saved items.
- The deploy (`deploy-pages.yml`, group `pages`) stays single: one artifact, all regions.

## 4. Retailers per region

### Rules carried over

D23 (every request as PriceSniffsBot, robots.txt first, a refusal is never worked around), D29
and the supermarket rule (no marketplaces), the currency rule (the shop's own price in the
region's currency, never a conversion), and delivery from the shop's own page, dated.

**Affiliate product feeds are a permitted route, not a workaround.** The UK already ingests the
Awin feed. Most large US discounters that refused the bot today (FragranceNet, FragranceX,
Perfume.com, Macy's, Sephora) are reported to run affiliate programmes, and a network's product
feed is data the shop chose to publish to us. For the US this is likely the main route to the
big names, and it starts with the owner's affiliate applications.

### US first shortlist (answered the bot today, price in USD)

| Shop | Kind | Route | Note |
| --- | --- | --- | --- |
| Perfumania | Discount designer chain | Shopify `products.json` (200, USD) | Ships within the US only, which is right for a US site |
| Jomashop | Large discounter | Home 200, `products.json` 404: sitemap and JSON-LD | Robots 200 (720 B) |
| Luckyscent | Niche | Home 200, 4 sitemaps | |
| Aedes | Niche, New York | Shopify `products.json` | |
| Twisted Lily | Niche, Brooklyn | Shopify `products.json` | |
| Indigo Perfumery | Niche, Chicago | Shopify `products.json` | |
| Bluemercury | Beauty chain | Shopify `products.json` | |
| Beautyhabit | Niche multi brand | Shopify `products.json` | |
| Nordstrom | Department store | Home 200, `/api/` disallowed, `products.json` 404 | Heavier page; later |
| Brand own shops (D.S. & Durga, Imaginary Authors, Maison Louis Marie, Ellis Brooklyn, Boy Smells, Sol de Janeiro) | One house each | Shopify `products.json` | `singleBrandOnly`; fill brand pages, rarely compete on price |

Refused the bot today (feeds only): FragranceNet, FragranceX, Perfume.com, Perfume Emporium,
Neiman Marcus, Saks, Bloomingdale's, Macy's, Sephora US, Scentbird, Phlur, Abercrombie & Fitch.
**Not yet checked** and worth a probe pass before the beta: Ulta Beauty, Target, Kohl's,
Dillard's, Belk, JCPenney, Walmart (a marketplace: first party listings only, if the owner allows).

**The risk:** without the big discounters a US site may list most products at one shop only,
which is not a comparison. That is the first thing to measure (section 7).

### India first shortlist (answered the bot today, price in INR)

| Shop | Kind | Route | Note |
| --- | --- | --- | --- |
| Nykaa | Largest beauty retailer, multi brand | Home 200, `products.json` 503: sitemap and JSON-LD | The anchor; robots 200 |
| Purplle | Multi brand beauty | Home 200 | Check robots and product pages |
| Bombay Perfumery | Indian niche house | Shopify `products.json` | Single brand |
| BellaVita | Perfume and body care | Shopify `products.json` | Single brand; its UK arm is already in the registry |
| Wild Stone, Naso Profumi, Pilgrim | Houses | Shopify | Single brand |
| The Man Company, Ustraa, Mirah Belle | Houses | Custom, INR | Single brand |
| Gulab Singh Johrimal, Kannauj Attar | Attars | Custom and WooCommerce | Kannauj Attar also shows USD: read INR only |

Refused or silent: Tira, Ajio, Skinn by Titan (403), Myntra, Forest Essentials, Fogg, Mitti Attar
(no answer). Tata CLiQ, Myntra, Ajio, Amazon.in and Flipkart are marketplaces.

**The risk is larger than in the US:** most Indian shops that answered sell one brand, and the
market is led by marketplaces. With the D29 rule as it is, India has two multi brand shops
(Nykaa, Purplle), so few products would have two prices. India needs an owner decision on
marketplaces (for example, first party offers only: "sold by" the platform itself) before it can
be a comparison site.

### Delivery and tax model

| | UK (today) | US | India |
| --- | --- | --- | --- |
| Tax in the shelf price | VAT included | **Not included.** Sales tax is added at checkout and depends on the state and locality (none in Delaware, Montana, New Hampshire and Oregon; Alaska only local) | **GST included** in the price, which may not exceed the printed MRP |
| What the site shows | Price, delivery, delivered total | Price and shipping, total **"before sales tax"**, a line under every total: "Sales tax is added at checkout and depends on your state" | Price "incl. GST", MRP as the reference with the saving |
| Sort | Delivered price | Price plus shipping, before tax (tax is the same rate for every shop delivering to one address, so the order holds for nearly every buyer) | Price plus delivery |
| Delivery rule | Standard rate, free over threshold | Same shape (free over $35 to $50 is common); "contiguous US" rate; Alaska, Hawaii and military addresses noted, not priced; perfume often ground only | Same shape (free over ₹499 or ₹999 is common); **cash on delivery fee** recorded as a footnote, never priced in, like membership schemes today; PIN code coverage noted |
| Estimating tax | n/a | Not done: local rates vary and a wrong estimate is worse than an honest label. A later optional state setting could add an estimate | n/a |

The `ShippingRule` shape already fits all three once the amounts are currency neutral. Each shop's
figures come from its own delivery page with `verifiedAt` and `confidence`, as in the UK.

### Affiliate networks and what the owner signs up for

| Country | Network | Fit | Owner needs |
| --- | --- | --- | --- |
| US | **Awin** (now includes the former ShareASale merchants) | The existing Awin publisher account can apply to US advertisers | Add the US site in the Awin account; apply per programme |
| US | **CJ** | Many large retailers and their product feeds | Publisher account, W-8BEN tax form |
| US | **Rakuten Advertising** | Department stores and beauty | Publisher account, W-8BEN |
| US | **Impact** | Many direct to consumer brands | Publisher account, W-8BEN |
| US | **Skimlinks or Sovrn Commerce** | Catch all for the long tail, lower share | Site approval; useful for shops with no programme we joined |
| US | Amazon Associates | Marketplace, so it conflicts with D29; its terms restrict showing Amazon prices that did not come from its API | Only if the owner changes D29 for Amazon; then Product Advertising API |
| India | **Cuelinks, EarnKaro, vCommission, INRDeals** | Indian programmes including Nykaa and the D2C houses | Most expect an **Indian PAN and Indian bank account** for payouts and tax deducted at source; confirm per network before applying |
| India | **Admitad** | International network with Indian programmes | Pays international publishers; check which Indian shops are on it |
| India | Amazon Associates India | Marketplace (D29) | PAN and Indian bank account |

The registry's `affiliate` block and `deeplinkTemplate` already handle any network; only the
strings change. A W-8BEN (individual, UK resident) is the usual form for US networks; the income
is UK income for self assessment.

## 5. Legal and compliance

Not legal advice; the owner should have the US and India pages reviewed before monetising there.
`docs/LEGAL.md`'s rules stay: ranking is never for sale, what leaves the browser is named, prices
are indicative.

| | UK (today) | US | India |
| --- | --- | --- | --- |
| Affiliate disclosure | CAP Code (ASA), CMA and DMCC Act 2024; disclosure before the click (done) | **FTC Endorsement Guides** (16 CFR 255, revised 2023): clear and conspicuous, next to the links, not only in a footer; the FTC rule on fake reviews (2024). The existing before the click disclosure meets this; the wording changes to US English | **ASCI** code and its digital advertising guidelines: a clear label on paid links; the **CCPA guidelines on dark patterns (2023)**: no false urgency, no drip pricing. The existing disclosure and honest stock wording meet this |
| Privacy | UK GDPR, DPA 2018 | **CalOPPA** applies to any commercial site with California visitors: a conspicuous privacy policy saying how Do Not Track is handled. **CCPA/CPRA** and the other state laws apply above thresholds (about $26.6m revenue, or 100,000 consumers' data, or income mainly from selling data) that a small site does not meet; still honour the **Global Privacy Control** signal and offer "Do not sell or share" if personalised ads run | **DPDP Act 2023**, Rules notified November 2025, most duties phased in to about May 2027: notice and clear consent, a contact for data requests, breach notice, and **verifiable parental consent for anyone under 18**, so Indian accounts need an 18 or over confirmation |
| Cookies and consent | No cookies set; Google CMP before UK ads | No opt in law; use Google's "US states" privacy message when ads run | No cookie law as such; DPDP consent covers personalised ads, so serve non personalised ads in India until a consent flow exists |
| Price display | Indicative prices with the check time | Prices before sales tax, labelled; California's all in pricing law (SB 478) covers mandatory fees, not tax or shipping, so the label is enough | Show MRP and that GST is included; Legal Metrology rules bind the sellers, the site must not show a price above MRP as a deal |
| Trading identity | YannySniffs, sole trader, UK, stated | Same identity, stated as UK based; no US entity needed to publish | Same; if the site is ever an "e-commerce entity" under the Consumer Protection (E-Commerce) Rules 2020 it would need a grievance officer: get advice before India launches |

Changes in code: `demo/legal.ts` gets a region variant for each page; the privacy notice adds a
US section (CalOPPA, GPC) and an India section (DPDP), and the cookies page lists the new
`pricesniffs.region` key.

## 6. Product UX

- **The menu** stays where it is (top bar, just left of the account button), now with three
  rows: UK GBP, US USD, India INR, each with its flag and code; the button shows the flag and
  currency code on desktop, the flag alone on a phone, as now. A region in beta shows "Beta".
  Germany, France and Italy leave the menu until they are planned (owner decision), since "Coming
  Soon" with no plan behind it is a promise.
- **Prices:** `Intl.NumberFormat` per locale: £1,299.00; $1,299.00; ₹1,23,450 (Indian digit
  grouping). Whole rupees, no paise.
- **Sizes:** UK and India in ml. US shows "3.4 fl oz (100 ml)", using the nominal table for the
  label (3.4 oz, not 3.38), and filters by the ml band underneath.
- **Dates:** "9 Oct 2026" (UK, India), "Oct 9, 2026" (US).
- **Words:** British English everywhere for the first release (one set of copy; the changelog
  rules ask for it). In the US only the words that change meaning switch: shipping for delivery,
  ZIP code for postcode, sales tax, MSRP for RRP, "cologne" accepted in search. A full US English
  copy layer is not worth it before the US has traffic. India uses British English, with MRP and
  PIN code.
- **Accounts:** one account across regions (same origin). Supabase migration: `region text not
  null default 'GB'` on `wishlists` with a check on the three codes, the unique key becomes
  (user, fragrance, region), `target_price_gbp` becomes `target_price` with the currency taken
  from the region, and the same on `price_alert_history`. Existing rows become `GB` with no
  change. The wishlist page shows the current region's items and a count of the others
  ("3 saved in the US"). Alert emails link to the region's address and format the region's
  currency. The profile may hold a home region later.
- **Ads:** the three existing placements, per region slot ids in the region config. Rough page
  RPM relative to the UK: US two to three times higher, India a fifth to a tenth (estimates, not
  measured). The Premium ad free plan is priced in pounds; US and India pricing waits until
  Premium exists.
- **Changelog:** a region going public is a visible change and gets a line in that day's entry.

## 7. Rollout

**First country: the USA.** More multi brand shops answered the bot (eight against India's two),
the networks pay a UK individual with a W-8BEN, the existing Awin account carries over, the ads
earn more per view, the language is the same, and the ounce sizes are already handled. India
waits on two owner decisions (marketplaces and payouts without an Indian PAN) and has a thinner
comparison.

| Phase | What | Effort | Agents | Owner |
| --- | --- | --- | --- | --- |
| **0. Region foundation, UK only** | `src/config/regions.ts`; `region` on `Retailer`, currency widened with the guard per region; neutral money names and `formatMoney` (the 800 `£` lines, in batches); router prefix and reserved words; build per region into one artifact; sitemap index; generated files manifest; the menu reads the config (UK only selectable); correct the `OZ_TO_ML` comment. **Proof: the UK build is unchanged** (every sitemap address and every page's data byte for byte the same) | 4 to 6 sessions | **Opus** for the config, types, router and build; **Sonnet** for the mechanical rename and formatter swap, file by file with tests | Approve trimming the menu to UK, US, India; delete the `country-selector` branch |
| **1a. US dry run, no publish** | Probe the unchecked US shops; registry entries for 5 to 10 shops with dated US delivery; dry runs only (`--dry-run`); measure overlap and match rate | 2 to 3 sessions | **Sonnet** for probes and entries, **Opus** to review matching | Decide the marketplace rule for the US; apply to Awin US, CJ, Rakuten, Impact, Skimlinks (W-8BEN) |
| **1b. US hidden beta** | `catalogue-us.yml` in group `catalogue-us`; US snapshots, catalogue, history, deals, slugs; `/us/` built with `noindex`; menu shows US only with `?beta=1` | 3 to 4 sessions | **Opus** for the workflow and pipeline, **Sonnet** for pages and copy | Decide D24 photo basis per US shop; read the US legal text |
| **1c. US public beta** | Menu row "US Beta"; sitemap and hreflang on; time zone suggestion bar; US legal pages; Supabase region migration | 2 sessions | **Sonnet**, Opus review of the migration | Run the Supabase migration; add `/us/` to Search Console |
| **2. India** | As 1a to 1c with GST and MRP, COD footnote, combos, attars, DPDP age confirmation | 6 to 8 sessions | As above | Marketplace decision for India; whether payouts can work without a PAN; legal review |
| **3. Domains** | Cloudflare in front, Worker mapping, 301s, per domain AdSense and Search Console | 2 sessions | **Opus** | Register domains; move DNS to Cloudflare; add sites in AdSense |

**What to measure before committing to the US** (after phase 1a, before 1b):

1. **Overlap:** the share of US products with offers from two or more US shops, and the median
   price gap between cheapest and dearest. Proceed if at least a quarter of products have two
   shops; below that the site is a catalogue, not a comparison, and the feeds (and so the
   affiliate approvals) must come first.
2. **Match rate:** the share of US listings that land on an existing product id by barcode.
3. **Demand:** US and Indian visits already arriving, from `site_page_views` by country (the
   query in `docs/OWNER-STEPS.md` 8d).
4. **Cost:** minutes per sweep and MB per day per US shop, against the estimates in section 3.
5. **Money:** at least three US shops or feeds approved on an affiliate network.

After the public beta, give it four to eight weeks of Search Console impressions and shop clicks
for `/us/` before starting India.

## Owner decisions

1. Subfolders now (`/us/`, `/in/`), UK at the root unchanged; domains later behind Cloudflare.
2. The USA first, as a hidden beta, then public "Beta".
3. Trim the menu to UK, US and India (Germany, France and Italy out until planned).
4. Marketplaces: keep D29 for the US beta; decide for India (first party offers only?) before
   Phase 2.
5. Photos: whether D24 extends to each US shop (one `imageBasis` line each).
6. Affiliate sign ups for the US (Awin US, CJ, Rakuten, Impact, Skimlinks) with a W-8BEN; for
   India, whether payouts can work without an Indian PAN and bank account.
7. Copy: British English with US terms where meaning changes, or a full US English layer later.
8. A legal review of the US and India privacy and disclosure text before monetising there.

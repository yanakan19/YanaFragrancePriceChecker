# PriceSniffs for the USA and India: plan

Written 2026-10-09. **Phase 0 (the region foundation, UK only) is built** (9 Oct 2026, section
"Phase 0: what was built" below). **The US and India are live as a public beta since 9 October
2026** at `/us/` and `/in/`, by owner decision on the numbers measured that day (section "Public
beta, 9 October 2026: what shipped", at the end); the rest is still a plan. Owner request: native US and Indian
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
  (Phase 0, 9 Oct: trimmed to UK, US and India and read from `src/config/regions.ts`.)
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

#### Remembered preference: built 9 Oct 2026

What makes "or log in, we'll remember your preference" true (`demo/regionPreference.ts`,
`demo/regionProfile.ts`, wired in `demo/app.ts`). All of it waits for a second live region
(`liveRegions().length >= 2`): until then nothing is read, written or drawn, and the page makes
no request for it. It does not wait for `REGION_WELCOME_ON`, which only switches the pop-up.

- **What is saved where.** In this browser, `localStorage` `pricesniffs.region` ('GB', 'US' or
  'IN'), so a later visit needs no request. For a signed in visitor, also `profiles.region`
  (migration 0009, run on the live project on 9 October 2026 and checked the same day:
  `GET /rest/v1/profiles?select=region&limit=0` with the public key answers 200 and `[]`,
  where a missing column answers 400). Nothing else is stored; no cookie.
- **Who writes it.** Every choice, from the pop-up, the country menu (`chooseRegionFromMenu`)
  or the Country row, is written to this browser and, when signed in, to the profile, waiting
  at most 1.5 seconds for the profile before going on. Choosing the region the page is in is
  remembered too once a second region is live (it was a no op while the UK was alone).
- **The rule on sign in, and on each page load for a signed in visitor** (`reconcileRegion`):
  the profile wins. A profile country is mirrored into this browser, even over a different
  local one, because the account is what the visitor asked to be remembered by. A choice made
  in this browser before signing in is copied to a profile that has none. With neither,
  nothing is chosen and the pop-up asks. When the profile cannot be read, the local choice
  stands and nothing is written. The profile is read once per page load, shared by the sign
  in handler and the arrival check. A change made on another device shows from the next page
  load on this one.
- **Where it moves the visitor** (`arrivalAction`): only the bare home page (`/`), and only to a
  live region's home. A deep link (a product, brand, notes or guides page, `/account`, a
  region's own home) is never redirected; the page notes the remembered country on the root
  element (`data-remembered-region`) where the slim "You are seeing UK prices. See US prices"
  bar takes over (see "The menu: switching and remembering"). A signed in visitor with nothing
  in this browser and US or India on the profile is taken from `/` to `/us/` or `/in/` once the
  profile answers.
- **The Country row** on the profile page (`/account`, after Your Plan): United Kingdom, United
  States and India drawn as the pop-up draws them (flag, name, currency), the current one
  pressed and ticked (the remembered country, else the region the page is in). Pressing one
  saves it here and on the profile and opens that region's home; pressing the current one
  saves it and stays. Hidden while only the UK is live; `/account?regionwelcome=preview`
  shows it with every region, for the browser test and a look.
- **Also:** Download My Data includes the saved country; the privacy notice and the cookies
  page say where the country is kept once it can be chosen. Tests:
  `tests/regionPreference.test.ts` (the rules, the menu's profile write, the row, the legal
  text with the beta flags set) and `tests/regionPreferenceBrowser.test.ts` (the built page).

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

Taken by the owner on 9 October 2026 (recorded as D30 in `docs/DECISIONS.md`):

1. **Addresses: folders. Approved.** The UK stays at `/`, the US at `/us/`, India at `/in/`. No UK
   address moves. Domains later behind Cloudflare (section 2) remain an option, not a plan.
2. **The US goes first, India second. Approved.**
3. **The country menu is trimmed to United Kingdom, United States and India. Approved.** Done in
   Phase 0: Germany, France and Italy are out until planned; the US and India show "Coming Soon"
   and cannot be chosen while they are not live.
4. **India: marketplaces such as Amazon.in and Flipkart are allowed in principle**, but only where a
   permitted route exists under D23: no scraping a site that forbids it in robots.txt or its terms,
   and no getting past a block. This may rule them out in practice (both are large, bot guarded
   sites whose terms restrict automated access); check robots.txt and the terms before any work.
5. **Photo rule (D24) for new countries: resolved, yes (owner, 9 Oct 2026).** Each US and Indian
   shop shows its own photo, hot-linked from its page and never copied, as the UK does; the 16 UK
   shops added on 8 and 9 Oct 2026 and Glossier UK are covered too (docs/DECISIONS.md D24).
6. **Affiliate programmes: not now.** For now only shops our crawler can read under D23 (scraped
   shops). Affiliate sign ups (Awin US, CJ, Rakuten, Impact, Skimlinks, the Indian networks) are
   planned for later, so the US beta is built from the shops that answered the bot (section 4's
   shortlist); the big discounters that refused it stay out until then.
7. **Spelling on the US site: British English**, with US terms where the meaning changes (fl oz
   beside ml, shipping, ZIP code, MSRP, sales tax). The region config carries the hooks
   (`units`, `delivery.word`, `delivery.postcodeWord`, `referencePriceName`).
8. **A legal review of the US and India privacy and disclosure text happens before any money is
   earned there** (owner's step, `docs/OWNER-STEPS.md`).

## Phase 0: what was built (9 Oct 2026)

The UK looks and behaves exactly as before, apart from the approved menu trim.

- **Region config**, one place: `src/config/regions.ts` (`REGION_CONFIGS`): id, name, flag,
  currency code and symbol, currency name, locale, hreflang, how money is written, units, path
  prefix, live flag, time zones for the suggestion, reference price name, tax model, delivery
  model and legal variant. The UK is live; the US and India are present and not live.
  `src/services/regions.ts` (the menu's list) now reads it.
- **One money formatter**: `formatMoney`, `formatMoneyShort`, `formatMoneyFine` and
  `currencySymbol` in `src/services/money.ts`, taking the symbol and number format from the
  region. The UK keeps exactly what it printed (`£`, two decimals, no thousands separator); the US
  gets `$1,299.00`, India whole rupees `₹1,23,450`. Every price the page, the share text and the
  alert emails print now goes through it (the old `formatGbp` call sites, the hand written `£` in
  the delivery facts, the legal pages' delivery examples, the price bands, the wishlist target
  field, the price per ml, the cheapest verdict). `formatGbp` stays as the public API's name for
  the UK form. Most of the 802 `£` lines the plan counted are comments, tests, scripts reading
  UK shops' pages and the registry's own delivery terms; those were left, by design.
- **Guards**: `tests/ukPricesUnchanged.test.ts` runs every price in the catalogue, deals and price
  history, every delivered total (each price plus each registry delivery charge), every registry
  delivery amount, every penny to £2,000 and every price per ml through the old expressions and
  the new formatter: all identical. `tests/moneyGuard.test.ts` fails on a new hard coded `£` in a
  string the page code, services or alert emails print (read with the TypeScript scanner, so
  comments do not count), with a small allowance for UK legal and guide copy.
- **Proof on the built page**: 116 pages (home, Deals, Search, every Explore tab, Brands, Shops,
  Notes, About, the Legal Notice, the guides, account and settings pages, 60 product pages, 12
  brand pages, 20 shop pages, 4 note pages) rendered at 1280 wide with a fixed clock, before and
  after, from the same data. Outside the inline script and the country menu, all 116 bodies are
  byte for byte identical, and the 7,398 pound amounts on them are identical and in the same order.
  Two runs of the old build were identical to each other, so the comparison is not noise.
  Repeated after merging the live branch (25f2caf7, with the 9 October harvest): 70 pages,
  identical outside the script and the menu, 3,983 pound amounts identical in order.
- **The country menu**: United Kingdom, United States, India; the US and India greyed out
  "Coming Soon". Choosing the UK still stores nothing. A live region other than the current one
  would be remembered and opened (none yet).
- **Welcome pop-up** ("Select your country"), exactly as the section above: `demo/regionWelcome.ts`
  and `demo/regionProfile.ts`, styles in `demo/template.html`. Off: it needs
  `REGION_WELCOME_ON = true` in `src/config/regions.ts` **and** a second live region. The
  `?regionwelcome=preview` address opens it with every region as a choice, for the page test and
  for the owner to look at. The choice is kept in `localStorage` (`pricesniffs.region`, every read
  and write in try/catch) and, signed in only, in `profiles.region`
  (`supabase/migrations/0009_profile_region.sql`, not run yet). The cookies page lists the key
  only once the pop-up can write it. Tests: `tests/regionWelcome.test.ts`,
  `tests/regionWelcomeBrowser.test.ts` (dialog, focus, Escape, close button, tap outside, light
  and dark, 320, 390 and 1280 wide, axe clean).
- **Routing ready**: `matchRoute` takes off a live region's prefix (`splitRegionPrefix`), and
  `routeToPath`, `productPath` and the canonical put it back (`regionPath`); the UK has no prefix,
  so nothing changes, and `/us/...` is a page not found while the US is not live. `us`, `in` and
  `uk` are reserved words for slugs. hreflang (`hreflangAlternates`, `hreflangFor`, applied in
  `applyHead`) names live regions only, so no page declares any yet.
- `OZ_TO_ML`'s comment now says the US fluid ounce.

**Left for Phase 1 (the US beta).**

- The US shops that answered the bot and quote USD (`docs/RETAILER-CANDIDATES-USA-INDIA-2026-10-09.md`):
  multi brand **Perfumania, Aedes, Twisted Lily, Indigo Perfumery, Bluemercury, Beautyhabit**
  (Shopify `products.json`), **Jomashop** and **Luckyscent** (sitemap and JSON-LD); single
  brand Boy Smells, Sol de Janeiro, D.S. & Durga, Imaginary Authors, Maison Louis Marie, Ellis
  Brooklyn (USD at origin); Nordstrom later. Probe Ulta, Target, Kohl's, Dillard's, Belk and
  JCPenney first.
- `region` on `Retailer` and the currency guard per region; neutral delivery field names; US
  snapshots, catalogue, history, deals, slug and alias files and `catalogue-us.yml` (section 3).
- A build per region into `demo/us/`, route pages under `/us/`, the sitemap index, and a check of
  the few hard coded `href="/..."` links in `demo/app.ts` so they carry the prefix.
- The slim "You are seeing UK prices" bar on deep links, `/uk/...` redirects, fl oz labels, US
  dates, the region variants of the legal pages and the US disclosure wording.
- Switch on: set the US `live` (beta), `REGION_WELCOME_ON`, run migration 0009, list `/us/` in
  Search Console.

## Phase 1, step one: the US and India test crawl (9 Oct 2026)

A dry run per region, nothing published: no page, no sitemap entry, no UK file touched.

- **Registry, per region**: `src/config/retailers.us.ts` (26 shops) and `src/config/retailers.in.ts`
  (16), shape `RegionRetailer` (`src/types/regionRetailer.ts`): neutral money names in the shop's own
  currency, standard delivery read off a robots allowed page with the sentence quoted and the date (or
  marked unread: Fragrance Outlet's and MicroPerfumes' `/policies/shipping-policy` is disallowed and
  was not fetched), the tax note (US: before sales tax; India: GST included), no affiliate field, and
  `imageBasis` on every shop (D24, answered yes 9 Oct 2026). Shops that share one catalogue (Perfumania, Fragrance Outlet, Fragrance
  Market) carry one `catalogueGroup` and count once in the overlap measure. MicroPerfumes keeps
  retail bottles only. Purplle's price 0 is read as sold out (`zeroPriceMeansSoldOut`), never as a
  price. Off, each with its reason in the entry: Jomashop (no price in the markup), Dillard's (sizes
  only inside one AggregateOffer), eCosmetics (Store API only, for the owner to rule on), Nordstrom
  (later), AAR Fragrances (price only in `og:price`), Mirah Belle (no perfume), Kannauj Attar.
- **Crawl**: `scripts/region-harvest.ts` and `src/catalogue/regionHarvest.ts` reuse the UK adapters
  (Shopify `products.json`, sitemap and JSON-LD, robots.txt first, PriceSniffsBot only). A price is
  kept only in the region's currency as the shop states it (a Shopify storefront must publish it at
  rate 1; a JSON-LD page must name it); pounds, an unnamed currency or a conversion are refused.
- **Build**: `scripts/build-region-catalogue.ts` and `src/catalogue/regionCatalogue.ts` build the
  catalogue, an append only price history and `report.json` (the go/no-go numbers of section 7) with
  the UK's own identity, naming and merge rules; the UK slugs are read only, to count barcode matches.
- **Files**: everything under `data/regions/us/` and `data/regions/in/` (listed in
  `scripts/generated-files.txt`), never a UK path.
- **Workflows**: `catalogue-us.yml` and `catalogue-in.yml`, run by hand only, each in its own
  concurrency group (`catalogue-us`, `catalogue-in`; they commit paths no other workflow commits),
  pushing only through `scripts/commit-and-push.sh`. A schedule waits for the hidden beta (1b).

### Build record, 9 October 2026 (dry runs, nothing published)

| | US, run 37885633420 | India, run 37886577840 |
| --- | --- | --- |
| Shops priced | 22 of 22 enabled (26 wired) | 12 of 14 enabled (16 wired) |
| Products | 21,594 | 14,568 |
| Two or more shops | 5,593 (25.9%); counting the Perfumania, Fragrance Outlet and Fragrance Market catalogue once: 1,700 (7.9%) | 751 (5.2%) |
| Three or more shops | 2,059 | 108 |
| Median gap, dearest to cheapest | 17.2% | 14.4% |
| Listings with a barcode | 16.2% (1,442 products match a UK product by barcode) | 0% |
| Crawl minutes | 14.4 | 14.4 |

Rebuilt from the same snapshots with the region name match (regionMatchName, Perfume Palace's vendor
fix), the independent share is 8.7% in the US and 10.5% in India.

**Reruns, same day**, with the name match, Nykaa's header fix and AAR Fragrances' og:price reader:

| | US, run 37887007762 (built 05:21 UTC) | India, run 37887989045 (built 05:33 UTC) |
| --- | --- | --- |
| Shops priced | 22 of 22 enabled | 13 of 14 enabled (Purplle read nothing) |
| Products | 21,685 | 13,856 |
| Two or more shops | 5,824 (26.9%); counting the one catalogue once: 1,948 (9.0%) | 1,587 (11.5%) |
| Three or more shops | 2,112 | 286 |
| Median gap, dearest to cheapest | 17.5% | 13.0% |
| Listings with a barcode | 16.8% (1,490 products match a UK product by barcode) | 0.2% (19 match the UK) |
| Crawl minutes | 14.5 | 14.3 |

The name match (`regionMatchName`: "For Unisex", "For Man & Woman" and the like taken out before
the same-bottle merge, region build only; the shared UK matcher is untouched) is in these numbers
and is **the owner's call** to keep: without it India's share was 5.2% and the US's 7.9%.

Why the three anchors read thin on the reruns, and what changed after them:

- **Nykaa, 280 listings.** All seven product sitemaps were read (3,069 perfume addresses); the
  limit was one product page per request, 295 pages in the 14 minute share. Now 40 minutes and up
  to 1,000 new pages a run at the same 2 second gap; each run reads unseen pages first, so the
  snapshot grows run by run. Its sku is its own id, not a barcode (32 of 260 read as one).
- **Ulta, 178 priced, 0 kept.** One sitemap file (`/sitemap/p.xml`, 2,812 perfume addresses); 187
  pages in 12 minutes (pages are about 1.4 MB). Its priced Product names no size: the size of the
  selected sku is only in the page's ProductGroup (`hasVariant` sku and size), which is now read.
  Now 40 minutes and up to 900 new pages.
- **Purplle, 0.** From the GitHub runner its sitemap is answered with a 545 byte page that only
  loads a bot-check script, on both India runs; from other networks the same request gets the
  sitemap. That is a challenge, so a refusal under D23: switched off with that reason, not worked
  around.


Failures and why: **Nykaa** read nothing from the runner because its answer's headers pass Node's
16 KB limit (undici HeadersOverflowError, not a refusal); the harvest now allows larger headers.
**Purplle**'s sitemap came back with no product address from the runner and no failed request
(it reads fine from elsewhere); the report now records what that sitemap held. Purplle marks sold
out pages with price 0 (most of its old fragrance pages), read as sold out. **AAR Fragrances**:
274 pages priced through the new og:price reader before its time budget. **Ulta**: only 195 pages
in 12 minutes (1.4 MB pages), 31 kept. Off: Jomashop, Dillard's, eCosmetics, Nordstrom, Kannauj
Attar (Store API per variation, single house, left off), Mirah Belle.

**Third runs, same day**, with the larger page budgets for Nykaa, Ulta and AAR Fragrances, Ulta's
sizes read from its ProductGroup, and Purplle switched off (bot check page, D23):

| | US, run 37893601806 (built 07:09 UTC) | India, run 37893603657 (built 07:08 UTC) |
| --- | --- | --- |
| Shops priced | 22 of 22 enabled | 13 of 13 enabled (Purplle off) |
| Products | 22,512 | 14,693 |
| Two or more shops | 5,928 (26.3%); counting the one catalogue once: 2,067 (9.2%) | 1,879 (12.8%) |
| Three or more shops | 2,144 | 383 |
| Median gap, dearest to cheapest | 17.7% | 13.9% |
| Listings with a barcode | 18.8% (1,628 products match a UK product by barcode) | 0.7% (58 match the UK) |
| Crawl minutes | 42.3 | 40.3 |

The anchors filled in: Ulta 178 priced to 689 (608 kept), Nykaa 280 to 850 (795 kept), AAR
Fragrances 266 to 573 (559 kept). They keep filling in at up to 900 (Ulta) and 1,000 (Nykaa, AAR)
new pages a run, unseen pages first.

**Recommendation (overtaken the same day: the owner waived the bar and ran the public beta on these
numbers, see "Public beta, 9 October 2026" below):** neither region meets the plan's bar (a quarter
of products with two or more independent shops). After the third runs: US 9.2%, India 12.8%. Hold the beta. The US looks like a comparison only on the raw count, which is inflated by
three shops running one catalogue; honestly it is under one in ten. Do not start the hidden beta
yet. For the US, the gap is the big discounters, which need the affiliate feeds the owner deferred
(decision 6), plus Ulta and Dillard's readers. For India, re-measure once Nykaa reads; without
Nykaa it is three Arabian and niche multi brand shops and is a catalogue, not a comparison.

## Public beta, 9 October 2026: what shipped

**Owner decision, 9 October 2026: run the US and India beta now, on the data as it stands.** The
plan's go/no-go bar (a quarter of products with two or more independent shops, section 7) is waived
by the owner: the beta runs on the measured numbers (US 9.2% independent, India 12.9%), so it is a
public beta with fewer shops than the UK site, and says so on every page. The hidden beta (1b) was
skipped: 1b and 1c shipped together, for both countries, in one go. Recorded in D30 (`docs/DECISIONS.md`).

### What is live

| | United States, `/us/` | India, `/in/` |
| --- | --- | --- |
| Shops with prices on the page | 20 (of 22 enabled; Boy Smells and Imaginary Authors read nothing yet) | 10 (of 13 enabled; Bombay Perfumery, Gulab Singh Johrimal and Pilgrim read nothing yet) |
| Products | 22,390 (433 sets, 121 oils) | 14,594 (655 sets, 905 oils and attars) |
| Two or more shops | 5,928 (26.5%); counting the Perfumania, Fragrance Outlet and Fragrance Market catalogue once: 2,067 (9.2%) | 1,879 (12.9%) |
| Sitemap | `sitemap-us.xml`, 23,681 addresses | `sitemap-in.xml`, 15,173 addresses |
| Prices read | 9 Oct 2026, 06:27 UTC (the third dry run) | 9 Oct 2026, 06:27 UTC |

Built from the committed region data (`data/regions/<us|in>/`) at deploy time, as the UK page is
built from its generated modules. Products with no house named (122 US, 99 India) are left out:
they have no brand page and no address.

- **Pages.** `scripts/build-region-data.ts` turns each region's snapshots, price history and
  product addresses into the same module shapes the UK page reads (`scripts/regionSite.ts`), and
  `scripts/bundle-region.ts` bundles the same app once per region with five modules swapped: the
  catalogue, the deals, the dormant products, the price history and the shop registry (the
  region's shops as page `Retailer`s, `src/config/regionShops.ts`: no affiliate code, the hot-link
  photo basis, no logo). `scripts/build-demo.ts` publishes `demo/us/index.html`, `demo/us/404.html` and
  `demo/us/data/` (and the same for `/in/`); `scripts/build-route-pages.ts` writes a page of its
  own for each fixed address inside each region (`/us/deals` is `demo/us/deals.html`), so they
  answer 200. All deploy files: gitignored and in `scripts/generated-files.txt`.
- **Deep links.** GitHub Pages answers every address that is not a file with the root
  `404.html`, the UK page. Its first script (`scripts/regionPages.ts`) sees `/us/...` or `/in/...`,
  stops the UK page fetching any data and hands the address to `/us/?ps_path=...`, whose first
  script puts the address back before the app reads it. (Writing the region's document in place
  was tried first; a stopped document ignores `document.write`, by the HTML standard.) `/uk/x`
  goes to `/x`.
- **Product addresses.** A bottle the UK also sells keeps its UK address (`/us/creed_aventus_100ml`);
  a product new to the region gets one by the UK's rules, never a UK address. Each region has an
  append only memory, `data/regions/<us|in>/product-slugs.json` (22,390 and 14,594 addresses
  today), written by the region crawl (`scripts/build-region-catalogue.ts`) and read by the page
  build; never delete or change an entry.
- **Money, units and words** (`src/services/regionText.ts`, `src/services/money.ts`): `$1,299.00`
  and `₹1,23,450`; US sizes as `3.4 fl oz (100 ml)` from the nominal bottle table; shipping,
  shipped, MSRP, ZIP code and "before sales tax" in the US; GST included, MRP, PIN code and the
  cash on delivery footnote in India; dates `Oct 9, 2026` in the US. Every UK string comes back
  unchanged (the functions return the UK text untouched).
- **Photos.** Owner decision 5 is resolved: the owner answered D24 yes on 9 Oct 2026 for the US and
  Indian shops. A product shows the matching UK product's picture first (below), else the best of
  its shops' own photos by `pickImage`, hot-linked from the shop's page; the offer's `imageUrl` is
  that address (`RegionListing.imageUrl`, kept by the region harvest from the next crawl on), and
  a product with no picture draws the "No image available" marker. `tests/regionPages.test.ts` and
  `tests/regionShopPhotos.test.ts` check it.
- **Notes.** The region shops publish no notes, so the US and Indian Notes tabs are empty: kept
  out of the region sitemaps, `noindex`, and the UK Notes page declares no alternate
  (`regionHasFixedPage`, `src/config/regions.ts`).
- **Deals.** None yet: the region harvest records no shop's previous price (every snapshot's
  `wasPrice` is null), and a reference price is shown only where other shops corroborate it, as
  in the UK (`src/catalogue/wasPriceCredibility.ts`). The Deals tab says so, and is left out of the
  region sitemaps while it is empty. Reading Shopify's compare at price in the region harvest is
  the next step for deals.
- **The region name match** (`regionMatchName`, "For Unisex" and "For Man & Woman" taken out
  before the same bottle merge) is kept exactly as it was: the owner ran the beta on numbers that
  include it. It is used by the region builds only (the crawl's report and the page build); the
  UK matcher is untouched.

### The menu, the bar and the pop-up

- The country menu lists United Kingdom, **United States (Beta)** and **India (Beta)**, all three
  choosable (`menuName`, `src/services/regions.ts`). A choice goes through lane 2's `chooseRegion`
  (`demo/regionPreference.ts`): saved in `localStorage` (`pricesniffs.region`) and, signed in, on the
  profile, then the same page opens there (`demo/regionSwitch.ts`): a product sold there opens its
  page there (found by id, through the `regions` lazy data file), else its brand's page there,
  else the same section (Deals, Explore, About, the guides, the Legal Notice, filters kept), else
  that country's home. A shop page opens that country's Shops; the account pages its home.
- A deep link is never redirected. When the visitor's remembered country (or, with none, the
  browser's time zone) is another live one, a slim bar under the top bar says "You are seeing UK
  prices. See US prices" (the mirror on the US and Indian pages), drawn from lane 2's
  `noteRegionMismatch` hook; its close button hides it for the visit (`sessionStorage`
  `pricesniffs.regionBarClosed`, listed on the cookies page).
- **The welcome pop-up is on** (`REGION_WELCOME_ON = true`), by owner decision, **while the
  AdSense review is still open**: a small centred dialog on the bare UK home only, for a visitor
  who has chosen no country, which leaves the page readable behind it (section 2, "Welcome").
- The US and Indian pages carry a beta line under the top bar ("US prices are in beta: fewer shops
  than the UK site for now", "Indian prices are in beta: ..."), and their home shows "Prices
  checked daily. Last checked Oct 9, 2026." from the region's own build.

### Legal pages

`demo/legalRegion.ts` holds the US and Indian versions of the affiliate disclosure (no shop pays
us; how a paid link would be marked under the FTC guides or the ASCI code), the privacy notice (US:
CalOPPA, Do Not Track, Global Privacy Control, no sale or sharing, under 13s; India: the DPDP Act,
consent and its withdrawal, a contact for requests, breach notice, accounts for 18 or over), the
terms (prices before sales tax; GST included, MRP, cash on delivery fees not included; no shop
photographs for now), refunds and How it works. The cookies and contact pages are the UK's. Plain
and short on purpose: the owner has them reviewed before any money is earned in either country
(`docs/OWNER-STEPS.md`, section 10). An 18 or over confirmation at sign up for Indian accounts is
not built yet; the privacy notice states the rule.

### Search engines

- `demo/sitemap.xml` is a sitemap index naming `sitemap-gb.xml` (every UK address, the same 35,257
  as the one sitemap before), `sitemap-us.xml` and `sitemap-in.xml`; `robots.txt` is unchanged (it
  names the index). Each address that exists in more than one region carries its hreflang
  alternates (`en-GB`, `en-US`, `en-IN`, `x-default` = the UK page) as `xhtml:link`: the fixed
  pages in every region, a product where the same product id is sold (2,151 UK addresses, 2,112
  US, 381 India), a brand where it is sold. A shop's page has none.
- Every page's canonical is its own region's. The same alternates are in the head of the home
  pages and every route page, and the app sets them on every page it draws (a product's and a
  brand's once the `regions` file says which countries sell it).
- Region pages are indexable (public beta, not `noindex`), except the empty Notes tab.

### Crawls and deploys

- `catalogue-us.yml` runs daily at 07:52 UTC and `catalogue-in.yml` at 20:22 UTC (03:52 in New
  York, 01:52 in India), off the UK crawl's :15 and :45 ticks, each in its own concurrency group,
  committing only its own folder through `scripts/commit-and-push.sh`; a scheduled run commits
  (the dry runs needed the "commit" box). The schedule started with the beta.
- A finished region crawl starts `deploy-pages.yml` (workflow_run), and `scripts/deploy-decision.mjs`
  counts `data/regions/` as page changing, so a run that committed prices deploys and one that
  committed nothing does not. A push under `data/regions/` deploys too.
- The deploy checks the region pages before it uploads: each region's page and its deep link copy
  identical, its sitemap a urlset, the index a sitemap index, every route page present
  (`scripts/build-route-pages.ts --check`).

### Proof: the UK build is unchanged

Built twice from the same data, the live tip before the beta (`e38eedba`) and the beta (`c76c9554`):

- **All 8 UK data files byte for byte identical** (`catalogue`, `deals`, `fragranceLinks`,
  `priceHistory`, `dormant`, `guides`, `method`, `notes`: the same content hashes), plus one new
  small lazy file, `data/regions.<hash>.json` (0.1 MB, the other regions' product and brand
  lookup, fetched only on a product or brand page or by the menu).
- **All 35,257 UK sitemap addresses identical** (the old `sitemap.xml` against the new
  `sitemap-gb.xml`), and the same 31 UK route pages.
- The UK page's head gains the hreflang links and the deep link hand off script; its body gains
  two empty hidden hosts (the beta line and the bar). The rest of the change on a UK page is what
  the beta needs: the menu rows, the bar on a deep link for a visitor whose country is another,
  the welcome pop-up, and the cookies page listing the two keys the beta writes.
- Checked in a browser the same day: `/us/` and `/in/` render the product grid in dollars and
  rupees with no console error, a US deep link (`/us/creed_aventus_for_her_75ml`) opens through the
  hand off, the menu switches a UK product to its US page, and the UK home asks "Select your
  country" for a visitor in a US time zone.

### UK photos on matching region products (9 Oct 2026)

Owner instruction, 9 Oct 2026: where a US or Indian product is the same bottle as a UK product,
the UK listing's picture is shown on the US or India page. The UK site already shows that picture
under D24's existing basis, so no new shop's photo is shown; a US or Indian shop's own picture is
never read (the region snapshots carry none).

- **Rule** (`src/catalogue/regionUkPhotos.ts`, `matchUkPhotos`). Both products must be plain bottles
  (never a gift set, oil or attar), with the same size in ml and the same strength. Then either
  (1) by barcode: the region product's `ean-` id is a UK product id, the match
  `productsMatchingUkByBarcode` counts; a barcode that names another size, strength or kind is no
  match, and no name match is tried after it. Or (2) by name, the only non barcode match, used
  because it is the UK's own idea of one bottle: identical house, name, strength and size after
  `regionMatchName`, strength stated on both, exactly one UK product with that key, and no two real
  barcodes that disagree. When unsure, no match.
- **Where it lives.** The page build (`scripts/build-region-data.ts` into `buildRegionSite`) gives
  the matched product the UK entry's `image` and `imageTransform`, so every deploy, and so every
  daily region crawl, keeps it. The region build (`scripts/build-region-catalogue.ts`) records
  `ukPhoto: { id, by }` on each matched line of `data/regions/<r>/catalogue.json` (the UK id, never
  the picture) and the counts in `report.json`. A crawl that cannot load the UK catalogue still
  builds, with no UK pictures counted. The pages draw the picture exactly as the UK page does
  (`productArt`); a product with no match keeps the "no image" tile. No UK file is written.
- **Counts** (committed snapshots of 9 Oct 2026): US 3,820 of 22,390 products (17.1%), 1,280 by
  barcode and 2,540 by name; India 1,551 of 14,594 (10.6%), 57 by barcode and 1,494 by name. Of the
  1,596 US barcode matches, 298 failed the size, strength or kind check and are not used (a US
  1.7 oz bottle on the barcode of a UK 50 ml, for instance). Name matches with two UK candidates (170 US, 162 India), a barcode that disagrees or no stated strength are not used.
  Homepage Most Stocked 12: US 9 have a picture, India 3.
- **D24 for US and Indian shops' own photos was answered yes on 9 Oct 2026.** The UK picture still comes first; a shop's own photo fills the products with no UK match.

### UK notes on matching region products (9 Oct 2026)

Owner decision, 9 Oct 2026: the US and Indian shops publish no fragrance notes, so a US or India
product that is the same bottle as a UK product shows the UK product's notes, with the note icons.
The same approach as the UK pictures above.

- **Rule.** Exactly the rule of "UK photos on matching region products": the barcode match, then the
  strict name match (`matchUkBottles` in `src/catalogue/regionUkPhotos.ts`, shared by
  `matchUkPhotos` and the new `matchUkNotes`). A product with no UK match keeps no notes; a gift
  set never takes any. The match does not need the UK listing to have a picture, only notes.
- **What is copied.** The UK entry's `notes` as the UK page shows them (already folded by
  `data/note-aliases.json`, then tidied by `demo/data.ts` like any page), and the credit: the UK
  shop's id, the link to the page the notes were read from, and its name in `source.retailerName`
  (the region's shop registry does not list the UK shop, so the page cannot look it up). The page
  says "As published by <UK shop>" with the link, as the UK page does.
- **Where it lives.** `buildRegionSite` (`scripts/regionSite.ts`) writes `notes` on each matched
  entry of the region's catalogue module, at every deploy, so every daily crawl keeps it. The crawl
  writes nothing for it. No UK file is written; the UK entries are only read.
- **The Notes tab and the note icons.** `scripts/bundle-region.ts` now builds each region's `notes`
  file (groups, icons, related notes, search spellings) and `noteIcons` lookup from the notes that
  region's page really ships (it reads the region's own data module the way the page reads it),
  where it used to write empty ones. The icons are the shared hashed copies under
  `/note-icons/h/`; on `/us/` and `/in/` the page's base is `/`, so the pictures are requested from
  there, never from a region copy (a test checks no `demo/us/note-icons` exists).
- **Note pages and search engines.** `/us/notes/<slug>` and `/in/notes/<slug>` open as on the UK,
  listing the region products with that note. As in the UK, individual note pages are not in the
  sitemap; `/us/notes` and `/in/notes` are (and have route pages), with their canonical in the
  region and no longer noindex (`demo/head.ts`). hreflang is not declared for Notes: it would
  change the UK's own sitemap and `notes.html`, which this change leaves as they were
  (`regionHasFixedPage` still says no for the beta regions' Notes, so the hreflang code is
  unchanged; add it later if wanted).
- **Counts** (page build of 9 Oct 2026): US 2,694 of 22,390 products show notes (12.0%), India 1,352
  of 14,594 (9.3%). The US Notes tab lists 1,652 notes (1,694 with the prose entries it hides) and
  the India tab 1,141 (1,166).
- **UK unchanged.** Built before and after: every UK data file, `sitemap-gb.xml` and the hashed note
  icons are byte for byte the same. The UK pages' HTML differs only by the bundled code (the credit
  line now reads `retailerName` first, which no UK note has).

### Left for later

- ~~Deals in the regions (read the shops' compare at prices in the region harvest).~~ Built 9 October 2026: see "Deals on the US and India sites" below; the numbers fill in with the next crawls.
- D24 for US and Indian shops: answered yes on 9 Oct 2026 (resolved, see Owner decision 5).
- The legal review (owner) before any affiliate programme or ad earns money there.
- The Supabase wishlist region columns (plan section 6, "Accounts"): saved fragrances and alerts
  are still UK prices; a US product saved from `/us/` is a product id the UK page may not have.
- ~~An 18 or over confirmation at sign up for Indian visitors (DPDP).~~ Done 9 October 2026: see below.
- ~~Notes for region products~~ (built 9 October 2026: see "UK notes on matching region products"); the guides in US terms (they are written for the UK site) are still to do.

### 18 or over at sign up in India (9 October 2026)

Owner decision, built the same day. On `/in/` pages, and for a visitor whose chosen country is
India, the create account form has a required checkbox "I am 18 or over"
(`demo/ageConfirm.ts`, wired in `demo/app.ts`). Without the tick, sign up stops with the site's
pop-up ("Please Confirm Your Age") and nothing is sent to Supabase. UK and US forms are unchanged,
and the sign in form never has it. Sign up and sign in are by email and password only (no social or
magic link path), so no other first sign in skips the form. Nothing is stored: no column, no
migration. Whether the DPDP Rules need a stored record is left to the owner and the legal review
(`docs/OWNER-STEPS.md`, section 10, step 3). Tests: `tests/ageConfirm.test.ts`.

### Deals on the US and India sites (9 October 2026)

Owner decision: make the US and India Deals tabs work. They were empty because the region crawl
dropped every shop's "was" price (`wasPrice: null` in `toRegionListings`). Not a live crawl: built
and tested on the committed snapshots.

**What the crawl keeps now.** The shop's own stated reference price, as published, in the
region's currency, on the listing as `wasPrice` (the neutral field the snapshot already had):
Shopify `compare_at_price` per variant, and on a JSON-LD page `listPrice`, a `highPrice` on a
single offer, or a `priceSpecification` typed ListPrice, strikethrough or MRP (India). The
adapters carry it as `RawListing.nativeWasPrice` beside `nativePrice`, only when the currency is
named, never converted, never guessed, never for a sterling shop (the UK keeps `wasPriceGbp` and
its output is unchanged). `regionWasPriceOf` stores it only above the price: a reference equal to
or below the price is no reference. An AggregateOffer's `highPrice` (the dearest size of a range)
is never read as a reference. `reconcileRegion` replaces it each read, so a shop that drops its
compare at price loses it at the next read.

**The rule is the UK's** (`docs/` guide "How deals are chosen", `scripts/build-deals.ts`),
run by the same code with the region's currency and formatter, not a copy:
`dealCandidateForOffer` and `buildDiscount` for the saving (worked from the price the page prints,
floored, under 1% no deal), `judgeWasPrice` for the shop's reference (only a reference the other
shops corroborate survives; a lone shop's word, or one far above what the others charge, is
withheld, so it can never make a deal), bottles only (no sets or oils), buyable offers only, never
a single house's own shop, cheapest qualifying offer per product. There is no house price to
anchor on in the regions, so every deal is against the shop's own MSRP (US) or MRP (India), named
by `localWords`. **One addition, region only, and it can only remove a deal:** where the shop's own
recorded prices for the bottle moved in the last 30 days, the price now must be below the highest
of them (`historyAllowsDeal`, `src/catalogue/regionDeals.ts`); a price that has just gone up is
not a deal. With no recorded movement (the history started on 9 Oct 2026) it has no say. Note the
UK has no history check and its code says it never infers a reference from history; none is
inferred here either.

**Files.** `data/regions/<us|in>/deals.json`, written by the same crawl step
(`scripts/build-region-catalogue.ts`, through `regionDealsFile`): the deals, the region's
currency and reference name, and the counts of listings with a reference price and of references
that survived the market check; `report.json` carries the same counts. Listed in
`scripts/generated-files.txt` (policy `incoming`, committed by `catalogue-us.yml` and
`catalogue-in.yml`). The pages' deals are built from the snapshots at deploy time by the one
function (`buildRegionSite`), so the file and the page cannot differ.

**The tabs.** Deals in the US shows `$1,299.00` and "MSRP"; in India whole rupees (`₹1,23,450`)
and "MRP"; the Beta line stays. A beta region with fewer than six deals (`REGION_MIN_DEALS`)
shows "Not many deals yet in the beta." above the real ones, or alone when there are none; nothing
is padded. The product has no Deals rail on the home page in any region (the home page has Most
Stocked only), so none was added.

**Counts as built (committed snapshots, 9 Oct 2026): US 0 deals, India 0 deals.** No listing in
either region's snapshots carries a reference price (0 of 22,390 US and 0 of 14,594 Indian
products), because the harvest dropped them; the tabs show the empty line. **What fills in:** the
next daily crawls (US 07:52 UTC, India 20:22 UTC) read the reference prices. Shopify shops fill in
at once; the sitemap shops (Ulta, Nykaa, AAR Fragrances) fill in as their pages are re-read
(unseen pages first, then the oldest). A deal also needs the bottle in three shops or more (a
reference needs two others to check it) so expect tens, not thousands, in the first days.

**UK unchanged.** `npm run deals:build` before and after: 4,024 deals, 875,439 bytes, identical
apart from the `DEALS_GENERATED_AT` line.

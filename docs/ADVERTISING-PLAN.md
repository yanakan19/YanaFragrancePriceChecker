# Advertising plan (AdSense review, then ads, then alternatives)

Written 6 Oct 2026. Plan only: nothing here is built yet unless it says
"already in place".

## Where things stand

- **The site has not been approved.** On 6 Oct 2026 AdSense confirmed the
  account (publisher `pub-6298711915135064`) is submitted and
  `pricesniffs.space` is **under review, which can take up to 4 weeks**. No
  ads run, and nothing in this plan assumes approval.
- **Already in place for the review** (and enough for it):
  - the verification tag `<meta name="google-adsense-account"
    content="ca-pub-6298711915135064">` in every page head (`demo/ads.ts`,
    `ADSENSE_CLIENT`);
  - `/ads.txt` reading `google.com, pub-6298711915135064, DIRECT,
    f08c47fec0942fa0` (built at deploy by `scripts/build-demo.ts`).
- **Already built but off:** three placements (`home` banner, `grid` tile,
  `product` block) in `demo/ads.ts` and `demo/adsRuntime.ts`. All three slot
  ids in `AD_SLOTS` are blank, so no ad markup, no ad style, no Google script
  and no request. `?adpreview=1` draws labelled frames only.
  Note: the grid tile is **not** every 8 tiles. It is a random gap of 8 to
  12 (about every 10), the first after 16 to 20 tiles, seeded by the list's
  address. Tests: `tests/ads.test.ts`, `tests/adsPolicy.test.ts`,
  `tests/adPreviewBrowser.test.ts`.
- **Consent:** planned as Google's own certified CMP ("Privacy & messaging",
  IAB TCF), served by the ad script; until it answers, ads are requested non
  personalised (`docs/OWNER-STEPS.md` 5b).

### What the review needs, and what it does not

| Item | Needed for review? | State |
|---|---|---|
| Verification meta tag | Yes (one of: meta tag, ad code snippet, ads.txt) | Done |
| ads.txt | Not required for approval, but Google checks it and it should be live before ads | Done |
| AdSense ad code (`adsbygoogle.js`) on the page | **No.** The meta tag verifies the site. Do not add it during review | Not loaded, keep it so |
| Ad unit ids, ads showing | No. Ads only after approval | Blank, keep them blank |
| Consent message (CMP) | No for approval; **yes before the first ad is served** to UK/EEA visitors | Owner publishes it in Phase 2 |
| Auto ads off | Not for review; it stops Google placing ads itself later | Owner step 5a.4 |

Only if Google's review page says it cannot find the code should the owner
paste its exact message to an agent; the fallback is then the snippet alone,
with Auto ads off and no units, still with no ads shown.

---

## Phase 1: pass the review (now to about 3 Nov 2026)

Nothing in Phase 1 shows ads or loads Google's ad script.

### Rejection risks, most likely first

| # | Risk | Why it applies here | Fix before or during review | Who |
|---|---|---|---|---|
| 1 | **"Site down or unavailable" / pages unreachable** | GitHub Pages serves every deep link (`/about`, `/about/legal`, every product, brand and shop page) through `404.html`, so each one answers **HTTP 404** with the full app inside (`docs/ROUTING-PLAN.md` 3.2). Only `/` answers 200. A reviewer's crawler that follows the About, Contact or Privacy link gets a 404 status. | Build real files for the pages Google asks about: `about.html`, `about/legal.html`, `about/bot.html` (copies of the shell, 0.93 MB each), which Pages serves at `/about`, `/about/legal`, `/about/bot` with status 200. Check with `curl -I` after deploy. Each new file goes in `scripts/generated-files.txt` and `.gitignore` as a deploy file. **Done 2026-10-07:** `scripts/build-route-pages.ts` writes a page for every list route and every fixed sitemap address (16 files, `docs/ROUTING-PLAN.md` 3.2); check with `curl -I` after deploy. | Agent |
| 2 | **"Low value content"** (the commonest refusal) | 27,800 sitemap pages are generated from shop data with one template; many are sizes of the same scent; shop descriptions are copied text. The reviewer sees a price list, not writing. | Add a small amount of plainly original content and link it from home and the footer: a "How we check prices" page (the method, delivery included, how often), 3 to 5 short buying guides (for example "Is a gift set cheaper than the bottle?", "Tester vs retail", "Best time to buy in the UK", from `docs/CONTENT-PLAN.md`), and a one line original summary on each set and oil page (what is in the set, saving vs the bottle alone) which `docs/GIFT-SETS-AND-OILS-PLAN.md` already computes. Do not mass rename, delete or noindex product pages during review: churn looks worse than thin pages. | Agent builds; owner writes or approves the guide wording |
| 3 | **Empty page without JavaScript** | `<main id="view">` in `demo/template.html` is empty; all text comes from 930 KB of script plus 3.2 MB of data. A crawler that does not wait sees nothing. | Add a `<noscript>` block and a short static intro in the template (what PriceSniffs is, links to About, How we check prices, Legal, Contact, top brands) as real `<a href>` links. Safe for `404.html` because the app replaces it on boot. | Agent |
| 4 | **Navigation, About, Contact** | About exists, with a Contact Us form (`#contact`) and the Legal Notice's Contact section; email `yannysniffs@gmail.com`. Contact is not a page of its own. | Give the footer a visible **Contact** link to `/about#contact` and make sure About, Legal, Privacy and Contact are all one click from every page. A separate `/contact` route is optional. | Agent |
| 5 | **Copied or scraped material** | Product photos and descriptions come from shops and feeds. | Keep shop names and links on every copied description ("from the shop's listing"); prefer feed images (Awin) where licensed. Not worth a rebuild during review. | Leave unless refused |
| 6 | **Ad placement near affiliate links** (later policy risk, not a review item) | Price rows and shop buttons are affiliate links; an ad mistaken for one, or placed where a tap meant for a shop lands on it, is "encouraging accidental clicks". | Already designed out: no ads in the price rail, price boxes or offer rows; product block sits under the whole price list, labelled "Advertisement", dashed frame. Keep it that way. | None now |
| 7 | **Too new, too little traffic** | Google does not publish a traffic bar but refuses sites it considers "not ready". | Keep shipping visible updates (the changelog does this) and keep the crawl running. Nothing to build. | None |
| 8 | **Self clicks, altered code, pop ups** | Account level risk. | Owner never clicks or previews live ads; nobody edits Google's code; the site has no pop ups and should add none. | Owner |

Already fine, no work: `/ads.txt`; meta tag; privacy notice at
`/about/legal#privacy` with cookies section; sitemap lists priced pages only
and product pages with no prices are `noindex` (`demo/head.ts`);
`/search` and `/design` are `noindex`; HTTPS; ad slots off.

### Build before approval vs leave

- **Build now (small, no ads):** risks 1, 3 and 4; the "How we check prices"
  page; the set/oil summary line; 3 to 5 guides. One change log line for the
  new guides page only, since a visitor sees it.
- **Leave until approval:** slot ids, the consent message, the ad script,
  any change to placements, Premium, prerendering all 27,800 pages (the full
  fix for risk 1, about 25 GB of shell copies at today's size; it needs the
  data split first and is not a review blocker).
- **Do not do during review:** change URLs or noindex rules in bulk, add
  Auto ads, add an own cookie banner, add pop ups or interstitials.

### If refused

The owner pastes Google's reason word for word to an agent. Fix that reason
only, wait at least a week of visible updates, then request review again
(**Sites** → the site → **Request review**). Two refusals for "low value
content" means switch to the affiliate first fallback (section 4) for a
month while content grows.

---

## Phase 2: only after Google says "Ready"

### Order of switching on

1. Owner publishes the consent message (OWNER-STEPS 5b) and checks Auto ads
   are off.
2. Owner creates the units and sends the ids; agent fills `AD_SLOTS`,
   `ADS_SWITCHED_ON` and rebuilds. The legal pages gain their advertising
   wording from the same switch.
3. Switch on in stages, one week each, so each step's effect on shop clicks
   and speed shows: **product block first** (below the prices, least risk to
   the shop click), then **grid**, then **home banner**.

### Placement rules (keep the experience and Core Web Vitals)

- **No ad in the first screen on a phone.** Grid and product already meet
  this. The home banner sits under Most Stocked; agent checks at 390x844
  with `?adpreview=1` and, if any of it shows in the first screen, adds a
  test and moves it lower. Never in hero, top bar, price rail, price boxes,
  offer rows, emails or posts (already enforced).
- **Lazy:** script loads after page load and idle; a slot is filled only
  within 400px of the screen (already built).
- **Layout shift budget:** ads add CLS of at most 0.02. Each slot reserves
  a fixed height before fill (home 90/100px, product 280px, grid the tile
  box) with `overflow: hidden`, so a creative cannot push content.
- **Speed budget:** first visit already transfers 4.45 MB and first tiles
  take 2.20 s on a slowed Pixel 7 (`docs/GIFT-SETS-AND-OILS-PLAN.md` 4.3),
  over a sensible budget. Ads must not move "first tiles" by more than 5%
  or add bytes before first tiles; add an ads on run to
  `npm run perf:load`. Cutting the base weight (lazy loading set fields,
  the price history already lazy) comes before adding more ad units.
- **Manual units, Auto ads off.** Auto ads would put units in the price rail
  and above the prices; that risks accidental clicks next to affiliate links
  and costs shop clicks. Revisit only Auto ads' "anchor" format on desktop,
  as a test, never on phone.
- **Density cap:** at most one product block per page, one home banner,
  grid about 1 in 10. No new placements in the first 3 months.

### Measuring RPM per page type (privacy safe)

- **Revenue per type:** each placement is its own ad unit, so AdSense's
  "by ad unit" report gives earnings per type. For finer grain, create
  separate grid units for search, brand, shop and deals lists (a small
  change: `grid` slot id chosen by list kind).
- **Views per type:** the owner dashboard (`/developer`) reads
  `site_page_views` (hour, page path, country, referrer host; no person).
  Group paths into home, product, brand, shop, search, deals, other.
- **Page RPM** = unit earnings / views of that type x 1000, done monthly by
  the owner in a sheet. Store nothing from AdSense in the site's database
  (`docs/TRACKING-AND-STORAGE-STRATEGY.md`).
- **Shop click guard:** `site_shop_clicks` gives clicks per product and shop
  per hour. Track shop clicks per 1,000 product page views before and after
  each stage.

### A/B tests without tracking people

- Split by **page, not person**: a hash of the canonical path picks the arm
  (the way `adPositions` already seeds grid gaps), so no cookie, no id, no
  consent needed for the split. Or split by **week** (on, off, on).
- First test: product block on for half the products, off for the other
  half, four weeks. Compare shop clicks per 1,000 views. **Rule: if the
  block cuts shop clicks by more than 5%, and the ad earns less than the
  lost commission, it comes off.**
- Second test: grid gap 10 vs 14 on the list pages.

---

## 3. Revenue model (estimates, not promises)

Assumptions, stated plainly; replace with real numbers after month one:

- UK display **page RPM £1 to £4** on AdSense for a shopping site with three
  units and a mostly phone audience; £2 as the middle case.
- 3 page views per visit.
- Affiliate: 2% of visits click to a shop, 3% of those buy, £45 basket, 5%
  commission (varies by shop and network, see `docs/AFFILIATE_SETUP.md`).
  That is about **£1.35 per 1,000 visits, about £0.45 per 1,000 page
  views**.

| Monthly page views | Ads at £1 / £2 / £4 RPM | Affiliate (assumed) |
|---|---|---|
| 10,000 | £10 / £20 / £40 | about £5 |
| 50,000 | £50 / £100 / £200 | about £22 |
| 250,000 | £250 / £500 / £1,000 | about £112 |

AdSense pays once the balance reaches £60. At low traffic, months can pass
before the first payment.

**Interplay with the shop click.** Per page view, ads probably earn more
than affiliate commission on these assumptions, but the shop click is the
site's purpose and the reason people return. An ad that takes a shop click
is worse than it looks: it removes a commission and teaches the visitor the
site is less useful. Hence: never between the visitor and the prices, and
the test rule above.

**Premium (ad free).** Planned at £0.99 a month or £10 a year
(`docs/ACCOUNT-PREMIUM-PLAN.md`), about 77p and £9.58 after Stripe fees. A
heavy user of 100 page views a month is worth about £0.20 a month in ads at
£2 RPM, so the price covers the ads given up several times over; keep it.
Launch Premium only after ads have run for at least a month, so "ad free"
is something visible.

---

## 4. Alternatives, if refused or alongside

- **Affiliate first (fallback, always on):** the site already earns this
  way. If refused, put effort into more shops on affiliate programmes,
  deal alerts and the guides from risk 2, and reapply later.
- **Other networks:** Ezoic (lower entry bar, can run with or without
  AdSense approval), later Mediavine or Raptive once traffic meets their
  published minimums (OWNER-STEPS 5f). Each brings its own ads.txt lines
  and script; the same placements, labels and consent rules apply. Avoid
  networks that need pop unders, auto playing video or in text links.
- **Shopping specific:** retailer "sponsored listing" deals through Awin
  or direct, paid per click, shown as a separate labelled row, never in
  the price ranking.
- **Direct sponsorship of brands or shops:** a "Featured" placement on the
  home page or a brand page, sold for a flat monthly fee. Rules under the
  CAP Code (ASA) and CMA guidance on online ranking and the DMCC Act 2024:
  - labelled **"Ad"** or **"Sponsored"** at the top, visible before
    interaction, not only in small print;
  - never changes the price order or the "Cheapest" label; sits outside
    ranked lists;
  - a sponsored shop's offers are shown at the same price as anyone else's;
  - a written note in the Legal Notice of what paid placement exists;
  - no fake reviews or "best" claims for a payer.
  The Contact form's "A Promotional Enquiry" type is the inbound route.

---

## 5. Order of steps and timeline

### Weeks 1 to 4 (6 Oct to 3 Nov 2026): the review

| Week | Owner | Agent |
|---|---|---|
| 1 | Check AdSense **Sites** shows the meta tag verified and ads.txt found; turn Auto ads off (OWNER-STEPS 5a.4); do not click anything ad related on the site | Real 200 files for `/about`, `/about/legal`, `/about/bot`; `<noscript>` and static intro with links; footer Contact link. Confirm statuses with `curl -I` after the deploy |
| 2 | Approve or write the "How we check prices" text and pick 3 to 5 guide topics | Build the "How we check prices" page and the guides route; link from home and footer; one change log line |
| 3 | Read the guides once for tone | Set and oil summary lines; check the sitemap includes the new pages |
| 4 | Wait for Google's email; if refused, paste the reason | Fix only the stated reason; no ad work |

### After approval: first 3 months

| When | Owner | Agent |
|---|---|---|
| Day 1 | Publish the consent message (5b); create the product unit and send its id | Fill the product slot and `ADS_SWITCHED_ON`; legal wording follows; perf run with ads |
| Week 2 | Create grid units (one per list kind if wanted) | Switch on grid; product block A/B test by path hash starts |
| Week 3 | Create the home unit | Switch on home banner after the first screen check |
| Month 1 end | Note earnings per unit; read shop clicks on `/developer` | RPM per page type sheet layout; decide the product block from the test rule |
| Month 2 | Decide Premium launch date | Build Premium's ad free switch (`adsAllowedForViewer`) per ACCOUNT-PREMIUM-PLAN |
| Month 3 | Decide on Ezoic or direct sponsorship from real RPM and traffic | Second test (grid gap); tidy budget breaches |

If refused at the end of week 4, run the content work for another 2 to 4
weeks with affiliate first, then reapply.

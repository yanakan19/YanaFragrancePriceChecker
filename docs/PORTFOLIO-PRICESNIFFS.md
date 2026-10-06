# PriceSniffs: portfolio write-up

**Ur Koppan, trading as YannySniffs**
Live site: https://pricesniffs.space
Source: a single TypeScript repository on GitHub, deployed with GitHub Pages.

Every figure below was measured from the repository on 6 October 2026 (the
catalogue build of 16:59 UTC that day), unless another date is given. Each
section says plainly what is **built** and live, and what is **planned** only.

---

## 0. How this was built (read this first)

I built PriceSniffs by **directing AI coding agents (Claude Code)**, not by
typing every line myself. My role was that of product owner, system designer
and engineering manager for a team of agents:

- **Briefing:** writing each task as a precise brief with the goal, the
  constraints, the files involved and what "done" means.
- **Queueing:** keeping a backlog and an execution plan, splitting work into
  phases, and running several agent sessions side by side on one branch.
- **Reviewing:** reading diffs, measurements and incident write-ups, and
  sending work back when a claim was not backed by a number.
- **Deciding:** owning every product, legal and spending decision, recorded in
  a numbered decision log (D1 to D28) so agents and people follow the same
  rules.
- **Setting the rules of the house:** a `CLAUDE.md` file that every agent must
  obey (how to push, what never to commit, how to write the update log), plus
  tests that enforce those rules mechanically.

The commit history reflects this honestly. Of 2,237 commits on the live branch
(1 August to 6 October 2026), about 1,367 were made by the automated pipeline
(GitHub Actions bots), 821 by Claude Code agent sessions working to my briefs,
and 49 under my own identity.

---

## 1. Overview, problem, audience and business model

### The problem

UK fragrance prices vary widely between shops, and the headline price is
rarely what you pay: delivery charges, free delivery thresholds, "was" prices
and stock all change the answer. Existing comparison sites often ignore
delivery, mix up sizes and strengths, or show stale prices.

### What PriceSniffs does (built)

A UK fragrance price comparison site that ranks offers by the **price you
actually pay, delivery included**, from the shops' own live listings, refreshed
several times a day.

Catalogue size in the 6 October 2026 build:

| Measure | Value |
|---|---|
| Products | 27,098 |
| of which bottles (fragrances) | 23,934 |
| of which gift sets | 2,752 |
| of which perfume oils and attars | 412 |
| Distinct scents (brand, name and strength, ignoring size; sets excluded) | about 17,100 |
| Brands | 1,034 |
| Shop offers (listings with a price) | 46,841 |
| Shops supplying offers | 42 |
| Retailers assessed in the registry | 74 (42 enabled) |
| Fragrance houses harvested direct from their own storefronts | 33 (2,892 products) |
| Products stocked by two or more shops (a real comparison) | 8,482 |
| Products with a manufacturer barcode (EAN) | 11,012 |
| Products with a photo | 26,657 (98.4%) |
| Products with a note pyramid | 11,079 |
| Distinct scent notes in the Notes index | 5,290 |
| Price change points in the price history | 139,367 |
| Current "Today's Deals" | 3,237 |
| Pages in the sitemap | 27,832 |

### Audience

UK shoppers buying designer, niche and Middle Eastern fragrances, mostly on
phones. The site is responsive, installable as a web app, and has native app
shells for iOS and Android (section 2).

### Business model

| Stream | State |
|---|---|
| **Affiliate links** (Awin, an in-house programme; CJ and Partnerize researched) | **Built and live.** 6 programmes active; 19 applications pending; links "fail open" to the plain shop link when a programme is not live, so a broken tracking link never loses the visitor. Affiliate disclosure page live. |
| **Display advertising** (Google AdSense) | **Built but switched off.** Three ad placements exist in code with blank slot ids; the site is under AdSense review. A written plan covers layout shift and speed budgets, no ads in the first phone screen, consent, and A/B tests. |
| **Premium plan** (ad free browsing plus email and push alerts, £0.99 a month or £10 a year) | **Planned.** Phase 1 of accounts is built; payment is not. |
| **Stripe** (Checkout and customer portal) | **Planned.** A setup guide is written; no payment code exists yet. |

A revenue model with stated assumptions (page RPM range, click through and
conversion rates) is in `docs/ADVERTISING-PLAN.md`, labelled as estimates.

---

## 2. Architecture

```
                         ┌──────────────────────────────────────────────┐
                         │  Retailer registry (src/config/retailers.ts) │
                         │  74 shops: adapter, delivery rules, currency,│
                         │  affiliate status, image basis, crawl pace   │
                         └──────────────────────┬───────────────────────┘
                                                │
  GitHub Actions "Catalogue crawl" (ticks at :15 and :45 every hour,
  a guard job decides which tick does real work)│
                                                ▼
 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
 │ Sitemaps     │  │ Shopify      │  │ Awin product │  │ JSON-LD / page│
 │ (gz aware)   │  │ products.json│  │ feeds        │  │ data, owner   │
 │              │  │              │  │              │  │ saved pages   │
 └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘
        └─────────────────┴────── PriceSniffsBot ─────────────┘
                     (robots.txt first, per shop request gap)
                                     │
                                     ▼
        Raw snapshots, one JSON file per shop (data/catalogue/, 51 files)
        reconcile: first seen, relisted, delisted only on a complete walk
                                     │
                                     ▼
        Normalise: brand, name, size, strength, gender, sets, oils, notes
        Match: GTIN checked barcodes, word set names, size voting,
               id aliases, append only product slugs
        Judge: was price credibility, currency quarantine, 7 day freshness
                                     │
                                     ▼
        Generated TypeScript modules (demo/*.generated.ts), deals,
        price history (git history replay with a checkpoint)
        committed by the crawl through scripts/commit-and-push.sh
                                     │
                                     ▼
        "Deploy site" workflow: a decide job checks whether the page can
        have changed, then npm run demo builds and CHECKS the page:
        tsc + esbuild bundle, data moved to content hashed JSON files,
        sitemap, ads.txt. Nothing is uploaded unless every check passes.
                                     │
                                     ▼
        GitHub Pages at pricesniffs.space (custom domain)
        Service worker: network first page, cache first hashed data
                                     │
              ┌──────────────────────┴───────────────────────┐
              ▼                                              ▼
   Browser app (vanilla TypeScript)               Supabase (Postgres)
   routing, filters, charts, wishlist   ◄──────►  Auth, profiles, wishlists,
                                                  price alerts, avatar storage,
                                                  site stats, Row Level Security,
                                                  pg_cron compaction
                                                         │
                                                         ▼
                                   Daily "Price alerts" workflow emails price
                                   drops through Resend

   Capacitor 8 shells (apps/ios, apps/android) load the live site, so every
   deploy reaches the apps without a store update.
```

### Where Cloudflare fits (accurate as built)

- The site itself is served straight from GitHub Pages, **not** behind
  Cloudflare. Putting it behind Cloudflare (Bot Fight Mode, rate limits) was
  assessed in `docs/SCRAPING.md` and deliberately deferred.
- Supabase's API sits behind Cloudflare, and the visitor counter uses the
  country header Cloudflare adds there, so no IP address is ever stored.
- A Cloudflare Worker was built for a chat assistant (decision D21) and later
  removed with the assistant on the owner's decision (D22).

### Mobile apps

- **Built:** Capacitor 8 projects for iOS (Swift, Swift Package Manager) and
  Android, bundle id `space.pricesniffs.app`, a branded offline page, safe area
  handling, a distinct user agent, and a CI workflow (`apps-build.yml`) that
  builds both and leaves a test APK.
- **Planned:** store submission (needs the owner's Apple and Google developer
  accounts) and native push notifications for Premium.

---

## 3. Data collection

### Retailer registry

`src/config/retailers.ts` is a typed registry of 74 shops (42 enabled). Each
entry records, among other things:

- the **retrieval adapter** and route: sitemap walk, Shopify `products.json`
  (18 Shopify shops), Awin affiliate feed (3), JSON-LD product pages, shop
  specific readers (John Lewis page data, Selfridges server components, Beauty
  Bay's API), headless rendering, and an **owner import** of saved pages (used
  for Notino, see below);
- **delivery rules**: standard rate (`number | null`, where null means "never
  published", which is different from 0, "always free"), free delivery
  threshold, cheaper rate over a spend, delivery days, minimum order, the
  source quote and the date read, and a `confirmed` or `unverified` confidence
  (44 confirmed, 30 unverified);
- **currency** (only sterling prices are accepted; a separate list names shops
  whose currency is unconfirmed);
- **affiliate** network, status and link template;
- **image basis** (why we may show its photos), tiers (designer, niche, Middle
  Eastern) and `singleBrandOnly` for 14 brand storefronts.

The header's counts are asserted by `tests/registry.test.ts`, so the
documentation cannot drift from the data.

### Polite, identified crawling (built)

- **One honest identity.** Every request carries
  `PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)`.
  `assertBotIdentity` refuses any request with a browser user agent or
  browser only headers (`sec-ch-ua*`, `sec-fetch-*`), and a test scans every
  source file for a browser user agent.
- **robots.txt per RFC 9309**: a 5xx or network error means "assume full
  disallow"; a 404 or 403 on the file means "no restrictions stated" (getting
  this backwards had silently disabled five shops). Crawl-delay is honoured.
- **Rate limiting**: a per shop minimum gap between requests, plus any
  robots.txt delay; eight shops in parallel, never several requests at once to
  one shop; a 40 minute ceiling per shop; five failed pages in a row stop a
  shop. Barcode reads from one shop are capped at 450 per run with a 3 second
  gap, and any 401, 403, 407, 429 or 503 stops them for 6 hours.
- **Fair scheduling**: a harvest cursor asks the longest unvisited shops
  first, after measuring that a fixed order starved the last eleven shops
  every run.
- **A refusal is never worked around** (D23): no browser disguise, no
  residential proxy, no captcha solving. The paid Apify proxy and browser tiers
  are switched off in code (`METERED_TIERS_ENABLED = false`), with a hard
  per run request ceiling kept in code for safety.

### Excluded shops, and why

- **Notino UK**: every request has met a Cloudflare challenge since 11
  September 2026. It is disabled, its old offers aged off under the 7 day
  rule, and `docs/NOTINO-PLAN.md` ranks only lawful routes back (its CJ
  affiliate feed, a permission request, or owner saved pages).
- **Fragrantica** is not used for search or notes (D26): its robots.txt and
  terms refuse automated access, and notes and reviews are protected as a
  database and as copyright under UK law. Only links to its pages are shown.
- **TikTok Shop** is excluded by default (D8); decants are out (D9).

### Delivery data

Delivery cost is the main sort key, so it is treated as the most dangerous
field. A discovery tool reads shops' own delivery pages and **reports**
candidate figures with the exact sentence they came from, but never writes
the registry; a person confirms them. Its first live run produced three wrong
answers (a spend condition, a live basket widget, a header basket total of
£0.00), each now a regression test using the verbatim sentence. A monthly
workflow re-checks delivery terms, and `npm run shipping:staleness` lists the
rules due a re-check. Membership schemes (Boots Advantage, Selfridges+ and so
on) are recorded but never priced in.

### Freshness rules (built)

- An offer not confirmed for **7 days** (`HIDE_OFFER_AFTER_DAYS = 7`) is hidden.
- Every harvest writes, per shop, how many shown prices are over 24 and over
  48 hours old; a freshness check fails the step when prices age.
- Each shop row on a product page shows how long ago it was checked.

### Failure handling

- A partial or failed walk is never treated as "everything is gone": delisting
  only happens when the walk completed, or on a 404, 410 or redirect.
- A shop that returns zero priced listings writes nothing.
- A currency quarantine survives later harvests (after one routine harvest
  restored 8,104 wrongly scaled prices 90 minutes after they were cleared).
- Each periodic stage has its own timeout and commits on its own, so one
  failing shop or feed cannot lose a finished harvest.

### Legality and ethics

Recorded as decisions in `docs/DECISIONS.md` and the legal pages:
robots.txt obeyed; honest bot identity with an explanatory page and an opt
out; images hot linked from the shop's own server, never copied or edited
(D24), with any shop's request to stop honoured by removing one line; no
working around blocks; our own robots.txt turns away AI training crawlers by
name.

---

## 4. Data engineering

### Normalisation (built)

- **Brand**: variants grouped on letters and digits only, display spelling
  chosen by preferring mixed case over capitals with frequency only as a tie
  break ("ARMAF" 195 times to "Armaf" 12 still shows "Armaf"; DKNY and YSL keep
  their capitals). Known merges such as Bulgari and Bvlgari.
- **Name**: strength, edition and shop labels stripped from the display name.
- **Size**: millilitres from the title, the URL, the product page, and ounce
  conversion; a product whose own titles disagree about its size is flagged
  rather than guessed.
- **Strength**: concentration from the title, the product page, and evidence
  rules for shops that leave it unstated.
- **Gender**: only where a source states it (2,707 products tagged).
- **Text repair**: a mojibake repair for snapshots at rest.

### Entity resolution and matching (built)

- **Barcodes first, but only real ones.** A GTIN check digit test decides
  whether a shop's `ean` field is a barcode. One shop's "EANs" passed at 9.2%,
  the rate random digits pass, against 85.7% to 100% at every other shop, so
  its internal ids lost the right to block merges.
- **A barcode that vouches for two products gets no vote**: 19 codes were
  found printed on two different products in one shop's own feed.
- **Name matching**: same house, same size, same strength and the same **set**
  of words (order ignored). It refuses when two real barcodes disagree, which
  keeps pairs like Calvin Klein IN2U for Him and for Her apart even when a shop
  gives them identical titles.
- **Size voting**: where shops disagree about a barcode's size, each shop
  casts one vote; a lone shop outvoted by two others is read at the settled
  size.
- **Id aliases**: when products merge, the old id is remembered
  (`data/id-aliases.json`, 12,072 aliases) so history and wishlists follow it.
- **Append only slug memory**: every product has a permanent address
  `/<brand>_<name>_<volume>` (for example `/creed_aventus_100ml`), stored in
  `data/product-slugs.json` (29,102 slugs). The build only adds and never
  reassigns a slug (tested), so a published link never breaks.
- **Near miss report**: `npm run match:report` ranks pairs the strict matcher
  left apart, for a person to review. It never merges.

The first name matcher alone folded 225 listings into existing products and
raised products with more than one shop from 144 to 332 at the time.

### Sets and oils (built)

- Gift sets became their own category on 3 October 2026, with their contents,
  the main bottle size, and set matching across shops.
- Oils are recognised only when a listing says so in words ("perfume oil",
  "attar"), never from the bare word "oil", which 643 harvested titles use for
  body, hair and face oils. Format (roll on, dropper) and "alcohol free" are
  set only when a shop wrote them.

### Notes (built)

Note names are cleaned of emoji, zero width spaces, trademark marks and stray
HTML; merged only when they differ in case, spacing, symbols or accents
("Oak Moss" and "Oakmoss"), never across variants ("Madagascan Vanilla" stays
apart from "Vanilla"). One shop's whole pyramid is shown, chosen by tiers
filled, then note count, then source order with the fragrance house first, so
"As published by" is true of every note.

### Image pipeline (built)

- Photos are hot linked from each shop's own image host, never rehosted.
- `pickImage` ranks candidates: bottle only photos over boxed ones, larger
  over smaller (under 300 pixels on the long edge gives way), one shop's
  thumbnails as a last resort.
- A Pillow based classifier measures a photo's foreground aspect ratio to
  detect a box beside the bottle, validated on 46 hand labelled photos with one
  false positive; ambiguous photos are left alone.
- Image header reads measure size from the first 64 KB; a daily workflow
  re-measures; a daily link check reports dead images.
- A "better photos" pass found 1,635 larger pictures for 1,749 listings that
  had a thumbnail or no photo, by reading the shop's own product page.
- A brand logo registry with each logo checked by eye, an 8 KB per file budget
  enforced by a test, and an initials tile where no logo is verified.

### Generated files and `writeGenerated`

`scripts/generated-files.txt` is the single list of every file a build or
workflow writes, with a policy per path: `rebuild` (rebuilt from inputs, never
merged on conflict), `incoming` (machine data, the pushed side wins),
`manual`, and `deploy` (built at deploy time, never committed). Builds write
only through `writeGenerated`, which refuses an unlisted path; tests check the
list against every workflow and against a real rebuild in a scratch copy.

### Snapshot storage and compaction

- One JSON snapshot per shop (51 files, 137 MB on disk).
- "Last seen" written once per run instead of per listing: snapshot growth on
  one day fell from 2.64 MB to 0.48 MB with byte identical site data.
- The generated catalogue writes each shop's fetch time once and one entry per
  line: 43.3 MB to 34.6 MB, byte identical page.

### Price history and its checkpoint

Price history is rebuilt by **replaying git history**: every commit that
touched the snapshots (560 so far), with each commit's date as the point's
time. When the replay grew past its 10 minute timeout and wedged the branch
for a day (D20), it was made resumable: a checkpoint holds the fold's state,
a fingerprint of the modules that define a price point forces a full replay
when the rules change, and a test proves resuming gives byte for byte the same
output as a full replay. Version 3 of the checkpoint cut it from 15.9 MB to
5.0 MB by reading its history back from the generated module, checked by hash.

### Repository size engineering

- Measured daily growth by path with `git pack-objects` and `verify-pack`:
  content hashed data files took a new name each build and defeated git's
  delta compression (32.8 of 60.5 MB added on 4 October 2026).
- Fix: the page and its data are now built at deploy time and never
  committed, cutting a busy day from 40 to 60 MB to about 13 to 14 MB.
- On 6 October 2026 the owner chose a one off history rewrite to drop the old
  page files: 643 MiB to 392 MiB packed, with the tip tree and the price
  history checked byte identical, the old tip kept on a backup branch, and an
  old to new commit map published in `docs/`. The written recommendation (D27)
  had been against it; the decision and its risks are both on record.
- The push script refuses a file over 95 MiB and warns over 50 MiB.

---

## 5. Statistical and analytical work

| Work | State | Detail |
|---|---|---|
| Price history | Built | 139,367 change points; one point per day for charts with a carry forward rule, broken by an explicit gap when every listing is unavailable; three distinct "no chart" messages (never priced, only ever sold out, not enough points). |
| Was price credibility | Built | Measured 12,190 offers claiming a reduction. Against other shops' stated RRP for the identical bottle (n = 5,391): median ratio 1.000, p75 1.062, p95 1.489. Three tests: the house's own price as a ceiling on its own RRP; at least 2 other shops must supply evidence; a claim more than 1.25 times the highest RRP others state is refuted. |
| Deals detection | Built | A deal is the cheapest **buyable** offer with a corroborated reduction, worked from the delivered price, deepest first. The buyable test removed 509 of 2,385 deals that were out of stock. The social Deal of the Day post rotates brands. |
| Price per ml and volume bands | Built | A price per ml sort and volume bands on list pages. |
| Size voting | Built | One vote per shop per barcode; lone outvoted shops corrected. |
| Outlier and error handling | Built | Currency quarantine, price scale checks, house ceiling, weekly price verification against live pages. |
| Matching confidence | Built | GTIN validity measured per shop; strict merge rule; near miss report for human review. |
| Photo coverage | Built and measured | `npm run photos:coverage`: products with a photo went from 14,394 to 26,284 of 26,702 after the image basis decision (D24). |
| Load performance | Built and measured | See section 6. |
| Delivery confidence | Built | Per shop confidence report and staleness listing. |
| Site analytics dashboard | Built (owner switches it on) | Page views, visits, countries, referring sites and shop clicks, counted as hourly totals with no cookie and no identifier; Hour, Day, Week, Month and Year views; nightly roll up of old rows (section 8). |
| Price alert rules | Built | A drop of at least 5% or £2, whichever is larger, or crossing the reader's own target. |
| Strategy scoring | Built (used by the probe) | A multi armed bandit ranks retrieval strategies per shop by success and yield, chosen over a neural network in writing because there are a dozen shops and no training set. |
| A/B testing | Planned | Split by page hash or by week, not by person, so no cookie or consent is needed. First test: product page ad block on half the products for four weeks, removed if shop clicks fall more than 5% and the ad earns less than the lost commission. |

---

## 6. Front end

- **Vanilla TypeScript**, no framework: `tsc` then **esbuild** (minified IIFE,
  ES2020). The bundle is 722 KB minified, about 205 KB gzipped. The main view
  module, `demo/app.ts`, is 8,255 lines.
- **Data as JSON, not JavaScript**: the build moves large data literals out of
  the bundle into content hashed JSON files, because measured on a slowed
  phone the browser spent about 2 seconds compiling them as JavaScript. Price
  history and products with no current price load lazily.
- **Routing**: a History API router with clean addresses for products
  (`/creed_aventus_100ml`), brands, notes, shops, deals, sets, oils, account
  pages, a bot page and legal pages; Back works at every depth; a 404 page
  that is a copy of the app so deep links work on GitHub Pages.
- **Filters**: faceted filters (volume, strength, price band, type, on sale,
  in stock) where an option only appears if it has results, and its count
  respects every other group but not its own. Several can be ticked at once,
  shown as chips.
- **Long lists**: no caps; lists render 48 tiles at a time with an
  IntersectionObserver and use `content-visibility: auto` so off screen tiles
  cost little.
- **Accessibility**: axe-core runs in the test suite against eight routes in
  both colour schemes with WCAG 2.0 and 2.1 A and AA tags plus best practice,
  failing on every impact level; colour contrast is also tested from the design
  tokens.
- **Responsive and Safari**: a phone first layout; a WebKit (iPhone 13
  settings) workflow runs the layout and filter tests in Safari's engine.
- **Dark mode**: light, dark and system themes from CSS tokens.
- **SEO**: 27,832 page sitemap, per page titles and descriptions, link
  previews, a robots.txt that admits search engines.
- **PWA**: web manifest and icons; a service worker that is network first for
  the page (a visitor never sees yesterday's prices while online) and cache
  first for the hashed data files, pruning old builds.
- **Performance budget**: measured with a Playwright script that serves the
  build the way GitHub Pages does, on a Pixel 7 viewport with the CPU slowed
  4 times. Baseline of 5 October 2026: first tiles at 2.20 s, first paint at
  0.20 s, 3.22 MB by first tiles; a repeat visit downloads almost nothing
  (0.0 to 0.1 kB) thanks to the service worker; 4.25 s on throttled 4G. Proposed
  limits for later work: no more than 5% slower and 2% heavier. The catalogue
  has since grown, and a later measurement on a busier machine showed 4.3 MB
  by first tiles; the lever to cut it (a lazy file for set data) is
  documented.

---

## 7. Quality engineering

- **Tests**: 236 test files and **4,822 tests** at the last full run (Vitest).
  Test code is about 51,700 lines, more than the application source.
- **Browser tests**: 33 test files drive a real browser through Playwright
  (Chromium, and WebKit in CI), including accessibility, filters, layout,
  account pages, cross links and the ad preview.
- **Tests against live data**: rules checked against the real catalogue, for
  example that the registry header's counts match the array, that a product
  count is never computed two ways, that deals are buyable, that slugs and
  aliases only ever grow, and that the update log keeps its format limits.
- **Workflow rules as tests**: every committing workflow must push through
  `scripts/commit-and-push.sh` and share a concurrency group with any workflow
  that commits the same files; every job and step has a timeout.
- **13 GitHub Actions workflows**: the catalogue crawl, deploy, fragrance
  links, image link check, image measuring, weekly price verification, monthly
  delivery re-check, daily price alerts, build manifest check, WebKit layout,
  app builds, and two one shop probes.
- **Run counts** (6 October 2026): 721 runs of the catalogue crawl and 1,227
  runs of the deploy workflow (1,181 successful).
- **Tests gate the crawl**: the harvest does not start if its own tests fail,
  because a broken reconciler would corrupt data that a later run cannot
  repair.
- **Freshness stamp**: the built page carries a hash of its sources; a check
  refuses to publish a page that does not match.
- **Deploy decision job**: reads back what the live site was built from and
  deploys only when a file that can change the page has changed. Before it, 86
  deploys ran on 5 October, about 50 of them rebuilding the same page.
- **Deploy safety**: the build is checked (stamp, every data file present,
  deep link copy identical, sitemap not empty) before upload, so GitHub Pages
  never publishes a half built site.
- **Pipeline failure modes**: `docs/PIPELINE-FAILURE-MODES.md` lists 35
  failure modes with likelihood, impact, existing guard and fix, based on the
  last 200 crawl runs read from the GitHub API.
- **Scheduling reliability**: measured that GitHub delivered only 23% of
  hourly scheduled ticks (161 of about 687), so the crawl ticks twice an hour,
  a guard job skips while a crawl is still running, and an outside scheduler
  can stand in.
- **Type checking**: TypeScript strict mode, plus a script that fails only on
  type errors a change introduces.

---

## 8. Security, privacy and compliance

- **Row Level Security** on every Supabase table: readers can read and change
  only their own profile, wishlist and alert rows; avatars sit in a private
  bucket with per user paths, size and type limits.
- **Admin flag**: `profiles.is_admin` can only be set in the SQL editor; a
  trigger refuses any change from the public or signed in roles, and
  `is_site_admin()` gates the dashboard.
- **Public key limits**: the anonymous key can only call two counting
  functions that add one to an hourly total. A cap of 2,000 rows per hour per
  table folds any flood into an "other" row, so made up page names cannot fill
  the free database (measured at about 196 bytes a row). A daily **pg_cron**
  job folds hourly rows into days after three days and into months after 13
  months.
- **Privacy by design**: the visit counter stores no IP address, no cookie and
  no identifier; country comes from the database's Cloudflare header.
- **Accounts**: Download My Data (a JSON file built in the browser), account
  deletion, and email change through Supabase's confirmation flow.
- **Legal pages** (one source file, `demo/legal.ts`): How it works, Affiliate
  disclosure, Privacy notice, Cookies and storage, Refunds and returns, Terms of
  use, Contact, and a Legal Notice page. Written for what is true (a sole
  trader, no invented company number), with a compliance review recorded.
- **GDPR**: data requests answered within a month; ICO registration listed as
  an owner decision; consent for ads planned through Google's certified
  consent tool before any ad is served to UK visitors.
- **Secrets**: API keys live only in GitHub secrets; every optional
  integration logs and skips when its secret is absent.
- **Price alert emails**: an idempotency key per reader per UK day so a re-run
  cannot send twice.

---

## 9. Product and project management

### Method

- **Briefs and rules**: `CLAUDE.md` sets the rules every agent must follow;
  tests enforce the ones that matter (generated files, workflow rules, update
  log format).
- **Queue and plans**: a dated backlog, a phased execution plan built on an
  audit of the code ("every current state figure measured, not estimated"),
  and plan documents for sets and oils, routing, images, logos, notes,
  extraction, Notino, advertising, accounts and Premium, social media, TikTok
  Shop and content. The repository holds 45 documents in `docs/`.
- **Decision log**: 28 numbered decisions (D1 to D28), each with the evidence,
  the options weighed, what was given up, and status (decided or open).
- **Owner steps**: `docs/OWNER-STEPS.md` separates what only I can do
  (accounts, DNS, payments, legal registrations) from what agents can do.
- **Release notes**: a public update log on the home page, one entry per day,
  from v1.0.0 to v3.102.0 over 25 days of entries, with format rules enforced
  by a test.
- **Parallel agents on one live branch**: fetch and merge before every push,
  never force push, stage files by name, never commit built files.

### Challenges and how they were solved

| Challenge | Root cause | Fix |
|---|---|---|
| A sampled crawl marked almost the whole catalogue as gone | Absence was treated as evidence in a partial walk | Delisting only after a complete walk |
| Crawl run #592 lost its rebuilt page | An agent pushed rebuilt files while the crawl built the same files | One generated files manifest; builds refuse unlisted outputs; agent rules; later, the page built at deploy time |
| The branch wedged for a day and prices froze | Price history replay outgrew its timeout; a half finished rebuild was committed | Resumable checkpoint; commit only on a successful rebuild |
| A circular freshness check | The test count file was both a check input and rewritten by the check's own run | File excluded from the fingerprint, pinned by a test |
| Agent containers came back weeks stale; worktrees were killed with work in them | Cloud environment snapshot and container restarts | Recovery and worktree backup scripts that push unfinished work; owner steps for the real fix |
| Repository growing 40 to 60 MB a day | Content hashed files defeat git delta compression | Build at deploy; compact snapshots and checkpoint; one off history rewrite |
| Missed crawl ticks | GitHub delivered 23% of scheduled ticks | Two ticks an hour, a guard job, outside scheduler option |
| Wrong delivery figures from automation | Text extraction merged page chrome with content | Report with quotes, a human confirms; regression tests from verbatim failures |
| 8,104 wrong prices restored by the next harvest | A decision expressed only as missing data | A currency quarantine lock read by every writer |
| A paid chat assistant was slow and costly | A server and a 28 model council for questions the page could answer | Moved into the browser (82 ms answers), then removed on the owner's call |

### What I learnt

- A number in a document needs a test, or it will drift.
- "Tested with a fake transport" and "proven in production" are different
  claims, and the code should say which one it is.
- Automate the gathering, not the asserting, when being confidently wrong is
  expensive.
- With several agents on one branch, the rules for pushing and generated
  files matter as much as the code.
- The boring correct tool (a bandit, a static site, a strict matcher) usually
  beats the fashionable one.

---

## 10. Skills demonstrated

### For a CV skills list

- Product ownership and roadmap planning
- AI agent orchestration (Claude Code): briefing, queueing, review, decisions
- System design for an unattended data pipeline
- Web data collection with robots.txt compliance and an identified crawler
- Data engineering: normalisation, entity resolution, deduplication
- Data quality: freshness rules, quarantines, credibility tests
- Applied statistics: distribution checks, voting rules, thresholds
- TypeScript, Node.js, esbuild, vanilla front end
- PostgreSQL and Supabase: Row Level Security, functions, triggers, pg_cron
- CI/CD with GitHub Actions and GitHub Pages
- Test strategy: Vitest, Playwright (Chromium and WebKit), axe-core
- Web performance measurement and budgets; PWA and service workers
- Accessibility (WCAG 2.1 AA checks) and SEO
- Git internals: delta compression analysis, history rewrite with verification
- Privacy by design, UK GDPR awareness, affiliate disclosure
- Capacitor mobile app shells for iOS and Android
- Incident analysis and written decision records
- Affiliate marketing (Awin), AdSense readiness, Stripe planning

### Elevator pitch (about 100 words)

PriceSniffs is a UK fragrance price comparison site I designed and run,
comparing 27,098 products from 1,034 brands across 42 shops on the price you
actually pay, delivery included. I built it by directing AI coding agents as
their product owner and engineering manager: I wrote the briefs, queued the
work, reviewed every change against measurements and made the decisions. The
system crawls shops politely as an identified bot, matches the same bottle
across shops using barcodes and strict name rules, checks every "was" price
against the market, and publishes a fast static site several times a day,
guarded by 4,822 automated tests.

### Case study (about 300 words)

**Problem.** UK fragrance shoppers cannot easily see which shop is cheapest
once delivery is added, and comparison sites often mix up sizes and
strengths, trust inflated "was" prices or show stale data.

**Approach.** I acted as product owner, architect and engineering manager,
directing Claude Code agents through written briefs, a phased plan, a
numbered decision log and a rules file that every agent follows. I reviewed
work against measured evidence and made every product, legal and spending call.

**System.** A typed registry of 74 shops drives an automated crawl in GitHub
Actions. The crawler identifies itself, obeys robots.txt and never works
around a refusal. Listings are normalised (brand, size, strength, sets, oils,
notes) and matched across shops using check digit validated barcodes, word
set name matching and per shop size voting. Old ids and product addresses are
kept in append only memories so links never break. "Was" prices are tested
against other shops and the brand's own price. Price history is rebuilt from
git history with a resumable checkpoint. The site is a vanilla TypeScript app
built and checked at deploy time, served by GitHub Pages with a service
worker; accounts, wishlists, price alerts and a cookieless visitor dashboard
run on Supabase with Row Level Security.

**Results.** 27,098 products, 1,034 brands, 46,841 offers from 42 shops, 98.4%
with a photo, 8,482 products compared across two or more shops. 236 test files
with 4,822 tests, including browser and accessibility tests. First product
tiles in 2.2 seconds on a slowed phone, with repeat visits downloading almost
nothing.

**Lessons.** The hardest problems were not code but coordination: several
agents and an automated crawl sharing one live branch. One manifest of
generated files, building the site at deploy time and rules enforced by tests
turned recurring incidents into non events, and cut the crawl's daily
repository growth from 40 to 60 MB to about 13 to 14 MB.

### CV bullet points

- Built and launched PriceSniffs, a UK fragrance price comparison site
  covering 27,098 products, 1,034 brands and 46,841 offers from 42 shops,
  ranked on delivered price.
- Directed AI coding agents (Claude Code) as product owner and engineering
  manager across 2,237 commits in about nine weeks, recording 28 architecture
  and policy decisions.
- Designed an unattended pipeline of 13 GitHub Actions workflows (721 crawl
  runs, 1,227 deploy runs) with an identified, robots.txt compliant crawler
  and a 7 day freshness rule.
- Engineered cross shop product matching with check digit validated barcodes,
  word set name rules and per shop size voting; 8,482 products now compare two
  or more shops.
- Introduced statistical "was" price checks (median 1.000, p95 1.489 across
  5,391 claims) and a buyable only deals rule that removed 509 of 2,385
  misleading deals.
- Established a quality gate of 4,822 tests in 236 files, including Playwright
  browser tests in Chromium and WebKit and axe accessibility checks to WCAG 2.1
  AA.
- Cut the crawl's repository growth from 40 to 60 MB a day to about 13 to
  14 MB by building the site at deploy time, then shrank the packed repository from 643
  to 392 MiB with a verified history rewrite.
- Built privacy first accounts and analytics on Supabase: Row Level Security,
  a trigger guarded admin flag, cookieless hourly counts capped at 2,000 rows
  per hour, and nightly pg_cron roll ups.

---

*Sources in the repository: `README.md`, `CLAUDE.md`, `docs/DECISIONS.md`,
`docs/PIPELINE-FAILURE-MODES.md`, `docs/ENGINEERING-STORY.md`,
`docs/GIFT-SETS-AND-OILS-PLAN.md`, `docs/ADVERTISING-PLAN.md`,
`docs/ACCOUNT-PREMIUM-PLAN.md`, `docs/MOBILE-APPS.md`, `docs/NOTINO-PLAN.md`,
`src/config/retailers.ts`, `src/catalogue/`, `scripts/`, `supabase/migrations/`,
`.github/workflows/`, `tests/`.*

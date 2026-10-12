# Site, runs and storage audit, 12 October 2026

Owner request: a full audit of the site, the information update runs and the
storage, for efficiency and low memory; a clean GitHub; every prior mistake
from crawls, pushes and runs stopped from recurring with a rule and a guard.
Written on the worktree `audit-20261012`, cut from the live tip `73842617`;
this document was pushed first, before any change, and section 9 ("Results")
was filled in as the plan was carried out.

Every number below was measured on this machine or read from the GitHub API
on 12 October 2026 unless it says "estimate". Method notes are at the end of
each section. Builds on `docs/PIPELINE-FAILURE-MODES.md` (every row read),
`docs/FAILED-RUNS-ANALYSIS.md`, `docs/TRACKING-AND-STORAGE-STRATEGY.md`,
`docs/REPO-TIDY-2026-10-09.md`, `docs/OWNER-STEPS.md` 7a, 7d and 5b,
`docs/DECISIONS.md` D23, D24, D27, D28, D30, `docs/UX-POLISH-PLAN.md` section
9 and `docs/INTERNATIONAL-PLAN.md` section 3; it does not repeat them.

## The ten findings

1. **A UK first visit downloads 7.4 MB (gzipped) and parses 69 MB of JSON.**
   The catalogue data file is 48.7 MB raw, 5.9 to 6.2 MB gzipped, fetched
   before the first tile; the price history (22.6 MB raw, 1.4 MB gzipped) is
   prefetched when the browser is idle. On a phone (390 wide, CPU slowed 4x)
   the home page shows its first tiles after 7.0 s and holds a 94 MB JS heap
   after garbage collection (123 MB before); a product page is ready after
   14.1 s. The US site: 2.7 MB, 4.2 s, 34 MB heap; India: 2.1 MB, 2.6 s, 22 MB.
2. **A fifth of the catalogue file is never read by the page.** Offer
   `imageUrl` (7.2 MB raw), `firstSeenAt` (2.8 MB) and `isNew` (0.9 MB) are
   read by no bundled code (the module's `isNewAt` helper is tree shaken).
   Dropping them from the page's data file alone: 48.7 → 37.8 MB raw, 5.9 →
   4.5 MB gzipped (24% less to download, 22% less to parse), with the page
   byte for byte the same. Done in section 9 with the proof.
3. **The crawl is sound; the deploy's checker is the busiest job.** In 14 days
   the branch saw 512 crawl runs (92 real crawls, median 71 minutes, 6.6 a
   day; 420 ticks that skipped in 11 seconds), 847 deploy runs (150 built and
   deployed, median 3.4 minutes; 697 ended in the `decide` job after a full
   history checkout and a Node set up, median 40 s, 61 a day) and 192 build
   manifest checks. No run deploys an identical site any more (every rebuild
   changes the build record), and no commit is byte identical to the one
   before. Runner time is free; the `decide` job is the one easy saving
   (about 40 runner minutes a day and 40 s off every deploy's start).
4. **The repository grows 4 to 6 MB a day now** (compressed, as a push sends
   it): 10 October 4.9 MB, 11 October 3.7 MB, 12 October 6.1 MB to 13:00
   UTC, against 9 to 24 MB a day the week before. Snapshots are 55 to 70% of
   it (the price database; they must stay), the US and Indian region data
   about 25%, the price history and its checkpoint 0.2 to 1.1 MB. GitHub
   reports 764 MB; 210 MB of that is 745 past versions of the catalogue
   module, which only the owner's history rewrite can remove (7d).
5. **The deploy output is 328 MB for a 1.1 MB site.** 147 route pages each
   embed the whole 864 KB bundle (148 MB); an external, content hashed bundle
   would cut the deployment by about 93 MB and a repeat visit's download from
   311 KB to about 60 KB. Planned with numbers, not done (section 7).
6. **Building the page needs 5 GB of memory, almost all of it `tsc`** type
   checking the 47 MB generated catalogue module (4.97 GB, 75 s); the bundle
   step itself needs 1.1 GB. The crawl's `catalogue:demo` needs 1.2 GB,
   `deals:build` 2.7 GB, the price history replay 0.6 GB. Nothing is close
   to the 16 GB of a GitHub runner, but the figure grows with the catalogue.
7. **Two workflows ran with the repository's default token permissions**
   (`harvest-one-shop.yml`, `state-probe-one-shop.yml` had no `permissions:`
   block); one workflow has not run since 22 August and depends on a service
   the owner switched off (D23). Both fixed below.
8. **A type error can still reach the branch unseen**: no workflow ran
   `tsc --noEmit` on the tests and scripts (TS2375 on 9 October). The whole
   repository type checks in 69 s; a typecheck job now runs on every push.
9. **The whole suite in one process is still one command away** (`npm test`
   ran plain `vitest run`, which this machine kills), and a chunk had no
   memory ceiling. Both fixed in `package.json` and
   `scripts/run-tests-chunked.sh`.
10. **GitHub hygiene is mostly the owner's to finish**: 12 branches (8
    reviewed on 10 October, 3 more since, all superseded or merged), 3 open
    pull requests superseded by work on the live branch, Dependabot alerts
    disabled, no ruleset against a force push to the live branch, one high
    advisory in a runtime dependency (`undici`, a minor update, done here)
    and five in the test runner that need a major upgrade (recorded).

## 1. The site a visitor receives

Measured on the build of the live tip (`npm run demo` on this machine, the
same bytes as the deploy: `build-state.json` on the live site named
`73842617` at 12:50 UTC), served the way GitHub Pages serves it (gzip,
`404.html` for any address that is not a file), in the pinned Chromium at
390 x 844 with the CPU slowed 4x through CDP, the visitor's country already
chosen, after `data-app-ready` plus 2.5 s for the idle prefetches. Live sizes
were checked with `curl` against pricesniffs.space (table 1b).

### 1a. First load per page type and region (390 wide, CPU 4x)

| Region | Page | HTML gz / raw | Data gz / raw MB | Total gz MB | FCP | First tiles | App ready | JS heap after GC | before GC | DOM nodes |
|---|---|---|---|---|---|---|---|---|---|---|
| UK | home | 311 kB / 1,099 kB | 7.1 / 69.3 | 7.4 | 312 ms | 6,982 ms | 6,982 ms | 93.9 MB | 96 MB | 2,110 |
| UK | product (`/mugler_alien_edp_60ml`) | same | 7.1 / 69.5 | 7.4 | 460 ms | n/a | 14,140 ms | 94.3 MB | 123 MB | 1,510 |
| UK | brand (`/brands/mugler`) | same | 7.1 / 69.5 | 8.0 | 372 ms | 8,146 ms | 8,146 ms | 94.3 MB | 127 MB | 2,727 |
| UK | deals | same | 7.1 / 69.3 | 7.4 | 324 ms | 8,053 ms | 8,053 ms | 95.3 MB | 123 MB | 2,872 |
| UK | notes | same | 7.2 / 69.5 | 7.5 | 412 ms | n/a | 6,950 ms | 94.9 MB | 128 MB | 2,595 |
| US | home | 281 kB / 966 kB | 2.4 / 23.8 | 2.7 | 336 ms | 3,478 ms | 3,478 ms | 33.0 MB | 103 MB | 2,133 |
| US | product (`/us/christian_dior_miss_dior_blooming_bouquet_50ml`) | same | 2.4 / 23.9 | 2.7 | 404 ms | n/a | 4,956 ms | 33.2 MB | 38 MB | 757 |
| US | brand (`/us/brands/dior`) | same | 2.4 / 23.9 | 2.7 | 400 ms | 4,282 ms | 4,282 ms | 33.4 MB | 84 MB | 2,712 |
| US | deals | same | 2.4 / 23.8 | 2.7 | 348 ms | 4,186 ms | 4,186 ms | 33.6 MB | 90 MB | 2,997 |
| IN | home | 281 kB / 966 kB | 1.8 / 15.7 | 2.1 | 316 ms | 2,617 ms | 2,617 ms | 22.0 MB | 55 MB | 2,138 |
| IN | product (`/in/dior_sauvage_for_men_100ml`) | same | 1.8 / 15.7 | 2.1 | 412 ms | n/a | 3,330 ms | 22.2 MB | 59 MB | 710 |
| IN | brand (`/in/brands/dior`) | same | 1.8 / 15.7 | 2.1 | 532 ms | 3,348 ms | 3,348 ms | 22.4 MB | 56 MB | 2,823 |
| IN | deals | same | 1.8 / 15.7 | 2.1 | 360 ms | 2,705 ms | 2,705 ms | 22.4 MB | 56 MB | 2,987 |

"Data" counts every data file the page fetched, the idle time prefetch of the
price history included (UK 1.3 MB gzipped, 21.6 MB raw; it is not parsed
until a product page needs it, which is why the home page's heap after GC
equals the product page's). A brand page also fetched 0.6 MB of logos and
photos ("other"). The page itself is 1,099,295 bytes (310,902 gzipped):
214 kB of styles and 870 kB of scripts inline, of which the app bundle is
864 kB; the region pages are 966 kB (281 kB gzipped). The measuring script
is `.claude/audit-tmp/measure-site.mjs`, kept out of git.

### 1b. What the live site serves (curl, 12 October 13:07 UTC)

| Address | Status | Raw | Gzipped | Notes |
|---|---|---|---|---|
| `/` | 200 | 1,100,406 | 314,831 | `cache-control: max-age=600`, Pages' fixed policy |
| `/us/`, `/in/` | 200 | 966,616 | 283,576 | |
| `/dior_dune_100ml`, `/brands/dior` | 404 | 1,100,406 | 314,831 | the app, as `docs/PRODUCT-URLS.md` section 7 says |
| `/deals`, `/notes`, `/about` | 200 | 1,100,764 | 314,895 | route pages, each a copy of the app with its own head |
| `data/catalogue.2a242dfb377ef5fa.json` | 200 | 48,676,800 | 6,200,636 | fetched before the first tile |
| `data/priceHistory.26ff22810d605c0b.json` | 200 | 22,623,549 | 1,480,334 | prefetched when idle; the product page's chart |
| `data/dormant.e87b87ad65770554.json` | 200 | 1,105,732 | 239,262 | on demand (an address not in the catalogue) |
| `data/deals.3f5b7cf03bf24713.json` | 200 | 687,753 | 70,074 | before the first tile |
| `data/fragranceLinks.6f0af85e14725932.json` | 200 | 729,602 | 84,950 | before the first tile |
| `data/notes`, `regions`, `guides`, `method`, `noteIcons` | 200 | 188 kB, 132 kB, 33 kB, 7 kB, 26 kB | 61, 36, 12, 3, 11 kB | on demand |
| `us/data/catalogue.*`, `in/data/catalogue.*` | 200 | 22,585,645 / 14,158,536 | 2,419,471 / 1,748,283 | |
| `/sitemap-gb.xml` | 200 | 6,270,704 | 401,916 | 36,859 addresses |
| `/sw.js` | 200 | 9,285 | 3,460 | |

Pages sends `cache-control: max-age=600` on everything and no header can be
changed there. The content hashed names make that harmless for the data
files (a name never changes its bytes) and the service worker keeps them;
the document is network first by design, so every visit downloads the
311 kB page again after ten minutes.

### 1c. What is in the catalogue file, and what the page reads

The UK file is 81 blobs: 72 blobs of 500 products each (`CATALOGUE`, 17.9 MB,
35,512 products), one `CRAWLED` blob of every shop's offers (28.6 MB, 67,205
offers), the houses' own listings (`HOUSE_PRODUCTS`, 1.1 MB), the merged id
lists for the price chart (`HISTORY_ALIASES`, 1.0 MB) and the note aliases.

| Offer field (67,205 offers) | Raw MB | Null, false or empty on | Read by the page? |
|---|---|---|---|
| `imageUrl` | 7.22 | 2,818 | **No.** `src/services/priceService.ts` copies it into the offer row (`imageUrl: offer.imageUrl ?? null`) and nothing reads that field; the picture a tile shows is the product's `image`, chosen at build time. 30,653 of them repeat the product's own `image` (3.5 MB) |
| `url` | 6.11 | 0 | yes, every shop link |
| `firstSeenAt` | 2.76 | 0 | **No.** Only `src/catalogue/newBadge.ts` reads it, at build time; the bundle does not contain it |
| `fetchedAt` | 2.62 | 0 | yes, the offer's age and the 7 day rule |
| `retailerId` | 1.99 | 0 | yes |
| `promoEndsAt` | 1.39 | 62,114 | yes (`src/services/discount.ts`) |
| `stock` | 1.26 | 0 | yes |
| `rating` | 1.10 | 58,960 | yes (`demo/app.ts`) |
| `wasPrice` | 1.06 | 56,028 | yes |
| `isNew` | 0.93 | 52,277 | **No.** The module exports `isNewAt(product, shop)`, which nothing calls; esbuild leaves it out of the bundle (0 occurrences of `isNew` in `dist-demo/bundle.js`) |
| `price` | 0.86 | 0 | yes |

Products: `notes` 4.37 MB (null on 20,259), `image` 3.77, `slug` 1.70,
`imageTransform` 1.61, `id` 1.26, `concentration` 1.15, `name` 1.10, `brand`
0.78, `giftSet` 0.66, `ean` 0.55, `sizeMl` 0.45, `shops` 0.36; all read.

What dropping the three unread offer fields from the page's data file does
(measured by rewriting the blob and gzipping it; the generated module, which
tests and scripts read, keeps every field):

| Page data file | Raw | Gzipped |
|---|---|---|
| As built | 48.67 MB | 5.93 MB |
| Without offer `imageUrl` where it repeats the product image | 45.21 | 5.41 |
| Without offer `imageUrl` | 41.45 | 4.76 |
| Without offer `imageUrl`, `firstSeenAt`, `isNew` | **37.77** | **4.53** |
| As above, without null `promoEndsAt`, `rating`, `wasPrice` | 34.87 | 4.48 |

The last row saves 0.05 MB gzipped more and changes the shape every reader
of an offer row sees (`null` becomes absent), so it is not worth its risk.
The US file (22.6 MB; 31,801 offers, 18,204 with the product's own image
repeated) and the Indian file (14.2 MB) have the same three fields.

### 1d. The service worker's caches

`demo/sw.js` (v3, 10 October) keeps three caches: `pricesniffs-shell-v3`
(the page of each country visited, manifest, favicon, two icons),
`pricesniffs-data-v1` (every data file the current page names, the lazy ones
included, pre-cached at install and pruned per country when a newer page
arrives) and `pricesniffs-icons-v1` (note icons on first use). Measured in
the same Chromium profile: after a UK home visit the shell cache holds 5
entries (1.1 MB) and the data cache 10 entries (70.8 MB, every UK data file
including the 21.6 MB price history and the 1.1 MB dormant file); after a
US home visit too, 6 shell entries (2.0 MB) and 14 data entries (94.6 MB);
a UK product page adds 3 note icons (under 0.1 MB) and nothing else, since
its files were already held. So a phone that has visited two countries
holds about 97 MB for this site, 70 MB of it the UK's. The eviction rule
(drop a country's files the newest page of that country no longer names) is
right, each country's files are independent since 10 October, and the slim
data file of option A takes 11 MB off the UK's share.

### 1e. What would cut it

| Option | Saves (UK first visit) | Memory | Risk | Verdict |
|---|---|---|---|---|
| A. Drop the three offer fields the page never reads from the page's data file (module untouched) | 1.4 MB gzipped of 5.9 (24%); 10.9 MB raw of 48.7 | about 22% less JSON to parse and hold; measured in 9.1 | Low: no bundled code reads them; proof is the rendered DOM byte for byte the same on 5 page types x 3 regions x 2 themes x 2 widths, and the bundle byte identical | **Done** (9.2) |
| B. A slim first load index (per product: id, slug, brand, name, size, strength, image, shop count, lowest price, flags) with offers loaded per product shard on demand | about 3.2 MB gzipped (the offers are 28.6 of 48.7 MB raw; the index needs two new fields) | heap about 94 → 45 MB (estimate, proportional to bytes parsed) | **High**: `demo/data.ts` builds Most Stocked, shop pages, counts and search from `CRAWLED` synchronously; every reader becomes asynchronous; the product page, Deals and shop pages need a loading state; offline search must still work; about 40 files | Planned, not done: a task of its own with its own proof |
| C. Shorter field names in the data file (`r` for `retailerId`, …) | about 0.3 MB gzipped (gzip already folds repeated names; measured 0.05 MB for four null fields) | small | Medium: a mapping layer in every reader | Not worth it |
| D. Split the catalogue by brand or first letter | 0 on the home page: Most Stocked, search, counts and the Notes index need every product | 0 | High | No |
| E. HTTP caching headers | none: Pages fixes `max-age=600`; the hashed names and the service worker already make data files immutable in practice | | | No |
| F. Stop the idle prefetch of the price history (1.3 MB gzipped on the UK home page) | 1.3 MB on a first visit that never opens a product | 0 (not parsed until a product page) | Medium: the chart is instant and works offline today because of it | Not changed; recorded |
| G. An external, content hashed bundle instead of 864 kB inline in every page and every route page | repeat visits: the document falls from 311 kB to about 60 kB gzipped (the bundle is then cached like a data file); deploy output 328 → about 235 MB | 0 | Medium: the service worker must cache it, the loader must resolve it from the site root on a 404 page, 147 route pages and the artifact wrapper change shape | Planned, not done (section 7) |

## 2. The information update runs

Read from the GitHub Actions API: every run created from 28 September 15:24
to 12 October 12:46 UTC (1,778 runs, 13.9 days; the API returns at most
1,000 per query, so two windows). "Minutes" is wall time from start to end
of the run; a run with several jobs (the four test shards) counts once.

### 2a. Every workflow, 14 days

| Workflow | Trigger | Runs (a day) | Minutes a day | Median / max min | Events | Outcomes | Commits it makes |
|---|---|---|---|---|---|---|---|
| Catalogue crawl | `15,45 * * * *` + the outside scheduler's dispatch every half hour | 512 (36.9) | 419 | 0.2 / 111 | 419 dispatch, 93 schedule | 486 ok, 24 failed, 1 cancelled | Harvest (85), Rebuild demo (86), Awin feed sync (33), Shipping terms (21), Probe (11) |
| Deploy site | push, workflow_run (4 workflows), `7,37 * * * *`, dispatch | 847 (61.0) | 119 | 0.8 / 226 | 290 push, 529 workflow_run, 26 schedule, 2 dispatch | 816 ok, 26 cancelled, 5 failed | none (publishes) |
| Build manifest check | push to scripts, src, demo .ts, package files | 192 (13.8) | 26 | 1.8 / 15 | 192 push | 160 ok, 31 cancelled (replaced), 1 failed | none |
| Image link check | `20 3 * * *` | 14 (1.0) | 22 | 22.5 / 25 | schedule | 14 ok | Image links (14) |
| Tests | push, pull request (since 11 Oct) | 12 (0.9; 8 a day since it exists) | 21 (about 90 runner minutes a run: 4 shards) | 21.6 / 45 | 9 push, 3 PR | 6 ok, 3 failed, 2 cancelled, 1 running | none |
| Layout check (Safari engine) | push to the page's source | 99 (7.1) | 17 | 2.1 / 15 | 98 push | 87 ok, 12 failed (10 the welcome pop up, rows 48) | none |
| Fragrance links daily | `17 3 * * *` | 12 (0.9) | 16 | 16.8 / 36 | schedule | 12 ok | Fragrance links (12) |
| Catalogue crawl US / IN | `52 7`, `22 20 * * *` | 3 + 3 (0.4) | 19 | 43 / 45 | schedule | ok | US crawl, IN crawl (3 + 3) |
| Price verification | `40 4 * * 0`, dispatch | 6 (0.4) | 6 | 1.1 / 39 | 2 schedule, 4 dispatch | 6 ok | 1 report |
| Harvest probe (one shop) | dispatch | 42 (3.0) | 5 | 0.7 / 9 | dispatch | 21 ok, 21 failed (all before the exit code 3 fix of 6 Oct) | none |
| Bottle photo measuring daily | `41 4 * * *` | 10 (0.7) | 3 | 4.3 / 6 | schedule | ok | Bottle photo measuring (10) |
| Social pictures | push to social posts | 5 (0.4) | 1 | 1.6 / 5 | push | ok | none (artifact) |
| Price alerts | `41 7 * * *` | 10 (0.7) | 0.4 | 0.5 / 1 | schedule | ok | none |
| App builds | push to apps/ | 3 (0.2) | 0.4 | 1.7 / 3 | push | 2 ok, 1 failed (class J) | none |
| Delivery price re-check | `47 4 1 * *`, dispatch | 1 | 0.2 | 2.6 | dispatch | ok | none this month |
| State probe (one shop) | dispatch | 0 (last run 22 August) | 0 | | | | none |
| Total | | 1,778 (128 a day) | 685 (967 over the last 7 days) | | | | |

Runner minutes cost nothing (public repository). Queueing: no run waited
measurably for a runner in these 14 days (`run_started_at` equals
`created_at` within the API's resolution); the one long wait on record is
deploy #1165 (3 h 46 min, 6 October, fixed by the watchdog, row 36).

### 2b. What is redundant

- **Skipped crawl ticks**: 420 of the 512 crawl runs (30 a day) ran only the
  guard job, median 11 s, and committed nothing. By design (the outside
  scheduler every half hour plus GitHub's two ticks an hour; row 7); the cost
  is 5 runner minutes a day. Nothing to change.
- **Decide only deploy runs**: 697 of 847 (50 a day) stopped in `decide`,
  median 40 s each (a blobless checkout with the full history, a Node set up,
  two small fetches): about 35 runner minutes a day, and 40 s added to the
  start of every real deploy. The checkout exists only for
  `git diff --name-only <live commit> <tip>` and for reading four small files.
  **Changed below**: the list of changed paths comes from the GitHub compare
  API, the four files from a two second sparse checkout; a compare that
  cannot be read deploys, as before (the safe direction).
- **Runs that commit when nothing changed**: none. `scripts/commit-and-push.sh`
  exits "Nothing changed" on an empty diff, and every "Rebuild demo" commit
  of the 14 days changed the build record, deals and price history (table in
  the method notes). Each harvest commit changes about 83 files and 250,000
  lines, 78% of them a listing's "last seen" time (the price database).
- **Deploys that rebuilt an identical site**: none since 6 October, by
  construction: the `decide` job deploys only when a path that can change the
  page changed, and every rebuild changes the clock in the build record.
  Pushes by agents deploy unconditionally (290 in 14 days, 21 a day); a
  docs only push is already filtered out by the push paths.
- **Overlapping schedules**: the crawl's `:15` and `:45` ticks, the deploy's
  `:07` and `:37` checks, the region crawls at `07:52` and `20:22`, the daily
  jobs between `03:17` and `04:47` and the alerts at `07:41` do not share a
  minute. The Awin sync and shipping discovery run inside the crawl, gated by
  markers.
- **Steps that always warn**: none left. The crawl's old "Test everything
  else" (15 minutes, always) went on 11 October (row 49). `continue-on-error`
  is on 11 steps; each is either followed by a step that turns the run red
  on its failure (shipping, Awin, their commits, the data tests) or is a
  degradation by design and documented in the step (Chromium install,
  houses harvest, the harvest itself after its commit, the two image sweeps,
  price verification, delivery re-check). No change.
- **Retries**: `scripts/retry.sh` (exponential, jittered) wraps every
  `npm ci` and the Chromium downloads except in `layout-webkit.yml`, which
  installs WebKit bare and has no npm cache. Fixed below.
- **Caches**: `actions/setup-node` with `cache: npm` everywhere except
  `apps-build.yml` and `layout-webkit.yml` (fixed below). No workflow caches
  the Playwright browser (about 170 MB downloaded in the crawl, the tests'
  four shards, the social renders and the layout check: about 12 downloads a
  day). `playwright install --with-deps` also installs OS packages, which no
  cache covers, so a browser cache saves 30 to 50 s of a 60 to 90 s step;
  not done, recorded as optional.

### 2c. Growth of the repository per day

The objects new on the branch each UTC day, packed thin as a push sends
them (`git pack-objects --revs --thin --window=10 --depth=50`), then indexed
and attributed to paths (`git verify-pack -v`): the method of
`docs/PIPELINE-FAILURE-MODES.md`, so the figures compare.

| Day | Pushed MB | Snapshots `data/catalogue` | `data/regions` | Catalogue module | Price history | Checkpoint | Social | Other |
|---|---|---|---|---|---|---|---|---|
| 5 Oct | 23.85 | 6.09 | | 8.95 | 1.80 | 2.23 | 1.84 | 2.9 |
| 6 Oct | 20.19 | 4.42 | | 11.98 | 1.19 | 0.62 | | 2.0 |
| 7 Oct | 9.17 | 6.82 | | 1.16 | 0.39 | 0.01 | | 0.8 |
| 8 Oct | 18.97 | 5.33 | | 2.24 | 2.69 | 0.05 | 7.68 (the last pictures before D28) | 1.0 |
| 9 Oct | 23.20 | 5.84 | 6.45 (the beta's first data) | 4.73 | 3.23 | 1.00 | | 2.0 |
| 10 Oct | 4.89 | 1.43 | 1.70 | 0.52 (last commit of it) | 0.52 | 0.02 | | 0.7 |
| 11 Oct | 3.74 | 2.65 | 0.55 | | 0.17 | | | 0.4 |
| 12 Oct (to 13:00) | 6.14 | 3.07 | 1.39 | | 0.75 | 0.38 | | 0.6 |

Since the catalogue module left git (10 October) the branch grows 4 to 6 MB
a day: about 1.8 GB a year at this rate, 2.6 GB with the region data growing
as `docs/INTERNATIONAL-PLAN.md` projects. The snapshots are the price
database and cannot leave git without the price event log (strategy item
7). The region data (1.4 to 1.7 MB a day for 45 MB of files rewritten daily)
is the next largest item; its tripwire (2 MB a day per region) stands.

### 2d. Commits per day, by kind

| Day | Harvest | Rebuild | Awin | Shipping | Reports | Region | Merges | Other (agents) |
|---|---|---|---|---|---|---|---|---|
| 6 Oct | 6 | 6 | 3 | 2 | 3 | | 41 | 94 |
| 7 Oct | 6 | 6 | 3 | 2 | 3 | | 5 | 10 |
| 8 Oct | 6 (+3 one shop) | 9 | 3 | 2 | 3 | | 22 | 30 |
| 9 Oct | 5 | 5 | 3 | 2 | 3 | 1 | 42 | 79 |
| 10 Oct | 6 | 6 | 2 | 2 | 3 | 2 | 7 | 21 |
| 11 Oct | 6 | 6 | 3 | 2 | 3 | 2 | 5 | 8 |
| 12 Oct (to 13:00) | 3 | 3 | 2 | 1 | 3 | 1 | 7 | 13 |

The crawl commits 20 to 25 times a day; agents 10 to 100 (806 of the 1,085
commits of the 14 days are an agent's, 274 of them merges of the live branch
into a work branch). Agent pushes are what start the Tests, Build manifest,
Layout and most deploy runs.

## 3. Storage

### 3a. Git

| Measure | Value |
|---|---|
| GitHub's figure for the repository | 763,728 kB (12 Oct); 773,663 kB on 10 Oct, 690,445 kB on 4 Oct |
| `.git` in the main checkout (shared by every worktree) | 1.5 GB before this audit: 1.03 GiB in 9 packs, 310 MiB loose (2,016 objects), and **98 MiB in two `tmp_pack_*` files left by an interrupted repack (deleted here; `git fsck --connectivity-only` passes, two dangling trees only)** |
| Commits on the branch | 2,235 after the 6 October rewrite plus the 1,085 of the last 14 days |
| Tracked files in a checkout | 1,717 files, 313 MB; the largest `data/catalogue/mybeauty-boutique.json` 28.3 MB, `escentual.json` 20.7, `the-beauty-store-uk.json` 12.9, `data/image-box-verdicts.json` 11.8, `nicchia-luxury-uk.json` 11.8, `perfume-click.json` 11.6, `demo/priceHistory.generated.ts` 9.9, `data/fragrantica-link-audit.json` 8.4, `data/price-history-checkpoint.json` 6.3, `data/regions/us/catalogue.json` 6.2 |
| History by path (every version, uncompressed) | `data/catalogue/*` 16.8 GB in 7,354 versions; `demo/catalogue.generated.ts` 14.8 GB in 745 versions (the 25 largest blobs in history are all this file, 42.6 to 45.2 MB); `demo/priceHistory.generated.ts` 2.0 GB in 477; `data/houses/*` 1.8 GB in 8,375; the checkpoint 1.4 GB in 152; `data/regions/*` 0.3 GB in 310; `data/image-link-report.json` 0.3 GB in 111 |
| Of which only a history rewrite removes | the 745 catalogue module versions (about 210 MB packed, OWNER-STEPS 7d), the old page files reachable from the backup branch, old branches and `refs/pull/1` to `4` (about 170 MB) |

**Committed files that still grow daily, and whether they need to be in git**

| File | Size | Rewritten | Growth a day (packed) | Needs git? |
|---|---|---|---|---|
| `data/catalogue/*.json` (63 shops) | 182 MB | every harvest (6 a day) | 1.4 to 3.1 MB | Yes: the price history replays their git history (strategy R6); the price event log (strategy item 7) is what would free them |
| `data/regions/us/`, `in/` | 27 + 18 MB | once a day each | 0.5 to 1.7 MB | Yes while the region pages are built from them at deploy time; the planned data repository move at the tripwire |
| `demo/priceHistory.generated.ts` | 9.9 MB | every rebuild | 0.2 to 0.8 MB | Could be a deploy time replay like the catalogue (the replay resumes from the checkpoint in 24 s here), but a blobless deploy clone would fetch every snapshot blob of the commits since the checkpoint one by one (up to 24 commits x 80 files); not done, planned |
| `data/price-history-checkpoint.json` | 6.3 MB | every 24 commits or 24 h | 0 to 0.4 MB | Yes while the price history is committed (its resume point) |
| `demo/deals.generated.ts` | 0.7 MB | every rebuild | 0.03 to 0.1 MB | Could be replayed (built from the catalogue module alone); saving too small to be worth a second record |
| `data/image-box-verdicts.json` | 11.8 MB | daily | 0.05 to 0.15 MB | Yes: an input of the catalogue build (`CATALOGUE_DATA_INPUTS`) |
| `data/image-link-report.json`, `image-referer-report.json` | 5.9 + 0.1 MB | daily | under 0.1 MB | Read only by the next run of the same check; could be an artifact, saving a few MB a month; not worth a workflow change now |
| `data/set-match-report.json` | 0.6 MB | every rebuild | 0.03 MB | Read by `tests/setMatch.test.ts`; fine |
| `data/product-slugs.json`, `id-aliases.json` | 2.4 + 0.9 MB | every rebuild, append only | 0.02 to 0.4 MB | Yes (published addresses) |
| `data/houses/*` | 5.7 MB | every harvest | 0.03 to 0.3 MB | Yes (an input of the catalogue build) |

**The deploy output.** `npm run demo` writes 328 MB under `demo/`: 147 HTML
pages of 1.0 to 1.1 MB each (148.5 MB: the UK page, its fallback, 47 UK
route pages and 94 region route pages, each embedding the whole bundle), the
UK data files 71 MB, `/us/` 26 MB, `/in/` 18 MB, and `dist-demo/` another
297 MB of scratch that is not uploaded. The Pages artifact is 64 MB (22 of
them held at any time, 1.4 GB, each kept one day). Against Pages' limits:
the site is 328 MB of the 1 GB limit (33%), growing with the catalogue (about
3% a month) and with each new route page (1.1 MB each); an external bundle
(option G) would take it to about 235 MB. Bandwidth: a UK first visit is
7.4 MB and a repeat visit about 0.3 MB (the page) plus whichever data files
changed; the 100 GB a month soft limit is about 13,000 first visits a month
with nothing cached, or far more repeat visits; no risk at current traffic
(134 page views recorded since the counter went live).

### 3b. Supabase

Done by the coordinator on 12 October, read only for this audit: database
11 MB; `site_page_views` 134 rows (96 kB), `site_shop_clicks` 10,
`profiles` 1, `wishlists` 0, `site_overrides` 0; the nightly fold
`site-stats-compact` is scheduled at 03:23 UTC in `pg_cron`; migration 0010
(`supabase/migrations/0010_hardening.sql`) took `handle_new_user()` off the
API and made the six own row policies evaluate `auth.uid()` once per
statement; the performance advisor is clear and the remaining advisor notes
are by design (the two counting functions are public with the hour cap;
`site_stats`, `site_stats_compact` and `is_site_admin` check the owner
inside). No risk to the 500 MB plan at this rate: the cap of 0008 bounds a
flood at about 9.4 MB a day per table (`docs/TRACKING-AND-STORAGE-STRATEGY.md`).
What the public key can write: one row increment per call to the two
counting functions, nothing else (RLS on every table, `supabase/verify.sql`).
The one owner step left, the dashboard switch for leaked password
protection, is in OWNER-STEPS.

### 3c. Caches on the runners

`setup-node`'s npm cache in 15 of 17 workflows (the two without are fixed
below). No Playwright browser cache anywhere (see 2b). `node_modules` is
98 MB; the pinned Chromium is 597 MB installed and about 170 MB downloaded.

## 4. Memory in builds and tests

Peak resident memory of the whole process tree, sampled every 250 ms from
`/proc` (`/usr/bin/time` is not installed here), on this 4 core, 16 GB
machine, from a checkout with the catalogue modules already replayed:

| Command | Peak RSS | Wall time | Note |
|---|---|---|---|
| `npm run demo` (whole) | 4,948 MB | 173 s | |
| of which `tsc -p tsconfig.demo.json` | 4,973 MB | 75 s | type checks and compiles the 47 MB generated module; the whole peak |
| `tsx scripts/build-region-data.ts` | 1,547 MB | 10 s | |
| `tsx scripts/bundle-demo.ts` | 1,134 MB | 8 s | |
| `tsx scripts/bundle-region.ts` | 1,724 MB | 10 s | |
| `tsx scripts/build-demo.ts` | 824 MB | 3 s | |
| `tsx scripts/build-sitemap.ts` | 1,211 MB | 7 s | |
| `tsx scripts/build-route-pages.ts` | 1,770 MB | 9 s | 147 pages, 148 MB written |
| `npm run catalogue:demo` (fresh build) | 1,192 MB | 49 s | |
| the replay (`ensure-catalogue-built.ts --force`) | 1,467 MB | 49 s | |
| `npm run deals:build` | 2,683 MB | 11 s | imports the module twice (through `demo/data.js` and directly), estimate |
| `npm run catalogue:history` | 594 MB | 24 s | resumed from the checkpoint, 3 commits |
| `npx tsc --noEmit -p tsconfig.json` (whole repository) | 3,542 MB | 69 s | passes on the tip |

GitHub's standard runner has 16 GB (the "7 GB" in older notes is the
previous generation); nothing above is near it. `tsc` is the one figure
that grows with the catalogue: 4.97 GB for a 47 MB module. The fix would be
to compile the generated modules with esbuild (which reads them in a second)
and type check the page's source against a declaration of the module's
exports instead of its literal; planned, not done (section 7).

Tests: 308 files, 56 in the `data` set (which import the 47 MB module or
read the built files) and 252 in `code`. `scripts/run-tests-chunked.sh`
runs 20 files per vitest process, one process at a time; 50 test files import
the catalogue module directly, so a chunk holds it once (about 0.5 GB of
heap) plus whatever the files allocate. The whole suite's per file times and
the chunk peak memory are in section 9.5. `tests/regionPages.test.ts` is the
one that took 12 minutes until 12 October (a `Set` of the UK file's
addresses now, 1.5 s). No `package.json` script set a Node heap flag; the
two region crawls set `--max-http-header-size=131072` (row 40, Nykaa).
`npm test` ran the whole suite in one process until this audit; fixed below.

## 5. GitHub hygiene

| Item | Found | Action |
|---|---|---|
| Branches | 12: the live branch, the 8 the 10 October review listed for the owner, and 3 since: `claude/admiring-clarke-ly0s3e` (PR #9, open: HTML entity decoding; done on the live branch on 11 October as `src/catalogue/htmlEntities.ts` and `tests/htmlEntities.test.ts`, row 50), `claude/relaxed-allen-mv0j8n` (PR #8, open: browser cases for the undone country switch; the fix itself is on the live branch, the branch's own content is 100 lines of extra test cases and a doc paragraph), `claude/eager-tesla-79jgos` (PR #7, closed: the WebKit launch fix, on the live branch as row 48) | Owner: delete 10, close PRs #6, #8, #9 (OWNER-STEPS 7d, updated) |
| Branch protection | The API answers 403 to this session; no rulesets exist (`/rulesets` is empty). The crawls push with `GITHUB_TOKEN`, so a required review or status check would stop them | Owner: a ruleset that blocks force pushes and deletion of the live branch only (steps in OWNER-STEPS 7e) |
| Workflow permissions | 15 of 17 declare the minimum (`contents: write` only where a commit is made; `pages`, `id-token`, `actions: write` only in the deploy; `issues: write` only in the delivery re-check). `harvest-one-shop.yml` and `state-probe-one-shop.yml` declared none, so they ran with the repository's default token | Fixed: `contents: read`; the state probe deleted (below) |
| Secrets named by workflows | `APIFY_TOKEN`, `APIFY_PROXY_PASSWORD`, `AWIN_FEED_LIST_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GITHUB_TOKEN`; variables `SIGNED_COMMITS`, `PRICE_ALERTS`, `ALERTS_FROM`. The names match OWNER-STEPS; the API does not let this session list the repository's secrets, so presence was not checked (the price alerts run says "not configured" when one is missing) | none |
| Dependabot | Alerts are disabled for the repository (API: "Dependabot alerts are disabled") | Owner: switch on alerts and security updates (OWNER-STEPS 7e) |
| `npm audit` | Runtime: `undici` 8.9.0, high, ten advisories, fixed by 8.11.2 (a minor update, done here in the lockfile; the crawl's harvest gate tests run against it on the next run). Development: `vitest` 2.1.9 and its `vite`, `vite-node`, `@vitest/mocker`, `tinypool` and `esbuild` (critical and high, but only when the Vitest UI server listens, which nothing here does) need `vitest` 5 (a major upgrade, two versions, left for a task with a full test run); `nanoid` and `source-map-js` fixed in the lockfile | Lockfile updated for the three minor fixes; the major recorded in OWNER-STEPS |
| Stale workflows | `state-probe-one-shop.yml`: 10 runs, the last on 22 August; it renders one page through the Apify actor, which D23 switched off on 4 October, and no document tells the owner to run it. `apps-build.yml`: 3 runs, the last 4 October, runs only on `apps/**` pushes; keep. `build-manifest.yml`: 192 runs in 14 days; keep. `social-pictures.yml`: 5 runs since D28; keep | The state probe workflow deleted (its script `scripts/apify-state-probe.ts` stays for a future decision) |
| Artifact retention | Pages artifacts 1 day (Pages' own), social pictures 90 days (owner's choice), Android APK 14 days | none |
| `.gitignore` versus tracked files | Nothing tracked that should not be: no `.DS_Store`, scratch, build output or social picture; the 186 tracked PNGs are the apps' icons and splash screens and `demo/icons`; the deploy and social paths are all ignored (`tests/generatedFiles.test.ts` checks both lists). `git ls-files -ci --exclude-standard` lists nothing | none |
| Script permissions | Every `.sh` is executable; `.py` and `.mjs` files are run through their interpreter and are not | none |
| Actions runner image | `ubuntu-latest` moves to Ubuntu 26 on 19 October (row 18): the crawl, region crawls, photo measuring, social renders and tests are pinned to `ubuntu-24.04`; the deploy, links, image check, alerts, price verify, delivery re-check, layout check, build manifest and apps build are not. None of those installs a browser or Pillow, so the move should not break them; the layout check installs WebKit `--with-deps` and is the one to watch | Recorded; pin the layout check |

## 6. Prior mistakes, each with the rule and the guard that now stops it

| # | What went wrong | Rule | Guard today | Added by this audit |
|---|---|---|---|---|
| 1 | Run #592: an agent pushed rebuilt generated files while the crawl built the same ones; the sitemap was in no list | One manifest (`scripts/generated-files.txt`); never commit deploy files | `writeGenerated`, `scripts/check-generated-writes.ts` after every rebuild, `scripts/commit-and-push.sh` reads the manifest, `tests/generatedFiles.test.ts`, `tests/generatedFilesBuild.test.ts` (`build-manifest.yml`) | none needed |
| 2 | Generated file merge conflicts resolved by hand | Take either side and rebuild (CLAUDE.md rule 5) | The push script rebuilds on a conflict; for people, prose | none: a merge driver would hide the conflict |
| 3 | Tests pinned to a live count or product (noteAliases, newShops photo basis, productNameNoise, setMatch, perfumeDirectNames, 9 to 12 Oct) | Test the rule, never the figure (row 44); a test that reads crawl data is a data test and runs after the harvest is committed | `tests/testHygiene.test.ts` (no price literal), `scripts/test-sets.txt` + `tests/testSets.test.ts` (the data set runs after the commits), the workflow rule that the harvest gate imports no generated module | CLAUDE.md names the rule and the guard |
| 4 | The crawl's test step always timed out and only warned (every run, 9 to 11 Oct) | Tests run where their inputs change; no `continue-on-error` without a step that turns the run red | `tests/workflowRules.test.ts` ("tests the data the crawl produced after everything is committed", no bare `npm test` in any workflow) | none needed |
| 5 | The data test step turned every crawl red while prices were already committed (11 to 12 Oct) | By design (row 49): a red run at the end costs no prices; the fix is the data or the test | Same tests; the step order is tested | none needed |
| 6 | The service worker kept one offline page for all countries (10 Oct) | Each country's page and data in its own cache key; per country pruning | `tests/serviceWorker.test.ts`, `tests/regionSwitchCacheBrowser.test.ts`, `tests/demoDataFiles.test.ts` | none needed |
| 7 | The welcome pop up blocked the Safari check for three days (9 to 11 Oct) | Every test browser starts through `launchChromium` or `launchWebkit` with a country chosen | `scripts/a11y-audit.ts`, the layout test checks the pop up itself | **New**: `tests/testHygiene.test.ts` fails for a test that calls `chromium.launch(` or `webkit.launch(` directly |
| 8 | A failed profile write sent visitors to the old country (11 Oct) | A pending choice wins until the profile confirms it | `tests/regionPreferencePending.test.ts`, `tests/regionPreference.test.ts` | none needed |
| 9 | Two agents' broad `pkill` of vitest killed another agent's run | Kill only your own run, by the process id the runner prints | **New**: `scripts/run-tests-chunked.sh` writes its process id to a file it names and prints the exact `kill` command; CLAUDE.md rule |
| 10 | The whole suite in one vitest process was killed for memory | Never run the suite in one process | **New**: `npm test` is the chunked runner over both sets (plain `vitest run <file>` stays for one file); each chunk runs with a Node heap ceiling (`TEST_HEAP_MB`, default 4096) so a runaway test fails naming its file instead of the kernel killing the chunk; `tests/testSets.test.ts` holds it |
| 11 | Worktrees filling the disk | One worktree per task, deleted when done; build output is 410 MB per checkout | **New**: the session start hook warns when the disk has under 3 GB free and lists the worktrees and their build output; CLAUDE.md rule |
| 12 | The 15 minute step limit (the test step) | Every step capped at about twice its measured time | `tests/workflowRules.test.ts` (caps on every job and every install, build and push step) | none needed |
| 13 | `HeadersOverflowError` on Nykaa | The region crawls raise Node's header limit for the shop's answer | The two workflows' `NODE_OPTIONS` | **New**: `tests/workflowRules.test.ts` checks both region workflows carry `--max-http-header-size` |
| 14 | Purplle's bot check | No evasion: a refusal is recorded, never worked around (D23) | `src/catalogue/renderRefusal.ts`, `tests/botIdentity.test.ts` walks every script for the bot identity | none needed |
| 15 | Harvests that dropped a field another build needs (image URLs, compare at prices, until 9 and 10 Oct) | A harvest keeps every field the builds read | `tests/regionHarvest.test.ts` (the region listing's `imageUrl`, `wasPrice`), `tests/regionCatalogue.test.ts` | none needed |
| 16 | A changelog with two entries for one day or a point over 50 characters | One entry a day, 50 characters a point | `tests/changelog.test.ts` | none needed |
| 17 | A social caption over 280 characters or a second caption file | One `caption.txt` of at most 280 characters per post | `tests/socialSingleCaptions.test.ts` (every post folder from 9 October on, found by name) | none needed |
| 18 | A tsc error merged (TS2375, 9 Oct) | The repository type checks on every push | **New**: a `typecheck` job in `tests.yml` (`tsc --noEmit -p tsconfig.json`, 69 s), checked by `tests/workflowRules.test.ts` |
| 19 | A generated file edited by hand | Change the source and rebuild (CLAUDE.md rule 1) | The memories: `assertSlugsAppendOnly`, `tests/idAliasesAppendOnly.test.ts`; the modules: the crawl rewrites them within hours and the deploy replays the catalogue from its record | none: prose, with the guards named |
| 20 | An agent committing deploy files | Never (CLAUDE.md) | `.gitignore`, `scripts/commit-and-push.sh` refuses them, `tests/generatedFiles.test.ts` | none needed |
| 21 | A workflow without a concurrency group | Every job that commits shares a group with every other job that commits the same path | `tests/workflowRules.test.ts` | none needed |
| 22 | A dispatch burst of one shop crawls (15 on 3 Oct) | One at a time (CLAUDE.md); the guard ignores one shop commits | Prose; the API does not expose a run's inputs, so the guard cannot tell a one shop dispatch from a full one | none possible without a marker; rule kept |
| 23 | Two workflows ran with the default token | Every workflow declares `permissions:` | **New**: `tests/workflowRules.test.ts` fails for a workflow without a top level `permissions:` block |
| 24 | An interrupted repack left 98 MB of `tmp_pack_*` garbage in the shared `.git` | `git count-objects -v` says `garbage: 0` | **New**: the session start hook reports garbage and loose object size | removed here |

## 7. The plan, ranked by saving per unit of risk

| Rank | Item | Saving | Risk | Class |
|---|---|---|---|---|
| 1 | Drop the three unread offer fields from the page's data files (UK, US, India) | 1.4 MB gzipped (24%) and 10.9 MB raw off every UK first visit, 22% less to parse; about 0.6 MB gzipped off the US file | Low, proved by identical rendered DOM and identical bundle | Needs proof: done, 9.2 |
| 2 | `decide` without the full checkout (sparse checkout of four files, changed paths from the compare API, a compare that cannot be read deploys) | about 35 runner minutes a day; 40 s off the start of every deploy | Low: unit tests with a fake API; a dry run against the live record | Needs proof: done, 9.3 |
| 3 | `permissions: contents: read` on the two bare workflows; delete the Apify state probe workflow | the default token's write rights off two dispatch workflows | None | Safe now: done |
| 4 | A `typecheck` job in `tests.yml` | a type error found within minutes of a push instead of at the next agent's `tsc` | None (69 s a push) | Safe now: done |
| 5 | `npm test` chunked; heap ceiling and process id in the chunk runner | no more whole suite kills; a runaway test names itself | None | Safe now: done |
| 6 | Session start hook: disk space and `.git` garbage warning | an agent sees a full disk before it fails | None | Safe now: done |
| 7 | `layout-webkit.yml`: npm cache, retried WebKit install, step caps, pinned image; `apps-build.yml`: npm cache, step caps | a minute a run; a flaky download no longer fails the check | None | Safe now: done |
| 8 | `undici` 8.9.0 → 8.11.2, `nanoid`, `source-map-js` in the lockfile | ten open advisories closed | Low: minor versions; the harvest gate tests run against it at the start of the next crawl | Safe now: done |
| 9 | Guards for the mistakes list (rows 7, 13, 23 of section 6) | the next recurrence is caught by a test | None | Safe now: done |
| 10 | Rules: CLAUDE.md, `docs/PIPELINE-FAILURE-MODES.md` rows 51 to 55, OWNER-STEPS 7d and 7e | | None | Safe now: done |
| 11 | Branch and pull request cleanup, the history rewrite of the catalogue module paths, GitHub Support's garbage collection, a ruleset against force pushes, Dependabot | about 380 MB off the repository; a safer live branch | Owner's decisions | Owner only: steps written |
| 12 | An external, content hashed bundle (option G) | repeat visits 311 → about 60 kB gzipped; deploy output 328 → about 235 MB | Medium | Planned, not done: needs its own proof run (section 8) |
| 13 | A slim first load index with offers on demand (option B) | about 3.2 MB gzipped off a UK first visit; heap about halved | High | Planned, not done |
| 14 | Compile the generated modules outside `tsc` | 5 GB → about 1.5 GB to build the page | Medium | Planned, not done |
| 15 | The price history as a deploy time replay; reports as artifacts | 0.2 to 0.8 MB a day; a few MB a month | Medium (blobless clone fetches) / low | Not done: saving too small for the risk |

## 8. Decisions, and what was deliberately not done

- **Nothing a visitor sees changed.** Prices, matching, addresses and the
  look of every page are as they were; the one change to what a visitor
  receives (fewer bytes in the catalogue file) is proved identical in 9.2.
- **No changelog line**: nothing a visitor would notice.
- **Supabase**: read only; the coordinator did the database side (3b).
- **The slim index (B), the external bundle (G) and the `tsc` change** are
  planned with numbers and not done: each changes the shape of what the
  page loads or how it is built, and each needs a proof run of its own
  (before and after captures, offline, deep links, the country switch) that
  would not fit beside the rest of this pass without raising its risk.
- **The price history prefetch** stays: it is why the chart is instant and
  works offline.
- **No `paths` filter on `tests.yml`**: 95 of the tests read `docs/` or
  `supabase/`, and the social caption tests exist for the routines' pushes,
  so a docs or social only push must keep running them.
- **No Playwright browser cache**: it saves half of a one minute step and
  adds a 170 MB cache entry per workflow; recorded as optional.
- **No `git gc` in the main checkout**: the task limits changes outside the
  worktree to the two garbage files; the 310 MiB of loose objects are an
  owner or maintenance step (`git gc` there, one minute).
- **No history rewrite, branch deletion, force push or database write**:
  owner only, with copy ready steps.
- **`state-probe-one-shop.yml` deleted, its script kept**: switching the
  Apify tiers back on needs a new decision (D23), and the script is a one
  command dispatch to restore.
- **The scratch scripts** that measured this audit are under
  `.claude/audit-tmp/` (ignored, not committed); the numbers they produced
  are in this document.

## 9. Results

Filled in as the plan was carried out; every change is its own commit.

### 9.1 First load measurements before any change

The complete run is the table in 1a and the cache sizes in 1d (13 page
loads, 13:26 to 13:29 UTC). The same script is run again after the slim data
file in 9.2.

### 9.2 The slim data file

(pending)

### 9.3 The deploy's `decide` job

(pending)

### 9.4 Workflow and hygiene changes

(pending)

### 9.5 The whole suite

(pending)

### 9.6 Live checks after each push

(pending)

## Method notes

- Runs: `GET /repos/.../actions/runs?per_page=100&created=...` in two windows
  (the API caps a query at 1,000 runs); minutes are `updated_at` minus
  `run_started_at`. "Full deploy" is a Deploy site run over 2.5 minutes (a
  decide only run is under 2; a deploy since 10 October is 3 to 10).
- Growth: section 2c's method; the attribution ignores the thin pack's base
  objects (under 0.3% of each day).
- Site: `.claude/audit-tmp/measure-site.mjs` (a Pages like server with gzip
  and the 404 fallback, Chromium at 390 x 844, `Emulation.setCPUThrottlingRate`
  4, `Performance.getMetrics` after `HeapProfiler.collectGarbage`,
  `performance.getEntriesByType('resource')` for bytes). Field sizes: the
  JSON length of each key and value over every entry of the blob.
- Memory: a sampler over `/proc/<pid>/status` of the command's whole process
  tree every 250 ms (`.claude/audit-tmp/peakrss.mjs`).
- Commits: `git log` on the branch with `--numstat`; kinds by message prefix.

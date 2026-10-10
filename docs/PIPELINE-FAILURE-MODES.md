# Data pipeline failure modes

Reviewed 2026-10-04, after catalogue crawl run #592 failed at "Commit rebuilt
app". Every workflow in `.github/workflows` and the scripts they call were
read, and the run history was read from the GitHub Actions API: the last 200
catalogue crawl runs (#395 to #594) and the last 60 or so of every other
workflow. Numbers below are from those reads unless marked as an estimate.

## What #592 was, and what now stops it recurring

#592 had pushed its harvest, then lost its rebuilt page when an agent pushed
rebuilt generated files mid run: the rebase stopped on `demo/sitemap.xml`,
which `scripts/commit-and-push.sh` did not class as generated. The same class
of failure hit dispatches #561 and #566 on 2026-10-03. The earlier fixes
(96aeafe, 0b64483) handled the sitemap, the `demo/data` rename/rename, the
deals file and the slow replay. This review added:

- **One list of generated files**, `scripts/generated-files.txt`. The push
  script reads it (via `scripts/generated-files.sh`), the build scripts refuse
  to write a committed file it does not list (`writeGenerated` in
  `scripts/generatedFiles.ts`), and the workflow steps that commit the rebuilt
  page take their paths from it. It had already drifted: `demo/dormant.generated.ts`,
  added to the build at 11:27 on 2026-10-04, was committed by no workflow step.
- **Checks that the list is complete.** `tests/generatedFiles.test.ts` (fast:
  readers agree, every workflow commit path is covered, builds use
  `writeGenerated`), `tests/generatedFilesBuild.test.ts` (the real
  `npm run rebuild` in a scratch copy; run by `build-manifest.yml` on every
  push that touches the build, or locally with `CHECK_BUILD_WRITES=1`), and
  `scripts/check-generated-writes.ts` straight after every real rebuild in the
  crawl, which fails the step, so nothing is committed, if the build wrote a
  committed file outside the list.
- **Every committing workflow pushes through `scripts/commit-and-push.sh`**,
  and two jobs that commit the same files share a concurrency group
  (`tests/workflowRules.test.ts` checks both).
- **Rules for agents and people** in `CLAUDE.md`.
- **The freshness check runs after a failure** (`!cancelled()`), and says how
  old the harvest report it reads is.

## Who writes what

| Workflow (concurrency group) | Commits | Trigger, and when it really runs |
|---|---|---|
| catalogue-daily.yml `crawl` (catalogue) | `data/catalogue`, `data/houses`, harvest report, cursor and markers, shipping and Awin state, `src/config/retailers.ts` (shipping discovery), every "rebuild" path (the generated modules, `data/id-aliases.json`, the checkpoint), `demo/testCount.generated.ts` | hourly at :15 and :45, gated by `guard`; dispatches |
| fragrance-links-daily.yml (catalogue) | `data/fragrance-links*.json`, `data/fragrantica-link-review.json` (only the page genders the run learned, merged onto the latest file by `scripts/merge-page-genders.ts`), `demo/fragranceLinks.generated.ts` (until 2026-10-04 also the page) | 03:17 UTC; has started 09:13 to 09:52 |
| image-check.yml (image-check) | `data/image-link-report.json`, `data/image-referer-report.json` | 03:20 UTC; started 08:09 to 10:16 over 40 days |
| image-measure-daily.yml (image-measure) | `data/image-box-verdicts.json` | 04:41 UTC; started 10:01, 10:44 |
| price-verify.yml (price-verify) | `data/price-verification-report.json` | Sundays 04:40 UTC; started 08:51 to 10:43 |
| delivery-recheck.yml (delivery-recheck) | `data/delivery-recheck-report.json`, `docs/DELIVERY-RECHECK.md` | 1st of the month 04:47 UTC |
| price-alerts.yml | nothing (reads the catalogue, writes Supabase, sends email) | 07:41 UTC; started 12:41, 14:06 |
| deploy-pages.yml (pages) | nothing: builds the page, its data files and the sitemap ("deploy" in the manifest, never committed since 2026-10-04), checks them, publishes `demo/` | every push except data, docs, tests, social, apps, supabase, Markdown and other workflows; after a crawl or links run, and every half hour, only when a file that can change the page or the dashboard's hidden and removed list changed since the live build (`scripts/deploy-decision.mjs`, 2026-10-06) |
| catalogue-us.yml (catalogue-us), catalogue-in.yml (catalogue-in) | `data/regions/us/`, `data/regions/in/` only: the region's snapshots, harvest report, catalogue, price history, report and product addresses (`product-slugs.json`, append only) | daily, 07:52 UTC (US) and 20:22 UTC (India), since the public beta of 2026-10-09; dispatches. A finished run starts the deploy check, which deploys when `data/regions/` changed |
| build-manifest.yml, layout-webkit.yml, apps-build.yml, one shop probes | nothing | pushes, dispatch |

Owner routines (Claude Code routines, not workflows) also push: the end of
day changelog job (rebuilds the page) and the two social jobs (`social/` only).

## Failure modes

Likelihood is over a month of normal running. Impact is on the live site.

| # | Failure mode | Likelihood | Impact on the site | Guard before this review | Done (commit) or recommended |
|---|---|---|---|---|---|
| 1 | A push to the branch lands while the crawl builds the same generated files; the rebase meets a file the push script does not class | High: #561, #566, #592 in two days | Page and price history a run behind; red run | Hand lists in four places, already drifting | One manifest; builds refuse unlisted outputs; scratch build test; in place check after the crawl's rebuild; agent rules in CLAUDE.md (e043e7ba, 572f6f7f) |
| 2 | A new generated file is committed by no workflow step (`demo/dormant.generated.ts`) | Certain, from 11:27 on 2026-10-04 | Page on the branch disagrees with its source; next push race fails as in #592 | None | Commit steps take the "rebuild" paths from the manifest (e043e7ba) |
| 3 | Awin feed list unreachable (Awin outage, or the `AWIN_FEED_LIST_URL` secret expired or rotated): the sync exits 1 | Medium | Whole run lost: no harvest, prices age a cycle | None: no continue-on-error, no cap | Contained, capped at 30 min, undone on failure, commit only after success, run still red at the end (74408247) |
| 4 | Shipping discovery reverts every registry edit, because the whole repo typecheck fails on unrelated test errors (since 2026-10-01) | Certain while any type error exists | Confirmed delivery terms never reach the registry; run stays green | None | `scripts/no-new-type-errors.sh`: fails only on errors the edit adds (74408247) |
| 5 | Periodic stages run long, the job's 120 min limit lands on "Commit harvested prices" (run #180's loss) | Medium: #592 reached the harvest at about minute 38; its stages had no cap | A whole harvest lost | Fixed 56 min harvest deadline; job cap 120 | Deadline sized to the time left (`scripts/harvest-minutes.sh`); caps on every stage (74408247) |
| 6 | A periodic stage's commit fails (e.g. an agent edits `src/config/retailers.ts` during the run): the job stops, and the unpushed commit poisons the next commit step | Medium | Harvest lost | None | Periodic commits continue on error; the push script undoes a commit it could not push and restores "manual" files (e043e7ba, 74408247) |
| 7 | GitHub drops scheduled ticks: 161 of about 687 hourly ticks delivered (23%) from 2026-09-05 to 2026-10-04, gaps up to 8.6 h; none for 7 h on 2026-10-04; daily crons start 5 to 7 h late | High, ongoing | Prices up to 8 to 10 h old between harvests | Hourly ticks plus the 150 min guard | Second tick at :45; guard skips while an older crawl run is going so ticks never stack; `scheduled_tick` dispatch input for an outside scheduler (74408247). **Owner step:** set up the outside scheduler |
| 8 | Two crawl runs queue back to back (a tick passes the guard while a crawl is still running) | Low now, higher with more ticks | A wasted run; a waiting run can be cancelled by the next arrival | None | Guard skips while an older run is not finished (74408247, `tests/crawlGuard.test.ts`) |
| 9 | Fragrance links and the crawl both push the page | Medium: both run around 09:00 to 11:00 UTC because of the scheduler's delay | Links run fails, or its rebuild meets a shallow clone | Separate groups | Shared `catalogue` group; links regenerate with `npm run demo` only, not the price history replay (e043e7ba, 74408247) |
| 10 | Shallow clone replays one commit of price history | Was medium for fragrance links (its conflict path ran the full rebuild) | Would have built a one point price history into `demo/data`; the freshness check would have refused it | Freshness check | `REGENERATE: npm run demo` for that workflow (e043e7ba). The crawl uses `fetch-depth: 0` (unchanged) |
| 11 | A sitemap walk reads part of a shop's list (one child sitemap 403s or times out, or the walk stops at its 12 fetch budget with sitemaps queued) and still counts as complete | Low to medium per shop per run | Every listing in the unread part delisted at once (what `scripts/repair-mass-delist.ts` was written to undo) | Budgeted samples already incomplete; zero priced writes nothing; wall redirect guard | A partial discovery is never complete; delisting stays on 404, 410, redirect and age (daf0cd14). **Recommended:** a collapse floor in `reconcile()` like `COLLAPSE_FLOOR` in `crawl.ts` |
| 12 | A shop returns an empty or blocked page | Medium | Could wipe that shop's listings | Zero priced: no write; captcha and refusal stop the walk; Awin ingest refuses zero usable rows; legacy crawl collapse floor | No change needed beyond #11 |
| 13 | One shop hangs or fails | Medium | That shop only | 8 shops in parallel, 40 min per shop ceiling, 5 failed pages in a row stop a shop, per shop writes | No change |
| 14 | A partial harvest is committed as complete | High (by design) | None: shops not reached keep their prices, first in line next run | Cursor orders shops longest unasked first; freshness check | No change |
| 15 | A generated file passes GitHub's 100 MiB limit | Low now, rising: `demo/catalogue.generated.ts` 22.0 MB on 2026-10-02, 35.9 MB on 2026-10-04, 43.3 MB on 2026-10-06 indented; 34.6 MB one entry per line from 2026-10-06 | Every rebuild push refused; read as "branch moved" for 8 attempts | None | Push script refuses before committing over 95 MiB and warns over 50 MiB (e043e7ba). The page's data files no longer reach git (10ef3cbe). **Done 2026-10-06** (`docs/TRACKING-AND-STORAGE-STRATEGY.md` item 3): `CATALOGUE_CHUNK_*`, `HOUSE_PRODUCTS_CHUNK_*` and `CRAWLED` are written one entry per line (`oneEntryPerLine` in `scripts/dataLiterals.ts`), 43.3 MB to 34.6 MB, the same data and a byte for byte identical page; `productIdsIn` and `scripts/id-alias-seed.sh` read both forms. **Next:** drop what the page never reads (the strategy doc's item 3 note); split the module before the 50 MiB warning if it still grows |
| 16 | Repository growth | Medium term | Slower checkouts (43 s to 69 s now with full history), eventually GitHub's soft limits | None | Built page out of git, built by the deploy; checkpoint compact and committed less often; see "Repository growth" below (1a7351c3, 10ef3cbe, b9aeade5). **Owner decisions:** rewrite history to drop the old page files (OWNER-STEPS 7d), the social images |
| 34 | The deploy's build fails (a broken source push, an npm outage) | Low | Site stays on its last good deployment until a later deploy builds | n/a (the page used to be committed prebuilt) | Build and check before `upload-pages-artifact`; the job fails red and publishes nothing; the next push, crawl run or half hourly check retries, because the live `build-state.json` still names the old commit (1a7351c3) |
| 17 | Pages deploy fails (#937: `configure-pages` got GitHub's 503) or is cancelled mid deployment | Low | Site a deploy behind until the next one | `cancel-in-progress: true`, no cap | Running deployments finish (GitHub's advice), 15 min cap (74408247). The next push, crawl run or half hourly check redeploys |
| 18 | `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19 (GitHub's notice on every run) | Certain | Chromium install (`--with-deps`) or Pillow install could break | None | Crawl and photo measuring pinned to `ubuntu-24.04` (0548eddd). Move after one green dispatch on the new image |
| 19 | npm, Playwright or pip download fails | Low | Run lost (npm) or render tier lost (Chromium) | Chromium continue on error | Retried with backoff, `scripts/retry.sh` (74408247, 7129180b) |
| 20 | Steps with no timeout hang | Low | Runner held up to 6 h; run lost | Job caps on most jobs; deploy had none | Every job capped; every install, harvest, build and push step capped, `tests/workflowRules.test.ts` (74408247) |
| 21 | A failed run never reports how stale prices are (#592) | Every failed run | Owner cannot see staleness | Freshness check skipped after a failure | `!cancelled()`, prints the report's age, never hides the first failure (74408247) |
| 22 | Flaky or data pinned tests gate the harvest (#507 to #548: 36 runs failed the gate) | Was high | No harvests for days | Fixed 2026-10-03: gate is the harvest's own tests | No change; new harvest code test joined the gate |
| 23 | Missing secret | Low | Feature off, not a failure | Awin, Apify, Supabase, Resend and TikTok each log and skip when unset | No change. An *expired* Awin secret is #3 |
| 24 | Paid Apify use runs away | Low | Money | 20 h marker, 10 actor pages a run, monthly usage check at 90% (fails open when Apify's answer cannot be read) | **Owner step:** set a hard monthly limit in the Apify console |
| 25 | Price alert email sent twice (a re-run, or a send that succeeded but whose database write failed) | Low | Reader annoyed | One a reader a UK day (`last_sent_on`); every send carries the idempotency key `price-alert/<user>/<UK day>`, so a same day repeat is refused by Resend; own concurrency group | No change |
| 26 | Alert sender fails part way | Low | Some readers emailed a day late | A send that fails is not marked sent and goes next day | No change |
| 27 | Clocks change on 2026-10-25 | Certain | See right | Deal of the Day, savings posts and alerts use `Europe/London`; harvest dates and commit messages are UTC by design | **Owner routines** "ScentDay daily work run (9am UK)" (`0 8 * * 1,3,5` UTC) and "Daily status check-in (6am UK)" (`0 5 * * *` UTC) will run an hour early by UK time from 2026-10-25; add `CRON_TZ=Europe/London` |
| 28 | Midnight date rollover | Low | A commit message dated the next UTC day; the end of day routine's `git log --since=midnight` uses the container's UTC midnight, so in summer it misses 00:00 to 01:00 UK | n/a | Recommended wording for the routine in OWNER-STEPS |
| 29 | GitHub Actions minutes | None | Public repository: standard runners are free | n/a | No change |
| 30 | Memory and disk on runners | Low | Run lost | 16 GB runners; replay reads only changed snapshot files since 0b64483 | No failure seen in the runs read |
| 31 | Misleading error text sends the next reader the wrong way (#566 said "neither generated nor a raw harvest snapshot" about a file that was both) | Was every such failure | Slower fixes | n/a | Message names the files and the real reason (e043e7ba) |
| 32 | A one shop dispatch burst | Medium (15 on 2026-10-03) | Waiting dispatches replace each other; a scheduled tick can be replaced | Guard ignores one shop commits since 2026-10-03 | CLAUDE.md: one at a time |
| 33 | Actions built for Node 20 (`checkout@v4`, `setup-node@v4`, `configure-pages@v5`) | Low | None yet: GitHub runs them on Node 24 and warns on every run | n/a | **Recommended:** move to the next major versions when they are out, one workflow at a time |
| 35 | Perfume Direct's product files (the barcode read, `Retailer.barcodeFromProductJs`) answer 429, a challenge or a block | Medium: the shop's apex host and some pages have done so to a probe | Barcodes stop arriving; nothing is lost, listings keep any barcode already read and the matcher falls back to names | Per run cap (450 products), 3 s gap, robots.txt checked per file | Any 401, 403, 407, 429 or 503, or a 200 that is not a product file, stops the run's reads at once, is logged as a warning and held back 6 h (`barcodeBackoff` in `data/harvest-cursor.json`); three failed connects in a row stop it too; nothing is retried or asked another way (`src/catalogue/barcodeFromProductJs.ts`, `tests/perfumeDirectBarcodes.test.ts`) |
| 36 | A deploy job never gets a runner and holds the `pages` group (#1165, 2026-10-06: 3 h 46 min; ten deploys behind it replaced, the site four hours behind). `timeout-minutes` only counts once a runner has the job | Low (once in about 1,200 deploys) | Site hours behind | None: the group was the whole workflow's, so nothing else could run | The group is the `deploy` job's; every run's `decide` job runs `scripts/deploy-watchdog.mjs` first, which cancels another run whose deploy job has waited 30 minutes with no runner, never a running one (`tests/deployWatchdog.test.ts`, `tests/workflowRules.test.ts`, 2026-10-06; `docs/FAILED-RUNS-ANALYSIS.md` class C) |
| 37 | The one shop probe goes red when the shop yields nothing, its normal answer (44 of 65 runs), so a real crash looks the same | Was certain | None on the site; red runs that mean nothing | None | The harvest exits 3 for "nothing harvested" (`scripts/harvestExit.ts`); the probe reports it as a warning and keeps every other failure red; its inputs reach the command through `env` (`tests/workflowRules.test.ts`, 2026-10-06; class B) |
| 38 | A test that pins live data (a shop's price, a product's stock, which shops have listings) joins the harvest gate again (#426 to #575: 49 runs) | Low now | No harvests until someone edits the test | Gate narrowed to the harvest's own tests (c0bf860c) | Workflow rule: every gate test exists, imports no generated module and reads no harvest report, cursor or checkpoint; the rest of the suite stays `continue-on-error` (2026-10-06; class A) |
| 39 | A browser test times out on vitest's 5 s default (setPageBrowser, 2026-10-06), or a data reading test pins a price or an empty list of today's listings (unstatedStrengthEvidence) | Medium | None on the site: outside the harvest gate these only warn, but they hide a real failure in the same step | Per test timeouts in some files | `testTimeout` 30 s and `hookTimeout` 60 s for every test; `tests/testHygiene.test.ts` holds both and refuses a price literal in an assertion in any test that imports a generated module (2026-10-06) |
| 40 | A region crawl fails, or GitHub drops its once a day tick (public beta, 2026-10-09) | Medium: one tick a day, and GitHub drops some (#7) | The US or Indian prices age a day; a listing not seen for 7 days leaves the region page (`REGION_STALE_DAYS`) | Own concurrency group, a folder no other workflow commits, `scripts/commit-and-push.sh` | A missed day is made up by the next run; the run can be dispatched by hand or by the outside scheduler. **Recommended if ticks keep dropping:** add the region workflows to the outside scheduler (OWNER-STEPS 7a) |
| 41 | The region page build fails at deploy time (a malformed snapshot, a region config without data) | Low | The whole deploy stops before upload, UK included, and the site stays on its last good deployment | `npm run demo` builds the regions; the deploy checks each region's page, deep link copy and sitemap and every route page before upload | A malformed snapshot is skipped by `readRegionInputs` (unreadable JSON reads as missing); a region with no data builds an empty page. **Recommended:** if a region ever blocks a UK deploy for long, switch it off (`live: false` in `src/config/regions.ts`), which takes its pages, sitemap and menu row out in one edit |
| 42 | Region product addresses change between builds (a new product takes an address the next crawl would give another) | Low | A shared link to a US or Indian product opens a different bottle or Page Not Found | Each region's `product-slugs.json` is append only, written only by its crawl; the page build gives a product it does not hold the address the crawl will write, by the same rule | `assertSlugsAppendOnly` refuses a changed or reassigned address; never edit the memory by hand (CLAUDE.md) |
| 43 | A region deep link reaches the root `404.html` (the UK page) | Certain for every region product address: Pages has one 404 page | Without the hand off the UK app would show UK prices under a /us/ address | The UK page's first script hands /us/ and /in/ addresses to the region's page before any UK data is fetched (`scripts/regionPages.ts`) | `tests/regionPages.test.ts` runs the script against stand in addresses |
| 44 | A test pins a count or a state of generated or daily changing data (note count under 4,800; "shop has no photos") | Certain (every new shop, note or owner decision) | The harvest or deploy gate fails with nothing broken, the same class as row 22 | None | Test the rule, never the figure: no duplicate merge keys, every alias target exists, count smaller than before folding; a shop field is unset or one allowed value (`tests/noteAliases.test.ts`, `tests/newSitemapShops20261008.test.ts`, as `tests/idAliasesAppendOnly.test.ts`) |
| 45 | A new shop or brand brings product names with a "|" in them, and `tests/productNameNoise.test.ts` goes red on the next full sweep (happened 2026-10-09: VALJUES kits, "4 | Four") | Medium: each batch of new shops | Page shows a name with shop rubbish, or the sweep is red | The test over the built catalogue | Decide per name: shop rubbish is stripped in `src/catalogue/productName.ts` with a unit test; a real brand name is added to the test's brand held allowlist with the date and source (VALJUES, 2026-10-09). Rules in the test header |
| 46 | A deploy or test replays the catalogue module and the replay would give a product an address, or an old id an alias, that `data/product-slugs.json` or `data/id-aliases.json` does not hold (a catalogue code change pushed without `npm run rebuild`, or memories edited by hand) | Low | None on the site: the deploy stops before upload and the site stays on its last good deployment; `npm test` stops in its pre step | The catalogue module was committed with the memories it was built with | Since 2026-10-10 a replay (`build-demo-catalogue.ts --replay`) never writes a memory and refuses to build when its memories differ from the committed ones (`assertMemoriesUnchanged`, before any write; `tests/catalogueBuild.test.ts`). Fix: `npm run rebuild` and commit the memories and `data/catalogue-build.json`; the next crawl's fresh build does the same |
| 47 | The branch's snapshots are newer than the catalogue's build record (the crawl commits harvested prices before it rebuilds and stopped between the two; or a rebase put the record on top of another workflow's newer photo findings) | Medium: every crawl run for a few minutes, and after any failed rebuild | Would be a catalogue the crawl never built, out of step with the committed deals and with addresses the next crawl could give differently | n/a | The record names each input's git blob id; the replay takes each recorded input from the working tree when it matches and otherwise from git (`scripts/ensure-catalogue-built.ts`): the deploy's blobless clone fetches it, a shallow clone is deepened 100 commits at a time. A blob that is in no commit (a rebuild committed while its harvest commit was not) fails the replay: the deploy keeps the last good site and the next crawl's rebuild records committed inputs again |

Rows 36 to 39 come from the review of every failed run to 2026-10-06,
`docs/FAILED-RUNS-ANALYSIS.md`.

## Repository growth (measured 2026-10-04)

**How it was measured.** For each UTC day, the objects new on the branch that
day (`git rev-list --objects <end> --not <start>`) packed as a push sends them
(`git pack-objects --revs --thin --window=10`), then attributed to paths with
`git verify-pack -v` on the indexed pack. Sizes are compressed, after git's
delta compression, so they are what the repository actually grows by;
GitHub's own repacking may differ by a few per cent. GitHub reported the
repository at 690,445 kB on the evening of 2026-10-04, 754,338 kB at 03:00
UTC on 2026-10-05 and 703,724 kB at 15:00 the same day (GitHub repacks on its
own schedule, so its figure moves both ways; the pack sizes here do not).

| Day (UTC) | Added | Commits |
|---|---|---|
| 2026-09-28 | 2.0 MB | 8 |
| 2026-09-29 | 2.3 MB | 9 |
| 2026-10-01 | 14.0 MB | 58 |
| 2026-10-02 | 16.2 MB | 34 |
| 2026-10-03 | 40.4 MB | 197 |
| 2026-10-04 | 60.5 MB | 153 |
| 2026-10-05, to 03:00 | 6.7 MB | 11 |

Where 2026-10-04's 60.5 MB went: the page's content-hashed data files 32.8 MB
(`demo/data/catalogue.*` 24.6, `priceHistory.*` 7.1, `dormant.*` 0.6, `deals.*`
0.4, `fragranceLinks.*` 0.1), social post images 9.6,
`demo/catalogue.generated.ts` 5.4, the price history checkpoint 4.3, the
harvest snapshots `data/catalogue` 3.7, `demo/priceHistory.generated.ts` 1.5,
`demo/404.html` (with the identical `index.html`) 0.7, `demo/sitemap.xml` 0.6,
`demo/dormant.generated.ts` 0.3, `data/id-aliases.json` 0.1, everything else
under 1. On 2026-10-03: data files 24.1 of 40.4, checkpoint 3.7, snapshots
4.4, `catalogue.generated.ts` 3.9.

The data files cost most because each build gives them a new name: git pairs
a new version with the old one by path when it looks for a delta, so a new
name is stored nearly whole (91 versions took 61.8 MB in a week), while
`demo/catalogue.generated.ts`, the same data under one name, took 11.1 MB for
102 versions.

Across the whole history (all objects repacked locally, 626 MB): snapshots
180 MB, the old `demo/404.html` (which carried the data inline until
2026-10-01) 172 MB, `demo/catalogue.generated.ts` 113 MB, `demo/data` 75 MB,
social images 20 MB, checkpoint 17 MB, `data/houses` 15 MB, sitemap 8 MB.

Largest files on 2026-10-05: `demo/catalogue.generated.ts` 36.8 MB, the
published catalogue data file 28.5 MB, the largest snapshot
(`mybeauty-boutique.json`) 28.8 MB, the checkpoint 16.2 MB,
`demo/priceHistory.generated.ts` 15.2 MB; `data/id-aliases.json` and
`demo/dormant.generated.ts` about 0.6 MB each.

**The price history depends on the snapshots' history.** `scripts/priceHistoryReplay.ts`
walks `git log -- data/catalogue` and reads every snapshot at every commit
(with each commit's author date as the point's time); the checkpoint is only a
resume point, and any change to the replay rules discards it and replays from
the first commit. So the snapshots must stay committed on this branch with
their history intact; nothing below touches them.

**Options compared.**

| Option | Saves a day (2026-10-04 terms) | Risk | Done? |
|---|---|---|---|
| (a) Build the page, data files, sitemap and ads.txt in the deploy; stop committing them | 34.1 MB (56%) | Low: the deploy checks the build before uploading; the generated modules stay committed, so tests, scripts and the crawl's own checks are unchanged | Yes (1a7351c3, 10ef3cbe) |
| (a+) Also stop committing `demo/*.generated.ts`, the checkpoint, `data/id-aliases.json` | about 7.5 MB more | High: about 50 files import the generated modules (tests, price alerts, social, fragrance links, sitemap); the deploy would need the full replay and history; `id-aliases` reads its own last copy | The catalogue modules only, yes (2026-10-10, below); the rest no |
| (a++) Stop committing `demo/catalogue.generated.ts` and `demo/dormant.generated.ts`; commit their inputs and a build record (`data/catalogue-build.json`: the clock and every input's blob id) and replay them wherever they are read | 1.1 to 7.3 MB a day (2026-10-07 to 09), 46 MB off every checkout | Low: a replay is byte for byte the crawl's build (proved 2026-10-10, also on a clock 12 days later and from inputs taken out of git); the memories are read only in a replay, which refuses to build rather than publish an address the crawl has not recorded | Yes (2026-10-10) |
| (b1) Checkpoint compact on disk (the ever-priced end time written once) | 0.5 MB | Low; tested round trip, outside the rules fingerprint | Yes (b9aeade5) |
| (b2) Checkpoint rewritten only when 10 commits or 6 hours behind (24 and 24 since 2026-10-06: about 0.3 MB a day less) | about 2 MB more | Low: an older resume point gives the same output | Yes (b9aeade5) |
| (b3) Checkpoint without its copy of the history (version 3): read back from `demo/priceHistory.generated.ts`, checked by hash | 15.9 → 5.0 MB of checkout; a rewrite packs to about 77 kB instead of 190 kB | Low: anything but an exact hash match replays from the first commit | Yes (2026-10-06) |
| (b4) Snapshots write "last seen" once per run (`seenAt`), a listing's own only when it differs (`src/catalogue/store.ts`) | 2.64 → 0.48 MB of snapshot growth on the 12 commits of 5 October | Low: the store's reader fills it back in exactly; old files read unchanged; the site's data byte for byte the same | Yes (2026-10-06) |
| (b5) The generated catalogue writes each shop's `fetchedAt` once (`CRAWLED_SHOP_TIMES`); the bundle writes `CRAWLED` out in full again before moving it to the page's data (`inlineShopTimes`) | Awin rebuild 140 → 28 kB; 610 → 195 kB over the four rebuilds of 6 October | Low: every importer sees the same `CRAWLED`; the page, bundle and data files byte for byte the same | Yes (2026-10-06) |
| (b3) Drop unread fields, compact JSON for `catalogue.generated.ts` | small for growth (deltas already work on it), up to 8 MB off the file's size | Medium: tests and the app read most fields | Compact JSON yes (one entry per line, 43.3 to 34.6 MB, 2026-10-06, row 15); unread fields no, proposed in `docs/TRACKING-AND-STORAGE-STRATEGY.md` item 3 |
| (b4) Gzip the checkpoint | Negative: a compressed file has no deltas, each version would cost its full 1 to 2 MB | | No |
| (c) Snapshots or checkpoint on a separate data branch or storage | 3 to 4 MB, moved not saved | High: the replay and the guard read this branch's history | No |
| (d) Rewrite history to drop the old page files | about 255 MB once | High: new commit ids for everyone | Owner decision (OWNER-STEPS 7d) |
| (d) Social images out of git | up to 9.6 MB on a posting day; 26.6 MB off the tip tree | Low: the pictures are drawn again from the committed text by `npm run social:render` and the Social pictures workflow (a private artifact, 90 days) | Yes (2026-10-08, D28, owner's go ahead) |

**Expected after.** 2026-10-04 again: 60.5 − 34.1 − about 2.8 for the
checkpoint (two thirds of its 4.3) ≈ 23.6 MB, of which 9.6 MB social images,
so about 14 MB from the crawl. 2026-10-03: 40.4 − 25.3 − about 2.4 ≈ 12.7 MB.
So about 13 to 14 MB on a busy crawl day plus whatever the social routines
add, against 40 to 60 MB before.

**The catalogue modules, 2026-10-10.** Measured the same way (each day's
objects packed thin as a push sends them): the branch grew 9.1 MB on
2026-10-07, 18.9 MB on 10-08 and 22.5 MB on 10-09, of which the catalogue and
dormant modules were 1.1, 7.3 and 4.9 MB (18, 25 and 31 versions). Since
2026-10-10 they are not committed: about 12 MB a day on average over those
three days instead of about 17 (a quarter less), the crawl's new build record
adds a few kB, and every
checkout is 46 MB smaller. Their 210 MB of past versions stay in history
until an owner approved rewrite (OWNER-STEPS 7d, D27). How the replay works
and what guards it: rows 46 and 47 above, `scripts/catalogueBuild.ts`.

## Run times

Clean scheduled runs, 2026-09-16 to 2026-10-04: 61 to 84 minutes; #592 took
105 minutes (two full price history replays, fixed in 0b64483). Step times of
#593: checkout 0:43, tests 0:21 and 2:27, Awin sync 17:57, harvest 49:31,
houses 6:57, harvest commit 0:15, rebuild 4:03, page commit 0:48. The job's
limit is 120 minutes, GitHub's is 6 hours.

## What was changed, by commit

| Commit | Change |
|---|---|
| e043e7ba | `scripts/generated-files.txt` and its two readers; builds write through `writeGenerated`; the crawl's page commits take the manifest's rebuild paths (`demo/dormant.generated.ts` included); `npm run rebuild`; `scripts/check-generated-writes.ts` after the crawl's rebuild; the Awin sync's rebuild includes `deals:build`; fragrance links regenerate with `npm run demo`; the push script refuses files over 95 MiB, undoes a commit it could not push, and names the real reason for a refused conflict |
| 74408247 | Periodic stages contained and capped, undone on failure, failures reported at the end; shipping registry edits verified against the branch's own type errors; harvest deadline sized to the job's time left; freshness check and warning notes run after a failure; :45 tick, tested guard that skips while an older run is going, `scheduled_tick` input; fragrance links in the crawl's concurrency group; Pages deployments not cancelled mid flight; caps and retries everywhere; `build-manifest.yml` |
| daf0cd14 | A sitemap walk that read only part of a shop's list is not complete, so it delists nothing by absence |
| 7129180b | Fix: apps-build runs the retry helper from `apps/`; test that every script a step runs exists from its working directory |
| 572f6f7f | `CLAUDE.md`: rules for pushing to the live branch |
| 0548eddd | Crawl and photo measuring pinned to `ubuntu-24.04` |
| 1d498bd6 | Fix found by proof run #595: the write check's mark is taken two seconds after the previous step |
| 1a7351c3 | The deploy builds the site (`npm run demo`) and checks it before uploading; deploys on any push that can change the page |
| 10ef3cbe | The page, its data files, the sitemap and ads.txt leave git ("deploy" in the manifest, gitignored); the push script refuses them; `npm test` builds the page when needed; links job and WebKit check adjusted |
| b9aeade5 | Price history checkpoint compact on disk and rewritten only when 10 commits or 6 hours behind |

Owner steps (`docs/OWNER-STEPS.md`, section 7): an outside scheduler sending
`scheduled_tick` dispatches, a hard monthly limit on Apify, two routines to
move to UK time before 25 October, and a decision on repository growth.

## Proof runs

- **#595** (workflow_dispatch, `deals_refresh`, 2026-10-04 12:34 to 12:42 UTC,
  success, 7m38s). Guard 3 s including its one file checkout; job start noted;
  checkout 1:08; dependencies 0:03 through the retry helper; Chromium 0:21;
  harvest tests 0:24; full suite 4:01; rebuild 0:50 (`npm run rebuild`,
  replay resumed from the checkpoint). The write check then failed the
  rebuild step on `demo/testCount.generated.ts`, which the test step had
  written as it ended, inside the check's one second clock allowance. The
  page commit was skipped and the warning note ran, the safe direction, but
  a false positive. Fixed in 1d498bd6.
- **#598** (workflow_dispatch, `scheduled_tick`, 2026-10-04 13:34:57 to
  13:35:11 UTC, success, 14 s). The outside scheduler's path: the guard
  (10 s: 6 s runner set up, 1 s one file checkout, 1 s decision) read this
  workflow's runs with the new `actions: read` permission, found another
  agent's dispatch #597 in progress and answered `should-run=false`: "An older
  crawl run is still going: #597 (workflow_dispatch, in_progress since
  2026-10-04T13:30:56Z). Skipping this tick". The crawl job was skipped, so
  the dispatch was gated exactly as a GitHub tick is.
- **#597** (not one of the two proof dispatches: another agent's one shop
  dispatch for cult-beauty-global, 13:30:56 to 14:25:26 UTC, success) ran the
  rest of the new crawl on 1d498bd6's workflow: harvest 40:05 with its
  deadline from `scripts/harvest-minutes.sh`, houses 5:24, harvest commit
  0:03, rebuild 4:04 with the write check passing, page commit 0:10. That
  page commit, 0a8bd114, took its paths from the manifest and carried
  `demo/dormant.generated.ts` with the rest of the page: the file the old
  hand typed list would have left behind (failure mode 2).
- GitHub delivered no scheduled tick of the crawl between #593 (09:43) and at
  least 14:26 UTC on 2026-10-04, through seven slots (every :15 from 10:15,
  and :45 once that tick existed from 12:45), which is
  failure mode 7 as it happens.

### Proof of the deploy-time build (2026-10-04/05)

- **Deploy #1008** (push of 1a7351c3, 2026-10-04 22:25 UTC, success, 1m37s):
  the first deploy that builds. Checkout 31 s (full history, no blobs), build
  44 s, check under 1 s, upload and deploy 10 s. Its data files had the same
  hashes as the ones then committed, so the build is reproducible.
- **Push of 42154225** (2026-10-05 03:21, the page no longer in git): deploy
  #1033 for that commit, "Build manifest check" (the scratch rebuild against the
  manifest) and "Layout check (Safari engine)" (builds the page itself now)
  all green. The site then served `Last-Modified: 03:23:00 GMT`, the page
  naming `data/catalogue.31e438049c6039c6.json`, the hash a local build of
  the same commit produces; a product page, `/sitemap.xml` (27,572 URLs),
  `/ads.txt` and the data files all served.
- **Crawl #628** (workflow_dispatch `deals_refresh`, 03:24 to 03:34, success;
  the one proof dispatch used): rebuild 1m03s with the write check passing,
  then "Commit rebuilt app" pushed 5ba38cde with `demo/deals.generated.ts` and
  `demo/testCount.generated.ts` only: no page, no data files, and the
  checkpoint left alone (under 10 commits behind). The deploy it triggered
  succeeded.
- **The day after** (03:22 to 15:02 UTC on 2026-10-05): three harvests, two
  Awin syncs, fragrance links, image checks, every one followed by a green
  deploy; no workflow committed a page file, and the checkpoint was committed
  once instead of after every rebuild. The branch grew 7.9 MB in those
  11.7 hours (snapshots 3.6, `catalogue.generated.ts` 3.0, the rest under
  0.4 each), against 60.5 MB for the whole of 2026-10-04. At 15:05 the site
  served the build of the tip, 556be070: the same five data file hashes and
  build stamp (`sha256:0a860d3ccc1f`) as a local `npm run demo` of that
  commit, and `data/catalogue.5098a4dc3a4e3b02.json` byte-identical to it.

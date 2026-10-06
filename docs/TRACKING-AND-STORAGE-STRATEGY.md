# Tracking and storage strategy

Owner request (6 Oct 2026): strategise all the tracking, information storage
and listing tracking as efficiently as possible. Measured on 6 October 2026
against the live branch at `7cbcf523` (GitHub's figure for the repository:
704,446 kB at 08:52 UTC). Every number below was measured unless it says
"estimate"; how each was measured is under "Method" at the end.

Builds on `docs/PIPELINE-FAILURE-MODES.md` ("Repository growth", measured
4 October) and `docs/OWNER-STEPS.md` 7d, which already moved the built page
out of git. This document does not repeat that work; it measures what is left.

## The short version

1. **Git is the price database, and it grows about 12 MB a day.** Outside the
   page files that left git on 4 October, the week to 6 October added 87.6 MB:
   the generated catalogue 27.7, social images 21.1, the shop snapshots 16.1,
   the price history checkpoint 9.9 (before its 4 October fix), the price
   history 4.8. At that pace the repository passes GitHub's 1 GB guidance in
   about four weeks (late October to early November). Nothing breaks at 1 GB;
   checkouts get slower.
2. **Almost every byte the crawl commits is "still here, same price".** In
   one harvest 64,504 of 82,900 listings (78%) changed only their "last
   seen" time; 144 changed price, 111 stock, 11 were delisted or relisted.
   Between two rebuilds, 34,000 of the generated catalogue's changed lines
   are the same "last seen" time per offer. Storing that once per shop run
   instead of once per listing is the biggest saving available (item 6).
3. **The same 12.3 MB price history was committed twice**: the history inside
   `data/price-history-checkpoint.json` was the same series as the
   `PRICE_HISTORY` in `demo/priceHistory.generated.ts`. **Done 2026-10-06**
   (item 5): the checkpoint reads them back from the generated file, 15.9 MB
   down to 5.0 MB, and each rewrite adds about 40% of what it did.
4. **`demo/catalogue.generated.ts` was 43.1 MB**, up from 22.0 MB on
   2 October. GitHub warns at 50 MiB and refuses 100 MiB; the push script
   refuses at 95 MiB. It is now written one entry per line: 34.6 MB, the
   same data (item 3, done 2026-10-06). What still makes it grow, and what
   could come out, is in "Item 3: what the catalogue file is made of" below.
5. **The visitor counter had a bug and no limits.** Its shop click function
   could never count (Postgres refuses the pattern `{1,256}`): fixed in
   `0007_site_stats.sql`. Its tables had no bound, so anyone with the public
   key could fill the free database with made up page names: migration
   `0008_site_stats_limits.sql` (new) caps rows per hour and folds old rows.
   Both are done; the owner runs the SQL (OWNER-STEPS 8e).
6. **The site was redeployed about 50 times a day with nothing new**: every
   crawl run that ended, including the half hourly ticks that skip in
   seconds, started a full deploy (86 deploys on 5 October, 58 from finished
   crawl runs). **Done 2026-10-06** (item 4, owner decision): a deploy now
   runs only when a file that can change the page or the dashboard's list
   changed since the live build. On 5 October's commits that is 13 crawl and
   links commits instead of 58 runs; a "Remove" still reaches the build
   within about half an hour.

## 1. Inventory

### Git (the live branch)

| What | Where | Size now | Added to the repository | Written | Notes |
|---|---|---|---|---|---|
| Shop snapshots, one file per shop: every listing ever seen, with price, stock, status, first and last seen, description | `data/catalogue/*.json` (51 files) | 143.6 MB; 84,644 listings (75,298 active, 9,346 delisted) | 16.1 MB in the week; 6.0 MB on 5 Oct | 11 commits on 5 Oct: 7 full sweeps, 3 Awin feed syncs, 2 one shop runs (one commit can be several) | **Is the price history's source**: the replay reads every version in git history. Descriptions are 47% of the bytes (67.5 MB) but change rarely (10 a harvest) |
| Generated catalogue (the site's data) | `demo/catalogue.generated.ts` | 43.1 MB (22.0 on 2 Oct, 35.2 on 4 Oct); 34.6 MB one entry per line from 6 Oct | 27.7 MB in the week; 9.0 MB on 5 Oct | 21 commits on 5 Oct: 8 harvest rebuilds, the rest agents' rebuilds | Indented JSON until item 3 (6 Oct), one entry per line since; `fetchedAt` per offer changes every harvest |
| Price history (cheapest price per product over time) | `demo/priceHistory.generated.ts` | 16.4 MB; 42,367 products, 137,350 points (3.2 a product, 294 at most) | 4.8 MB in the week; 1.6 MB on 5 Oct | each rebuild | Rebuilt by replaying 556 harvest commits from the checkpoint |
| Replay checkpoint | `data/price-history-checkpoint.json` | 15.9 MB (12.3 MB of it a copy of the history above, 3.6 MB `everPriced`); 5.0 MB since item 5 (6 Oct): `everPriced` 3.8 MB and the series' order 1.4 MB | 9.9 MB in the week; 1.9 MB on 5 Oct; 0.1 MB on 6 Oct to 09:00 | at most every 10 commits or 6 hours since b9aeade5 | Resume point; without it the replay starts from the first commit (about ten minutes) |
| Dormant products | `demo/dormant.generated.ts` | 0.8 MB | 0.76 MB in the week | each rebuild | |
| Product addresses (append only memory) | `data/product-slugs.json` | 2.2 MB | 0.4 MB in the week | each rebuild, only adds | Never shrink or rewrite: published links |
| Merged id memory (append only) | `data/id-aliases.json` | 0.77 MB | 0.19 MB in the week | each rebuild, only adds | Same rule |
| Houses (brand own shops) | `data/houses/*.json` | 5.7 MB | 1.2 MB in the week | each sweep | |
| Reports | `data/image-box-verdicts.json` 8.3 MB, `data/fragrantica-link-audit.json` 8.1, `data/image-link-report.json` 5.7, `data/fragrance-links.json` 3.0, smaller ones | 26 MB together | about 1.3 MB in the week | daily or by hand | Small growth: deltas work |
| Social posts with rendered images | `social/` | 20.3 MB | 21.1 MB in the week | the owner's social routines | Largest single item; owner decision 2 in OWNER-STEPS 7d |
| Old page files (not committed since 4 Oct) | history only | about 255 MB of the pack (OWNER-STEPS 7d) | 91.2 MB in the week, almost all before 4 Oct; 4.2 MB still arrived on 5 Oct through older side branches | none now | Only a history rewrite removes them |
| Code, tests, docs | | | 1.9 MB in the week | | |

Totals: 626 commits and 178.8 MB in the week from 29 September to 6 October
09:00 UTC, of which 91.2 MB were the page files now built at deploy time. On
5 October: 109 commits, 28.0 MB. On 6 October to 09:00: 63 commits, 5.2 MB.
Steady state with the crawl and agents as they are: about 8 MB a day from
the crawl plus about 3 MB a day of social images.

### GitHub Actions and Pages

| What | Measured | Limit and cost |
|---|---|---|
| Catalogue crawl runs | 57 on 5 Oct (51 dispatches, most of them half hourly ticks that skip in seconds; 6 schedules), 592 wall minutes | Free (public repository) |
| Deploy runs | 86 on 5 Oct (58 started by a finished crawl or links run, 28 by pushes), about 215 wall minutes, about 2.5 minutes each. Since item 4 (6 Oct): on the same day's commits at most 13 after crawl and links runs (the runs that committed a generated module: 8 harvest rebuilds, 3 Awin feed syncs, 1 links run, 1 other rebuild) plus the 28 pushes, so about 41 instead of 86; every other run and the 48 half hourly checks stop after a `decide` job of under a minute | Free |
| Pages artifacts | 30 live, 12.1 to 12.4 MB each, kept 1 day, 377 MB in all | Free for a public repository |
| Android debug APK artifacts | 2 × 4.1 MB, kept 14 days | Free |
| Published site | about 12.4 MB | Pages: 1 GB site, 100 GB a month soft bandwidth; the 10 builds an hour soft limit does not apply to an Actions deploy |
| Other daily jobs | fragrance links 6 to 31 min, image check 21 to 22, photo measuring 2 to 4, price alerts under 1 | Free |

### Supabase (free plan: 500 MB database, 1 GB file storage, 5 GB egress, 50,000 monthly users, unlimited API requests, no backups, paused after a week with no activity)

| Table or store | One row is | Growth | Retention today |
|---|---|---|---|
| `profiles` | one account | one per sign up | until the account is deleted (`delete_own_account`) |
| `wishlists` | one saved fragrance of one account (unique per account and fragrance) | as readers save | until removed; cascades on account delete |
| `price_alert_accounts` | one opted in reader: unsubscribe token, last day emailed | one per reader who ever opted in | cascades on account delete |
| `price_alert_history` | last price emailed per wishlist row | one per saved item of an opted in reader | cascades with the wishlist row |
| `avatars` bucket | at most one photo per account, 200 KB cap (the browser aims for 100 KB) | one per reader with a photo | replaced in place; 1 GB holds about 5,000 at the cap |
| `site_page_views` (new, 0007) | hourly total per page, country and linking site | **about 196 bytes a row** with its index (measured); a row per distinct page, country and linking site per hour | none in 0007; 0008 folds |
| `site_shop_clicks` (new, 0007) | hourly total per product, shop and country | about the same per row | none in 0007; 0008 folds |
| `site_overrides` (new, 0007) | a hidden or removed brand or shop | a handful of rows | deleted on Show Again |

The live database was not read for this document (the agents have no
database credentials), so account and wishlist counts are not given. Each of
those rows is a few hundred bytes; at thousands of readers they stay under a
few MB.

What the counter tables would hold, worst case (every view its own row),
from the measured 196 bytes a row:

| Page views a day | Rows a day at most | Per year at most, no fold |
|---|---|---|
| 1,000 | 1,000 | 72 MB |
| 10,000 | 10,000 | 715 MB (over the 500 MB plan in about 8 months) |
| 50,000 | 48,000 (the 0008 cap: 2,000 an hour) | capped; the long tail folds into "/other" |

Real traffic repeats pages within an hour and a day, so the real figures
are lower; 0008's daily fold merges the repeats of each day after three days
and of each month after 13 months.

### In the visitor's browser

Three display preferences in `localStorage` (`pricesniffs.display`,
`pricesniffs.layout`, `pricesniffs.perrow`), the signed in session kept by
Supabase's client, and nothing for counting: the counter sends without
credentials and writes nothing to the device.

## 2. Listing tracking today

**How a price is checked.** The crawl (`catalogue-daily.yml`) is started by
GitHub's hourly ticks at :15 and :45 and by the outside scheduler every half
hour; a guard lets a full sweep start only when the last full harvest is 150
minutes old and none is running, so sweeps land about every three to seven
hours (7 full sweeps on 5 October). Each sweep visits every enabled shop
(39 in the 6 October 04:59 sweep, 2,664 pages fetched):

- **Whole catalogue shops** (sitemaps, Shopify product lists, shop APIs: for
  example Escentual, MyBeauty.Boutique, Perfume Direct, The Beauty Store) are
  read in full every sweep: every listing's price and stock is confirmed each
  time, in 2 to 28 page requests.
- **Page by page shops** (LOOKFANTASTIC, John Lewis, Space NK, Paco, Niche
  Beauty and others) re-read a listing's own page when its price is older
  than the shop's `refreshAfterHours`: 12 hours by default, 24 for
  LOOKFANTASTIC and Cult Beauty, at most 36 (`src/catalogue/freshness.ts`),
  oldest first, then spend the rest of the shop's slot discovering new
  products.
- **Awin feed shops** are re-priced from the feed when the last sync is five
  hours old (`data/feed-sync-marker.txt`).
- A **freshness check** fails the run if a shop that answered shows prices
  over 48 hours old.

**How it is recorded.** Each listing in `data/catalogue/<shop>.json` keeps
its current state only: price, was price, stock, status (`active` or
`delisted` with `delistedAt` and `relistedAt`), `firstSeenAt`, `lastSeenAt`.
`lastSeenAt` is set to the run's time for every listing the run confirmed
(12 distinct values across Escentual's 8,484 listings). The site hides an
offer whose `lastSeenAt` is more than **7 days** old
(`HIDE_OFFER_AFTER_DAYS`, `src/services/offerAge.ts`), and each offer row
states its own age.

**Price history** is not stored per listing. `scripts/priceHistoryReplay.ts`
walks every commit that touched `data/catalogue` (556 so far), reads each
snapshot as it was, and folds it into one series per product: the cheapest
available price at each commit, a point only when it changes. The checkpoint
lets each rebuild replay only the new commits. So the git history of the
snapshots is the price database, and no file says what one shop charged for
one listing last Tuesday.

**What is redundant**, measured:

| | Measured | Cost |
|---|---|---|
| R1. "Still here" heartbeats | Harvest `c44bae3f` to `0a2d9b24`: of 82,900 listings in 41 changed files, 64,504 changed only `lastSeenAt` (plus `availabilityReadAt` on 909); 144 changed price, 111 stock, 11 status, 399 were new. Another pair (`9fe8a6a3` to `58bdde04`): 61,331 only `lastSeenAt`, 758 price, 141 stock, 104 status, and a one off backfill of 2,498 barcodes and 4,058 variant ids | Most of the snapshots' 2.3 MB a day |
| R2. The same in the generated catalogue | Rebuild `05356c5d` to `fa20d9fa`: 68,382 lines in, 56,936 out; 34,000 of each are `fetchedAt` | Much of its 3.9 MB a day |
| R3. History committed twice | Checkpoint `history` and `PRICE_HISTORY`: identical 12,273,929 byte JSON | About half of the two files' 2 to 3 MB a day; 12.3 MB of checkout. Gone since item 5 |
| R4. Descriptions in every snapshot | 67.5 MB of 143.6 MB; about 10 change a harvest | Checkout size and replay parsing time, little growth |
| R5. Redeploys with nothing new | About 50 a day (crawl runs that skipped still started a deploy); none since item 4 | Runner time (free), 12 MB artifacts kept a day (free) |
| R6. History only in git | Every history question replays git; a history rewrite or moving snapshots out of git breaks the history | Blocks the cheaper designs below |

**The most efficient design**, where this should end up:

1. **Snapshots hold facts; a run holds the heartbeat.** Each shop file keeps
   one `confirmedAt` per run, and a listing carries its own `lastSeenAt` only
   when it differs from the shop's latest confirmed run (a page by page shop
   re-reads only some listings each run). Readers fill it in when absent.
   For whole catalogue shops the per listing churn goes to zero; estimate:
   the snapshots' growth falls by most of R1's share.
2. **Store only changes: a price event log.** Append one line per change
   (listing, time, price, was price, stock, status) to
   `data/price-events/<year>-<month>.ndjson`, written by the harvest beside
   the snapshot. At 150 to 900 changes a sweep and about 90 bytes a line,
   about 0.1 to 0.5 MB a day before git's compression (estimate). The replay
   then reads the log, not git history: seconds instead of a walk, a true per
   listing history ("what did Escentual charge"), and the snapshots' own git
   history stops mattering, which is what makes item 10 below safe.
3. **Compact history.** One copy of the history (the checkpoint keeps
   `everPriced` and the commit it reached, and reads its series from the
   generated file); points only on change, which the replay already does.
4. **Retention windows.** Price history: keep every point (137,350 points
   are 12 MB; it is the product). Delisted listings: keep (9,346 rows, needed
   to spot a relist; prune only if they pass about a third of a file).
   Reports: keep only the latest (they are overwritten already). Old
   snapshot versions: once item 2 has run for a while, git history older
   than the log's start is only needed for the replay's first months and can
   go with item 10.
5. **Bulky data out of git, in order of value**: the page files (done), the
   social images (owner decision), then the snapshots' descriptions (a
   separate per shop file written only when one changes). Moving the
   snapshots themselves to Supabase Storage or a data branch is not worth it
   while the replay reads git; with item 2 it becomes possible but saves
   little more.

## 3. Visitor and click tracking

**What the dashboard needs, and nothing more**: page views and visits per
hour for the last 24 hours, per day for 30 days, per week, month and year
after that; per country; the top pages and linking sites for a period; shop
clicks per product, brand and shop. That is exactly what 0007 stores:
hourly totals with no identifier, no IP address, no cookie and nothing on
the device. Keep it that way. Do not add a third party analytics script:
it would need a consent banner and send visitors' data elsewhere for nothing
the dashboard lacks.

**AdSense and Stripe later**: store nothing of theirs. Both cards should read
their own APIs on demand through an Edge Function that holds the secret
(OWNER-STEPS 8, "Later"). Earnings, ad views, subscribers and payments stay
in Google's and Stripe's systems, which keep them anyway. If the owner later
wants them beside the visitor chart for a long period, add one daily summary
row per source (date, total), a few hundred bytes a day, not a copy of the
transactions. Affiliate commission is reported by the networks (Awin); our
click counts are for ranking what people click, not for money.

**Retention and aggregation** (0008): hourly rows for three London days,
then one row per day, then one row per month after 13 months. Every bar the
dashboard draws is unchanged by the fold (tested with the dashboard's own
`site_stats` for Day, Week, Month and Year before and after, and every
period that starts on a London midnight gives identical lists too). One
nuance: the dashboard asks from a little before its first bar, so today its
top pages, countries and sources lists also count a few hours that no bar
shows; once those hours are folded into their day they drop out, which makes
the lists match the bars exactly. The cap of 2,000 new
rows an hour per table bounds a flood at about 9.4 MB a day per table while
keeping every count (excess goes to "/other").

**Privacy**: the country comes from Cloudflare's `CF-IPCountry` header at
Supabase's edge; the site never sees or stores an IP address. Rows are
hourly totals, so a single visit from a rare country to a rare page in one
hour is a row with a count of one; the fold to days and months blurs that
further after three days. Only the owner's account can read the tables. The
public key can only add one to a total, never read or lower one.

**Found and fixed**: `count_shop_click` in 0007 used `'{1,256}'` in a
pattern. Postgres allows at most 255 repetitions, so every call raised
"invalid repetition count" and no click would ever have been counted (page
views were fine). Fixed in 0007 (length checked separately) and in 0008; a
test now checks every migration for any count above 255.

## 4. Ranked changes

Ranked by saving for the effort and risk. "Without the owner" means an agent
may do it under CLAUDE.md's rules; "owner" means it needs a decision, an
account or SQL only the owner can run.

| # | Change | Effort | Saving | Risk | Who | Status |
|---|---|---|---|---|---|---|
| 1 | Fix the shop click pattern in 0007 | 5 lines | Clicks counted at all | None: the old function could not run | Owner reruns 0007 | **Done** |
| 2 | 0008: cap rows per hour, fold old rows daily | 1 SQL file, tested in Postgres | Bounds the counter tables; keeps the free plan's 500 MB for accounts | Low: same signatures; undo by rerunning 0007 | Owner runs it (OWNER-STEPS 8e) | **Done**, waiting for the owner |
| 3 | Write `demo/catalogue.generated.ts` one entry per line instead of indented (and `productIdsIn` in `src/catalogue/idAliases.ts` reads both forms) | Small code, one full rebuild | 43.1 → 34.6 MB now; keeps it under GitHub's 50 MiB warning for longer; smaller deltas | Medium: the id alias memory reads the old file's text, the crawl rebuilds it many times a day | Without the owner | **Done** 2026-10-06: 43.3 → 34.6 MB, the same data, an identical page; see "Item 3" below and PIPELINE-FAILURE-MODES row 15 |
| 4 | Deploy after a crawl run only when the page could change: the live site publishes `build-state.json` (the commit and the dashboard list it was built from), and a `decide` job compares it with the tip, through the push filter's folders, and with the list | Small workflow step, `scripts/deploy-decision.mjs` | About 45 deploy runs a day | Low: a missing or unreadable record, or a commit not in the history, deploys; a failed deploy leaves the old record, so the next check retries; a half hourly scheduled check keeps "Remove" and "Show Again" within about half an hour | Owner decided (6 Oct): skip pointless deploys, keep a path for the dashboard | **Done** 2026-10-06 |
| 5 | Checkpoint without its copy of the history (version 3): it keeps the series' ids in the replay's order and the hash of the history, and reads the series back from `demo/priceHistory.generated.ts`, taking off the points of the commits since | Medium | Measured: 15.9 → 5.0 MB of checkout; the nine rewrites of 5 and 6 October pack to 1.23 MB instead of 2.58 MB, so about 0.8 MB a day less | Low: only an exact hash match is resumed, anything else replays from the first commit; version 2 is still read and still written when the generated file cannot give the history back | Without the owner | **Done** 2026-10-06; see "Item 5" below |
| 6 | "Last seen" once per shop run, not per listing (snapshots), and per shop in the generated catalogue | Medium to large: the harvest writer, every reader, the replay over old commits | The largest crawl saving: most of R1 and R2, estimate 3 to 5 MB a day | Medium: freshness, the 7 day rule and offer ages all read it; needs readers that fill it in | Without the owner, as its own task | Proposed |
| 7 | Price event log (store only changes) beside the snapshots | Medium | Per listing history; replay in seconds; frees the snapshots' history (enables 10) | Low if written alongside first and compared with the replay before anything reads it | Without the owner | Proposed |
| 8 | Social images out of git (render when needed, or delete once posted) | Small | About 3 MB a day (21.1 MB in the week) | Owner's routines change | **Owner decision** (OWNER-STEPS 7d, decision 2) | Proposed |
| 9 | Descriptions in a separate per shop file | Medium | 67.5 MB off the snapshots' checkout; faster replay parsing; little growth | Medium: notes, filters and matching read them | Without the owner | Proposed, low priority |
| 10 | Rewrite history to drop the old page files (and, after 7, old snapshot versions) | Owner runs it | About 255 MB once (OWNER-STEPS 7d); after 7, up to about 180 MB more | High: new commit ids, every clone again | **Owner only** | Proposed; do 7 first if both are wanted |
| 11 | Prune delisted listings | Small | Up to 11% of snapshot rows | Relist detection and dormant pages | Not recommended now | |

Done in this change: 1 and 2, with this document and OWNER-STEPS 8e. The
rest are proposals: 3, 5, 6, 7 and 9 an agent can take without the owner
(3 first, before the 50 MiB warning); 4, 8 and 10 wait for the owner.

**Expected effect.** Today about 12 MB a day (8 from the crawl, 3 social,
1 code). With 3, 5 and 6 done: estimate 4 to 6 MB a day, about 3 of it
social. With 8 as well: 1 to 3 MB a day, and 1 GB moves from about four
weeks away to many months.

### Item 5: the checkpoint without its copy of the history

Done 2026-10-06 (`scripts/priceHistoryCheckpointFile.ts`, version 3). The
generated file is rebuilt every time and the checkpoint only when ten commits
or six hours behind, so the generated file is usually ahead of it. A series
only grows at its end, one point per commit at that commit's time, so the
checkpoint's series are the generated file's with the newer commits' points
taken off the end and the newer series left out. The reader does exactly
that and resumes only when the result hashes to what the checkpoint recorded.
The series' ids are kept in the replay's own order (1.4 MB, new ids only at
the end) because that order decides the order of `PRICE_HISTORY_GAP`'s keys:
without it the rebuilt file held the same data in another order.

Checked on the real history: a version 3 checkpoint written at the branch's
checkpoint commit (556 of 558 commits) and at an older one with the same
rules (553), read back against the generated file rebuilt at the tip, gives
the version 2 state exactly (key order included), and resuming from it gives
a `demo/priceHistory.generated.ts` identical byte for byte to resuming from
version 2. A second rebuild from the version 3 file changes nothing. Packed
the way git packs them, the nine checkpoint versions committed on 5 and
6 October take 2,584,958 bytes as version 2 and 1,225,631 bytes as version 3
(about 190 kB a rewrite down to about 77 kB).

Found on the way: the git on GitHub's runners writes a commit's time as
`2026-10-06T14:00:09Z`, an older git as `2026-10-06T14:00:09+00:00`, and the
replay copies that text into each point. So a history rebuilt on an agent's
machine is the same data as the crawl's in different text (8 kB longer at
558 commits), and a version 3 checkpoint from one machine beside a generated
file from the other is refused by its hash (a full replay, about 8 minutes),
which is why CLAUDE.md's rule of taking both files from one side matters.
The reader compares commit times as times, so the crawl's own files resume.

### Item 3: what the catalogue file is made of

Done 2026-10-06. `CATALOGUE_CHUNK_*`, `HOUSE_PRODUCTS_CHUNK_*` and `CRAWLED`
are written one entry per line (`oneEntryPerLine` in
`scripts/dataLiterals.ts`): one product, or one product's offers, a line.
43,119,801 bytes indented became 34,429,811 (the same build with the clock
pinned, so both are the same data); on the 08:50 harvest it went in with,
the crawl's own 43,344,267 byte file became 34,610,351, again every export
equal. Checked: every export of the two files
deeply equal; the page's data files, bundle and sitemap byte for byte the
same (only the build fingerprint in `index.html` differs);
`data/id-aliases.json`, `data/product-slugs.json` and
`demo/dormant.generated.ts` unchanged, by a build reading the old form and
one reading the new. `productIdsIn` (`src/catalogue/idAliases.ts`) and
`scripts/id-alias-seed.sh` read both forms. A chunk now always moves to the
page's data file whatever its size (`moveLiteralsToJson`): the last
catalogue chunk, 93 products, is under the 50 kB threshold once compact, and
left as code it would have shipped in the page and escaped the dashboard's
brand removals.

Measured on the 6 October build (compact JSON, MB), against the file of
2 October 00:17 (22.0 MB indented):

| Part | 2 Oct | 6 Oct | Driver |
|---|---|---|---|
| `CRAWLED` (offers) | 9.8 | 19.6 | 25,214 → 45,779 offers (35 → 42 shops, more products). Offer `imageUrl` 1.9 → 5.1 (shops now give a photo: offers without one 6,732 → 590), `url` 2.1 → 4.0, `firstSeenAt` and `fetchedAt` 2.0 → 3.7 |
| `CATALOGUE` (products) | 6.2 | 12.9 | 16,253 → 26,593 products. New since: `slug` 1.2, `giftSet` 0.4, `gender` 0.05; `image` 1.3 → 2.9, `imageTransform` 0.3 → 0.9, `notes` 2.0 → 3.1 |
| `HOUSE_PRODUCTS` | 1.1 | 1.1 | |
| `HISTORY_ALIASES` | none | 0.7 | new: merged ids for the price graph |

The file grows with the number of offers and products, which is the point of
the site. Avoidable, and **proposed, not changed** (each changes what the
file holds, so each is its own task with its readers checked):

- **Offer `firstSeenAt` (1.9 MB):** written on every offer, read by nothing
  that reads the file: not the page (`offersFor` and `isNewAt` read neither
  it nor `imageUrl`; no `demo/*.ts` reads them), not a test, not a script.
  The new badge is already worked out into `isNew` at build time. Safe to
  drop; it rarely changes, so it saves size more than churn.
- **Offer `imageUrl` (5.1 MB, 2.7 MB of it the same address as the product's
  own `image`):** not read by the page either. `tests/brandDirectImage.test.ts`
  reads it to check how the product photo was chosen; that test would read
  the stored listings instead. Dropping only the copies equal to `image` is
  the smaller step.
- **Null and false fields on offers (2.5 MB):** `rating` is null on 91% of
  offers, `promoEndsAt` on 95%, `wasPrice` on 83%, `isNew` false on 78%.
  Leaving them out, as `houseCeiling` and `format` already are, needs
  `offersFor` and the other readers to fill in null, so it is medium risk.
- **`fetchedAt` (1.8 MB, 82 distinct values over 45,779 offers):** item 6;
  it is also most of the line churn between harvests.

Together the first three would take the file from 34.6 to about 25 to 27 MB.

## Owner decisions

- **Item 4**: decided 6 October: deploy only when the page could change,
  with a half hourly check of the dashboard's list. Done.
- **Item 8**: the social images, as already asked in OWNER-STEPS 7d.
- **Item 10**: the history rewrite, as already asked in OWNER-STEPS 7d; if
  wanted, best after item 7 has run for a few weeks.

## Method

- **Repository growth**: for a period, the objects new on the branch
  (`git rev-list --objects <end> --not <start>`) packed as a push sends them
  (`git pack-objects --revs --thin --window=10 --stdout`), completed with
  `git index-pack --fix-thin` and attributed to paths with
  `git verify-pack -v`. Compressed sizes after deltas, as in
  PIPELINE-FAILURE-MODES; GitHub's own repacking differs by a few per cent.
- **Field churn**: every listing of every snapshot compared field by field
  between two commits (`git show <commit>:<file>`), matched on shop SKU and
  address. Generated catalogue churn: `git diff -U0`, counted by key.
- **Sizes over time**: `git cat-file -s` at the last commit before each date.
- **Actions**: the GitHub API's workflow runs (per day, by event) and
  artifacts listing.
- **Supabase row size and the 0008 tests**: migrations 0007 and 0008 run in
  PGlite (Postgres 17 in WebAssembly) with stand ins for Supabase's `auth`
  schema and roles; 50,000 rows with the site's real product addresses, then
  `pg_total_relation_size`. 0008's checks: the cap (every view and click
  still counted), the fold over 20 months of synthetic rows across both clock
  changes (every day, month and year total and the dashboard's own
  `site_stats` unchanged, the last three days still hourly, a second fold
  changes nothing), and a signed in account that is not the owner refused.
- **Free plan limits**: supabase.com/pricing and GitHub's documentation, read
  6 October 2026.

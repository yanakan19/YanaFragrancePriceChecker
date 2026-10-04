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
| catalogue-daily.yml `crawl` (catalogue) | `data/catalogue`, `data/houses`, harvest report, cursor and markers, shipping and Awin state, `src/config/retailers.ts` (shipping discovery), every "rebuild" path, `demo/testCount.generated.ts` | hourly at :15 and :45, gated by `guard`; dispatches |
| fragrance-links-daily.yml (catalogue) | `data/fragrance-links*.json`, `demo/fragranceLinks.generated.ts`, `demo/index.html`, `demo/404.html`, `demo/data` | 03:17 UTC; has started 09:13 to 09:52 |
| image-check.yml (image-check) | `data/image-link-report.json`, `data/image-referer-report.json` | 03:20 UTC; started 08:09 to 10:16 over 40 days |
| image-measure-daily.yml (image-measure) | `data/image-box-verdicts.json` | 04:41 UTC; started 10:01, 10:44 |
| price-verify.yml (price-verify) | `data/price-verification-report.json` | Sundays 04:40 UTC; started 08:51 to 10:43 |
| delivery-recheck.yml (delivery-recheck) | `data/delivery-recheck-report.json`, `docs/DELIVERY-RECHECK.md` | 1st of the month 04:47 UTC |
| price-alerts.yml | nothing (reads the catalogue, writes Supabase, sends email) | 07:41 UTC; started 12:41, 14:06 |
| deploy-pages.yml (pages) | nothing (publishes `demo/`) | every push to `demo/**`, and every completed crawl or links run |
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
| 15 | A generated file passes GitHub's 100 MiB limit | Low now, rising: `demo/catalogue.generated.ts` 22.0 MB on 2026-10-02, 35.5 MB on 2026-10-04 | Every rebuild push refused; read as "branch moved" for 8 attempts | None | Push script refuses before committing over 95 MiB and warns over 50 MiB (e043e7ba). **Recommended:** watch the 50 MiB warning; split the catalogue data before it |
| 16 | Repository growth | Medium term | Slower checkouts (43 s to 69 s now with full history), eventually GitHub's soft limits | None | 651 MB on GitHub today; one busy day (119 commits) adds a 31.8 MB pack, a quiet one (15 commits) 5.7 MB. At 10 to 30 MB a day it passes 1 GB in about 2 to 5 weeks (estimate). **Owner decision:** keep the bundles out of git (publish `demo/data` from the build artifact) or accept the growth |
| 17 | Pages deploy fails (#937: `configure-pages` got GitHub's 503) or is cancelled mid deployment | Low | Site a deploy behind until the next one | `cancel-in-progress: true`, no cap | Running deployments finish (GitHub's advice), 15 min cap (74408247). The next push or crawl run redeploys |
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

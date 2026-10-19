# Futureproofing plan, 19 October 2026

Owner request: "make plans for any futureproofing". This ranks what could break
or slowly degrade over the next 6 to 24 months, measured against the repository
as it is on 19 October 2026. It adds to `docs/PIPELINE-FAILURE-MODES.md` (rows
quoted as "FM n"), `docs/SITE-AUDIT-2026-10-12.md` and `docs/OWNER-STEPS.md`
(quoted as "OS n"); it does not repeat their detail.

How to read it. Priority: **now** (this week), **next month**, **later**.
Effort: S under an hour, M a few hours, L a day or more. Who: **agent** or
**owner**. Outcome: **done** (with the commit), **left** (with the reason),
**owner** (only the owner can do it), **open** (not started).

## What was measured today

| Fact | Value | Where |
|---|---|---|
| Deploy output against the budget | 574.9 MB of 700 MB (82%), 35,715 prerendered pages; Pages' own limit is 1 GB | `scripts/build-leaf-pages.ts --check`, `DEPLOY_BUDGET_BYTES` in `scripts/leafPages.ts:65` |
| Growth rate used in the docs | about 3% a month, so the 700 MB budget is reached in about 7 months, after which low importance pages are dropped by design | FM 58 |
| `.git` on the agents' machine | 2.5 GB (1.88 GiB packed, 529 MiB loose, 29 MiB repack garbage), 2,815 commits | `git count-objects -vH` |
| `data/` | 289 MB; `data/catalogue` 194 MB, `data/regions` 45 MB; biggest single files `image-box-verdicts.json` 15 MB, `fragrantica-link-audit.json` 8.4 MB, `price-history-checkpoint.json` 6.1 MB, `image-link-report.json` 5.9 MB, `product-slugs.json` 3.3 MB | `ls -lS data` |
| Last full crawl | harvest 56 min (10:37 to 11:33 UTC); the whole run ended 78 min after it started; job limit is 120 min (`catalogue-daily.yml:480`) | `data/harvest-report.json`, run 1455 |
| Shops that stopped early on their time budget | 7 of 59: direct-cosmetics, john-lewis, paco-perfumerias-uk, niche-beauty-uk, cult-beauty-global, parfumdreams-uk, lookfantastic | `data/harvest-report.json` |
| Shops that did not answer the last sweep | notino-uk (saved pages only), fragrance-click, mybeauty-boutique, the-fragrance-counter, perfume-click (10,804 listings shown, the biggest) | `freshness.*.answered` in the report |
| Shops with errors in the last sweep | allbeauty, beautybase, glorious-beauty, justmylook (HTTP 503 on product pages), perfumeo and debenhams (sitemap 404), liberty-london (HTTP 0), the-fragrance-counter (rendered section parsed 0) | same |
| Reader types in the last sweep | 50 of 59 read ordinary HTML pages or sitemaps, 7 use the Shopify JSON, 2 WooCommerce; 9 take part of their listings from a catalogue feed | `refreshed.platform`, `refreshed.fromFeed` |
| Tests | 320 test files, 331 lines in `scripts/test-sets.txt`, run in chunks of about 20 | `tests/`, `scripts/run-tests-chunked.sh` |
| Name rules | `src/catalogue/productName.ts` 3,322 lines, `brandName.ts` 1,814, 7 name modules, 6,073 lines in all | `wc -l` |
| `npm audit` | production: 0. All: 6 (1 high, 2 critical, 3 moderate), in the test runner chain (`vitest` 2, `vite`, `esbuild`), dev only | `npm audit` |
| Runtime | Node 22.22 locally and in 19 workflow steps (`node-version: '22'`); `@types/node` is ^26 | `package.json`, workflows |
| Dependabot | no `.github/dependabot.yml`; alerts are OS 7e step 2 (owner) | `.github/` |

## Ranked plan

### A. GitHub Actions

| # | Item | Risk (what, how likely, how soon) | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| A1 | Actions built for Node 20: `checkout@v4` (21 uses), `setup-node@v4` (19), `upload-artifact@v4` (2), `configure-pages@v5`, `deploy-pages@v4`, `github-script@v7`, `setup-python@v5`, `setup-java@v4`; `upload-pages-artifact@v3` is a composite that calls `upload-artifact` | GitHub already runs them on Node 24 and warns on every run (14 Oct). When it removes the Node 20 runtime the old tags may stop working: every workflow, including the crawl and the deploy, would fail on the same day. Certain to matter, date set by GitHub | The warning in each run's log; nobody reads it (FM 33) | Move each to the first major that declares `node24` (checked in each `action.yml` today): checkout v5, setup-node v5, upload-artifact v6, configure-pages v6, deploy-pages v5, github-script v8, setup-python v6, setup-java v5. For `upload-pages-artifact` check that v4 and later leave out dotfiles (`include-hidden-files`); `demo/` has none, so it is safe | agent | S | now | done 19 Oct: every workflow on checkout v5, setup-node v5, upload-artifact v6, setup-python v6, setup-java v5, github-script v8, configure-pages v6, upload-pages-artifact v5, deploy-pages v5 (one commit per workflow); deploys, apps-build, social pictures, build manifest, failure digest green on them; test pins updated |
| A2 | `ubuntu-latest` moves to Ubuntu 26 (from 19 Oct, FM 18). 11 jobs still use it: apps-build, build-manifest, the crawl's `guard`, delivery-recheck, deploy `decide` and `deploy`, failure-digest, fragrance-links, image-check, price-alerts, price-verify. The crawl, tests, photo measuring, webkit layout and social pictures are pinned to `ubuntu-24.04` | A new image can change Chromium `--with-deps`, Pillow or Python behaviour. Likely within weeks as the label rolls out; the deploy is the one that matters | A red run | Pin the remaining jobs to `ubuntu-24.04` now; test one dispatch on `ubuntu-26.04` later and move jobs one at a time. `tests/workflowRules.test.ts:233` only checks the crawl | agent | S | now | done 19 Oct for the pinning: all Linux jobs on `ubuntu-24.04`, and a rule in `tests/workflowRules.test.ts` forbids `ubuntu-latest`; the trial on 26.04 is still to do (later) |
| A3 | Scheduled workflows are switched off after 60 days with no repository activity | Low: the branch gets commits many times a day. It would bite only if the crawl stopped for two months, and then it also stops the digest | `failure-digest.yml` notices quiet crons, but it is itself scheduled and paused (see C3) | Nothing to build. Note: since 19 Oct the crawl runs mostly as `workflow_dispatch` from an outside scheduler (runs 1452 to 1459), which is not subject to the rule. Keep the outside scheduler (OS 7a) | owner | S | later | owner |
| A4 | Concurrency groups: `catalogue` (`catalogue-daily.yml:345`, `cancel-in-progress: false`), `pages` for the deploy | A queue holds one waiting run, extra ones are replaced: acceptable and tested (`tests/workflowRules.test.ts`). Risk is a long crawl (78 min) holding the group when a push lands | FM 1, 6, 8, 36 | No change. Keep the deploy watchdog. Recheck if a crawl passes 100 min | agent | S | later | open |
| A5 | Actions minutes if the repository goes private | Free today because it is public (FM 29, `private: false`). A private repository gets a fixed monthly allowance; the crawl alone uses well over an hour many times a day, so a switch would exhaust it in days | The owner would see the bill or red runs | Do not make it private without a plan. If privacy is ever needed, move the site (Pages from a private repo needs a paid plan) and the crawl (self hosted or a cheap VPS) first. Record this in DECISIONS when it comes up | owner | M | later | owner |
| A6 | Run duration creeping to the 120 min job limit (FM 5): harvest 56 min, whole run 78 min on 19 Oct; 7 shops already stop on their time budget | Medium over 6 months as shops and the catalogue grow about 3% a month; a timed out run loses the harvest (run #180) | `freshness-check` and the digest only see the aftermath | Weekly job summary with each workflow's median and longest duration and the shops that hit their time budget (item C1); raise or rebalance shop budgets when the longest passes 100 min | agent | S | next month | first reading 19 Oct (weekly summary): longest crawl run 101 min in 7 days, 31 failed of 405 crawl runs (most are quick guard runs), Tests 6 failed of 30; so the 100 minute line is already touched. Next: rebalance shop budgets and read the 31 failures |

### B. Dependencies and tooling

| # | Item | Risk | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| B1 | Node 22 reaches end of life in April 2027; Node 24 is the long term release now. `@types/node` is already ^26 | Certain in about 6 months; after that no security fixes. Mismatch of types and runtime can hide bugs | Nobody | Run the full suite and one crawl dispatch on Node 24 (`setup-node` `24`, one workflow at a time, tests first, deploy last); then change the 19 `node-version` lines and `tests/*` that name 22 | agent | M | next month | open |
| B2 | Major versions pending: `vitest` 2 (5 current), `playwright` 1.62, `typescript` 5.7, `esbuild` 0.28 | Dev only for vitest (the 6 audit findings sit there and only matter if the Vitest UI server listens). Playwright browsers need `--with-deps` on each runner image. TypeScript majors change type checking and can break `tsc --noEmit` on every push | `npm audit`, Dependabot once on | A separate, later job, one package per branch: vitest 5 (OS 7e, full chunked run), then playwright (re-run browser tests and the webkit workflow), then TypeScript (typecheck, `tests/` errors), esbuild last. No majors in this run | agent | L | later | left (by instruction) |
| B3 | No Dependabot version updates | Drift builds up quietly, then arrives as a big jump | Nothing | Add `.github/dependabot.yml`: monthly, `github-actions` and `npm`, majors ignored for npm, small PR limit. Alerts and security updates are the owner's switch (OS 7e step 2) | agent (file), owner (switch) | S | now | file done 19 Oct (`.github/dependabot.yml`, monthly, npm majors ignored, actions grouped); Dependabot began its first runs at once; the alerts and security updates switch is the owner's |
| B4 | Lockfile hygiene | Low: `package-lock.json` exists and workflows use `npm ci` | A failed `npm ci` | Keep `npm ci` everywhere; add `npm audit --omit=dev` to the monthly list (0 findings today) | agent | S | later | open |
| B5 | `undici` ^8 and `@supabase/supabase-js` ^2 are the only runtime packages | Low | `npm audit --omit=dev` | Monthly check; both are in Dependabot's scope | agent | S | later | open |

### C. Shops and noticing breakage

| # | Item | Risk | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| C1 | No per shop health over time. 50 of 59 shops are read from ordinary pages, so a redesign breaks a reader without notice; only the 48 hour freshness check (`scripts/freshness-check.ts`, crawl line 1548) and the 7 day hide (`HIDE_OFFER_AFTER_DAYS`) react | High over 24 months: shops redesign constantly; likely a few breaks a quarter. A broken shop silently drops off after 7 days and takes its listings, links and prices with it | Freshness warnings in a crawl log; the site just loses the shop | A weekly written summary, no email: for every shop the priced count, errors, answered or not, listings over 48 hours, time budget stops, change against the previous week, and the longest workflow durations. Written to the job summary of a new read only workflow (`.github/workflows/weekly-health.yml`, `scripts/weekly-health.ts`). A history file in git would be a generated file, so it is left out for now | agent | M | now | done 19 Oct: `weekly-health.yml` (Mondays 06:37 UTC, also on demand) with `scripts/weekly-health.ts` and `tests/weeklyHealth.test.ts`; job summary only, `contents: read` and `actions: read`, no email, no commit. Deploy size and the biggest data files are not in it yet (they need a build): next month |
| C2 | Shops that refuse or throttle: perfume-click (10,804 shown), mybeauty-boutique (8,894), fragrance-click, the-fragrance-counter, Notino did not answer the last sweep; allbeauty, beautybase, justmylook, glorious-beauty answer 503 on part of their product pages; Perfume Direct barcode reads answer 429 (FM 35) | Medium: the three largest unreached shops hold about 20,000 of the listings; if they stay unreached the prices age out after 7 days | Freshness table shows `answered: false` | Per the owner's rule (D23) a refusal is never worked around. Options that stay inside it: a shop's own feed (Awin) where one exists, a politer pace, a contact request to the shop, saved pages as for Notino (OS 9). Decide shop by shop from the weekly summary | owner + agent | M | next month | owner (for contact and feeds) |
| C3 | The failure email is built (`failure-digest.yml`, `scripts/failure-digest.ts`) but dormant: it needs `RESEND_API_KEY` and the owner has paused it | Neutral: the owner chose it. The effect is that a red run or a quiet cron has no push to the owner | Reading Actions | Leave as it is. The weekly summary in C1 is the written, no email substitute. The digest can be switched back on by adding the secret (OS 7g) | owner | S | later | owner |
| C4 | Awin feed list outage or an expired `AWIN_FEED_LIST_URL` (FM 3) | Medium, was a whole run lost | Red crawl run | Already hardened; keep an eye on Awin programme terms (see E4) | agent | S | later | open |
| C5 | Hotlinked shop photos (D24) break when a shop moves its images | Medium: constant slow rot | `image-check.yml`, `data/image-link-report.json`, bottle measuring | Already monitored daily. Add the broken image share to the weekly summary | agent | S | next month | open |

### D. Data growth and repository health

| # | Item | Risk | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| D1 | Deploy output 574.9 MB of a 700 MB budget (Pages limit 1 GB), about 3% a month | Medium: in about 7 months pages of low importance start to be dropped by design, then a deploy fails if the base (data and code, 96 MB) alone grows | `build-leaf-pages.ts --check` in each deploy | Put the output size in the weekly summary; at 85% (595 MB) plan a cut: smaller page templates, fewer note pages, `gzip` friendly data, or a second host for leaf pages. Do not raise the budget past 800 MB | agent | M | next month | open |
| D2 | History rewrite planned after 17 Oct (OS 7d, D27 recommends against rewriting): `.git` 2.5 GB, clones 43 s to 69 s and rising | Medium: checkout time is paid by every workflow run; at some point GitHub's soft size guidance bites | Slow checkouts | Owner decides. If yes: follow CLAUDE.md "Destructive jobs" (backup branch first, pause workflows, verify tree identical). In the meantime prefer shallow checkouts in every workflow that does not need history | owner decides; agent executes | L | later | owner |
| D3 | Loose objects and repack garbage on the agents' machine (529 MiB loose, 29 MiB `tmp_pack_*`, FM 55) | Low | The session start hook warns | `git gc` in the main checkout when no agent is working (OS 7e step 4) | owner | S | next month | owner |
| D4 | Data file growth: `image-box-verdicts.json` 15 MB, `fragrantica-link-audit.json` 8.4 MB, price history checkpoint 6.1 MB, `product-slugs.json` 3.3 MB; the GitHub file limit is 100 MiB (FM 15) | Low now; each commit of a changed big JSON adds a full copy to history, so the repository grows faster than the files | Push script warns at 50 MiB | Weekly summary lists the five biggest data files and their change in a week; if any passes 25 MB, split or prune it. Append only memories (`product-slugs.json`, `id-aliases.json`, `note-aliases.json`) cannot be pruned, only stored better (one line per entry) | agent | S | next month | open |
| D5 | Test suite run time: 320 files in chunks | Medium: every push runs the code set; slow tests slow every agent run and cost tokens | `tests.yml` duration | Weekly summary shows the code set time; shard further (`--shard`, already supported) when it passes 15 min | agent | S | later | open |

### E. Accounts, domain and third parties

| # | Item | Risk | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| E1 | Supabase free plan pauses a project after a week of no activity (check the plan in the dashboard; the project is `kemjyocklbkgjsyfdqtf`). While paused, sign in, wishlists and stats fail; the site itself still loads because it is static | Low while visitors write page views (each visit calls the counting function), but a quiet week, or counting being switched off, could trigger it. Free plans also have no downloadable backups | A user reports sign in broken | A tiny read request to the project's public REST address once a week from the weekly workflow (public key only, no write). Owner: confirm the plan, set a calendar reminder to take a manual export, and consider the paid plan before real accounts matter | agent (ping), owner (plan, export) | S | next month | ping done 19 Oct inside the weekly workflow (one anonymous read of `profiles` with the public key already in the page; first run: HTTP 200, awake; no secret used); plan check and export are the owner's |
| E2 | Supabase migrations, keys and RLS | Low: 10 migrations in `supabase/migrations`, RLS on every table, `supabase/verify.sql` (SITE-AUDIT 3b). Risk is a key rotated in the dashboard but not in `demo/supabase.ts` | Sign in fails | Keep migrations in git only; rerun `supabase/verify.sql` and the advisors every quarter; the one open owner step is leaked password protection (OS) | owner (dashboard), agent (verify) | S | later | owner |
| E3 | Domain `pricesniffs.space` (Namecheap): renewal, DNS (GitHub Pages `demo/CNAME`, Google verification, Resend SPF and DKIM, Awin if used) | A lapsed domain takes down the site, sign in redirects, email and Search Console at once. High impact, low likelihood if auto renew is on | A renewal email to the registrar address | Owner: turn on auto renew with a card that does not expire, note the expiry date, keep the registrar mail address monitored, turn on registrar lock, verify the domain in GitHub's Pages settings (stops takeover). Agent: keep a DNS record list in `docs/DEPLOYMENT.md` | owner | S | now | owner |
| E4 | Awin and other affiliate programme terms; AdSense resubmission due about 20 Oct (OS 5g); consent message must be on before any ad shows (OS 5b) | Medium: a programme ends or changes terms and links earn nothing; AdSense refusal repeats if content is thin | Affiliate dashboard | Owner resubmits AdSense and checks programme emails monthly; agent keeps `scripts/affiliate-status.ts` output in the weekly summary | owner | S | now | owner |
| E5 | Resend (sending domain, key) | Low: dormant; if price alerts or the digest are switched on, an unverified domain makes sends fail | Red alert run | Verify the sending domain when the key is added (OS 4b) | owner | S | later | owner |
| E6 | Google Search Console: sitemap lists only addresses that answer 200 (FM 59); 35,715 pages | Medium: a crawl budget or "discovered, not indexed" slide would show only in Search Console | Nothing in the repository | Owner looks at the Pages report monthly; agent keeps the sitemap rule tested | owner | S | later | owner |
| E7 | Trustpilot links, Fragrantica and brand site links rot (`docs/FRAGRANTICA-LINK-AUDIT-2026-10-05.md`, `data/fragrantica-link-audit.json`, `demo/brandSites.ts`) | Medium over 24 months | `fragrance-links-daily.yml`, link audit | Add the share of broken links to the weekly summary; D26 already keeps Fragrantica out of search and notes | agent | S | later | open |

### F. Legal and policy

| # | Item | Risk | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| F1 | Privacy, cookie and affiliate pages must match what the site does (`demo/legal.ts`, `docs/LEGAL.md`); display ads change the answer (consent message, partners list) | High once ads go live; the notice was written before ads | `tests` check some wording | Re read the pages the day ads are switched on (OS 5b); keep `docs/LEGAL.md` in step. A solicitor review is still recommended before relying on it at scale | owner + agent | M | next month | owner |
| F2 | India age tick stores nothing (OS 10, decided 9 Oct); the law may need a stored date and notice version | Medium once real Indian accounts exist | Nobody | Owner decides with the legal review; if yes it is one nullable column and a write at sign up | owner | S | later | owner |
| F3 | Crawler rules (D23): every request is `PriceSniffsBot`, robots.txt first; shops change robots.txt and terms | Medium: a shop can start disallowing the bot, and a reader that ignores it would break the owner's rule | `tests` for the identity; the report shows refusals | Add a monthly robots.txt change check to the weekly summary (hash of each shop's robots.txt against the last run, printed, no commit) | agent | M | next month | open |
| F4 | US and India legal pages reviewed before any earning there (OS 10 item 3) | Medium | n/a | Owner | owner | M | later | owner |

### G. Code health and people

| # | Item | Risk | How we would notice today | Fix | Who | Effort | Priority | Outcome |
|---|---|---|---|---|---|---|---|---|
| G1 | `src/catalogue/productName.ts` is 3,322 lines and name rules keep growing (6,073 lines across 7 name modules); each fix risks another | High over 12 months: rule interactions are hard to reason about; each rule needs re-checking against 35,000 products | Name tests and the name review lists (`docs/NAME-*`) | Split by rule family into files with one table each and a data file of verified names; keep the verified name list as the source of truth. Another agent is editing this file now, so this waits | agent | L | later | left (file in use by another agent) |
| G2 | Flaky browser tests (FM 39, 48) | Medium | Red `tests.yml` | Everything starts through `launchChromium` / `launchWebkit`; track the slowest browser tests in the weekly summary | agent | S | later | open |
| G3 | One branch is both the live site and the work branch (`claude/scentday-retailer-registry-h92tth`) | Medium: one bad push is live in minutes (FM 1) | The guards in CLAUDE.md | Owner step 7e item 1 (no force push, no deletion on that branch). A later separate `live` branch would need the deploy and the crawl re pointed: a large job, plan separately | owner (rule), agent (plan) | M | now (rule), later (split) | owner |
| G4 | Bus factor | High: the owner is not a developer and one person plus agents know the pipeline | n/a | Keep `CLAUDE.md`, `docs/PIPELINE-FAILURE-MODES.md`, `docs/OWNER-STEPS.md`. Add a one page "if you hand this to someone" in `docs/README.md` next month: accounts list, secrets list (names only), how to deploy, how to stop the crawl | agent | S | next month | open |
| G5 | Cost of AI agent runs (tokens) | Medium: long contexts, whole suite runs, 300+ docs | The bill | Keep the docs short; use `grep` first; one worktree per task; never run the whole suite when one file will do (CLAUDE.md already says so); the weekly summary replaces ad hoc investigations | agent | S | later | open |

## Do now (max 8)

1. A1: move all workflows to the Node 24 action versions, one workflow at a time, dispatching the cheap ones.
2. A2: pin the remaining `ubuntu-latest` jobs to `ubuntu-24.04`.
3. B3: add `.github/dependabot.yml` (monthly, actions and npm, no majors).
4. C1: add the weekly shop and workflow health summary (job summary only, no email).
5. E1: the weekly Supabase read ping, inside the same weekly workflow.
6. E3 (owner): turn on domain auto renew and note the expiry date.
7. E4 (owner): resubmit AdSense about 20 October; check Awin programme mail.
8. G3 (owner): the force push and deletion rule on the live branch (OS 7e step 1).

## Monthly checks

- Weekly summary: shops that did not answer, shops that hit their time budget, longest crawl duration (under 100 min).
- Deploy size against 700 MB (under 85% = 595 MB).
- `npm audit --omit=dev` (0 today) and the Dependabot pull requests.
- GitHub notices in a run log (deprecations, runner image changes).
- Search Console Pages report, AdSense and Awin dashboards and mail.
- Supabase: project not paused, advisors clear, row counts of the stats tables.
- Domain expiry date and DNS records.
- `git count-objects -vH` and the five biggest data files.

## Owner only

- Domain: auto renew, expiry reminder, registrar lock, verify in GitHub Pages settings (E3).
- Dependabot alerts and security updates; ruleset blocking force push and deletion on the live branch; workflow token default read only (OS 7e).
- AdSense resubmission, consent message, ads.txt check (OS 5); Awin and other programme terms (E4).
- Supabase plan, manual export, leaked password protection, key rotation (E1, E2).
- History rewrite decision (D2, D27) and `git gc` on the agents' machine.
- Legal: solicitor review, India age record, US and India pages (F1, F2, F4).
- Contacting shops that refuse the bot, or approving a feed (C2); the decision to switch the failure email back on (C3).
- Keeping the repository public, or planning a move if it ever goes private (A5).
- The outside scheduler (OS 7a).

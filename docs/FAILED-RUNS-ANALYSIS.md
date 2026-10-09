# Failed GitHub Actions runs: analysis

Read 2026-10-06 from the GitHub Actions API: the most recent runs of every
workflow in `.github/workflows` (up to 300 each; 1,065 runs in all, the crawl's
300 reaching back to #421 on 2026-09-09, every other workflow its whole
history). 183 ended `failure` or `cancelled`. For each, the failed jobs and
steps were listed, every failed job's annotations read, and the job log read
for each distinct failure (at least one run per class, several where a class
could hide more than one cause). Fixes were checked against the git history
and `docs/PIPELINE-FAILURE-MODES.md` so nothing already guarded is fixed twice.

Run numbers are GitHub's per workflow numbers. Commit ids are the ones on the
branch after the 6 October history rewrite (the failure modes document still
quotes some ids from before it).

## Failure classes

| # | What | Runs | First seen | Last seen | Root cause | Fixed? | Evidence |
|---|---|---|---|---|---|---|---|
| A | Crawl: "Test before crawling" failed, so no harvest ran | 49 | #426, 2026-09-10 | #575, 2026-10-03 | Root cause 1: the whole suite gated the harvest, and tests pinned live data | Yes: 79ebf439 and bb1ba864 (the pinned tests), c0bf860c (the gate is the harvest's own tests; the rest runs `continue-on-error` and warns). **New guard:** a workflow rule that the gate's tests exist and import no generated module and read no harvest report | #426: `duplicateOfferRows` listed live Emirates Oud offers; #465: `yanny/priceLookup` expected a delivered price for One Million Elixir, which had gone out of stock; #507 and #548: `duplicateOfferRows` pinned Tom Ford Black Orchid at The Beauty Store UK to 139.99, then 150.64, while the shop charged 154.47, then 163.88; #575: `deliveryRecheck` expected every enabled shop with listings in the real registry to have a delivery page, and Manchester Ouds had just gained listings |
| B | Harvest probe (one shop): "Ask one shop" red | 44 of 65 | #1, 2026-08-20 | #62, 2026-10-03 | Root cause 2: the probe is a dry run diagnostic, and the harvest exits 1 when the shop yields nothing, which is the answer the probe exists to give | **Fixed here**: the harvest exits 3 for "nothing harvested" (`scripts/harvestExit.ts`), the probe turns 3 into a warning naming the shop and keeps every other failure red; inputs reach the command through `env` | #1 (Ocado, disabled, 0 URLs), #62 (Beauty The Shop UK: sitemap HTTP 403), 21 dispatches of disabled shops between 01:09 and 01:10 on 2026-10-03 |
| C | Deploy site: waiting runs replaced behind a deploy that never got a runner | 11 (#1165 and the 10 behind it) | #1165, 2026-10-06 08:58 | #1175, 2026-10-06 11:35 | Root cause 3: the `pages` group was the whole workflow's, and a job's `timeout-minutes` only counts once a runner has it. #1165's deploy job had no runner for 3 h 46 min (other workflows ran normally), held the group, and every deploy after it (#1166 to #1175, after finished crawl runs and two pushes) waited and was replaced | **Fixed here**: the group is on the `deploy` job; every run's `decide` job runs `scripts/deploy-watchdog.mjs` first, which cancels another run whose deploy job has waited 30 minutes with no runner (never one that is running). The site was on the 08:54 build until 12:46 | Run and job timestamps: #1165 job created 08:58:50, no runner, no step, cancelled 12:45:05; #1176 deployed at 12:46 |
| D | Deploy site: a waiting run replaced by a newer one (no job ran) | 11 more | #1119, 2026-10-06 01:53 | #1192, 2026-10-06 14:22 | By design: GitHub keeps one waiting run per group, and the newer run builds the newer tip | Nothing to fix | "Canceling since a higher priority waiting request for pages exists" |
| E | Build manifest check cancelled, mostly mid "Rebuild in a scratch copy" | 26 | #42, 2026-10-05 19:00 | #110, 2026-10-06 15:12 | By design: `cancel-in-progress: true`, and agents push in bursts; the newer run checks a newer tip. Every trigger was an agent push (the crawl pushes with `GITHUB_TOKEN`, which starts no workflow) | Nothing to fix | Annotation "Canceling since a higher priority waiting request for build-manifest exists" on all 26 |
| F | Price verification cancelled | 26 (21 with no job, 5 by the owner) | #1, 2026-08-12 | #109, 2026-08-20 | A burst of dispatches: each waiting run replaced the one before (failure mode 32 in the pipeline document); 5 cancelled by hand | Already guarded: own `price-verify` group, and CLAUDE.md says one dispatch at a time | Runs #18 to #51 on 2026-08-16 to 08-19 have no jobs; #1 and #105 to #109 say "The run was canceled by @yanakan19" |
| G | Crawl: "Commit rebuilt app" could not rebase | 3 | #561, 2026-10-03 | #592, 2026-10-04 | An agent pushed rebuilt generated files while the crawl rebuilt the same ones; the push script did not class `demo/sitemap.xml` | Yes: e1ec2707 (one manifest, builds refuse unlisted outputs), 0f754c53, page files out of git (2026-10-04), CLAUDE.md rules | "Could not rebase onto origin/... in a file that is neither generated nor a raw harvest snapshot" |
| H | GitHub could not give a runner (incident) | 6 | 2026-10-05 19:35 | 2026-10-05 20:58 | GitHub: "The job was not acquired by Runner of type hosted even after multiple attempts" | Outside our control; each workflow's next run healed it (crawl guard #667, #668; deploy #1092, #1093; build manifest #49; WebKit layout #64) | Annotations |
| I | Crawl: freshness check failed | 2 | #577, 2026-10-03 14:49 | #588, 2026-10-03 21:03 | Working as designed: Selfridges answered but 100 to 106 of its shown listings were over 48 hours old | Yes: 13a1aeaf (what #577 showed); green since | Annotation names Selfridges |
| J | App builds: `npm ci` exit 127 in both jobs | 1 | #2, 2026-10-04 | #2 | `scripts/retry.sh` called from `apps/` | Yes: 3523c700, with a workflow rule that every script a step runs exists from its working directory | Annotation "exit code 127" |
| K | Deploy site: `configure-pages` got GitHub's 503 | 1 | #937, 2026-10-03 | #937 | GitHub outage | Mitigated (failure mode 17): the next push, crawl run or half hourly check redeploys | "No server is currently available to service your request" |
| L | WebKit layout check: filter panel height -1 on /brands/lattafa | 1 | #18, 2026-10-03 00:28 | #18 | The panel was measured before it opened; green 15 minutes later | Yes: the test now waits for `#ps-filters[open]` (rewritten with the filters revamp, 070be3ae); 79 green runs since | Log |
| M | Price verification: currency probe could not read escentual.com's robots.txt | 1 | #11, 2026-08-15 | #11 | By design: the probe holds off rather than assume it is welcome, and is deliberately not `continue-on-error` | Nothing to fix | Log |
| N | Crawl cancelled by a waiting dispatch | 1 | #556, 2026-10-03 | #556 | A dispatch burst (failure mode 32) | Already guarded (CLAUDE.md, guard ignores one shop commits) | Annotation |

Totals: 183 failed or cancelled runs; 108 were real failures (A, B, G to M),
the other 75 a waiting run replaced (C to F, N) or cancelled by hand.

## Tests failing on the tip

The whole suite was run on the tip (e378e220) in 20 batches of 12 files,
one fork each: 236 files, 6,092 tests, two failures, both also failing
before the history rewrite. Neither is in the harvest gate, so each only
turned the crawl's "Test everything else" step yellow.

| Test | What failed | Root cause | Fix |
|---|---|---|---|
| `tests/unstatedStrengthEvidence.test.ts`, "shows no Commodity perfume from Cult Beauty" | Expected an empty list; the built catalogue now has three Commodity "Scent Space ... Discovery Kit" gift sets from Cult Beauty, each "Not stated" | Root cause 1: it pinned today's listings (none) instead of the rule (no strength is put on a Commodity product there). The kits arrived with the Sets and Oils work and follow the rule | Asserts the rule: every Commodity product from Cult Beauty is "Not stated" and a gift set, never a single bottle |
| `tests/setPageBrowser.test.ts`, "opens the bottle page from the value line" | "Test timed out in 5000ms" | Root cause 6: vitest's default 5 s for a test that loads the built page in Chromium, clicks, then sleeps a fixed 500 ms; it passes or fails on machine load | `testTimeout: 30_000` and `hookTimeout: 60_000` in `vitest.config.ts` for every test; this test waits for the new address and for the set block to go instead of sleeping |

### 9 Oct 2026: four more, none in the harvest gate

| Test | What failed | Root cause | Fix |
|---|---|---|---|
| `tests/productNameNoise.test.ts`, "no pair differing only by a pipe segment" | Three Commodity bottles twice: "Gold Expressive" and "Gold \| Balanced & Expressive" (also Juice, Milk) | A new shop (Bloom Perfumery) names Commodity's middle variant "Balanced & Expressive"; `displayName` did not fold it, so the bottle was listed a second time | Source: `displayName` reads that exact phrase as Expressive, for Commodity only; regression tests in `tests/productName.test.ts` |
| `tests/perfumeOil.test.ts`, "counts the owner's reviewed oils" | No Ortigia 10ml oil found | Nicchia Luxury switched its titles to Italian on 8 Oct ("Olio corpo profumato roll-on 10 ml"); the reviewed oil rule read only "Perfume Oil", so all eleven oils left the Oils tab | Source: `isReviewedOil` reads both spellings and the strength follows the rule; a test with both languages |
| `tests/setsOilsGuardrails.test.ts`, "guard 2 holds on the real catalogue" | Three barcodes on a bottle and a set | Two causes. Direct Cosmetics writes a set as two sized items with no "+" ("Spray 50ml Shower Cream 200ml", "Spray 50ml Purse Spray 10ml"), which the set classifier missed; and two shops genuinely disagree on one barcode (Kilian's refillable 50ml with its case is a bottle at Scentsational and a gift set at Perfume Click) | Source: a set rule for a sized companion with no "+"; and `barcodeLosers` (`src/catalogue/kindGuards.ts`) keeps a disputed barcode on the bottle and drops it from the other kind in the build, which says so in its log. Tests for both |
| `tests/idAliasesAppendOnly.test.ts`, "resolves every reference key to a page" | Two new keys without a page, one fewer than the fixture | Root cause 1: it pinned the list of keys without a page, which changes whenever a shop delists a product | The rule instead: no key without a page may be a product a shop still lists (read from the harvest snapshots); the fixture keeps naming only keys without a page |

## Root causes

**1. Tests that pin live data.** A test that reads what the crawl writes (the
generated catalogue, the harvest report, the real registry joined to the
listings) and asserts a value the outside world sets (a shop's price, a
product's stock, which shops have listings) fails whenever a shop changes,
with no change to the code. While the whole suite gated the harvest, every
such change stopped the crawl: 36 runs in a row from #507 to #548, five days
without harvests. The gate is now the harvest's own tests and the rest of the
suite warns. New: `tests/workflowRules.test.ts` holds the gate to tests that
exist and import no generated module and read no harvest report, cursor or
price history checkpoint, so a data pinned test cannot slip back into it.
New too: `tests/testHygiene.test.ts` refuses a price literal in an assertion
in any test that imports a generated module (the `duplicateOfferRows`
shape), and `unstatedStrengthEvidence` now checks its rule rather than an
empty list.

**2. A diagnostic that reports its answer as a failure.** The one shop probe
exists to ask "does this shop let us in", and two thirds of its runs answered
"no" by going red, indistinguishable from a crash. The harvest now has its
own exit code for "nothing harvested", and the probe reports it as a warning.

**3. A concurrency group held by a job that has no runner.** `timeout-minutes`
caps a running job only. A workflow wide group means one job stuck in GitHub's
queue holds back every later run; with `cancel-in-progress: false` (needed so
a Pages deployment is never cut off mid flight), nothing ended the wait. The
group is now the deploy job's own, and the light `decide` job, outside it,
cancels a deploy that has waited 30 minutes for a runner.

**4. Push races between workflows and agents** (class G): fixed on
2026-10-04, see `docs/PIPELINE-FAILURE-MODES.md` rows 1, 2 and 9.

**5. GitHub's own outages** (classes H, K): nothing in the repository can
prevent them; every workflow that matters is retried by its next trigger.

**6. Browser tests on vitest's default 5 s timeout.** A page test spends most
of its time loading the built page; on a loaded machine that alone can pass
5 s. Some files set long timeouts per test, others none. The default is now
30 s for every test (hooks 60 s), held by `tests/testHygiene.test.ts`.

## Not found in the runs read

No run was killed for memory or disk, no `npm ci` failed on a lockfile or Node
version mismatch (every workflow pins Node 22), and no job hit its timeout in
the runs read.

## What only the owner can do

- Nothing new. The scheduler, Apify limit and routine time zone steps in
  `docs/OWNER-STEPS.md` section 7 still stand. If deploys are ever seen
  waiting for a runner again, GitHub support is the only route to the cause.

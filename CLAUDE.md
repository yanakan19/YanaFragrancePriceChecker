# Rules for agents and people pushing to this branch

`claude/scentday-retailer-registry-h92tth` is the live branch: GitHub Pages
deploys from it, and the catalogue crawl pushes to it several times a day.
Run #592 (2026-10-04) lost a rebuilt page because an agent pushed rebuilt
generated files while the crawl was building the same ones.

## The published site is built at deploy time

Since 2026-10-04 the page (`demo/index.html`, `demo/404.html`), its data files
(`demo/data/`), `demo/sitemap.xml`, `demo/ads.txt` and the page of each fixed
address (`demo/about.html`, `demo/about/legal.html` and the rest, so the host
answers 200; `scripts/build-route-pages.ts`) are **not committed**.
Since 2026-10-10 neither are the catalogue modules
(`demo/catalogue.generated.ts`, `demo/dormant.generated.ts`): the crawl's
`npm run catalogue:demo` commits what they are built from (the snapshots, the
address memories and the build record `data/catalogue-build.json`), and
everything that reads them replays them byte for byte from those
(`scripts/ensure-catalogue-built.ts`; `scripts/catalogueBuild.ts` says how).
They are gitignored, and `.github/workflows/deploy-pages.yml` replays the
catalogue and builds the rest with `npm run demo` from the committed source
and `demo/*.generated.ts`, checks the build, and only then publishes it. A push or a manual run always
deploys. A completed crawl first runs a light check job
(`scripts/deploy-decision.mjs`) and deploys only when the page could change.

- Locally, `npm run demo` builds the page (and the catalogue modules first,
  about 45 seconds when they are missing or stale); `npm test` builds both
  first when missing or stale. Run `npm run demo` once before running a page
  or catalogue test directly with `npx vitest run`.
- Never commit those paths (`git add -f` included). `scripts/commit-and-push.sh`
  refuses them.
- Since 2026-10-13 the deploy also writes a page per priced UK product, brand,
  shop and note (`scripts/build-leaf-pages.ts`; code and styles are
  `demo/assets/app.<hash>.js|css`). **The sitemap lists only addresses that
  answer 200** (a file of their own), and **the deploy output must stay under
  `DEPLOY_BUDGET_BYTES`** (700 MB, `scripts/leafPages.ts`); the deploy's
  `build-leaf-pages.ts --check` enforces both.

## Generated files

`scripts/generated-files.txt` lists every file a build or a workflow writes
(the rebuilt `demo/*.generated.ts`, the price history checkpoint, the harvest
snapshots and reports, and the "deploy" files above).

1. **Never edit a generated file by hand.** Change its source and rebuild.
2. **Do not commit regenerated files unless your change needs them.** If you
   changed only tests, docs, scripts or workflows, leave `demo/*.generated.ts`,
   `data/catalogue-build.json`, `data/id-aliases.json`,
   `data/product-slugs.json`, `data/set-match-report.json` and
   `data/price-history-checkpoint.json` out of
   your commit (`git checkout -- <file>` after a local build). The crawl
   rebuilds and commits them within hours anyway.
3. **When your change does need them** (you changed something they are built
   from: the build scripts, `src/`, the catalogue code), run `npm run rebuild`
   (or the steps you need: `npm run catalogue:demo`, `npm run deals:build`,
   `npm run catalogue:history`) and commit, with your change, those of
   `demo/deals.generated.ts`, `demo/priceHistory.generated.ts`,
   `data/catalogue-build.json`, `data/id-aliases.json`,
   `data/product-slugs.json`, `data/set-match-report.json` and
   `data/price-history-checkpoint.json` that changed (never the catalogue
   modules, which are not committed). A change that only
   alters how the page looks (`demo/*.ts`, `demo/template.html`) needs none of
   them: the deploy builds the page.
   **The deploy's replay of the catalogue never writes a memory**: if your
   change would give a product a new address or alias and you did not commit
   the rebuilt memories and `data/catalogue-build.json`, the deploy (and
   `npm test`) refuses to build and the site stays as it was until you do.
   **Memory files:** `data/product-slugs.json` (a product's published address,
   `/<brand>_<name>_<volume>`) and `data/id-aliases.json` (where a merged id now
   lives) are append only memories: the build only adds to them. Never delete or
   change an entry and never reassign a slug, or a published link breaks. See
   `docs/PRODUCT-URLS.md`.
   `data/note-aliases.json` (which note spellings are one note, and so where an
   old `/notes/<slug>` now opens) is the same kind of memory, written by people
   and reviewed, not by the build: append only, see `docs/NOTES-PLAN.md`.
4. **A new generated file needs a line in `scripts/generated-files.txt`** in
   the same commit (and in `.gitignore` if it is a "deploy" file). Builds write
   through `writeGenerated` (`scripts/generatedFiles.ts`), which refuses an
   unlisted path, and the crawl commits exactly the listed "rebuild" paths.
5. **On a merge conflict in a generated file, do not merge it by hand.** Take
   either side, rebuild, and stage the result.

## Tests

- A new `tests/*.test.ts` needs a line in `scripts/test-sets.txt`
  (`npx tsx scripts/testSets.ts suggest` prints it): `data` tests read what
  the crawl writes and run in the crawl after its rebuild (`npm run test:data`);
  `code` tests run on every push and pull request (`.github/workflows/tests.yml`,
  `npm run test:code`). `tests/testSets.test.ts` fails for a file in neither.
- `npm test` is the chunked runner over both sets (`scripts/run-tests-chunked.sh
  --set data --set code`: about 20 files per vitest process, each with a 4 GB
  heap ceiling, `TEST_HEAP_MB`). Never run the whole suite in one vitest
  process; one file is `npx vitest run tests/<name>.test.ts`.
- To stop your run, use the `kill <pid>` line the runner prints at its start.
  Never `pkill vitest` or `pkill node`: other agents' runs share this machine.
- Test the rule, never the figure: a test that reads what the crawl writes
  must not pin a count, a price, a product or a shop the next harvest can
  change (`docs/PIPELINE-FAILURE-MODES.md` row 44; `tests/testHygiene.test.ts`
  refuses a price literal). Every test browser starts through `launchChromium`
  or `launchWebkit` (`scripts/a11y-audit.ts`), never `chromium.launch()` (the
  same test refuses it).
- A data check that judges what shops listed (not a guard of structure) is
  written with `softIt` or `softly` (`tests/support/softCheck.ts`): strict on a
  machine and on every push, but in the crawl a failed assertion is a finding in
  `data/soft-test-report.json` and a warning, not a red run, unless more than 4
  different checks find something at once. Never for a memory, an id alias, the
  sitemap or the deploy budget (`tests/softTestReport.test.ts`; row 61 of
  `docs/PIPELINE-FAILURE-MODES.md`).
- The whole repository type checks on every push (`tests.yml`, job
  `typecheck`): run `npx tsc --noEmit -p tsconfig.json` before you push.

## Worktrees and disk

- One worktree per task, cut from the live tip, removed when the task is done
  (`git worktree remove <path>`). A checkout with its build output is about
  410 MB (`dist-demo/` 300, `demo/data/` 70); never copy the repository. The
  session start hook warns under 3 GB free and when the shared `.git` holds
  repack garbage (`git count-objects -v`).

## Destructive jobs (history rewrite, branch deletion)

The owner allowed two destructive jobs (12 Oct 2026) on one condition: **a fall
back copy of the whole repository exists on origin before the job runs, and
stays until the owner says it can go.**

- Before rewriting the live branch's history: `scripts/backup-before-destructive.sh
  rewrite` (pushes the exact tip to `backup/pre-rewrite-YYYYMMDD-HHMM`; the whole
  old history stays reachable from it). Pause the workflows that push to the
  branch first, verify the new tip's tree is byte identical to the old tip's tree
  and that the memories and price history are unchanged, force push only with
  `--force-with-lease=<branch>:<old tip>`, re-enable the workflows, deploy once
  and check the site. Never delete a `backup/*` branch yourself.
- Before deleting a remote branch: `scripts/backup-before-destructive.sh delete
  <branch>` (pushes a tag `archive/<branch>-YYYYMMDD` at its tip, so its commits
  stay reachable). Never delete the live branch, a `backup/*` branch or an
  `archive/*` tag or branch.
- The guard `.claude/hooks/require-backup.sh` blocks both jobs until the copy is
  on origin (a `backup/pre-rewrite-*` branch from the last 24 hours, or an
  `archive/<branch>-*` tag or branch at the tip or a commit containing it; when
  the tag push answers HTTP 403, make the archive as a branch with the GitHub
  MCP `create_branch` tool). Record each job, with the restore line the script
  prints, in `docs/OWNER-STEPS.md` 7d in the same commit.
- `.claude/settings.json` holds the allow rules; only the owner edits it
  (`docs/claude-settings.proposed.json` is the reviewed version).

## Update history

The home page's update history is `demo/changelog.ts` (owner request,
2026-10-06). `tests/changelog.test.ts` enforces the rules.

- **One entry per day.** Never two entries with the same date, never an old
  style entry with a `title` and `points`. An entry is
  `{ version, date: '6 Oct 2026', groups: [{ heading, points }] }`.
- **Add your change to today's entry**, under the heading that fits it best
  (`New`, `Products and Matching`, `Fixes`, or another short heading; as few
  groups as possible, one is fine). Create today's entry at the top if there
  is none. Today's entry takes the version of your release, the next minor
  after the previous entry's.
- **Only major changes a visitor would notice get a line.** Tests, docs,
  scripts, workflows, pipeline work, rebuilds and small tweaks get none, and a
  commit that only does those does not touch the file.
- Limits: up to 4 groups, a heading of at most 24 characters, up to 8 points
  per group and 12 per day, a point of at most 50 characters, no hyphens or
  dashes, plain British English. On a busy day fold related changes into one
  line or drop the least noticeable.
- On a merge conflict in the file, keep both sides' lines inside one entry
  for the day.

## Pushing

- Fetch and merge the branch just before you push; never force push.
- Stage files by name, never `git add -A`.
- Workflows push only through `scripts/commit-and-push.sh`; a new workflow
  that commits must too, and must share a concurrency group with any workflow
  that commits the same files (`tests/workflowRules.test.ts` checks both).
- Every workflow declares `permissions:` with the least it needs
  (`contents: write` only where it commits; `pages`, `id-token` and
  `actions: write` only in the deploy); the same test fails without a block.
- A one shop crawl dispatch (`harvest_shop`) holds the crawl's concurrency
  group: dispatch them one at a time, not in a burst.

More: `docs/PIPELINE-FAILURE-MODES.md` (what can break the data pipeline and
what guards it), `docs/SITE-AUDIT-2026-10-12.md` (the measurements behind these
rules and every past mistake with its guard), `docs/OWNER-STEPS.md` (what only
the owner can do).

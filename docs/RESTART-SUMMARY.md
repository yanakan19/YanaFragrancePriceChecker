# Restart summary (11 Nov 2026)

Read this first in a fresh chat, then `CLAUDE.md`. Nothing here is a secret.

## What the project is
PriceSniffs (pricesniffs.space, folder `YanaFragrancePriceChecker`) compares the
price of the same fragrance across many shops, delivery included. It is a static
site built from crawled shop data: UK at `/`, USA at `/us/`, India at `/in/`,
Canada as a beta. Code is TypeScript (`src/`, `scripts/`, `demo/`), tests are
vitest (`tests/`), data lives in `data/`.

## Branch and deploy rules
`claude/scentday-retailer-registry-h92tth` is the live branch: GitHub Pages
deploys from it and the crawl pushes to it several times a day. Work in one
worktree per task cut from the live tip, remove it after. Fetch and merge just
before each push, never force push, stage files by name. The page, its data,
sitemap, route pages and the catalogue modules are built at deploy time and are
never committed; the crawl commits snapshots, memories and the build record.
Memory files (`data/product-slugs.json`, `id-aliases.json`, `note-aliases.json`)
are append only. Agents must not run or dispatch crawls, and the crawler is
always PriceSniffsBot, obeys robots.txt and never evades a block.

## Crawl and regions
`catalogue-daily.yml` (UK, every half hour in turns, a sweep of about 100 shops
in eight lanes with a time budget per shop), `catalogue-us.yml`, `catalogue-in.yml`
and `catalogue-ca.yml` once a day. Each crawl harvests, commits the snapshots,
rebuilds, then runs the data tests and the soft check report. `deploy-pages.yml`
replays the catalogue, builds, checks and publishes after a crawl only when the
page could change. Candidate shops: `docs/SHOP-CANDIDATES-2026-11-02.md`.

## Guards added October to November 2026
- Generated files list (`scripts/generated-files.txt`) and `writeGenerated`.
- Deploy built at deploy time, deploy budget 700 MB, sitemap lists only 200 pages.
- Backup before history rewrite or branch deletion (`require-backup.sh`).
- Chunked test runner and test sets (`scripts/test-sets.txt`).
- Soft data checks (`softIt`, `softly`): a finding is a warning; the crawl fails
  only above 4 different findings at once (rows 60 to 67 of
  `docs/PIPELINE-FAILURE-MODES.md`). Freshness fails a shop only after 3 harvests
  without improvement; a shop that hits its time budget twice gets more time.
- Notes parser fix at the source (10 Nov) and the unnamed sets check judging the
  shape, not a shop's wording (11 Nov).
- Daily failure digest, weekly health, update history rules (`demo/changelog.ts`).

## Open owner only items (`docs/OWNER-STEPS.md`)
Fly.io billing off (1); Supabase accounts (2); postal address and ICO (3);
price drop emails with Resend (4); ads resubmission and ad units (5); profile
photos (6); outside scheduler and Apify limit (7); developer dashboard (8);
Notino saved pages (9); US, India and Canada owner steps (10); the Brave Search
API key for Fragrantica links (new, step 5 of the last job). Ask the owner, never
for a key in chat.

## Start a fresh chat cheaply
1. Say: "Read docs/RESTART-SUMMARY.md and CLAUDE.md, then do <one task>."
2. One task per chat; ask for a report of at most 15 lines.
3. Use `git worktree add ../wt -b <name> origin/<live branch>` and symlink
   `node_modules`; run `npx tsx scripts/ensure-catalogue-built.ts` once (about
   75 s), then one test file at a time with `npx vitest run tests/<name>.test.ts`.
4. For a failed crawl read only the failing step: `gh api repos/<owner>/<repo>/actions/jobs/<id>/logs | grep "soft data\|##\[error\]"`.
5. Before a push: `npx tsc --noEmit -p tsconfig.json` (about 1 minute).

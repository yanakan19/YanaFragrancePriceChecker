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
They are gitignored, and `.github/workflows/deploy-pages.yml` builds them with
`npm run demo` from the committed source and `demo/*.generated.ts`, checks
the build, and only then publishes it. A push or a manual run always
deploys. A completed crawl first runs a light check job
(`scripts/deploy-decision.mjs`) and deploys only when the page could change.

- Locally, `npm run demo` builds the page; `npm test` builds it first when it
  is missing or stale. Run `npm run demo` once before running a page test
  directly with `npx vitest run`.
- Never commit those paths (`git add -f` included). `scripts/commit-and-push.sh`
  refuses them.

## Generated files

`scripts/generated-files.txt` lists every file a build or a workflow writes
(the rebuilt `demo/*.generated.ts`, the price history checkpoint, the harvest
snapshots and reports, and the "deploy" files above).

1. **Never edit a generated file by hand.** Change its source and rebuild.
2. **Do not commit regenerated files unless your change needs them.** If you
   changed only tests, docs, scripts or workflows, leave `demo/*.generated.ts`,
   `data/id-aliases.json`, `data/product-slugs.json` and
   `data/price-history-checkpoint.json` out of
   your commit (`git checkout -- <file>` after a local build). The crawl
   rebuilds and commits them within hours anyway.
3. **When your change does need them** (you changed something they are built
   from: the build scripts, `src/`, the catalogue code), run `npm run rebuild`
   (or the steps you need: `npm run catalogue:demo`, `npm run deals:build`,
   `npm run catalogue:history`) and commit, with your change, those of
   `demo/*.generated.ts`, `data/id-aliases.json`, `data/product-slugs.json`
   and `data/price-history-checkpoint.json` that changed. A change that only
   alters how the page looks (`demo/*.ts`, `demo/template.html`) needs none of
   them: the deploy builds the page.
   **Memory files:** `data/product-slugs.json` (a product's published address,
   `/<brand>_<name>_<volume>`) and `data/id-aliases.json` (where a merged id now
   lives) are append only memories: the build only adds to them. Never delete or
   change an entry and never reassign a slug, or a published link breaks. See
   `docs/PRODUCT-URLS.md`.
4. **A new generated file needs a line in `scripts/generated-files.txt`** in
   the same commit (and in `.gitignore` if it is a "deploy" file). Builds write
   through `writeGenerated` (`scripts/generatedFiles.ts`), which refuses an
   unlisted path, and the crawl commits exactly the listed "rebuild" paths.
5. **On a merge conflict in a generated file, do not merge it by hand.** Take
   either side, rebuild, and stage the result.

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
- A one shop crawl dispatch (`harvest_shop`) holds the crawl's concurrency
  group: dispatch them one at a time, not in a burst.

More: `docs/PIPELINE-FAILURE-MODES.md` (what can break the data pipeline and
what guards it), `docs/OWNER-STEPS.md` (what only the owner can do).

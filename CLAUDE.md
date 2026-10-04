# Rules for agents and people pushing to this branch

`claude/scentday-retailer-registry-h92tth` is the live branch: GitHub Pages
deploys from it, and the catalogue crawl pushes to it several times a day.
Run #592 (2026-10-04) lost a rebuilt page because an agent pushed rebuilt
generated files while the crawl was building the same ones.

## The published site is built at deploy time

Since 2026-10-04 the page (`demo/index.html`, `demo/404.html`), its data files
(`demo/data/`), `demo/sitemap.xml` and `demo/ads.txt` are **not committed**.
They are gitignored, and `.github/workflows/deploy-pages.yml` builds them with
`npm run demo` from the committed source and `demo/*.generated.ts`, checks
the build, and only then publishes it. A push that can change the page
deploys by itself, and so does every completed crawl.

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
   `data/id-aliases.json` and `data/price-history-checkpoint.json` out of
   your commit (`git checkout -- <file>` after a local build). The crawl
   rebuilds and commits them within hours anyway.
3. **When your change does need them** (you changed something they are built
   from: the build scripts, `src/`, the catalogue code), run `npm run rebuild`
   (or the steps you need: `npm run catalogue:demo`, `npm run deals:build`,
   `npm run catalogue:history`) and commit, with your change, those of
   `demo/*.generated.ts`, `data/id-aliases.json` and
   `data/price-history-checkpoint.json` that changed. A change that only
   alters how the page looks (`demo/*.ts`, `demo/template.html`) needs none of
   them: the deploy builds the page.
4. **A new generated file needs a line in `scripts/generated-files.txt`** in
   the same commit (and in `.gitignore` if it is a "deploy" file). Builds write
   through `writeGenerated` (`scripts/generatedFiles.ts`), which refuses an
   unlisted path, and the crawl commits exactly the listed "rebuild" paths.
5. **On a merge conflict in a generated file, do not merge it by hand.** Take
   either side, rebuild, and stage the result.

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

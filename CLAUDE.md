# Rules for agents and people pushing to this branch

`claude/scentday-retailer-registry-h92tth` is the live branch: GitHub Pages
deploys `demo/` from it, and the catalogue crawl pushes to it several times a
day. Run #592 (2026-10-04) lost a rebuilt page because an agent pushed rebuilt
generated files while the crawl was building the same ones.

## Generated files

`scripts/generated-files.txt` lists every file a build or a workflow writes
and commits (the page, `demo/data/`, the sitemap, `demo/*.generated.ts`, the
price history checkpoint, the harvest snapshots and reports).

1. **Never edit a generated file by hand.** Change its source and rebuild.
2. **Do not commit regenerated files unless your change needs them.** If you
   changed only tests, docs, scripts or workflows, leave `demo/index.html`,
   `demo/404.html`, `demo/data/`, `demo/sitemap.xml` and `demo/*.generated.ts`
   out of your commit (`git checkout -- <file>` after a local build). The
   crawl rebuilds and commits them within hours anyway.
3. **When your change does need them** (you changed something the page shows,
   `demo/*.ts`, `src/`, the catalogue code), run `npm run rebuild` (or the
   steps you need: `npm run catalogue:demo`, `npm run deals:build`,
   `npm run demo`), then `git checkout -- demo/sitemap.xml` unless you meant to
   change it, and commit the rebuilt files with your change.
4. **A new generated file needs a line in `scripts/generated-files.txt`** in
   the same commit. Builds write through `writeGenerated`
   (`scripts/generatedFiles.ts`), which refuses an unlisted path, and the
   crawl commits exactly the listed "rebuild" paths.
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

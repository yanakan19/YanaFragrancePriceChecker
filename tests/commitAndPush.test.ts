// Integration tests for scripts/commit-and-push.sh, run against real scratch
// git repositories rather than mocks — the behaviour under test (rebase
// conflict resolution, ours/theirs semantics, push retry) only exists as an
// interaction between bash and git, so a unit test of parsed-out logic would
// not actually cover it.
//
// These exist because of run #236 (2026-08-18): a scheduled 70-90 minute
// catalogue crawl died at the final push, discarding every price it had
// harvested, after a concurrent push landed mid-run and the conflict
// resolution the script attempted did not complete cleanly. See
// scripts/commit-and-push.sh's own comments for the post-mortem. This file
// exercises the four scenarios that matter: a generated-file conflict
// resolves and pushes; the same, when the regenerate also rewrites a tracked
// file no caller stages (runs #266 and #268, 2026-08-20, which the first
// three cases here all passed straight through); a raw-snapshot conflict
// keeps the *incoming* side (not the run's own copy — that direction was
// backwards until this fix); and a genuine source conflict aborts loudly with
// nothing pushed.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/commit-and-push.sh', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../scripts/generated-files.txt', import.meta.url));

// Since 2026-10-04 this repository builds its page at deploy time and never
// commits it ("deploy" in scripts/generated-files.txt), and the script refuses
// a caller that names it (last test below). The page handling these tests
// cover (the data folder staged with the page, the freshness refusal, the
// rebuild after a rebase, a conflicted sitemap) is still the script's, for a
// repository that commits its page, so they run against the real manifest
// with its "deploy" lines read as "rebuild", as they were until that day.
const PAGE_COMMITTING_MANIFEST = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-and-push-manifest-'));
  const path = join(dir, 'generated-files.txt');
  writeFileSync(path, readFileSync(MANIFEST, 'utf8').replace(/^deploy(\s)/gm, 'rebuild$1'));
  return path;
})();

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** `extra` seeds further tracked files into the base commit. It exists for the
 * sitemap case below: reproducing that failure needs a second tracked file
 * that the build rewrites but no caller of the script ever stages, and a
 * one-file base commit cannot express that. */
function initRepoWithFile(
  dir: string,
  relPath: string,
  content: string,
  gitignore?: string,
  extra?: Record<string, string>,
) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'master']);
  git(dir, ['config', 'user.email', 'seed@test']);
  git(dir, ['config', 'user.name', 'seed']);
  if (gitignore) writeFileSync(join(dir, '.gitignore'), gitignore);
  for (const [rel, body] of Object.entries({ [relPath]: content, ...(extra ?? {}) })) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
}

/** A fresh {remote, worker, concurrent} trio sharing one base commit, with
 * `worker` cloned before `concurrent` pushes — reproducing a scheduled run
 * that checked the branch out long before another push landed on it. */
function setupTrio(base: {
  relPath: string;
  content: string;
  gitignore?: string;
  extra?: Record<string, string>;
}) {
  const root = mkdtempSync(join(tmpdir(), 'commit-and-push-test-'));
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  initRepoWithFile(seed, base.relPath, base.content, base.gitignore, base.extra);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(seed, ['push', '-q', remote, 'master']);

  const worker = join(root, 'worker');
  const concurrent = join(root, 'concurrent');
  execFileSync('git', ['clone', '-q', remote, worker]);
  execFileSync('git', ['clone', '-q', remote, concurrent]);
  git(worker, ['config', 'user.email', 'bot@test']);
  git(worker, ['config', 'user.name', 'pricesniffs-bot']);
  git(concurrent, ['config', 'user.email', 'concurrent@test']);
  git(concurrent, ['config', 'user.name', 'concurrent']);

  return { root, remote, worker, concurrent };
}

function pushConcurrentChange(concurrent: string, relPath: string, content: string) {
  writeFileSync(join(concurrent, relPath), content);
  git(concurrent, ['add', '-A']);
  git(concurrent, ['commit', '-q', '-m', 'concurrent push']);
  git(concurrent, ['push', '-q', 'origin', 'master']);
}

/** Runs the script and returns its exit status plus stdout+stderr combined —
 * the script's own progress and error messages (including git's own, e.g.
 * the "ignored by one of your .gitignore files" warning under test) go to
 * stderr, so a helper that only captured stdout would silently miss them. */
function runScript(
  worker: string,
  args: string[],
  env: Record<string, string> = {},
): { status: number; output: string } {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: worker,
    encoding: 'utf8',
    env: { ...process.env, GENERATED_FILES_MANIFEST: PAGE_COMMITTING_MANIFEST, ...env },
  });
  return { status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('scripts/commit-and-push.sh', () => {
  it('resolves a generated-file conflict via regenerate and pushes, without ever staging gitignored build output', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'demo/catalogue.generated.ts',
      content: 'BASE\n',
      gitignore: 'dist-demo/\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'demo/catalogue.generated.ts', 'INCOMING-FROM-CONCURRENT\n');

    writeFileSync(join(worker, 'demo/catalogue.generated.ts'), 'OUR-HARVEST-DATA\n');

    // Mirrors the real build: rewrites the generated file and, as a real side
    // effect of `npm run demo`, writes the gitignored dist-demo/artifact.html
    // that no caller of this script ever commits.
    const { status, output } = runScript(worker, ['Harvest: sim', 'demo/catalogue.generated.ts'], {
      REGENERATE:
        'echo "REGENERATED-FROM-MERGED-INPUTS" > demo/catalogue.generated.ts && mkdir -p dist-demo && echo built > dist-demo/artifact.html',
    });

    expect(status).toBe(0);
    expect(output).toContain('Pushed on attempt 2');
    // The bug fixed here: this string used to appear because the script
    // unconditionally tried to `git add` the gitignored dist-demo/artifact.html.
    expect(output).not.toContain('ignored by one of your .gitignore files');

    const pushed = git(worker, ['show', 'origin/master:demo/catalogue.generated.ts']);
    expect(pushed).toBe('REGENERATED-FROM-MERGED-INPUTS');
    void remote;
  });

  // Runs #266 (job 96398950549) and #268 (job 96452805773), both 2026-08-20.
  // Two complete harvests — 10:46:58→11:58:02 and 14:02:07→15:12:19 by the
  // step timestamps — were thrown away here, and the test above did not catch
  // it because its REGENERATE only ever wrote files the caller had named.
  //
  // The real `npm run demo` ends in `tsx scripts/build-sitemap.ts`, which
  // writes demo/sitemap.xml. That file is tracked, and it is passed to this
  // script by none of the eight call sites in catalogue-daily.yml nor by the
  // ninth in price-verify.yml — so after the regenerate it sits in the working
  // tree modified and unstaged. Both runs
  // logged "demo/sitemap.xml  14727 URLs" (#266, 12:02:13.49) and
  // "demo/sitemap.xml  15257 URLs" (#268, 15:16:44.87) less than half a second
  // before dying.
  //
  // `git rebase --continue` then refuses with
  //
  //     You must edit all merge conflicts and then
  //     mark them as resolved using git add
  //
  // which is a misleading message: every conflict *had* been staged. That text
  // is what git prints for an unstaged change to a tracked file, not for an
  // unmerged index entry — verified against git 2.43.0 locally and matching
  // the runners' 2.54.0 (#266) and 2.55.0 (#268). The proof in the runs' own
  // logs is the line after it: the script reported "Could not start a rebase",
  // and that branch is only reachable when `git diff --diff-filter=U` comes
  // back *empty*, i.e. nothing was unmerged at all.
  it('pushes when the regenerate also rewrites a tracked file no caller stages', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'demo/catalogue.generated.ts',
      content: 'BASE\n',
      gitignore: 'dist-demo/\n',
      extra: { 'demo/sitemap.xml': '<urlset>BASE</urlset>\n' },
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'demo/catalogue.generated.ts', 'INCOMING-FROM-CONCURRENT\n');
    writeFileSync(join(worker, 'demo/catalogue.generated.ts'), 'OUR-HARVEST-DATA\n');

    // The shape of the real build: it rewrites the generated file the caller
    // asked for, the gitignored artefact nobody commits, *and* the tracked
    // sitemap nobody passes.
    const { status, output } = runScript(worker, ['Harvest: sim', 'demo/catalogue.generated.ts'], {
      REGENERATE:
        'echo "REGENERATED-FROM-MERGED-INPUTS" > demo/catalogue.generated.ts' +
        ' && mkdir -p dist-demo && echo built > dist-demo/artifact.html' +
        ' && echo "<urlset>REBUILT</urlset>" > demo/sitemap.xml',
    });

    expect(output).not.toContain('You must edit all merge conflicts');
    expect(output).not.toContain('Nothing was pushed');
    expect(status).toBe(0);
    expect(output).toContain('Pushed on attempt 2');

    const pushed = git(worker, ['show', 'origin/master:demo/catalogue.generated.ts']);
    expect(pushed).toBe('REGENERATED-FROM-MERGED-INPUTS');

    // The build collateral is discarded rather than swept into the commit.
    // Staging it instead would work as far as the rebase is concerned, but it
    // would put a file into the harvest commit that the caller deliberately
    // did not list — and demo/sitemap.xml is listed by no invocation of this
    // script anywhere under .github/workflows/, so a harvest has never carried
    // it and must not start now.
    const pushedSitemap = git(worker, ['show', 'origin/master:demo/sitemap.xml']);
    expect(pushedSitemap).toBe('<urlset>BASE</urlset>');
    void remote;
  });

  it('resolves a raw-snapshot conflict by keeping the incoming side, not the run\'s own copy', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'data/catalogue/allbeauty.json',
      content: '{"v":"BASE"}\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'data/catalogue/allbeauty.json', '{"v":"INCOMING-SNAPSHOT"}\n');
    writeFileSync(join(worker, 'data/catalogue/allbeauty.json'), '{"v":"OUR-SNAPSHOT"}\n');

    const { status, output } = runScript(worker, ['Harvest: sim', 'data/catalogue']);

    expect(status).toBe(0);
    expect(output).toContain('Pushed on attempt 2');

    const pushed = git(worker, ['show', 'origin/master:data/catalogue/allbeauty.json']);
    // This is the ours/theirs direction fix: `git rebase` swaps the usual
    // merge meaning of --ours/--theirs, and the previous version of this
    // script had it backwards, silently keeping the run's own snapshot
    // instead of the incoming one its own comments say it keeps.
    expect(pushed).toBe('{"v":"INCOMING-SNAPSHOT"}');
    void remote;
  });

  it('refuses to auto-resolve a conflict in a file that is neither generated nor a raw snapshot, and pushes nothing', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'src/config/retailers.ts',
      content: 'export const RETAILERS = "BASE";\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'src/config/retailers.ts', 'export const RETAILERS = "HUMAN-EDIT";\n');
    writeFileSync(join(worker, 'src/config/retailers.ts'), 'export const RETAILERS = "BOT-WOULD-OVERWRITE";\n');

    const base = git(worker, ['rev-parse', 'HEAD']);
    const { status, output } = runScript(worker, ['Shipping terms: sim', 'src/config/retailers.ts']);

    expect(status).not.toBe(0);
    expect(output).toContain('Nothing was pushed');
    expect(output).toContain('machine-written source');

    const remoteContent = execSync(`git --git-dir="${remote}" show master:src/config/retailers.ts`, {
      encoding: 'utf8',
    });
    expect(remoteContent).toBe('export const RETAILERS = "HUMAN-EDIT";\n');

    // The workflow's next commit step must not inherit the commit that could
    // not land, nor bundle a registry edit nobody could push: the commit is
    // undone and a "manual" file goes back to the branch's version.
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(base);
    expect(readFileSync(join(worker, 'src/config/retailers.ts'), 'utf8')).toBe('export const RETAILERS = "BASE";\n');
    expect(git(worker, ['status', '--porcelain'])).toBe('');
  });
});

// Runs #388–#395 (2026-09-04/05). The rebuild step timed out before
// `npm run demo` ran, "Commit rebuilt app" pushed a new
// demo/catalogue.generated.ts beside the OLD demo/index.html (7465fe44), and
// tests/demoBuildFreshness.test.ts then failed every run after — which, since
// that test gates the harvest, froze live prices for over a day. The workflow
// now refuses to reach this script after a rebuild that did not finish; these
// cover the script's own lock on the same door, for any caller that forgets.
//
// The page and its freshness are simulated in the smallest shape that has the
// real property: a page is "built from" whatever src/app.ts said at the time,
// FRESHNESS_CHECK compares the two, and REGENERATE rebuilds the page from the
// src/app.ts on disk — exactly the relationship scripts/check-demo-freshness.ts
// and `npm run demo` have with the real bundle.
describe('scripts/commit-and-push.sh never pushes a demo/index.html that is stale against its source', () => {
  const PAGE_MATCHES_SOURCE = '[ "$(cat demo/index.html)" = "BUILT-FROM:$(cat src/app.ts)" ] || { echo "sim: stale" >&2; exit 2; }';
  const REBUILD_PAGE = 'echo "BUILT-FROM:$(cat src/app.ts)" > demo/index.html';

  it('refuses before committing when the page on disk is already stale, and leaves the tree as it found it', () => {
    const { root, worker } = setupTrio({
      relPath: 'demo/index.html',
      content: 'BUILT-FROM:OLDER-SOURCE\n',
      extra: { 'src/app.ts': 'BASE\n', 'demo/catalogue.generated.ts': 'BASE\n' },
    });
    cleanupDirs.push(root);

    writeFileSync(join(worker, 'demo/catalogue.generated.ts'), 'NEW-CATALOGUE\n');
    const before = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(
      worker,
      ['Rebuild demo: sim', 'demo/catalogue.generated.ts', 'demo/index.html'],
      { FRESHNESS_CHECK: PAGE_MATCHES_SOURCE },
    );

    expect(status).toBe(1);
    expect(output).toContain('Refusing to commit demo/index.html');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(before);
    expect(git(worker, ['rev-parse', 'origin/master'])).toBe(before);
    // Unstaged again rather than left half-done: the caller's change is still
    // in the working tree for a human to rebuild and commit properly.
    expect(git(worker, ['diff', '--cached', '--name-only'])).toBe('');
    expect(readFileSync(join(worker, 'demo/catalogue.generated.ts'), 'utf8')).toBe('NEW-CATALOGUE\n');
  });

  it('rebuilds the page after a clean rebase brings in a source change, and pushes it fresh in one commit', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'demo/index.html',
      content: 'BUILT-FROM:BASE\n',
      extra: { 'src/app.ts': 'BASE\n', 'demo/catalogue.generated.ts': 'BASE\n' },
    });
    cleanupDirs.push(root);

    // A different file from anything we stage, so the rebase is clean — the
    // path resolve_generated_conflicts never sees, and the one that used to
    // push a stale page without anyone looking.
    pushConcurrentChange(concurrent, 'src/app.ts', 'CHANGED-WHILE-WE-BUILT\n');
    writeFileSync(join(worker, 'demo/catalogue.generated.ts'), 'OUR-HARVEST-DATA\n');

    const { status, output } = runScript(
      worker,
      ['Rebuild demo: sim', 'demo/catalogue.generated.ts', 'demo/index.html'],
      { FRESHNESS_CHECK: PAGE_MATCHES_SOURCE, REGENERATE: REBUILD_PAGE },
    );

    expect(status).toBe(0);
    expect(output).toContain('rebuilding the page so it is not pushed stale');
    expect(output).toContain('Pushed on attempt 2');

    expect(git(worker, ['show', 'origin/master:demo/index.html'])).toBe('BUILT-FROM:CHANGED-WHILE-WE-BUILT');
    expect(git(worker, ['show', 'origin/master:demo/catalogue.generated.ts'])).toBe('OUR-HARVEST-DATA');
    // Amended into our own commit, not stacked as a second one.
    expect(git(worker, ['log', '--format=%s', 'origin/master'])).toBe('Rebuild demo: sim\nconcurrent push\nbase');
  });

  it('leaves a page alone after a clean rebase that touched nothing it was built from', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'demo/index.html',
      content: 'BUILT-FROM:BASE\n',
      extra: { 'src/app.ts': 'BASE\n', 'README.md': 'BASE\n', 'data/notes.json': '{"v":1}\n' },
    });
    cleanupDirs.push(root);

    // The concurrent push changes a file the page is not built from, and
    // which we do not stage: a clean rebase with nothing for the check to
    // object to. The rebuild must not fire — a needless `npm run demo` is a
    // minute or two per push, and a check that cries wolf gets removed.
    pushConcurrentChange(concurrent, 'README.md', 'DOCS-EDITED-CONCURRENTLY\n');
    writeFileSync(join(worker, 'data/notes.json'), '{"v":1,"ours":true}\n');

    const { status, output } = runScript(worker, ['Rebuild demo: sim', 'data/notes.json', 'demo/index.html'], {
      FRESHNESS_CHECK: PAGE_MATCHES_SOURCE,
      REGENERATE: 'echo "REGENERATE MUST NOT RUN" > demo/index.html',
    });

    expect(status).toBe(0);
    expect(output).toContain('Pushed on attempt 2');
    expect(output).not.toContain('rebuilding the page');
    expect(git(worker, ['show', 'origin/master:demo/index.html'])).toBe('BUILT-FROM:BASE');
    expect(git(worker, ['show', 'origin/master:data/notes.json'])).toBe('{"v":1,"ours":true}');
  });
});

// demo/index.html fetches its prices from demo/data/<module>.<hash>.json, and
// every build deletes the previous build's files (scripts/build-demo.ts). A
// page pushed without its folder, or a folder pushed without its deletions,
// is a site with no prices or a repository that grows by a catalogue a run.
describe('scripts/commit-and-push.sh commits the page\'s data folder with it', () => {
  const tree = (worker: string) => git(worker, ['ls-tree', '-r', '--name-only', 'origin/master', '--', 'demo/data']);

  it('stages demo/data, deletions included, whenever demo/index.html is named, even if the caller forgot it', () => {
    const { root, worker } = setupTrio({
      relPath: 'demo/index.html',
      content: 'PAGE:A\n',
      extra: { 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json': '["a"]' },
    });
    cleanupDirs.push(root);

    writeFileSync(join(worker, 'demo/index.html'), 'PAGE:B\n');
    rmSync(join(worker, 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json'));
    writeFileSync(join(worker, 'demo/data/catalogue.bbbbbbbbbbbbbbbb.json'), '["b"]');

    const { status, output } = runScript(worker, ['Rebuild demo: sim', 'demo/index.html'], { FRESHNESS_CHECK: 'true' });

    expect(status, output).toBe(0);
    expect(git(worker, ['show', 'origin/master:demo/index.html'])).toBe('PAGE:B');
    expect(tree(worker)).toBe('demo/data/catalogue.bbbbbbbbbbbbbbbb.json');
  });

  it('after a conflict with another run\'s build, pushes only the merged rebuild\'s data files', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'demo/index.html',
      content: 'PAGE:A\n',
      gitignore: 'dist-demo/\n',
      extra: { 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json': '["a"]' },
    });
    cleanupDirs.push(root);

    // Another run's build lands first: new page, A deleted, B added.
    rmSync(join(concurrent, 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json'));
    writeFileSync(join(concurrent, 'demo/data/catalogue.bbbbbbbbbbbbbbbb.json'), '["b"]');
    pushConcurrentChange(concurrent, 'demo/index.html', 'PAGE:B\n');

    // Ours, from older inputs: A deleted, C added.
    writeFileSync(join(worker, 'demo/index.html'), 'PAGE:C\n');
    rmSync(join(worker, 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json'));
    writeFileSync(join(worker, 'demo/data/catalogue.cccccccccccccccc.json'), '["c"]');

    // The rebuild does what build-demo.ts does: writes the merged build's
    // file and deletes every other one.
    const { status, output } = runScript(worker, ['Rebuild demo: sim', 'demo/index.html', 'demo/404.html', 'demo/data'], {
      FRESHNESS_CHECK: 'true',
      REGENERATE:
        'rm -f demo/data/*.json && echo \'["d"]\' > demo/data/catalogue.dddddddddddddddd.json && echo "PAGE:D" > demo/index.html',
    });

    expect(status, output).toBe(0);
    expect(output).toContain('Pushed on attempt 2');
    expect(git(worker, ['show', 'origin/master:demo/index.html'])).toBe('PAGE:D');
    expect(tree(worker)).toBe('demo/data/catalogue.dddddddddddddddd.json');
  });
});

// Run #592 (2026-10-04, job 111345364820). A full harvest had already pushed
// its prices (1028a0b); "Commit rebuilt app" then lost the race to an agent's
// push that had rebuilt the same page, and the rebase stopped on conflicts in
// demo/404.html, demo/catalogue.generated.ts, demo/deals.generated.ts,
// demo/index.html, demo/data (a rename/rename: both sides replaced the same
// content-hashed catalogue file with a different, ~70% similar one) and
// demo/sitemap.xml. Every one of them is build output, but the script did not
// know demo/sitemap.xml was, and refused: "Conflict in demo/sitemap.xml, which
// is neither a generated file nor a raw harvest snapshot". Three call sites in
// catalogue-daily.yml name the sitemap, so any two builds racing end this way.
describe('scripts/commit-and-push.sh after another build of the same page lands first (run #592)', () => {
  // Big enough, and alike enough, that git's rename detection pairs the old
  // hashed file with both new ones — the rename/rename conflict #592 hit.
  const catalogueJson = (variant: string) =>
    JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ id: `product-${i}`, price: i < 42 ? i : `${variant}-${i}` })), null, 1);

  it('rebuilds a conflicted sitemap with the rest of the page, including a rename/rename in demo/data, and pushes', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'demo/catalogue.generated.ts',
      content: 'BASE\n',
      gitignore: 'dist-demo/\n',
      extra: {
        'demo/sitemap.xml': '<urlset>BASE</urlset>\n',
        'demo/data/catalogue.aaaaaaaaaaaaaaaa.json': catalogueJson('a'),
      },
    });
    cleanupDirs.push(root);

    rmSync(join(concurrent, 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json'));
    writeFileSync(join(concurrent, 'demo/data/catalogue.bbbbbbbbbbbbbbbb.json'), catalogueJson('b'));
    writeFileSync(join(concurrent, 'demo/sitemap.xml'), '<urlset>INCOMING</urlset>\n');
    pushConcurrentChange(concurrent, 'demo/catalogue.generated.ts', 'INCOMING-FROM-CONCURRENT\n');

    writeFileSync(join(worker, 'demo/catalogue.generated.ts'), 'OUR-HARVEST-DATA\n');
    writeFileSync(join(worker, 'demo/sitemap.xml'), '<urlset>OURS</urlset>\n');
    rmSync(join(worker, 'demo/data/catalogue.aaaaaaaaaaaaaaaa.json'));
    writeFileSync(join(worker, 'demo/data/catalogue.cccccccccccccccc.json'), catalogueJson('c'));

    const { status, output } = runScript(
      worker,
      ['Rebuild demo: sim', 'demo/catalogue.generated.ts', 'demo/data', 'demo/sitemap.xml'],
      {
        REGENERATE:
          'echo "REGENERATED-FROM-MERGED-INPUTS" > demo/catalogue.generated.ts' +
          ' && rm -f demo/data/*.json && echo \'["d"]\' > demo/data/catalogue.dddddddddddddddd.json' +
          ' && echo "<urlset>REBUILT</urlset>" > demo/sitemap.xml',
      },
    );

    expect(output).not.toContain('neither a generated file nor a raw harvest snapshot');
    expect(status, output).toBe(0);
    expect(output).toContain('Pushed on attempt 2');
    expect(git(worker, ['show', 'origin/master:demo/catalogue.generated.ts'])).toBe('REGENERATED-FROM-MERGED-INPUTS');
    expect(git(worker, ['show', 'origin/master:demo/sitemap.xml'])).toBe('<urlset>REBUILT</urlset>');
    expect(git(worker, ['ls-tree', '-r', '--name-only', 'origin/master', '--', 'demo/data'])).toBe(
      'demo/data/catalogue.dddddddddddddddd.json',
    );
  });

  it('keeps the incoming test count when demo/testCount.generated.ts conflicts, as the suite on the branch counted it', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'demo/testCount.generated.ts',
      content: 'export const TEST_COUNT = 100;\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'demo/testCount.generated.ts', 'export const TEST_COUNT = 140;\n');
    writeFileSync(join(worker, 'demo/testCount.generated.ts'), 'export const TEST_COUNT = 120;\n');

    const { status, output } = runScript(worker, ['Rebuild demo: sim', 'demo/testCount.generated.ts']);

    expect(status, output).toBe(0);
    expect(git(worker, ['show', 'origin/master:demo/testCount.generated.ts'])).toBe('export const TEST_COUNT = 140;');
  });
});

// 2026-10-04: the script reads which files are rebuildable and which take the
// incoming side from scripts/generated-files.txt, the one list the build
// scripts and the workflows also use, instead of a copy typed into the script.
describe('scripts/commit-and-push.sh reads scripts/generated-files.txt', () => {
  it('rebuilds a file the manifest lists as rebuild, here demo/dormant.generated.ts, which the old hand list never had', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'demo/dormant.generated.ts',
      content: 'BASE\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'demo/dormant.generated.ts', 'INCOMING\n');
    writeFileSync(join(worker, 'demo/dormant.generated.ts'), 'OURS\n');

    const { status, output } = runScript(worker, ['Rebuild demo: sim', 'demo/dormant.generated.ts'], {
      REGENERATE: 'echo "REGENERATED" > demo/dormant.generated.ts',
    });

    expect(status, output).toBe(0);
    expect(git(worker, ['show', 'origin/master:demo/dormant.generated.ts'])).toBe('REGENERATED');
  });

  it('keeps the incoming side of a file the manifest lists as incoming, here data/image-box-verdicts.json', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'data/image-box-verdicts.json',
      content: '{"v":"BASE"}\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'data/image-box-verdicts.json', '{"v":"INCOMING"}\n');
    writeFileSync(join(worker, 'data/image-box-verdicts.json'), '{"v":"OURS"}\n');

    const { status, output } = runScript(worker, ['Bottle photo measuring: sim', 'data/image-box-verdicts.json']);

    expect(status, output).toBe(0);
    expect(git(worker, ['show', 'origin/master:data/image-box-verdicts.json'])).toBe('{"v":"INCOMING"}');
  });

  it('after a refusal, leaves a non-manual change uncommitted in the working tree for a later step, with HEAD back on the branch', () => {
    const { root, worker, concurrent } = setupTrio({
      relPath: 'notes/unlisted.txt',
      content: 'BASE\n',
      extra: { 'data/catalogue/boots.json': '{"v":"BASE"}\n' },
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'notes/unlisted.txt', 'INCOMING\n');
    writeFileSync(join(worker, 'notes/unlisted.txt'), 'OURS\n');
    writeFileSync(join(worker, 'data/catalogue/boots.json'), '{"v":"OUR-HARVEST"}\n');
    const base = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker, ['Harvest: sim', 'data/catalogue', 'notes/unlisted.txt']);

    expect(status).toBe(1);
    expect(output).toContain('not in scripts/generated-files.txt');
    expect(output).toContain('The unpushed commit was undone');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(base);
    expect(git(worker, ['diff', '--cached', '--name-only'])).toBe('');
    expect(readFileSync(join(worker, 'data/catalogue/boots.json'), 'utf8')).toBe('{"v":"OUR-HARVEST"}\n');
  });

  it('refuses a file over the size limit before committing anything, rather than losing eight push attempts to GitHub', () => {
    const { root, worker } = setupTrio({ relPath: 'data/catalogue/boots.json', content: '{}\n' });
    cleanupDirs.push(root);

    writeFileSync(join(worker, 'data/catalogue/boots.json'), JSON.stringify({ listings: 'x'.repeat(200) }));
    const base = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker, ['Harvest: sim', 'data/catalogue'], { MAX_FILE_BYTES: '100' });

    expect(status).toBe(1);
    expect(output).toContain('Refusing to commit: data/catalogue/boots.json');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(base);
    expect(git(worker, ['rev-parse', 'origin/master'])).toBe(base);
    expect(git(worker, ['diff', '--cached', '--name-only'])).toBe('');
  });

  it('warns, and still pushes, for a file over the warning size', () => {
    const { root, worker } = setupTrio({ relPath: 'data/catalogue/boots.json', content: '{}\n' });
    cleanupDirs.push(root);

    writeFileSync(join(worker, 'data/catalogue/boots.json'), JSON.stringify({ listings: 'x'.repeat(200) }));
    const { status, output } = runScript(worker, ['Harvest: sim', 'data/catalogue'], { WARN_FILE_BYTES: '100' });

    expect(status, output).toBe(0);
    expect(output).toContain('::warning::data/catalogue/boots.json is 0 MiB');
    expect(output).toContain('Pushed on attempt 1');
  });

  // The real manifest, not the page-committing copy the tests above use.
  it('refuses to commit the built page, which is built at deploy time, before staging anything', () => {
    const { root, worker } = setupTrio({
      relPath: 'demo/deals.generated.ts',
      content: 'BASE\n',
      extra: { 'demo/index.html': 'PAGE:A\n' },
    });
    cleanupDirs.push(root);

    writeFileSync(join(worker, 'demo/deals.generated.ts'), 'OURS\n');
    writeFileSync(join(worker, 'demo/index.html'), 'PAGE:B\n');
    const base = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker, ['Rebuild demo: sim', 'demo/deals.generated.ts', 'demo/index.html'], {
      GENERATED_FILES_MANIFEST: MANIFEST,
    });

    expect(status).toBe(1);
    expect(output).toContain('Refusing to commit demo/index.html: it is built at deploy time');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(base);
    expect(git(worker, ['rev-parse', 'origin/master'])).toBe(base);
    expect(git(worker, ['diff', '--cached', '--name-only'])).toBe('');
  });

  // Since 2026-10-10 the catalogue modules are replayed wherever they are read
  // (scripts/catalogueBuild.ts) and never committed: "deploy" in the manifest.
  it('refuses to commit the catalogue modules, which are built where they are read', () => {
    const { root, worker } = setupTrio({ relPath: 'demo/deals.generated.ts', content: 'BASE\n' });
    cleanupDirs.push(root);
    const base = git(worker, ['rev-parse', 'HEAD']);
    for (const module of ['demo/catalogue.generated.ts', 'demo/dormant.generated.ts']) {
      writeFileSync(join(worker, module), 'BUILT\n');
      const { status, output } = runScript(worker, ['Rebuild demo: sim', 'demo/deals.generated.ts', module], {
        GENERATED_FILES_MANIFEST: MANIFEST,
      });
      expect(status, module).toBe(1);
      expect(output).toContain(`Refusing to commit ${module}: it is built at deploy time`);
      expect(git(worker, ['rev-parse', 'origin/master'])).toBe(base);
    }
  });
});

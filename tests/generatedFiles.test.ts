// scripts/generated-files.txt is the one list of files the pipeline writes and
// commits. Run #592 (2026-10-04) died because demo/sitemap.xml was written by
// the build and named by three workflow commit steps, but missing from the
// conflict handler's own hand-typed copy of the list. These tests hold every
// reader of the manifest to it:
//
//   - the bash reader (scripts/generated-files.sh, used by
//     scripts/commit-and-push.sh) and the TypeScript reader
//     (scripts/generatedFiles.ts, used by the build scripts) agree;
//   - every path any workflow passes to scripts/commit-and-push.sh is covered;
//   - the build scripts write committed outputs only through writeGenerated,
//     which refuses an unlisted path;
//   - scripts/check-generated-writes.ts, which catalogue-daily.yml runs after
//     the real rebuild, flags a write outside the manifest.
//
// tests/generatedFilesBuild.test.ts runs the real `npm run rebuild` in a
// scratch copy and compares what it wrote with the manifest.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWritesSince, unlistedWrites } from '../scripts/check-generated-writes.js';
import { matchesPattern, parseManifest, policyOf, readManifest, writeGenerated, REPO_ROOT } from '../scripts/generatedFiles.js';

const HELPER = fileURLToPath(new URL('../scripts/generated-files.sh', import.meta.url));
const WORKFLOWS = join(REPO_ROOT, '.github/workflows');

function bash(args: string[]): string {
  return execFileSync('bash', [HELPER, ...args], { encoding: 'utf8' }).trim();
}

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe('scripts/generated-files.txt', () => {
  const entries = readManifest();

  it('parses, and names each pattern once', () => {
    expect(entries.length).toBeGreaterThan(20);
    const patterns = entries.map((e) => e.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    for (const e of entries) expect(e.writtenBy, e.pattern).not.toBe('');
  });

  it('rejects a malformed line with its line number', () => {
    expect(() => parseManifest('# c\nrebuild demo/x.ts writer\nrebuilt demo/y.ts writer\n')).toThrow(/line 3/);
  });

  it('lists every file the page build writes, including the ones run #592 and 2026-10-04 added', () => {
    for (const path of [
      'demo/catalogue.generated.ts', 'demo/dormant.generated.ts', 'demo/deals.generated.ts',
      'demo/priceHistory.generated.ts', 'data/price-history-checkpoint.json',
    ]) {
      expect(policyOf(path), path).toBe('rebuild');
    }
    // The published site: built by deploy-pages.yml, never committed.
    for (const path of [
      'demo/index.html', 'demo/404.html', 'demo/sitemap.xml', 'demo/ads.txt',
      'demo/data', 'demo/data/catalogue.0123456789abcdef.json',
      // A page of its own for each fixed address (scripts/build-route-pages.ts).
      'demo/about.html', 'demo/fragrances.html', 'demo/about/legal.html', 'demo/about/bot.html', 'demo/notes/group/citrus.html',
    ]) {
      expect(policyOf(path), path).toBe('deploy');
    }
    // The page's own source sits beside them and is not a build output.
    expect(policyOf('demo/template.html')).toBe('source');
    expect(policyOf('demo/testCount.generated.ts')).toBe('incoming');
    expect(policyOf('data/catalogue/boots.json')).toBe('incoming');
    expect(policyOf('src/config/retailers.ts')).toBe('manual');
    expect(policyOf('demo/app.ts')).toBeNull();
    expect(policyOf('demo/database.ts')).toBeNull();
  });

  it('every rebuild path is tracked on the branch, so a typo cannot hide a file from the page commit', () => {
    const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n'));
    for (const e of entries.filter((x) => x.policy === 'rebuild')) {
      expect(tracked.has(e.pattern), e.pattern).toBe(true);
    }
  });

  // 2026-10-04: the page, its data files, the sitemap and ads.txt are built by
  // .github/workflows/deploy-pages.yml before each deployment. Committing one
  // again would bring back the growth that move removed, and a page committed
  // beside a newer build is the stale-page failure all over again.
  it('every deploy path is gitignored and untracked, so a local build can never be committed by accident', () => {
    const deploy = entries.filter((x) => x.policy === 'deploy');
    expect(deploy.map((e) => e.pattern)).toEqual([
      'demo/index.html', 'demo/404.html', 'demo/data/', 'demo/ads.txt', 'demo/sitemap.xml', 'demo/sitemap-*.xml',
      'demo/us/', 'demo/in/',
      'demo/*.html', 'demo/about/', 'demo/legal/', 'demo/account/', 'demo/notes/', 'demo/guides/', 'demo/note-icons/h/',
    ]);
    for (const e of deploy) {
      const probe = e.pattern.endsWith('/')
        ? `${e.pattern}catalogue.0123456789abcdef.json`
        : e.pattern.replace('*', 'sample');
      // `git check-ignore` exits 0 when the path is ignored, 1 when it is not.
      expect(() => execFileSync('git', ['check-ignore', '-q', '--no-index', probe], { cwd: REPO_ROOT }), `${probe} is not gitignored`).not.toThrow();
      // A wildcard also names committed source that a "source" line above it claims (demo/template.html).
      const tracked = execFileSync('git', ['ls-files', '--', e.pattern.replace(/\/$/, '')], { cwd: REPO_ROOT, encoding: 'utf8' })
        .split('\n').filter((f) => f !== '' && policyOf(f) !== 'source');
      expect(tracked, `${e.pattern} is tracked; \`git rm -r --cached\` it`).toEqual([]);
    }
  });

  // 2026-10-08 (docs/DECISIONS.md D28): a social post's pictures and videos are
  // drawn from its committed text by `npm run social:render` and the Social
  // pictures workflow, and never committed. They were 26.5 MB of the tip tree.
  it('every social path is gitignored and untracked, so a post\'s pictures are never committed', () => {
    const social = entries.filter((x) => x.policy === 'social');
    expect(social.map((e) => e.pattern)).toEqual([
      'social/*.png', 'social/*.jpg', 'social/*.jpeg', 'social/*.webp', 'social/*.gif', 'social/*.mp4', 'social/*.mov', 'social/*.webm',
    ]);
    for (const e of social) {
      expect(e.writtenBy, e.pattern).toMatch(/npm run social:render|as above/);
      for (const probe of ['posts/2026-10-08-deal-of-the-day/post-3x4', 'highlights/deals-cover'].map((p) => e.pattern.replace('*', p))) {
        expect(policyOf(probe), probe).toBe('social');
        expect(() => execFileSync('git', ['check-ignore', '-q', '--no-index', probe], { cwd: REPO_ROOT }), `${probe} is not gitignored`).not.toThrow();
      }
      // A git pathspec's * crosses folders, as the manifest's does.
      const tracked = execFileSync('git', ['ls-files', '--', e.pattern], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
      expect(tracked, `${e.pattern} is tracked; \`git rm --cached\` it`).toEqual([]);
    }
    // The posts' text is committed: it is what the pictures are drawn from.
    for (const text of ['social/posts/x/post-3x4.html', 'social/posts/x/post-9x16.svg', 'social/posts/x/caption.txt', 'social/posts/x/pictures.json', 'social/posts/x/check.json']) {
      expect(policyOf(text), text).toBeNull();
      expect(() => execFileSync('git', ['check-ignore', '-q', '--no-index', text], { cwd: REPO_ROOT }), `${text} is gitignored`).toThrow();
    }
  });

  it('every deploy path is what the deploy workflow builds before it uploads', () => {
    const deployWorkflow = readFileSync(join(WORKFLOWS, 'deploy-pages.yml'), 'utf8');
    expect(deployWorkflow).toContain('run: npm run demo');
    for (const e of entries.filter((x) => x.policy === 'deploy')) {
      expect(e.writtenBy, e.pattern).toMatch(/^npm run demo \(scripts\/(build-demo|build-sitemap|build-route-pages|bundle-demo)\.ts[),]/);
    }
  });

  it('the bash reader and the TypeScript reader give the same answer for every path', () => {
    const samples = [
      ...entries.map((e) => e.pattern.replace(/\*/g, 'sample').replace(/\/$/, '/inner/file.json')),
      'demo/data', 'demo/database.ts', 'demo/app.ts', 'data/catalogue', 'data/catalogue/x/y.json',
      'src/config/retailers.ts', 'docs/DELIVERY-RECHECK.md', 'docs/README.md', 'README.md',
    ];
    const fromBash = bash(['classify', ...samples]).split('\n');
    expect(fromBash).toEqual(samples.map((p) => policyOf(p) ?? 'none'));
  });

  it('prints the rebuild paths for the workflows, a folder without its trailing slash', () => {
    const paths = bash(['paths', 'rebuild']).split(' ');
    expect(paths).toEqual(entries.filter((e) => e.policy === 'rebuild').map((e) => e.pattern.replace(/\/$/, '')));
    expect(paths).toContain('demo/catalogue.generated.ts');
    // The crawl's page commit takes exactly this list: the built site is not on it.
    for (const p of ['demo/data', 'demo/index.html', 'demo/404.html', 'demo/sitemap.xml']) expect(paths).not.toContain(p);
    expect(bash(['paths', 'deploy']).split(' ')).toEqual([
      'demo/index.html', 'demo/404.html', 'demo/data', 'demo/ads.txt', 'demo/sitemap.xml', 'demo/sitemap-*.xml',
      'demo/us', 'demo/in',
      'demo/*.html', 'demo/about', 'demo/legal', 'demo/account', 'demo/notes', 'demo/guides', 'demo/note-icons/h',
    ]);
  });

  it('matches * across folders and a trailing / as a folder, as a bash case pattern does', () => {
    expect(matchesPattern('data/catalogue/a/b.json', 'data/catalogue/*.json')).toBe(true);
    expect(matchesPattern('data/catalogue/a.jsonx', 'data/catalogue/*.json')).toBe(false);
    expect(matchesPattern('demo/data', 'demo/data/')).toBe(true);
    expect(matchesPattern('demo/dataX/a', 'demo/data/')).toBe(false);
    expect(matchesPattern('demo/indexxhtml', 'demo/index.html')).toBe(false);
  });
});

/** Every scripts/commit-and-push.sh call in the workflows: [file, args after the message, run block]. */
function commitCalls(): { file: string; paths: string[]; block: string }[] {
  const calls: { file: string; paths: string[]; block: string }[] = [];
  for (const file of readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))) {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    const blocks = text.split(/\n\s*- (?:name|uses|run):/);
    for (const block of blocks) {
      for (const m of block.matchAll(/\.\/scripts\/commit-and-push\.sh((?:[^\n]*\\\n)*[^\n]*)/g)) {
        const args = m[1]!.replace(/\\\n/g, ' ').trim();
        expect(args.startsWith('"'), `${file}: the commit message is the first, double-quoted argument`).toBe(true);
        const end = args.indexOf('"', 1);
        const paths = args.slice(end + 1).trim().split(/\s+/).filter(Boolean);
        calls.push({ file, paths, block });
      }
    }
  }
  return calls;
}

describe('the workflows commit only what the manifest covers', () => {
  const rebuild = readManifest().filter((e) => e.policy === 'rebuild').map((e) => e.pattern.replace(/\/$/, ''));
  const calls = commitCalls();

  it('finds the commit steps', () => {
    expect(calls.length).toBeGreaterThanOrEqual(12);
  });

  it('every path passed to scripts/commit-and-push.sh is a manifest path or a folder of them', () => {
    for (const { file, paths, block } of calls) {
      for (const token of paths) {
        if (token === '$REBUILT') {
          expect(block, `${file}: $REBUILT must come from the manifest`).toMatch(/REBUILT=\$\(\.?\/?scripts\/generated-files\.sh paths rebuild\)/);
          continue;
        }
        expect(token.startsWith('$'), `${file}: ${token} is not a path the test can check`).toBe(false);
        const covered = policyOf(token) !== null ||
          readManifest().some((e) => e.pattern.startsWith(`${token}/`));
        expect(covered, `${file} commits ${token}, which scripts/generated-files.txt does not cover`).toBe(true);
        const deploy = policyOf(token) === 'deploy' ||
          readManifest().some((e) => e.policy === 'deploy' && e.pattern.startsWith(`${token}/`));
        expect(deploy, `${file} commits ${token}, which is built at deploy time and never committed`).toBe(false);
        expect(policyOf(token), `${file} commits ${token}, a social picture, which is rendered and never committed`).not.toBe('social');
      }
    }
  });

  it('the steps that commit a rebuilt page take the whole rebuild set from the manifest, not a hand list', () => {
    const daily = readFileSync(join(WORKFLOWS, 'catalogue-daily.yml'), 'utf8');
    for (const step of ['Commit rebuilt app', 'Commit synced Awin feeds', 'Commit what changed']) {
      const start = daily.indexOf(`- name: ${step}`);
      expect(start, step).toBeGreaterThan(0);
      const body = daily.slice(start, daily.indexOf('\n      - ', start + 10));
      expect(body, step).toContain('REBUILT=$(scripts/generated-files.sh paths rebuild)');
      expect(body, step).toContain('$REBUILT');
    }
    void rebuild;
  });
});

describe('the build scripts write committed files only through writeGenerated', () => {
  const BUILD_SCRIPTS = ['build-demo-catalogue.ts', 'build-deals.ts', 'build-price-history.ts', 'build-demo.ts', 'build-sitemap.ts'];

  it('no rebuild script writes under demo/ or data/ with a bare writeFileSync', () => {
    for (const name of BUILD_SCRIPTS) {
      const source = readFileSync(join(REPO_ROOT, 'scripts', name), 'utf8');
      for (const m of source.matchAll(/writeFileSync\(\s*([^,]+),/g)) {
        expect(m[1], `${name}: ${m[0]}`).not.toMatch(/['"`](demo|data)\//);
      }
      expect(source, name).toContain("from './generatedFiles.js'");
    }
  });

  it('writeGenerated refuses a path the manifest does not list, and writes one it does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'write-generated-'));
    cleanup.push(dir);
    mkdirSync(join(dir, 'demo'), { recursive: true });
    expect(() => writeGenerated(dir, 'demo/newThing.generated.ts', 'x')).toThrow(/not in scripts\/generated-files\.txt/);
    expect(existsSync(join(dir, 'demo/newThing.generated.ts'))).toBe(false);
    writeGenerated(dir, 'demo/sitemap.xml', '<urlset/>');
    expect(readFileSync(join(dir, 'demo/sitemap.xml'), 'utf8')).toBe('<urlset/>');
  });
});

describe('scripts/check-generated-writes.ts', () => {
  function scratchRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'generated-writes-'));
    cleanup.push(dir);
    const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git(['init', '-q', '-b', 'master']);
    git(['config', 'user.email', 't@test']);
    git(['config', 'user.name', 't']);
    mkdirSync(join(dir, 'demo'), { recursive: true });
    const base = {
      'demo/catalogue.generated.ts': 'old', 'demo/dormant.generated.ts': 'old', 'demo/app.ts': 'src',
      // As in this repository: the built site is ignored ("deploy" in the manifest).
      '.gitignore': readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8'),
    };
    for (const [p, body] of Object.entries(base)) writeFileSync(join(dir, p), body);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    // Checked-out files are older than the mark, as on a runner.
    const past = new Date(Date.now() - 60_000);
    for (const p of Object.keys(base)) utimesSync(join(dir, p), past, past);
    return dir;
  }

  it('passes a build that wrote only rebuild paths, deletions and ignored output (the built site) included', () => {
    const dir = scratchRepo();
    const mark = Date.now();
    writeFileSync(join(dir, 'demo/catalogue.generated.ts'), 'old'); // same bytes still counts as written
    rmSync(join(dir, 'demo/dormant.generated.ts'));
    writeFileSync(join(dir, 'demo/deals.generated.ts'), 'new');
    writeFileSync(join(dir, 'demo/index.html'), 'page');
    mkdirSync(join(dir, 'demo/data'));
    writeFileSync(join(dir, 'demo/data/catalogue.bbbb.json'), '[1]');
    mkdirSync(join(dir, 'dist-demo'));
    writeFileSync(join(dir, 'dist-demo/artifact.html'), 'x');
    const writes = buildWritesSince(dir, mark);
    expect(writes.written).toEqual(['demo/catalogue.generated.ts']);
    expect(writes.deleted).toEqual(['demo/dormant.generated.ts']);
    expect(writes.created).toEqual(['demo/deals.generated.ts']);
    expect(unlistedWrites(writes)).toEqual([]);
  });

  it('flags a new generated file the manifest does not list, and a source file a build rewrote', () => {
    const dir = scratchRepo();
    const mark = Date.now();
    writeFileSync(join(dir, 'demo/newThing.generated.ts'), 'export const X = 1;');
    writeFileSync(join(dir, 'demo/app.ts'), 'rewritten');
    expect(unlistedWrites(buildWritesSince(dir, mark))).toEqual(['demo/app.ts', 'demo/newThing.generated.ts']);
  });

  it('exits 1 from the command line on an unlisted write, naming the file', () => {
    const dir = scratchRepo();
    const mark = Date.now();
    writeFileSync(join(dir, 'demo/newThing.generated.ts'), 'x');
    let out = '';
    let status = 0;
    try {
      execFileSync('npx', ['tsx', join(REPO_ROOT, 'scripts/check-generated-writes.ts'), '--since-ms', String(mark)], {
        cwd: dir, encoding: 'utf8', stdio: 'pipe',
      });
    } catch (err) {
      const e = err as { status: number; stdout: string };
      status = e.status;
      out = e.stdout;
    }
    expect(status).toBe(1);
    expect(out).toContain('::error::The build wrote demo/newThing.generated.ts');
  });
});

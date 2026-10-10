/**
 * Builds the catalogue modules (demo/catalogue.generated.ts,
 * demo/dormant.generated.ts) unless the ones on disk are already the replay of
 * this checkout's build record and source.
 *
 *   npx tsx scripts/ensure-catalogue-built.ts            # build when missing or stale
 *   npx tsx scripts/ensure-catalogue-built.ts --force    # build again regardless
 *
 * Since 2026-10-10 the modules are not committed ("deploy" in
 * scripts/generated-files.txt; scripts/catalogueBuild.ts says why and how).
 * `npm run demo`, `npm test` (through scripts/ensure-demo-built.ts), the
 * deploy, the region crawls and every npm script that reads prices run this
 * first. It costs a second or two when the modules are current (it hashes the
 * data inputs and the source) and about 45 seconds when it builds.
 *
 * The build is always a replay (`build-demo-catalogue.ts --replay`): the
 * record's clock, read only memories, the same bytes the crawl's fresh build
 * wrote. When a data input on disk is not the blob the record names (the crawl
 * commits harvested prices before it rebuilds, and a run can stop between the
 * two; a rebase can put the record on top of another workflow's newer file),
 * the recorded inputs are gathered into a scratch folder, each from the
 * working tree when it matches and otherwise from git by its blob id, and the
 * replay reads those. A blobless clone (the deploy's) fetches a missing blob
 * by itself; a shallow clone (the other workflows', depth 1) is deepened 100
 * commits at a time until every recorded blob is in it (gatherInputs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  catalogueStaleReason,
  currentInputs,
  gitBlobId,
  inputsDiffer,
  readRecord,
  CATALOGUE_RECORD,
  INPUT_ROOT_ENV,
} from './catalogueBuild.js';

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function runReplay(root: string, dataRoot: string | null): void {
  const env = { ...process.env };
  if (dataRoot) env[INPUT_ROOT_ENV] = dataRoot;
  else delete env[INPUT_ROOT_ENV];
  const tsx = join(root, 'node_modules/.bin/tsx');
  const [cmd, args] = existsSync(tsx)
    ? [tsx, ['scripts/build-demo-catalogue.ts', '--replay']]
    : ['npx', ['tsx', 'scripts/build-demo-catalogue.ts', '--replay']];
  const result = spawnSync(cmd, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // The build's own report is long (the crawl's fresh build prints it); the
  // replay's says only what it was built from.
  const lines = (result.stdout ?? '').trim().split('\n');
  for (const line of lines.filter((l) => l.startsWith('catalogue replayed'))) console.log(`  ${line}`);
  if (result.status !== 0) {
    console.log(result.stdout);
    throw new Error(`the catalogue replay failed (exit ${result.status})`);
  }
}

function isShallow(root: string): boolean {
  return git(root, ['rev-parse', '--is-shallow-repository']) === 'true';
}

function blobPresent(root: string, id: string): boolean {
  // Without lazy fetching: in a blobless clone the read below fetches it.
  const r = spawnSync('git', ['cat-file', '-e', id], {
    cwd: root,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    stdio: 'ignore',
  });
  return r.status === 0;
}

/**
 * Writes the recorded data inputs, and the record, into a new scratch folder:
 * each file from the working tree when its blob id matches, otherwise from
 * git. Returns the folder; the caller removes it.
 */
export function gatherInputs(root: string, files: Record<string, string>): string {
  const scratch = mkdtempSync(join(tmpdir(), 'catalogue-inputs-'));
  const fromGit: [string, string][] = [];
  for (const [file, id] of Object.entries(files)) {
    const target = join(scratch, file);
    mkdirSync(dirname(target), { recursive: true });
    const local = join(root, file);
    if (existsSync(local) && gitBlobId(readFileSync(local)) === id) copyFileSync(local, target);
    else fromGit.push([file, id]);
  }
  if (fromGit.length > 0) {
    if (isShallow(root)) {
      for (let attempt = 1; attempt <= 6 && fromGit.some(([, id]) => !blobPresent(root, id)); attempt++) {
        console.log('ensure-catalogue-built: a shallow clone; fetching 100 more commits of history for the recorded inputs.');
        execFileSync('git', ['fetch', '--quiet', '--deepen=100', 'origin', git(root, ['rev-parse', 'HEAD'])], {
          cwd: root,
          stdio: ['ignore', 'ignore', 'inherit'],
        });
      }
    }
    console.log(`ensure-catalogue-built: ${fromGit.length} recorded input(s) taken from git: ${fromGit.slice(0, 5).map(([f]) => f).join(', ')}${fromGit.length > 5 ? ', ...' : ''}`);
    for (const [file, id] of fromGit) {
      const bytes = execFileSync('git', ['cat-file', 'blob', id], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
      writeFileSync(join(scratch, file), bytes);
    }
  }
  copyFileSync(join(root, CATALOGUE_RECORD), join(scratch, CATALOGUE_RECORD));
  return scratch;
}

/** Builds the modules when they are missing or stale (or always, with force). Returns what it did. */
export function ensureCatalogueBuilt(root: string, force = false): 'current' | 'built' | 'built-from-git' {
  const reason = force ? 'a build was asked for' : catalogueStaleReason(root);
  if (reason === null) {
    console.log('ensure-catalogue-built: the catalogue modules are current; not rebuilding.');
    return 'current';
  }
  const record = readRecord(root);
  if (record === null) {
    throw new Error(`${CATALOGUE_RECORD} is missing: run \`npm run catalogue:demo\` for a fresh build (it writes the record)`);
  }
  const started = Date.now();
  const differ = inputsDiffer(currentInputs(root), record.files);
  if (differ.length === 0) {
    console.log(`ensure-catalogue-built: ${reason}. Replaying the catalogue build from ${CATALOGUE_RECORD} (about 45 seconds).`);
    runReplay(root, null);
    console.log(`ensure-catalogue-built: built in ${Math.round((Date.now() - started) / 1000)} s.`);
    return 'built';
  }
  console.log(
    `ensure-catalogue-built: ${reason}. ${differ.length} data input(s) on disk are not the ones ${CATALOGUE_RECORD} ` +
      'names (newer prices not built yet, or a rebase); replaying from the recorded ones.',
  );
  const scratch = gatherInputs(root, record.files);
  try {
    runReplay(root, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`ensure-catalogue-built: built in ${Math.round((Date.now() - started) / 1000)} s.`);
  return 'built-from-git';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    ensureCatalogueBuilt(process.cwd(), process.argv.includes('--force'));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

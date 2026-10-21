/**
 * Packs what one parallel job of the crawl changed, for the merge job
 * (scripts/harvest-merge.ts), which is the only job that commits.
 *
 *   npx tsx scripts/harvest-pack.ts sweep <group> <out-dir>
 *   npx tsx scripts/harvest-pack.ts houses <out-dir>
 *
 * <out-dir> gets files/ (the changed files, under their repository paths) and
 * info.json (what the merge needs to place them safely: the commit this job
 * started from, and the shops it owns). The workflow uploads <out-dir> as an
 * artifact. Nothing is committed or pushed here.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shopsOfGroup } from '../src/catalogue/harvestGroups.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What each kind of job may hand over: a shop's snapshot, the cursor, the report and the metered marker; or the houses' files. */
const PACK_PATHS = {
  sweep: ['data/catalogue', 'data/harvest-cursor.json', 'data/harvest-report.json', 'data/metered-harvest-marker.txt'],
  houses: ['data/houses', 'data/house-sourcing-report.json'],
} as const;

function changed(repo: string, paths: readonly string[]): string[] {
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...paths], { cwd: repo, encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    // " M path", "?? path", "A  path"; a deleted file is not handed over.
    .filter((l) => !/^.?D/.test(l))
    .map((l) => l.slice(3).replace(/^"|"$/g, ''));
}

/** Copies the changed files of one job into outDir/files and writes outDir/info.json. */
export function pack(kind: 'sweep' | 'houses', group: number | null, outDir: string, repo: string = root): { files: string[]; base: string } {
  const files = changed(repo, PACK_PATHS[kind]);
  for (const f of files) {
    const to = resolve(outDir, 'files', f);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(resolve(repo, f), to);
  }
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const info = { kind, group, base, files, owned: group === null ? [] : shopsOfGroup(group) };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'info.json'), `${JSON.stringify(info, null, 2)}\n`);
  return { files, base };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [kind, ...rest] = process.argv.slice(2);
  if (kind === 'sweep' && Number.isInteger(Number(rest[0])) && rest[1]) {
    const r = pack('sweep', Number(rest[0]), resolve(root, rest[1]));
    console.log(`packed ${r.files.length} changed file(s) of sweep group ${rest[0]} from ${r.base.slice(0, 8)}`);
  } else if (kind === 'houses' && rest[0]) {
    const r = pack('houses', null, resolve(root, rest[0]));
    console.log(`packed ${r.files.length} changed file(s) of the houses from ${r.base.slice(0, 8)}`);
  } else {
    console.error('usage: harvest-pack.ts sweep <group> <out-dir> | houses <out-dir>');
    process.exit(2);
  }
}

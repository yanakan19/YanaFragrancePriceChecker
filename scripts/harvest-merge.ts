/**
 * Puts what the parallel jobs of the crawl found into this checkout, ready for
 * the one commit (the `crawl` job in .github/workflows/catalogue-daily.yml).
 *
 *   npx tsx scripts/harvest-merge.ts <dir holding one folder per packed job>
 *
 * Each folder is a scripts/harvest-pack.ts output. This job's checkout is the
 * branch tip as it is now, which may be newer than the commit a job started
 * from (the image check, a photo measuring run or a hand dispatch can commit in
 * between: the sweep jobs do not hold the `catalogue` concurrency group, this
 * job does). So a shop's snapshot is taken from a group only when nothing has
 * changed that file since the group started; one that has is left as it is, with
 * a warning, and the shop is asked again first next run. The cursor is merged
 * entry by entry (each group owns its shops'), the report is the groups' reports
 * together with the freshness table of the whole catalogue, and a group that
 * did not report leaves its shops unreached, not failed.
 *
 * `--shop=<id>` (a one shop dispatch) takes only the group that owns that shop.
 * Exits 1 when no sweep group handed anything over.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { parseCursor } from '../src/catalogue/harvestCursor.js';
import { freshnessTable } from '../src/catalogue/harvestFreshness.js';
import { HARVEST_GROUPS, METERED_GROUP, mergeCursors, mergeReports, shopsOfGroup } from '../src/catalogue/harvestGroups.js';
import type { HarvestReport } from '../src/catalogue/harvestReport.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Info { kind: 'sweep' | 'houses'; group: number | null; base: string; files: string[]; owned: string[] }

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

/** True when no commit between `base` and this checkout's HEAD touched `path`. A base that cannot be found counts as changed. */
function unchangedSince(repo: string, base: string, path: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['diff', '--quiet', base, 'HEAD', '--', path], { cwd: repo });
    return true;
  } catch {
    return false;
  }
}

function place(repo: string, from: string, rel: string): void {
  const to = resolve(repo, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

export function run(dir: string, onlyShop: string | null = null, repo: string = root): number {
  const folders = existsSync(dir) ? readdirSync(dir).map((n) => join(dir, n)).sort() : [];
  const sweeps: { info: Info; dir: string }[] = [];
  const houses: { info: Info; dir: string }[] = [];
  for (const d of folders) {
    const info = readJson<Info>(join(d, 'info.json'));
    if (!info) {
      console.log(`::warning::${d} has no info.json; skipped`);
      continue;
    }
    // A one shop dispatch: only the group that owns the shop has anything to hand over.
    if (info.kind === 'sweep' && onlyShop && !info.owned.includes(onlyShop)) continue;
    (info.kind === 'sweep' ? sweeps : houses).push({ info, dir: d });
  }

  const skipped: string[] = [];
  const parts: { group: number; planned: readonly string[]; report: HarvestReport | null }[] = [];
  const cursorParts: { ids: Set<string>; cursor: ReturnType<typeof parseCursor> }[] = [];
  const cursorPath = resolve(repo, 'data/harvest-cursor.json');
  const baseCursor = parseCursor(existsSync(cursorPath) ? readFileSync(cursorPath, 'utf8') : null);
  const seen = new Set<number>();

  for (const { info, dir: d } of sweeps) {
    const group = info.group as number;
    seen.add(group);
    const owned = new Set(info.owned);
    let taken = 0;
    for (const rel of info.files) {
      const m = /^data\/catalogue\/([A-Za-z0-9_-]+)\.json$/.exec(rel);
      if (m) {
        if (!owned.has(m[1]!)) {
          console.log(`::warning::group ${group} handed over ${rel}, which is not one of its shops; ignored`);
        } else if (unchangedSince(repo, info.base, rel)) {
          place(repo, join(d, 'files', rel), rel);
          taken++;
        } else {
          skipped.push(m[1]!);
          console.log(`::warning::${m[1]} changed on the branch since group ${group} started (${info.base.slice(0, 8)}); its new snapshot is not applied, the shop is asked again first next run`);
        }
      } else if (rel === 'data/metered-harvest-marker.txt' && group === METERED_GROUP) {
        place(repo, join(d, 'files', rel), rel);
      }
    }
    const reportFile = join(d, 'files', 'data/harvest-report.json');
    const cursorFile = join(d, 'files', 'data/harvest-cursor.json');
    parts.push({ group, planned: [...owned], report: readJson<HarvestReport>(reportFile) });
    if (existsSync(cursorFile)) cursorParts.push({ ids: owned, cursor: parseCursor(readFileSync(cursorFile, 'utf8')) });
    console.log(`group ${group}: ${taken} snapshot(s) applied from ${info.base.slice(0, 8)}`);
  }
  for (let g = 0; g < HARVEST_GROUPS; g++) {
    if (!seen.has(g) && (!onlyShop || shopsOfGroup(g).includes(onlyShop))) {
      console.log(`::warning::group ${g} handed nothing over (its job failed or was cancelled); its shops keep their previous prices and are asked first next run`);
      parts.push({ group: g, planned: shopsOfGroup(g).filter((id) => RETAILERS.find((r) => r.id === id)?.enabled), report: null });
    }
  }
  if (sweeps.length === 0) {
    console.error('No sweep group handed anything over.');
    return 1;
  }

  for (const { info, dir: d } of houses) {
    for (const rel of info.files) {
      if (/^data\/houses\//.test(rel) || rel === 'data/house-sourcing-report.json') place(repo, join(d, 'files', rel), rel);
    }
    console.log(`houses: ${info.files.length} file(s) applied`);
  }

  writeFileSync(cursorPath, `${JSON.stringify(mergeCursors(baseCursor, cursorParts), null, 2)}\n`);

  const merged = mergeReports(parts);
  const store = new CatalogueStore(resolve(repo, 'data/catalogue'));
  merged.freshness = freshnessTable(merged.shops, RETAILERS.filter((r) => r.enabled && (!onlyShop || r.id === onlyShop)), (id) => store.read(id));
  writeFileSync(resolve(repo, 'data/harvest-report.json'), `${JSON.stringify(merged, null, 2)}\n`);

  for (const g of merged.groups ?? []) {
    console.log(
      `group ${g.group}: ${g.shops} shops in ${g.minutes ?? '?'} min, ended ${g.endedReason ?? 'unfinished'}` +
        (g.stoppedOnBudget.length ? `, stopped on their time budget: ${g.stoppedOnBudget.join(', ')}` : ''),
    );
  }
  console.log(`${merged.shops.length} shops reported, ${merged.notReached.length} not reached${merged.notReached.length ? `: ${merged.notReached.join(', ')}` : ''}`);
  if (skipped.length) console.log(`not applied because the branch moved: ${skipped.join(', ')}`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const shopArg = process.argv.find((a) => a.startsWith('--shop='));
  process.exit(run(resolve(root, process.argv[2] ?? 'shards'), shopArg ? shopArg.slice('--shop='.length) : null));
}
